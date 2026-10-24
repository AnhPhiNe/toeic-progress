import { formatPlanQuantity } from '../lib/planDisplay';
import { useState } from 'react';
import { ArrowUpToLine, Check, ChevronLeft, ChevronRight, Copy, FileCheck2, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import type { SmartWeeklyTask } from '@/shared/types';
import type { WeeklyStudyPlanSummary } from '@/features/plans/lib/studyPlan';
import { Sheet } from '@/app/components/MobileNav';

type Task = WeeklyStudyPlanSummary['tasks'][number];

interface Props {
  summary: WeeklyStudyPlanSummary;
  barClass: (task: SmartWeeklyTask) => string;
  canCopyPrevWeek: boolean;
  prevWeekCount: number;
  wipLimitReached: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  onCopyPrevWeek: () => void;
  onAdd: () => void;
  onEdit: (task: SmartWeeklyTask) => void;
  onDelete: (taskId: string) => void;
  onMoveToTop: (taskId: string) => void;
  onRecordFullTest: () => void;
  onRecordPart: (part?: number) => void;
  onOpenTimer: () => void;
}

const shortDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

function howItCounts(task: Task) {
  if (task.type === 'AUTO_FULL_TEST') return 'Tự đếm khi ghi điểm một đề Full Test';
  if (task.type === 'AUTO_STUDY_TIME') return 'Tự cộng thời gian từ Đồng hồ và các buổi học';
  if (task.type === 'AUTO_PART_PRACTICE') return `Tự đếm khi ghi kết quả luyện Part ${task.partNumber || 5}`;
  return 'Mục tiêu cũ: đổi cách theo dõi để app tự đếm';
}

function taskTheme(type: Task['type']) {
  if (type === 'AUTO_FULL_TEST') {
    return {
      bgIcon: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300',
      tag: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
      label: 'Đề thi'
    };
  }
  if (type === 'AUTO_STUDY_TIME') {
    return {
      bgIcon: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
      tag: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      label: 'Thời gian'
    };
  }
  if (type === 'AUTO_PART_PRACTICE') {
    return {
      bgIcon: 'bg-teal-100 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300',
      tag: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
      label: 'Luyện Part'
    };
  }
  return {
    bgIcon: 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300',
    tag: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
    label: 'Tự chọn'
  };
}

/**
 * Phones: Bento Neo-Brutalism weekly study plan with 44px thumb-friendly checkboxes,
 * compact bottom padding without double-padding dead space, and a bold add-goal button.
 */
export function PhonePlan(props: Props) {
  const { summary } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = summary.tasks.find(task => task.id === openId) ?? null;
  const todo = summary.tasks.filter(task => !task.isComplete);
  const done = summary.tasks.filter(task => task.isComplete);
  const run = (action: () => void) => { setOpenId(null); action(); };

  const primaryAction = (task: Task) => {
    if (task.type === 'AUTO_FULL_TEST') return { label: 'Ghi điểm đề thi', icon: FileCheck2, action: props.onRecordFullTest };
    if (task.type === 'AUTO_STUDY_TIME') return { label: 'Bấm giờ luyện', icon: Timer, action: props.onOpenTimer };
    if (task.type === 'AUTO_PART_PRACTICE') return { label: `Ghi kết quả Part ${task.partNumber || 5}`, icon: FileCheck2, action: () => props.onRecordPart(task.partNumber) };
    return { label: 'Đổi cách theo dõi', icon: Pencil, action: () => props.onEdit(task) };
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Chuyển tuần */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={props.onPrevWeek}
          aria-label="Tuần trước"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-800 shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C] dark:text-slate-200 dark:shadow-none"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="text-center">
          <p className="text-base font-black text-slate-950 dark:text-white">
            {summary.isCurrentWeek ? 'Tuần này' : `Tuần ${shortDate(summary.weekStart)}`}
          </p>
          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            {shortDate(summary.weekStart)} – {shortDate(summary.weekEnd)}
            {!summary.isCurrentWeek && (
              <> · <button type="button" onClick={props.onCurrentWeek} className="cursor-pointer font-bold text-blue-600 dark:text-blue-400">Về tuần này</button></>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onNextWeek}
          aria-label="Tuần sau"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-800 shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C] dark:text-slate-200 dark:shadow-none"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Tiến độ tuần dạng thẻ Bento */}
      {summary.tasks.length > 0 && (
        <section aria-label="Tiến độ tuần" className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-slate-500 dark:text-slate-400">
              <span className="text-[32px] font-black leading-none tabular-nums text-slate-950 dark:text-white">{summary.completedTasks}</span>
              <span className="text-base font-semibold"> / {summary.totalTasks} mục tiêu xong</span>
            </p>
            <span className="rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1 text-[12.5px] font-bold tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {summary.daysStudiedThisWeek} ngày học
            </span>
          </div>
          {/* One segment per goal; a finished goal fills its segment with the goal's own colour. */}
          <div className="mt-3.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${summary.tasks.length}, minmax(0, 1fr))` }} aria-hidden="true">
            {[...done, ...todo].map(task => <span key={task.id} className={'h-2.5 rounded-full ' + (task.isComplete ? props.barClass(task) : 'bg-stone-200 dark:bg-slate-800')} />)}
          </div>
          {summary.completedTasks === summary.totalTasks && (
            <p className="mt-3 text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
              🎉 Đã xong tất cả mục tiêu tuần này!
            </p>
          )}
        </section>
      )}

      {/* Trạng thái chưa có mục tiêu */}
      {summary.tasks.length === 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-base font-black text-slate-800 dark:text-slate-100">Chưa có mục tiêu tuần này</p>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Đặt 2–3 mục tiêu vừa sức, ví dụ làm 1 đề, học 200 phút, luyện Part 5.</p>
        </div>
      )}

      {/* Danh sách mục tiêu Cần làm - thẻ Bento Neo-Brutalism */}
      {todo.length > 0 && (
        <section aria-label={`Cần làm · ${todo.length}`} className="space-y-2.5">
          <h3 className="ml-1 text-[12px] font-black uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400">
            Cần làm · {todo.length}
          </h3>
          <div className="space-y-2.5">
            {todo.map(task => {
              const primary = primaryAction(task);
              const theme = taskTheme(task.type);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-2xl border-2 border-slate-900 bg-white p-3.5 shadow-[2.5px_2.5px_0_0_#0f172a] transition-all dark:border-slate-700 dark:bg-[#111A2C] dark:shadow-[2px_2px_0_0_#1e293b]"
                >
                  {/* Checkbox to chuẩn 44px tap target dễ bấm bằng ngón tay cái có màu sắc theo loại việc */}
                  <button
                    type="button"
                    aria-label={`Thực hiện ${primary.label} cho mục tiêu ${task.title}`}
                    onClick={() => primary.action()}
                    className={'group/cb flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] hover:brightness-95 active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:shadow-none ' + theme.bgIcon}
                    title={primary.label}
                  >
                    <primary.icon className="h-5 w-5 transition-transform group-hover/cb:scale-110" aria-hidden="true" />
                  </button>

                  {/* Nội dung mục tiêu + Tiến độ */}
                  <button
                    type="button"
                    onClick={() => setOpenId(task.id)}
                    aria-haspopup="dialog"
                    data-task-id={task.id}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col items-stretch gap-2 text-left"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                      <span className={'rounded-md border px-1.5 py-0.5 text-[10px] font-black shrink-0 ' + theme.tag}>
                        {theme.label}
                      </span>
                      <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-950 dark:text-white">
                        {formatPlanQuantity(task.done)}<span className="font-semibold text-slate-500 dark:text-slate-400">/{formatPlanQuantity(task.target)} {task.unit}</span>
                      </span>
                    </div>
                    <span className="break-words text-[14.5px] font-bold leading-snug text-slate-900 dark:text-white">
                      {task.title}
                    </span>
                    <div className="block h-2.5 overflow-hidden rounded-full bg-slate-100 border border-slate-200/80 dark:border-slate-700 dark:bg-slate-800" aria-hidden="true">
                      <span
                        data-plan-progress
                        className={'block h-full rounded-full transition-[width] duration-500 ' + props.barClass(task)}
                        style={{ width: `${Math.max(task.done > 0 ? 3 : 2, Math.min(100, task.percent))}%` }}
                      />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Danh sách mục tiêu Đã xong - thẻ Bento Neo-Brutalism */}
      {done.length > 0 && (
        <section aria-label={`Đã xong · ${done.length}`} className="space-y-2.5">
          <h3 className="ml-1 text-[12px] font-black uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400">
            Đã xong · {done.length}
          </h3>
          <div className="space-y-2.5">
            {done.map(task => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-2xl border-2 border-emerald-900/60 bg-emerald-50/50 p-3.5 shadow-[2px_2px_0_0_#065f46] transition-all dark:border-emerald-800 dark:bg-emerald-950/25 dark:shadow-none"
              >
                {/* Checkbox to chuẩn 44px tap target đã hoàn thành */}
                <button
                  type="button"
                  aria-label={`Mục tiêu ${task.title} đã hoàn thành. Bấm để xem tùy chọn`}
                  onClick={() => setOpenId(task.id)}
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-emerald-500 text-white shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none"
                >
                  <Check className="h-6 w-6 stroke-[3]" aria-hidden="true" />
                </button>

                {/* Nội dung mục tiêu đã hoàn thành */}
                <button
                  type="button"
                  onClick={() => setOpenId(task.id)}
                  aria-haspopup="dialog"
                  data-task-id={task.id}
                  className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold line-through text-slate-400 dark:text-slate-500">
                      {task.title}
                    </span>
                    <span className="block text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                      Đã hoàn thành · {formatPlanQuantity(task.done)}/{formatPlanQuantity(task.target)} {task.unit}
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sao chép tuần trước */}
      {props.canCopyPrevWeek && (
        <button
          type="button"
          onClick={props.onCopyPrevWeek}
          disabled={props.wipLimitReached}
          className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-400 bg-white text-[14px] font-bold text-slate-700 shadow-[1.5px_1.5px_0_0_#94a3b8] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:shadow-none"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          <span>Chép {props.prevWeekCount} mục tiêu tuần trước</span>
        </button>
      )}

      {/* Nút to bản + Thêm mục tiêu tuần mới */}
      <button
        type="button"
        onClick={props.onAdd}
        aria-haspopup="dialog"
        disabled={props.wipLimitReached}
        className="flex min-h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-white px-4 py-3.5 text-base font-black text-slate-950 shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50 dark:border-slate-200 dark:bg-[#111A2C] dark:text-white dark:shadow-[3px_3px_0_0_#cbd5e1] dark:disabled:opacity-40"
      >
        <Plus className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
        <span>{props.wipLimitReached ? 'Đã có 6 mục tiêu đang làm' : 'Thêm mục tiêu tuần mới'}</span>
      </button>

      {/* Sheet chi tiết thao tác mục tiêu */}
      {open && (() => {
        const primary = primaryAction(open);
        const item = 'flex min-h-[54px] w-full items-center gap-3.5 border-b border-stone-200 px-1 text-left text-[15.5px] font-bold last:border-0 dark:border-slate-800 cursor-pointer';
        return (
          <Sheet title={open.title} onClose={() => setOpenId(null)}>
            <p className="-mt-1 mb-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{formatPlanQuantity(open.done)}/{formatPlanQuantity(open.target)} {open.unit} · {howItCounts(open)}</p>
            <div>
              {!open.isComplete && <button type="button" className={item + ' text-slate-950 dark:text-white'} onClick={() => run(primary.action)}><primary.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />{primary.label}</button>}
              <button type="button" className={item} onClick={() => run(() => props.onMoveToTop(open.id))}><ArrowUpToLine className="h-5 w-5" aria-hidden="true" />Đưa lên đầu</button>
              <button type="button" className={item} onClick={() => run(() => props.onEdit(open))}><Pencil className="h-5 w-5" aria-hidden="true" />Sửa mục tiêu</button>
              <button type="button" className={item + ' text-rose-600 dark:text-rose-400'} onClick={() => run(() => props.onDelete(open.id))}><Trash2 className="h-5 w-5" aria-hidden="true" />Xóa</button>
            </div>
          </Sheet>
        );
      })()}
    </div>
  );
}
