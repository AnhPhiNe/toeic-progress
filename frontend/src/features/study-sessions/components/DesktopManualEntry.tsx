import { useState } from 'react';
import { calculateFromPartScores } from '@/shared/domain/etsScoring';
import { formatQuestionList, parseQuestionList, PART_NUMBERS, partScoresFromWrong, wrongQuestionsByPart } from '@/shared/domain/questionNumbers';
import { useWrongNumberDraft, type WrongNumberDraft } from '../lib/wrongNumberDraft';

/** P1-P7 wrong counts in one aligned row; the Part with most wrong questions is amber. */
export function PartCountRow({ wrong }: { wrong: number[] }) {
  const byPart = wrongQuestionsByPart(wrong);
  const most = Math.max(0, ...PART_NUMBERS.map(part => byPart[part].length));
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-[10px] border-[1.5px] border-slate-200 dark:border-slate-700" role="group" aria-label="Câu sai theo Part">
      {PART_NUMBERS.map(part => (
        <div key={part} className="border-l border-slate-200 py-1.5 text-center first:border-l-0 dark:border-slate-700">
          <small className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">P{part}</small>
          <b className={'block text-[16px] font-extrabold tabular-nums ' + (byPart[part].length > 0 && byPart[part].length === most ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white')}>{byPart[part].length}</b>
        </div>
      ))}
    </div>
  );
}

const inputClass = 'w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-[14px] font-bold tabular-nums text-slate-950 placeholder:font-semibold placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-300 dark:bg-[#121A2B] dark:text-white dark:placeholder:text-slate-400';

interface Props {
  wrong: number[];
  onWrong: (wrong: number[]) => void;
  numberDraft?: WrongNumberDraft;
  onNumberDraft?: (value: WrongNumberDraft) => void;
  listening: string;
  reading: string;
  /** Official total entered without L/R (an image that only showed a total). */
  officialTotal?: string;
  onSections: (listening: string, reading: string) => void;
  onBack: () => void;
  onGrid: () => void;
}

const validSection = (value: string) => {
  const number = Number(value);
  return value.trim() !== '' && Number.isInteger(number) && number >= 5 && number <= 495 && number % 5 === 0;
};

/**
 * Computer Full Test "Nhập tay": optional official Listening/Reading scores and a typed list of wrong questions.
 * Both L and R filled = official score; otherwise the total is estimated from the wrong list. The list never changes L/R.
 */
export function DesktopManualEntry({ wrong, onWrong, numberDraft, onNumberDraft, listening, reading, officialTotal, onSections, onBack, onGrid }: Props) {
  const { typing, text, edit, cancel } = useWrongNumberDraft(wrong, numberDraft, onNumberDraft);
  const [blocked, setBlocked] = useState<string[]>([]);
  const value = typing ? text : formatQuestionList(wrong).split(' ').join(', ');
  const parsed = parseQuestionList(value);
  const bothSections = validSection(listening) && validSection(reading);
  const hasMarks = wrong.length > 0;
  const official = bothSections || Boolean(officialTotal);
  const estimated = hasMarks ? calculateFromPartScores(partScoresFromWrong(wrong)).totalScore : null;
  const total = bothSections ? String(Number(listening) + Number(reading)) : officialTotal ? officialTotal : estimated !== null ? `~${estimated}` : '—';

  const leave = (go: () => void) => {
    if (parsed.invalid.length) { setBlocked(parsed.invalid); return; }
    cancel();
    go();
  };

  const section = (label: string, current: string, change: (next: string) => void) => (
    <label className="block min-w-0">
      <span className="mb-1 flex items-baseline justify-between text-[12px] font-extrabold text-slate-700 dark:text-slate-200">
        {label}<em className="font-semibold not-italic text-slate-500 dark:text-slate-400">nếu có</em>
      </span>
      <input type="number" inputMode="numeric" min={5} max={495} step={5} aria-label={label} placeholder="Chưa có" value={current}
        onChange={event => change(event.target.value)} className={inputClass} />
    </label>
  );

  return (
    <div className="grid gap-3.5" data-testid="manual-entry">
      <div className="grid grid-cols-[1fr_1fr_120px] items-end gap-2.5">
        {section('Listening', listening, next => onSections(next, reading))}
        {section('Reading', reading, next => onSections(listening, next))}
        <div className="pb-1.5" aria-live="polite">
          <span className="block text-[11px] font-extrabold text-slate-500 dark:text-slate-400">Tổng</span>
          <b className="block text-[24px] font-extrabold leading-[1.1] tabular-nums text-slate-950 dark:text-white" data-testid="manual-total">{total}</b>
          <span className={'mt-0.5 block text-[11px] font-extrabold ' + (official ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300')}>
            {official ? 'Điểm từ đề thi' : 'Ước tính từ câu sai'}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="manual-wrong-list" className="mb-1 block text-[12px] font-extrabold text-slate-700 dark:text-slate-200">Số câu sai</label>
        <textarea id="manual-wrong-list" aria-label="Số câu sai" autoFocus rows={3} value={value} placeholder="3, 15, 22, 101-105"
          onChange={event => { setBlocked([]); edit(event.target.value); onWrong(parseQuestionList(event.target.value).questions); }}
          className={inputClass + ' min-h-[68px] resize-none leading-6'} />
        <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Cách nhau bằng dấu phẩy hoặc khoảng trắng; dùng 101-105 cho một dãy.</p>
        {(parsed.invalid.length > 0 || blocked.length > 0) && <p role="alert" className="mt-1 text-[13px] font-semibold text-rose-700 dark:text-rose-300">Không đọc được: {(parsed.invalid.length ? parsed.invalid : blocked).join(', ')}</p>}
      </div>

      <PartCountRow wrong={parsed.questions} />

      <div className="flex items-center justify-between text-[13px] font-extrabold">
        <button type="button" onClick={() => leave(onBack)} className="cursor-pointer text-slate-600 hover:underline dark:text-slate-300">‹ Quay lại dán ảnh</button>
        <button type="button" onClick={() => leave(onGrid)} className="cursor-pointer text-indigo-700 hover:underline dark:text-indigo-300">Chạm từng câu trên lưới ›</button>
      </div>
    </div>
  );
}
