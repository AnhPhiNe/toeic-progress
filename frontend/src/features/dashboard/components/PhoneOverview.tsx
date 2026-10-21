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
      className="rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1] overflow-hidden"
    >
      {/* Header tích hợp */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b-2 border-slate-900 dark:border-slate-700 dark:bg-slate-800/80">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
          Nhiệm vụ hôm nay
        </h2>
        <span className="inline-flex items-center rounded-lg bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 text-[11px] font-black text-blue-900 dark:text-blue-300 border border-slate-900 dark:border-slate-500 shadow-[1px_1px_0_0_#0f172a] dark:shadow-none">
          {taskCount} việc
        </span>
      </div>

      {/* Danh sách công việc */}
      <div className="divide-y-2 divide-slate-100 dark:divide-slate-800">
        {/* Việc 1: Ôn câu sai SRS đến hạn hoặc làm đề mới */}
        {hasDueMistakes ? (
          <div className="flex items-center justify-between gap-3 p-3.5 sm:px-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-amber-100 text-amber-900 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-400 dark:bg-amber-950/70 dark:text-amber-300 dark:shadow-none">
                <RotateCcw className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
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
              className="shrink-0 inline-flex items-center rounded-xl border-2 border-slate-900 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 text-xs font-black shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none transition-all cursor-pointer"
            >
              Ôn ngay ›
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 p-3.5 sm:px-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-emerald-100 text-emerald-900 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-400 dark:bg-emerald-950/70 dark:text-emerald-300 dark:shadow-none">
                <Sparkles className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
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
              className="shrink-0 inline-flex items-center rounded-xl border-2 border-slate-900 bg-emerald-400 hover:bg-emerald-300 text-slate-950 px-3 py-1.5 text-xs font-black shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none transition-all cursor-pointer"
            >
              Làm đề ›
            </button>
          </div>
        )}

        {/* Việc 2: Luyện tốc độ */}
        <div className="flex items-center justify-between gap-3 p-3.5 sm:px-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-indigo-100 text-indigo-900 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-400 dark:bg-indigo-950/70 dark:text-indigo-300 dark:shadow-none">
              <Timer className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
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
            className="shrink-0 inline-flex items-center rounded-xl border-2 border-slate-900 bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-1.5 text-xs font-black shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none transition-all cursor-pointer"
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
        <section className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
          <h2 className="text-base font-black text-slate-950 dark:text-white">Chưa có bài thi nào</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Ghi điểm đề Full Test đầu tiên để thấy tiến bộ và khoảng cách tới mục tiêu {targetScore}.
          </p>
          <button
            type="button"
            onClick={onOpenSessionLogger}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-blue-600 text-sm font-black text-white shadow-[2px_2px_0_0_#0f172a] hover:bg-blue-700 active:translate-x-px active:translate-y-px active:shadow-none cursor-pointer"
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
        <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5 sm:pt-1.5">
          <button
            type="button"
            onClick={onViewDetails}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border-2 border-slate-900 dark:border-slate-300 text-xs font-black text-slate-900 dark:text-white flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_#0f172a] dark:shadow-none active:translate-x-px active:translate-y-px active:shadow-none transition-all cursor-pointer"
          >
            <span>Xem chi tiết 7 Part & Bảng điểm</span>
            <span className="text-slate-900 dark:text-white font-black" aria-hidden="true">›</span>
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
