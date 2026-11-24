import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useScenePopover, type PopData } from '@/shared/illustrations/ScenePopover';
import type { SocMood } from '@/shared/ui/soc/socSvg';
import { Soc } from '@/shared/ui/soc/Soc';
import { Balloon, Bush, Cloud, FlowerDots, House, Pine, Sun, Tree, Windmill } from '@/shared/illustrations/Scenery';
import { Bridge, Coin, FlowerArch, Podium, SocSprite, Stone } from '@/shared/illustrations/Landmarks';
import type { Pt } from '@/shared/illustrations/geometry';
import { DESK_H, DESK_W, deskFit, deskRoad, flagSpots, phoneFit, phoneRoad, roadDate, roadRoute, walkFrames, type FlagTest, type RoadLayout, type RoadRoute } from '../lib/roadLayout';
import { reduceMotion } from '../lib/useStairTween';
import type { RestMood } from '../lib/socMood';
import './road.css';

export interface RoadStep { value: number; reached: boolean; reachedDate?: string }

export interface RoadSceneProps {
  variant: 'desk' | 'phone';
  /** Eight milestones then the goal (milestones.ts). */
  steps: RoadStep[];
  /** Stop Sóc stands on; -1 before the first test. */
  cur: number;
  best: number;
  done: boolean;
  /** No test yet: every stop is a soft stone with an estimated value. */
  estimate: boolean;
  /** Welcome: the first stone glows once the goal is confirmed. */
  lit?: boolean;
  target: number;
  /** Text on the trophy plate instead of the target ("?" while no goal is chosen). */
  cupLabel?: string;
  /** Projected date (ISO) per step index for stops still ahead, the goal last; null when unknown. */
  proj: (string | null)[];
  tests: FlagTest[];
  /** Stop Sóc walks from on arrival (the best before the latest test). */
  walkFrom: number;
  gear?: readonly string[];
  rest?: RestMood | 'hi';
  onWake?: () => void;
  /** Opens the goal editor (from the trophy's popover). */
  onEditGoal?: (anchor: Element) => void;
  onOpenTest?: (id: string) => void;
  /** Phone: the band between the heading and the task panel (px). */
  top?: number;
  base?: number;
  /** Phone welcome moments: only the landscape shows. */
  hidden?: boolean;
}


const CONFETTI = ['#ffd766', '#ff7a9c', '#46b35a', '#1c8fe3', '#a78bfa'];

