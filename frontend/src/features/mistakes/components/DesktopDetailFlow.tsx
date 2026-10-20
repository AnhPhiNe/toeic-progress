import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ImagePlus, X } from 'lucide-react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { CHOICE_LETTERS, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { prepareImage, MAX_CONTEXT_IMAGES } from '@/features/mistakes/lib/imageInput';
import { buildDetailEntry, canExplainRead, EMPTY_FORM, explainInput, fromAI, isEmptyForm, withArrivedExplanation, type CardForm } from '@/features/mistakes/lib/detailForm';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration } from '@/features/mistakes/services/aiMistakeExtractor';
import { enqueueExplanations, explanationsVersion, isExplaining, setExplanationInterceptor, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';

interface Props {
  cards: MistakeEntry[];
  onSave: (entry: MistakeEntry, original: MistakeEntry) => void;
  onOpenFull: (card: MistakeEntry) => void;
  onClose: (saved: number) => void;
}

type Section = 'L' | 'R';
const PART_NAMES: Record<MistakeEntry['part'], string> = { 1: 'Tranh', 2: 'Hỏi – đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn văn', 7: 'Đọc hiểu' };
/** Short labels for the list; the full names are in the menu's tooltip and on the saved card. Keys 1–6 follow this order. */
const SHORT: Record<ErrorCategory, string> = { VOCABULARY_TRAP: 'Từ vựng', ADVANCED_GRAMMAR: 'Ngữ pháp', LISTENING_SPEED: 'Nghe', TIME_PRESSURE: 'Hết giờ', CARELESS_DISTRACTION: 'Ẩu', OTHER: 'Khác' };
const CATEGORIES = Object.keys(CATEGORY_CHOICES) as ErrorCategory[];
const sectionOf = (part: number): Section => part <= 4 ? 'L' : 'R';
/** Part 1–2 have no printed question to photograph; only the reason is asked. */
const readable = (part: number) => part >= 3;

/** Groups a Part's questions by the passage they belong to (Part 6 sets are fixed; Part 7 by the text read). */
function passageGroups(cards: MistakeEntry[], forms: Record<string, CardForm>): MistakeEntry[][] {
  const groups = new Map<string, MistakeEntry[]>();
  for (const card of cards) {
    const n = card.questionNumber ?? 0;
    const key = card.part === 6 ? `set${Math.floor((n - 131) / 4)}`
      : card.part === 7 ? forms[card.id]?.ai?.context?.trim().slice(0, 120) || `q${n}` : 'all';
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.values()];
}

/**
 * Computers: a logged test's wrong questions in one list, split into Listening and Reading and then by Part.
 * Screenshots of the test (as many as the learner has) are read in turns of up to three images; each row then
 * shows what was chosen, the right answer and a suggested reason, and one button saves every filled-in row.
 */
export function DesktopDetailFlow({ cards, onSave, onOpenFull, onClose }: Props) {
  const ordered = useMemo(() => [...cards].sort((a, b) => (a.questionNumber ?? 999) - (b.questionNumber ?? 999)), [cards]);
  const byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  const [forms, setForms] = useState<Record<string, CardForm>>({});
  const formsRef = useRef(forms);
  formsRef.current = forms;
  const [section, setSection] = useState<Section>(() => ordered.some(card => card.part >= 5) ? 'R' : 'L');
  const [openId, setOpenId] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pending = useRef<File[][]>([]);
  const running = useRef(false);
  const closing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const filled = ordered.filter(card => !isEmptyForm(forms[card.id] ?? EMPTY_FORM));
  const reading = progress !== null;

  const close = (count = 0) => {
    if (closing.current) return;
    if (!count && filled.length && !window.confirm(`Đóng mà không lưu ${filled.length} câu đã điền?`)) return;
    closing.current = true; pending.current = []; removeCaptcha(); onClose(count);
  };
  const ref = useModalA11y(true, () => close());

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

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  useEffect(() => {
    setExplanationInterceptor((cardId, draft) => {
      if (closing.current || !byId.has(cardId)) return false;
      setForms(value => value[cardId]?.ai ? { ...value, [cardId]: withArrivedExplanation(value[cardId], draft) } : value);
      return true;
    });
    return () => setExplanationInterceptor(null);
  }, [byId]);

  const update = (id: string, patch: Partial<CardForm>) => { setForms(value => ({ ...value, [id]: { ...(value[id] ?? EMPTY_FORM), ...patch } })); setError(''); };

  /** Reads queued screenshots one turn at a time; each turn asks only for questions not read yet. */
  const drain = async () => {
    if (running.current) return;
    running.current = true;
    let found = 0;
    try {
      while (pending.current.length && !closing.current) {
        const chunk = pending.current.shift()!;
        const questions = ordered.filter(card => readable(card.part) && card.questionNumber !== undefined && !formsRef.current[card.id]?.ai)
          .map(card => ({ number: card.questionNumber!, part: card.part }));
        if (!questions.length) { pending.current = []; break; }
        try {
          const images = [];
          for (const file of chunk) images.push(await prepareImage(file));
          const result = await aiService.extractPageWithAI(questions, images, getToken);
          if (closing.current) return;
          const matches = result.items.map(item => ({ item, card: ordered.find(card => card.questionNumber === item.number && !formsRef.current[card.id]?.ai) }))
            .filter((entry): entry is { item: typeof entry.item; card: MistakeEntry } => Boolean(entry.card));
          found += matches.length;
          setForms(value => {
            const next = { ...value };
            for (const { item, card } of matches) next[card.id] = { ...fromAI(item.draft), category: value[card.id]?.category || fromAI(item.draft).category };
            formsRef.current = next;
            return next;
          });
          if (result.explainTicket) enqueueExplanations(result.explainTicket, matches.filter(({ item, card }) => canExplainRead(item.draft, card.part))
            .map(({ item, card }) => ({ cardId: card.id, number: item.number, input: explainInput(item.draft, card.part) })));
        } catch (reason) {
          // Later screenshots wait for the learner instead of spending more uses on a failing request.
          pending.current = [];
          setError(reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại hoặc ghi tay.');
        } finally {
          removeCaptcha();
          setProgress(value => value && { ...value, done: value.done + chunk.length });
        }
      }
    } finally {
      running.current = false;
      if (!closing.current) {
        setProgress(null);
        setNote(found ? `AI đã điền ${found} câu. Kiểm tra lý do rồi bấm Lưu.` : 'Không thấy câu sai nào của đề này trong ảnh.');
      }
    }
  };

  const addImages = (files: File[]) => {
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length || !config?.pageImages) return;
    for (let index = 0; index < images.length; index += MAX_CONTEXT_IMAGES) pending.current.push(images.slice(index, index + MAX_CONTEXT_IMAGES));
    setProgress(value => ({ done: value?.done ?? 0, total: (value?.total ?? 0) + images.length }));
    setError(''); setNote('');
    void drain();
  };

  // Ctrl+V anywhere while the list is open adds screenshots to the queue.
  const addRef = useRef(addImages);
  addRef.current = addImages;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); addRef.current(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const save = () => {
    const entries: [MistakeEntry, MistakeEntry][] = [];
    for (const card of filled) {
      const entry = buildDetailEntry(card, forms[card.id]);
      if (typeof entry === 'string') { setSection(sectionOf(card.part)); setOpenId(card.id); setError(`Câu ${card.questionNumber}: ${entry}`); return; }
      entries.push([entry, card]);
    }
    try { for (const [entry, card] of entries) onSave(entry, card); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được thẻ.'); return; }
    close(entries.length);
  };

  const needsCheck = (card: MistakeEntry) => Boolean(forms[card.id]?.ai) && !forms[card.id]!.answer;
  const done = (card: MistakeEntry) => { const value = forms[card.id] ?? EMPTY_FORM; return Boolean(value.category) && !needsCheck(card); };
  const inSection = (key: Section) => ordered.filter(card => sectionOf(card.part) === key);
  const anyRead = Object.values(forms).some(value => value.ai);

  const moveFocus = (from: HTMLElement, step: number) => {
    const rows = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[data-row-toggle]') ?? [])];
    rows[rows.indexOf(from as HTMLButtonElement) + step]?.focus();
  };

  const row = (card: MistakeEntry) => {
    const value = forms[card.id] ?? EMPTY_FORM, open = openId === card.id, letters = CHOICE_LETTERS.slice(0, card.part === 2 ? 3 : 4);
    const chosen = value.choice && value.choice !== 'BLANK' ? value.choice : '';
    const marks = chosen || value.answer;
    return (
      <div key={card.id} className="border-t border-stone-100 first:border-t-0 dark:border-slate-800">
        <div className={'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 pr-3 ' + (open ? 'bg-indigo-50 dark:bg-indigo-950/40' : needsCheck(card) ? 'bg-amber-50 dark:bg-amber-950/30' : 'hover:bg-stone-50 dark:hover:bg-slate-900/60')}>
          <button type="button" data-row-toggle aria-expanded={open} onClick={() => setOpenId(open ? '' : card.id)}
            aria-label={`Câu ${card.questionNumber}${marks ? ` ${sheetLabel(chosen, value.answer)}` : ''}`}
            onKeyDown={event => {
              const digit = Number(event.key);
              if (digit >= 1 && digit <= CATEGORIES.length) { event.preventDefault(); update(card.id, { category: CATEGORIES[digit - 1] }); }
              else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1); }
            }}
            className="flex h-11 min-w-0 cursor-pointer items-center gap-3 pl-4 text-left">
            <span className="w-[72px] shrink-0 text-[14px] font-black">Câu {card.questionNumber}</span>
            {/* One line of the question first, so the learner recognises it; then what was chosen and what was right. */}
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-600 dark:text-slate-300">{value.ai?.question?.trim().split('\n')[0] ?? ''}</span>
            <span className="w-[128px] shrink-0">{marks && <AnswerSheet letters={letters} chosen={chosen} answer={value.answer} />}</span>
          </button>
          {/* The pill shows the short name; the native menu underneath lists the keys 1–6 with each reason. */}
          <label className={'relative inline-flex h-[30px] cursor-pointer items-center gap-1 justify-self-start rounded-full pl-3 pr-2 text-[13px] font-bold focus-within:ring-2 focus-within:ring-indigo-500 ' + (value.category
            ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' : 'border-[1.5px] border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900')}>
            <span aria-hidden="true">{value.category ? SHORT[value.category] : 'Vì sao sai?'}</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <select aria-label={`Vì sao sai câu ${card.questionNumber}`} value={value.category} onChange={event => update(card.id, { category: event.target.value as ErrorCategory | '' })}
              className="absolute inset-0 cursor-pointer opacity-0">
              <option value="">Vì sao sai?</option>
              {CATEGORIES.map((category, index) => <option key={category} value={category}>{index + 1} · {CATEGORY_CHOICES[category]}</option>)}
            </select>
          </label>
          <span className="flex w-8 items-center justify-center">
            {isExplaining(card.id)
              ? <span role="img" aria-label="Đang viết lời giải" className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              : <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setOpenId(open ? '' : card.id)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white">
                  <ChevronDown className={'h-4 w-4 transition-transform ' + (open ? 'rotate-180' : '')} />
                </button>}
          </span>
        </div>
        {open && <RowDetail card={card} value={value} letters={letters} onChange={patch => update(card.id, patch)} onOpenFull={() => onOpenFull(card)} />}
      </div>
    );
  };

  const partBlock = (part: MistakeEntry['part'], items: MistakeEntry[]) => {
    const check = items.filter(needsCheck).length, complete = items.every(done);
    const listening = part <= 4;
    return (
      <section key={part} aria-label={`Part ${part}`} className="overflow-hidden rounded-2xl border-[1.5px] border-stone-200 bg-white dark:border-slate-700 dark:bg-[#111A2C]">
        <header className="flex items-center gap-2.5 border-b border-stone-100 bg-[#FAF8F4] px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <span className={'flex h-6 items-center rounded-[7px] px-2 text-[12px] font-black text-white ' + (listening ? 'bg-indigo-600' : 'bg-teal-600')}>P{part}</span>
          <h3 className="text-[14px] font-black">{PART_NAMES[part]}</h3>
          <span className="flex h-5 min-w-[22px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[12px] font-black text-rose-700 dark:bg-rose-950 dark:text-rose-300" aria-label={`${items.length} câu sai`}>{items.length}</span>
          {check > 0 ? <span className="ml-auto text-[12.5px] font-black text-amber-700 dark:text-amber-300">● {check} cần xem</span>
            : complete ? <Check className="ml-auto h-4 w-4 text-emerald-600" aria-label="Đã điền đủ" /> : null}
        </header>
        {part >= 6
          ? passageGroups(items, forms).map(group => (
              <div key={group[0].id}>
                {(group.length > 1 || part === 6) && <p className="border-t border-stone-100 px-4 pb-0.5 pt-2 text-[12px] font-bold text-slate-400 first:border-t-0 dark:border-slate-800">
                  {part === 6 ? `${131 + Math.floor(((group[0].questionNumber ?? 131) - 131) / 4) * 4}–${134 + Math.floor(((group[0].questionNumber ?? 131) - 131) / 4) * 4}` : `${group[0].questionNumber}–${group[group.length - 1].questionNumber}`}
                </p>}
                {group.map(row)}
              </div>
            ))
          : items.map(row)}
        {readable(part) && listening && config?.pageImages && <button type="button" onClick={() => fileInput.current?.click()}
          className="w-full cursor-pointer border-t border-stone-100 px-4 py-2 text-left text-[12.5px] font-bold text-blue-700 dark:border-slate-800 dark:text-blue-300">+ Dán ảnh transcript</button>}
      </section>
    );
  };

  const tabs: Array<[Section, string]> = [['L', 'Listening'], ['R', 'Reading']];
  const parts = [...new Set(inSection(section).map(card => card.part))].sort();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="desktop-detail-title" tabIndex={-1}
        onDragOver={event => { if (config?.pageImages) event.preventDefault(); }}
        onDrop={event => { event.preventDefault(); addImages([...event.dataTransfer.files]); }}
        className="flex h-[92vh] w-full max-w-[900px] flex-col overflow-hidden rounded-[22px] border-2 border-slate-900 bg-[#FDFBF7] text-slate-900 shadow-[4px_4px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#0B1220] dark:text-white dark:shadow-none">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-[#111A2C]">
          <h2 id="desktop-detail-title" className="truncate text-[18px] font-black">Ghi câu sai{ordered[0]?.sourceTestName ? ` · ${ordered[0].sourceTestName}` : ''}</h2>
          <button type="button" aria-label="Đóng" onClick={() => close()} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        {tabs.filter(([key]) => inSection(key).length).length > 1 && <div role="tablist" aria-label="Phần thi" className="flex shrink-0 gap-2 px-6 pt-4">
          {tabs.map(([key, label]) => {
            const items = inSection(key), on = section === key, alert = items.some(needsCheck);
            if (!items.length) return null;
            return (
              <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setSection(key)}
                className={'flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl text-[15px] font-black ' + (on
                  ? key === 'L' ? 'bg-indigo-50 text-indigo-800 ring-2 ring-inset ring-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-200' : 'bg-emerald-50 text-teal-800 ring-2 ring-inset ring-teal-600 dark:bg-teal-950/50 dark:text-teal-200'
                  : 'bg-stone-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400')}>
                {label}<span className="text-[12.5px] font-bold">{items.length}</span>
                {alert && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="có câu cần xem" />}
              </button>
            );
          })}
        </div>}

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-6 py-4">
          {config?.pageImages && !anyRead && !reading && (
            <div className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-4 dark:border-slate-600 dark:bg-slate-900">
              <ImagePlus className="h-7 w-7 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-black">Thả hoặc dán ảnh màn hình đề <kbd className="ml-1 rounded-md border border-b-[3px] border-slate-300 px-1.5 text-[12px] font-black text-slate-600 dark:border-slate-600 dark:text-slate-300">Ctrl+V</kbd></p>
                <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Chọn hết ảnh của đề một lần; AI điền sẵn từng câu.</p>
              </div>
              <button type="button" onClick={() => fileInput.current?.click()} className="min-h-10 shrink-0 cursor-pointer rounded-xl border-2 border-slate-900 bg-white px-4 text-[14px] font-black dark:border-slate-200 dark:bg-slate-900">Chọn ảnh…</button>
            </div>
          )}
          {parts.map(part => partBlock(part, inSection(section).filter(card => card.part === part)))}
          <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-stone-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-[#111A2C]">
          <div className="min-w-0 flex-1 text-[13px] font-bold">
            {error ? <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>
              : reading ? <p role="status" className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden="true" />Đang đọc ảnh {Math.min(progress.done + 1, progress.total)}/{progress.total} · {elapsed} giây</p>
              : note ? <p role="status" className="text-slate-500 dark:text-slate-400">{note}</p> : null}
          </div>
          {config?.pageImages && <button type="button" onClick={() => fileInput.current?.click()} className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-stone-100 px-4 text-[14px] font-black text-slate-700 hover:bg-stone-200 dark:bg-slate-800 dark:text-slate-200">+ Thêm ảnh</button>}
          <button type="button" onClick={save} disabled={!filled.length || reading}
            className="min-h-11 shrink-0 cursor-pointer rounded-xl border-2 border-slate-900 bg-emerald-400 px-5 text-[14.5px] font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-200 dark:shadow-none">
            {filled.length ? `Lưu ${filled.length} câu` : 'Lưu'}
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Ảnh màn hình đề"
            onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; addImages(files); }} />
        </footer>
      </div>
    </div>,
    document.body
  );
}

/** Like an answer sheet: the learner's choice in red, the right answer in green with a ✓ (readable without colour). */
const sheetLabel = (chosen: string, answer: string) => [chosen && `Bạn chọn ${chosen}`, answer ? `đáp án ${answer}` : 'chưa có đáp án'].filter(Boolean).join(', ');

function AnswerSheet({ letters, chosen, answer }: { letters: readonly ChoiceLetter[]; chosen: string; answer: string }) {
  return (
    <span className="flex gap-[5px]" role="img" aria-label={sheetLabel(chosen, answer)}>
      {letters.map(letter => {
        const wrong = letter === chosen, right = letter === answer;
        return (
          <span key={letter} className={'relative flex h-7 w-7 items-center justify-center rounded-lg border-[1.5px] text-[12.5px] font-black ' + (right
            ? 'border-emerald-600 bg-emerald-600 text-white' : wrong ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500')}>
            {letter}
            {right && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] font-black text-emerald-600 ring-[1.5px] ring-emerald-600 dark:bg-slate-900">✓</span>}
          </span>
        );
      })}
    </span>
  );
}

/** The opened row: the question as read, the answer pickers, and the explanation once written. */
function RowDetail({ card, value, letters, onChange, onOpenFull }: {
  card: MistakeEntry; value: CardForm; letters: readonly ChoiceLetter[]; onChange: (patch: Partial<CardForm>) => void; onOpenFull: () => void;
}) {
  const [showPassage, setShowPassage] = useState(false);
  const ai = value.ai;
  const chosen = value.choice && value.choice !== 'BLANK' ? value.choice : '';
  const picker = (label: string, current: string, tone: 'wrong' | 'right', set: (letter: ChoiceLetter | '') => void) => (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="w-[68px] text-[12.5px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
      {letters.map(letter => (
        <button key={letter} type="button" aria-pressed={current === letter} onClick={() => set(current === letter ? '' : letter)}
          className={'h-8 w-8 cursor-pointer rounded-lg border-[1.5px] text-[13px] font-black ' + (current === letter
            ? tone === 'wrong' ? 'border-rose-600 bg-rose-600 text-white' : 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>{letter}</button>
      ))}
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-5 border-t border-indigo-100 bg-[#F8FAFF] px-4 pb-4 pt-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="min-w-0 space-y-2.5">
        {ai?.context?.trim() && card.part >= 6 && (
          <div className="rounded-xl border-[1.5px] border-stone-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <button type="button" aria-expanded={showPassage} onClick={() => setShowPassage(open => !open)} className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-[13px] font-bold">
              <span className="min-w-0 truncate">Đoạn văn: {ai.context.trim().split('\n')[0]}</span><ChevronDown className={'h-4 w-4 shrink-0 transition-transform ' + (showPassage ? 'rotate-180' : '')} aria-hidden="true" />
            </button>
            {showPassage && <p className="mt-1 max-h-60 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{ai.context}</p>}
          </div>
        )}
        {ai?.question?.trim() && <p className="whitespace-pre-line text-[14px] font-bold leading-relaxed">{ai.question}</p>}
        {ai && ai.options.length > 0 && <ul className="space-y-0.5 text-[13.5px]">
          {ai.options.map(option => {
            const letter = optionLetter(option), right = letter === value.answer, wrong = letter === chosen;
            return <li key={option} className={right ? 'font-bold text-emerald-700 dark:text-emerald-300' : wrong ? 'font-bold text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}>
              {right ? '✓ ' : wrong ? '✕ ' : ''}{option}
            </li>;
          })}
        </ul>}
        <div className="space-y-1.5 pt-1">
          {picker('Bạn chọn', chosen, 'wrong', letter => onChange({ choice: letter }))}
          {picker('Đáp án', value.answer, 'right', letter => onChange({ answer: letter }))}
        </div>
        <button type="button" onClick={onOpenFull} className="cursor-pointer text-[12.5px] font-bold text-blue-700 dark:text-blue-300">Form đầy đủ</button>
      </div>
      <div className="min-w-0">
        {ai?.explanation?.quickTip?.trim()
          ? <ExplanationView explanation={ai.explanation} trapTip={ai.trapTip}
              optionMeanings={resolveQuizOptions({ ...card, options: ai.options, optionNotes: ai.optionNotes, correctAnswer: ai.correctAnswer }).options} />
          : isExplaining(card.id) ? <p className="text-[13px] font-bold text-indigo-700 dark:text-indigo-300">Đang viết lời giải…</p>
          : !ai && <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{card.part <= 2 ? 'Part này không có chữ để chụp; chọn lý do là đủ.' : 'Câu này chưa có trong ảnh nào. Dán thêm ảnh hoặc chỉ chọn lý do.'}</p>}
      </div>
    </div>
  );
}
