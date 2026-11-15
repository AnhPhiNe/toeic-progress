import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Sketch size in px; everything inside is authored in these coordinates and scaled to the available width. */
  width: number;
  height: number;
  className?: string;
  children: ReactNode;
  onMouseLeave?: () => void;
}

/** A fixed-size sketch scene (SVG + HTML overlays) that scales with the page width, keeping its aspect ratio. */
export function SceneStage({ width, height, className, children, onMouseLeave }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setK(el.clientWidth / width || 1);
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className={'jr-stage' + (className ? ' ' + className : '')} style={{ aspectRatio: `${width} / ${height}` }} onMouseLeave={onMouseLeave}>
      <div className="jr-stage-in" style={{ width, height, transform: `scale(${k})` }}>{children}</div>
    </div>
  );
}
