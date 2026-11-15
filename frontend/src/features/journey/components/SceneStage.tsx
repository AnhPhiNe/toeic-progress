import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Scene height in px; everything inside is authored in these units and scaled to fit the window height. */
  height: number;
  /** Narrowest scene width the layout is drawn for; on a narrower window the scene is scaled down instead of squeezed. */
  minWidth: number;
  className?: string;
  /** Gets the scene's width in scene units (container width / scale), so content can spread across the real width. */
  children: (width: number) => ReactNode;
}

/** Space kept under the scene so the page ends just inside the window. */
const BOTTOM_GAP = 24;
/** Below this scale the scene would get too small to read; the page scrolls instead. */
const MIN_SCALE = 0.62;

/**
 * A scene (SVG + HTML overlays) that fills the content area: scaled so its height fits the window height without the
 * page scrolling, and as wide as the area is. The scene's own width in scene units is container width / scale, which
 * children use to lay out their content (stakes, islands) over the whole width. A window too narrow for `minWidth`
 * scales the scene down further, leaving a little more space under it.
 */
export function SceneStage({ height, minWidth, className, children }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 1, width: minWidth });
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (!cw) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const availH = window.innerHeight - top - BOTTOM_GAP;
      const k = Math.max(MIN_SCALE, Math.min(availH / height, cw / minWidth));
      setFit(prev => (Math.abs(prev.k - k) < 1e-4 && Math.abs(prev.width - cw / k) < 1e-3 ? prev : { k, width: cw / k }));
    };
    measure();
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [height, minWidth]);
  return (
    <div ref={outer} className={'jr-stage' + (className ? ' ' + className : '')} style={{ height: height * fit.k }}>
      <div className="jr-stage-in" style={{ width: fit.width, height, transform: `scale(${fit.k})` }}>{children(fit.width)}</div>
    </div>
  );
}
