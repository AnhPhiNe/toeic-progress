import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { MAX_SIDE, scaledSize } from '@/features/mistakes/lib/imageCompress';
import { decodeUprightBitmap } from '@/features/mistakes/lib/imageInput';
import { checkPhotoClarity, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import './photo-review.css';

export interface CropBox { left: number; top: number; right: number; bottom: number }
export const FULL_CROP: CropBox = { left: 0, top: 0, right: 100, bottom: 100 };
const MIN_SPAN = 12;

export function isFullCrop(crop: CropBox): boolean {
  return crop.left <= 0.5 && crop.top <= 0.5 && crop.right >= 99.5 && crop.bottom >= 99.5;
}

/** Render a rotated/cropped JPEG 0.92 preview or export blob from an upright source bitmap. */
async function renderEditedBlob(file: File, rotation: number, crop: CropBox, previewMaxSide?: number): Promise<Blob> {
  const bitmap = await decodeUprightBitmap(file);
  try {
    const turns = ((rotation % 360) + 360) % 360;
    const swap = turns === 90 || turns === 270;
    const rotW = swap ? bitmap.height : bitmap.width;
    const rotH = swap ? bitmap.width : bitmap.height;

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = rotW;
    fullCanvas.height = rotH;
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) throw new Error('Trình duyệt chưa xử lý được ảnh.');
    fullCtx.fillStyle = '#ffffff';
    fullCtx.fillRect(0, 0, rotW, rotH);
    fullCtx.translate(rotW / 2, rotH / 2);
    fullCtx.rotate((turns * Math.PI) / 180);
    fullCtx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const sx = Math.max(0, Math.round((crop.left / 100) * rotW));
    const sy = Math.max(0, Math.round((crop.top / 100) * rotH));
    const sw = Math.max(1, Math.min(rotW - sx, Math.round(((crop.right - crop.left) / 100) * rotW)));
    const sh = Math.max(1, Math.min(rotH - sy, Math.round(((crop.bottom - crop.top) / 100) * rotH)));

    const target = scaledSize(sw, sh, previewMaxSide ?? MAX_SIDE);
    const out = document.createElement('canvas');
    out.width = target.width;
    out.height = target.height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt chưa xử lý được ảnh.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Không xuất được ảnh đã chỉnh.');
    return blob;
  } finally {
    bitmap.close();
  }
}

interface Props {
  file: File;
  photoMode: boolean;
  onApply: (result: { file: File; photoMode: boolean; changed: boolean }) => void;
  onClose: () => void;
}

type DragKind = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/**
 * Optional local PhotoReview modal (Zero Destructive):
 * - Rotate 90° left/right
 * - Visual pointer-draggable crop + A11y range sliders
 * - Toggle paper photo mode (routes backend OCR to gpt-6.1-terra without altering pixels)
 * - Returns the exact original File untouched if no rotation/crop was made.
 */
