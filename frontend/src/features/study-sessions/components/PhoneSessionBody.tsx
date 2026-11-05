import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LRPartScore, PracticePartResult, StudySession, PartTimingDurations } from '@/shared/types';
import { PartTimingModal, PartTimingStrip } from './PartTimingModal';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { getTodayDateString } from '@/shared/data/storage';
import type { ScoreSource } from '@/features/study-sessions/lib/fullTestScore';
import { WrongQuestionGrid } from './WrongQuestionGrid';
import type { WrongNumberDraft } from '../lib/wrongNumberDraft';
import type { ResultImageTiming } from '@/shared/types';
import type { AppliedResultScore, ResultScoreStore } from './ResultScoreReview';

type PartNumber = PracticePartResult['part'];
const PART_NAMES: Record<PartNumber, string> = {
  1: 'Mô tả tranh', 2: 'Hỏi – đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn', 7: 'Đọc hiểu'
};
const isListening = (part: number) => part <= 4;
const partMax = (part: PartNumber) => PART_MAX_QUESTIONS[`part${part}` as keyof LRPartScore];

/** Phone keypads have no Tab: Enter, or a value that cannot take another digit, moves to the next score box. */
function focusNextScore(current: HTMLInputElement) {
  const boxes = Array.from(current.form?.querySelectorAll<HTMLInputElement>('input[data-phone-score]') ?? []);
  const next = boxes[boxes.indexOf(current) + 1];
  if (next) { next.focus(); next.select(); } else current.blur();
}

function ScoreBox({ value, max, label, onChange, muted = false }: { value: number; max: number; label: string; onChange: (value: number) => void; muted?: boolean }) {
  return (
    <input data-phone-score data-large-text type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" aria-label={label}
      value={value === 0 ? '' : String(value)} placeholder="0"
      onFocus={event => event.currentTarget.select()}
      onChange={event => {
        const digits = event.target.value.replace(/\D/g, '');
        const next = Math.min(max, Number(digits || 0));
        onChange(next);
        if (digits && next * 10 > max) focusNextScore(event.target);
      }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); focusNextScore(event.currentTarget); } }}
      className={'h-11 w-[58px] shrink-0 rounded-xl border-2 border-slate-300 bg-white text-center text-lg font-black tabular-nums outline-none placeholder:text-slate-300 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-900 dark:placeholder:text-slate-600 dark:focus:ring-blue-900 '
        + (muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-950 dark:text-white')} />
  );
}

function PartBadge({ part }: { part: number }) {
  return <span className={'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-black text-white ' + (isListening(part) ? 'bg-indigo-600' : 'bg-teal-600')}>P{part}</span>;
}

function DetailsRow({ date, setDate, duration, setDuration, notes, setNotes }: {
  date: string; setDate: (value: string) => void; duration: number; setDuration: (value: number) => void; notes: string; setNotes: (value: string) => void;
}) {
  const when = date === getTodayDateString() ? 'Hôm nay' : date.split('-').reverse().slice(0, 2).join('/');
  return (
    <details className="group rounded-2xl border-[1.5px] border-stone-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex min-h-[50px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-bold [&::-webkit-details-marker]:hidden">
        Thời gian & Ghi chú
        <span className="flex items-center gap-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{when} · {duration} phút<ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <div className="space-y-3 border-t border-stone-200 px-4 py-3 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">Ngày làm
            <input id="session-date" type="date" required value={date} onChange={event => setDate(event.target.value)}
              className="mt-1 h-12 w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">Thời gian (phút)
            <input id="session-duration" type="number" inputMode="decimal" min="0.01" max="1440" step="any" required value={duration} onChange={event => setDuration(Number(event.target.value))}
              className="mt-1 h-12 w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
        </div>
        <label className="block text-[13px] font-semibold text-slate-600 dark:text-slate-300">Ghi chú
          <textarea id="session-notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Tùy chọn"
            className="mt-1 w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
        </label>
      </div>
    </details>
  );
}

const LIVE_CARD = 'rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]';

