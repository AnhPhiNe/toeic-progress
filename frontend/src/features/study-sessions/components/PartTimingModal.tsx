import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { PartTimingDurations } from '@/shared/types';
import { triggerHaptic } from '@/shared/lib/haptics';

interface PartTimingModalProps {
  isOpen: boolean;
  onClose: () => void;
  value?: PartTimingDurations;
  onChange: (durations: PartTimingDurations | undefined) => void;
}

export function PartTimingModal({ isOpen, onClose, value, onChange }: PartTimingModalProps) {
  const [p5, setP5] = useState<string>(() => (value?.part5 != null ? String(value.part5) : '12'));
  const [p6, setP6] = useState<string>(() => (value?.part6 != null ? String(value.part6) : '8'));
  const [p7, setP7] = useState<string>(() => (value?.part7 != null ? String(value.part7) : '55'));
  const [autoP7, setAutoP7] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setP5(value?.part5 != null ? String(value.part5) : '12');
      setP6(value?.part6 != null ? String(value.part6) : '8');
      setP7(value?.part7 != null ? String(value.part7) : '55');
      setAutoP7(true);
    }
  }, [isOpen, value]);

  if (!isOpen) return null;

  const numP5 = parseInt(p5, 10) || 0;
  const numP6 = parseInt(p6, 10) || 0;
  const numP7 = parseInt(p7, 10) || 0;

  const handleP5Change = (val: string) => {
    setP5(val);
    if (autoP7) {
      const v5 = parseInt(val, 10) || 0;
      setP7(String(Math.max(0, 75 - v5 - numP6)));
    }
  };

  const handleP6Change = (val: string) => {
    setP6(val);
    if (autoP7) {
      const v6 = parseInt(val, 10) || 0;
      setP7(String(Math.max(0, 75 - numP5 - v6)));
    }
  };

  const handleP7Change = (val: string) => {
    setP7(val);
    setAutoP7(false);
  };

  const applyPreset = (presetP5: number, presetP6: number, presetP7: number) => {
    triggerHaptic(6);
    setP5(String(presetP5));
    setP6(String(presetP6));
    setP7(String(presetP7));
    setAutoP7(true);
  };

  const handleApply = () => {
    triggerHaptic(8);
    onChange({
      part5: numP5 > 0 ? numP5 : undefined,
      part6: numP6 > 0 ? numP6 : undefined,
      part7: numP7 > 0 ? numP7 : undefined,
    });
    onClose();
  };

  const handleClear = () => {
    triggerHaptic(6);
    onChange(undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timing-modal-title"
        className="relative w-full max-w-[460px] rounded-3xl border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_0_#0f172a] animate-modal-pop dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[8px_8px_0_0_#cbd5e1] space-y-4 text-slate-900 dark:text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-sm shadow-[2px_2px_0_0_#0f172a]">
              ⏱️
            </span>
            <div>
              <h3 id="timing-modal-title" className="text-base font-black">
                Phân bổ thời gian Part 5 – 7
              </h3>
              <p className="text-[11px] font-bold text-slate-400">
                Reading có 75 phút tự do phân bổ giữa 3 Part
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => applyPreset(12, 8, 55)}
            className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
              numP5 === 12 && numP6 === 8 && numP7 === 55
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-black shadow-xs dark:border-indigo-400 dark:bg-indigo-950/60 dark:text-indigo-200'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            ETS: 12 - 8 - 55
          </button>
          <button
            type="button"
            onClick={() => applyPreset(18, 10, 47)}
            className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
              numP5 === 18 && numP6 === 10 && numP7 === 47
                ? 'border-amber-600 bg-amber-50 text-amber-800 font-black shadow-xs dark:border-amber-400 dark:bg-amber-950/60 dark:text-amber-200'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            Gấp: 18 - 10 - 47
          </button>
          <button
            type="button"
            onClick={() => applyPreset(10, 8, 57)}
            className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
              numP5 === 10 && numP6 === 8 && numP7 === 57
                ? 'border-teal-600 bg-teal-50 text-teal-800 font-black shadow-xs dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-200'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            Nhanh: 10 - 8 - 57
          </button>
        </div>

        {/* 3 Input Cells Grid - Đồng bộ 100%, Thoáng đãng, Không lệch layout */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {/* Part 5 */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-3.5 text-center dark:border-indigo-800/80 dark:bg-indigo-950/30 transition-all focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block mb-1">
              Part 5
            </span>
            <input
              type="number"
              min="1"
              max="75"
              value={p5}
              onChange={e => handleP5Change(e.target.value)}
              className="w-full text-center font-black text-3xl tabular-nums bg-transparent focus:outline-none text-slate-950 dark:text-white"
            />
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mt-1">
              phút
            </span>
          </div>

          {/* Part 6 */}
          <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/40 p-3.5 text-center dark:border-teal-800/80 dark:bg-teal-950/30 transition-all focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-500/20">
            <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 block mb-1">
              Part 6
            </span>
            <input
              type="number"
              min="1"
              max="75"
              value={p6}
              onChange={e => handleP6Change(e.target.value)}
              className="w-full text-center font-black text-3xl tabular-nums bg-transparent focus:outline-none text-slate-950 dark:text-white"
            />
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mt-1">
              phút
            </span>
          </div>

          {/* Part 7 */}
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-3.5 text-center dark:border-emerald-800/80 dark:bg-emerald-950/30 transition-all focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
              Part 7
            </span>
            <input
              type="number"
              min="1"
              max="75"
              value={p7}
              onChange={e => handleP7Change(e.target.value)}
              className="w-full text-center font-black text-3xl tabular-nums bg-transparent focus:outline-none text-slate-950 dark:text-white"
            />
            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mt-1">
              phút
            </span>
          </div>
        </div>

        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center">
          💡 Gõ Part 5 & 6 sẽ tự bù trừ Part 7 = 75 – P5 – P6, hoặc bạn có thể tự nhập trực tiếp cả 3 ô.
        </p>

        {/* Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/30 transition-colors"
            >
              Xóa thời gian
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-2.5 rounded-xl border-2 border-slate-900 bg-indigo-600 text-white font-black text-xs shadow-[2px_2px_0_0_#0f172a] hover:bg-indigo-500 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-200"
          >
            Áp dụng thời gian
          </button>
        </div>
      </div>
    </div>
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
          Tổng 75p
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
          title="Chỉnh sửa phân bổ thời gian"
          className="h-[34px] w-8 rounded-lg border-[1.5px] border-slate-300 bg-white hover:border-slate-900 hover:bg-slate-900 hover:text-white flex items-center justify-center text-xs font-black text-slate-700 transition-colors shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-400 cursor-pointer"
        >
          ✏️
        </button>
      </div>
    </div>
  );
}
