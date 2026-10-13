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

/**
 * Phones: one summary card (a segment per goal, coloured by the goal when done), goals as rows with their own
 * progress bar, finished goals as ✓ rows, and a sheet per goal instead of drag handles and small icons.
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
  const row = 'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left';

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <button type="button" onClick={props.onPrevWeek} aria-label="Tuần trước" className="flex h-10 w-10 items-center justify-center rounded-xl border-[1.5px] border-stone-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <div className="text-center">
          <p className="text-base font-black text-slate-950 dark:text-white">{summary.isCurrentWeek ? 'Tuần này' : `Tuần ${shortDate(summary.weekStart)}`}</p>
          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{shortDate(summary.weekStart)} – {shortDate(summary.weekEnd)}
            {!summary.isCurrentWeek && <> · <button type="button" onClick={props.onCurrentWeek} className="font-bold text-blue-600 dark:text-blue-400 cursor-pointer">Về tuần này</button></>}</p>
        </div>
        <button type="button" onClick={props.onNextWeek} aria-label="Tuần sau" className="flex h-10 w-10 items-center justify-center rounded-xl border-[1.5px] border-stone-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      {summary.tasks.length > 0 && (
        <section aria-label="Tiến độ tuần" className="rounded-2xl border-2 border-slate-900 bg-white px-4 py-3.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-slate-500 dark:text-slate-400"><span className="text-[30px] font-black leading-none tabular-nums text-slate-950 dark:text-white">{summary.completedTasks}</span><span className="text-base font-semibold"> / {summary.totalTasks} mục tiêu xong</span></p>
            <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{summary.daysStudiedThisWeek} ngày học</span>
          </div>
          {/* One segment per goal; a finished goal fills its segment with the goal's own colour. */}
          <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${summary.tasks.length}, minmax(0, 1fr))` }} aria-hidden="true">
            {[...done, ...todo].map(task => <span key={task.id} className={'h-2.5 rounded-full ' + (task.isComplete ? props.barClass(task) : 'bg-stone-200 dark:bg-slate-800')} />)}
          </div>
          {summary.completedTasks === summary.totalTasks && <p className="mt-2.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-400">Đã xong tất cả mục tiêu tuần này</p>}
        </section>
      )}

      {summary.tasks.length === 0 && (
        <div className="space-y-2 rounded-2xl border-[1.5px] border-dashed border-stone-300 px-4 py-8 text-center dark:border-slate-700">
          <p className="font-black text-slate-800 dark:text-slate-100">Chưa có mục tiêu tuần này</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Đặt 2–3 mục tiêu vừa sức, ví dụ làm 1 đề, học 200 phút, luyện Part 5.</p>
        </div>
      )}

      {todo.length > 0 && <section aria-label={`Cần làm · ${todo.length}`}>
        <h3 className="mb-1.5 ml-1 text-[12px] font-black uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400">Cần làm · {todo.length}</h3>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border-[1.5px] border-stone-300 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-[#111A2C]">
          {todo.map(task => <li key={task.id}>
            <button type="button" onClick={() => setOpenId(task.id)} aria-haspopup="dialog" data-task-id={task.id} className={row + ' flex-col items-stretch gap-2'}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-bold text-slate-900 dark:text-white">{task.title}</span>
                <span className="shrink-0 text-[14px] font-black tabular-nums text-slate-950 dark:text-white">{task.done}<span className="font-semibold text-slate-500 dark:text-slate-400">/{task.target} {task.unit}</span></span>
              </span>
              <span className="block h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800" aria-hidden="true">
                <span data-plan-progress className={'block h-full rounded-full transition-[width] duration-500 ' + props.barClass(task)} style={{ width: `${Math.max(task.done > 0 ? 3 : 2, Math.min(100, task.percent))}%` }} />
              </span>
            </button>
          </li>)}
        </ul>
      </section>}

      {done.length > 0 && <section aria-label={`Đã xong · ${done.length}`}>
        <h3 className="mb-1.5 ml-1 text-[12px] font-black uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400">Đã xong · {done.length}</h3>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border-[1.5px] border-stone-300 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-[#111A2C]">
          {done.map(task => <li key={task.id}>
            <button type="button" onClick={() => setOpenId(task.id)} aria-haspopup="dialog" data-task-id={task.id} className={row}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-slate-500 dark:text-slate-400">{task.title}</span>
                <span className="block text-[12.5px] font-semibold text-slate-400 dark:text-slate-500">{task.done}/{task.target} {task.unit}</span>
              </span>
            </button>
          </li>)}
        </ul>
      </section>}

      {props.canCopyPrevWeek && <button type="button" onClick={props.onCopyPrevWeek} disabled={props.wipLimitReached}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-stone-300 text-[14px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer">
        <Copy className="h-4 w-4" aria-hidden="true" />Chép {props.prevWeekCount} mục tiêu tuần trước
      </button>}

      {/* Add goal sits above the bottom navigation, within thumb reach. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-6 dark:from-[#070C16] dark:via-[#070C16]">
        <button type="button" onClick={props.onAdd} aria-haspopup="dialog"
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-white text-base font-black text-slate-950 shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:bg-slate-900 dark:text-white dark:shadow-none cursor-pointer">
          <Plus className="h-5 w-5" aria-hidden="true" />{props.wipLimitReached ? 'Đã có 6 mục tiêu đang làm' : 'Thêm mục tiêu'}
        </button>
      </div>

      {open && (() => {
        const primary = primaryAction(open);
        const item = 'flex min-h-[54px] w-full items-center gap-3.5 border-b border-stone-200 px-1 text-left text-[15.5px] font-bold last:border-0 dark:border-slate-800 cursor-pointer';
        return (
          <Sheet title={open.title} onClose={() => setOpenId(null)}>
            <p className="-mt-1 mb-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{open.done}/{open.target} {open.unit} · {howItCounts(open)}</p>
            <div>
              {!open.isComplete && <button type="button" className={item + ' text-slate-950 dark:text-white'} onClick={() => run(primary.action)}><primary.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />{primary.label}</button>}
              <button type="button" className={item} onClick={() => run(() => props.onMoveToTop(open.id))}><ArrowUpToLine className="h-5 w-5" aria-hidden="true" />Đưa lên đầu</button>
              <button type="button" className={item} onClick={() => run(() => props.onEdit(open))}><Pencil className="h-5 w-5" aria-hidden="true" />Sửa mục tiêu</button>
              <button type="button" className={item + ' text-rose-600 dark:text-rose-400'} onClick={() => run(() => { if (window.confirm(`Xóa mục tiêu “${open.title}”?`)) props.onDelete(open.id); })}><Trash2 className="h-5 w-5" aria-hidden="true" />Xóa</button>
            </div>
          </Sheet>
        );
      })()}
    </div>
  );
}
