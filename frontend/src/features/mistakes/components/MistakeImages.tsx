import { useRef, useState } from 'react';
import { Camera, ImagePlus, Image as ImageIcon, X } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MAX_CONTEXT_IMAGES, type PreparedImage } from '@/features/mistakes/lib/imageInput';
import { Part7ImageNote } from '@/features/mistakes/components/Part7ImageNote';

/** Part 6/7 passage screenshots, sent to AI once to read the text; never stored. */
export function MistakeImages({ images, busy, part, onAdd, onRemove, embedded = false }: {
  images: PreparedImage[];
  busy: boolean;
  part: number | null;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  embedded?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  // Phones have no drag-and-drop or Ctrl+V: offer the camera and the photo library instead.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const maximum = MAX_CONTEXT_IMAGES;
  const passagePart = part === 6 ? 6 : 7;
  const label = `Ảnh ngữ cảnh · Part ${passagePart}`;
  const unavailable = busy || part === null || images.length >= maximum;
  return <div className={`space-y-2 ${embedded ? '' : 'rounded-xl border px-3 py-2.5'} ${dragging ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700'}`}
    role="group" aria-label={label}
    onDragEnter={event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault(); dragDepth.current++;
      if (!unavailable) setDragging(true);
    }}
    onDragOver={event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault(); event.dataTransfer.dropEffect = unavailable ? 'none' : 'copy';
    }}
    onDragLeave={event => {
      event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }}
    onDrop={event => {
      event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false);
      if (!busy && part !== null) onAdd(Array.from(event.dataTransfer.files));
    }}
    onPaste={event => {
      const files = Array.from(event.clipboardData.files);
      if (files.length) { event.preventDefault(); if (!busy && part !== null) onAdd(files); }
    }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">{!embedded && label} <span className="text-xs font-normal text-slate-500">{images.length}/{maximum} ảnh</span></span>
      <button type="button" disabled={busy || part === null || images.length >= maximum} onClick={() => fileInput.current?.click()}
        className="max-md:hidden inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-950">
        <ImagePlus className="h-4 w-4" aria-hidden="true" />{busy ? 'Đang xử lý ảnh…' : 'Thêm ảnh'}
      </button>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || part === null}
        aria-label={`Chọn ảnh Part ${passagePart}`} className="sr-only" tabIndex={-1} onChange={event => {
          onAdd(Array.from(event.target.files ?? [])); event.target.value = '';
        }} />
    </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" disabled={busy || part === null}
        aria-label={`Chụp trang Part ${passagePart}`} className="sr-only" tabIndex={-1} onChange={event => {
          onAdd(Array.from(event.target.files ?? [])); event.target.value = '';
        }} />
    <Part7ImageNote part={passagePart} />
    {isPhone ? !unavailable && <div className="grid grid-cols-2 gap-2">
      {([['camera', 'Chụp trang', Camera], ['library', 'Chọn ảnh', ImageIcon]] as const).map(([kind, text, Icon]) => (
        <button key={kind} type="button" disabled={unavailable} onClick={() => (kind === 'camera' ? cameraInput : fileInput).current?.click()}
          className="flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 text-[13.5px] font-black text-blue-700 disabled:opacity-40 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <Icon className="h-6 w-6" aria-hidden="true" />{text}
        </button>
      ))}
    </div> : <button type="button" disabled={unavailable} aria-label={`Vùng thêm ảnh Part ${part ?? 7}`}
      onClick={() => fileInput.current?.click()}
      className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${
        dragging ? 'border-blue-500 bg-blue-100/70 dark:border-blue-400 dark:bg-blue-950/60' : 'border-blue-200 bg-blue-50/60 hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900/50 dark:hover:border-blue-400'
      } ${images.length ? 'min-h-16' : 'min-h-28'}`}>
      {!images.length && <ImageIcon className="mb-1 h-8 w-8 text-blue-400 dark:text-blue-500" strokeWidth={1.5} aria-hidden="true" />}
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{dragging ? 'Thả ảnh để thêm' : unavailable && !busy ? 'Đã đủ số ảnh' : 'Kéo ảnh vào đây'}</span>
      {!unavailable && <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Bấm để chọn ảnh · Tab đến vùng này rồi Ctrl+V để dán</span>}
      {!images.length && <span className="text-[11px] text-slate-500 dark:text-slate-400">PNG, JPG, WebP · Tối đa 20 MB/ảnh</span>}
    </button>}
    {images.length > 0 && <div className="flex flex-wrap gap-2">{images.map((image, index) => <div key={image.id} className="relative w-24">
      <img src={image.dataUrl} alt={`Ảnh Part ${passagePart} ${index + 1}`} className="h-20 w-24 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
      <button type="button" disabled={busy} aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => onRemove(image.id)}
        className="absolute -right-1 -top-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-rose-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"><X className="h-4 w-4" aria-hidden="true" /></button>
      <p className="mt-1 truncate text-xs text-slate-500" title={image.name}>{image.name}</p>
    </div>)}</div>}
    {images.length > 0 && <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">Ảnh chỉ dùng để AI đọc, không lưu lại; thẻ giữ đoạn văn bằng chữ. Đáp án đúng nhập ở “Đáp án đúng từ đề”.</p>}
  </div>;
}

export function ImageComparison({ images, part }: { images: PreparedImage[]; part: number | null }) {
  if (!images.length) return null;
  return <details className="text-sm text-slate-600 dark:text-slate-300">
    <summary className="cursor-pointer py-1 font-semibold">Đối chiếu ảnh ({images.length})</summary>
    <div className="mt-2 space-y-3">{images.map((image, index) => <img key={image.id} src={image.dataUrl}
      alt={`Ảnh nguồn Part ${part ?? 7} ${index + 1}`} className="h-auto w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />)}</div>
  </details>;
}
