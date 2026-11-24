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
    // The cue sits over the bottom of the body: once the last row is on screen (only the bottom padding is left to scroll) it goes away instead of covering that row.
    const measure = () => setHasMore(node.scrollHeight - node.scrollTop - node.clientHeight > (parseFloat(getComputedStyle(body).paddingBottom) || 0) + 12);
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
        <div className="flex flex-none justify-center py-1.5">
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
            className="flex items-center gap-1.5 rounded-full rd bg-white px-3 py-1 text-[11.5px] font-black text-[#2f3a33] shadow-[0_3px_0_#e6e9e6,0_6px_14px_-8px_rgba(47,58,51,.3)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_1px_0_#e6e9e6] cursor-pointer group"
          >
            <ChevronDown className="h-3 w-3 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none stroke-[2.5]" aria-hidden="true" />
            <span className="tracking-tight">Còn nội dung bên dưới</span>
          </button>
        </div>
      )}
    </div>
  );
}
