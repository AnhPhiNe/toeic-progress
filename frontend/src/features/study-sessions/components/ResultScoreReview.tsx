import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { X } from 'lucide-react';
import type { ResultImageScores } from '@/features/mistakes/services/aiMistakeExtractor';
import { resolveFullTestScore } from '../lib/fullTestScore';
import { triggerHaptic } from '@/shared/lib/haptics';

import type { PartTimingDurations } from '@/shared/types';

export type AppliedResultScore = { source: 'MANUAL_SECTIONS'; listening: number; reading: number; partDurations?: PartTimingDurations }
  | { source: 'MANUAL_TOTAL'; total: number; partDurations?: PartTimingDurations };
export interface ResultScoreDraft {
  scores: ResultImageScores;
  mode: AppliedResultScore['source'];
  fields: { listening: string; reading: string; total: string };
  edited: boolean;
}
export type ResultScoreStore = { current: ResultScoreDraft | null };
export const createResultScoreDraft = (scores: ResultImageScores): ResultScoreDraft => ({
  scores,
  mode: scores.listening !== null && scores.reading !== null || scores.total === null ? 'MANUAL_SECTIONS' : 'MANUAL_TOTAL',
  fields: { listening: scores.listening?.toString() ?? '', reading: scores.reading?.toString() ?? '', total: scores.total?.toString() ?? '' },
  edited: false
});

