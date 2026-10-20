import type { ReactNode } from 'react';

export function MistakeContextInput({ part, mode, text, busy, onMode, onText, reuseLabel, onReset, images }: {
  part: number | null;
  mode: 'text' | 'image';
  text: string;
  busy: boolean;
  onMode: (mode: 'text' | 'image') => void;
  onText: (text: string) => void;
  reuseLabel?: string;
  onReset: () => void;
  images: ReactNode;
}) {
  if (part === null) return null;
  const label = part === 1 ? 'Tranh' : part <= 4 ? 'Transcript' : part === 5 ? 'Ngữ cảnh' : 'Đoạn đọc';
  const content = <>
    {reuseLabel && <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-semibold text-blue-700 dark:text-blue-300">{reuseLabel}</span>
      <button type="button" disabled={busy} onClick={onReset} className="min-h-10 shrink-0 font-semibold text-blue-600 dark:text-blue-400">Đổi bài đọc</button>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      {part === 1 || part === 7 && mode === 'image' ? <span className="text-sm font-bold">{label}</span> : <label htmlFor="mistake-context" className="text-sm font-bold">{label}</label>}
      {part === 7 && <div role="group" aria-label="Loại ngữ cảnh" className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
        {(['text', 'image'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={busy}
          onClick={() => onMode(value)} className={`min-h-10 rounded-md px-3 text-xs font-semibold ${mode === value ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>{value === 'text' ? 'Văn bản' : 'Ảnh'}</button>)}
      </div>}
    </div>
    {part === 1 || part === 7 && mode === 'image' ? images : <textarea id="mistake-context" disabled={busy} value={text} maxLength={16000}
      onChange={event => onText(event.target.value)} rows={3}
      placeholder={part <= 4 ? 'Dán transcript câu hỏi, hội thoại hoặc bài nói…' : part === 5 ? 'Thêm ngữ cảnh nếu câu hỏi cần…' : 'Dán bài đọc, email hoặc các đoạn văn liên quan…'}
      className="min-h-[96px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-base leading-relaxed placeholder:text-slate-400 focus:outline-2 focus:outline-blue-500 dark:border-slate-700 dark:bg-slate-900" />}
  </>;
  const classes = 'space-y-2 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700';
  return part === 5 ? <details open={text.trim() ? true : undefined} className={classes}>
    <summary className="cursor-pointer py-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Ngữ cảnh<span className="ml-1 text-xs font-semibold text-slate-400 dark:text-slate-500">không bắt buộc</span></summary>
    <div className="space-y-2">{content}</div>
  </details> : <section aria-label={`Khu vực ${label.toLowerCase()}`} className={classes}>{content}</section>;
}
