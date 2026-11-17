import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SCENE_H, SCENE_W } from '../lib/stairsGeometry';

/**
 * Decoration for the Hôm nay scene (design/previews/mock-home-after.html): sun rays, clouds and a hot-air balloon
 * behind the stairs, grassy hills, trees and flowers in front. Both layers use the stairs' own box and viewBox
 * (780x900, overflow visible) so they share one scale and line up at every window size.
 */

const flower = (x: number, y: number, color: string) => (
  <g key={`${x}:${y}`} transform={`translate(${x} ${y})`}>
    <path d="M0 0 V16" stroke="#4fae5f" strokeWidth="2.5" />
    <g fill={color}><circle cx="-5" cy="-2" r="4.5" /><circle cx="5" cy="-2" r="4.5" /><circle cx="0" cy="-7" r="4.5" /><circle cx="0" cy="3" r="4.5" /></g>
    <circle r="3" fill="#ffe58f" />
  </g>
);

const tree = (x: number, y: number, scale = 1) => (
  <g key={`t${x}`} transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x="-6" y="-10" width="12" height="40" rx="5" fill="#a26c43" />
    <circle cx="0" cy="-30" r="30" fill="#6bc27a" /><circle cx="-18" cy="-18" r="20" fill="#5bb46b" /><circle cx="16" cy="-40" r="18" fill="#8fdb9c" />
  </g>
);

const RAYS = Array.from({ length: 18 }, (_, i) => {
  const a = i / 18 * Math.PI * 2, r = 2600;
  return `M0 0 L${Math.cos(a) * r} ${Math.sin(a) * r} L${Math.cos(a + 0.1) * r} ${Math.sin(a + 0.1) * r}Z`;
});

interface BackProps {
  /** Where the trophy stands (scene units): the sun rays and glow are centred on it. */
  cup: { x: number; y: number };
  /** Text on the banner the balloon pulls ("Mục tiêu 850"); none for no banner. */
  banner?: string;
  /** Scene width in units (same as the stairs layer). */
  viewW?: number;
}

/** Sky layer: rays, glow, drifting clouds and the floating balloon. Sits behind the stairs. */
export function SceneryBack({ cup, banner, viewW = SCENE_W }: BackProps) {
  const bannerW = banner ? Math.max(92, Math.round(banner.length * 7.8 + 18)) : 0;
  return (
    <svg className="td-layer td-sky" viewBox={`0 0 ${viewW} ${SCENE_H}`} preserveAspectRatio="xMinYMax meet" aria-hidden="true">
      <defs>
        <radialGradient id="tdHalo"><stop offset="0" stopColor="#fff7d1" /><stop offset=".5" stopColor="#ffe58f" stopOpacity=".55" /><stop offset="1" stopColor="#ffe58f" stopOpacity="0" /></radialGradient>
      </defs>
      <g transform={`translate(${cup.x} ${cup.y - 30})`}>
        <g className="td-rays">{RAYS.map((d, i) => <path key={i} d={d} fill="#fff" opacity=".45" />)}</g>
        <circle className="td-glow" r="230" fill="url(#tdHalo)" />
      </g>
      <g className="td-cloud"><g fill="#fff" opacity=".9"><ellipse cx="330" cy="430" rx="54" ry="15" /><ellipse cx="352" cy="420" rx="30" ry="16" /></g></g>
      <g className="td-cloud td-c2"><g fill="#fff" opacity=".85"><ellipse cx={Math.max(900, viewW - 40)} cy="760" rx="70" ry="20" /><ellipse cx={Math.max(934, viewW - 6)} cy="746" rx="40" ry="22" /></g></g>
      <g className="td-cloud td-c3"><g fill="#fff" opacity=".7"><ellipse cx="170" cy="250" rx="48" ry="13" /><ellipse cx="190" cy="242" rx="26" ry="14" /></g></g>
      <g transform={`translate(${Math.max(715, cup.x + 40)} 640)`}>
        <g className="td-balloon">
          <path d="M0 -70 C40 -70 52 -30 34 0 L14 26 H-14 L-34 0 C-52 -30 -40 -70 0 -70Z" fill="#ff7a9c" />
          <path d="M0 -70 C18 -70 22 -30 14 0 L6 26 H-6 L-14 0 C-22 -30 -18 -70 0 -70Z" fill="#ffc83d" />
          <path d="M-12 26 L-10 40 H10 L12 26" fill="none" stroke="#a26c43" strokeWidth="2" />
          <rect x="-11" y="40" width="22" height="16" rx="4" fill="#a26c43" />
          {banner && <g className="td-banner" key={banner}>
            <path d="M11 50 L60 66" stroke="#7a857e" strokeWidth="1.5" />
            <path d={`M60 54 H${60 + bannerW} L${52 + bannerW} 66 L${60 + bannerW} 78 H60Z`} fill="#fff" stroke="#e8b62c" strokeWidth="2" />
            <text x={60 + bannerW / 2 - 2} y="71" fontWeight="900" fontSize="13" fill="#a87a00" textAnchor="middle">{banner}</text>
          </g>}
        </g>
      </g>
    </svg>
  );
}

/** Ground layer: two hills with trees and flowers, drawn over the stairs' feet. Right-hand trees follow the window's right edge. */
export function SceneryFront({ children }: { children?: ReactNode }) {
  const ref = useRef<SVGSVGElement>(null);
  const [edge, setEdge] = useState(1172);
  useEffect(() => {
    const svg = ref.current, scene = svg?.parentElement;
    if (!svg || !scene) return;
    const measure = () => {
      const scale = svg.getScreenCTM()?.a;
      if (scale && scale > 0) setEdge(Math.max(SCENE_W, Math.round(scene.clientWidth / scale)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  const ground = useMemo(() => {
    const e = edge;
    const trees = [tree(-30, 840, 0.9), tree(690, 808, 0.9)];
    if (e > 900) trees.push(tree(e - 182, 800, 0.75), tree(e - 62, 780));
    const flowers = [[44, 862, '#ff9eb8'], [110, 870, '#fff'], [262, 860, '#ffd766'], [420, 868, '#ff9eb8'], [520, 862, '#a78bfa'], [770, 850, '#fff'], [e - 312, 855, '#ffd766'], [e - 122, 850, '#ff9eb8']] as const;
    return { e, trees, flowers };
  }, [edge]);

  const e = ground.e;
  return (
    <svg ref={ref} className="td-layer td-ground" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMinYMax meet" aria-hidden="true">
      <path d={`M-300 850 Q160 790 330 830 T700 815 T${e} 790 L${e + 400} 790 V900 H-300Z`} fill="#a8dcb1" />
      <path d={`M-300 880 Q260 845 560 872 T${e} 860 L${e + 400} 860 V900 H-300Z`} fill="#86cc93" />
      {ground.trees}
      {ground.flowers.filter(([x]) => x > 20).map(([x, y, c]) => flower(x, y, c))}
      {children}
    </svg>
  );
}
