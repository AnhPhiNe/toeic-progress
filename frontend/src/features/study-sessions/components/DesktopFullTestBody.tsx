import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { formatQuestionList, normalizeQuestionList, parseQuestionList, PART_NUMBERS, questionsOfPart, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { ResultImageButton } from './WrongQuestionGrid';

const listening = (part: PartNumber) => part <= 4;

interface Props {
  wrong: number[];
  onWrong: (wrong: number[]) => void;
  preview: { totalScore?: number; scaledListening?: number; scaledReading?: number } | null;
  onCounts: () => void;
  onOfficial: () => void;
  notes: string;
  setNotes: (value: string) => void;
}

/**
 * Computer Full Test: all 200 questions on one screen; clicking a number marks it wrong.
 * The score is worked out from the marks, so per-Part counts are never typed here.
 */
export function DesktopFullTestBody({ wrong, onWrong, preview, onCounts, onOfficial, notes, setNotes }: Props) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(Boolean(notes));
  const marked = new Set(wrong);
  const byPart = wrongQuestionsByPart(wrong);
  const toggle = (question: number) => onWrong(marked.has(question) ? wrong.filter(item => item !== question) : normalizeQuestionList([...wrong, question]));
  const applyTyped = () => {
    const parsed = parseQuestionList(text);
    setInvalid(parsed.invalid);
    if (!parsed.invalid.length) { onWrong(parsed.questions); setTyping(false); }
  };

  const section = (title: string, parts: PartNumber[]) => (
    <div>
      <p className={'mb-2 text-[12px] font-black uppercase tracking-wider ' + (title === 'Listening' ? 'text-indigo-700 dark:text-indigo-300' : 'text-teal-700 dark:text-teal-300')}>{title}</p>
      {parts.map(part => (
        <div key={part} className="mb-1.5 flex gap-2.5">
          <div className="w-[34px] shrink-0 text-center">
            <span className={'flex h-6 items-center justify-center rounded-[7px] text-[11.5px] font-black text-white ' + (listening(part) ? 'bg-indigo-600' : 'bg-teal-600')}>P{part}</span>
            {byPart[part].length > 0 && <span className="mt-0.5 block text-[11px] font-black tabular-nums text-rose-600 dark:text-rose-400">{byPart[part].length} sai</span>}
          </div>
          <div className="grid grid-cols-[repeat(10,28px)] gap-[3px]" role="group" aria-label={`Câu sai Part ${part}`}>
            {questionsOfPart(part).map(question => {
              const on = marked.has(question);
              return (
                <button key={question} type="button" aria-pressed={on} aria-label={`Câu ${question}`} onClick={() => toggle(question)}
                  className={'h-[26px] cursor-pointer rounded-[7px] border-[1.5px] text-[11.5px] font-bold tabular-nums transition-colors ' + (on
                    ? 'border-slate-900 bg-rose-600 text-white dark:border-slate-200'
                    : 'border-stone-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-rose-950/40')}>{question}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const hasMarks = wrong.length > 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_236px]">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {section('Listening', PART_NUMBERS.filter(listening))}
          {section('Reading', PART_NUMBERS.filter(part => !listening(part)))}
        </div>
      </div>

      <div className="flex flex-col gap-3 max-lg:order-first">
        <div className="rounded-[20px] border-2 border-slate-900 bg-white p-4 text-center shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]" aria-live="polite">
          <p className="text-[12.5px] font-bold text-slate-500 dark:text-slate-400">Ước tính</p>
          <p className="text-[44px] font-black leading-tight tracking-tight tabular-nums text-slate-950 dark:text-white">{hasMarks ? preview?.totalScore ?? '—' : '—'}</p>
          <p className="text-[14px] font-black tabular-nums">
            <span className="text-indigo-600 dark:text-indigo-300">L {hasMarks ? preview?.scaledListening ?? '—' : '—'}</span>
            <span className="text-slate-400"> · </span>
            <span className="text-teal-700 dark:text-teal-300">R {hasMarks ? preview?.scaledReading ?? '—' : '—'}</span>
          </p>
          {hasMarks
            ? <p className="mt-1 text-[13px] font-black tabular-nums text-rose-600 dark:text-rose-400">{wrong.length} câu sai</p>
            : <p className="mt-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">Chạm vào câu bạn làm sai</p>}
        </div>

        {typing
          ? <div className="space-y-2">
              <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">Số câu sai
                <textarea autoFocus rows={3} value={text} onChange={event => { setText(event.target.value); setInvalid([]); }} placeholder="3 15 22 101-104"
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                  className="mt-1 w-full resize-none rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-[14px] font-bold tabular-nums text-slate-950 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
              </label>
              <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">Cách nhau bằng dấu cách; 101-104 là một dải câu.</p>
              {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">Không đọc được: {invalid.join(', ')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={applyTyped} className="min-h-10 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[13.5px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">Áp dụng</button>
                <button type="button" onClick={() => { setTyping(false); setInvalid([]); }} className="min-h-10 cursor-pointer px-3 text-[13.5px] font-bold text-slate-500 dark:text-slate-400">Hủy</button>
              </div>
            </div>
          : <>
              <ResultImageButton desktop onRead={numbers => onWrong(normalizeQuestionList([...wrong, ...numbers]))} />
              <button type="button" onClick={() => { setText(formatQuestionList(wrong)); setTyping(true); }}
                className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-white text-[14px] font-black text-slate-950 hover:bg-slate-50 dark:border-slate-300 dark:bg-slate-900 dark:text-white">
                <Keyboard className="h-[18px] w-[18px]" aria-hidden="true" />Gõ số câu
              </button>
            </>}

        <div className="mt-auto space-y-1.5 pt-2 text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
          {showNotes
            ? <label className="block font-bold text-slate-600 dark:text-slate-300">Ghi chú
                <textarea id="session-notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)}
                  className="mt-1 w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
              </label>
            : <button type="button" onClick={() => setShowNotes(true)} className="block cursor-pointer font-bold text-blue-700 dark:text-blue-300">+ Ghi chú</button>}
          <p>Cách khác: <button type="button" onClick={onCounts} className="cursor-pointer font-bold text-blue-700 dark:text-blue-300">Số câu đúng mỗi Part</button>
            {' · '}<button type="button" onClick={onOfficial} className="cursor-pointer font-bold text-blue-700 dark:text-blue-300">Điểm chính thức</button></p>
        </div>
      </div>
    </div>
  );
}