interface FullTestProps {
  manualViewOverride?: boolean;
  onTiming?: (value: ResultImageTiming) => void;
  numberDraft?: WrongNumberDraft; onNumberDraft?: (value: WrongNumberDraft) => void;
  testName: string; setTestName: (value: string) => void; suggestions: string[];
  retest?: { attempt: number; best: number };
  partScores: LRPartScore; onPart: (key: keyof LRPartScore, value: number) => void;
  entry: 'wrong' | 'counts'; onEntry: (entry: 'wrong' | 'counts') => void;
  wrongQuestions: number[]; onWrong: (wrong: number[]) => void;
  onScores?: (score: AppliedResultScore) => void;
  onScoresPending?: (pending: boolean) => void;
  scoreStore?: ResultScoreStore;
  preview: { totalScore?: number; scaledListening?: number; scaledReading?: number; rawListening?: number; rawReading?: number } | null;
  scoreSource: ScoreSource; manualMode: 'MANUAL_SECTIONS' | 'MANUAL_TOTAL';
  useManual: (on: boolean) => void; setManualMode: (mode: 'MANUAL_SECTIONS' | 'MANUAL_TOTAL') => void;
  manualListening: string; setManualListening: (value: string) => void;
  manualReading: string; setManualReading: (value: string) => void;
  manualTotal: string; setManualTotal: (value: string) => void;
  includePartDetails: boolean; setIncludePartDetails: (value: boolean) => void;
  date: string; setDate: (value: string) => void; duration: number; setDuration: (value: number) => void; notes: string; setNotes: (value: string) => void;
  partDurations?: PartTimingDurations;
  onPartDurationsChange?: (durations: PartTimingDurations | undefined) => void;
}

