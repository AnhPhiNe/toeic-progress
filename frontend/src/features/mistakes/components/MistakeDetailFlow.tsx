import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Sparkles, X } from 'lucide-react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { CHOICE_LETTERS, learnerMistake, parsePastedQuestion, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { prepareImage, MAX_CONTEXT_IMAGES } from '@/features/mistakes/lib/imageInput';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration, AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import type { MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { enqueueExplanations, explanationsVersion, isExplaining, setExplanationInterceptor, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';

interface Props {
  /** Cards to fill in, in order. */
  cards: MistakeEntry[];
  onSave: (entry: MistakeEntry, original: MistakeEntry) => void;
  /** The full note form for the current card. */
  onOpenFull: (card: MistakeEntry) => void;
  onClose: (saved: number) => void;
}

type Choice = ChoiceLetter | 'BLANK' | '';
/** What the learner has filled in for one card; `ai` holds what a screenshot reading returned. */
interface CardForm { raw: string; choice: Choice; answer: ChoiceLetter | ''; category: ErrorCategory | ''; ai?: AIMistakeParseResult }
const EMPTY: CardForm = { raw: '', choice: '', answer: '', category: '' };

/** What the explanation request sends for a question read from a screenshot (must match what was read). */
function explainInput(draft: AIMistakeParseResult, part: MistakeEntry['part']): MistakeInput {
  const choice = draft.userChoice || '';
  return { question: draft.question ?? '', options: draft.options, context: draft.context ?? '', part,
    userChoiceState: choice ? 'CHOSEN' : 'UNKNOWN', userChoice: choice, userReason: '',
    sourceAnswer: draft.answerSource === 'PROVIDED' ? optionLetter(draft.correctAnswer) : '' };
}

function fromAI(draft: AIMistakeParseResult): CardForm {
  const answer = draft.answerSource === 'MISSING' ? '' : optionLetter(draft.correctAnswer);
  return { raw: '', choice: draft.userChoiceState === 'CHOSEN' && draft.userChoice ? draft.userChoice : '', answer: answer || '', category: draft.explanation ? draft.category : '', ai: draft };
}

/**
 * Fills in mistake cards that came from a wrong-question list. A card can be filled by hand (paste the question, tap
 * the answers) or from a screenshot: AI reads every wrong question on it, and those cards are checked as tabs and
 * saved together. Test, Part and question number are already on each card.
 */
