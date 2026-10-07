import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ERROR_CATEGORY_LABELS, type MistakeEntry } from '@/shared/types';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { reviewStatus, type ReviewStatusKind } from '@/features/mistakes/lib/review';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';

const STATUS_STYLE: Record<ReviewStatusKind, { text: string; dot?: string }> = {
  overdue: { text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  due: { text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  scheduled: { text: 'text-slate-500 dark:text-slate-400' },
  mastered: { text: 'text-emerald-700 dark:text-emerald-400' }
};

export const PartBadge: React.FC<{ part: number }> = ({ part }) => (
  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
    part <= 4 ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
  }`}>P{part}</span>
);

/** First line is the question; any following lines (Part 7 excerpts, Part 6 context) are shown when expanded. */
export function splitQuestion(questionContext: string): { question: string; context: string } {
  const [question, ...rest] = questionContext.trim().split(/\r?\n/);
  return { question: question.trim(), context: rest.join('\n').trim() };
}

interface MistakeCardProps {
  mistake: MistakeEntry;
  expanded: boolean;
  onToggle: () => void;
  onReview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkMastered: () => void;
  onReopen: () => void;
}

export const MistakeCard: React.FC<MistakeCardProps> = ({
  mistake, expanded, onToggle, onReview, onEdit, onDelete, onMarkMastered, onReopen
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = reviewStatus(mistake);
  const style = STATUS_STYLE[status.kind];
  const { question, context } = splitQuestion(mistake.questionContext);
  const quiz = resolveQuizOptions(mistake);
  const correctLabel = mistake.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án';

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

  const menuItem = (label: string, action: () => void, danger = false) => (
    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); action(); }}
      className={`block w-full px-3 py-2 text-left text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
        danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'
      }`}>{label}</button>
  );

  return (
    <div className={expanded ? 'bg-slate-50/60 dark:bg-slate-800/20' : ''}>
      <div className="flex items-start gap-2 px-3.5 sm:px-5 py-3">
        <button type="button" onClick={onToggle} aria-expanded={expanded}
          aria-label={`${expanded ? 'Thu gọn' : 'Mở'} câu: ${question}`}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 text-left sm:flex-row sm:items-start sm:gap-3">
          <span className="flex items-center gap-2 sm:contents">
            <PartBadge part={mistake.part} />
            <span className={`ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold sm:hidden ${style.text}`}>
              {style.dot && <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />}{status.label}
            </span>
          </span>
          <span className={`min-w-0 flex-1 text-[15px] leading-snug text-slate-900 dark:text-white ${
            expanded ? 'font-bold' : 'font-semibold line-clamp-2'
          }`}>{question}</span>
          <span className={`hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap pt-0.5 text-[13px] font-semibold ${style.text}`}>
            {style.dot && <span className={`h-2 w-2 rounded-full ${style.dot}`} />}{status.label}
          </span>
        </button>
        <div ref={menuRef} className="relative shrink-0">
          <button type="button" onClick={() => setMenuOpen(value => !value)} aria-haspopup="menu" aria-expanded={menuOpen}
            aria-label="Tùy chọn thẻ" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border-2 border-slate-900 bg-white py-1 shadow-[3px_3px_0px_#0f172a] dark:border-slate-600 dark:bg-[#121A2B]">
              {menuItem('Ôn câu này', onReview)}
              {menuItem('Sửa', onEdit)}
              {mistake.status === 'MASTERED' ? menuItem('Ôn lại từ đầu', onReopen) : menuItem('Đánh dấu đã thuộc', onMarkMastered)}
              {menuItem('Xóa', onDelete, true)}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3.5 px-3.5 pb-5 sm:pl-[60px] sm:pr-6">
          {context && (
            <p className="whitespace-pre-line border-l-[3px] border-slate-300 pl-3 text-sm leading-relaxed text-slate-600 dark:border-slate-600 dark:text-slate-300">{context}</p>
          )}
          {quiz.options.length > 0 ? (
            <OptionList options={quiz.options} chosen={getUserChoice(mistake)} correctLabel={correctLabel} />
          ) : mistake.correctAnswer && (
            <p className="text-sm text-slate-700 dark:text-slate-300"><span className="font-bold text-slate-900 dark:text-white">Đáp án:</span> {mistake.correctAnswer}</p>
          )}
          <ExplanationView
            explanation={mistake.explanation}
            trapTip={mistake.trapTip}
            extra={[
              ['Bạn đã nhầm', mistake.userMistake === '(Không ghi nhận đáp án nhầm)' ? '' : mistake.userMistake],
              ['Nhóm lỗi', ERROR_CATEGORY_LABELS[mistake.category]?.label ?? '']
            ]}
            actions={(
              <button type="button" onClick={onReview}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-[13px] font-bold text-white hover:bg-blue-500 cursor-pointer">
                Ôn câu này
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
};
