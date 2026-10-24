import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PartTimingDurations } from '@/shared/types';
import { triggerHaptic } from '@/shared/lib/haptics';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

interface PartTimingModalProps {
  isOpen: boolean;
  onClose: () => void;
  value?: PartTimingDurations;
  onChange: (durations: PartTimingDurations | undefined) => void;
}
const timingFields = (value?: PartTimingDurations) => ({
  part5: value?.part5 == null ? '' : String(value.part5),
  part6: value?.part6 == null ? '' : String(value.part6),
  part7: value?.part7 == null ? '' : String(value.part7)
});

/** Records observed durations only; planned pacing targets are never actual results. */
export function PartTimingModal({ isOpen, onClose, value, onChange }: PartTimingModalProps) {
  const ref = useModalA11y(isOpen, onClose);
  const [fields, setFields] = useState(() => timingFields(value));
  const [error, setError] = useState('');
  useEffect(() => { if (isOpen) { setFields(timingFields(value)); setError(''); } }, [isOpen, value]);
  if (!isOpen) return null;

  const apply = () => {
    const durations: PartTimingDurations = {};
    for (const key of ['part5', 'part6', 'part7'] as const) {
      const text = fields[key].trim();
      if (!text) continue;
      const minutes = Number(text.replace(',', '.'));
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
        setError('Mỗi thời gian cần là số từ 0 đến 1440 phút. Để trống Part chưa biết.');
        return;
      }
      durations[key] = minutes;
    }
    triggerHaptic(8);
    onChange(Object.keys(durations).length ? durations : undefined);
    onClose();
  };
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-hidden="true" className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] pointer-events-none animate-backdrop" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="timing-modal-title" tabIndex={-1}
        className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain w-full max-w-[460px] rounded-3xl border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_0_#0f172a] animate-modal-pop dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[8px_8px_0_0_#cbd5e1] space-y-4 text-slate-900 dark:text-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-sm shadow-[2px_2px_0_0_#0f172a]">⏱️</span>
            <div><h3 id="timing-modal-title" className="text-base font-black">Thời gian thực tế Part 5 – 7</h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nhập thời gian từ kết quả thi. Part chưa biết để trống.</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng thời gian" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {(['part5', 'part6', 'part7'] as const).map((key, index) => <label key={key} className="min-w-0 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-2.5 text-center dark:border-indigo-800/80 dark:bg-indigo-950/30 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <span className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-400 block mb-1">Part {index + 5}</span>
            <input type="number" inputMode="decimal" min="0" max="1440" step="any" aria-label={`Thời gian Part ${index + 5} (phút)`} placeholder="—" value={fields[key]}
              onChange={event => { setFields(current => ({ ...current, [key]: event.target.value })); setError(''); }}
              className="w-full min-w-0 text-center font-black text-2xl tabular-nums bg-transparent text-slate-950 dark:text-white focus-visible:outline-indigo-500" />
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mt-1">phút</span>
          </label>)}
        </div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Chỉ lưu các ô bạn nhập; không tự chia thời gian còn lại cho Part khác.</p>
        {error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {value && <button type="button" onClick={() => { onChange(undefined); onClose(); }} className="min-h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/30 cursor-pointer">Xóa thời gian</button>}
          <button type="button" onClick={onClose} className="min-h-11 flex-1 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">Hủy</button>
          <button type="button" onClick={apply} className="min-h-11 flex-1 px-3 rounded-xl border-2 border-slate-900 bg-indigo-600 text-white font-black text-xs shadow-[2px_2px_0_0_#0f172a] hover:bg-indigo-500 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-200 cursor-pointer">Áp dụng thời gian</button>
        </div>
      </div>
    </div>, document.body
  );
}

/**
 * Hiển thị thời gian Reading Part 5 - 7 tại Thẻ Điểm ở Cột Phải:
 * - Khi chưa có: Hiển thị 1 dòng mỏng không trùng lặp: "⏱️ Thời gian Part 5 – 7  [+ Nhập ›]"
 * - Khi đã có: Hiển thị 3 chip to rõ [P5 14p] [P6 9p] [P7 52p] [✏️] (Phương án 1)
 */
export function PartTimingStrip({
  durations,
  onOpenEdit,
}: {
  durations?: PartTimingDurations;
  onOpenEdit: () => void;
}) {
  const isFilled = durations && (durations.part5 != null || durations.part6 != null || durations.part7 != null);

  if (!isFilled) {
    return (
      <button
        type="button"
        onClick={() => {
          triggerHaptic(6);
          onOpenEdit();
        }}
        className="flex w-full cursor-pointer items-center justify-between text-xs font-black text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors py-0.5"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-indigo-500">⏱️</span>
          <span>Thời gian Part 5 – 7</span>
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-bold dark:bg-slate-800 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" aria-hidden="true">
          + Nhập ›
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-1 pt-0.5">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="text-xs" aria-hidden="true">⏱️</span>
          <span>Thời gian Reading</span>
        </span>
        <span className="rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-black dark:bg-emerald-950 dark:text-emerald-300 text-[9.5px]">
          Đã ghi {[durations.part5, durations.part6, durations.part7].filter(value => value != null).length}/3 Part
        </span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-1.5 items-center">
        <div
          title={`Part 5: ${durations.part5 ?? '—'} phút`}
          className="rounded-lg border-[1.5px] border-indigo-200 bg-indigo-50/70 p-1 text-center dark:border-indigo-800/80 dark:bg-indigo-950/40"
        >
          <span className="text-[9px] font-black uppercase text-indigo-700 dark:text-indigo-400 block">P5</span>
          <span className="text-sm font-black tabular-nums text-indigo-950 dark:text-white leading-tight">
            {durations.part5 ?? '—'}p
          </span>
        </div>
        <div
          title={`Part 6: ${durations.part6 ?? '—'} phút`}
          className="rounded-lg border-[1.5px] border-teal-200 bg-teal-50/70 p-1 text-center dark:border-teal-800/80 dark:bg-teal-950/40"
        >
          <span className="text-[9px] font-black uppercase text-teal-700 dark:text-teal-400 block">P6</span>
          <span className="text-sm font-black tabular-nums text-teal-950 dark:text-white leading-tight">
            {durations.part6 ?? '—'}p
          </span>
        </div>
        <div
          title={`Part 7: ${durations.part7 ?? '—'} phút`}
          className="rounded-lg border-[1.5px] border-slate-200 bg-slate-50/70 p-1 text-center dark:border-slate-700 dark:bg-slate-900"
        >
          <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-400 block">P7</span>
          <span className="text-sm font-black tabular-nums text-slate-950 dark:text-white leading-tight">
            {durations.part7 ?? '—'}p
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic(6);
            onOpenEdit();
          }}
          title="Chỉnh sửa thời gian thực tế" aria-label="Chỉnh sửa thời gian thực tế"
          className="h-[34px] w-8 rounded-lg border-[1.5px] border-slate-300 bg-white hover:border-slate-900 hover:bg-slate-900 hover:text-white flex items-center justify-center text-xs font-black text-slate-700 transition-colors shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-400 cursor-pointer"
        >
          ✏️
        </button>
      </div>
    </div>
  );
}