export function MistakeDetailFlow({ cards, onSave, onOpenFull, onClose }: Props) {
  const [queue, setQueue] = useState(() => cards.map(card => card.id));
  const [currentId, setCurrentId] = useState(cards[0]?.id ?? '');
  const [forms, setForms] = useState<Record<string, CardForm>>({});
  const [batch, setBatch] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Seconds since a screenshot was sent, so a long read does not look frozen.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const [showContext, setShowContext] = useState(false);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const closing = useRef(false);
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const close = (count = saved) => { if (closing.current) return; closing.current = true; removeCaptcha(); onClose(count); };
  const ref = useModalA11y(true, () => close());
  useEffect(() => {
    let cancelled = false;
    // AI is optional here: without it the screen still works by hand, so a failed check stays quiet.
    void aiService.getAIConfiguration().then(value => { if (!cancelled) setConfig(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  // Explanations that arrive for cards not saved yet go into their forms, so saving keeps them.
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => {
    setExplanationInterceptor((cardId, draft) => {
      if (!queueRef.current.includes(cardId)) return false;
      setForms(value => {
        const current = value[cardId];
        if (!current?.ai) return value;
        const answer = current.answer || (draft.answerSource === 'MISSING' ? '' : optionLetter(draft.correctAnswer));
        const pageAnswer = current.ai.answerSource !== 'MISSING';
        return { ...value, [cardId]: { ...current, category: current.category || draft.category, answer,
          ai: { ...current.ai, explanation: draft.explanation, optionNotes: draft.optionNotes, trapTip: draft.trapTip, tags: draft.tags,
            ...(pageAnswer ? {} : { correctAnswer: draft.correctAnswer, answerSource: draft.answerSource }) } } };
      });
      return true;
    });
    return () => setExplanationInterceptor(null);
  }, []);
  const card = byId.get(currentId);
  const form = forms[currentId] ?? EMPTY;
  const parsed = useMemo(() => !form.ai && form.raw.trim() ? parsePastedQuestion(form.raw, card?.part) : null, [form.ai, form.raw, card?.part]);
  if (!card) return null;
  const letters = CHOICE_LETTERS.slice(0, card.part === 2 ? 3 : 4);
  const inBatch = batch !== null && batch.includes(currentId) && batch.length > 1;
  const update = (patch: Partial<CardForm>) => { setForms(value => ({ ...value, [currentId]: { ...(value[currentId] ?? EMPTY), ...patch } })); setError(''); };
  const goTo = (id: string) => { setCurrentId(id); setShowContext(false); setError(''); ref.current?.querySelector('[data-flow-body]')?.scrollTo({ top: 0 }); };

  const buildEntry = (target: MistakeEntry, value: CardForm): MistakeEntry | string => {
    const pasted = !value.ai && value.raw.trim() ? parsePastedQuestion(value.raw, target.part) : null;
    if (pasted?.error) return pasted.error;
    if (value.choice && value.choice === value.answer) return 'Đáp án bạn chọn trùng đáp án đúng.';
    if (!value.ai && !value.choice && !value.answer && !value.category && !pasted) return 'Điền ít nhất một mục, hoặc bấm Bỏ qua.';
    const options = value.ai?.options ?? pasted?.options ?? target.options ?? [];
    const question = value.ai ? value.ai.question ?? '' : pasted?.question ?? target.question ?? '';
    const context = value.ai ? value.ai.context ?? '' : target.context ?? '';
    const chosen = value.choice === 'BLANK' || value.choice === '' ? undefined : value.choice;
    const state = value.choice === 'BLANK' ? 'BLANK' : chosen ? 'CHOSEN' : target.userChoiceState ?? 'UNKNOWN';
    const aiLetter = value.ai && value.ai.answerSource !== 'MISSING' ? optionLetter(value.ai.correctAnswer) : '';
    const answerFields = value.answer
      ? { correctAnswer: options.find(option => option.startsWith(`(${value.answer})`)) ?? `(${value.answer})`,
          ...(value.ai && aiLetter === value.answer ? { answerSource: value.ai.answerSource, answerProvidedBy: value.ai.answerSource === 'PROVIDED' ? 'SOURCE' as const : undefined }
            : { answerSource: 'PROVIDED' as const, answerProvidedBy: value.ai ? 'LEARNER' as const : 'SOURCE' as const }) }
      : value.ai ? { correctAnswer: '', answerSource: 'MISSING' as const } : {};
    return {
      ...target, question, context, questionContext: [question, context].filter(Boolean).join('\n\n'), options,
      userChoice: state === 'CHOSEN' ? chosen ?? target.userChoice : undefined, userChoiceState: state,
      userMistake: learnerMistake({ userChoiceState: state, userChoice: chosen ?? target.userChoice ?? '', userReason: target.userReason ?? '', options }),
      ...answerFields,
      ...(value.ai ? { optionNotes: value.ai.optionNotes, explanation: value.ai.explanation ?? undefined, trapTip: value.ai.trapTip, tags: value.ai.tags } : {}),
      category: value.category || target.category
    };
  };

  /** Save the given cards; on a problem, show that card and save none. */
  const saveCards = (ids: string[]) => {
    const entries: [MistakeEntry, MistakeEntry][] = [];
    for (const id of ids) {
      const target = byId.get(id)!, entry = buildEntry(target, forms[id] ?? EMPTY);
      if (typeof entry === 'string') { goTo(id); setError(entry); return; }
      entries.push([entry, target]);
    }
    try { for (const [entry, target] of entries) onSave(entry, target); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được thẻ.'); return; }
    const done = new Set(ids), count = saved + ids.length;
    const position = queue.indexOf(currentId);
    const rest = queue.filter(id => !done.has(id));
    setSaved(count); setQueue(rest); setBatch(null); setNote('');
    const nextId = queue.slice(position + 1).find(id => !done.has(id)) ?? rest[0];
    if (nextId) goTo(nextId); else close(count);
  };

  const skip = () => {
    if (inBatch) { const rest = batch!.filter(id => id !== currentId); setBatch(rest.length ? rest : null); goTo(rest[0] ?? queue[0]); return; }
    const nextId = queue[queue.indexOf(currentId) + 1];
    if (nextId) goTo(nextId); else close();
  };

  const primary = () => {
    if (!inBatch) { saveCards([currentId]); return; }
    const index = batch!.indexOf(currentId);
    if (index < batch!.length - 1) { goTo(batch![index + 1]); return; }
    saveCards(batch!);
  };

  const readImages = async (files: File[]) => {
    if (busy || !files.length) return;
    if (files.length > MAX_CONTEXT_IMAGES) { setError(`Mỗi lần chọn tối đa ${MAX_CONTEXT_IMAGES} ảnh.`); return; }
    const questions = queue.map(id => byId.get(id)!).filter(item => item.questionNumber !== undefined).map(item => ({ number: item.questionNumber!, part: item.part }));
    setBusy(true); setError(''); setNote('');
    try {
      const images = [];
      for (const file of files) images.push(await prepareImage(file));
      const result = await aiService.extractPageWithAI(questions, images, getToken);
      const found = result.items.map(item => ({ item, id: queue.find(id => byId.get(id)?.questionNumber === item.number) }))
        .filter((entry): entry is { item: typeof entry.item; id: string } => Boolean(entry.id));
      if (!found.length) { setNote('Không thấy câu sai nào của đề này trong ảnh. Chọn ảnh khác hoặc ghi tay.'); return; }
      setForms(value => ({ ...value, ...Object.fromEntries(found.map(({ item, id }) => [id, fromAI(item.draft)])) }));
      const ids = found.map(entry => entry.id);
      setBatch(ids); goTo(ids[0]);
      // The explanations are written while the learner checks these cards; this reading already counted the AI use.
      if (result.explainTicket) enqueueExplanations(result.explainTicket, found
        .filter(({ item, id }) => byId.get(id)!.part !== 1 && item.draft.question?.trim() && item.draft.options.length >= 2)
        .map(({ item, id }) => ({ cardId: id, number: item.number, input: explainInput(item.draft, byId.get(id)!.part) })));
      setNote(`Ảnh có ${ids.length} câu sai của bạn: ${found.map(entry => entry.item.number).join(', ')}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại hoặc ghi tay.');
    } finally { setBusy(false); removeCaptcha(); }
  };

  const letterButton = (letter: ChoiceLetter, on: boolean, tone: 'wrong' | 'right', pick: () => void) => (
    <button key={letter} type="button" aria-pressed={on} onClick={pick}
      className={'h-12 flex-1 cursor-pointer rounded-xl border-2 text-[16px] font-black ' + (on
        ? (tone === 'wrong' ? 'border-slate-900 bg-rose-600 text-white' : 'border-slate-900 bg-emerald-600 text-white') + ' dark:border-slate-200'
        : 'border-stone-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>{letter}</button>
  );
  const position = cards.findIndex(item => item.id === currentId) + 1;
  const batchIndex = inBatch ? batch!.indexOf(currentId) : -1;
  const nextInBatch = inBatch && batchIndex < batch!.length - 1 ? byId.get(batch![batchIndex + 1]) : undefined;
  const tip = form.ai?.explanation?.quickTip?.trim();
  // Shown at the top, where it stays in view while the learner checks the cards.
  const writing = Boolean(batch?.some(id => isExplaining(id)));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 md:items-center md:p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="detail-flow-title" tabIndex={-1}
        onPaste={event => {
          const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
          if (files.length && config?.pageImages) { event.preventDefault(); void readImages(files); }
        }}
        className="flex h-[100dvh] w-full flex-col bg-[#FDFBF7] text-slate-900 dark:bg-[#0B1220] dark:text-white md:h-auto md:max-h-[92vh] md:max-w-lg md:rounded-2xl md:border-2 md:border-slate-900 md:shadow-[4px_4px_0_0_#0f172a]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#111A2C]">
          <div className="min-w-0">
            <h2 id="detail-flow-title" className="text-[17px] font-black">Ghi câu sai · {position}/{cards.length}</h2>
            <p className="truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">
              {card.questionNumber ? `Câu ${card.questionNumber} · ` : ''}Part {card.part}{card.sourceTestName ? ` · ${card.sourceTestName}` : ''}
            </p>
          </div>
          <button type="button" aria-label="Đóng" onClick={() => close()} className="-mr-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 dark:text-slate-400"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <div data-flow-body className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {note && <p role="status" className="flex items-start gap-1.5 text-[13px] font-bold text-violet-700 dark:text-violet-300"><Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{note}{writing && <span className="block font-semibold text-violet-600 dark:text-violet-300/80">Đang viết lời giải…</span>}</span></p>}
          {inBatch && <div role="tablist" aria-label="Câu trong ảnh" className="flex gap-2 overflow-x-auto pb-1">
            {batch!.map(id => {
              const item = byId.get(id)!, value = forms[id] ?? EMPTY, on = id === currentId;
              return <button key={id} type="button" role="tab" aria-selected={on} onClick={() => goTo(id)}
                className={'flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border-2 px-3.5 text-[13.5px] font-black ' + (on
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-white dark:text-slate-950' : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>
                Câu {item.questionNumber}{value.answer ? <Check className="h-3.5 w-3.5" aria-label="đủ đáp án" /> : <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="thiếu đáp án đúng" />}
              </button>;
            })}
          </div>}

          <section>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="detail-question" className="text-[14px] font-black">Câu hỏi {!form.ai && <span className="font-semibold text-slate-400">(không bắt buộc)</span>}</label>
              {form.ai
                ? <button type="button" onClick={() => update({ ai: undefined, raw: '' })} className="min-h-9 cursor-pointer text-[13px] font-bold text-blue-700 dark:text-blue-300">Nhập lại</button>
                : <button type="button" onClick={() => onOpenFull(card)} className="min-h-9 cursor-pointer text-[13px] font-bold text-blue-700 dark:text-blue-300">Form đầy đủ</button>}
            </div>
            {form.ai ? <div className="mt-2 space-y-2">
              {form.ai.context?.trim() && <div className="rounded-xl border-[1.5px] border-stone-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <button type="button" aria-expanded={showContext} onClick={() => setShowContext(value => !value)} className="flex min-h-8 w-full cursor-pointer items-center justify-between gap-2 text-[13px] font-bold">
                  <span className="min-w-0 truncate">Đoạn văn: {form.ai.context.trim().split('\n')[0]}</span><span className="shrink-0 text-blue-700 dark:text-blue-300">{showContext ? 'Ẩn' : 'Xem'}</span>
                </button>
                {showContext && <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{form.ai.context}</p>}
              </div>}
              <div id="detail-question" className="rounded-xl border-[1.5px] border-stone-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <p className="whitespace-pre-line text-[14px] font-bold">{form.ai.question}</p>
                {form.ai.options.length > 0 && <ul className="mt-1.5 space-y-0.5 text-[13px] text-slate-600 dark:text-slate-300">{form.ai.options.map(option => <li key={option}>{option}</li>)}</ul>}
              </div>
            </div> : <>
              {config?.pageImages && <>
                <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}
                  className="mt-2 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-violet-100 text-[14.5px] font-black text-violet-950 disabled:cursor-wait disabled:opacity-60 dark:border-violet-300 dark:bg-violet-950 dark:text-white">
                  <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />{busy ? `Đang đọc ảnh · ${elapsed} giây` : 'Chọn ảnh màn hình đề'}
                </button>
                <p className="mt-1 text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400">{busy ? 'Thường mất khoảng 10 giây' : 'Một ảnh có thể chứa nhiều câu · trên máy tính: Ctrl+V'}</p>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Ảnh màn hình đề"
                  onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void readImages(files); }} />
                <p className="mt-3 text-[12.5px] font-bold text-slate-500 dark:text-slate-400">hoặc dán chữ</p>
              </>}
              <textarea id="detail-question" rows={3} value={form.raw} onChange={event => update({ raw: event.target.value })} placeholder="Dán câu hỏi và 4 phương án"
                className="mt-2 w-full rounded-xl border-[1.5px] border-stone-300 bg-white px-3 py-2.5 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              {parsed && !parsed.error && parsed.options.length > 0 && <p className="mt-1.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-300">✓ Đã tách {parsed.options.length} phương án</p>}
            </>}
          </section>

          <section role="group" aria-labelledby="detail-choice">
            <p id="detail-choice" className="flex items-center gap-2 text-[14px] font-black"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white" aria-hidden="true"><X className="h-3 w-3" strokeWidth={3.5} /></span>Bạn chọn</p>
            <div className="mt-2 flex gap-2">{letters.map(letter => letterButton(letter, form.choice === letter, 'wrong', () => update({ choice: form.choice === letter ? '' : letter })))}</div>
            <button type="button" aria-pressed={form.choice === 'BLANK'} onClick={() => update({ choice: form.choice === 'BLANK' ? '' : 'BLANK' })}
              className={'mt-1.5 min-h-9 cursor-pointer text-[13px] font-bold ' + (form.choice === 'BLANK' ? 'text-rose-700 underline dark:text-rose-300' : 'text-slate-500 dark:text-slate-400')}>Mình bỏ trống câu này</button>
          </section>

          <section role="group" aria-labelledby="detail-answer">
            <p id="detail-answer" className="flex items-center gap-2 text-[14px] font-black"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden="true"><Check className="h-3 w-3" strokeWidth={3.5} /></span>Đáp án đúng
              {form.ai && form.answer && form.ai.answerSource !== 'MISSING' && optionLetter(form.ai.correctAnswer) === form.answer && <span className="text-[12px] font-bold text-violet-700 dark:text-violet-300">{form.ai.answerSource === 'PROVIDED' ? 'theo đề' : 'AI đề xuất'}</span>}</p>
            <div className="mt-2 flex gap-2">{letters.map(letter => letterButton(letter, form.answer === letter, 'right', () => update({ answer: form.answer === letter ? '' : letter })))}</div>
          </section>

          <section role="group" aria-labelledby="detail-category">
            <p id="detail-category" className="text-[14px] font-black">Vì sao sai</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_CHOICES) as ErrorCategory[]).map(value => (
                <button key={value} type="button" aria-pressed={form.category === value} onClick={() => update({ category: form.category === value ? '' : value })}
                  className={'min-h-10 cursor-pointer rounded-full border-2 px-3.5 text-[13.5px] font-bold ' + (form.category === value
                    ? 'border-slate-900 bg-violet-100 text-violet-950 dark:border-violet-300 dark:bg-violet-950 dark:text-white'
                    : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{CATEGORY_CHOICES[value]}</button>
              ))}
            </div>
          </section>
          {tip && <p className="rounded-xl border-[1.5px] border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"><b>Mẹo: </b>{tip}</p>}
          {error && <p role="alert" className="text-[13.5px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
          <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-stone-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-[#111A2C]">
          <button type="button" onClick={skip} className="min-h-12 w-[32%] cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[15px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">{inBatch ? 'Bỏ câu này' : 'Bỏ qua'}</button>
          <button type="button" onClick={primary} disabled={busy} className="min-h-12 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-emerald-400 text-[15px] font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] disabled:opacity-50 dark:border-slate-200 dark:shadow-none">
            {inBatch ? nextInBatch ? `Tiếp: Câu ${nextInBatch.questionNumber} ›` : `Lưu ${batch!.length} câu` : queue.indexOf(currentId) === queue.length - 1 ? 'Lưu' : 'Lưu · câu tiếp ›'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
