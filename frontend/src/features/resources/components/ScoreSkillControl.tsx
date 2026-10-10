import { BookOpen, Headphones, Minus, Plus } from 'lucide-react';
import { getPracticeScoreRange, getToeicSectionReference } from '@/shared/domain/etsScoring';

export function ScoreSkillControl({ skill, raw, onChange }: {
  skill: 'listening' | 'reading'; raw: number; onChange: (raw: number) => void;
}) {
  const listening = skill === 'listening';
  const name = listening ? 'Listening' : 'Reading';
  const Icon = listening ? Headphones : BookOpen;
  const range = getPracticeScoreRange(skill, raw);
  const level = getToeicSectionReference(skill, range.min)?.cefr ?? 'Dưới A1';
  const milestones = listening ? [30, 50, 70, 85, 100] : [30, 50, 70, 80, 100];
  const color = listening ? 'text-indigo-600 dark:text-indigo-300' : 'text-teal-700 dark:text-teal-300';
  return <section aria-label={`Ước tính ${name}`} className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 ${listening ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/25' : 'border-teal-200 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/25'}`}>
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <span className={`w-9 h-9 grid place-items-center rounded-xl border-2 border-slate-900 text-white ${listening ? 'bg-indigo-600' : 'bg-teal-600'}`}><Icon className="w-5 h-5" aria-hidden="true" /></span>
        <div>
          <label htmlFor={`score-raw-${skill}`} className="font-extrabold text-slate-950 dark:text-white">{name}</label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{listening ? 'Part 1–4' : 'Part 5–7'} · 100 câu</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-slate-900 dark:border-slate-500 bg-white dark:bg-slate-800 overflow-hidden">
          <button type="button" aria-label={`Giảm số câu ${name}`} disabled={raw === 0} onClick={() => onChange(raw - 1)} className="w-10 h-10 grid place-items-center text-slate-900 dark:text-slate-100 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"><Minus className="w-4 h-4" aria-hidden="true" /></button>
          <input id={`score-raw-${skill}`} aria-label={`Số câu đúng ${name}`} type="number" min="0" max="100" step="1" value={raw} onChange={event => onChange(Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))))} className={`w-10 text-center bg-transparent font-extrabold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${color}`} />
          <button type="button" aria-label={`Tăng số câu ${name}`} disabled={raw === 100} onClick={() => onChange(raw + 1)} className="w-10 h-10 grid place-items-center text-slate-900 dark:text-slate-100 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"><Plus className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <span title={raw === 100 ? '100/100: 495đ theo quy ước luyện tập của app.' : `Khoảng tham khảo: ${range.min}–${range.max}đ; dùng cận dưới.`} className={`min-w-16 py-2 px-3 text-center rounded-xl border border-slate-900 dark:border-slate-500 font-extrabold tabular-nums ${listening ? 'bg-indigo-100 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-200' : 'bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-200'}`}>{range.min}đ</span>
      </div>
    </div>
    <input aria-label={`Thanh số câu ${name}`} type="range" min="0" max="100" step="1" value={raw} onChange={event => onChange(Number(event.target.value))} className={`w-full h-2 rounded-lg cursor-pointer ${listening ? 'accent-indigo-600' : 'accent-teal-700'}`} />
    <div role="group" aria-label={`Chọn nhanh ${name}`} className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
      {milestones.map(count => <button type="button" key={count} aria-pressed={raw === count} onClick={() => onChange(count)} className={`rounded-xl border border-slate-900 dark:border-slate-500 py-2 px-1 text-center ${raw === count ? (listening ? 'bg-indigo-600 text-white' : 'bg-teal-700 text-white') : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`}>
        <span className="block text-xs font-extrabold tabular-nums">{count} câu</span>
        <span className={`block text-xs mt-1 tabular-nums ${raw === count ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{getPracticeScoreRange(skill, count).min}đ</span>
      </button>)}
    </div>
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className={color}>CEFR tham khảo: {level}</span>
      <span className="text-slate-500 dark:text-slate-400">Sai: <strong className="text-slate-900 dark:text-slate-100">{100 - raw}</strong> câu</span>
    </div>
  </section>;
}
