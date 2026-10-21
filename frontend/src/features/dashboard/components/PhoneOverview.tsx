import { Plus, RotateCcw, Timer, Sparkles } from 'lucide-react';
import type { StudySession, ReadingPartType } from '@/shared/types';
import { ScoreReportCard } from './ScoreReportCard';

interface SummaryProps {
  latestTest: StudySession | null;
  latestTotal: number;
  previousTotal?: number;
  listeningScore?: number;
  readingScore?: number;
  targetScore: number;
  highestScore?: number;
  bestTestDate?: string;
  /** The latest test is also the record, so the card shows the record stamp */
  latestIsBest?: boolean;
  avgScore?: number;
  totalTests: number;
  diff?: number;
  hasDiff?: boolean;
  firstTotal?: number;
  dueMistakesCount?: number;
  weakestPart?: number;
  motto?: string;
  onOpenSessionLogger: () => void;
  onStartReview?: () => void;
  onNavigateToPacing?: (part: ReadingPartType) => void;
  onViewDetails?: () => void;
}

interface TodayTasksProps {
  dueMistakesCount?: number;
  weakestPart?: number;
  onStartReview?: () => void;
  onNavigateToPacing?: (part: ReadingPartType) => void;
  onOpenSessionLogger?: () => void;
}

function TodayTasks({
  dueMistakesCount = 0,
  weakestPart = 7,
  onStartReview,
  onNavigateToPacing,
  onOpenSessionLogger
}: TodayTasksProps) {
  const hasDueMistakes = dueMistakesCount > 0;
  const taskCount = 2;

  return (
    <section
      aria-label="Nhiệm vụ hôm nay"
      className="rounded-[22px] border-[1.5px] border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111A2C] overflow-hidden"
    >
      {/* Header tích hợp */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Nhiệm vụ hôm nay
        </h2>
        <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
          {taskCount} việc
        </span>
      </div>

      {/* Danh sách công việc */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {/* Việc 1: Ôn câu sai SRS đến hạn hoặc làm đề mới */}
        {hasDueMistakes ? (
          <div className="flex items-center justify-between gap-3 p-3.5 sm:px-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white">
                  Ôn {dueMistakesCount} câu sai
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Part 5, 6 · Quá hạn
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onStartReview}
              className="shrink-0 inline-flex items-center rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              Ôn ngay ›
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 p-3.5 sm:px-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white">
                  Làm đề mới hoặc ôn luyện Part yếu
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Không có câu sai quá hạn · Giữ vững nhịp học
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSessionLogger}
              className="shrink-0 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              Làm đề ›
            </button>
          </div>
        )}

        {/* Việc 2: Luyện tốc độ */}
        <div className="flex items-center justify-between gap-3 p-3.5 sm:px-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
              <Timer className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white">
                Luyện tốc độ Part {weakestPart || 7}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Tối ưu thời gian làm bài
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToPacing?.(weakestPart ? (`PART_${weakestPart}` as ReadingPartType) : 'PART_7')}
            className="shrink-0 inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            Luyện ›
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Phones (<768px): the latest score is the one number a learner opens the app for, so the
 * score report leads, with a sleek Part breakdown link and grouped daily tasks container.
 */
export function PhoneSummary({
  latestTest,
  latestTotal,
  previousTotal,
  listeningScore,
  readingScore,
  targetScore,
  latestIsBest,
  totalTests,
  dueMistakesCount,
  weakestPart,
  motto,
  onOpenSessionLogger,
  onStartReview,
  onNavigateToPacing,
  onViewDetails
}: SummaryProps) {
  if (!latestTest) {
    return (
      <div className="space-y-4">
        <section className="rounded-[22px] border-[1.5px] border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#111A2C] dark:shadow-none">
          <h2 className="text-base font-black text-slate-950 dark:text-white">Chưa có bài thi nào</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Ghi điểm đề Full Test đầu tiên để thấy tiến bộ và khoảng cách tới mục tiêu {targetScore}.
          </p>
          <button
            type="button"
            onClick={onOpenSessionLogger}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white shadow-xs active:bg-blue-700 cursor-pointer"
          >
            <Plus size={18} aria-hidden="true" />Ghi điểm đề đầu tiên
          </button>
        </section>

        <TodayTasks
          dueMistakesCount={dueMistakesCount}
          weakestPart={weakestPart}
          onStartReview={onStartReview}
          onNavigateToPacing={onNavigateToPacing}
          onOpenSessionLogger={onOpenSessionLogger}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Thẻ Điểm */}
      <ScoreReportCard
        latestTest={latestTest}
        latestTotal={latestTotal}
        previousTotal={previousTotal}
        listeningScore={listeningScore}
        readingScore={readingScore}
        targetScore={targetScore}
        newRecord={Boolean(latestIsBest) && totalTests > 1}
      >
        <div className="p-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onViewDetails}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Xem chi tiết 7 Part & Bảng điểm</span>
            <span className="text-slate-400 font-bold" aria-hidden="true">›</span>
          </button>
        </div>
      </ScoreReportCard>

      {/* Khối Nhiệm vụ hôm nay */}
      <TodayTasks
        dueMistakesCount={dueMistakesCount}
        weakestPart={weakestPart}
        onStartReview={onStartReview}
        onNavigateToPacing={onNavigateToPacing}
        onOpenSessionLogger={onOpenSessionLogger}
      />

      {/* Châm ngôn học tập tinh tế nếu có */}
      {motto && (
        <div className="pt-1 pb-2 text-center px-4">
          <p className="text-[11.5px] italic font-medium text-slate-400 dark:text-slate-500 leading-relaxed">
            “{motto}”
          </p>
        </div>
      )}
    </div>
  );
}

export const PhoneOverview = PhoneSummary;
