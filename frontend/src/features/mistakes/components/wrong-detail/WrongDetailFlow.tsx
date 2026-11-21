import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { MistakeEntry, StudySession } from '@/shared/types';
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
import { MAX_CAPTURE_REQUESTS } from '@/features/mistakes/lib/captureBatch';
import { checkPhotoClarity, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { fileExifOrientation } from '@/features/mistakes/lib/imageInput';
import { flowCards, groupNumbers, heroPart, isGroupedPart, isRecorded, listeningSkipped, partMode, partProgress, setListeningSkipped, visibleProgress, suggestGroups, updatePart7Range, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { DoneView, ManualCard, Overview, PartView, ReviewView, type Staged, type Zone } from './views';
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

export type Screen = { name: 'overview' } | { name: 'part'; part: PartNumber }
  | { name: 'review'; part: PartNumber | null; ids: string[]; skipped: number[]; missing: number[]; rejectionReasons?: PageRejectionReason[]; group?: number; job?: string };
/** One capture being read: a question group of Part 3/4/6/7, or Part 1/2/5. */
export interface ReadJob {
  key: string; part: PartNumber; group?: number; label: string; status: 'waiting' | 'reading' | 'done' | 'failed';
  done: number; total: number; startedAt?: number; passage: File[]; questions: File[]; wanted: number[]; requested: number[];
  photoMode: boolean;
  readIds: string[]; skipped: number[]; missing: number[]; rejectionReasons: PageRejectionReason[]; error: string; note: string;
}
const PARALLEL_READS = 3;
const COMPRESSED_NOTE = 'Ảnh nặng nên Sóc đã thu nhỏ hoặc cắt ảnh trên máy trước khi gửi.';

const SPLIT_NOTE = 'Ảnh quá nặng để gửi cùng lúc nên Sóc đọc đoạn văn và câu hỏi ở các lượt riêng. Kiểm tra kỹ đoạn văn của từng câu.';

/**
 * Gỡ câu sai (design/previews/mock-wrong-detail.html): a logged test's wrong questions, one Part at a time. A Part's
 * review page is captured (Part 6–7 one passage group at a time, passage and questions read together), Sóc fills each
 * question, the learner checks and saves; drafts survive closing; progress comes from the cards themselves.
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
  const [screen, setScreen] = useState<Screen>({ name: 'overview' });
  const [groupFrom, setGroupFrom] = useState<number | null>(null);
  const groupRef = useRef(groupFrom);
  groupRef.current = groupFrom;
  const [customPart7Ranges, setCustomPart7Ranges] = useState<CustomRangeMap>({});
  const [listeningPhoto, setListeningPhoto] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [clarity, setClarity] = useState<Record<string, ClarityResult | null>>({});
  const [editingPhoto, setEditingPhoto] = useState<{ zone: Zone; id: string } | null>(null);
  const measuredClarity = useRef(new Set<string>());
  const [zones, setZones] = useState<Record<Zone, Staged[]>>({ passage: [], questions: [] });
  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [jobs, setJobs] = useState<Record<string, ReadJob>>({});
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [manual, setManual] = useState<{ part: PartNumber; number: number } | null>(null);
  const [openRow, setOpenRow] = useState('');
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [savedTotal, setSavedTotal] = useState(0);
  const [draftsSeen, setDraftsSeen] = useState(false);
  const closing = useRef(false);
  const owner = useRef(getActiveAccountId());
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
  const anyReading = Object.values(jobs).some(job => job.status === 'reading' || job.status === 'waiting');
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
  // Thumbnails hold object URLs; release them with the zones.
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  useEffect(() => () => { for (const list of Object.values(zonesRef.current)) list.forEach(item => URL.revokeObjectURL(item.url)); }, []);
  // On-device clarity & EXIF orientation check on staged photos: automatically enable photoMode when camera EXIF or dark/blurry paper photo is detected.
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
  }, [zones, activeFlow]);

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  useEffect(() => {
    setExplanationInterceptor((cardId, arrivedDraft, originalInput) => {
      // A saved row takes its explanation through the queue's own path, straight onto the stored card.
      if (!activeFlow() || !byId.has(cardId) || !dirtyIds.current.has(cardId)) return false;
      const current = formsRef.current[cardId], card = byId.get(cardId)!;
      // Only take a matching, usable result; otherwise the queue keeps its own fallback.
      const effective = current && detailExplanationInput(current, card.part);
      if (!current?.ai || current.ai.explanation || current.ai.trapTip?.trim() || !effective || !sameExplanationInput(effective, originalInput)) return false;
      const arrived = withArrivedExplanation(current, arrivedDraft);
      // If the learner's choice matches the solved answer, keep the card in place (styled green as "✓ Làm đúng")
      // so the learner still sees the question and explanation without feeling it was dropped, while excluding it
      // from unsaved mistake drafts (dirtyIds).
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
    setZones({ passage: [], questions: [] }); setActiveZone(null);
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
  const [skipListening, setSkipListening] = useState(() => listeningSkipped(owner.current, session.id));
  const recorded = (card: MistakeEntry) => !unsaved.has(card.id) && isRecorded(card);
  const partCards = (part: number) => cards.filter(card => card.part === part);

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

  const openPart = (part: PartNumber) => {
    setError(''); setNote(''); clearZones();
    setListeningPhoto(false);
    if (isGroupedPart(part)) {
      const groups = suggestGroups(part, partCards(part).map(card => card.questionNumber!), part === 7 ? customPart7Ranges : undefined);
      const next = groups.find(group => group.wrong.some(number => !recorded(byNumber.get(number)!))) ?? groups[0];
      setGroupFrom(next?.from ?? null);
    } else {
      setGroupFrom(null);
    }
    setScreen({ name: 'part', part });
  };

  /** The open group (or single Part) is being read: its zones wait. */
  const selectedBusy = () => {
    const shown = shownScreen.current;
    if (shown.name !== 'part') return false;
    const grouped = (partMode(shown.part) === 'page' || listeningPhoto) && isGroupedPart(shown.part);
    const key = grouped ? `g${groupRef.current}` : `p${shown.part}`;
    return ['waiting', 'reading'].includes(jobsRef.current[key]?.status ?? '');
  };
  const addFiles = (files: File[], zone?: Zone) => {
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return; }
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length || screen.name !== 'part' || (partMode(screen.part) === 'reason' && !listeningPhoto) || !canReadPageImages || selectedBusy()) return;
    // Unified single tray: all photos go into 'questions' in order unless explicitly added to 'passage'.
    const target: Zone = zone === 'passage' ? 'passage' : 'questions';
    const staged = images.map(file => ({ id: generateUUID(), file, url: URL.createObjectURL(file) }));
    setZones(current => ({ ...current, [target]: [...current[target], ...staged] }));
    setActiveZone(target); setError('');
  };
  const addCameraFiles = (files: File[], zone?: Zone) => {
    if (files.some(file => file.type.startsWith('image/'))) setPhotoMode(true);
    addFiles(files, zone);
  };
  const removeStaged = (zone: Zone, id: string) => setZones(current => {
    // Allow removing from either zone when displayed in unified tray.
    const actualZone: Zone = current[zone].some(item => item.id === id) ? zone : (zone === 'questions' ? 'passage' : 'questions');
    current[actualZone].filter(item => item.id === id).forEach(item => URL.revokeObjectURL(item.url));
    return { ...current, [actualZone]: current[actualZone].filter(item => item.id !== id) };
  });
  const replaceStaged = (zone: Zone, id: string, nextFile: File) => {
    setZones(current => {
      const actualZone: Zone = current[zone].some(item => item.id === id) ? zone : (zone === 'questions' ? 'passage' : 'questions');
      const existing = current[actualZone].find(item => item.id === id);
      if (!existing) return current;
      URL.revokeObjectURL(existing.url);
      measuredClarity.current.delete(id);
      const nextUrl = URL.createObjectURL(nextFile);
      return { ...current, [actualZone]: current[actualZone].map(item => item.id === id ? { ...item, file: nextFile, url: nextUrl } : item) };
    });
  };
  const editPart7Range = (oldFrom: number, from: number, to: number): string | null => {
    const res = updatePart7Range(customPart7Ranges, oldFrom, from, to);
    if ('error' in res) return res.error;
    setCustomPart7Ranges(res.next);
    setGroupFrom(from);
    setError('');
    return null;
  };
  // Ctrl+V anywhere while a Part is open adds screenshots to the zone in use.
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

  /** One capture of one question group (or of Part 5), read in the background; up to two run at the same time. */
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const patchJob = (key: string, patch: Partial<ReadJob>) => {
    const next = { ...jobsRef.current, [key]: { ...jobsRef.current[key], ...patch } };
    jobsRef.current = next; setJobs(next);
  };
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  const batch = useRef({ id: generateUUID(), used: 0 });
  const shownScreen = useRef(screen);
  shownScreen.current = screen;

  const finishJob = (job: ReadJob, readIds: string[], skipped: number[], rejectionReasons: PageRejectionReason[], error: string) => {
    const missing = job.wanted.filter(number => !readIds.includes(byNumber.get(number)!.id));
    const ids = [...readIds].sort((a, b) => byId.get(a)!.questionNumber! - byId.get(b)!.questionNumber!);
    const failed = Boolean(error) || !ids.length;
    const reasonSummary = rejectionReasons.length ? rejectionReasons[0].detail : '';
    patchJob(job.key, { status: failed ? 'failed' : 'done', readIds: ids, skipped, missing, rejectionReasons,
      error: error || (failed ? (reasonSummary || 'Sóc chưa thấy câu nào bạn sai trong ảnh. Thêm ảnh rõ hơn hoặc ghi tay.') : '') });
    if (failed) return;
    // The learner waiting on this capture sees the result; one busy with another group gets a note instead.
    const current = shownScreen.current;
    const waiting = current.name === 'part' && current.part === job.part && (job.group === undefined || job.group === groupRef.current);
    if (waiting) { setOpenRow(''); setScreen({ name: 'review', part: job.part, ids, skipped, missing, rejectionReasons, group: job.group, job: job.key }); }
    else setToast({ id: Date.now(), text: `${job.label} đọc xong ${ids.length} câu` });
  };

  const runJob = async (key: string) => {
    const job = jobsRef.current[key];
    active.current += 1;
    patchJob(key, { status: 'reading', done: 0, total: 0, error: '', note: '', rejectionReasons: [], startedAt: Date.now() });
    const readIds: string[] = [], skipped = new Set<number>(), seen = new Set<number>();
    const rejectionReasons: PageRejectionReason[] = [];
    let error = '';
    try {
      const plan = job.group !== undefined
        ? await prepareGroup(job.passage, job.questions, job.requested, config?.pageContextImages !== false)
        : await prepareSingles(job.questions, job.requested);
      if (!activeFlow()) return;
      if (plan.error) throw new Error(plan.error);
      patchJob(key, { total: plan.requests.length, note: plan.split ? SPLIT_NOTE : plan.compressed ? COMPRESSED_NOTE : '' });
      // The whole sitting is one AI use (one batch id) while the backend accepts more requests for it.
      if (batch.current.used + plan.requests.length > MAX_CAPTURE_REQUESTS) batch.current = { id: generateUUID(), used: 0 };
      batch.current.used += plan.requests.length;
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
        const next = { ...formsRef.current };
        const matches: { item: (typeof result.items)[number]; card: MistakeEntry }[] = [];
        for (const item of result.items) {
          if (seen.has(item.number)) continue;
          seen.add(item.number);
          const card = byNumber.get(item.number);
          // Only the wrong list is kept; a recorded question keeps what was saved.
          if (!card || !job.requested.includes(item.number)) { skipped.add(item.number); continue; }
          if (recorded(card) && !dirtyIds.current.has(card.id)) { skipped.add(item.number); continue; }
          next[card.id] = withReadResult(next[card.id] ?? EMPTY_FORM, item.draft);
          dirtyIds.current.add(card.id);
          readIds.push(card.id); matches.push({ item, card });
        }
        formsRef.current = next; setForms(next);
        if (result.explainTicket) enqueueExplanations(result.explainTicket, matches.filter(({ item, card }) => {
          const effective = detailExplanationInput(next[card.id], card.part);
          return canExplainRead(item.draft, card.part) && effective && sameExplanationInput(effective, explainInput(item.draft, card.part));
        }).map(({ item, card }) => ({ cardId: card.id, number: item.number, input: explainInput(item.draft, card.part) })));
        removeCaptcha();
        patchJob(key, { done: jobsRef.current[key].done + 1 });
      };
      // For multi-pack Part 5 batches (4+ screenshots), dispatch packs in parallel up to PARALLEL_READS!
      if (job.group === undefined && plan.requests.length > 1) {
        let cursor = 0;
        const worker = async () => {
          while (cursor < plan.requests.length && activeFlow()) {
            const req = plan.requests[cursor++];
            await processRequest(req);
          }
        };
        await Promise.all(Array.from({ length: Math.min(PARALLEL_READS, plan.requests.length) }, worker));
      } else {
        for (const request of plan.requests) await processRequest(request);
      }
    } catch (reason) {
      // The rest of this group waits for "Thử lại" instead of spending more on a failing reading.
      error = reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại hoặc ghi tay.';
    } finally {
      active.current -= 1;
      removeCaptcha();
    }
    if (!activeFlow()) return;
    const filteredReasons = rejectionReasons.filter(r => r.number === null || !seen.has(r.number));
    finishJob(job, readIds, [...skipped].filter(number => !byNumber.has(number)).sort((a, b) => a - b), filteredReasons, error);
    pump();
  };
  const pump = () => {
    while (active.current < PARALLEL_READS && queue.current.length && activeFlow()) void runJob(queue.current.shift()!);
  };
  const enqueue = (job: ReadJob) => {
    const next = { ...jobsRef.current, [job.key]: job };
    jobsRef.current = next; setJobs(next);
    queue.current.push(job.key);
    pump();
  };
  const retryJob = (key: string) => {
    const job = jobsRef.current[key];
    if (!job || job.status !== 'failed' || !activeFlow()) return;
    enqueue({ ...job, status: 'waiting', error: '', rejectionReasons: [], done: 0, total: 0 });
  };

  /** Sends staged photos for the open group/Part; optionally auto-advances to the next unread group immediately. */
  const send = (advanceToFrom?: number) => {
    if (screen.name !== 'part') return;
    const part = screen.part;
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return; }
    if (cards.some(card => card.sessionId !== session.id)) { setError('Danh sách có câu thuộc nhiều lượt làm. Đóng và mở riêng từng lượt trong Sổ tay.'); return; }
    const grouped = isGroupedPart(part);
    const group = grouped
      ? suggestGroups(part, partCards(part).map(card => card.questionNumber!), part === 7 ? customPart7Ranges : undefined).find(item => item.from === groupFrom)
      : undefined;
    if (grouped && !group) return;
    const key = group ? `g${group.from}` : `p${part}`;
    if (['waiting', 'reading'].includes(jobsRef.current[key]?.status ?? '')) return;
    const wrong = group ? group.wrong : partCards(part).map(card => card.questionNumber!);
    const open = wrong.filter(number => !recorded(byNumber.get(number)!));
    const wanted = open.length ? open : wrong;
    const passage = zonesRef.current.passage.map(item => item.file), questions = zonesRef.current.questions.map(item => item.file);
    if (!passage.length && !questions.length) return;
    setError(''); setNote('');
    clearZones();
    if (advanceToFrom !== undefined) setGroupFrom(advanceToFrom);
    enqueue({ key, part, group: group?.from, label: group ? `Nhóm ${group.from}–${group.to}` : `Part ${part}`, status: 'waiting', done: 0, total: 0,
      passage, questions, wanted, requested: group ? groupNumbers(group) : wanted, photoMode, readIds: [], skipped: [], missing: [], rejectionReasons: [], error: '', note: '' });
  };
  const openJob = (key: string) => {
    const job = jobsRef.current[key];
    if (!job || job.status !== 'done') return;
    setOpenRow('');
    setScreen({ name: 'review', part: job.part, ids: job.readIds, skipped: job.skipped, missing: job.missing, rejectionReasons: job.rejectionReasons, group: job.group, job: key });
  };

  const discardDrafts = () => {
    if (!window.confirm('Bỏ nháp chưa lưu của các câu này? Dữ liệu đã lưu trong Sổ tay vẫn được giữ.')) return;
    const next = { ...formsRef.current };
    for (const id of dirtyIds.current) { const card = byId.get(id); if (card) next[id] = savedDetailForm(card); }
    dirtyIds.current.clear(); draft.clear();
    formsRef.current = next; setForms(next); setDraftsSeen(true);
    setToast({ id: Date.now(), text: 'Đã bỏ nháp chưa lưu' });
  };

  const shown = visibleProgress(allProgress, skipListening);
  const listeningLeft = allProgress.filter(entry => entry.part <= 4).reduce((sum, entry) => sum + entry.numbers.length - entry.done, 0);
  const total = shown.reduce((sum, entry) => sum + entry.numbers.length, 0), doneCount = shown.reduce((sum, entry) => sum + entry.done, 0);
  const hero = heroPart(shown);
  const progress = shown;
  const testName = session.testName || 'Đề chưa đặt tên';
  const draftState = draft.state === 'unavailable' ? 'Chưa tự lưu được nháp trên trình duyệt. Hãy lưu câu trước khi đóng.'
    : draft.state === 'restored' ? 'Đã khôi phục nháp trên máy này.' : 'Đã tự lưu nháp trên máy này.';
  const pendingDrafts = draftsSeen ? [] : allFilled;
  const common = { phone, testName, total, doneCount, onClose: close };

  const restoreSkipped = (number: number) => {
    const card = byNumber.get(number);
    if (!card) return;
    const current = formsRef.current[card.id] ?? EMPTY_FORM;
    const restored: CardForm = { ...current, answer: '', touched: { ...current.touched, answer: true } };
    const nextForms = { ...formsRef.current, [card.id]: restored };
    formsRef.current = nextForms; setForms(nextForms);
    dirtyIds.current.add(card.id);
    setOpenRow(card.id);
    if (screen.name === 'review') {
      const nextIds = [...new Set([...screen.ids, card.id])].sort((a, b) => byId.get(a)!.questionNumber! - byId.get(b)!.questionNumber!);
      const nextSkipped = screen.skipped.filter(n => n !== number);
      setScreen({ ...screen, ids: nextIds, skipped: nextSkipped });
      if (screen.job && jobsRef.current[screen.job]) {
        patchJob(screen.job, { readIds: nextIds, skipped: nextSkipped });
      }
    }
  };

  let body;
  if (screen.name === 'review') {
    const ids = screen.ids.filter(id => byId.has(id));
    body = <ReviewView {...common} screen={{ ...screen, ids }} cards={byId} forms={forms} openRow={openRow} setOpenRow={setOpenRow}
      writing={ids.filter(id => isExplaining(id)).length} saveCount={filledIds(ids).length} error={error} note={note || (screen.job ? jobs[screen.job]?.note ?? '' : '')}
      rejectionReasons={screen.rejectionReasons ?? (screen.job ? jobs[screen.job]?.rejectionReasons ?? [] : [])}
      wrongTotal={screen.part ? partCards(screen.part).length : total}
      onUpdate={update} canAddImages={canReadPageImages && screen.part !== null}
      canRestoreSkipped={number => byNumber.has(number)}
      onRestoreSkipped={restoreSkipped}
      onBack={() => { setError(''); setScreen(screen.part ? { name: 'part', part: screen.part } : { name: 'overview' }); if (screen.group) setGroupFrom(screen.group); }}
      onSave={() => {
        if (!save(ids)) return;
        // A saved capture leaves its group's status; the rows are recorded now.
        if (screen.job) { const next = { ...jobsRef.current }; delete next[screen.job]; jobsRef.current = next; setJobs(next); }
        setScreen({ name: 'overview' });
      }} />;
  } else if (screen.name === 'part') {
    const part = screen.part;
    body = <PartView {...common} part={part} cards={partCards(part)} recorded={recorded} forms={forms} dirty={dirtyIds.current}
      groupFrom={groupFrom} setGroupFrom={from => { if (from !== groupFrom) { clearZones(); setError(''); } setGroupFrom(from); }}
      customPart7Ranges={customPart7Ranges} onEditPart7Range={editPart7Range}
      zones={zones} activeZone={activeZone} setActiveZone={setActiveZone}
      onAddFiles={addFiles} onCameraAdd={addCameraFiles} onEditPhoto={(zone, id) => setEditingPhoto({ zone, id })} onRemove={removeStaged}
      clarity={clarity} photoMode={photoMode} setPhotoMode={setPhotoMode}
      listeningPhoto={listeningPhoto} setListeningPhoto={val => {
        setListeningPhoto(val);
        clearZones();
        setError('');
        if (val && isGroupedPart(part)) {
          const groups = suggestGroups(part, partCards(part).map(card => card.questionNumber!));
          setGroupFrom(groups[0]?.from ?? null);
        }
      }}
      jobs={jobs} now={now} onRetry={retryJob} onOpenJob={openJob} error={error} note={note} draftState={draftState} canRead={canReadPageImages}
      onSend={() => send()} onSendNext={nextFrom => send(nextFrom)} onBack={() => { clearZones(); setError(''); setNote(''); setScreen({ name: 'overview' }); }}
      onManual={number => setManual({ part, number })} onUpdate={update}
      onSaveReasons={() => { if (save(partCards(part).map(card => card.id))) setScreen({ name: 'overview' }); }}
      saveCount={filledIds(partCards(part).map(card => card.id)).length}
      onShowDrafts={() => setScreen({ name: 'review', part, ids: filledIds(partCards(part).map(card => card.id)), skipped: [], missing: [] })} />;
  } else if (!hero && !allFilled.length) {
    const reviewable = cards.filter(card => !unsaved.has(card.id) && canReview(card)).map(card => card.id);
    body = <DoneView {...common} progress={progress} cards={cards} reviewIds={reviewable}
      onReview={() => { closing.current = true; removeCaptcha(); onClose(savedTotal); onReview(reviewable); }} />;
  } else {
    body = <Overview {...common} progress={progress} hero={hero} canRead={canReadPageImages} toast={toast} pendingDrafts={pendingDrafts.length}
      onOpenPart={openPart}
      onShowDrafts={() => { setDraftsSeen(true); setScreen({ name: 'review', part: null, ids: allFilled, skipped: [], missing: [] }); }}
      onDiscardDrafts={discardDrafts} error={error}
      listening={{ left: listeningLeft, skipped: skipListening, onToggle: () => {
        setListeningSkipped(owner.current, session.id, !skipListening); setSkipListening(!skipListening);
      } }} />;
  }

  const manualCard = manual && <ManualCard phone={phone} part={manual.part} number={manual.number}
    numbers={partCards(manual.part).filter(card => !recorded(card) || card.questionNumber === manual.number).map(card => card.questionNumber!)}
    form={forms[byNumber.get(manual.number)!.id] ?? EMPTY_FORM} error={error}
    onPick={number => { setError(''); setManual({ part: manual.part, number }); }}
    onUpdate={patch => update(byNumber.get(manual.number)!.id, patch)}
    onSave={() => { if (save([byNumber.get(manual.number)!.id])) setManual(null); }}
    onCancel={() => { setError(''); setManual(null); }} />;

  const editingStaged = editingPhoto
    ? (zones[editingPhoto.zone].find(item => item.id === editingPhoto.id) ?? zones[editingPhoto.zone === 'questions' ? 'passage' : 'questions'].find(item => item.id === editingPhoto.id))
    : undefined;

  if (!cards.length) return null;
  return createPortal(
    <div className={'wd-dim' + (phone ? ' is-phone' : '')}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Gỡ câu sai · ${testName}`} tabIndex={-1} className={'rd wd' + (phone ? ' is-phone' : '')}
        onDragOver={event => { if (screen.name === 'part' && canReadPageImages) event.preventDefault(); }}
        onDrop={event => { if (screen.name !== 'part') return; event.preventDefault(); addFiles([...event.dataTransfer.files]); }}>
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
        {toast && screen.name !== 'overview' && <div className="wd-toast" role="status"><i aria-hidden="true">✓</i>{toast.text}</div>}
        <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
      </div>
    </div>,
    document.body
  );
}
