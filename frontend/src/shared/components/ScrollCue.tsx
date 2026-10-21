import { useEffect, useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface PageScrollCueProps {
  /** Re-checks scrollability when the active tab or view changes */
  activeTab?: string;
}

/**
 * Floating indicator displayed at the bottom of long pages when content continues below the fold.
 * Automatically disappears once the user begins scrolling, or after a brief timeout.
 */
export function PageScrollCue({ activeTab }: PageScrollCueProps) {
  const [visible, setVisible] = useState(false);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    userScrolledRef.current = false;
    setVisible(false);

    const checkScrollable = () => {
      if (userScrolledRef.current) return;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      const hasMore = docHeight - winHeight > 60 && currentScroll < 40;
      setVisible(hasMore);
    };

    // Allow content and images to render before measuring
    const timer = setTimeout(checkScrollable, 350);

    const handleScroll = () => {
      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      if (currentScroll > 40) {
        userScrolledRef.current = true;
        setVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', checkScrollable, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [activeTab]);

  // Auto-hide after 6 seconds so it never feels persistent
  useEffect(() => {
    if (!visible) return;
    const fadeTimer = setTimeout(() => {
      setVisible(false);
    }, 6000);
    return () => clearTimeout(fadeTimer);
  }, [visible]);

  if (!visible) return null;

  const handleScrollDown = () => {
    userScrolledRef.current = true;
    setVisible(false);
    const scrollAmount = Math.min(window.innerHeight * 0.7, 450);
    window.scrollBy({
      top: scrollAmount,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.85rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all duration-300 animate-fade-in md:bottom-6"
    >
      <button
        type="button"
        onClick={handleScrollDown}
        aria-label="Cuộn xem thêm nội dung bên dưới"
        className="flex items-center gap-1.5 rounded-full border-2 border-slate-900 bg-white/95 px-3.5 py-1.5 text-xs font-black text-slate-800 shadow-[2px_2px_0_0_#0f172a] backdrop-blur-xs transition-all hover:bg-slate-50 hover:shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C]/95 dark:text-slate-100 dark:shadow-[2px_2px_0_0_#cbd5e1] cursor-pointer group"
      >
        <ChevronDown className="h-3.5 w-3.5 animate-bounce stroke-[2.5]" aria-hidden="true" />
        <span className="tracking-tight">Cuộn để xem tiếp</span>
      </button>
    </div>
  );
}

interface ContainerScrollCueProps {
  /** Target scrollable container element */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Optional custom label */
  label?: string;
  /** Reset key to re-evaluate when step or contents change */
  resetKey?: string | number;
}

/**
 * Floating indicator for scrollable modal bodies, bottom sheets, or card containers.
 */
export function ContainerScrollCue({
  containerRef,
  label = 'Còn nội dung bên dưới',
  resetKey
}: ContainerScrollCueProps) {
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      setHasMore(remaining > 20);
    };

    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    el.addEventListener('scroll', measure, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [containerRef, resetKey]);

  if (!hasMore) return null;

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = Math.min(el.clientHeight * 0.7, 300);
    el.scrollBy({
      top: scrollAmount,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 z-20 transition-all duration-200 animate-fade-in">
      <button
        type="button"
        onClick={handleScroll}
        aria-label="Cuộn xem tiếp nội dung bên dưới"
        className="flex items-center gap-1.5 rounded-full border-2 border-slate-900 bg-white/95 px-3 py-1 text-[11.5px] font-black text-slate-800 shadow-[2px_2px_0_0_#0f172a] backdrop-blur-xs hover:bg-slate-50 active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-[#111A2C]/95 dark:text-white dark:shadow-none cursor-pointer group"
      >
        <ChevronDown className="h-3 w-3 animate-bounce stroke-[2.5]" aria-hidden="true" />
        <span className="tracking-tight">{label}</span>
      </button>
    </div>
  );
}
