import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Clock3, FileCheck2, Minus, Plus, Target, X } from 'lucide-react';
import { PHONE_SHEET_BACKDROP, PHONE_SHEET_FOOTER, PHONE_SHEET_PANEL } from '@/shared/ui/surfaces';
import type { SmartTaskType, TaskColorKey } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

export interface PlanTaskDraft {
  title: string; type: SmartTaskType; target: number; unit: string; part: number; notes: string; color: TaskColorKey;
}
type Preset = 'FULL_TEST' | 'MINUTES' | 'PART_5' | 'PART_7';
interface Props {
  editing: boolean; weekLabel: string; value: PlanTaskDraft; error: string;
  colors: readonly { id: TaskColorKey; label: string; bg: string }[];
  onChange: (patch: Partial<PlanTaskDraft>) => void; onPreset: (preset: Preset) => void;
  onClose: () => void; onSubmit: (event: React.FormEvent) => void;
}

const KINDS: { type: SmartTaskType; label: string; icon: React.ElementType; chip: string; selected: string }[] = [
  { type: 'AUTO_FULL_TEST', label: 'Làm đề Full Test', icon: FileCheck2, chip: 'bg-blue-200', selected: 'bg-blue-50 dark:bg-blue-950/40' },
  { type: 'AUTO_STUDY_TIME', label: 'Học đủ số phút', icon: Clock3, chip: 'bg-indigo-200', selected: 'bg-indigo-50 dark:bg-indigo-950/40' },
  { type: 'AUTO_PART_PRACTICE', label: 'Luyện một Part', icon: BookOpen, chip: 'bg-amber-200', selected: 'bg-amber-50 dark:bg-amber-950/40' }
];
const MINUTE_CHOICES = [150, 210, 300, 420];

/** The title a goal gets when the learner has not renamed it. */
export function autoGoalTitle(type: SmartTaskType, target: number, part: number) {
  if (type === 'AUTO_FULL_TEST') return `Làm ${target} đề Full Test`;
  if (type === 'AUTO_STUDY_TIME') return `Học ${target} phút`;
  if (type === 'AUTO_PART_PRACTICE') return `Luyện ${target} bài Part ${part}`;
  return '';
}

const question = 'mb-2 text-sm font-extrabold text-slate-900 dark:text-white';

