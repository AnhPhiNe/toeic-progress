import { useState } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { Keyboard } from 'lucide-react';
import { normalizeQuestionList, parseQuestionList, PART_NUMBERS, questionsOfPart, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { ResultImageButton } from './WrongQuestionGrid';
import type { AppliedResultScore, ResultScoreStore } from './ResultScoreReview';
import type { ScoreSource } from '../lib/fullTestScore';
import type { PartTimingDurations, ResultImageTiming } from '@/shared/types';
import { PartTimingModal, PartTimingStrip } from './PartTimingModal';
import { DesktopManualEntry } from './DesktopManualEntry';
import { useWrongNumberDraft, type WrongNumberDraft } from '../lib/wrongNumberDraft';

const listening = (part: PartNumber) => part <= 4;
const fmtMinutes = (minutes: number) => { const m = Math.round(minutes); return m >= 60 ? `${Math.floor(m / 60)}g ${String(m % 60).padStart(2, '0')}p` : `${m} phút`; };

interface Props {
  onTiming?: (value: ResultImageTiming) => void;
  numberDraft?: WrongNumberDraft;
  onNumberDraft?: (value: WrongNumberDraft) => void;
  wrong: number[];
  onWrong: (wrong: number[]) => void;
  preview: { totalScore?: number; scaledListening?: number; scaledReading?: number } | null;
  onCounts: () => void;
  onOfficial: () => void;
  notes: string;
  setNotes: (value: string) => void;
  onScores?: (score: AppliedResultScore) => void;
  onScoresPending?: (pending: boolean) => void;
  scoreStore?: ResultScoreStore;
  scoreSource?: ScoreSource;
  manualListening?: string;
  manualReading?: string;
  manualTotal?: string;
  onRevertScore?: () => void;
  partDurations?: PartTimingDurations;
  onPartDurationsChange?: (durations: PartTimingDurations | undefined) => void;
  initialFiles?: File[];
  onInitialFilesHandled?: () => void;
  /** false = AI-first view (paste a result image); true = the manual tools (200-question grid, typed numbers, scores). */
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  /** The short manual view (official L/R plus a typed wrong list) between the paste view and the grid. */
  minimalOpen: boolean;
  onMinimalOpenChange: (open: boolean) => void;
  onSections: (listening: string, reading: string) => void;
  /** Minutes of the total time once known (typed or read from an image); undefined while unrecorded. */
  knownMinutes?: number;
  onOpenDetails: () => void;
  /** Test name, date and time shown as chips inside the review card; a chip opens the fields to edit them. */
  meta?: { name: string; dateLabel: string; onEdit: () => void };
}

/**
 * Computer Full Test. By default one large area to paste the result screenshot; "Nhập tay" opens the
 * manual tools: all 200 questions on one screen, where clicking a number marks it wrong.
 * The score is worked out from the marks, so per-Part counts are never typed here.
 */
export function DesktopFullTestBody({ wrong, onWrong, preview, onCounts, onOfficial, notes, setNotes, onScores, onScoresPending, scoreStore, scoreSource, manualListening, manualReading, manualTotal, onRevertScore, partDurations, onPartDurationsChange, numberDraft, onNumberDraft, onTiming, initialFiles, onInitialFilesHandled, manualOpen, onManualOpenChange, minimalOpen, onMinimalOpenChange, onSections, knownMinutes, onOpenDetails , meta}: Props) {
  const [timingModalOpen, setTimingModalOpen] = useState(false);
  const { typing, text, setText, setTyping, open: openNumbers, cancel: cancelNumbers } = useWrongNumberDraft(wrong, numberDraft, onNumberDraft);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(Boolean(notes));
  const isOfficial = Boolean(scoreSource && scoreSource !== 'ESTIMATED');
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
      <p className={'mb-1.5 flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-wider ' + (title === 'Listening' ? 'text-indigo-700 dark:text-indigo-300' : 'text-teal-700 dark:text-teal-300')}>
        <span className={'h-1.5 w-1.5 rounded-full ' + (title === 'Listening' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-teal-600 dark:bg-teal-400')} aria-hidden="true" />
        {title}
      </p>
      {parts.map(part => (
        <div key={part} className="mb-1 flex gap-2">
          <div className="w-[34px] shrink-0 text-center">
            <span className={'flex h-6 items-center justify-center rounded-[7px] text-[11.5px] font-black text-white ' + (listening(part) ? 'bg-indigo-600' : 'bg-teal-600')}>P{part}</span>
            {byPart[part].length > 0 && <span className="mt-0.5 block text-[11px] font-black tabular-nums text-rose-600 dark:text-rose-400">{byPart[part].length} sai</span>}
          </div>
          <div className="grid grid-cols-[repeat(10,29px)] gap-[3px]" role="group" aria-label={`Câu sai Part ${part}`}>
            {questionsOfPart(part).map(question => {
              const on = marked.has(question);
              return (
                <button key={question} type="button" aria-pressed={on} aria-label={`Câu ${question}`} onClick={() => toggle(question)}
                  className={'h-[25px] cursor-pointer rounded-[7px] border-[1.5px] text-[11.5px] font-bold tabular-nums transition-colors ' + (on
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
  const aiFirst = !manualOpen && !minimalOpen;
  const showSummary = aiFirst && (hasMarks || isOfficial);
  const shownTotal = isOfficial ? preview?.totalScore ?? (manualTotal || '—') : hasMarks ? preview?.totalScore ?? '—' : '—';
  const shownL = isOfficial ? preview?.scaledListening ?? (manualListening || '—') : hasMarks ? preview?.scaledListening ?? '—' : '—';
  const shownR = isOfficial ? preview?.scaledReading ?? (manualReading || '—') : hasMarks ? preview?.scaledReading ?? '—' : '—';
  // AI-first review (design/previews/mock-log-v3.html, 3B): green score card, then all 200 numbered
  // questions laid out like the answer sheet so the learner can check what Sóc read; a click toggles a question.
  const pen = <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 14 L3 10 L11 2 L14 5 L6 13Z" fill="currentColor" /></svg>;
  const bar = (value: number | string) => typeof value === 'number' ? `${Math.min(100, value / 495 * 100)}%` : '0%';
  const summaryTable = (api: { editScore: () => void }) => (
    <div className="rdl-review">
      <div className="rdl-hero">
        <span className="rdl-ring" aria-hidden="true" />
        <div className="rdl-hl">
          <button type="button" className="rdl-big" onClick={api.editScore} aria-label="Sửa điểm" title={isOfficial ? 'Điểm từ đề · bấm để sửa' : 'Điểm ước tính từ câu sai · bấm để sửa'}>
            {!isOfficial && hasMarks ? <i>~</i> : null}{shownTotal}<small>/990</small>
          </button>
          <div className="rdl-lr">
            <div><span>Nghe <b>{shownL}</b></span><i><b style={{ width: bar(shownL) }} /></i></div>
            <div><span>Đọc <b>{shownR}</b></span><i><b style={{ width: bar(shownR) }} /></i></div>
          </div>
        </div>
        {meta && (
          <div className="rdl-hm">
            <button type="button" className="rdl-hp is-name" onClick={meta.onEdit} title={meta.name || 'Đặt tên đề'}><span className="rdl-hp-t">{meta.name || 'Đặt tên đề'}</span>{pen}</button>
            <div>
              <button type="button" className="rdl-hp" onClick={meta.onEdit}>{meta.dateLabel}{pen}</button>
              <button type="button" className="rdl-hp" onClick={onOpenDetails}>{knownMinutes ? fmtMinutes(knownMinutes) : 'Thời gian'}{pen}</button>
            </div>
          </div>
        )}
        <Soc state="idle" size={104} className="rdl-hero-soc" />
      </div>
      <div className="rdl-wrong">
        <span>Sai {wrong.length} câu:</span>
        {wrong.slice(0, 7).map(question => <b key={question}>{question}</b>)}
        {wrong.length > 7 && <span>+{wrong.length - 7}</span>}
        <button type="button" className="rdl-wrong-edit" onClick={() => onManualOpenChange(true)}>Sửa</button>
      </div>
    </div>
  );
  return (
    <div className={manualOpen ? 'grid gap-6 lg:grid-cols-[1fr_276px]' : 'mx-auto grid w-full max-w-[560px] gap-3'}>
      {/* Kept mounted (just hidden) so the image reader and its drafts survive switching views */}
      <div className={manualOpen ? 'min-w-0 overflow-x-auto [scrollbar-gutter:stable] pb-2' : 'hidden'}>
        <div className="flex flex-nowrap gap-x-6 items-start">
          {section('Listening', PART_NUMBERS.filter(listening))}
          {section('Reading', PART_NUMBERS.filter(part => !listening(part)))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 max-lg:order-first">
        {manualOpen && (
          <button type="button" onClick={() => { onManualOpenChange(false); onMinimalOpenChange(true); }}
            className="w-fit cursor-pointer text-[13px] font-black text-indigo-700 hover:underline dark:text-indigo-300">
            ‹ Quay lại
          </button>
        )}
        {minimalOpen && !manualOpen && (
          <DesktopManualEntry wrong={wrong} onWrong={onWrong} numberDraft={numberDraft} onNumberDraft={onNumberDraft}
            listening={manualListening ?? ''} reading={manualReading ?? ''} officialTotal={scoreSource === 'MANUAL_TOTAL' ? manualTotal : undefined}
            onSections={onSections} onBack={() => onMinimalOpenChange(false)} onGrid={() => onManualOpenChange(true)} />
        )}
        <div className={minimalOpen && !manualOpen ? 'hidden' : undefined}>
        <ResultImageButton
          pasteEnabled={!minimalOpen || manualOpen}
          compactDrop={showSummary}
          flatCard={aiFirst}
          onTiming={onTiming}
          initialFiles={initialFiles}
          onInitialFilesHandled={onInitialFilesHandled}
          desktop
          dropzone={aiFirst}
          extraMenu={aiFirst && !minimalOpen ? [{ key: 'pick', label: 'Tự chọn câu sai', onClick: () => onManualOpenChange(true) }] : undefined}
          scoreCard={aiFirst ? (showSummary ? summaryTable : undefined) :
            <div>
              <div className={`flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider ${
                isOfficial ? 'text-amber-800 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'
              }`}>
                <span className={`flex items-center gap-1.5 ${isOfficial ? 'text-amber-900 dark:text-amber-200 font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                  <span className={`h-2 w-2 rounded-full ${isOfficial ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} aria-hidden="true" />
                  {isOfficial ? 'Điểm từ đề thi' : 'Điểm ước tính'}
                </span>
                {isOfficial ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-black text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                    Chính thức
                  </span>
                ) : hasMarks ? (
                  <span className="font-black normal-case tabular-nums text-rose-600 dark:text-rose-400">{wrong.length} câu sai</span>
                ) : (
                  <span className="font-semibold normal-case text-slate-400">Chạm câu sai</span>
                )}
              </div>
              <p className="mt-0.5 text-[40px] font-black leading-none tracking-tight tabular-nums text-slate-950 dark:text-white">
                {isOfficial ? preview?.totalScore ?? (manualTotal || '—') : hasMarks ? preview?.totalScore ?? '—' : '—'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs font-black tabular-nums">
                <span className="rounded-lg border border-indigo-200 bg-indigo-50 py-1 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                  L {isOfficial ? preview?.scaledListening ?? (manualListening || '—') : hasMarks ? preview?.scaledListening ?? '—' : '—'}
                </span>
                <span className="rounded-lg border border-teal-200 bg-teal-50 py-1 text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/50 dark:text-teal-300">
                  R {isOfficial ? preview?.scaledReading ?? (manualReading || '—') : hasMarks ? preview?.scaledReading ?? '—' : '—'}
                </span>
              </div>
              {isOfficial && hasMarks && (
                <p className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  Đã đánh dấu {wrong.length} câu sai trên đề
                </p>
              )}
            </div>
          }
          marks={wrong}
          onScores={onScores}
          onScoresPending={onScoresPending}
          scoreStore={scoreStore}
          appliedScore={isOfficial ? {
            listening: manualListening,
            reading: manualReading,
            total: manualTotal || (preview?.totalScore ? String(preview.totalScore) : '')
          } : undefined}
          onRevertScore={onRevertScore}
          onRead={numbers => onWrong(normalizeQuestionList([...wrong, ...numbers]))}
          isTyping={manualOpen && typing}
          typingContent={
            <div className="space-y-2">
              <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">
                Số câu sai
                <textarea
                  aria-label="Số câu sai"
                  autoFocus
                  rows={3}
                  value={text}
                  onChange={event => { setText(event.target.value); setInvalid([]); }}
                  placeholder="3 15 22 101-104"
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                  className="mt-1 w-full resize-none rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-[14px] font-bold tabular-nums text-slate-950 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">Cách nhau bằng dấu cách; 101-104 là một dải câu.</p>
              {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">Không đọc được: {invalid.join(', ')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={applyTyped} className="min-h-10 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[13.5px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">Áp dụng</button>
                <button type="button" onClick={() => { cancelNumbers(); setInvalid([]); }} className="min-h-10 cursor-pointer px-3 text-[13.5px] font-bold text-slate-500 dark:text-slate-400">Hủy</button>
              </div>
            </div>
          }
          extraButton={
            <button
              type="button"
              onClick={openNumbers}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3 text-xs font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-slate-50 active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-slate-900 dark:text-white dark:shadow-none"
            >
              <Keyboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              Gõ số câu
            </button>
          }
          timingContent={
            <PartTimingStrip
              durations={partDurations}
              onOpenEdit={() => setTimingModalOpen(true)}
            />
          }
        />
        </div>


        {/* Slim Utility Bar: Ghi chú & Chế độ nhập khác */}
        <div className={'rounded-xl border border-slate-200 bg-slate-50/70 p-2 items-center justify-between text-[11px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 ' + (manualOpen ? 'flex' : 'hidden')}>
          <button
            type="button"
            onClick={() => setShowNotes(prev => !prev)}
            aria-label={showNotes ? 'Đóng ghi chú' : 'Thêm ghi chú'}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer ${
              showNotes || notes.trim()
                ? 'bg-amber-100 text-amber-900 font-black dark:bg-amber-950/60 dark:text-amber-200'
                : 'hover:bg-white hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
          >
            <span aria-hidden="true">📝</span>
            <span>{notes.trim() ? 'Có ghi chú' : 'Ghi chú'}</span>
          </button>

          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>

          <div className="flex items-center gap-1.5" role="group" aria-label="Chế độ nhập khác">
            <button
              type="button"
              onClick={onCounts}
              className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-bold hover:bg-white hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              title="Chuyển sang chế độ nhập số câu đúng mỗi Part"
            >
              Số câu đúng mỗi Part
            </button>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOfficial}
              className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-bold hover:bg-white hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              title="Chuyển sang chế độ nhập điểm chính thức ETS"
            >
              Điểm chính thức
            </button>
          </div>
        </div>

        {/* Ô Ghi chú mở rộng (nếu được mở hoặc đã có text) */}
        {showNotes && (
          <div className="animate-sheet-up space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <label htmlFor="session-notes" className="cursor-pointer">Ghi chú bài thi (tùy chọn)</label>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Thu gọn ✕
              </button>
            </div>
            <textarea
              id="session-notes"
              autoFocus
              rows={2}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="VD: Làm lúc mệt, mất tập trung Part 7..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        )}
      </div>

      <PartTimingModal
        isOpen={timingModalOpen}
        onClose={() => setTimingModalOpen(false)}
        value={partDurations}
        onChange={onPartDurationsChange ?? (() => {})}
      />
    </div>
  );
}
