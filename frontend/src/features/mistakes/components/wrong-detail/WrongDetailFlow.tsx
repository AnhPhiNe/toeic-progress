import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ErrorCategory, MistakeEntry, StudySession } from '@/shared/types';
import { partOfQuestion, type PartNumber } from '@/shared/domain/questionNumbers';
import { generateUUID } from '@/shared/domain/uuid';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { apiAvailable } from '@/shared/api/api';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration, PageRejectionReason } from '@/features/mistakes/services/aiMistakeExtractor';
import { enqueueExplanations, explanationsVersion, isExplaining, setExplanationInterceptor, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';
import { buildDetailEntry, canExplainRead, detailExplanationInput, editDetailForm, EMPTY_FORM, explainInput, isEmptyForm, isRightForm, savedDetailForm, withArrivedExplanation, withReadResult, type CardForm } from '@/features/mistakes/lib/detailForm';
import { sameExplanationInput } from '@/features/mistakes/lib/explanationMerge';
import { buildDetailDraft, detailDraftScope, restoreDetailDraft, validateDetailDraft } from '@/features/mistakes/lib/detailDraft';
import { canReview } from '@/features/mistakes/lib/spacedRepetition';
import { prepareGroup, prepareSingles } from '@/features/mistakes/lib/capturePrepare';
import { NEW_BATCH_NOTE, SPLIT_NOTE, captureRequestLimit, explainCapNote, ticketedNumbers } from '@/features/mistakes/lib/captureBatch';
import { checkPhotoClarity, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { fileExifOrientation } from '@/features/mistakes/lib/imageInput';
import { flowCards, groupNumbers, heroPart, isRecorded, listeningSkipped, partProgress, setListeningSkipped, visibleProgress, updatePart7Range, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import { addToZone, hasZones, importZone, removeFromZones, reorderInZone, switchZone, zoneForKey } from '@/features/mistakes/lib/captureZones';
import { buildShotList, classifyDoubt, firstOpenShot, nextOpenShot, numberChoices, readCapturePrefs, shotDone, shotMissing, suggestListeningReason, writeCapturePrefs,
  type ShotItem } from '@/features/mistakes/lib/captureShots';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { DoneView, ManualCard, type SentThumb, type Staged, type Zone } from './views';
import { ListeningView, SoatView, type SoatRow } from './captureViews';
import { CaptureView, type ShotRow, type ShotState, type StripChip } from './CaptureShotView';
import './wrong-detail.css';

interface Props {
  session: StudySession;
  /** Every card of the account; the flow takes this test's own. */
  mistakes: MistakeEntry[];
  onSave: (entry: MistakeEntry, original: MistakeEntry) => void;
  /** A Listening question has no draft card: its card is added when first saved. */
  onAdd: (entry: MistakeEntry) => void;
  onReview: (ids: string[]) => void;
  onClose: (saved: number) => void;
  phone?: boolean;
}

export type Screen = { name: 'listening' } | { name: 'capture' } | { name: 'review' };
/** One capture of one shot-list item (a Part 5 Tấm or a Part 6/7 passage group), read in the background. */
export interface ReadJob {
  key: string; item: string; part: PartNumber; group?: number; label: string; status: 'waiting' | 'reading' | 'done' | 'failed';
  done: number; total: number; startedAt?: number; passage: File[]; questions: File[]; wanted: number[]; requested: number[];
  photoMode: boolean;
  readIds: string[]; skipped: number[]; missing: number[]; rejectionReasons: PageRejectionReason[]; error: string; note: string;
}
interface SentImage { id: string; url: string; job: string }
const PARALLEL_READS = 3;
const COMPRESSED_NOTE = 'Ảnh nặng nên Sóc đã thu nhỏ hoặc cắt ảnh trên máy trước khi gửi.';
const busyStatus = (job?: ReadJob) => job?.status === 'waiting' || job?.status === 'reading';

/**
 * Gỡ câu sai, capture v2 (design/previews/capture-v2): Listening first (one reason for several numbers), then the
 * "Cần chụp" shot list derived from the wrong list, one tray per item, Part 6/7 groups sent one after another while
 * Sóc reads in the background, and one Soát where only doubtful rows are open. Drafts survive closing.
 */
export function WrongDetailFlow({ session, mistakes, onSave, onAdd, onReview, onClose, phone = false }: Props) {
  const { cards, unsaved } = useMemo(() => flowCards(session, mistakes), [session, mistakes]);
  const byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  const byNumber = useMemo(() => new Map(cards.map(card => [card.questionNumber!, card])), [cards]);
  const [forms, setForms] = useState<Record<string, CardForm>>(() => Object.fromEntries(cards.map(card => [card.id, savedDetailForm(card)])));
  const formsRef = useRef(forms);
  formsRef.current = forms;
  const dirtyIds = useRef(new Set<string>());
  // The versions the learner started from; a cloud update must not bless an older form as a draft of a newer card.
  const draftBases = useRef(new Map(cards.map(card => [card.id, card])));
  const owner = useRef(getActiveAccountId());
  const prefs = useRef(readCapturePrefs(owner.current));
  const [skipListening, setSkipListening] = useState(() => listeningSkipped(owner.current, session.id));
  const recordedNow = (card: MistakeEntry) => !unsaved.has(card.id) && isRecorded(card);
  const [screen, setScreen] = useState<Screen>(() =>
    !skipListening && cards.some(card => card.part <= 4 && !recordedNow(card)) ? { name: 'listening' } : { name: 'capture' });
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [skippedItems, setSkippedItems] = useState<Set<string>>(() => new Set());
  const [customPart7Ranges, setCustomPart7Ranges] = useState<CustomRangeMap>({});
  const [photoMode, setPhotoModeState] = useState(prefs.current.photoMode);
  const setPhotoMode = useCallback((value: boolean) => { setPhotoModeState(value); writeCapturePrefs(owner.current, { photoMode: value }); }, []);
  const [clarity, setClarity] = useState<Record<string, ClarityResult | null>>({});
  const [editingPhoto, setEditingPhoto] = useState<{ zone: Zone; id: string } | null>(null);
  const measuredClarity = useRef(new Set<string>());
  const [zones, setZones] = useState<Record<Zone, Staged[]>>({ passage: [], questions: [] });
  const [activeZone, setActiveZoneState] = useState<Zone>(prefs.current.part7Zone);
  const setActiveZone = (zone: Zone) => { setActiveZoneState(zone); writeCapturePrefs(owner.current, { part7Zone: zone }); };
  const [sent, setSent] = useState<Record<string, SentImage[]>>({});
  const [jobs, setJobs] = useState<Record<string, ReadJob>>({});
  /** Numbers Sóc returned in this sitting: they tick their shot-list items. */
  const [readNumbers, setReadNumbers] = useState<Set<number>>(() => new Set());
  /** Cards whose number Sóc guessed (backend `numberSource: 'inferred'`). */
  const [inferred, setInferred] = useState<Set<string>>(() => new Set());
  /** Doubtful rows the learner has looked at and kept. */
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  /** "Làm đúng" rows already shown in a Soát that was saved. */
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [manual, setManual] = useState<{ part: PartNumber; number: number } | null>(null);
  const [openRow, setOpenRow] = useState('');
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [savedTotal, setSavedTotal] = useState(0);
  /** Cards just saved from Soát: the Cần chụp hero says "Đã lưu N thẻ" with "Ôn ngay". */
  const [savedHero, setSavedHero] = useState<string[] | null>(null);
  const closing = useRef(false);
  /** A read moved to another number: a late explanation follows it. */
  const moved = useRef(new Map<string, string>());
  /** "Xong nhóm cuối" was pressed: Soát opens once every reading is back. */
  const finishing = useRef(false);
  const jobSeq = useRef(0);
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const canReadPageImages = config ? Boolean(config.pageImages) : (!configFailed && apiAvailable);

  const filledIds = (ids: Iterable<string>) => [...ids].filter(id => dirtyIds.current.has(id) && !isEmptyForm(formsRef.current[id] ?? EMPTY_FORM));
  const allFilled = filledIds(cards.map(card => card.id));
  const draftCards = useMemo(() => cards.map(card => draftBases.current.get(card.id) ?? card), [cards]);
  const draftValue = useMemo(() => buildDetailDraft(draftCards, forms, dirtyIds.current), [draftCards, forms]);
  const draft = useFormDraft({ scope: detailDraftScope(cards), value: draftValue, validate: validateDetailDraft,
    meaningful: draftValue.rows.length > 0,
    snapshot: () => buildDetailDraft(draftCards, formsRef.current, dirtyIds.current),
    restore: value => {
      const restored = restoreDetailDraft(value, draftCards);
      for (const id of Object.keys(restored)) dirtyIds.current.add(id);
      const next = { ...formsRef.current, ...restored };
      formsRef.current = next; setForms(next);
    } });

  const activeFlow = useCallback(() => !closing.current && getActiveAccountId() === owner.current, []);
  useEffect(() => {
    closing.current = false;
    return () => { closing.current = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void aiService.getAIConfiguration()
      .then(value => { if (!cancelled) { setConfig(value); setConfigFailed(false); } })
      .catch(() => { if (!cancelled) setConfigFailed(true); });
    return () => { cancelled = true; };
  }, []);
  const anyReading = Object.values(jobs).some(busyStatus);
  useEffect(() => {
    if (!anyReading) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [anyReading]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  // Thumbnails hold object URLs; release them with the zones and the sent trays.
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const sentRef = useRef(sent);
  sentRef.current = sent;
  useEffect(() => () => {
    for (const list of Object.values(zonesRef.current)) list.forEach(item => URL.revokeObjectURL(item.url));
    for (const list of Object.values(sentRef.current)) list.forEach(item => URL.revokeObjectURL(item.url));
  }, []);
  // On-device clarity & EXIF orientation check on staged photos: a camera photo or a dark/blurry page turns on photo mode.
  useEffect(() => {
    for (const item of [...zones.passage, ...zones.questions]) {
      if (measuredClarity.current.has(item.id)) continue;
      measuredClarity.current.add(item.id);
      void fileExifOrientation(item.file).then(orientation => {
        if (activeFlow() && orientation !== 1) setPhotoMode(true);
      });
      void checkPhotoClarity(item.url).then(result => {
        if (!activeFlow()) return;
        setClarity(prev => ({ ...prev, [item.id]: result }));
        if (result?.problem) setPhotoMode(true);
      });
    }
  }, [zones, activeFlow, setPhotoMode]);

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  useEffect(() => {
    setExplanationInterceptor((queuedId, arrivedDraft, originalInput) => {
      const cardId = moved.current.get(queuedId) ?? queuedId;
      // A saved row takes its explanation through the queue's own path, straight onto the stored card.
      if (!activeFlow() || !byId.has(cardId) || !dirtyIds.current.has(cardId)) return false;
      const current = formsRef.current[cardId], card = byId.get(cardId)!;
      // Only take a matching, usable result; otherwise the queue keeps its own fallback.
      const effective = current && detailExplanationInput(current, card.part);
      if (!current?.ai || current.ai.explanation || current.ai.trapTip?.trim() || !effective || !sameExplanationInput(effective, originalInput)) return false;
      const arrived = withArrivedExplanation(current, arrivedDraft);
      // The learner's choice matches the solved answer: the row stays (as "làm đúng") but is not a mistake draft.
      if (isRightForm(arrived) && !current.touched?.answer) {
        const nextForms = { ...formsRef.current, [cardId]: arrived };
        formsRef.current = nextForms; setForms(nextForms);
        dirtyIds.current.delete(cardId);
        return true;
      }
      const candidate = buildDetailEntry(card, arrived);
      if (typeof candidate === 'string') { setError(candidate); return false; }
      dirtyIds.current.add(cardId);
      const next = { ...formsRef.current, [cardId]: arrived };
      formsRef.current = next; setForms(next);
      return true;
    });
    return () => setExplanationInterceptor(null);
  }, [byId, activeFlow]);

  // Rows the learner is not editing follow the stored card (a save, a late explanation, another device).
  useEffect(() => {
    let changed = false;
    const next = { ...formsRef.current };
    for (const card of cards) {
      if (dirtyIds.current.has(card.id) || unsaved.has(card.id) || draftBases.current.get(card.id) === card) continue;
      draftBases.current.set(card.id, card); next[card.id] = savedDetailForm(card); changed = true;
    }
    if (changed) { formsRef.current = next; setForms(next); }
  }, [cards, unsaved]);

  const update = (id: string, patch: Partial<CardForm>) => {
    const current = formsRef.current[id] ?? EMPTY_FORM;
    const edited = editDetailForm(current, patch);
    const acceptingDoubtAsRight = Boolean(patch.answer && current.ai?.answerDoubt === patch.answer && isRightForm(edited));
    if (acceptingDoubtAsRight) dirtyIds.current.delete(id);
    else dirtyIds.current.add(id);
    const next = { ...formsRef.current, [id]: edited };
    formsRef.current = next; setForms(next); setError('');
  };

  const clearZones = () => {
    for (const list of Object.values(zonesRef.current)) list.forEach(item => URL.revokeObjectURL(item.url));
    setZones({ passage: [], questions: [] });
  };

  const close = () => {
    if (closing.current) return;
    if (anyReading && !window.confirm('Sóc đang đọc ảnh. Đóng thì các ảnh còn lại không được đọc. Vẫn đóng?')) return;
    const persisted = draft.persist();
    const unsavedCount = filledIds(cards.map(card => card.id)).length;
    if (!persisted && unsavedCount && !window.confirm(`Chưa tự lưu được nháp. Đóng và bỏ ${unsavedCount} câu đã điền?`)) return;
    closing.current = true; removeCaptcha(); onClose(savedTotal);
  };
  const ref = useModalA11y(true, () => { if (editingPhoto) setEditingPhoto(null); else if (manual) setManual(null); else close(); });

  const allProgress = partProgress(cards, unsaved);
  const recorded = recordedNow;
  const partCards = (part: number) => cards.filter(card => card.part === part);

  /* ---------- the shot list ---------- */
  const readingNumbers = cards.filter(card => card.part >= 5).map(card => card.questionNumber!);
  const items = useMemo(() => buildShotList(readingNumbers, customPart7Ranges), [readingNumbers.join(','), customPart7Ranges]); // eslint-disable-line react-hooks/exhaustive-deps
  const covered = (number: number) => {
    const card = byNumber.get(number);
    if (!card) return true;
    return recorded(card) || readNumbers.has(number) || Boolean(dirtyIds.current.has(card.id) && forms[card.id]?.ai);
  };
  const itemJobs = (key: string) => Object.values(jobs).filter(job => job.item === key);
  const stateOf = (item: ShotItem): ShotState => {
    if (shotDone(item, covered)) return 'done';
    const list = itemJobs(item.key);
    if (list.some(busyStatus)) return 'reading';
    if (list.some(job => job.status === 'failed')) return 'failed';
    if (skippedItems.has(item.key)) return 'skipped';
    return 'open';
  };
  const rows: ShotRow[] = items.map(item => ({ item, state: stateOf(item) }));
  const stateByKey = new Map(rows.map(row => [row.item.key, row.state]));
  const isOpen = (item: ShotItem) => stateByKey.get(item.key) === 'open';
  const current = items.find(item => item.key === currentKey) ?? firstOpenShot(items, isOpen);
  const currentRef = useRef(current);
  currentRef.current = current;
  const next = current ? nextOpenShot(items, current.key, isOpen) : null;
  const askedMissing = new Set(Object.values(jobs).filter(job => job.status === 'done').flatMap(job => job.missing));
  const missing = [...new Set(items.flatMap(item => shotMissing(item, askedMissing, covered)))].sort((a, b) => a - b);
  const selectItem = (key: string) => {
    setSavedHero(null);
    if (key !== current?.key) { clearZones(); setError(''); setNote(''); }
    setSkippedItems(currentSet => { if (!currentSet.has(key)) return currentSet; const nextSet = new Set(currentSet); nextSet.delete(key); return nextSet; });
    setCurrentKey(key);
  };

  /* ---------- Listening ---------- */
  const listeningCards = cards.filter(card => card.part <= 4);
  const listeningLeft = listeningCards.filter(card => !recorded(card)).length;
  const suggestedReason = useMemo(() => suggestListeningReason(mistakes), [mistakes]);

  /** Saves the filled rows among `ids`; returns false and points at the row when one needs fixing. */
  const save = (ids: string[]) => {
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return false; }
    if (cards.some(card => card.sessionId !== session.id)) { setError('Danh sách có câu thuộc nhiều lượt làm. Đóng và mở riêng từng lượt trong Sổ tay.'); return false; }
    const entries: [MistakeEntry, MistakeEntry][] = [];
    for (const id of filledIds(ids)) {
      const card = byId.get(id);
      if (!card) continue;
      const entry = buildDetailEntry(card, formsRef.current[id]);
      if (typeof entry === 'string') { setOpenRow(id); setError(`Câu ${card.questionNumber}: ${entry}`); return false; }
      entries.push([entry, card]);
    }
    if (!entries.length) { setError('Chưa có câu nào được điền.'); return false; }
    try {
      for (const [entry, card] of entries) {
        if (unsaved.has(card.id)) onAdd(entry);
        else onSave(entry, draftBases.current.get(card.id) ?? card);
        draftBases.current.set(card.id, entry);
        dirtyIds.current.delete(card.id);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được thẻ.'); return false; }
    if (!dirtyIds.current.size) draft.clear(); else draft.persist();
    setSavedTotal(value => value + entries.length);
    setToast({ id: Date.now(), text: `Đã lưu ${entries.length} câu vào Sổ tay` });
    setError(''); setNote(''); setOpenRow('');
    return true;
  };

  const assignListening = (ids: string[], category: ErrorCategory) => {
    for (const id of ids) update(id, { category });
    save(ids);
  };
  const toggleListening = (skip: boolean) => {
    setListeningSkipped(owner.current, session.id, skip); setSkipListening(skip);
    setError('');
    setScreen(skip ? { name: 'capture' } : { name: 'listening' });
  };

  /* ---------- the tray ---------- */
  const addFiles = (files: File[], zone?: Zone) => {
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return; }
    const images = files.filter(file => file.type.startsWith('image/'));
    const item = currentRef.current;
    if (!images.length || shownScreen.current.name !== 'capture' || !item || !canReadPageImages) return;
    // Part 7: the zone it was dropped on, else the active zone, in arrival order; nothing moves by itself.
    const target = importZone(hasZones(item.part), activeZoneRef.current, zone);
    const staged = images.map(file => ({ id: generateUUID(), file, url: URL.createObjectURL(file) }));
    setZones(currentZones => addToZone(currentZones, target, staged));
    setError('');
  };
  const activeZoneRef = useRef(activeZone);
  activeZoneRef.current = activeZone;
  const addCameraFiles = (files: File[], zone?: Zone) => {
    if (files.some(file => file.type.startsWith('image/'))) setPhotoMode(true);
    addFiles(files, zone);
  };
  const removeStaged = (zone: Zone, id: string) => setZones(currentZones => {
    currentZones[zone].filter(item => item.id === id).forEach(item => URL.revokeObjectURL(item.url));
    return removeFromZones(currentZones, zone, id);
  });
  const moveStaged = (zone: Zone, id: string, delta: -1 | 1) => setZones(currentZones => reorderInZone(currentZones, zone, id, delta));
  /** "Chuyển sang ②/①": the only way an image changes zone. */
  const switchStaged = (zone: Zone, id: string) => setZones(currentZones => switchZone(currentZones, zone, id));
  const replaceStaged = (zone: Zone, id: string, nextFile: File) => {
    setZones(currentZones => {
      const existing = currentZones[zone].find(item => item.id === id);
      if (!existing) return currentZones;
      URL.revokeObjectURL(existing.url);
      measuredClarity.current.delete(id);
      const nextUrl = URL.createObjectURL(nextFile);
      return { ...currentZones, [zone]: currentZones[zone].map(item => item.id === id ? { ...item, file: nextFile, url: nextUrl } : item) };
    });
  };
  const editPart7Range = (from: number, to: number): string | null => {
    if (!current) return null;
    const res = updatePart7Range(customPart7Ranges, current.from, from, to);
    if ('error' in res) return res.error;
    setCustomPart7Ranges(res.next);
    setCurrentKey(`g${from}`);
    setError('');
    return null;
  };
  // Ctrl+V anywhere while the tray is open adds screenshots to the zone in use.
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); addRef.current(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
  // Desktop: keys 1/2 pick zone ① or ② of an open Part 7 group.
  const zoneKeysOn = screen.name === 'capture' && canReadPageImages && current?.part === 7 && !phone;
  useEffect(() => {
    if (!zoneKeysOn) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const zone = zoneForKey(event.key);
      if (zone) { event.preventDefault(); setActiveZoneState(zone); writeCapturePrefs(owner.current, { part7Zone: zone }); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoneKeysOn]);

  /* ---------- readings ---------- */
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const patchJob = (key: string, patch: Partial<ReadJob>) => {
    const nextJobs = { ...jobsRef.current, [key]: { ...jobsRef.current[key], ...patch } };
    jobsRef.current = nextJobs; setJobs(nextJobs);
  };
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  const batch = useRef({ id: generateUUID(), used: 0 });
  const shownScreen = useRef(screen);
  shownScreen.current = screen;

  const finishJob = (job: ReadJob, readIds: string[], skipped: number[], rejectionReasons: PageRejectionReason[], failure: string) => {
    const missingNumbers = job.wanted.filter(number => !readIds.includes(byNumber.get(number)!.id));
    const ids = [...readIds].sort((a, b) => byId.get(a)!.questionNumber! - byId.get(b)!.questionNumber!);
    const failed = Boolean(failure) || !ids.length;
    const reasonSummary = rejectionReasons.length ? rejectionReasons[0].detail : '';
    patchJob(job.key, { status: failed ? 'failed' : 'done', readIds: ids, skipped, missing: failed ? [] : missingNumbers, rejectionReasons,
      error: failure || (failed ? (reasonSummary || 'Sóc chưa thấy câu nào bạn sai trong ảnh. Thêm ảnh rõ hơn hoặc ghi tay.') : '') });
  };

  const runJob = async (key: string) => {
    const job = jobsRef.current[key];
    active.current += 1;
    patchJob(key, { status: 'reading', done: 0, total: 0, error: '', note: '', rejectionReasons: [], startedAt: Date.now() });
    const readIds: string[] = [], skipped = new Set<number>(), seen = new Set<number>();
    const rejectionReasons: PageRejectionReason[] = [];
    let failure = '';
    try {
      const limit = captureRequestLimit(config);
      const plan = job.group !== undefined
        ? await prepareGroup(job.passage, job.questions, job.requested, config?.pageContextImages !== false, limit)
        : await prepareSingles(job.questions, job.requested, limit);
      if (!activeFlow()) return;
      if (plan.error) throw new Error(plan.error);
      // The whole sitting is one AI use (one batch id) while the backend accepts more requests for it; a group that
      // no longer fits starts a new batch (another AI use), and the learner is told so.
      const newBatch = batch.current.used > 0 && batch.current.used + plan.requests.length > limit;
      if (batch.current.used + plan.requests.length > limit) batch.current = { id: generateUUID(), used: 0 };
      batch.current.used += plan.requests.length;
      const notes = [plan.split ? SPLIT_NOTE : plan.compressed ? COMPRESSED_NOTE : '', newBatch ? NEW_BATCH_NOTE(limit) : ''];
      const addNote = (text: string) => { if (text && !notes.includes(text)) { notes.push(text); patchJob(key, { note: notes.filter(Boolean).join(' ') }); } };
      patchJob(key, { total: plan.requests.length, note: notes.filter(Boolean).join(' ') });
      const batchId = batch.current.id;
      const processRequest = async (request: (typeof plan.requests)[number]) => {
        if (!activeFlow()) return;
        const result = await aiService.extractPageWithAI(
          request.questions.map(number => ({ number, part: partOfQuestion(number)! })),
          request.images, getToken, owner.current, activeFlow, batchId, request.contextImages, request.slices,
          job.photoMode ? { photoMode: true } : undefined
        );
        if (!activeFlow()) return;
        if (result.rejectionReasons?.length) rejectionReasons.push(...result.rejectionReasons);
        const nextForms = { ...formsRef.current };
        const matches: { item: (typeof result.items)[number]; card: MistakeEntry }[] = [];
        const guessed: string[] = [];
        for (const item of result.items) {
          if (seen.has(item.number)) continue;
          seen.add(item.number);
          const card = byNumber.get(item.number);
          // Only the wrong list is kept; a recorded question keeps what was saved.
          if (!card || !job.requested.includes(item.number)) { skipped.add(item.number); continue; }
          if (recorded(card) && !dirtyIds.current.has(card.id)) { skipped.add(item.number); continue; }
          nextForms[card.id] = withReadResult(nextForms[card.id] ?? EMPTY_FORM, item.draft);
          dirtyIds.current.add(card.id);
          readIds.push(card.id); matches.push({ item, card });
          if (item.numberSource === 'inferred') guessed.push(card.id);
        }
        formsRef.current = nextForms; setForms(nextForms);
        if (matches.length) setReadNumbers(currentSet => new Set([...currentSet, ...matches.map(({ item }) => item.number)]));
        if (guessed.length) setInferred(currentSet => new Set([...currentSet, ...guessed]));
        if (result.explainTicket) {
          const explainable = matches.filter(({ item, card }) => {
            const effective = detailExplanationInput(nextForms[card.id], card.part);
            return canExplainRead(item.draft, card.part) && effective && sameExplanationInput(effective, explainInput(item.draft, card.part));
          });
          // Only the numbers the ticket covers may be sent; the rest stay saved and can be explained from the card later.
          const ticketed = explainable.filter(({ item }) => ticketedNumbers(result).includes(item.number));
          addNote(explainCapNote(explainable.length - ticketed.length, result.explainLimit));
          if (ticketed.length) enqueueExplanations(result.explainTicket,
            ticketed.map(({ item, card }) => ({ cardId: card.id, number: item.number, input: explainInput(item.draft, card.part) })));
        }
        removeCaptcha();
        patchJob(key, { done: jobsRef.current[key].done + 1 });
      };
      // Part 5 packs (4+ screenshots) are read in parallel, up to PARALLEL_READS; a passage group stays one request.
      if (job.group === undefined && plan.requests.length > 1) {
        let cursor = 0;
        const worker = async () => {
          while (cursor < plan.requests.length && activeFlow()) await processRequest(plan.requests[cursor++]);
        };
        await Promise.all(Array.from({ length: Math.min(PARALLEL_READS, plan.requests.length) }, worker));
      } else {
        for (const request of plan.requests) await processRequest(request);
      }
    } catch (reason) {
      // The rest of this capture waits for "Thử lại" instead of spending more on a failing reading.
      failure = reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại hoặc ghi tay.';
    } finally {
      active.current -= 1;
      removeCaptcha();
    }
    if (!activeFlow()) return;
    const filteredReasons = rejectionReasons.filter(reason => reason.number === null || !seen.has(reason.number) || byNumber.has(reason.number));
    finishJob(job, readIds, [...skipped].filter(number => !byNumber.has(number)).sort((a, b) => a - b), filteredReasons, failure);
    pump();
  };
  const pump = () => {
    while (active.current < PARALLEL_READS && queue.current.length && activeFlow()) void runJob(queue.current.shift()!);
  };
  const enqueue = (job: ReadJob) => {
    const nextJobs = { ...jobsRef.current, [job.key]: job };
    jobsRef.current = nextJobs; setJobs(nextJobs);
    queue.current.push(job.key);
    pump();
  };
  const retryJob = (key: string) => {
    const job = jobsRef.current[key];
    if (!job || job.status !== 'failed' || !activeFlow()) return;
    enqueue({ ...job, status: 'waiting', error: '', rejectionReasons: [], done: 0, total: 0 });
  };

  /** Sends the open item's images and moves on to the next open item (Part 7 continuous capture). */
  const send = () => {
    const item = currentRef.current;
    if (shownScreen.current.name !== 'capture' || !item) return;
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return; }
    if (cards.some(card => card.sessionId !== session.id)) { setError('Danh sách có câu thuộc nhiều lượt làm. Đóng và mở riêng từng lượt trong Sổ tay.'); return; }
    if (itemJobs(item.key).some(busyStatus)) return;
    const passage = zonesRef.current.passage, questions = zonesRef.current.questions;
    if (!passage.length && !questions.length) return;
    const open = item.wrong.filter(number => !covered(number));
    let wanted = open.length ? open : item.wrong;
    if (item.kind === 'shot') {
      // One Part 5 screenshot may show more than its Tấm: Sóc also looks for the other open Part 5 numbers.
      const pending = new Set(Object.values(jobsRef.current).filter(busyStatus).flatMap(job => job.wanted));
      const others = readingNumbers.filter(number => number <= 130 && !covered(number) && !pending.has(number) && !wanted.includes(number));
      wanted = [...wanted, ...others].sort((a, b) => a - b);
    }
    const key = `${item.key}#${++jobSeq.current}`;
    setError(''); setNote(''); setSavedHero(null);
    // The sent images stay on the item's tray with what Sóc found.
    setSent(currentSent => ({ ...currentSent, [item.key]: [...(currentSent[item.key] ?? []), ...[...passage, ...questions].map(image => ({ id: image.id, url: image.url, job: key }))] }));
    setZones({ passage: [], questions: [] });
    const following = nextOpenShot(items, item.key, candidate => candidate.key !== item.key && isOpen(candidate));
    if (following) setCurrentKey(following.key);
    else finishing.current = true;
    enqueue({ key, item: item.key, part: item.part, group: item.kind === 'group' ? item.from : undefined,
      label: item.kind === 'group' ? `${item.from}–${item.to}` : `Tấm ${item.index}`, status: 'waiting', done: 0, total: 0,
      passage: passage.map(image => image.file), questions: questions.map(image => image.file), wanted,
      requested: item.kind === 'group' ? groupNumbers(item) : wanted, photoMode, readIds: [], skipped: [], missing: [], rejectionReasons: [], error: '', note: '' });
  };

  /* ---------- Soát ---------- */
  const reviewIds = cards.filter(card => !dismissed.has(card.id) && (filledIds([card.id]).length > 0
    || (readNumbers.has(card.questionNumber!) && isRightForm(forms[card.id]) && !recorded(card)))).map(card => card.id);
  // Once every reading is back after "Xong nhóm cuối", Soát opens by itself.
  useEffect(() => {
    if (!finishing.current || anyReading || screen.name !== 'capture') return;
    finishing.current = false;
    if (reviewIds.length) { setOpenRow(''); setScreen({ name: 'review' }); }
  }, [anyReading, screen.name, reviewIds.length]);
  const rejectionOf = new Map<number, string>();
  const generalReasons: string[] = [];
  for (const job of Object.values(jobs)) {
    if (job.status !== 'done') continue;
    for (const reason of job.rejectionReasons) {
      if (reason.number !== null && byNumber.has(reason.number) && job.readIds.includes(byNumber.get(reason.number)!.id)) rejectionOf.set(reason.number, reason.detail);
      else generalReasons.push(reason.detail);
    }
  }
  const skippedNumbers = [...new Set(Object.values(jobs).filter(job => job.status === 'done').flatMap(job => job.skipped))].sort((a, b) => a - b);
  const openOfPart = (part: number) => cards.filter(card => card.part === part && !covered(card.questionNumber!)).map(card => card.questionNumber!);
  const soatRows: SoatRow[] = reviewIds.map(id => {
    const card = byId.get(id)!, form = forms[id] ?? EMPTY_FORM, number = card.questionNumber!;
    const doubt = confirmed.has(id) || isRightForm(form) ? null : classifyDoubt({ form, part: card.part, inferredNumber: inferred.has(id),
      knownAnswer: draftBases.current.get(id)?.correctAnswer, rejection: rejectionOf.get(number), explaining: isExplaining(id) });
    return { id, card, form, doubt, choices: doubt?.kind === 'number' ? numberChoices(number, openOfPart(card.part)) : [] };
  });
  const confirm = (id: string) => setConfirmed(currentSet => new Set([...currentSet, id]));
  /** "Sóc đoán là câu N": the learner names the real number; the reading moves to that card. */
  const pickNumber = (fromId: string, number: number): string | null => {
    const from = byId.get(fromId);
    if (!from) return null;
    if (number === from.questionNumber) { confirm(fromId); return null; }
    const target = byNumber.get(number);
    if (!target || target.part < 5) return `Câu ${number} không có trong danh sách câu sai.`;
    if (recorded(target) && !dirtyIds.current.has(target.id)) return `Câu ${number} đã có trong Sổ tay.`;
    if (dirtyIds.current.has(target.id) && formsRef.current[target.id]?.ai) return `Sóc đã đọc câu ${number} rồi.`;
    const nextForms = { ...formsRef.current, [target.id]: formsRef.current[fromId], [fromId]: savedDetailForm(from) };
    formsRef.current = nextForms; setForms(nextForms);
    dirtyIds.current.delete(fromId); dirtyIds.current.add(target.id);
    moved.current.set(fromId, target.id);
    setReadNumbers(currentSet => { const nextSet = new Set(currentSet); nextSet.delete(from.questionNumber!); nextSet.add(number); return nextSet; });
    setInferred(currentSet => { const nextSet = new Set(currentSet); nextSet.delete(fromId); return nextSet; });
    confirm(target.id);
    return null;
  };
  const saveAll = () => {
    const savedIds = filledIds(reviewIds);
    if (!save(reviewIds)) return;
    setSavedHero(savedIds);
    setDismissed(currentSet => new Set([...currentSet, ...reviewIds]));
    // Saved readings leave the strip; the rows are recorded now.
    const nextJobs = Object.fromEntries(Object.entries(jobsRef.current).filter(([, job]) => job.status !== 'done'));
    jobsRef.current = nextJobs; setJobs(nextJobs);
    setScreen({ name: 'capture' });
  };

  const discardDrafts = () => {
    if (!window.confirm('Bỏ nháp chưa lưu của các câu này? Dữ liệu đã lưu trong Sổ tay vẫn được giữ.')) return;
    const nextForms = { ...formsRef.current };
    for (const id of dirtyIds.current) { const card = byId.get(id); if (card) nextForms[id] = savedDetailForm(card); }
    dirtyIds.current.clear(); draft.clear();
    formsRef.current = nextForms; setForms(nextForms);
    setScreen({ name: 'capture' });
    setToast({ id: Date.now(), text: 'Đã bỏ nháp chưa lưu' });
  };

  const shown = visibleProgress(allProgress, skipListening);
  const total = shown.reduce((sum, entry) => sum + entry.numbers.length, 0);
  const hero = heroPart(shown);
  const testName = session.testName || 'Đề chưa đặt tên';
  const common = { phone, testName, onClose: close };
  const firstOpenOf = (item: ShotItem) => item.wrong.find(number => !recorded(byNumber.get(number)!)) ?? item.wrong[0];

  let body;
  const showListening = screen.name === 'listening' && listeningLeft > 0 && !skipListening;
  if (screen.name === 'review' && reviewIds.length) {
    body = <SoatView {...common} rows={soatRows} read={readNumbers.size > 0} openRow={openRow} setOpenRow={setOpenRow}
      writing={reviewIds.filter(id => isExplaining(id)).length} saveCount={filledIds(reviewIds).length} error={error}
      note={note || [...new Set(Object.values(jobs).map(job => job.note).filter(Boolean))].join(' ')}
      skipped={skippedNumbers} reasons={[...new Set(generalReasons)]} onUpdate={update} onConfirm={confirm} onPickNumber={pickNumber}
      onMore={() => { setError(''); setScreen({ name: 'capture' }); }} onSave={saveAll}
      onDiscard={readNumbers.size ? undefined : discardDrafts} />;
  } else if (showListening) {
    body = <ListeningView {...common} cards={listeningCards} recorded={recorded} suggested={suggestedReason} error={error}
      onAssign={assignListening} onSkip={() => toggleListening(true)} />;
  } else if (!hero && !allFilled.length && !anyReading && !savedHero) {
    const reviewable = cards.filter(card => !unsaved.has(card.id) && canReview(card)).map(card => card.id);
    body = <DoneView {...common} total={total} doneCount={total} progress={shown} cards={cards} reviewIds={reviewable}
      onReview={() => { closing.current = true; removeCaptcha(); onClose(savedTotal); onReview(reviewable); }} />;
  } else {
    const currentJobs = current ? itemJobs(current.key) : [];
    const job = currentJobs.find(busyStatus) ?? currentJobs.filter(entry => entry.status === 'failed').pop() ?? null;
    const strip: StripChip[] = Object.values(jobs).filter(entry => entry.item !== current?.key && !(current?.part === 5 && entry.part === 5)).slice(-4)
      .map(entry => ({ key: entry.key, label: entry.label, status: busyStatus(entry) ? 'reading' : entry.status === 'failed' ? 'failed' : 'done', count: entry.readIds.length }));
    // Part 5 is one tray: every Tấm's sent images show there.
    const sentHere = !current ? [] : current.part === 5 ? items.filter(item => item.part === 5).flatMap(item => sent[item.key] ?? []) : sent[current.key] ?? [];
    const sentThumbs: SentThumb[] = sentHere.map(image => {
      const owner = jobs[image.job];
      const numbers = owner?.readIds.map(id => byId.get(id)?.questionNumber).filter(Boolean) ?? [];
      return { id: image.id, url: image.url, tone: !owner || owner.status === 'done' ? 'done' : owner.status === 'failed' ? 'fail' : 'read',
        label: !owner || owner.status === 'done' ? (numbers.length ? numbers.join(' · ') : 'đã đọc') : owner.status === 'failed' ? 'chưa đọc được' : 'Sóc đang đọc…' };
    });
    const doneRows = rows.filter(row => row.state === 'done').length;
    body = <CaptureView {...common} rows={rows} current={current} currentState={current ? stateByKey.get(current.key) ?? 'open' : 'open'} next={next}
      part5Open={openOfPart(5)} zones={zones} activeZone={activeZone} onActivateZone={setActiveZone} sent={sentThumbs}
      clarity={clarity} photoMode={photoMode} onPhotoMode={setPhotoMode}
      onAddFiles={addFiles} onCameraAdd={addCameraFiles} onEditPhoto={(zone, id) => setEditingPhoto({ zone, id })} onMovePhoto={moveStaged} onSwitchZone={switchStaged} onRemove={removeStaged}
      canRead={canReadPageImages} inFlight={currentJobs.some(busyStatus)}
      job={job && { status: job.status, seconds: job.startedAt ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0, done: job.done, total: job.total,
        error: job.error, note: job.note, reasons: job.rejectionReasons.map(reason => reason.detail) }}
      strip={strip} onRetry={retryJob}
      missing={missing} onCaptureMissing={() => {
        const item = items.find(candidate => candidate.wrong.includes(missing[0]));
        if (item) selectItem(item.key);
        return item ?? null;
      }}
      reviewCount={reviewIds.length} allDone={doneRows === rows.length} anyReading={anyReading}
      onSelect={selectItem} onSend={send}
      onSkip={() => {
        if (!current) return;
        setSkippedItems(currentSet => new Set([...currentSet, current.key]));
        const following = nextOpenShot(items, current.key, candidate => candidate.key !== current.key && isOpen(candidate))
          ?? items.find(candidate => candidate.key !== current.key && isOpen(candidate));
        clearZones(); setError('');
        if (following) setCurrentKey(following.key);
      }}
      onManual={() => current && setManual({ part: current.part, number: firstOpenOf(current) })}
      onReview={() => { setError(''); setOpenRow(''); setScreen({ name: 'review' }); }}
      onEditRange={editPart7Range}
      listeningLeft={skipListening || screen.name === 'listening' ? listeningLeft : 0} onListening={() => toggleListening(false)}
      saved={savedHero && { count: savedHero.length, reviewable: savedHero.filter(id => { const card = byId.get(id); return Boolean(card && canReview(card)); }).length }}
      onReviewSaved={() => {
        const reviewable = (savedHero ?? []).filter(id => { const card = byId.get(id); return Boolean(card && canReview(card)); });
        closing.current = true; removeCaptcha(); onClose(savedTotal); onReview(reviewable);
      }}
      onNotify={text => setToast({ id: Date.now(), text })}
      error={error} note={note} />;
  }

  const manualCard = manual && <ManualCard phone={phone} part={manual.part} number={manual.number}
    numbers={partCards(manual.part).filter(card => !recorded(card) || card.questionNumber === manual.number).map(card => card.questionNumber!)}
    form={forms[byNumber.get(manual.number)!.id] ?? EMPTY_FORM} error={error}
    onPick={number => { setError(''); setManual({ part: manual.part, number }); }}
    onUpdate={patch => update(byNumber.get(manual.number)!.id, patch)}
    onSave={() => { if (save([byNumber.get(manual.number)!.id])) setManual(null); }}
    onCancel={() => { setError(''); setManual(null); }} />;

  const editingStaged = editingPhoto
    ? zones[editingPhoto.zone].find(item => item.id === editingPhoto.id)
    : undefined;

  if (!cards.length) return null;
  return createPortal(
    <div className={'wd-dim' + (phone ? ' is-phone' : '')}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Gỡ câu sai · ${testName}`} tabIndex={-1} className={'rd wd cv' + (phone ? ' is-phone' : '')}
        onDragOver={event => { if (screen.name === 'capture' && canReadPageImages) event.preventDefault(); }}
        onDrop={event => { if (screen.name !== 'capture') return; event.preventDefault(); addFiles([...event.dataTransfer.files]); }}>
        {body}
        {manualCard}
        {editingPhoto && editingStaged && (
          <PhotoReview
            file={editingStaged.file}
            photoMode={photoMode}
            onClose={() => setEditingPhoto(null)}
            onApply={({ file: nextFile, photoMode: nextPhotoMode, changed }) => {
              setPhotoMode(nextPhotoMode);
              if (changed) replaceStaged(editingPhoto.zone, editingPhoto.id, nextFile);
              setEditingPhoto(null);
            }}
          />
        )}
        {toast && <div key={toast.id} className="wd-toast" role="status"><i aria-hidden="true">✓</i>{toast.text}</div>}
        <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
      </div>
    </div>,
    document.body
  );
}
