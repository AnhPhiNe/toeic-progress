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

  const section = (title: string, parts: PartNumber[]) => {
    const isL = title === 'Listening';
    const count = parts.reduce((sum, part) => sum + byPart[part].length, 0);
    return (
      <div className={'rdg-sec ' + (isL ? 'is-l' : 'is-r')}>
        <p className="rdg-sec-h">
          <span aria-hidden="true">{isL ? '🎧' : '📖'}</span>
          <b>{isL ? 'Nghe' : 'Đọc'}</b>
          <small>{isL ? 'Part 1 – 4 · 100 câu' : 'Part 5 – 7 · 100 câu'}</small>
          {count > 0 && <em>{count} sai</em>}
        </p>
        {parts.map(part => (
          <div key={part} className="rdg-part">
            <div className="rdg-part-t">
              <span>P{part}</span>
              {byPart[part].length > 0 && <small>{byPart[part].length} sai</small>}
            </div>
            <div className="rdg-cells" role="group" aria-label={`Câu sai Part ${part}`}>
              {questionsOfPart(part).map(question => (
                <button key={question} type="button" aria-pressed={marked.has(question)} aria-label={`Câu ${question}`} onClick={() => toggle(question)}>{question}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

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
            className="w-fit cursor-pointer text-[13px] font-black text-[var(--rd-violet-d)] hover:underline">
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
          extraMenu={
            aiFirst && !minimalOpen
              ? [{ key: 'pick', label: 'Tự chọn câu sai', onClick: () => onManualOpenChange(true) }]
              : manualOpen
                ? [
                    { key: 'notes', label: notes.trim() ? 'Ghi chú (đã có)' : 'Ghi chú bài thi', pressed: showNotes, onClick: () => setShowNotes(prev => !prev) },
                    { key: 'counts', label: 'Số câu đúng mỗi Part', onClick: onCounts },
                    { key: 'official', label: 'Điểm chính thức', onClick: onOfficial }
                  ]
                : undefined
          }
          scoreCard={aiFirst ? (showSummary ? summaryTable : undefined) :
            <div>
              <div className={`flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider ${
                isOfficial ? 'text-[#8a6a10]' : 'text-[var(--rd-mut)]'
              }`}>
                <span className={`flex items-center gap-1.5 ${isOfficial ? 'text-[#8a6a10] font-black' : 'text-[#5c675f]'}`}>
                  <span className={`h-2 w-2 rounded-full ${isOfficial ? 'bg-[var(--rd-gold)] animate-pulse' : 'bg-[var(--rd-green)]'}`} aria-hidden="true" />
                  {isOfficial ? 'Điểm từ đề thi' : 'Điểm ước tính'}
                </span>
                {isOfficial ? (
                  <span className="rounded bg-[var(--rd-gold-l)] px-1.5 py-0.5 text-[9.5px] font-black text-[#8a6a10]">
                    Chính thức
                  </span>
                ) : hasMarks ? (
                  <span className="font-black normal-case tabular-nums text-[var(--rd-pink-d)]">{wrong.length} câu sai</span>
                ) : (
                  <span className="font-semibold normal-case text-[var(--rd-mut)]">Chạm câu sai</span>
                )}
              </div>
              <p className="mt-0.5 text-[40px] font-black leading-none tracking-tight tabular-nums text-[var(--rd-ink)]">
                {isOfficial ? preview?.totalScore ?? (manualTotal || '—') : hasMarks ? preview?.totalScore ?? '—' : '—'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs font-black tabular-nums">
                <span className="rounded-lg border border-[var(--rd-violet)] bg-[var(--rd-violet-l)] py-1 text-[var(--rd-violet-d)]">
                  L {isOfficial ? preview?.scaledListening ?? (manualListening || '—') : hasMarks ? preview?.scaledListening ?? '—' : '—'}
                </span>
                <span className="rounded-lg border border-[#bfece6] bg-[#e0f7f4] py-1 text-[var(--rd-teal-d)]">
                  R {isOfficial ? preview?.scaledReading ?? (manualReading || '—') : hasMarks ? preview?.scaledReading ?? '—' : '—'}
                </span>
              </div>
              {isOfficial && hasMarks && (
                <p className="mt-1.5 text-[11px] font-bold text-[var(--rd-pink-d)]">
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
              <label className="block text-[13px] font-bold text-[#5c675f]">
                Số câu sai
                <textarea
                  aria-label="Số câu sai"
                  autoFocus
                  rows={3}
                  value={text}
                  onChange={event => { setText(event.target.value); setInvalid([]); }}
                  placeholder="3 15 22 101-104"
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                  className="mt-1 w-full resize-none rounded-xl border-2 border-[var(--rd-line)] bg-white px-3 py-2 text-[14px] font-bold tabular-nums text-[var(--rd-ink)] focus:border-[var(--rd-violet)] focus:outline-none"
                />
              </label>
              <p className="text-[12px] font-semibold text-[var(--rd-mut)]">Cách nhau bằng dấu cách; 101-104 là một dải câu.</p>
              {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-[var(--rd-pink-d)]">Không đọc được: {invalid.join(', ')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={applyTyped} className="min-h-10 flex-1 cursor-pointer rounded-xl border-2 border-[var(--rd-line)] bg-white text-[13.5px] font-black text-[var(--rd-ink)]">Áp dụng</button>
                <button type="button" onClick={() => { cancelNumbers(); setInvalid([]); }} className="min-h-10 cursor-pointer px-3 text-[13.5px] font-bold text-[var(--rd-mut)]">Hủy</button>
              </div>
            </div>
          }
          extraButton={
            <button
              type="button"
              onClick={openNumbers}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rd-line)] bg-white px-3 text-xs font-black text-[var(--rd-ink)] shadow-[0_3px_0_var(--rd-line)] hover:bg-[var(--rd-soft)] active:translate-x-px active:translate-y-px active:shadow-none"
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


        {/* Ô Ghi chú mở rộng (nếu được mở hoặc đã có text) */}
        {manualOpen && showNotes && (
          <div className="animate-sheet-up space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--rd-mut)]">
              <label htmlFor="session-notes" className="cursor-pointer">Ghi chú bài thi (tùy chọn)</label>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="text-[10px] text-[var(--rd-mut)] hover:text-[#5c675f] cursor-pointer"
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
              className="w-full rounded-xl border border-[var(--rd-line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--rd-ink)] placeholder:text-[var(--rd-mut)] focus:border-[var(--rd-line)] focus:outline-none"
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
