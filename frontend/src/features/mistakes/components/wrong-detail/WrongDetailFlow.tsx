import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { partOfQuestion, type PartNumber } from '@/shared/domain/questionNumbers';
import { generateUUID } from '@/shared/domain/uuid';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration } from '@/features/mistakes/services/aiMistakeExtractor';
import { enqueueExplanations, explanationsVersion, isExplaining, setExplanationInterceptor, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';
import { buildDetailEntry, canExplainRead, detailExplanationInput, editDetailForm, EMPTY_FORM, explainInput, isEmptyForm, savedDetailForm, withArrivedExplanation, withReadResult, type CardForm } from '@/features/mistakes/lib/detailForm';
import { sameExplanationInput } from '@/features/mistakes/lib/explanationMerge';
import { buildDetailDraft, detailDraftScope, restoreDetailDraft, validateDetailDraft } from '@/features/mistakes/lib/detailDraft';
import { canReview } from '@/features/mistakes/lib/spacedRepetition';
import { compressFiles } from '@/features/mistakes/lib/imageCompress';
import type { PreparedImage } from '@/features/mistakes/lib/imageInput';
import { flowCards, groupNumbers, heroPart, isRecorded, partMode, partProgress, planGroupRequests, planSingleRequests, suggestGroups, type RequestPlan } from '@/features/mistakes/lib/wrongDetail';
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
  | { name: 'review'; part: PartNumber | null; ids: string[]; skipped: number[]; missing: number[]; group?: number };
export interface ReadingState { done: number; total: number }

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
  const [zones, setZones] = useState<Record<Zone, Staged[]>>({ passage: [], questions: [] });
  const [activeZone, setActiveZone] = useState<Zone | null>(null);
  const [reading, setReading] = useState<ReadingState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [manual, setManual] = useState<{ part: PartNumber; number: number } | null>(null);
  const [openRow, setOpenRow] = useState('');
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [savedTotal, setSavedTotal] = useState(0);
  const [draftsSeen, setDraftsSeen] = useState(false);
  const closing = useRef(false);
  const running = useRef(false);
  const owner = useRef(getActiveAccountId());
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const canReadPageImages = phone ? Boolean(config?.pageImages) : config?.pageImages !== false;

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
    void aiService.getAIConfiguration().then(value => { if (!cancelled) setConfig(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!reading) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [reading]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  // Thumbnails hold object URLs; release them with the zones.
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  useEffect(() => () => { for (const list of Object.values(zonesRef.current)) list.forEach(item => URL.revokeObjectURL(item.url)); }, []);

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  useEffect(() => {
    setExplanationInterceptor((cardId, arrivedDraft, originalInput) => {
      if (!activeFlow() || !byId.has(cardId)) return false;
      const current = formsRef.current[cardId], card = byId.get(cardId)!;
      // Only take a matching, usable result; otherwise the queue keeps its own fallback.
      const effective = current && detailExplanationInput(current, card.part);
      if (!current?.ai || current.ai.explanation || current.ai.trapTip?.trim() || !effective || !sameExplanationInput(effective, originalInput)) return false;
      const arrived = withArrivedExplanation(current, arrivedDraft);
      const candidate = buildDetailEntry(card, arrived);
      if (typeof candidate === 'string') { setError(candidate); return false; }
      dirtyIds.current.add(cardId);
      const next = { ...formsRef.current, [cardId]: arrived };
      formsRef.current = next; setForms(next);
      return true;
    });
    return () => setExplanationInterceptor(null);
  }, [byId, activeFlow]);

  const update = (id: string, patch: Partial<CardForm>) => {
    dirtyIds.current.add(id);
    const next = { ...formsRef.current, [id]: editDetailForm(formsRef.current[id] ?? EMPTY_FORM, patch) };
    formsRef.current = next; setForms(next); setError('');
  };

  const clearZones = () => {
    for (const list of Object.values(zonesRef.current)) list.forEach(item => URL.revokeObjectURL(item.url));
    setZones({ passage: [], questions: [] }); setActiveZone(null);
  };

  const close = () => {
    if (closing.current) return;
    if (running.current && !window.confirm('Sóc đang đọc ảnh. Đóng thì các ảnh còn lại không được đọc. Vẫn đóng?')) return;
    const persisted = draft.persist();
    const unsavedCount = filledIds(cards.map(card => card.id)).length;
    if (!persisted && unsavedCount && !window.confirm(`Chưa tự lưu được nháp. Đóng và bỏ ${unsavedCount} câu đã điền?`)) return;
    closing.current = true; removeCaptcha(); onClose(savedTotal);
  };
  const ref = useModalA11y(true, () => { if (manual) setManual(null); else close(); });

  const progress = partProgress(cards, unsaved);
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
    if (part >= 6) {
      const groups = suggestGroups(part as 6 | 7, partCards(part).map(card => card.questionNumber!));
      const next = groups.find(group => group.wrong.some(number => !recorded(byNumber.get(number)!))) ?? groups[0];
      setGroupFrom(next?.from ?? null);
    }
    setScreen({ name: 'part', part });
  };

  const addFiles = (files: File[], zone?: Zone) => {
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return; }
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length || screen.name !== 'part' || partMode(screen.part) === 'reason' || !canReadPageImages || running.current) return;
    const target: Zone = screen.part >= 6 ? zone ?? activeZone ?? (zonesRef.current.passage.length ? 'questions' : 'passage') : 'questions';
    const staged = images.map(file => ({ id: generateUUID(), file, url: URL.createObjectURL(file) }));
    setZones(current => ({ ...current, [target]: [...current[target], ...staged] }));
    setActiveZone(target); setError('');
  };
  const removeStaged = (zone: Zone, id: string) => setZones(current => {
    current[zone].filter(item => item.id === id).forEach(item => URL.revokeObjectURL(item.url));
    return { ...current, [zone]: current[zone].filter(item => item.id !== id) };
  });
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

  /** Reads the staged screenshots: one batch (one AI use), passage and questions of a group in the same request. */
  const send = async () => {
    if (screen.name !== 'part' || running.current) return;
    const part = screen.part;
    if (!activeFlow()) { setError('Tài khoản đã thay đổi. Đóng và mở lại để tiếp tục.'); return; }
    if (cards.some(card => card.sessionId !== session.id)) { setError('Danh sách có câu thuộc nhiều lượt làm. Đóng và mở riêng từng lượt trong Sổ tay.'); return; }
    const group = part >= 6 ? suggestGroups(part as 6 | 7, partCards(part).map(card => card.questionNumber!)).find(item => item.from === groupFrom) : undefined;
    if (part >= 6 && !group) return;
    const wrong = group ? group.wrong : partCards(part).map(card => card.questionNumber!);
    const open = wrong.filter(number => !recorded(byNumber.get(number)!));
    const wanted = open.length ? open : wrong;
    const passage = zonesRef.current.passage.map(item => item.file), questions = zonesRef.current.questions.map(item => item.file);
    if (!passage.length && !questions.length) return;
    running.current = true;
    setError(''); setNote(''); setReading({ done: 0, total: 0 });
    const readIds: string[] = [], skipped = new Set<number>(), seen = new Set<number>();
    let plan: RequestPlan<PreparedImage> = { requests: [], split: false };
    try {
      if (group) {
        const packed = await compressFiles([...passage, ...questions]);
        if (!activeFlow()) return;
        plan = planGroupRequests(packed.images.slice(0, passage.length), packed.images.slice(passage.length), groupNumbers(group),
          { contextSupported: Boolean(config?.pageContextImages) });
      } else {
        const images: PreparedImage[] = [];
        for (const file of questions) {
          images.push((await compressFiles([file])).images[0]);
          if (!activeFlow()) return;
        }
        plan = planSingleRequests(images, wanted);
      }
      if (plan.error) { setError(plan.error); return; }
      if (plan.split) setNote(SPLIT_NOTE);
      setReading({ done: 0, total: plan.requests.length });
      const batchId = generateUUID();
      for (const request of plan.requests) {
        if (!activeFlow()) return;
        const result = await aiService.extractPageWithAI(request.questions.map(number => ({ number, part: partOfQuestion(number)! })), request.images, getToken,
          owner.current, activeFlow, batchId, request.contextImages);
        if (!activeFlow()) return;
        const next = { ...formsRef.current };
        const matches: { item: (typeof result.items)[number]; card: MistakeEntry }[] = [];
        for (const item of result.items) {
          if (seen.has(item.number)) continue;
          seen.add(item.number);
          const card = byNumber.get(item.number);
          // Only the wrong list is kept; a recorded question keeps what was saved.
          if (!card) { skipped.add(item.number); continue; }
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
        setReading(value => value && { ...value, done: value.done + 1 });
      }
    } catch (reason) {
      // Later requests wait for the learner instead of spending more on a failing capture.
      setError(reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại hoặc ghi tay.');
    } finally {
      running.current = false;
      removeCaptcha();
      if (activeFlow()) setReading(null);
    }
    if (!activeFlow()) return;
    const missing = wanted.filter(number => !readIds.includes(byNumber.get(number)!.id));
    if (!readIds.length) {
      setError(current => current || (plan.requests.length ? 'Sóc chưa thấy câu nào bạn sai trong ảnh. Thêm ảnh rõ hơn hoặc ghi tay.' : ''));
      return;
    }
    clearZones();
    readIds.sort((a, b) => byId.get(a)!.questionNumber! - byId.get(b)!.questionNumber!);
    setScreen({ name: 'review', part, ids: readIds, skipped: [...skipped].filter(number => !byNumber.has(number)).sort((a, b) => a - b), missing, group: group?.from });
  };

  const discardDrafts = () => {
    if (!window.confirm('Bỏ nháp chưa lưu của các câu này? Dữ liệu đã lưu trong Sổ tay vẫn được giữ.')) return;
    const next = { ...formsRef.current };
    for (const id of dirtyIds.current) { const card = byId.get(id); if (card) next[id] = savedDetailForm(card); }
    dirtyIds.current.clear(); draft.clear();
    formsRef.current = next; setForms(next); setDraftsSeen(true);
    setToast({ id: Date.now(), text: 'Đã bỏ nháp chưa lưu' });
  };

  const total = cards.length, doneCount = progress.reduce((sum, entry) => sum + entry.done, 0);
  const hero = heroPart(progress);
  const testName = session.testName || 'Đề chưa đặt tên';
  const draftState = draft.state === 'unavailable' ? 'Chưa tự lưu được nháp trên trình duyệt. Hãy lưu câu trước khi đóng.'
    : draft.state === 'restored' ? 'Đã khôi phục nháp trên máy này.' : 'Đã tự lưu nháp trên máy này.';
  const pendingDrafts = draftsSeen ? [] : allFilled;
  const common = { phone, testName, total, doneCount, onClose: close };

  let body;
  if (screen.name === 'review') {
    const ids = screen.ids.filter(id => byId.has(id));
    body = <ReviewView {...common} screen={{ ...screen, ids }} cards={byId} forms={forms} openRow={openRow} setOpenRow={setOpenRow}
      writing={ids.filter(id => isExplaining(id)).length} saveCount={filledIds(ids).length} error={error} note={note}
      wrongTotal={screen.part ? partCards(screen.part).length : total}
      onUpdate={update} canAddImages={canReadPageImages && screen.part !== null}
      onBack={() => { setError(''); setScreen(screen.part ? { name: 'part', part: screen.part } : { name: 'overview' }); if (screen.group) setGroupFrom(screen.group); }}
      onSave={() => { if (save(ids)) setScreen({ name: 'overview' }); }} />;
  } else if (screen.name === 'part') {
    const part = screen.part;
    body = <PartView {...common} part={part} cards={partCards(part)} recorded={recorded} forms={forms} dirty={dirtyIds.current}
      groupFrom={groupFrom} setGroupFrom={from => { if (from !== groupFrom) { clearZones(); setError(''); } setGroupFrom(from); }}
      zones={zones} activeZone={activeZone} setActiveZone={setActiveZone} onAddFiles={addFiles} onRemove={removeStaged}
      reading={reading} elapsed={elapsed} error={error} note={note} draftState={draftState} canRead={canReadPageImages}
      onSend={() => void send()} onBack={() => { if (!running.current) { clearZones(); setError(''); setNote(''); setScreen({ name: 'overview' }); } }}
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
      onDiscardDrafts={discardDrafts} error={error} />;
  }

  const manualCard = manual && <ManualCard phone={phone} part={manual.part} number={manual.number}
    numbers={partCards(manual.part).filter(card => !recorded(card) || card.questionNumber === manual.number).map(card => card.questionNumber!)}
    form={forms[byNumber.get(manual.number)!.id] ?? EMPTY_FORM} error={error}
    onPick={number => { setError(''); setManual({ part: manual.part, number }); }}
    onUpdate={patch => update(byNumber.get(manual.number)!.id, patch)}
    onSave={() => { if (save([byNumber.get(manual.number)!.id])) setManual(null); }}
    onCancel={() => { setError(''); setManual(null); }} />;

  if (!cards.length) return null;
  return createPortal(
    <div className={'wd-dim' + (phone ? ' is-phone' : '')}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Gỡ câu sai · ${testName}`} tabIndex={-1} className={'rd wd' + (phone ? ' is-phone' : '')}
        onDragOver={event => { if (screen.name === 'part' && canReadPageImages) event.preventDefault(); }}
        onDrop={event => { if (screen.name !== 'part') return; event.preventDefault(); addFiles([...event.dataTransfer.files]); }}>
        {body}
        {manualCard}
        {toast && screen.name !== 'overview' && <div className="wd-toast" role="status"><i aria-hidden="true">✓</i>{toast.text}</div>}
        <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
      </div>
    </div>,
    document.body
  );
}
