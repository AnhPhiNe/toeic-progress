import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Pencil, X } from 'lucide-react';
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
      <div aria-hidden="true" className="absolute inset-0 bg-[#2f3a33]/60 backdrop-blur-[2px] pointer-events-none animate-backdrop" />
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
 * Hiển thị thời gian Reading Part 5 - 7 tại Thẻ Điểm ở Cột Phải (đồng bộ .rdg-meta):
 * - Khi chưa có: cùng hàng gọn với "Điểm từ đề thi" -> [+ Nhập ›]
 * - Khi đã có: 3 chip P5 / P6 / P7 + nút sửa gọn
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
        className="rdg-meta-row"
      >
        <span className="rdg-meta-lbl">
          <Clock3 size={14} className="shrink-0 text-[var(--rd-mut)]" aria-hidden="true" />
          <span>Thời gian Part 5 – 7</span>
        </span>
        <span className="rdg-meta-pill" aria-hidden="true">+ Nhập ›</span>
      </button>
    );
  }

  return (
    <div className="rdg-timing-row" title="Thời gian làm Reading Part 5 – 7">
      <Clock3 size={14} className="shrink-0 text-[#0d9488]" aria-hidden="true" />
      <div className="rdg-tchip is-p5" title={`Part 5: ${durations.part5 ?? '—'} phút`}>
        <small>P5</small>
        <b>{durations.part5 ?? '—'}p</b>
      </div>
      <div className="rdg-tchip is-p6" title={`Part 6: ${durations.part6 ?? '—'} phút`}>
        <small>P6</small>
        <b>{durations.part6 ?? '—'}p</b>
      </div>
      <div className="rdg-tchip is-p7" title={`Part 7: ${durations.part7 ?? '—'} phút`}>
        <small>P7</small>
        <b>{durations.part7 ?? '—'}p</b>
      </div>
      <button
        type="button"
        onClick={() => {
          triggerHaptic(6);
          onOpenEdit();
        }}
        title="Chỉnh sửa thời gian thực tế"
        aria-label="Chỉnh sửa thời gian thực tế"
        className="rdg-tedit"
      >
        <Pencil size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