/** Chevrons along the road showing the way, skipping the stops. */
function chevrons(route: RoadRoute, stops: Pt[], r: number): string {
  let d = '';
  const step = r * 2.3;
  for (let len = step; len < route.L - r; len += step) {
    const [x, y] = route.atLen(len);
    if (stops.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < r * 1.6)) continue;
    const [dx, dy] = route.dirAt(len), k = r / 30;
    const p = (a: number, b: number) => `${(x + (a * dx - b * dy) * k).toFixed(1)} ${(y + (a * dy + b * dx) * k).toFixed(1)}`;
    d += `M${p(-5, -7)} L${p(3, 0)} L${p(-5, 7)} `;
  }
  return d;
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox(b => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** Hôm nay hero: the road of eight milestones to the trophy (mockup design/previews/journey-v2/1b-today-road.html). */
export function RoadScene(props: RoadSceneProps) {
  const { variant, steps, cur, best, done, estimate, lit, target, cupLabel, proj, tests, walkFrom, gear, rest, onWake, onEditGoal, onOpenTest, hidden } = props;
  const uid = useId().replace(/:/g, '');
  const phone = variant === 'phone';
  const [boxRef, box] = useBox<HTMLDivElement>();

  // Desktop: the scene is DESK_H tall and as wide as the window gives it; the road expands smoothly into the left stage.
  const W = phone ? Math.max(1, box.w) : Math.max(DESK_W, Math.round(box.h ? box.w * DESK_H / box.h : DESK_W));
  const H = phone ? Math.max(1, box.h) : DESK_H;
  const panelReserve = !phone && box.w <= 1140 ? 372 : 412;
  const availDeskW = Math.max(420, box.w - panelReserve);
  const availSceneW = !phone && box.h > 0 ? Math.round(availDeskW * DESK_H / box.h) : 760;
  const dFit = useMemo(() => deskFit(availSceneW), [availSceneW]);
  const fit = useMemo(() => phoneFit(W, props.top ?? 200, props.base ?? H - 260), [W, H, props.top, props.base]);
  const L: RoadLayout = useMemo(() => (phone ? phoneRoad(fit) : deskRoad(dFit)), [phone, fit, dFit]);
  const route = useMemo(() => roadRoute(L), [L]);
  const values = steps.map(s => s.value);
  const flags = useMemo(() => (estimate ? [] : flagSpots(route, values, tests, L.r)), [route, values.join(','), tests, L.r, estimate]); // eslint-disable-line react-hooks/exhaustive-deps
  const { r, f } = L;
  const stopCount = L.stops.length;
  const socAt = estimate ? -1 : done ? stopCount : Math.max(0, cur);

  // Sóc's spot: on its stop, before the first stop when there is no test, on the podium's lower step at the goal.
  const [gx, gy] = L.goal;
  const socSpot: Pt = socAt < 0 ? [L.stops[0][0] - r * 1.9, L.stops[0][1] + r * .2]
    : socAt >= stopCount ? [gx - 84 * L.podiumS, gy + 6 * L.podiumS] : [L.stops[socAt][0], L.stops[socAt][1] - r * .32];
  const mood: SocMood = rest ?? (estimate ? 'idle' : done ? 'cheerD' : 'proud');
  const sleeping = mood === 'zzz' && !!onWake;

  // Entering: Sóc walks along the road to its stop (~1 s); a reached goal ends with a short confetti.
  const walkRef = useRef<SVGGElement>(null);
  const [confetti, setConfetti] = useState(false);
  const walkKey = `${socAt}:${walkFrom}:${W}x${H}:${hidden ? 1 : 0}`;
  useEffect(() => {
    const el = walkRef.current;
    if (!el || hidden || socAt < 0 || !el.animate || reduceMotion()) return;
    const from = Math.max(0, Math.min(walkFrom, stopCount - 1));
    const toLen = socAt >= stopCount ? route.L : route.stopLen[socAt];
    const fromLen = route.stopLen[Math.min(from, socAt >= stopCount ? stopCount - 1 : socAt)];
    if (toLen - fromLen < 1) {
      if (socAt >= stopCount) { setConfetti(true); const t = window.setTimeout(() => setConfetti(false), 2200); return () => window.clearTimeout(t); }
      return;
    }
    const end = route.atLen(toLen);
    const shift: Pt = [end[0] - socSpot[0], end[1] - (socSpot[1] + r * .32 * (socAt >= stopCount ? 0 : 1))];
    const pts = walkFrames(route, fromLen, toLen, 10);
    const frames: Keyframe[] = pts.map(([x, y], i) => ({
      transform: `translate(${(x + shift[0]).toFixed(1)}px, ${(y + shift[1] - (i % 2 ? r * .18 : 0)).toFixed(1)}px)`, offset: i / pts.length
    }));
    frames.push({ transform: 'translate(0px, 0px)', offset: 1 });
    const anim = el.animate(frames, { duration: 1000, delay: 250, easing: 'ease-in-out', fill: 'backwards' });
    let t: number | undefined;
    if (socAt >= stopCount) anim.onfinish = () => { setConfetti(true); t = window.setTimeout(() => setConfetti(false), 2200); };
    return () => { anim.cancel(); window.clearTimeout(t); };
  }, [walkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Popover on a coin, stone, flag or the trophy.
  const popover = useScenePopover();
  const tap = (key: string, label: string, title: string, sub: string, action?: PopData['action']) => popover.tapProps({ key, title, sub, action }, label, 'rr-tap');

  const goalDate = proj[stopCount] ?? null;
  const cupText = cupLabel ?? String(target);
  const glow = `${uid}glow`;
  const ariaProgress = estimate ? `Đường tới cúp ${target}, chưa có đề nào` : done ? `Đã chạm cúp ${target}, điểm cao nhất ${best}`
    : `Bậc ${socAt + 1} trên ${stopCount}, ${best} điểm, mục tiêu ${target}`;
  const walkedTo = estimate ? 0 : done ? route.L : route.stopLen[socAt];

  // Desktop: when narrower than the base road, scale down cleanly so trophy + bridge never touch the right-hand panel.
  const roadRightPx = !phone && box.h > 0 ? 748 * (box.h / DESK_H) : 0;
  const deskScale = !phone && dFit.sx === 1 && roadRightPx > availDeskW ? Math.max(0.72, availDeskW / roadRightPx) : 1;
  const worldTransform = deskScale < 1 ? `translate(0 ${((1 - deskScale) * H).toFixed(1)}) scale(${deskScale.toFixed(4)})` : undefined;

  const stops: ReactNode[] = L.stops.map(([x, y], i) => {
    const step = steps[i];
    if (!step) return null;
    const label = `Bậc ${i + 1} · ${step.value}`;
    const ring = <rect className="il-ring" x={x - r * 1.3} y={y - r * 1.3} width={r * 2.6} height={r * 2.6} rx={r} />;
    if (estimate) {
      return <g key={i} {...tap(`m${i}`, `Bậc ${i + 1}: ${step.value} điểm, ước lượng`, label, 'Ước lượng · ghi đề đầu tiên để Sóc đặt lại')}>
        {ring}<Stone x={x} y={y} r={r} f={f} text={String(step.value)} next={lit && i === 0} glowId={glow} /></g>;
    }
    if (done || i < socAt) {
      const sub = step.reachedDate ? `Đạt ${roadDate(step.reachedDate)}` : 'Đã đạt';
      return <g key={i} className="rr-coin" style={{ '--d': `${.1 + i * .06}s` } as CSSProperties}>
        <g {...tap(`m${i}`, `Bậc ${i + 1}: ${step.value} điểm, ${sub.toLowerCase()}`, label, sub)}>{ring}<Coin x={x} y={y} r={r} text={String(step.value)} /></g></g>;
    }
    if (i === socAt) {
      const sub = `${step.reachedDate ? `Đạt ${roadDate(step.reachedDate)} · ` : ''}bạn đang ở đây`;
      return <g key={i} {...tap(`m${i}`, `Bậc ${i + 1}: ${best} điểm, bạn đang ở đây`, `Bậc ${i + 1} · ${best}`, sub)}>
        {ring}<Coin x={x} y={y} r={r * 1.1} text={String(best)} today glowId={glow} /></g>;
    }
    const date = proj[i];
    const sub = date ? `Dự báo ~${roadDate(date)}` : `Còn ${step.value - best} điểm`;
    return <g key={i} {...tap(`m${i}`, `Bậc ${i + 1}: ${step.value} điểm, ${sub.toLowerCase()}`, label, sub)}>
      {ring}<Stone x={x} y={y} r={r} f={f} text={String(step.value)} date={date ? `~${roadDate(date)}` : undefined} next={i === socAt + 1} glowId={glow} /></g>;
  });

  const archAt = L.arch;
  const tagW = f * 7.4;
  const cupSub = done ? `Bạn đã chạm ${target}!` : estimate ? 'Mục tiêu của bạn' : goalDate ? `Theo đà này chạm khoảng ${roadDate(goalDate)}` : `Còn ${Math.max(0, target - best)} điểm`;
  const scenery = phone ? <PhoneScenery fit={fit} W={W} uid={uid} /> : <DeskScenery W={W} mapX={dFit.mapX} bridgeX={dFit.bridgeX} availSceneW={availSceneW} />;

  return (
    <div className={'rr' + (phone ? ' rr--phone' : ' rr--desk') + (hidden ? ' is-hidden' : '')} ref={boxRef}>
      {box.w > 0 && <svg className="rr-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={phone ? 'none' : 'xMinYMax slice'} role="group" aria-label={ariaProgress}>
        <defs>
          <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe7cf" /><stop offset=".6" stopColor="#fff4e4" /><stop offset="1" stopColor="#eaf6ff" /></linearGradient>
          <radialGradient id={glow}><stop offset="0" stopColor="#b8f0c2" stopOpacity=".9" /><stop offset="1" stopColor="#b8f0c2" stopOpacity="0" /></radialGradient>
          <radialGradient id={`${uid}spot`}><stop offset="0" stopColor="#fff3b0" stopOpacity=".95" /><stop offset=".6" stopColor="#ffe58a" stopOpacity=".35" /><stop offset="1" stopColor="#ffe58a" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${uid}mead`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9e5bd" /><stop offset="1" stopColor="#8fd197" /></linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${uid}sky)`} />
        {scenery}
        {!hidden && <g className="rr-world" transform={worldTransform}>
          <path d={route.d} fill="none" stroke="#e2c287" strokeWidth={r * 1.5} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 4)" />
          <path d={route.d} fill="none" stroke="#f8e6bf" strokeWidth={r * 1.4} strokeLinecap="round" strokeLinejoin="round" />
          {walkedTo > 0 && <path className="rr-walked" d={route.pathTo(walkedTo)} fill="none" stroke="#ffd766" strokeWidth={r * .5} strokeLinecap="round" opacity=".9" />}
          <path d={chevrons(route, [...L.stops, L.goal], r)} fill="none" stroke="#fff" strokeWidth={3.2 * r / 30} strokeLinecap="round" strokeLinejoin="round" opacity=".95" />
          {phone
            ? <Bridge x={fit.map([362, 574])[0]} y={fit.map([362, 574])[1]} angle={-90} s={.32 * fit.ky} />
            : <Bridge x={dFit.bridgeX} y={733} angle={-84} s={.56} />}

          <ellipse cx={gx} cy={gy - 40 * L.podiumS} rx={120 * L.podiumS} ry={120 * L.podiumS} fill={`url(#${uid}spot)`} />
          <FlowerArch x={archAt[0]} y={archAt[1]} s={L.archS} font={L.archFont} />
          <g {...tap('goal', onEditGoal ? `Cúp mục tiêu ${target}, đổi mục tiêu` : `Cúp mục tiêu ${target}`, `Cúp ${target} · đích`, cupSub,
            onEditGoal ? { label: '✎ Đổi mục tiêu', run: onEditGoal } : undefined)}>
            <rect className="il-ring" x={gx - 70 * L.podiumS} y={gy - 190 * L.podiumS} width={140 * L.podiumS} height={200 * L.podiumS} rx="12" />
            <Podium id={`${uid}t`} x={gx} y={gy} s={L.podiumS} label={cupText} />
            {!estimate && !done && goalDate && <g transform={`translate(${gx} ${gy + 22 * L.podiumS + f * .3})`}>
              <rect x={-tagW / 2} y={-f * .2} width={tagW} height={f * 1.5} rx={f * .75} fill="#fff" stroke="#ffd766" strokeWidth="2" />
              <text x="0" y={f * .95} textAnchor="middle" fontWeight="900" fontSize={f * .85} fill="#b07a00">Dự kiến ~{roadDate(goalDate)}</text>
            </g>}
          </g>
          {stops}

          {flags.map((fl, i) => {
            const h = r * 1.3, fw = f * 2.6;
            return (
              <g key={fl.id} className="rr-flag" style={{ '--d': `${.35 + i * .08}s` } as CSSProperties}>
                <g {...tap(`t${fl.id}`, `Đề ${fl.name}, ${fl.score} điểm, ngày ${roadDate(fl.date)}`, `${fl.score} điểm · ${roadDate(fl.date)}`, fl.name,
                  onOpenTest ? { label: 'Xem đề này', run: () => onOpenTest(fl.id) } : undefined)}>
                  <rect className="il-ring" x={fl.x - 4} y={fl.y - h - 4} width={fw + 10} height={h + 8} rx="6" />
                  <line x1={fl.x} y1={fl.y} x2={fl.x} y2={fl.y - h} stroke="#5c675f" strokeWidth="2.2" strokeLinecap="round" />
                  <path className={fl.latest ? 'il-wave' : undefined} style={{ transformOrigin: `${fl.x}px ${fl.y - h}px` }}
                    d={`M${fl.x + 1} ${fl.y - h} h${fw} l${-f * .45} ${f * .62} l${f * .45} ${f * .62} h${-fw}Z`} fill="#ff7a9c" />
                  <text x={fl.x + fw * .44} y={fl.y - h + f * .9} textAnchor="middle" fontWeight="900" fontSize={f * .8} fill="#fff">{fl.score}</text>
                  <circle cx={fl.x} cy={fl.y} r="2.5" fill="#5c675f" />
                </g>
              </g>
            );
          })}

          <g transform={`translate(${socSpot[0].toFixed(1)} ${socSpot[1].toFixed(1)})`}>
            <g ref={walkRef}>
              {!sleeping && <g className="tp-soc rr-soc" pointerEvents="none">
                <g className="il-bob"><SocSprite x={0} y={0} w={L.socW} mood={mood} gear={gear} /></g>
              </g>}
            </g>
          </g>
          {confetti && <g className="rr-confetti" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
              <rect key={i} x={gx - 60 + (i * 37) % 120} y={gy - 200 * L.podiumS} width="6" height="9" rx="2" fill={CONFETTI[i % 5]}
                style={{ '--dx': `${((i * 53) % 60) - 30}px`, '--dl': `${(i % 6) * .08}s` } as CSSProperties} />
            ))}
          </g>}
        </g>}
      </svg>}

      {/* A dozing Sóc is an HTML button over the scene (a steady target while its zzz floats). */}
      {sleeping && !hidden && box.w > 0 && (() => {
        const k = phone ? 1 : (box.h / H) * deskScale;
        const yOff = phone ? 0 : (1 - deskScale) * box.h;
        const w = L.socW * k;
        return (
          <button type="button" className="tp-soc rr-soc rr-wake" style={{ left: socSpot[0] * k - w * .47, top: yOff + socSpot[1] * k - w * 260 / 240 * .95, width: w }}
            aria-label="Sóc đang ngủ gật trên bậc, chạm để đánh thức" onClick={onWake}>
            <Soc state="zzz" size={w} gear={gear} />
          </button>
        );
      })()}
      {popover.node}
    </div>
  );
}

