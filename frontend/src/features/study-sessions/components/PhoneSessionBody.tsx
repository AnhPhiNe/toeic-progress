import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LRPartScore, PracticePartResult, StudySession, PartTimingDurations } from '@/shared/types';
import { PartTimingModal, PartTimingStrip } from './PartTimingModal';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { DateField } from '@/shared/components/DateField';
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
      className={'rde-in rde-in--num shrink-0' + (muted ? ' text-slate-500' : '')} />
  );
}


function DetailsRow({ date, setDate, duration, setDuration, notes, setNotes }: {
  date: string; setDate: (value: string) => void; duration: number; setDuration: (value: number) => void; notes: string; setNotes: (value: string) => void;
}) {
  const when = date === getTodayDateString() ? 'Hôm nay' : date.split('-').reverse().slice(0, 2).join('/');
  return (
    <details className="rde-details group">
      <summary>
        Ngày, thời gian, ghi chú
        <span>{when} · {duration} phút<ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <div className="space-y-3 px-3.5 pb-3.5">
        <div className="grid grid-cols-2 gap-3">
          <label className="rde-lab">Ngày làm
            <DateField id="session-date" required value={date} onChange={setDate} className="rde-in" />
          </label>
          <label className="rde-lab">Thời gian (phút)
            <input id="session-duration" type="number" inputMode="decimal" min="0.01" max="1440" step="any" required value={duration} onChange={event => setDuration(Number(event.target.value))} className="rde-in" />
          </label>
        </div>
        <label className="rde-lab">Ghi chú
          <textarea id="session-notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Tùy chọn" className="rde-in" />
        </label>
      </div>
    </details>
  );
}


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
  onRevertScore?: () => void;
  initialFiles?: File[];
  onInitialFilesHandled?: () => void;
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
    <div className={'rde-parts rde-parts--' + (title === 'Nghe' ? 'l' : 'r')}>
      <p className="rde-parts-h"><span>{title}</span><span>{raw}/100 câu</span></p>
      {parts.map(part => {
        const key = `part${part}` as keyof LRPartScore;
        const max = partMax(part);
        return (
          <div key={part} className="rde-part">
            <b>P{part}</b>
            <span>{PART_NAMES[part]}</span>
            <ScoreBox value={partScores[key]} max={max} label={`Số câu đúng Part ${part}`} onChange={value => onPart(key, value)} />
            <small>/{max}</small>
          </div>
        );
      })}
    </div>
  );
  const listeningRaw = partScores.part1 + partScores.part2 + partScores.part3 + partScores.part4;
  const readingRaw = partScores.part5 + partScores.part6 + partScores.part7;
  const manualInput = 'rde-in rde-in--big';

  return (
    <div className="rde space-y-3.5">
      <div>
        <TestNamePicker id="session-test-name" label="Tên đề" required value={props.testName} onChange={props.setTestName} suggestions={props.suggestions} />
        {props.retest && <p className="rde-retest mt-2">Làm lại · lần {props.retest.attempt} · cao nhất trước {props.retest.best}</p>}
      </div>

      <div className="sticky -top-4 z-20 -mx-4 bg-white px-4 pb-1.5 pt-4">
        <div className="rde-score rde-score--phone" aria-live="polite">
          <div>
            <span className="rde-score-k">{manual ? 'Điểm từ đề' : 'Ước tính'}</span>
            <p className="rde-score-t"><b>{shown.totalScore ?? '—'}</b><small>/990</small></p>
            {marked && <p className="rde-score-w">{props.wrongQuestions.length} câu sai</p>}
          </div>
          <div className="rde-score-lr">
            {([['Nghe', shown.scaledListening, 'l'], ['Đọc', shown.scaledReading, 'r']] as const).map(([label, value, tone]) => (
              <div key={label} className={'rde-bar rde-bar--' + tone}>
                <span><b>{label}</b> {value ?? '—'}</span>
                <i><em style={{ width: `${Math.min(100, ((value ?? 0) / 495) * 100)}%` }} /></i>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pacing Timing Strip for Reading Part 5-7 */}
      <div className="rde-box rde-box--tight">
        <PartTimingStrip
          durations={partDurations}
          onOpenEdit={() => setTimingModalOpen(true)}
        />
      </div>

      {manual && !fromWrong && (
        <div className="rde-box space-y-3">
          <div className="rde-seg rde-seg--sm" role="group" aria-label="Cách nhập điểm trực tiếp">
            {(['MANUAL_SECTIONS', 'MANUAL_TOTAL'] as const).map(mode => (
              <button key={mode} type="button" aria-pressed={scoreSource === mode} onClick={() => props.setManualMode(mode)}>
                {mode === 'MANUAL_SECTIONS' ? 'Nghe + Đọc' : 'Chỉ tổng điểm'}
              </button>
            ))}
          </div>
          {scoreSource === 'MANUAL_SECTIONS'
            ? <div className="grid grid-cols-2 gap-3">
                <label className="rde-lab rde-lab--l">Điểm Nghe /495
                  <input type="number" inputMode="numeric" min="5" max="495" step="5" required value={props.manualListening} onChange={event => props.setManualListening(event.target.value)} data-large-text className={manualInput} />
                </label>
                <label className="rde-lab rde-lab--r">Điểm Đọc /495
                  <input type="number" inputMode="numeric" min="5" max="495" step="5" required value={props.manualReading} onChange={event => props.setManualReading(event.target.value)} data-large-text className={manualInput} />
                </label>
              </div>
            : <label className="rde-lab">Tổng điểm /990
                <input type="number" inputMode="numeric" min="10" max="990" step="5" required value={props.manualTotal} onChange={event => props.setManualTotal(event.target.value)} data-large-text className={manualInput} />
              </label>}
          <label className="rde-check">
            <input type="checkbox" checked={props.includePartDetails} onChange={event => props.setIncludePartDetails(event.target.checked)} />
            <span>Ghi thêm số câu đúng từng Part</span>
          </label>
        </div>
      )}

      {fromWrong && <WrongQuestionGrid wrong={props.wrongQuestions} onTiming={props.onTiming} onChange={props.onWrong} onScores={props.onScores} onScoresPending={props.onScoresPending} scoreStore={props.scoreStore} numberDraft={props.numberDraft} onNumberDraft={props.onNumberDraft} appliedScore={manual ? { listening: props.manualListening, reading: props.manualReading, total: props.manualTotal || (preview?.totalScore ? String(preview.totalScore) : '') } : undefined} onRevertScore={props.onRevertScore} initialFiles={props.initialFiles} onInitialFilesHandled={props.onInitialFilesHandled} />}

      {showParts && <>
        {section('Nghe', [1, 2, 3, 4], listeningRaw)}
        {section('Đọc', [5, 6, 7], readingRaw)}
      </>}
      {manual && props.entry === 'wrong' && props.wrongQuestions.length > 0 && <p className="rde-note">Đã giữ {props.wrongQuestions.length} câu sai để ghi Sổ tay.</p>}

      {/* Other ways to enter the same test */}
      <div className="flex flex-wrap gap-2">
        {manual ? (
          <button type="button" onClick={() => props.useManual(false)} className="rde-quiet">‹ Quay lại ước tính điểm</button>
        ) : (
          <>
            <button type="button" onClick={() => props.onEntry(fromWrong ? 'counts' : 'wrong')} className="rde-quiet">
              {fromWrong ? 'Số câu đúng mỗi Part' : 'Đánh dấu câu sai'}
            </button>
            <button type="button" onClick={() => props.useManual(true)} className="rde-quiet">Điểm chính thức</button>
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
    <div className="rde space-y-3.5">
      <div>
        <p className="rde-lab mb-2 flex justify-between">Part đã luyện<span className="font-bold">chọn một hoặc nhiều</span></p>
        <div className="rde-ptiles grid grid-cols-7 gap-1.5" role="group" aria-label="Part đã luyện">
          {([1, 2, 3, 4, 5, 6, 7] as const).map(part => {
            const on = selected.has(part);
            return (
              <button key={part} type="button" aria-pressed={on} aria-label={`Part ${part}`} onClick={() => toggle(part)}>
                {part}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rde-parts rde-parts--v">
        {rows.map(row => (
          <div key={row.part} className="rde-part">
            <b>P{row.part}</b>
            <span>{PART_NAMES[row.part]}<small className="rde-sub">{row.total ? `${Math.round((row.correct / row.total) * 100)}%` : 'Số câu đúng'}</small></span>
            <ScoreBox value={row.correct} max={row.total} label={`Số câu đúng Part ${row.part}`} onChange={value => update(row.part, { correct: value })} />
            <small>/{row.total}</small>
          </div>
        ))}
      </div>

      <div>
        <p className="rde-lab mb-2 flex justify-between">Đề<span className="font-bold">không bắt buộc</span></p>
        <TestNamePicker id="session-test-name" label="Tên đề" value={props.testName} onChange={props.setTestName} suggestions={props.suggestions} />
      </div>

      <DetailsRow date={props.date} setDate={props.setDate} duration={props.duration} setDuration={props.setDuration} notes={props.notes} setNotes={props.setNotes} />
    </div>
  );
}
