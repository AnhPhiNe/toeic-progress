import { useState } from 'react';
import { Award, Info, Minus, Plus, RotateCcw } from 'lucide-react';
import { Sheet } from '@/app/components/MobileNav';
import { CONCORDANCE_TIERS, PRACTICE_SCORE_SOURCE, SCORE_REFERENCE_SOURCES } from '@/shared/domain/etsScoring';

interface Props {
  rawListening: number;
  rawReading: number;
  onListening: (raw: number) => void;
  onReading: (raw: number) => void;
  scaledListening: number;
  scaledReading: number;
  total: number;
  rangeMax: number;
  cefr: string;
  goal: number;
  /** Raw counts of the latest Full Test, when one exists and the calculator no longer shows it. */
  restore: { listening: number; reading: number } | null;
  onRestore: () => void;
}

const SEGMENT = 'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-[10px] text-[13px] font-black transition-all';
const QUICK_PRESETS = [30, 50, 70, 85, 100] as const;

/** Phones answer "how many correct answers give what score?": result first, then one stepper per skill. */
export function PhoneResources({ rawListening, rawReading, onListening, onReading, scaledListening, scaledReading, total, rangeMax, cefr, goal, restore, onRestore }: Props) {
  const [tab, setTab] = useState<'calc' | 'matrix'>('calc');
  const [infoOpen, setInfoOpen] = useState(false);
  const cefrTier = CONCORDANCE_TIERS.find(tier => tier.cefr === cefr);

  return <div className="space-y-4 pb-6">
    <div role="group" aria-label="Chế độ quy đổi" className="flex rounded-[14px] border-2 border-slate-900 bg-[#efebe4] p-1 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-700 dark:bg-[#162137] dark:shadow-none">
      {([['calc', 'Máy tính điểm'], ['matrix', 'Bảng đối chiếu']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}
        className={`${SEGMENT} ${tab === id ? 'border-2 border-slate-900 bg-white text-slate-950 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-none' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>{label}</button>)}
    </div>

    {tab === 'calc' ? <>
      <section aria-label="Tổng điểm dự kiến" className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
        {/* Top bar: Tiêu đề + Huy hiệu CEFR nổi bật chuẩn mực */}
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-3 dark:border-slate-800">
          <span className="text-[13px] font-bold text-slate-500 dark:text-slate-400">Tổng điểm dự kiến</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">CEFR:</span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-slate-900 px-2.5 py-1 text-xs font-black shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none ${
              cefrTier ? `${cefrTier.badgeBg} ${cefrTier.badgeText}` : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              <Award className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{cefr}</span>
            </span>
          </div>
        </div>

        {/* Điểm số to bản + Điểm L/R */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="leading-none">
              <span className="text-[48px] font-black tabular-nums text-slate-950 dark:text-white" data-testid="estimated-total">{total}</span>
              <span className="text-[16px] font-bold text-slate-400"> /990</span>
            </p>
            <p className="mt-1 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
              {rawListening === 100 && rawReading === 100 ? 'Đúng toàn bộ 200 câu' : `Khoảng tham khảo: ${total}–${rangeMax}đ`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 pb-0.5">
            <span className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[13px] font-black tabular-nums text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              Listening {scaledListening}
            </span>
            <span className="inline-flex items-center rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[13px] font-black tabular-nums text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
              Reading {scaledReading}
            </span>
          </div>
        </div>

        {/* Chân thẻ: Thông tin mục tiêu & Nút / Link "Chi tiết" mở modal giải thích cách ước tính */}
        <div className="mt-3.5 flex items-center justify-between border-t border-stone-100 pt-2.5 dark:border-slate-800">
          <span className="text-[12.5px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            {total >= goal ? `Đã đạt mục tiêu ${goal}đ` : `Còn ${goal - total}đ tới mục tiêu ${goal}đ`}
          </span>
          <button
            type="button"
            aria-label="Xem chi tiết cách ước tính điểm"
            aria-haspopup="dialog"
            onClick={() => setInfoOpen(true)}
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-1.5 px-2 text-[13px] font-black text-blue-600 hover:text-blue-700 active:opacity-70 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            <span>Chi tiết</span>
          </button>
        </div>
      </section>

      <SkillStepper skill="listening" raw={rawListening} onChange={onListening} />
      <SkillStepper skill="reading" raw={rawReading} onChange={onReading} />

      {restore && <button type="button" onClick={onRestore} className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-white text-[14px] font-bold text-slate-900 shadow-[2px_2px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-none">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />Lấy từ bài thi gần nhất <span className="font-semibold tabular-nums text-slate-500 dark:text-slate-400">L {restore.listening} · R {restore.reading}</span>
      </button>}

      <p className="text-center text-[12px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
        Quy ước IIBC 2023 · Cận dưới thận trọng · 100/100 tương đương 495đ/kỹ năng
      </p>
    </> : <section aria-label="Bảng đối chiếu thang điểm" className="space-y-3">
      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Chỉ tham khảo, không phải quy đổi chính thức. Mỗi mốc cần đạt ngưỡng riêng của cả Listening và Reading; TOEIC L&R không đối chiếu C2.</p>
      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border-2 border-slate-900 bg-white shadow-[2.5px_2.5px_0_0_#0f172a] dark:divide-slate-700 dark:border-slate-700 dark:bg-[#111A2C] dark:shadow-none">
        {CONCORDANCE_TIERS.map(tier => {
          const current = tier.cefr === cefr;
          return <li key={tier.cefr} aria-current={current ? 'true' : undefined} className={'px-4 py-3 ' + (current ? 'bg-amber-100 dark:bg-amber-950/50' : '')}>
            <div className="flex items-center gap-2.5">
              <span className={`rounded-md border border-slate-900 px-2 py-0.5 text-[11px] font-black ${tier.badgeBg} ${tier.badgeText}`}>{tier.cefr}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-800 dark:text-slate-200">{tier.cefrLevelName}</span>
              {current && <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-slate-950">Bạn</span>}
              <span className="shrink-0 text-[15px] font-black tabular-nums text-slate-950 dark:text-white">{tier.toeicRange}</span>
            </div>
            <p className="mt-1 text-[12.5px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">IELTS {tier.ielts} · VSTEP {tier.vstep} · TOEFL {tier.toeflIbt}</p>
          </li>;
        })}
      </ul>
      <p className="text-[12px] text-slate-500 dark:text-slate-400">Nguồn: <a className="underline underline-offset-2" href={SCORE_REFERENCE_SOURCES.toeic} target="_blank" rel="noopener noreferrer">ETS TOEIC</a> · <a className="underline underline-offset-2" href={SCORE_REFERENCE_SOURCES.ielts} target="_blank" rel="noopener noreferrer">British Council</a> · <a className="underline underline-offset-2" href={SCORE_REFERENCE_SOURCES.vstep} target="_blank" rel="noopener noreferrer">ULIS–VNU</a> · <a className="underline underline-offset-2" href={SCORE_REFERENCE_SOURCES.toefl} target="_blank" rel="noopener noreferrer">ETS TOEFL</a></p>
    </section>}

    {infoOpen && <Sheet title="Cách ước tính điểm" onClose={() => setInfoOpen(false)}>
      <div className="space-y-3 pb-2 text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
        <p>Điểm dùng cận dưới của bảng ước tính <a className="font-bold text-blue-600 underline underline-offset-2 dark:text-blue-400" href={PRACTICE_SCORE_SOURCE} target="_blank" rel="noopener noreferrer">IIBC 2023</a>, nên thường thấp hơn hoặc bằng điểm thật.</p>
        <p className="tabular-nums">{rawListening === 100 && rawReading === 100 ? 'Đúng toàn bộ 200 câu: 990 điểm.' : `Khoảng tham khảo: ${total}–${rangeMax}đ.`}</p>
        <p>100/100 câu được quy ước là 495 điểm mỗi kỹ năng. Điểm ETS thật phụ thuộc từng đề.</p>
      </div>
    </Sheet>}
  </div>;
}

function SkillStepper({ skill, raw, onChange }: { skill: 'listening' | 'reading'; raw: number; onChange: (raw: number) => void }) {
  const listening = skill === 'listening', name = listening ? 'Listening' : 'Reading';
  const stepButton = 'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-40 dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-none';

  return <section aria-label={`Ước tính ${name}`} className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[2.5px_2.5px_0_0_#0f172a] dark:border-slate-700 dark:bg-[#111A2C] dark:shadow-none">
    <div className="flex items-baseline justify-between">
      <label htmlFor={`phone-raw-${skill}`} className={`text-[15px] font-black ${listening ? 'text-indigo-600 dark:text-indigo-400' : 'text-teal-700 dark:text-teal-400'}`}>{name}</label>
      <span className="text-[12.5px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">Sai {100 - raw} câu · Đúng {raw}/100</span>
    </div>

    <div className="mt-2.5 flex items-center justify-between gap-3">
      <button type="button" aria-label={`Giảm số câu ${name}`} disabled={raw === 0} onClick={() => onChange(raw - 1)} className={stepButton}><Minus className="h-5 w-5" aria-hidden="true" /></button>
      <span className="flex items-baseline">
        <input id={`phone-raw-${skill}`} aria-label={`Số câu đúng ${name}`} type="number" inputMode="numeric" data-large-text min="0" max="100" step="1" value={raw}
          onChange={event => onChange(Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))))}
          className="w-[3ch] bg-transparent text-right text-[34px] font-black tabular-nums text-slate-950 outline-none [appearance:textfield] focus:underline focus:decoration-2 focus:underline-offset-4 dark:text-white [&::-webkit-inner-spin-button]:appearance-none" />
        <span className="text-[14px] font-bold text-slate-400">/100</span>
      </span>
      <button type="button" aria-label={`Tăng số câu ${name}`} disabled={raw === 100} onClick={() => onChange(raw + 1)} className={stepButton}><Plus className="h-5 w-5" aria-hidden="true" /></button>
    </div>

    <input aria-label={`Thanh số câu ${name}`} type="range" min="0" max="100" step="1" value={raw} onChange={event => onChange(Number(event.target.value))}
      className={`mt-3 h-2 w-full cursor-pointer ${listening ? 'accent-indigo-600' : 'accent-teal-700'}`} />

    {/* 5 Nút mốc nhanh [30, 50, 70, 85, 100] bấm 1 chạm - tap target tối thiểu 44px */}
    <div className="mt-3.5 border-t border-stone-100 pt-2.5 dark:border-slate-800">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Mốc nhanh
      </p>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={`Mốc câu đúng nhanh ${name}`}>
        {QUICK_PRESETS.map(val => {
          const isSelected = raw === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onChange(val)}
              aria-label={`Chọn mốc ${val} câu đúng ${name}`}
              aria-pressed={isSelected}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border-2 text-[13px] font-black tabular-nums transition-all ${
                isSelected
                  ? listening
                    ? 'border-slate-900 bg-indigo-600 text-white shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-200 dark:bg-indigo-500 dark:shadow-none'
                    : 'border-slate-900 bg-teal-700 text-white shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-200 dark:bg-teal-600 dark:shadow-none'
                  : 'border-stone-300 bg-stone-50 text-slate-700 hover:border-slate-900 hover:bg-white active:scale-95 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:border-slate-400'
              }`}
            >
              {val}
            </button>
          );
        })}
      </div>
    </div>
  </section>;
}