/** Pick, don't type: the kind of goal, then only what that kind needs; the name writes itself. */
export function PlanTaskModal({ editing, weekLabel, value, error, onChange, onClose, onSubmit }: Props) {
  const ref = useModalA11y(true, onClose);
  const titleInput = useRef<HTMLInputElement>(null);
  const autoTitle = autoGoalTitle(value.type, value.target, value.part);
  const [renamed, setRenamed] = useState(() => Boolean(value.title.trim()) && value.title.trim() !== autoTitle);
  const [showNotes, setShowNotes] = useState(() => Boolean(value.notes.trim()));
  const kind = KINDS.find(item => item.type === value.type);
  const step = value.type === 'AUTO_STUDY_TIME' ? 30 : 1;
  const unit = value.type === 'AUTO_STUDY_TIME' ? 'phút' : value.type === 'AUTO_PART_PRACTICE' ? 'bài' : value.type === 'AUTO_FULL_TEST' ? 'đề' : value.unit;

  // Keep the generated name in step with the choices until the learner names the goal themself.
  useEffect(() => {
    if (!renamed && autoTitle && value.title !== autoTitle) onChange({ title: autoTitle });
  }, [renamed, autoTitle, value.title, onChange]);

  const setTarget = (next: number) => onChange({ target: Math.max(1, Math.min(100000, Math.round(next))) });

  return createPortal(<div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 ${PHONE_SHEET_BACKDROP}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="plan-modal-title" className={`plan-task-modal flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white text-slate-900 shadow-[4px_4px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111a2c] dark:text-white dark:shadow-[4px_4px_0px_#cbd5e1] ${PHONE_SHEET_PANEL}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-slate-900 bg-slate-50 px-4 py-3.5 dark:border-slate-300 dark:bg-[#162137] sm:px-5">
        <div>
          <h3 id="plan-modal-title" className="text-lg font-black">{editing ? 'Sửa mục tiêu' : 'Thêm mục tiêu'}</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{weekLabel}</p>
        </div>
        <button type="button" className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Đóng mục tiêu" onClick={onClose}><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <p id="plan-kind-label" className={question}>Bạn muốn làm gì?</p>
            <div role="radiogroup" aria-labelledby="plan-kind-label" className="grid grid-cols-3 gap-2.5">
              {KINDS.map(item => {
                const on = value.type === item.type;
                const Icon = item.icon;
                return (
                  <button key={item.type} type="button" role="radio" aria-checked={on} onClick={() => onChange({ type: item.type })}
                    className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 px-2 py-3 text-center text-[13px] font-extrabold leading-tight transition ${
                      on ? `border-slate-900 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none ${item.selected}` : 'border-slate-300 bg-white hover:border-slate-500 dark:border-slate-600 dark:bg-slate-900'
                    }`}>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-900 text-slate-900 dark:border-slate-200 ${item.chip}`}><Icon className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden="true" /></span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {value.type === 'AUTO_PART_PRACTICE' && (
            <div>
              <p id="plan-part-label" className={question}>Part nào?</p>
              <div role="radiogroup" aria-labelledby="plan-part-label" className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map(part => {
                  const on = value.part === part;
                  return (
                    <button key={part} type="button" role="radio" aria-checked={on} aria-label={`Part ${part}`} onClick={() => onChange({ part })}
                      className={`flex h-10 w-11 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-extrabold transition ${
                        on ? 'border-slate-900 bg-amber-200 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-200 dark:text-slate-900 dark:shadow-none' : 'border-slate-300 bg-white hover:border-slate-500 dark:border-slate-600 dark:bg-slate-900'
                      }`}>
                      {part}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {kind && (
            <div>
              <label htmlFor="plan-task-target" className={`block ${question}`}>
                {value.type === 'AUTO_STUDY_TIME' ? 'Bao nhiêu phút trong tuần?' : value.type === 'AUTO_PART_PRACTICE' ? 'Bao nhiêu bài trong tuần?' : 'Bao nhiêu đề trong tuần?'}
              </label>
              <div className="inline-flex items-stretch overflow-hidden rounded-xl border-2 border-slate-900 dark:border-slate-300">
                <button type="button" aria-label="Bớt" disabled={value.target <= 1} onClick={() => setTarget(value.target - step)}
                  className="flex w-11 cursor-pointer items-center justify-center border-r-2 border-slate-900 bg-white hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800">
                  <Minus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                </button>
                <span className="flex items-baseline gap-1 px-3">
                  <input id="plan-task-target" type="number" required min={1} max={100000} step={value.type === 'AUTO_STUDY_TIME' ? 'any' : 1}
                    value={value.target} onChange={event => onChange({ target: Number(event.target.value) })} aria-label="Chỉ tiêu"
                    className="w-16 bg-transparent py-2 text-center text-xl font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{unit}</span>
                </span>
                <button type="button" aria-label="Thêm" onClick={() => setTarget(value.target + step)}
                  className="flex w-11 cursor-pointer items-center justify-center border-l-2 border-slate-900 bg-white hover:bg-slate-100 dark:border-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800">
                  <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                </button>
              </div>
              {value.type === 'AUTO_STUDY_TIME' && <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MINUTE_CHOICES.map(minutes => (
                    <button key={minutes} type="button" aria-pressed={value.target === minutes} onClick={() => setTarget(minutes)}
                      className={`min-h-8 cursor-pointer rounded-lg border-2 px-2.5 text-xs font-extrabold ${value.target === minutes ? 'border-slate-900 bg-indigo-100 dark:border-slate-200 dark:bg-indigo-950' : 'border-slate-300 hover:border-slate-500 dark:border-slate-600'}`}>
                      {minutes}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Khoảng {Math.round(value.target / 7)} phút mỗi ngày</p>
              </>}
            </div>
          )}

          <div className="rounded-xl border-2 border-dashed border-slate-300 px-3 py-2.5 dark:border-slate-600">
            {renamed ? (
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">Tên mục tiêu
                <input ref={titleInput} required autoComplete="off" maxLength={300} value={value.title} onChange={event => onChange({ title: event.target.value })}
                  className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-base font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
              </label>
            ) : (
              <div className="flex items-center gap-2.5">
                <Target className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{value.title || 'Chọn loại mục tiêu ở trên'}</p>
                {autoTitle && <button type="button" onClick={() => { setRenamed(true); window.setTimeout(() => titleInput.current?.focus(), 0); }} className="shrink-0 cursor-pointer text-xs font-extrabold text-blue-600 hover:underline dark:text-blue-400">Đổi tên</button>}
              </div>
            )}
          </div>

          {showNotes ? (
            <label className="block text-sm font-extrabold" htmlFor="plan-task-notes">Ghi chú
              <textarea id="plan-task-notes" rows={2} maxLength={4000} value={value.notes} onChange={event => onChange({ notes: event.target.value })}
                className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
            </label>
          ) : (
            <button type="button" onClick={() => setShowNotes(true)} className="cursor-pointer text-sm font-extrabold text-blue-600 hover:underline dark:text-blue-400">+ Thêm ghi chú</button>
          )}

          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </div>

        <footer className={`flex shrink-0 items-center justify-end gap-3 border-t-2 border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5 ${PHONE_SHEET_FOOTER}`}>
          <button type="button" onClick={onClose} className="min-h-11 cursor-pointer rounded-xl border-2 border-slate-900 bg-white px-4 text-sm font-extrabold text-slate-800 hover:bg-slate-100 max-md:min-h-12 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-200">Hủy</button>
          <button type="submit" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-indigo-600 px-5 text-sm font-black text-white shadow-[3px_3px_0_0_#0f172a] transition hover:bg-indigo-700 active:translate-x-px active:translate-y-px active:shadow-none max-md:min-h-12 max-md:flex-1 dark:border-slate-200 dark:shadow-none">
            {editing ? 'Lưu thay đổi' : 'Thêm mục tiêu'}
          </button>
        </footer>
      </form>
    </div>
  </div>, document.body);
}
