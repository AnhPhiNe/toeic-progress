import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal, Sparkles, Trash2 } from 'lucide-react';
import { ERROR_CATEGORY_LABELS, type MistakeEntry } from '@/shared/types';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { AnswerDoubtNote } from '@/features/mistakes/components/AnswerDoubtNote';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { reviewStatus, type ReviewStatusKind } from '@/features/mistakes/lib/review';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { canReview } from '@/features/mistakes/lib/spacedRepetition';
import { QuestionContext } from '@/features/mistakes/components/QuestionContext';
import { readQuestion } from '@/features/mistakes/lib/questionText';

const STATUS_STYLE: Record<ReviewStatusKind, { text: string; dot?: string }> = {
  overdue: { text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  due: { text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  scheduled: { text: 'text-slate-500 dark:text-slate-400' },
  mastered: { text: 'text-emerald-700 dark:text-emerald-400' },
  incomplete: { text: 'text-slate-500 dark:text-slate-400' }
};

export const PartBadge: React.FC<{ part: number }> = ({ part }) => (
  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
    part <= 4 ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
  }`}>P{part}</span>
);

interface MistakeCardProps {
  mistake: MistakeEntry;
  expanded: boolean;
  onToggle: () => void;
  onReview: () => void;
  onEdit: () => void;
  onReuseReading?: () => void;
  onDelete: () => void;
  onMarkMastered: () => void;
  onReopen: () => void;
  /** Phones: one-line row without the ⋮ menu; the actions live in the expanded card. */
  compact?: boolean;
  /** Status line shown on compact rows outside the "Cần ôn" group (e.g. "Ôn sau 3 ngày"). */
  showStatus?: boolean;
  /** Asks AI for the explanation of a card that has its question but none yet (cards read from a screenshot). */
  onExplain?: () => void;
  explaining?: boolean;
  /** "Viết lời giải" when a screenshot reading already paid for it, "Giải thích với AI" otherwise. */
  explainLabel?: string;
  /** Settles a doubt about the page's answer: switch to AI's option, or keep the page's. */
  onResolveDoubt?: (switchToAI: boolean) => void;
}

/** A card can be explained once it has a written question and its options; Part 1 needs its picture, which is not kept. */
export function canExplain(mistake: MistakeEntry): boolean {
  return !mistake.explanation && !mistake.trapTip?.trim() && mistake.part !== 1 && Boolean(mistake.question?.trim()) && (mistake.options?.length ?? 0) >= 2;
}

export const MistakeCard: React.FC<MistakeCardProps> = ({
  mistake, expanded, onToggle, onReview, onEdit, onReuseReading, onDelete, onMarkMastered, onReopen, compact = false, showStatus = false, onExplain, explaining = false, explainLabel = 'Giải thích với AI', onResolveDoubt
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = reviewStatus(mistake);
  const style = STATUS_STYLE[status.kind];
  const { question: stem, context } = readQuestion(mistake);
  const question = stem || 'Chưa trích được câu hỏi';
  const quiz = resolveQuizOptions(mistake);
  const doubtNote = mistake.answerDoubt && onResolveDoubt && optionLetter(mistake.correctAnswer) !== mistake.answerDoubt
    ? <AnswerDoubtNote doubt={mistake.answerDoubt} current={optionLetter(mistake.correctAnswer)} onSwitch={() => onResolveDoubt(true)} onKeep={() => onResolveDoubt(false)} />
    : null;
  const correctLabel = mistake.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : mistake.answerProvidedBy === 'LEARNER' ? 'Đáp án đã nhập' : 'Đáp án từ đề';

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const menuItem = (label: string, action: () => void, danger = false, disabled = false) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => { setMenuOpen(false); action(); }}
      className={`block w-full px-3 py-2 text-left text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
        danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-40`}>{label}</button>
  );

  if (compact) {
    // The list already groups by status, so the number prefix and status text are dropped from the row.
    const shortQuestion = question.replace(/^(?:câu|question|q)\s*\d+\s*(?:\([^)]*\)\s*)?[:.)-]\s*/i, '');
    const action = 'min-h-11 whitespace-nowrap rounded-xl border-[1.5px] border-stone-300 bg-white px-3 text-[14px] font-bold text-slate-800 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
    return (
      <div className="notebook-card bg-white dark:bg-[#111A2C]">
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? 'Thu gọn' : 'Mở'} câu: ${question}`}
          className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer">
          <span className={'flex h-[26px] w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-black text-white ' + (mistake.part <= 4 ? 'bg-indigo-600' : 'bg-teal-600')}>P{mistake.part}</span>
          <span className="min-w-0 flex-1">
            <span className={'text-[15px] font-bold leading-snug text-slate-900 dark:text-white ' + (expanded ? 'block' : 'block truncate')}>{expanded ? question : shortQuestion}</span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
              {mistake.sourceTestName && <span className="truncate font-semibold text-slate-400 dark:text-slate-500">{mistake.sourceTestName}</span>}
              {mistake.sourceTestName && (status.kind === 'overdue' || status.kind === 'due' || (showStatus && status.kind !== 'incomplete')) && <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>}
              {status.kind === 'overdue' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />{status.label}
                </span>
              )}
              {status.kind === 'due' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />{status.label}
                </span>
              )}
              {showStatus && status.kind !== 'overdue' && status.kind !== 'due' && (
                <span className="font-semibold text-slate-400 dark:text-slate-500">{status.label}</span>
              )}
            </div>
          </span>
          <ChevronDown className={'h-5 w-5 shrink-0 text-slate-300 transition-transform dark:text-slate-600 ' + (expanded ? 'rotate-180' : '-rotate-90')} aria-hidden="true" />
        </button>
        {expanded && (
          <div className="space-y-3 px-4 pb-4">
            <QuestionContext context={context} part={mistake.part} />
            {quiz.options.length > 0 ? (
              <OptionList options={quiz.options} chosen={getUserChoice(mistake)} correctLabel={correctLabel} showMeanings={mistake.part !== 7} />
            ) : mistake.correctAnswer && (
              <p className="text-sm text-slate-700 dark:text-slate-300"><span className="font-bold text-slate-900 dark:text-white">{correctLabel}:</span> {mistake.correctAnswer}</p>
            )}
            {doubtNote}
            {onExplain && canExplain(mistake) && <button type="button" onClick={onExplain} disabled={explaining}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-violet-100 text-[14px] font-black text-violet-950 disabled:cursor-wait disabled:opacity-60 dark:border-violet-300 dark:bg-violet-950 dark:text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />{explaining ? 'Đang viết lời giải…' : explainLabel}</button>}
            <ExplanationView optionMeanings={mistake.part === 7 ? quiz.options : undefined} explanation={mistake.explanation} trapTip={mistake.trapTip}
              extra={[
                ['Lý do bạn đã chọn', mistake.userReason ?? (mistake.userMistake === '(Không ghi nhận đáp án nhầm)' ? '' : mistake.userMistake)],
                ['Nhóm lỗi', ERROR_CATEGORY_LABELS[mistake.category]?.label ?? '']
              ]} />
            {onReuseReading && <button type="button" onClick={onReuseReading} className="min-h-11 w-full rounded-xl border-[1.5px] border-dashed border-stone-300 text-[14px] font-bold text-blue-700 cursor-pointer dark:border-slate-600 dark:text-blue-300">＋ Câu khác cùng bài đọc</button>}
            {/* One row that never wraps at 320px: short labels, delete as an icon. */}
            <div className="flex gap-2" role="group" aria-label="Thao tác với thẻ">
              <button type="button" onClick={onReview} disabled={!canReview(mistake)} aria-label="Ôn câu này"
                className="min-h-11 flex-1 rounded-xl border-2 border-slate-900 bg-emerald-400 px-3 text-[14px] font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-200 dark:shadow-none">Ôn</button>
              <button type="button" onClick={onEdit} className={action + ' flex-1'}>Sửa</button>
              {mistake.status === 'MASTERED'
                ? <button type="button" onClick={onReopen} aria-label="Ôn lại từ đầu" className={action + ' flex-1'}>Ôn lại</button>
                : <button type="button" onClick={onMarkMastered} disabled={!canReview(mistake)} aria-label="Đánh dấu đã thuộc" className={action + ' flex-1'}>Đã thuộc</button>}
              <button type="button" onClick={onDelete} aria-label="Xóa" title="Xóa"
                className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-stone-300 bg-white text-rose-600 cursor-pointer dark:border-slate-600 dark:bg-slate-900 dark:text-rose-400"><Trash2 className="h-[18px] w-[18px]" aria-hidden="true" /></button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`notebook-card ${expanded ? 'bg-slate-50/60 dark:bg-slate-800/20' : ''}`}>
      <div className="notebook-row grid grid-cols-[minmax(0,1fr)_32px] items-start gap-2 px-3.5 py-2.5 sm:items-center sm:px-5">
        <button type="button" onClick={onToggle} aria-expanded={expanded}
          aria-label={`${expanded ? 'Thu gọn' : 'Mở'} câu: ${question}`}
          className="notebook-row-toggle grid min-h-11 min-w-0 cursor-pointer grid-cols-1 gap-1.5 text-left sm:grid-cols-[32px_minmax(0,1fr)_160px] sm:items-center sm:gap-3">
          <span className="notebook-row-meta flex min-h-8 items-center gap-2 sm:contents">
            <PartBadge part={mistake.part} />
            <span className={`ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold sm:hidden ${style.text} ${status.kind === 'due' ? 'bg-amber-50 dark:bg-amber-950/40' : status.kind === 'overdue' ? 'bg-rose-50 dark:bg-rose-950/40' : ''}`}>
              {style.dot && <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />}{status.label}
            </span>
          </span>
          <span className="min-w-0 text-[15px] leading-snug text-slate-900 dark:text-white">
            <span className={expanded ? 'block font-bold' : 'block font-semibold line-clamp-2'}>{question}</span>
            {(mistake.sourceTestName || mistake.category !== 'OTHER') && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                {mistake.sourceTestName && <span>{mistake.sourceTestName}</span>}
                {mistake.sourceTestName && mistake.category !== 'OTHER' && <span aria-hidden="true">·</span>}
                {mistake.category !== 'OTHER' && (
                  <span className="font-semibold" style={{ color: ERROR_CATEGORY_LABELS[mistake.category]?.color }}>
                    {ERROR_CATEGORY_LABELS[mistake.category]?.label}
                  </span>
                )}
              </span>
            )}
          </span>
          <span className={`hidden items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold sm:inline-flex sm:justify-self-end ${style.text} ${status.kind === 'due' ? 'bg-amber-50 dark:bg-amber-950/40' : status.kind === 'mastered' ? 'bg-emerald-50 dark:bg-emerald-950/40' : status.kind === 'overdue' ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
            {style.dot && <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />}{status.label}
          </span>
        </button>
        <div ref={menuRef} className="relative shrink-0">
          <button type="button" onClick={() => setMenuOpen(value => !value)} aria-haspopup="menu" aria-expanded={menuOpen}
            aria-label="Tùy chọn thẻ" className="notebook-menu-trigger flex min-h-8 min-w-8 items-center justify-center rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border-2 border-slate-900 bg-white py-1 shadow-[3px_3px_0px_#0f172a] dark:border-slate-600 dark:bg-[#121A2B]">
              {menuItem('Ôn câu này', onReview, false, !canReview(mistake))}
              {menuItem('Sửa', onEdit)}
              {onReuseReading && menuItem('Thêm câu cùng bài đọc', onReuseReading)}
              {mistake.status === 'MASTERED' ? menuItem('Ôn lại từ đầu', onReopen) : menuItem('Đánh dấu đã thuộc', onMarkMastered, false, !canReview(mistake))}
              {menuItem('Xóa', onDelete, true)}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 px-3.5 pb-4 sm:pl-[60px] sm:pr-6">
          <QuestionContext context={context} part={mistake.part} />
          {quiz.options.length > 0 ? (
            <OptionList options={quiz.options} chosen={getUserChoice(mistake)} correctLabel={correctLabel} showMeanings={mistake.part !== 7} />
          ) : mistake.correctAnswer && (
            <p className="text-sm text-slate-700 dark:text-slate-300"><span className="font-bold text-slate-900 dark:text-white">{correctLabel}:</span> {mistake.correctAnswer}</p>
          )}
          {doubtNote}
          {onExplain && canExplain(mistake) && <button type="button" onClick={onExplain} disabled={explaining}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-violet-100 text-[14px] font-black text-violet-950 disabled:cursor-wait disabled:opacity-60 dark:border-violet-300 dark:bg-violet-950 dark:text-white">
            <Sparkles className="h-4 w-4" aria-hidden="true" />{explaining ? 'Đang viết lời giải…' : explainLabel}</button>}
          <ExplanationView
            optionMeanings={mistake.part === 7 ? quiz.options : undefined}
            explanation={mistake.explanation}
            trapTip={mistake.trapTip}
            extra={[
              ['Lý do bạn đã chọn', mistake.userReason ?? (mistake.userMistake === '(Không ghi nhận đáp án nhầm)' ? '' : mistake.userMistake)],
              ['Nhóm lỗi', ERROR_CATEGORY_LABELS[mistake.category]?.label ?? '']
            ]}
            actions={(
              <button type="button" onClick={onReview} disabled={!canReview(mistake)}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-[13px] font-bold text-white hover:bg-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
                Ôn câu này
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
};
