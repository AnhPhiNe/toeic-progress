import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PHONE_SHEET_BACKDROP, PHONE_SHEET_PANEL } from '@/shared/ui/surfaces';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { DEFAULT_POMODORO, formatClock, formatNumber, hasFlexibleQuestions, PRESETS, type PacingMode, type PomodoroPhase, type PomodoroSettings } from '@/features/pacing/lib/pacingModel';

export const pacingPrimary = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-emerald-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 shadow-[2px_2px_0px_#0f172a] hover:bg-emerald-300 disabled:opacity-40';
export const pacingSecondary = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 px-4 py-2.5 text-sm font-bold text-slate-900 shadow-[2px_2px_0px_#0f172a] dark:border-slate-300 dark:text-white dark:shadow-[2px_2px_0px_#cbd5e1]';
const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useModalA11y(true, onClose);
  return createPortal(<div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 ${PHONE_SHEET_BACKDROP}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pacing-dialog-title" className={`flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white text-slate-900 shadow-[4px_4px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-[4px_4px_0px_#cbd5e1] ${PHONE_SHEET_PANEL} max-md:[&>form]:flex-1 max-md:[&>form>footer]:mt-auto`}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-700"><h3 id="pacing-dialog-title" className="text-lg font-black">{title}</h3><button type="button" aria-label="Đóng hộp thoại" onClick={onClose} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X className="h-4 w-4" aria-hidden="true" /></button></header>{children}
    </div>
  </div>, document.body);
}

interface ResultProps {
  title: string; seconds: number; questions: number; name: string; correct: string; suggestions: string[];
  error: string; saving: boolean; onName: (name: string) => void; onCorrect: (correct: string) => void; onSave: () => void; onClose: () => void;
  savedPomodoro?: boolean; phase?: PomodoroPhase; settings?: PomodoroSettings; longBreakDue?: boolean; onNextPhase?: (phase: PomodoroPhase) => void;
}
export function PacingResultModal({ title, seconds, questions, name, correct, suggestions, error, saving, onName, onCorrect, onSave, onClose, savedPomodoro, phase, settings, longBreakDue, onNextPhase }: ResultProps) {
  return <DialogFrame title={title} onClose={onClose}>
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); onSave(); }}>
      <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4"><p className="text-sm tabular-nums text-slate-500 dark:text-slate-400">Đã dùng {formatClock(seconds)}{questions ? ` · ${questions} câu` : ''}</p>
        {!savedPomodoro && <><label className="block text-sm font-semibold">Đề <span className="font-normal text-slate-500 dark:text-slate-400">(tùy chọn)</span></label><TestNamePicker value={name} onChange={onName} suggestions={suggestions} label="Đề của lượt luyện" disabled={saving} />
          {!!questions && <label className="block text-sm font-semibold">Số câu đúng <span className="font-normal text-slate-500 dark:text-slate-400">(tùy chọn)</span><div className="mt-1 flex items-center gap-2"><input aria-label="Số câu đúng" type="number" min={0} max={questions} step={1} value={correct} onChange={event => onCorrect(event.target.value)} disabled={saving} placeholder="—" className={`${inputClass} !mt-0 !w-24 font-bold tabular-nums`} /><span className="text-sm text-slate-500 dark:text-slate-400">/ {questions} câu</span><strong className="ml-auto text-lg tabular-nums text-teal-700 dark:text-teal-300">{correct.trim() !== '' && Number.isInteger(Number(correct)) && Number(correct) >= 0 && Number(correct) <= questions ? `${formatNumber(Number(correct) / questions * 100)}%` : '—'}</strong></div></label>}
        </>}
        {!!questions && <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">Thời gian mỗi câu</span><strong className="tabular-nums">{formatNumber(seconds / questions)}s</strong></div>}
        {savedPomodoro && settings && onNextPhase && <div className="grid grid-cols-2 gap-3">{phase === 'WORK' ? <><button type="button" className={pacingPrimary} onClick={() => onNextPhase(longBreakDue ? 'LONG_BREAK' : 'SHORT_BREAK')}>Nghỉ {longBreakDue ? `dài ${settings.longBreakMinutes}` : `ngắn ${settings.shortBreakMinutes}`}p</button><button type="button" className={pacingSecondary} onClick={() => onNextPhase('WORK')}>Tập trung mới</button></> : <button type="button" className={`${pacingPrimary} col-span-2`} onClick={() => onNextPhase('WORK')}>Tập trung {settings.workMinutes} phút</button>}</div>}
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </div><footer className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700"><button type="button" className="min-h-11 cursor-pointer px-2 text-sm font-semibold text-slate-500 dark:text-slate-400" disabled={saving} onClick={onClose}>{savedPomodoro ? 'Đóng' : 'Quay lại'}</button>{!savedPomodoro && <button type="submit" disabled={saving || seconds <= 0} className={`${pacingSecondary} !border-slate-900 !bg-blue-600 !text-white`}>{saving ? 'Đang lưu…' : correct.trim() === '' ? 'Lưu thời gian' : 'Lưu kết quả'}</button>}</footer>
    </form>
  </DialogFrame>;
}

