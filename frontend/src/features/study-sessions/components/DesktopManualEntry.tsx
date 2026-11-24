import { useState } from 'react';
import { calculateFromPartScores } from '@/shared/domain/etsScoring';
import { formatQuestionList, parseQuestionList, PART_NUMBERS, partScoresFromWrong, wrongQuestionsByPart } from '@/shared/domain/questionNumbers';
import { useWrongNumberDraft, type WrongNumberDraft } from '../lib/wrongNumberDraft';

/** P1-P7 wrong counts in one aligned row; the Part with most wrong questions is amber. */
export function PartCountRow({ wrong }: { wrong: number[] }) {
  const byPart = wrongQuestionsByPart(wrong);
  const most = Math.max(0, ...PART_NUMBERS.map(part => byPart[part].length));
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-[10px] border-[1.5px] border-[var(--rd-line)]" role="group" aria-label="Câu sai theo Part">
      {PART_NUMBERS.map(part => (
        <div key={part} className="border-l border-[var(--rd-line)] py-1.5 text-center first:border-l-0">
          <small className="block text-[11px] font-bold text-[var(--rd-mut)]">P{part}</small>
          <b className={'block text-[16px] font-extrabold tabular-nums ' + (byPart[part].length > 0 && byPart[part].length === most ? 'text-[#8a6a10]' : 'text-[var(--rd-ink)]')}>{byPart[part].length}</b>
        </div>
      ))}
    </div>
  );
}

const inputClass = 'w-full rounded-xl border-2 border-[var(--rd-line)] bg-white px-3 py-2 text-[14px] font-bold tabular-nums text-[var(--rd-ink)] placeholder:font-semibold placeholder:text-[var(--rd-mut)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rd-violet)]';

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

  // One label for the row; "L" / "R" sit inside the fields so the two boxes read as one score.
  const section = (label: 'Listening' | 'Reading', current: string, change: (next: string) => void) => (
    <label className="flex min-w-0 items-stretch overflow-hidden rounded-xl border-2 border-[var(--rd-line)] bg-white focus-within:ring-[3px] focus-within:ring-[var(--rd-violet)]">
      <span aria-hidden="true" className="grid w-9 shrink-0 place-items-center border-r-2 border-[var(--rd-line)] bg-[var(--rd-soft)] text-[13px] font-extrabold text-[#5c675f]">{label[0]}</span>
      <input type="number" inputMode="numeric" min={5} max={495} step={5} aria-label={label} placeholder={label} value={current}
        onChange={event => change(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[14px] font-bold tabular-nums text-[var(--rd-ink)] placeholder:font-semibold placeholder:text-[var(--rd-mut)] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
    </label>
  );

  return (
    <div className="grid gap-3.5" data-testid="manual-entry">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-[12px] font-extrabold text-[#5c675f]">
          Điểm L/R từ đề thi <span className="font-semibold text-[var(--rd-mut)]">không bắt buộc</span>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2.5">
          {section('Listening', listening, next => onSections(next, reading))}
          {section('Reading', reading, next => onSections(listening, next))}
          <span className={'min-w-[64px] text-right text-[14px] font-bold text-[var(--rd-mut)]' + (bothSections ? '' : ' invisible')} aria-hidden={!bothSections}>
            = <b className="text-[22px] font-extrabold tabular-nums text-[var(--rd-ink)]">{bothSections ? Number(listening) + Number(reading) : 0}</b>
          </span>
        </div>
        <p className="mt-1.5 text-[12px] font-semibold text-[var(--rd-mut)]">Để trống thì điểm được ước tính từ số câu sai.</p>
      </div>

      <div>
        <label htmlFor="manual-wrong-list" className="mb-1 block text-[12px] font-extrabold text-[#5c675f]">Số câu sai</label>
        <textarea id="manual-wrong-list" aria-label="Số câu sai" autoFocus rows={3} value={value} placeholder="3, 15, 22, 101-105"
          onChange={event => { setBlocked([]); edit(event.target.value); onWrong(parseQuestionList(event.target.value).questions); }}
          className={inputClass + ' min-h-[68px] resize-none leading-6'} />
        <p className="mt-1 text-[11px] font-semibold text-[var(--rd-mut)]">Cách nhau bằng dấu phẩy hoặc khoảng trắng; dùng 101-105 cho một dãy.</p>
        {(parsed.invalid.length > 0 || blocked.length > 0) && <p role="alert" className="mt-1 text-[13px] font-semibold text-[var(--rd-pink-d)]">Không đọc được: {(parsed.invalid.length ? parsed.invalid : blocked).join(', ')}</p>}
      </div>

      <PartCountRow wrong={parsed.questions} />

      <div className="flex items-baseline justify-between border-t border-[var(--rd-line)] pt-3" aria-live="polite">
        <span className="text-[13px] font-bold text-[var(--rd-mut)]">Điểm sẽ lưu</span>
        <span className="flex items-baseline gap-2">
          <b className="text-[22px] font-extrabold tabular-nums text-[var(--rd-ink)]" data-testid="manual-total">{total}</b>
          <span className={'text-[12px] font-bold ' + (official ? 'text-[var(--rd-green-d)]' : 'text-[var(--rd-mut)]')}>
            {official ? 'Điểm từ đề thi' : hasMarks ? 'Ước tính từ câu sai' : 'Gõ câu sai hoặc điểm L/R'}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between text-[13px] font-extrabold">
        <button type="button" onClick={() => leave(onBack)} className="cursor-pointer text-[#5c675f] hover:underline">‹ Quay lại dán ảnh</button>
        <button type="button" onClick={() => leave(onGrid)} className="cursor-pointer text-[var(--rd-violet-d)] hover:underline">Chạm từng câu trên lưới ›</button>
      </div>
    </div>
  );
}
