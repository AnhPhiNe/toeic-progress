import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';

export function ScrollableModalBody({ children, resetKey, compact = false }: { children: ReactNode; resetKey: string; compact?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  // Scroll cues are a phone aid only; computers show a scrollbar and more of the form.
  const isPhone = useMediaQuery(PHONE_QUERY);

  useEffect(() => {
    const node = viewport.current;
    const body = content.current;
    if (!node || !body) return;
    node.scrollTop = 0;
    const measure = () => setHasMore(node.scrollHeight - node.scrollTop - node.clientHeight > 12);
    const observer = new ResizeObserver(measure);
    observer.observe(node); observer.observe(body);
    const frame = requestAnimationFrame(measure);
    node.addEventListener('scroll', measure, { passive: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('scroll', measure); };
  }, [resetKey]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={viewport} tabIndex={-1} role="region" aria-label="Nội dung ghi lỗi sai" className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div ref={content} className={`px-4 pt-4 sm:px-6 ${compact ? 'space-y-3 pb-8' : 'space-y-4 pb-16'}`}>{children}</div>
      </div>
      {hasMore && isPhone && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 z-20 transition-all duration-200">
          <button
            type="button"
            onClick={() => {
              viewport.current?.focus({ preventScroll: true });
              viewport.current?.scrollTo({
                top: viewport.current.scrollHeight,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
              });
            }}
            aria-label="Cuộn xem nội dung bên dưới"
            className="flex items-center gap-1.5 rounded-full border-2 border-slate-900 bg-white/95 px-3 py-1 text-[11.5px] font-black text-slate-800 shadow-[2px_2px_0_0_#0f172a] backdrop-blur-xs hover:bg-slate-50 active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C]/95 dark:text-white dark:shadow-none cursor-pointer group"
          >
            <ChevronDown className="h-3 w-3 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none stroke-[2.5]" aria-hidden="true" />
            <span className="tracking-tight">Còn nội dung bên dưới</span>
          </button>
        </div>
      )}
    </div>
  );
}
