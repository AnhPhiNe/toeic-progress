import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';

interface PageScrollCueProps {
  /** Re-checks scrollability when the active tab or view changes */
  activeTab?: string;
}

/**
 * Floating indicator displayed at the bottom of long pages when content continues below the fold.
 * Automatically disappears once the user begins scrolling, or after a brief timeout.
 */
export function PageScrollCue({ activeTab }: PageScrollCueProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);

    const checkScrollable = () => {
      const docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const winHeight = window.innerHeight;
      const currentScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const hasMore = docHeight - winHeight > 60;

      // Only show when near top (< 35px) and there's meaningful content below
      if (hasMore && currentScroll < 35) {
        setVisible(true);
      } else if (currentScroll >= 35) {
        setVisible(false);
      }
    };

    // Allow content and images to render before measuring
    const timer = setTimeout(checkScrollable, 300);

    const handleScroll = () => {
      const currentScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (currentScroll >= 35) {
        setVisible(false);
      } else {
        // User scrolled back to top — re-check and display cue if scrollable
        checkScrollable();
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

  // Auto-hide after 5 seconds of being visible at the top,
  // but if the user scrolls down and comes back to top, it reappears cleanly
  useEffect(() => {
    if (!visible) return;
    const fadeTimer = setTimeout(() => {
      setVisible(false);
    }, 5000);
    return () => clearTimeout(fadeTimer);
  }, [visible]);

  // Phones only: a computer screen already shows that the page continues, and the cue covered content there.
  if (!visible || !isPhone) return null;

  const handleScrollDown = () => {
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
        className="flex items-center gap-1.5 rounded-full rd bg-white px-3.5 py-1.5 text-xs font-black text-[#2f3a33] shadow-[0_3px_0_#e6e9e6,0_8px_18px_-8px_rgba(47,58,51,.35)] transition-all hover:brightness-105 active:translate-y-0.5 active:shadow-[0_1px_0_#e6e9e6] cursor-pointer group"
      >
        <ChevronDown className="h-3.5 w-3.5 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none stroke-[2.5]" aria-hidden="true" />
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
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      // Only the bottom padding left to scroll: the last row is already visible, so the cue would just cover it.
      setHasMore(remaining > (parseFloat(getComputedStyle(el).paddingBottom) || 0) + 20);
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

  if (!hasMore || !isPhone) return null;

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
    <div className="flex flex-none justify-center py-1.5">
      <button
        type="button"
        onClick={handleScroll}
        aria-label="Cuộn xem tiếp nội dung bên dưới"
        className="flex items-center gap-1.5 rounded-full rd bg-white px-3 py-1 text-[11.5px] font-black text-[#2f3a33] shadow-[0_3px_0_#e6e9e6,0_6px_14px_-8px_rgba(47,58,51,.3)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_1px_0_#e6e9e6] cursor-pointer group"
      >
        <ChevronDown className="h-3 w-3 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none stroke-[2.5]" aria-hidden="true" />
        <span className="tracking-tight">{label}</span>
      </button>
    </div>
  );
}