/** Wooden sign in the sky under the headline: the projection ("Theo đà này: chạm 850 ~25/12 · dư 5 tuần"). */
export function RoadSign({ text, late, className }: { text: string; late?: boolean; className?: string }) {
  return (
    <p className={'rr-sign' + (late ? ' is-late' : '') + (className ? ' ' + className : '')}>
      <svg viewBox="-22 -18 44 36" width="26" height="22" aria-hidden="true">
        <path d="M-12 -14 H12 V-6 A12 12 0 0 1 -12 -6Z" fill="#ffc83d" /><path d="M-12 -12 C-20 -12 -20 -3 -11 -2 M12 -12 C20 -12 20 -3 11 -2" fill="none" stroke="#e09a12" strokeWidth="3" />
        <rect x="-3" y="5" width="6" height="6" fill="#e09a12" /><rect x="-9" y="11" width="18" height="5" rx="2" fill="#d99a00" />
      </svg>
      <span>{text}</span>
    </p>
  );
}

/** Desktop landscape behind the road (1b-today-road.html), stretched smoothly across W and aligned to the road stage. */
function DeskScenery({ W, mapX, bridgeX, availSceneW }: { W: number; mapX: (x: number) => number; bridgeX: number; availSceneW: number }) {
  const H = DESK_H;
  const R = (x: number) => W - (DESK_W - x);
  const balloonX = Math.min(availSceneW - 24, mapX(752));
  const river = `M${W + 10} 694 C${Math.max(bridgeX + 180, W - 260)} 704 ${bridgeX + 110} 734 ${bridgeX} 733 C${Math.max(360, bridgeX - 240)} 731 220 742 -10 730`;
  return (
    <g aria-hidden="true">
      <Sun x={Math.min(availSceneW - 90, mapX(610))} y={120} r={46} />
      <Cloud x={mapX(540)} y={295} s={.55} /><Cloud x={Math.min(availSceneW - 40, mapX(700))} y={248} s={.45} className="il-drift2" /><Cloud x={110} y={300} s={.5} />
      <Balloon x={balloonX} y={248} s={.66} />
      <path d={`M0 345 C${mapX(140)} 300 ${mapX(300)} 330 ${mapX(420)} 312 C${mapX(560)} 292 ${mapX(680)} 330 ${Math.max(mapX(820), W - 360)} 300 C${W - 220} 276 ${W - 110} 296 ${W} 286 V${H} H0Z`} fill="#cfe8cf" />
      <path d={`M0 400 C${mapX(180)} 360 ${mapX(330)} 400 ${mapX(520)} 380 C${mapX(700)} 362 ${Math.max(mapX(860), W - 320)} 396 ${W - 160} 372 C${W - 90} 362 ${W - 40} 368 ${W} 366 V${H} H0Z`} fill="#b5dfb9" />
      <path d={`M0 452 C${mapX(200)} 430 ${mapX(420)} 460 ${mapX(620)} 446 C${Math.max(mapX(820), W - 360)} 432 ${W - 180} 452 ${W} 440 V${H} H0Z`} fill="#a4dbab" />
      <g className="il-decor">
        <Pine x={30} y={380} s={.8} /><Pine x={62} y={392} s={.6} /><House x={mapX(95)} y={420} s={.75} roof="#ff9ab4" /><Windmill x={mapX(330)} y={400} s={.9} />
        <Pine x={Math.min(availSceneW - 18, mapX(755))} y={440} s={.7} /><Pine x={Math.min(availSceneW - 36, mapX(735))} y={395} s={.55} /><House x={mapX(265)} y={418} s={.6} roof="#1c8fe3" />
      </g>
      <path d={river} fill="none" stroke="#7cc6ef" strokeWidth="30" strokeLinecap="round" />
      <path d={river} fill="none" stroke="#a9dcf7" strokeWidth="18.6" strokeLinecap="round" />
      <path className="il-shimmer" d={river} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="6 26" opacity=".8" strokeLinecap="round" />
      <g className="il-decor">
        <House x={R(900)} y={830} roof="#ff7a9c" /><House x={R(990)} y={860} s={.9} roof="#ffc83d" /><House x={R(1090)} y={820} s={.85} roof="#a78bfa" /><Windmill x={R(1140)} y={780} s={.8} />
        <Tree x={R(840)} y={885} s={1.1} /><Tree x={R(1150)} y={895} /><Tree x={22} y={900} s={1.1} /><Tree x={mapX(560)} y={545} s={.7} color="#5cbf6b" /><Tree x={Math.min(availSceneW - 16, mapX(755))} y={610} s={.7} />
        <Bush x={40} y={690} s={.8} /><Bush x={mapX(380)} y={700} s={.8} /><Bush x={mapX(560)} y={700} s={.8} /><Bush x={R(860)} y={680} s={.8} /><Bush x={mapX(250)} y={545} s={.8} /><Bush x={mapX(420)} y={548} s={.7} /><Bush x={mapX(200)} y={880} s={.8} />
        <FlowerDots x={mapX(380)} y={880} n={12} spread={140} seed={3} /><FlowerDots x={mapX(620)} y={880} n={10} spread={120} seed={7} /><FlowerDots x={R(1000)} y={760} n={10} spread={120} seed={11} />
        <FlowerDots x={mapX(210)} y={705} n={10} spread={120} seed={5} /><FlowerDots x={mapX(470)} y={700} n={8} spread={80} seed={9} /><FlowerDots x={mapX(240)} y={560} n={8} spread={90} seed={13} />
        <FlowerDots x={Math.min(availSceneW - 30, mapX(740))} y={520} n={8} spread={70} seed={17} /><FlowerDots x={60} y={470} n={8} spread={60} seed={19} />
      </g>
    </g>
  );
}

