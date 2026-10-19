import { useState } from 'react';
import { formatQuestionList, parseQuestionList, PART_NUMBERS, questionsOfPart, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';

const listening = (part: PartNumber) => part <= 4;

/** Tap the questions answered wrong, one Part at a time; or type the numbers ("3 15 101-104"). */
export function WrongQuestionGrid({ wrong, onChange }: { wrong: number[]; onChange: (wrong: number[]) => void }) {
  const [part, setPart] = useState<PartNumber>(1);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const byPart = wrongQuestionsByPart(wrong);
  const marked = new Set(wrong);
  const toggle = (question: number) => onChange(marked.has(question) ? wrong.filter(item => item !== question) : [...wrong, question].sort((a, b) => a - b));
  const applyTyped = () => {
    const parsed = parseQuestionList(text);
    setInvalid(parsed.invalid);
    if (!parsed.invalid.length) { onChange(parsed.questions); setTyping(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-[14.5px] font-black text-slate-900 dark:text-white">Chạm vào câu bạn làm sai</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Part">
        {PART_NUMBERS.map(item => {
          const on = item === part, count = byPart[item].length;
          return (
            <button key={item} type="button" aria-pressed={on} aria-label={`Part ${item}${count ? `, ${count} câu sai` : ''}`} onClick={() => setPart(item)}
              className="flex cursor-pointer flex-col items-center gap-0.5">
              <span className={'flex h-9 w-full items-center justify-center rounded-[10px] border-2 text-[13px] font-black ' + (on
                ? (listening(item) ? 'border-slate-900 bg-indigo-600 text-white' : 'border-slate-900 bg-teal-600 text-white') + ' dark:border-slate-200'
                : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>P{item}</span>
              <span className="h-4 text-[11px] font-black tabular-nums text-rose-600 dark:text-rose-400" aria-hidden="true">{count ? `${count} sai` : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={`Câu sai Part ${part}`}>
        {questionsOfPart(part).map(question => {
          const on = marked.has(question);
          return (
            <button key={question} type="button" aria-pressed={on} aria-label={`Câu ${question}`} onClick={() => toggle(question)}
              className={'h-11 cursor-pointer rounded-[10px] border-2 text-[14px] font-black tabular-nums ' + (on
                ? 'border-slate-900 bg-rose-600 text-white dark:border-slate-200'
                : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{question}</button>
          );
        })}
      </div>
      {typing
        ? <div className="space-y-2">
            <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">Số câu sai
              <input autoFocus type="text" value={text} onChange={event => { setText(event.target.value); setInvalid([]); }} placeholder="3 15 22 101-104"
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                className="mt-1 h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 font-bold tabular-nums text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
            </label>
            {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">Không đọc được: {invalid.join(', ')}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={applyTyped} className="min-h-11 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[14px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">Áp dụng</button>
              <button type="button" onClick={() => { setTyping(false); setInvalid([]); }} className="min-h-11 cursor-pointer px-3 text-[14px] font-bold text-slate-500 dark:text-slate-400">Hủy</button>
            </div>
          </div>
        : <button type="button" onClick={() => { setText(formatQuestionList(wrong)); setTyping(true); }} className="min-h-10 cursor-pointer text-[13.5px] font-bold text-blue-700 dark:text-blue-300">Gõ số câu thay vì chạm</button>}
    </div>
  );
}