export function tryAutoApplyResultScores(scores: ResultImageScores | null | undefined): AppliedResultScore | null {
  if (!scores) return null;
  const partDurations: PartTimingDurations | undefined = (scores.part5Minutes != null || scores.part6Minutes != null || scores.part7Minutes != null) ? {
    part5: scores.part5Minutes ?? undefined,
    part6: scores.part6Minutes ?? undefined,
    part7: scores.part7Minutes ?? undefined,
  } : undefined;
  if (scores.listening !== null && scores.reading !== null) {
    if (scores.total !== null && scores.listening + scores.reading !== scores.total) {
      return null;
    }
    try {
      const candidate: AppliedResultScore = { source: 'MANUAL_SECTIONS', listening: scores.listening, reading: scores.reading, partDurations };
      resolveFullTestScore(candidate);
      return candidate;
    } catch {
      /* Fall through to total score if section scores are out of bounds */
    }
  }
  if (scores.total !== null) {
    try {
      const candidate: AppliedResultScore = { source: 'MANUAL_TOTAL', total: scores.total, partDurations };
      resolveFullTestScore(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
  return null;
}


/** Image values are candidates; only an explicit learner action changes the saved score source. */
export function ResultScoreReview({ scores, onApply, onEdit, onDiscard, onClose, draft, onDraftChange, disabled = false }: {
  scores: ResultImageScores; onApply: (score: AppliedResultScore) => void; onEdit: () => void; onDiscard: () => void; disabled?: boolean;
  draft?: ResultScoreDraft | null; onDraftChange?: (draft: ResultScoreDraft) => void;
  /** Hides the panel while keeping its unapplied candidate; distinct from choosing an estimate. */
  onClose: () => void;
}) {
  const [mode, setMode] = useState(() => (draft ?? createResultScoreDraft(scores)).mode);
  const [fields, setFields] = useState(() => (draft ?? createResultScoreDraft(scores)).fields);
  const [error, setError] = useState('');
  const close = () => { if (!disabled) onClose(); };
  const modalRef = useModalA11y(true, close);

  const handleLChange = (val: string) => {
    const next = { ...fields, listening: val };
    const lNum = Number(val);
    const rNum = Number(fields.reading);
    if (val.trim() && fields.reading.trim() && !isNaN(lNum) && !isNaN(rNum)) {
      next.total = String(lNum + rNum);
    }
    setFields(next);
    setError('');
    onEdit();
    onDraftChange?.({ scores, mode, fields: next, edited: true });
  };

  const handleRChange = (val: string) => {
    const next = { ...fields, reading: val };
    const lNum = Number(fields.listening);
    const rNum = Number(val);
    if (fields.listening.trim() && val.trim() && !isNaN(lNum) && !isNaN(rNum)) {
      next.total = String(lNum + rNum);
    }
    setFields(next);
    setError('');
    onEdit();
    onDraftChange?.({ scores, mode, fields: next, edited: true });
  };

  const handleTotalChange = (val: string) => {
    const next = { ...fields, total: val };
    setFields(next);
    setError('');
    onEdit();
    onDraftChange?.({ scores, mode, fields: next, edited: true });
  };

  const apply = () => {
    triggerHaptic(8);
    try {
      const partDurations: PartTimingDurations | undefined = (scores.part5Minutes != null || scores.part6Minutes != null || scores.part7Minutes != null) ? {
        part5: scores.part5Minutes ?? undefined,
        part6: scores.part6Minutes ?? undefined,
        part7: scores.part7Minutes ?? undefined,
      } : undefined;
      const selected: AppliedResultScore = mode === 'MANUAL_SECTIONS'
        ? { source: mode, listening: Number(fields.listening), reading: Number(fields.reading), partDurations }
        : { source: mode, total: Number(fields.total), partDurations };
      resolveFullTestScore(selected);
      if (selected.source === 'MANUAL_SECTIONS' && fields.total.trim()
        && selected.listening + selected.reading !== Number(fields.total)) {
        throw new Error('Tổng điểm chưa khớp L + R. Kiểm tra lại các ô, hoặc chọn “Chỉ tổng điểm”.');
      }
      onApply(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kiểm tra lại điểm trước khi áp dụng.');
    }
  };

  const handleDiscard = () => {
    triggerHaptic(6);
    onDiscard();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {/* Visual Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px] pointer-events-none animate-backdrop"
        aria-hidden="true"
      />

      {/* Modal Dialog Card: Phương án 1 - Thanh 3 Cột Liền Khối [ L + R = Tổng ] */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="Kiểm tra điểm từ ảnh"
        className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain w-full max-w-[560px] rounded-3xl border-2 border-slate-900 bg-[#FFFDF7] p-6 sm:p-7 shadow-[8px_8px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[8px_8px_0_0_#cbd5e1] animate-modal-pop space-y-5"
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-200/90 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400 text-slate-950 text-base font-black shadow-[2px_2px_0_0_#0f172a]">
              📄
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-950 dark:text-white">Điểm từ đề thi</h3>
                <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                  Tùy chọn
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                Kiểm tra hoặc sửa điểm trước khi áp dụng vào bài thi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={disabled}
            aria-label="Đóng điểm từ đề"
            className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-700 shadow-[2px_2px_0_0_#0f172a] hover:bg-slate-100 hover:text-slate-950 active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-400 dark:bg-slate-800 dark:text-slate-200 transition-all cursor-pointer"
            title="Đóng và giữ điểm chờ kiểm tra"
          >
            <X size={16} />
          </button>
        </div>

        {/* Segmented Control chọn chế độ */}
        <div
          role="group"
          aria-label="Dùng điểm từ ảnh"
          className="grid grid-cols-2 gap-1.5 rounded-2xl border-2 border-slate-900 bg-slate-100 p-1.5 dark:border-slate-700 dark:bg-slate-900"
        >
          {(['MANUAL_SECTIONS', 'MANUAL_TOTAL'] as const).map(value => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => {
                  triggerHaptic(6);
                  setMode(value);
                  setError('');
                  onEdit();
                  onDraftChange?.({ scores, mode: value, fields, edited: true });
                }}
                className={`min-h-10 cursor-pointer rounded-xl text-xs sm:text-sm font-black transition-all ${
                  active
                    ? 'border-2 border-slate-900 bg-white text-slate-950 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#162137] dark:text-white dark:shadow-none'
                    : 'border border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {value === 'MANUAL_SECTIONS' ? 'Listening + Reading' : 'Chỉ tổng điểm'}
              </button>
            );
          })}
        </div>

        {/* Khối Bento 3 Cột Ngang [ L + R = Tổng ] */}
        <div className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-sm dark:border-slate-400 dark:bg-slate-900">
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1.1fr] items-center gap-2 sm:gap-3 text-center">
            
            {/* Cột 1: Listening */}
            <div className={`flex flex-col items-center transition-opacity ${mode === 'MANUAL_TOTAL' ? 'opacity-35' : 'opacity-100'}`}>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  <span className="hidden sm:inline">🎧 Listening</span><span className="sm:hidden">🎧 Nghe</span>
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Điểm từ ảnh: Listening"
                disabled={disabled || mode === 'MANUAL_TOTAL'}
                value={fields.listening}
                placeholder="—"
                onChange={event => handleLChange(event.target.value)}
                className="h-13 w-full rounded-xl border-2 border-slate-900 bg-indigo-50/70 focus:bg-white text-center font-black tabular-nums text-2xl text-slate-950 placeholder:text-slate-300 shadow-[1.5px_1.5px_0_0_#0f172a] focus:outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:cursor-not-allowed dark:border-slate-400 dark:bg-indigo-950/40 dark:text-white"
              />
              <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 mt-1">/ 495</span>
            </div>

            {/* Dấu cộng + */}
            <span className="text-xl font-black text-slate-300 dark:text-slate-600 mb-4 select-none" aria-hidden="true">
              +
            </span>

            {/* Cột 2: Reading */}
            <div className={`flex flex-col items-center transition-opacity ${mode === 'MANUAL_TOTAL' ? 'opacity-35' : 'opacity-100'}`}>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  <span className="hidden sm:inline">📖 Reading</span><span className="sm:hidden">📖 Đọc</span>
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Điểm từ ảnh: Reading"
                disabled={disabled || mode === 'MANUAL_TOTAL'}
                value={fields.reading}
                placeholder="—"
                onChange={event => handleRChange(event.target.value)}
                className="h-13 w-full rounded-xl border-2 border-slate-900 bg-teal-50/70 focus:bg-white text-center font-black tabular-nums text-2xl text-slate-950 placeholder:text-slate-300 shadow-[1.5px_1.5px_0_0_#0f172a] focus:outline-none focus:ring-4 focus:ring-teal-500/20 disabled:cursor-not-allowed dark:border-slate-400 dark:bg-teal-950/40 dark:text-white"
              />
              <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 mt-1">/ 495</span>
            </div>

            {/* Dấu bằng = */}
            <span className="text-xl font-black text-slate-300 dark:text-slate-600 mb-4 select-none" aria-hidden="true">
              =
            </span>

            {/* Cột 3: Tổng Điểm */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-400">
                  <span className="hidden sm:inline">⚡ Tổng điểm</span><span className="sm:hidden">⚡ Tổng</span>
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Điểm từ ảnh: Tổng"
                disabled={disabled}
                value={fields.total}
                placeholder="—"
                onChange={event => handleTotalChange(event.target.value)}
                className="h-13 w-full rounded-xl border-2 border-slate-900 bg-amber-100/70 focus:bg-white text-center font-black tabular-nums text-2xl text-slate-950 placeholder:text-slate-300 shadow-[1.5px_1.5px_0_0_#0f172a] focus:outline-none focus:ring-4 focus:ring-amber-500/20 dark:border-slate-400 dark:bg-amber-950/40 dark:text-white"
              />
              <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 mt-1">/ 990</span>
            </div>

          </div>
        </div>

        {/* Dải Thời gian Part 5 – 7 bóc tách từ ảnh */}
        {(scores.part5Minutes != null || scores.part6Minutes != null || scores.part7Minutes != null) && (
          <div className="rounded-2xl border-2 border-slate-900 bg-emerald-50/70 p-3.5 space-y-2.5 dark:border-slate-400 dark:bg-emerald-950/30">
            <div className="flex items-center justify-between text-xs font-black text-emerald-950 dark:text-emerald-200">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">⏱️</span>
                <span>Thời gian Reading Part 5 – 7 bóc tách từ ảnh</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-extrabold dark:bg-emerald-900 dark:text-emerald-200">
                Theo ảnh
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-300 bg-white p-2 text-center dark:border-emerald-800 dark:bg-slate-900">
                <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-400 block uppercase">Part 5</span>
                <span className="text-lg font-black text-slate-950 dark:text-white tabular-nums">
                  {scores.part5Minutes ?? '—'} <span className="text-xs font-bold text-slate-400">p</span>
                </span>
              </div>
              <div className="rounded-xl border border-emerald-300 bg-white p-2 text-center dark:border-emerald-800 dark:bg-slate-900">
                <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-400 block uppercase">Part 6</span>
                <span className="text-lg font-black text-slate-950 dark:text-white tabular-nums">
                  {scores.part6Minutes ?? '—'} <span className="text-xs font-bold text-slate-400">p</span>
                </span>
              </div>
              <div className="rounded-xl border border-emerald-300 bg-white p-2 text-center dark:border-emerald-800 dark:bg-slate-900">
                <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-400 block uppercase">Part 7</span>
                <span className="text-lg font-black text-slate-950 dark:text-white tabular-nums">
                  {scores.part7Minutes ?? '—'} <span className="text-xs font-bold text-slate-400">p</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Chú thích thông minh */}
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center">
          {mode === 'MANUAL_SECTIONS'
            ? '💡 Tổng điểm tự động cập nhật khi sửa Listening hoặc Reading. Bạn có thể sửa trực tiếp ô Tổng.'
            : '💡 Chế độ chỉ lưu Tổng điểm. Các câu sai đã đánh dấu vẫn được lưu đầy đủ trên lưới 200 câu.'}
        </p>

        {error && (
          <div role="alert" className="rounded-2xl border-2 border-rose-500 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
            {error}
          </div>
        )}

        {/* Nút hành động */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={disabled}
            onClick={apply}
            className="min-h-12 w-full cursor-pointer rounded-xl border-2 border-slate-900 bg-amber-400 hover:bg-amber-300 px-4 text-sm font-black text-slate-950 shadow-[3px_3px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#0f172a] transition-all disabled:opacity-60 dark:border-slate-300"
          >
            Áp dụng điểm từ đề
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={handleDiscard}
            className="min-h-9 w-full cursor-pointer rounded-xl border border-transparent text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
          >
            Dùng điểm ước tính
          </button>
        </div>
      </div>
    </div>
  , document.body);
}