export function PhotoReview({ file, photoMode: initialPhotoMode, onApply, onClose }: Props) {
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<CropBox>(FULL_CROP);
  const [photoMode, setPhotoMode] = useState(initialPhotoMode);
  const [previewUrl, setPreviewUrl] = useState('');
  const [clarity, setClarity] = useState<ClarityResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; startCrop: CropBox; width: number; height: number } | null>(null);
  const dialogRef = useModalA11y(true, onClose);

  // Build preview URL whenever rotation changes (0° reuses original file directly without re-encoding).
  useEffect(() => {
    let alive = true;
    let url = '';
    const preparePreview = async () => {
      try {
        if (rotation % 360 === 0) {
          url = URL.createObjectURL(file);
        } else {
          const blob = await renderEditedBlob(file, rotation, FULL_CROP, 1400);
          if (!alive) return;
          url = URL.createObjectURL(blob);
        }
        if (!alive) { URL.revokeObjectURL(url); return; }
        setPreviewUrl(url);
        const reading = await checkPhotoClarity(url);
        if (alive) setClarity(reading);
      } catch {
        if (alive) setError('Không hiển thị được ảnh xem trước.');
      }
    };
    void preparePreview();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, rotation]);

  const startDrag = (kind: DragKind, event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, startCrop: crop, width: rect.width, height: rect.height };
  };

  const onMoveDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = ((event.clientX - drag.startX) / drag.width) * 100;
    const dy = ((event.clientY - drag.startY) / drag.height) * 100;
    const s = drag.startCrop;
    if (drag.kind === 'move') {
      const spanX = s.right - s.left;
      const spanY = s.bottom - s.top;
      const left = Math.max(0, Math.min(100 - spanX, s.left + dx));
      const top = Math.max(0, Math.min(100 - spanY, s.top + dy));
      setCrop({ left, top, right: left + spanX, bottom: top + spanY });
      return;
    }
    let { left, top, right, bottom } = s;
    if (drag.kind === 'nw' || drag.kind === 'sw') left = Math.max(0, Math.min(s.right - MIN_SPAN, s.left + dx));
    if (drag.kind === 'ne' || drag.kind === 'se') right = Math.min(100, Math.max(s.left + MIN_SPAN, s.right + dx));
    if (drag.kind === 'nw' || drag.kind === 'ne') top = Math.max(0, Math.min(s.bottom - MIN_SPAN, s.top + dy));
    if (drag.kind === 'sw' || drag.kind === 'se') bottom = Math.min(100, Math.max(s.top + MIN_SPAN, s.bottom + dy));
    setCrop({ left, top, right, bottom });
  };

  const endDrag = () => { dragRef.current = null; };

  const rotateBy = (delta: number) => {
    setRotation(value => (value + delta + 360) % 360);
    setCrop(FULL_CROP);
  };

  const apply = async () => {
    if (busy) return;
    const edited = (rotation % 360) !== 0 || !isFullCrop(crop);
    if (!edited) {
      // Zero-destructive: pass the exact original file untouched.
      onApply({ file, photoMode, changed: false });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = await renderEditedBlob(file, rotation, crop);
      const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
      const nextFile = new File([blob], `${baseName}-edited.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      onApply({ file: nextFile, photoMode, changed: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa xuất được ảnh đã chỉnh.');
      setBusy(false);
    }
  };

  const edited = (rotation % 360) !== 0 || !isFullCrop(crop);

  return createPortal(
    <div className="phr-dim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Chỉnh và cắt ảnh" tabIndex={-1} className="phr-mod">
        <div className="phr-head">
          <div>
            <h3>Chỉnh &amp; cắt ảnh</h3>
            <small>Tuỳ chọn — nếu không xoay/cắt, Sóc gửi nguyên ảnh gốc sạch.</small>
          </div>
          <button type="button" className="phr-x" aria-label="Đóng chỉnh ảnh" onClick={onClose}>✕</button>
        </div>

        <div className="phr-body">
          <div className="phr-stage-wrap">
            {previewUrl && (
              <div ref={stageRef} className="phr-stage">
                <img src={previewUrl} alt="Xem trước ảnh cần đọc" />
                <div
                  className="phr-crop"
                  style={{
                    left: `${crop.left}%`,
                    top: `${crop.top}%`,
                    width: `${crop.right - crop.left}%`,
                    height: `${crop.bottom - crop.top}%`,
                  }}
                  onPointerDown={event => startDrag('move', event)}
                  onPointerMove={onMoveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                    <button
                      key={corner}
                      type="button"
                      className={`phr-handle is-${corner}`}
                      aria-label={`Kéo góc cắt ${corner.toUpperCase()}`}
                      onPointerDown={event => startDrag(corner, event)}
                      onPointerMove={onMoveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="phr-bar">
            <button type="button" className="phr-btn" onClick={() => rotateBy(-90)}>↺ Xoay trái</button>
            <button type="button" className="phr-btn" onClick={() => rotateBy(90)}>↻ Xoay phải</button>
            {edited && (
              <button type="button" className="phr-btn" onClick={() => { setRotation(0); setCrop(FULL_CROP); }}>Đặt lại gốc</button>
            )}
            {clarity && (
              <span className={'phr-pill ' + (clarity.problem ? 'is-warn' : 'is-ok')} role="status">
                {clarity.problem === 'dark' ? '⚠ Ảnh hơi tối' : clarity.problem === 'blur' ? '⚠ Ảnh hơi mờ' : '✓ Ảnh rõ, đủ sáng'}
              </span>
            )}
          </div>

          <label className="phr-paper">
            <input type="checkbox" checked={photoMode} onChange={event => setPhotoMode(event.target.checked)} />
            <span>
              <b>Ảnh chụp sách giấy / phiếu tô tay</b>
              <small>Bật khi chụp tài liệu giấy có bóng gáy, chữ 2 cột hoặc bút khoanh tay — Sóc dùng model đọc ảnh giấy chuyên sâu.</small>
            </span>
          </label>

          <details className="phr-sliders">
            <summary>Chỉnh khung cắt chính xác bằng thanh trượt (bàn phím)</summary>
            <div className="phr-slider-grid">
              <label>
                Cắt mép trái: {Math.round(crop.left)}%
                <input type="range" min={0} max={Math.max(0, Math.round(crop.right - MIN_SPAN))} value={Math.round(crop.left)}
                  onChange={event => setCrop(c => ({ ...c, left: Math.min(c.right - MIN_SPAN, Number(event.target.value)) }))} />
              </label>
              <label>
                Cắt mép phải: {Math.round(100 - crop.right)}%
                <input type="range" min={Math.min(100, Math.round(crop.left + MIN_SPAN))} max={100} value={Math.round(crop.right)}
                  onChange={event => setCrop(c => ({ ...c, right: Math.max(c.left + MIN_SPAN, Number(event.target.value)) }))} />
              </label>
              <label>
                Cắt mép trên: {Math.round(crop.top)}%
                <input type="range" min={0} max={Math.max(0, Math.round(crop.bottom - MIN_SPAN))} value={Math.round(crop.top)}
                  onChange={event => setCrop(c => ({ ...c, top: Math.min(c.bottom - MIN_SPAN, Number(event.target.value)) }))} />
              </label>
              <label>
                Cắt mép dưới: {Math.round(100 - crop.bottom)}%
                <input type="range" min={Math.min(100, Math.round(crop.top + MIN_SPAN))} max={100} value={Math.round(crop.bottom)}
                  onChange={event => setCrop(c => ({ ...c, bottom: Math.max(c.top + MIN_SPAN, Number(event.target.value)) }))} />
              </label>
            </div>
          </details>

          {error && <p className="phr-err" role="alert">{error}</p>}
        </div>

        <div className="phr-foot">
          <span className="phr-foot-note">{edited ? 'Áp dụng xoay/cắt ở chất lượng cao (JPEG 92%).' : 'Giữ nguyên tệp ảnh gốc.'}</span>
          <button type="button" className="phr-btn" onClick={onClose}>Huỷ</button>
          <button type="button" className="rd-btn rd-btn--pink" disabled={busy} onClick={() => void apply()}>
            {busy ? 'Đang xử lý…' : 'Áp dụng'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