/** `tip` is passed on phones, where the practice tip moves out of the timer screen into this dialog. */
export function ReadingSettingsModal({ mode, minutes, questions, error, tip, onSave, onClose }: { mode: PacingMode; minutes: number; questions: number; error: string; tip?: string; onSave: (minutes: number, questions: number) => void; onClose: () => void }) {
  const [value, setValue] = useState({ minutes, questions });
  const flexible = hasFlexibleQuestions(mode), config = PRESETS[mode];
  return <DialogFrame title={flexible ? 'Điều chỉnh lượt luyện' : 'Điều chỉnh thời gian'} onClose={onClose}>
    <form className="min-h-0 overflow-y-auto" onSubmit={event => { event.preventDefault(); onSave(value.minutes, flexible ? value.questions : config.questions); }}>
      <div className="space-y-4 p-4"><p className="text-sm text-slate-500 dark:text-slate-400">{config.name} · {questions} câu</p>
        <label className="block text-sm font-semibold">Thời gian (phút)<input aria-label="Thời gian luyện (phút)" type="number" required min={1} max={180} step={1} value={value.minutes} onChange={event => setValue(previous => ({ ...previous, minutes: Number(event.target.value) }))} className={inputClass} /></label>
        {flexible && <><label className="block text-sm font-semibold">Số câu luyện<input aria-describedby="pacing-question-help" type="number" required min={1} max={config.questions} step={1} value={value.questions} onChange={event => setValue(previous => ({ ...previous, questions: Number(event.target.value) }))} className={inputClass} /></label><p id="pacing-question-help" className="text-xs text-slate-500 dark:text-slate-400">Mặc định {config.questions} câu cho cả phần. Khi luyện một phần, nhập số câu thực tế (1–{config.questions}).</p></>}
        {tip && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"><strong className="font-bold text-slate-800 dark:text-slate-100">Mẹo: </strong>{tip}</p>}
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </div><footer className="flex justify-end gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700"><button type="button" className="min-h-11 cursor-pointer px-2 text-sm font-semibold text-slate-500 dark:text-slate-400" onClick={onClose}>Đóng</button><button type="submit" className={pacingPrimary}>Áp dụng</button></footer>
    </form>
  </DialogFrame>;
}

export function PomodoroSettingsModal({ settings, tip, onSave, onClose }: { settings: PomodoroSettings; tip?: string; onSave: (settings: PomodoroSettings) => void; onClose: () => void }) {
  const [value, setValue] = useState(settings);
  return <DialogFrame title="Thời gian Pomodoro" onClose={onClose}><form className="min-h-0 overflow-y-auto" onSubmit={event => { event.preventDefault(); onSave(value); }}><div className="space-y-4 p-4">{([['workMinutes', 'Tập trung (phút)', 180], ['shortBreakMinutes', 'Nghỉ ngắn (phút)', 60], ['longBreakMinutes', 'Nghỉ dài (phút)', 90], ['longBreakInterval', 'Số phiên trước khi nghỉ dài', 12]] as const).map(([key, label, max]) => <label key={key} className="block text-sm font-semibold">{label}<input type="number" min={1} max={max} step={1} required value={value[key]} onChange={event => setValue({ ...value, [key]: Number(event.target.value) })} className={inputClass} /></label>)}{tip && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"><strong className="font-bold text-slate-800 dark:text-slate-100">Mẹo: </strong>{tip}</p>}</div><footer className="flex justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700"><button type="button" className="min-h-11 cursor-pointer text-sm text-slate-500 dark:text-slate-400" onClick={() => setValue(DEFAULT_POMODORO)}>Mặc định</button><button type="submit" className={pacingPrimary}>Lưu thiết lập</button></footer></form></DialogFrame>;
}
