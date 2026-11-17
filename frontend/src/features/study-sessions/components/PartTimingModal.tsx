import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PartTimingDurations } from '@/shared/types';
import { triggerHaptic } from '@/shared/lib/haptics';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import './edit-rd.css';

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
        className="rd rdt relative max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto overscroll-contain animate-modal-pop">
        <div className="flex items-start justify-between gap-3">
          <div><h3 id="timing-modal-title" className="rdt-title">Thời gian thực tế Part 5 – 7</h3>
            <p className="rdt-sub">Part chưa biết thì để trống.</p></div>
          <button type="button" onClick={onClose} aria-label="Đóng thời gian" className="rdl-x shrink-0 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="rdt-grid">
          {(['part5', 'part6', 'part7'] as const).map((key, index) => <label key={key} className="rdt-cell">
            <span>Part {index + 5}</span>
            <input type="number" inputMode="decimal" min="0" max="1440" step="any" aria-label={`Thời gian Part ${index + 5} (phút)`} placeholder="—" value={fields[key]}
              onChange={event => { setFields(current => ({ ...current, [key]: event.target.value })); setError(''); }} />
            <small>phút</small>
          </label>)}
        </div>
        {error && <p role="alert" className="rdt-err">{error}</p>}
        <div className="rdt-foot">
          {value && <button type="button" onClick={() => { onChange(undefined); onClose(); }} className="rdt-del">Xóa thời gian</button>}
          <button type="button" onClick={onClose} className="rdt-cancel">Hủy</button>
          <button type="button" onClick={apply} className="rd-btn rdt-save">Áp dụng thời gian</button>
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
        className="rdt-strip"
      >
        <span>Thời gian Part 5 – 7</span>
        <span className="rdt-strip-a" aria-hidden="true">+ Nhập ›</span>
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
