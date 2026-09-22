import React, { useMemo } from 'react';
import {
  Target,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Settings,
  Plus
} from 'lucide-react';
import { StudySession, MistakeEntry, UserProfile } from '../types';
import { buildStudyPlan } from '../utils/studyPlan';

interface PlanViewProps {
  profile: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  onOpenSettings: () => void;
  onOpenSessionLogger: () => void;
  onNavigateToMistakes: () => void;
}

const formatVnDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export const PlanView: React.FC<PlanViewProps> = ({
  profile,
  sessions,
  mistakes,
  onOpenSettings,
  onOpenSessionLogger,
  onNavigateToMistakes
}) => {
  const plan = useMemo(
    () => buildStudyPlan(profile, sessions, mistakes),
    [profile, sessions, mistakes]
  );

  const paceCopy = {
    ahead: { text: 'Đang đi trước kế hoạch', cls: 'text-emerald-700 dark:text-emerald-300', Icon: TrendingUp },
    'on-track': { text: 'Đúng nhịp kế hoạch', cls: 'text-blue-700 dark:text-blue-300', Icon: TrendingUp },
    behind: { text: 'Đang chậm hơn kế hoạch', cls: 'text-rose-700 dark:text-rose-300', Icon: TrendingDown }
  } as const;

  const pace = plan.paceStatus ? paceCopy[plan.paceStatus] : null;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Tiêu đề */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            Kế Hoạch Ôn Thi
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Tuần {formatVnDate(plan.weekStart)} – {formatVnDate(plan.weekEnd)}
          </p>
        </div>
        <button
          onClick={onOpenSessionLogger}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Ghi Kết Quả
        </button>
      </div>

      {/* Chưa đặt ngày thi hoặc chưa có đề nào: nói thẳng còn thiếu gì */}
      {(!plan.hasExamDate || !plan.hasScoreData) && (
        <div className="ui-card p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Chưa đủ dữ liệu để lập kế hoạch chính xác
              </h3>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
                {!plan.hasExamDate && <li>Chưa đặt <strong>ngày thi thực tế</strong> — không tính được nhịp cần thiết</li>}
                {!plan.hasScoreData && <li>Chưa có <strong>đề Full Test</strong> nào — không biết bạn đang ở đâu</li>}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {!plan.hasExamDate && (
              <button
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Đặt ngày thi
              </button>
            )}
            {!plan.hasScoreData && (
              <button
                onClick={onOpenSessionLogger}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Ghi đề đầu tiên
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nhịp độ: cần bao nhiêu, đang đi bao nhiêu */}
      {plan.hasExamDate && plan.hasScoreData && (
        <div className="ui-card p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Còn lại
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                {plan.daysUntilExam !== null && plan.daysUntilExam >= 0 ? `${plan.daysUntilExam} ngày` : 'Đã qua'}
              </div>
            </div>

            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 shrink-0" /> Còn thiếu
              </span>
              <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                {plan.pointsGap > 0 ? `${plan.pointsGap}đ` : 'Đã đạt'}
              </div>
            </div>

            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Nhịp cần</span>
              <div className="text-xl font-black text-blue-700 dark:text-blue-300 tabular-nums mt-0.5">
                {plan.requiredPacePerWeek !== null ? `${plan.requiredPacePerWeek}đ` : '--'}
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">/tuần</span>
              </div>
            </div>

            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Nhịp thực tế</span>
              <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                {plan.actualPacePerWeek !== null ? `${plan.actualPacePerWeek}đ` : '--'}
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">/tuần</span>
              </div>
            </div>
          </div>

          {pace && (
            <div className={`p-3 rounded-xl text-xs sm:text-sm font-semibold flex items-start gap-2 ${
              plan.paceStatus === 'behind'
                ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50'
                : plan.paceStatus === 'ahead'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50'
                : 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50'
            }`}>
              <pace.Icon className={`w-4 h-4 shrink-0 mt-0.5 ${pace.cls}`} />
              <span className={`min-w-0 ${pace.cls}`}>
                {pace.text}.{' '}
                <span className="font-normal text-slate-600 dark:text-slate-300">
                  {plan.paceStatus === 'behind'
                    ? `Với nhịp ${plan.actualPacePerWeek}đ/tuần hiện tại, bạn cần tăng tốc hoặc cân nhắc dời ngày thi.`
                    : plan.pointsGap === 0
                    ? `Bạn đã chạm mức ${plan.targetScore}đ. Giữ phong độ tới ngày thi.`
                    : `Giữ nhịp này là kịp mốc ${plan.targetScore}đ trước ngày thi.`}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Việc cần làm tuần này */}
      <div className="ui-card p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Việc Cần Làm Tuần Này
          </h3>
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
            {plan.daysStudiedThisWeek}/7 ngày đã học
          </span>
        </div>

        <div className="space-y-2.5">
          {plan.tasks.map(task => {
            const complete = task.done >= task.target;
            const percent = task.target > 0 ? Math.min(100, Math.round((task.done / task.target) * 100)) : 0;

            return (
              <div
                key={task.id}
                className={`p-3 rounded-xl border transition ${
                  complete
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                    : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-start gap-2 min-w-0">
                    {complete ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                        {task.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {task.detail}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums whitespace-nowrap shrink-0 text-slate-700 dark:text-slate-200">
                    {task.done}/{task.target}
                  </span>
                </div>

                <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      complete ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'
                    }`}
                    style={{ width: `${Math.max(2, percent)}%` }}
                  />
                </div>

                {task.reason && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    <span className="font-semibold">Vì sao: </span>{task.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {plan.pendingMistakes > 0 && (
          <button
            onClick={onNavigateToMistakes}
            className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
          >
            Mở Sổ Tay Bắt Bẫy →
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1">
        Kế hoạch sinh từ ngày thi, mục tiêu điểm, lịch sử làm đề và nhóm lỗi hay mắc của chính bạn.
        Ghi càng đều, kế hoạch càng sát.
      </p>
    </div>
  );
};