/** Phone landscape: drawn on the 390-wide template and fitted to the band left between the heading and the panel. */
function PhoneScenery({ fit, W, uid }: { fit: ReturnType<typeof phoneFit>; W: number; uid: string }) {
  const PW = W / fit.sx, PH = 1400;
  const [sunX, sunY] = fit.map([330, 205]);
  return (
    <g aria-hidden="true">
      <Sun x={sunX} y={sunY} r={24} />
      <g transform={`translate(0 ${fit.oy}) scale(${fit.sx} ${fit.ky})`}>
        <Cloud x={80} y={220} s={.4} /><Cloud x={250} y={250} s={.35} className="il-drift2" />
        <path d={`M0 262 C80 240 160 258 240 246 C300 238 350 248 ${PW} 240 V${PH} H0Z`} fill="#cfe8cf" />
        <path d={`M0 290 C100 270 200 292 300 278 C340 272 370 276 ${PW} 274 V${PH} H0Z`} fill="#b5dfb9" />
        <path d={`M0 330 C120 312 260 336 ${PW} 318 V${PH} H0Z`} fill={`url(#${uid}mead)`} />
        <g className="il-decor">
          <House x={40} y={380} s={.5} roof="#ff7a9c" /><Pine x={14} y={320} s={.5} /><Pine x={240} y={360} s={.45} /><Bush x={150} y={398} s={.45} />
          <Tree x={372} y={650} s={.5} /><Bush x={250} y={470} s={.45} />
          <FlowerDots x={120} y={650} n={8} spread={80} seed={7} /><FlowerDots x={280} y={650} n={6} spread={60} seed={9} />
          <FlowerDots x={60} y={470} n={6} spread={50} seed={5} /><FlowerDots x={320} y={470} n={6} spread={50} seed={3} />
        </g>
        <path d={`M${PW + 10} 572 C300 566 200 580 100 574 C50 571 20 576 -10 578`} fill="none" stroke="#7cc6ef" strokeWidth="18" strokeLinecap="round" />
        <path d={`M${PW + 10} 572 C300 566 200 580 100 574 C50 571 20 576 -10 578`} fill="none" stroke="#a9dcf7" strokeWidth="11" strokeLinecap="round" />
      </g>
      <Balloon x={W - 34} y={128} s={.42} />
    </g>
  );
}
