import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { CHOICE_LETTERS, learnerMistake, parsePastedQuestion, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';

interface Props {
  /** Cards to fill in, in order. */
  cards: MistakeEntry[];
  onSave: (entry: MistakeEntry, original: MistakeEntry) => void;
  /** The full note form, with AI analysis, for the current card. */
  onOpenFull: (card: MistakeEntry) => void;
  onClose: (saved: number) => void;
}

type Choice = ChoiceLetter | 'BLANK' | '';

/**
 * Fills in mistake cards that came from a wrong-question list, one after another:
 * the question (pasted), what the learner chose, the correct answer, and why it went wrong.
 * Test, Part and question number are already on the card.
 */
export function MistakeDetailFlow({ cards, onSave, onOpenFull, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const card = cards[index];
  const [raw, setRaw] = useState('');
  const [choice, setChoice] = useState<Choice>('');
  const [answer, setAnswer] = useState<ChoiceLetter | ''>('');
  const [category, setCategory] = useState<ErrorCategory | ''>('');
  const [error, setError] = useState('');
  const close = () => onClose(saved);
  const ref = useModalA11y(true, close);
  const parsed = useMemo(() => raw.trim() ? parsePastedQuestion(raw, card?.part) : null, [raw, card?.part]);
  if (!card) return null;
  const letters = CHOICE_LETTERS.slice(0, card.part === 2 ? 3 : 4);
  const last = index === cards.length - 1;

  const next = () => {
    if (last) { onClose(saved); return; }
    setIndex(index + 1); setRaw(''); setChoice(''); setAnswer(''); setCategory(''); setError('');
    ref.current?.querySelector('[data-flow-body]')?.scrollTo({ top: 0 });
  };

  const save = () => {
    if (parsed?.error) { setError(parsed.error); return; }
    if (choice && choice === answer) { setError('Đáp án bạn chọn trùng đáp án đúng.'); return; }
    if (!choice && !answer && !category && !parsed) { setError('Điền ít nhất một mục, hoặc bấm Bỏ qua.'); return; }
    const options = parsed?.options ?? card.options ?? [];
    const question = parsed?.question ?? card.question ?? '';
    const chosen = choice === 'BLANK' || choice === '' ? undefined : choice;
    const state = choice === 'BLANK' ? 'BLANK' : chosen ? 'CHOSEN' : card.userChoiceState ?? 'UNKNOWN';
    const correctAnswer = answer ? options.find(option => option.startsWith(`(${answer})`)) ?? `(${answer})` : card.correctAnswer;
    const entry: MistakeEntry = {
      ...card, question, questionContext: [question, card.context].filter(Boolean).join('\n\n'), options,
      userChoice: state === 'CHOSEN' ? chosen ?? card.userChoice : undefined, userChoiceState: state,
      userMistake: learnerMistake({ userChoiceState: state, userChoice: chosen ?? card.userChoice ?? '', userReason: card.userReason ?? '', options }),
      correctAnswer, ...(answer ? { answerSource: 'PROVIDED' as const, answerProvidedBy: 'SOURCE' as const } : {}),
      category: category || card.category
    };
    try { onSave(entry, card); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được thẻ.'); return; }
    setSaved(value => value + 1);
    next();
  };

  const letterButton = (letter: ChoiceLetter, on: boolean, tone: 'wrong' | 'right', pick: () => void) => (
    <button key={letter} type="button" aria-pressed={on} onClick={pick}
      className={'h-12 flex-1 cursor-pointer rounded-xl border-2 text-[16px] font-black ' + (on
        ? (tone === 'wrong' ? 'border-slate-900 bg-rose-600 text-white' : 'border-slate-900 bg-emerald-600 text-white') + ' dark:border-slate-200'
        : 'border-stone-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>{letter}</button>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 md:items-center md:p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="detail-flow-title" tabIndex={-1}
        className="flex h-[100dvh] w-full flex-col bg-[#FDFBF7] text-slate-900 dark:bg-[#0B1220] dark:text-white md:h-auto md:max-h-[92vh] md:max-w-lg md:rounded-2xl md:border-2 md:border-slate-900 md:shadow-[4px_4px_0_0_#0f172a]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#111A2C]">
          <div className="min-w-0">
            <h2 id="detail-flow-title" className="text-[17px] font-black">Ghi câu sai · {index + 1}/{cards.length}</h2>
            <p className="truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">
              {card.questionNumber ? `Câu ${card.questionNumber} · ` : ''}Part {card.part}{card.sourceTestName ? ` · ${card.sourceTestName}` : ''}
            </p>
          </div>
          <button type="button" aria-label="Đóng" onClick={close} className="-mr-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 dark:text-slate-400"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <div data-flow-body className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="detail-question" className="text-[14px] font-black">Câu hỏi <span className="font-semibold text-slate-400">(không bắt buộc)</span></label>
              <button type="button" onClick={() => onOpenFull(card)} className="min-h-9 cursor-pointer text-[13px] font-bold text-blue-700 dark:text-blue-300">Form đầy đủ (AI)</button>
            </div>
            <textarea id="detail-question" rows={4} value={raw} onChange={event => { setRaw(event.target.value); setError(''); }}
              placeholder={card.question?.trim() ? card.question : 'Dán câu hỏi và 4 phương án'}
              className="mt-2 w-full rounded-xl border-[1.5px] border-stone-300 bg-white px-3 py-2.5 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            {parsed && !parsed.error && parsed.options.length > 0 && <p className="mt-1.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-300">✓ Đã tách {parsed.options.length} phương án</p>}
          </section>

          <section role="group" aria-labelledby="detail-choice">
            <p id="detail-choice" className="flex items-center gap-2 text-[14px] font-black"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white" aria-hidden="true"><X className="h-3 w-3" strokeWidth={3.5} /></span>Bạn chọn</p>
            <div className="mt-2 flex gap-2">{letters.map(letter => letterButton(letter, choice === letter, 'wrong', () => setChoice(choice === letter ? '' : letter)))}</div>
            <button type="button" aria-pressed={choice === 'BLANK'} onClick={() => setChoice(choice === 'BLANK' ? '' : 'BLANK')}
              className={'mt-1.5 min-h-9 cursor-pointer text-[13px] font-bold ' + (choice === 'BLANK' ? 'text-rose-700 underline dark:text-rose-300' : 'text-slate-500 dark:text-slate-400')}>Mình bỏ trống câu này</button>
          </section>

          <section role="group" aria-labelledby="detail-answer">
            <p id="detail-answer" className="flex items-center gap-2 text-[14px] font-black"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden="true"><Check className="h-3 w-3" strokeWidth={3.5} /></span>Đáp án đúng</p>
            <div className="mt-2 flex gap-2">{letters.map(letter => letterButton(letter, answer === letter, 'right', () => setAnswer(answer === letter ? '' : letter)))}</div>
          </section>

          <section role="group" aria-labelledby="detail-category">
            <p id="detail-category" className="text-[14px] font-black">Vì sao sai</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_CHOICES) as ErrorCategory[]).map(value => (
                <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(category === value ? '' : value)}
                  className={'min-h-10 cursor-pointer rounded-full border-2 px-3.5 text-[13.5px] font-bold ' + (category === value
                    ? 'border-slate-900 bg-violet-100 text-violet-950 dark:border-violet-300 dark:bg-violet-950 dark:text-white'
                    : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{CATEGORY_CHOICES[value]}</button>
              ))}
            </div>
          </section>
          {error && <p role="alert" className="text-[13.5px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-stone-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-[#111A2C]">
          <button type="button" onClick={next} className="min-h-12 w-[32%] cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[15px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">Bỏ qua</button>
          <button type="button" onClick={save} className="min-h-12 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-emerald-400 text-[15px] font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none">{last ? 'Lưu' : 'Lưu · câu tiếp ›'}</button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
