import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { X } from 'lucide-react';
import './edit-rd.css';
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
        className="fixed inset-0 bg-[#2f3a33]/60 backdrop-blur-[2px] pointer-events-none animate-backdrop"
        aria-hidden="true"
      />

      {/* Modal Dialog Card: Đồng bộ hệ .rd / .rdt */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="Kiểm tra điểm từ ảnh"
        className="rd rdr relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain w-full max-w-[496px] animate-modal-pop"
      >
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="rdr-title">Điểm từ đề thi</h3>
            <p className="rdr-sub">Kiểm tra hoặc sửa điểm trước khi áp dụng vào bài thi</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={disabled}
            aria-label="Đóng điểm từ đề"
            className="rdl-x shrink-0 cursor-pointer"
            title="Đóng và giữ điểm chờ kiểm tra"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented Control chọn chế độ (đồng bộ .rde-seg) */}
        <div
          role="group"
          aria-label="Dùng điểm từ ảnh"
          className="rde-seg rde-seg--sm mt-4"
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
              >
                {value === 'MANUAL_SECTIONS' ? 'Listening + Reading' : 'Chỉ tổng điểm'}
              </button>
            );
          })}
        </div>

        {/* Nhập điểm: tách rõ 2 trạng thái để "Chỉ tổng điểm" không hiện ô L/R bị mờ gây nhầm lẫn */}
        {mode === 'MANUAL_SECTIONS' ? (
          <div className="rdr-eq mt-4">
            <label className="rdr-cell is-l">
              <span>Listening</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Điểm từ ảnh: Listening"
                disabled={disabled}
                value={fields.listening}
                placeholder="—"
                onChange={event => handleLChange(event.target.value)}
              />
              <small>/ 495</small>
            </label>

            <span className="rdr-op" aria-hidden="true">+</span>

            <label className="rdr-cell is-r">
              <span>Reading</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Điểm từ ảnh: Reading"
                disabled={disabled}
                value={fields.reading}
                placeholder="—"
                onChange={event => handleRChange(event.target.value)}
              />
              <small>/ 495</small>
            </label>

            <span className="rdr-op" aria-hidden="true">=</span>

            <label className="rdr-cell is-t">
              <span>Tổng điểm</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Điểm từ ảnh: Tổng"
                disabled={disabled}
                value={fields.total}
                placeholder="—"
                onChange={event => handleTotalChange(event.target.value)}
              />
              <small>/ 990</small>
            </label>
          </div>
        ) : (
          <div className="rdr-total mt-4">
            <label className="rdr-total-box">
              <span>Tổng điểm toàn bài</span>
              <div className="rdr-total-row">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Điểm từ ảnh: Tổng"
                  disabled={disabled}
                  value={fields.total}
                  placeholder="—"
                  onChange={event => handleTotalChange(event.target.value)}
                />
                <small>/ 990</small>
              </div>
            </label>
          </div>
        )}

        {/* Dải Thời gian Part 5 – 7 bóc tách từ ảnh */}
        {(scores.part5Minutes != null || scores.part6Minutes != null || scores.part7Minutes != null) && (
          <div className="rdr-timing mt-3.5">
            <div className="rdr-timing-h">
              <span>Thời gian Reading Part 5 – 7</span>
              <small>Bóc tách từ ảnh</small>
            </div>
            <div className="rdt-grid mt-2">
              <div className="rdt-cell">
                <span>Part 5</span>
                <b>{scores.part5Minutes ?? '—'}</b>
                <small>phút</small>
              </div>
              <div className="rdt-cell">
                <span>Part 6</span>
                <b>{scores.part6Minutes ?? '—'}</b>
                <small>phút</small>
              </div>
              <div className="rdt-cell">
                <span>Part 7</span>
                <b>{scores.part7Minutes ?? '—'}</b>
                <small>phút</small>
              </div>
            </div>
          </div>
        )}

        {/* Chú thích gọn, dễ quét */}
        <p className="rdr-hint mt-3.5">
          {mode === 'MANUAL_SECTIONS'
            ? 'Tổng điểm tự động cộng từ Listening + Reading, hoặc bạn có thể sửa trực tiếp.'
            : 'Chỉ lưu Tổng điểm; các câu sai đã chọn trên lưới 200 câu vẫn được giữ đầy đủ.'}
        </p>

        {error && (
          <div role="alert" className="rdt-err rounded-2xl bg-[var(--rd-pink-l)] px-3.5 py-2.5">
            {error}
          </div>
        )}

        {/* Footer action đồng bộ PartTimingModal (.rdt-foot + .rd-btn) */}
        <div className="rdt-foot">
          <button
            type="button"
            disabled={disabled}
            onClick={handleDiscard}
            className="rdt-cancel"
          >
            Dùng điểm ước tính
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={apply}
            className="rd-btn rdt-save"
          >
            Áp dụng điểm từ đề
          </button>
        </div>
      </div>
    </div>
  , document.body);
}
