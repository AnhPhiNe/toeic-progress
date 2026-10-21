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
  return <section aria-label={`Ước tính ${name}`} className={`rounded-2xl border p-3 sm:p-3.5 space-y-2.5 ${listening ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/25' : 'border-teal-200 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/25'}`}>
    <div className="flex items-center justify-between flex-wrap gap-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 grid place-items-center rounded-xl border-2 border-slate-900 text-white ${listening ? 'bg-indigo-600' : 'bg-teal-600'}`}><Icon className="w-4 h-4" aria-hidden="true" /></span>
        <div>
          <label htmlFor={`score-raw-${skill}`} className="text-xs sm:text-sm font-black text-slate-950 dark:text-white">{name}</label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{listening ? 'Part 1–4' : 'Part 5–7'} · 100 câu</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-slate-900 dark:border-slate-500 bg-white dark:bg-slate-800 overflow-hidden">
          <button type="button" aria-label={`Giảm số câu ${name}`} disabled={raw === 0} onClick={() => onChange(raw - 1)} className="w-7 h-7 sm:w-8 sm:h-8 grid place-items-center text-slate-900 dark:text-slate-100 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"><Minus className="w-3.5 h-3.5" aria-hidden="true" /></button>
          <input id={`score-raw-${skill}`} aria-label={`Số câu đúng ${name}`} type="number" min="0" max="100" step="1" value={raw} onChange={event => onChange(Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))))} className={`w-8 sm:w-9 text-center bg-transparent font-black text-xs sm:text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${color}`} />
          <button type="button" aria-label={`Tăng số câu ${name}`} disabled={raw === 100} onClick={() => onChange(raw + 1)} className="w-7 h-7 sm:w-8 sm:h-8 grid place-items-center text-slate-900 dark:text-slate-100 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"><Plus className="w-3.5 h-3.5" aria-hidden="true" /></button>
        </div>
        <span title={raw === 100 ? '100/100: 495đ theo quy ước luyện tập của app.' : `Khoảng tham khảo: ${range.min}–${range.max}đ; dùng cận dưới.`} className={`min-w-14 py-1 px-2.5 text-center rounded-lg border border-slate-900 dark:border-slate-500 text-xs font-black tabular-nums ${listening ? 'bg-indigo-100 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-200' : 'bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-200'}`}>{range.min}đ</span>
      </div>
    </div>
    <input aria-label={`Thanh số câu ${name}`} type="range" min="0" max="100" step="1" value={raw} onChange={event => onChange(Number(event.target.value))} className={`w-full h-1.5 rounded-lg cursor-pointer ${listening ? 'accent-indigo-600' : 'accent-teal-700'}`} />
    <div role="group" aria-label={`Chọn nhanh ${name}`} className="grid grid-cols-5 gap-1.5">
      {milestones.map(count => <button type="button" key={count} aria-pressed={raw === count} onClick={() => onChange(count)} className={`rounded-lg border border-slate-900 dark:border-slate-500 py-1 px-1 text-center transition cursor-pointer ${raw === count ? (listening ? 'bg-indigo-600 text-white' : 'bg-teal-700 text-white shadow-2xs') : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750'}`}>
        <span className="block text-[11px] font-black tabular-nums">{count} câu</span>
        <span className={`block text-[10px] tabular-nums font-semibold ${raw === count ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>({getPracticeScoreRange(skill, count).min}đ)</span>
      </button>)}
    </div>
    <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
      <span className="text-slate-500 dark:text-slate-400">Sai: <strong className="text-slate-900 dark:text-slate-100 font-extrabold">{100 - raw}</strong> câu</span>
      <span className="text-slate-400 dark:text-slate-500">CEFR tham khảo: <strong className={`${color} font-black`}>{level}</strong></span>
    </div>
  </section>;
}
