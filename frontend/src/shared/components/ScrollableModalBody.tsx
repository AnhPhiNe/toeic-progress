import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';

export function ScrollableModalBody({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const node = viewport.current;
    const body = content.current;
    if (!node || !body) return;
    node.scrollTop = 0;
    const measure = () => setHasMore(node.scrollHeight - node.scrollTop - node.clientHeight > 4);
    const observer = new ResizeObserver(measure);
    observer.observe(node); observer.observe(body);
    const frame = requestAnimationFrame(measure);
    node.addEventListener('scroll', measure, { passive: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('scroll', measure); };
  }, [resetKey]);
  return <div className="relative flex min-h-0 flex-col">
    <div ref={viewport} tabIndex={-1} role="region" aria-label="Nội dung ghi lỗi sai" className="min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
      <div ref={content} className="space-y-4 px-4 pt-4 pb-16 sm:px-6">{children}</div>
    </div>
    {hasMore && <div className="group absolute bottom-3 left-1/2 -translate-x-1/2">
      <span id={tooltipId} role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-100 dark:text-slate-900">Còn nội dung bên dưới</span>
      <button type="button" aria-label="Cuộn xem nội dung bên dưới" aria-describedby={tooltipId}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-blue-600 shadow-md hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
        onClick={() => {
          viewport.current?.focus({ preventScroll: true });
          viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }}><ArrowDown className="h-4 w-4 motion-safe:animate-scroll-cue" aria-hidden="true" /></button>
    </div>}
  </div>;
}