/** Phone Full Test: per-Part counts stay the main input, with the score updating live in a card that sticks while scrolling. */
export function PhoneFullTestBody(props: FullTestProps) {
  const { partScores, onPart, preview, scoreSource, partDurations, onPartDurationsChange } = props;
  const [timingModalOpen, setTimingModalOpen] = useState(false);
  const manual = scoreSource !== 'ESTIMATED';
  const fromWrong = props.entry === 'wrong' && !props.manualViewOverride;
  // An empty section would show the scale's floor (R 5) and a misleadingly low total while the learner is
  // still typing; each section waits for its first answer and the total waits for both.
  // Logging by wrong questions shows a score once the first question is marked (a perfect test is confirmed on save).
  const marked = fromWrong && props.wrongQuestions.length > 0;
  const listeningTyped = manual || (fromWrong ? marked : partScores.part1 + partScores.part2 + partScores.part3 + partScores.part4 > 0);
  const readingTyped = manual || (fromWrong ? marked : partScores.part5 + partScores.part6 + partScores.part7 > 0);
  const shown = {
    totalScore: listeningTyped && readingTyped ? preview?.totalScore : undefined,
    scaledListening: listeningTyped ? preview?.scaledListening : undefined,
    scaledReading: readingTyped ? preview?.scaledReading : undefined
  };
  const showParts = manual ? props.includePartDetails : !fromWrong;
  const section = (title: string, parts: PartNumber[], raw: number) => (
    <div className={'overflow-hidden rounded-2xl border-2 border-slate-900 bg-white dark:border-slate-300 dark:bg-[#111A2C]'}>
      <div className={'flex items-center justify-between px-4 py-2.5 text-[13.5px] font-black ' + (title === 'Listening'
        ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
        : 'bg-emerald-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200')}>
        <span className="uppercase tracking-wide">{title}</span>
        <span className="tabular-nums text-slate-950 dark:text-white">{raw} / 100</span>
      </div>
      {parts.map(part => {
        const key = `part${part}` as keyof LRPartScore;
        const max = partMax(part);
        return (
          <div key={part} className="flex items-center gap-3 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
            <PartBadge part={part} />
            <p className="min-w-0 flex-1 text-[14px] font-bold text-slate-900 dark:text-slate-100">{PART_NAMES[part]}</p>
            <ScoreBox value={partScores[key]} max={max} label={`Số câu đúng Part ${part}`} onChange={value => onPart(key, value)} />
            <span className="w-7 text-[13px] font-bold tabular-nums text-slate-400">/{max}</span>
          </div>
        );
      })}
    </div>
  );
  const listeningRaw = partScores.part1 + partScores.part2 + partScores.part3 + partScores.part4;
  const readingRaw = partScores.part5 + partScores.part6 + partScores.part7;
  const bar = (value: number | undefined, color: string) => (
    <span className="block h-[7px] flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
      <span className={'block h-full rounded-full transition-[width] duration-300 ' + color} style={{ width: `${Math.min(100, ((value ?? 0) / 495) * 100)}%` }} />
    </span>
  );
  const manualInput = 'mt-1 h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg font-black tabular-nums text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white';

  return (
    <div className="space-y-3.5">
      <div>
        <TestNamePicker id="session-test-name" label="Tên Đề Thi / Nguồn" required value={props.testName} onChange={props.setTestName} suggestions={props.suggestions} />
        {props.retest && <p className="mt-1.5 text-[13px] font-semibold text-violet-700 dark:text-violet-300">Làm lại lần {props.retest.attempt} · cao nhất trước đây {props.retest.best}đ</p>}
      </div>

      <div className={`${LIVE_CARD} sticky top-0 z-10 flex items-center gap-4 px-4 py-3`} aria-live="polite">
        <div className="shrink-0">
          <p className="text-[11.5px] font-bold text-slate-500 dark:text-slate-400">{manual ? 'Điểm đã nhập' : 'Ước tính'}</p>
          <p className="flex items-baseline leading-none"><span className="text-[34px] font-black tracking-tight tabular-nums text-slate-950 dark:text-white">{shown.totalScore ?? '—'}</span><span className="ml-0.5 text-[13px] font-bold text-slate-400">/990</span></p>
          {marked && <p className="mt-1 text-[12px] font-black tabular-nums text-rose-600 dark:text-rose-400">{props.wrongQuestions.length} câu sai</p>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-[12.5px] font-black tabular-nums">
          <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300"><span className="w-11">L {shown.scaledListening ?? '—'}</span>{bar(shown.scaledListening, 'bg-indigo-600 dark:bg-indigo-400')}</span>
          <span className="flex items-center gap-2 text-teal-700 dark:text-teal-300"><span className="w-11">R {shown.scaledReading ?? '—'}</span>{bar(shown.scaledReading, 'bg-teal-600 dark:bg-teal-400')}</span>
        </div>
      </div>

      {/* Pacing Timing Strip for Reading Part 5-7 */}
      <div className="rounded-2xl border-[1.5px] border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[#111A2C]">
        <PartTimingStrip
          durations={partDurations}
          onOpenEdit={() => setTimingModalOpen(true)}
        />
      </div>

      {manual && !fromWrong && (
        <div className="space-y-3 rounded-2xl border-[1.5px] border-stone-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-slate-800" role="group" aria-label="Cách nhập điểm trực tiếp">
            {(['MANUAL_SECTIONS', 'MANUAL_TOTAL'] as const).map(mode => (
              <button key={mode} type="button" aria-pressed={scoreSource === mode} onClick={() => props.setManualMode(mode)}
                className={'min-h-10 rounded-lg text-[13.5px] font-bold ' + (scoreSource === mode ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
                {mode === 'MANUAL_SECTIONS' ? 'Listening + Reading' : 'Chỉ tổng điểm'}
              </button>
            ))}
          </div>
          {scoreSource === 'MANUAL_SECTIONS'
            ? <div className="grid grid-cols-2 gap-3">
                <label className="text-[13px] font-bold text-indigo-700 dark:text-indigo-300">Điểm Listening /495
                  <input type="number" inputMode="numeric" min="5" max="495" step="5" required value={props.manualListening} onChange={event => props.setManualListening(event.target.value)} data-large-text className={manualInput} />
                </label>
                <label className="text-[13px] font-bold text-teal-700 dark:text-teal-300">Điểm Reading /495
                  <input type="number" inputMode="numeric" min="5" max="495" step="5" required value={props.manualReading} onChange={event => props.setManualReading(event.target.value)} data-large-text className={manualInput} />
                </label>
              </div>
            : <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">Tổng điểm TOEIC /990
                <input type="number" inputMode="numeric" min="10" max="990" step="5" required value={props.manualTotal} onChange={event => props.setManualTotal(event.target.value)} data-large-text className={manualInput} />
              </label>}
          <label className="flex min-h-10 items-center gap-2.5 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200">
            <input type="checkbox" className="h-5 w-5" checked={props.includePartDetails} onChange={event => props.setIncludePartDetails(event.target.checked)} />
            Ghi thêm số câu đúng từng Part
          </label>
        </div>
      )}

      {fromWrong && <WrongQuestionGrid wrong={props.wrongQuestions} onTiming={props.onTiming} onChange={props.onWrong} onScores={props.onScores} onScoresPending={props.onScoresPending} scoreStore={props.scoreStore} numberDraft={props.numberDraft} onNumberDraft={props.onNumberDraft} />}

      {showParts && <>
        {section('Listening', [1, 2, 3, 4], listeningRaw)}
        {section('Reading', [5, 6, 7], readingRaw)}
      </>}
      {manual && props.entry === 'wrong' && props.wrongQuestions.length > 0 && <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đã giữ {props.wrongQuestions.length} câu sai để ghi Sổ tay.</p>}

      {/* Other ways to enter the same test */}
      <div className="rounded-2xl border-[1.5px] border-slate-200 bg-slate-50/80 p-2.5 space-y-1.5 dark:border-slate-700 dark:bg-slate-900/50">
        {manual ? (
          <button
            type="button"
            onClick={() => props.useManual(false)}
            className="flex min-h-10 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-900 hover:text-slate-950 active:scale-[0.99] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            ← Quay lại ước tính điểm
          </button>
        ) : (
          <>
            <p className="text-center text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Cách nhập khác
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => props.onEntry(fromWrong ? 'counts' : 'wrong')}
                className="flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-2 py-2 text-center text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-900 hover:text-slate-950 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {fromWrong ? 'Số câu đúng mỗi Part' : 'Đánh dấu câu sai'}
              </button>
              <button
                type="button"
                onClick={() => props.useManual(true)}
                className="flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-2 py-2 text-center text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-900 hover:text-slate-950 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Điểm chính thức
              </button>
            </div>
          </>
        )}
      </div>

      <DetailsRow date={props.date} setDate={props.setDate} duration={props.duration} setDuration={props.setDuration} notes={props.notes} setNotes={props.setNotes} />

      <PartTimingModal
        isOpen={timingModalOpen}
        onClose={() => setTimingModalOpen(false)}
        value={partDurations}
        onChange={onPartDurationsChange ?? (() => {})}
      />
    </div>
  );
}

interface PracticeProps {
  testName: string; setTestName: (value: string) => void; suggestions: string[];
  rows: PracticePartResult[]; setRows: (rows: PracticePartResult[]) => void;
  sessions: StudySession[]; editingId?: string;
  date: string; setDate: (value: string) => void; duration: number; setDuration: (value: number) => void; notes: string; setNotes: (value: string) => void;
}

/** Phone Part practice: tap Parts to add or drop rows; a ring shows accuracy as the learner types. */
export function PhonePracticeBody(props: PracticeProps) {
  const { rows, setRows } = props;
  const selected = new Set(rows.map(row => row.part));
  const toggle = (part: PartNumber) => {
    if (selected.has(part)) {
      if (rows.length > 1) setRows(rows.filter(row => row.part !== part));
      return;
    }
    setRows([...rows, { part, correct: 0, total: partMax(part) }].sort((a, b) => a.part - b.part));
  };
  const update = (part: PartNumber, patch: Partial<PracticePartResult>) => setRows(rows.map(row => {
    if (row.part !== part) return row;
    const next = { ...row, ...patch };
    if (next.correct > next.total) next.correct = next.total;
    return next;
  }));
  return (
    <div className="space-y-3.5">
      <div>
        <p className="mb-2 flex justify-between text-[13.5px] font-black text-slate-700 dark:text-slate-200">Part đã luyện<span className="font-semibold text-slate-400">chọn một hoặc nhiều</span></p>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Part đã luyện">
          {([1, 2, 3, 4, 5, 6, 7] as const).map(part => {
            const on = selected.has(part);
            return (
              <button key={part} type="button" aria-pressed={on} aria-label={`Part ${part}`} onClick={() => toggle(part)}
                className={'h-[46px] rounded-xl border-2 text-[15px] font-black transition-colors ' + (on
                  ? (isListening(part) ? 'border-slate-900 bg-indigo-600 text-white' : 'border-slate-900 bg-teal-600 text-white') + ' shadow-[2px_2px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none'
                  : 'border-stone-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
                {part}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-slate-900 bg-white dark:border-slate-300 dark:bg-[#111A2C]">
        {rows.map((row, index) => (
          <div key={row.part} className={'flex items-center gap-3 px-4 py-2.5 ' + (index ? 'border-t border-slate-100 dark:border-slate-800' : '')}>
            <PartBadge part={row.part} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-slate-900 dark:text-slate-100">{PART_NAMES[row.part]}</p>
              <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{row.total ? `${Math.round((row.correct / row.total) * 100)}%` : 'Số câu đúng'}</p>
            </div>
            <ScoreBox value={row.correct} max={row.total} label={`Số câu đúng Part ${row.part}`} onChange={value => update(row.part, { correct: value })} />
            <span className="w-8 text-[15px] font-bold tabular-nums text-slate-400 dark:text-slate-500">/{row.total}</span>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 flex justify-between text-[13.5px] font-black text-slate-700 dark:text-slate-200">Đề<span className="font-semibold text-slate-400">không bắt buộc</span></p>
        <TestNamePicker id="session-test-name" label="Tên Đề Thi / Nguồn" value={props.testName} onChange={props.setTestName} suggestions={props.suggestions} />
      </div>

      <DetailsRow date={props.date} setDate={props.setDate} duration={props.duration} setDuration={props.setDuration} notes={props.notes} setNotes={props.setNotes} />
    </div>
  );
}
