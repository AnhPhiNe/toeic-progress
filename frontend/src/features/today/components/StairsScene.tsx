import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { MilestonePlan } from '@/shared/domain/milestones';
import { socMoodSvg, type SocMood } from '@/shared/ui/soc/socSvg';
import { useSocCoat } from '@/shared/ui/soc/Soc';
import { stairsMood, type RestMood } from '../lib/socMood';
import '@/shared/ui/soc/soc.css';
import { estimateMilestones } from '@/shared/domain/milestones';
import { SCENE_H, SCENE_W, stairsGeometry } from '../lib/stairsGeometry';
import { RESPACE_MS, reduceMotion, useStairTween } from '../lib/useStairTween';
import { SceneryBack, SceneryFront } from './TodayScenery';

type Plan = Exclude<MilestonePlan, { status: 'empty' }>;

interface Props {
  plan: Plan | null;
  target: number;
  /** "khoảng N đề nữa nếu giữ đà"; null when the trend gives no honest estimate. */
  testsAhead: number | null;
  /** Text on the trophy's base instead of the target (e.g. "?" while no goal is chosen). */
  cupLabel?: string;
  /** Text on the balloon's banner; none for no banner. */
  banner?: string;
  /** Accessories Sóc wears (Thành tích → Tủ đồ). */
  gear?: readonly string[];
  /** Buồn nhẹ / Ngủ gật instead of the resting bounce ('hi' while a tapped Sóc is awake). */
  rest?: RestMood | 'hi';
  /** Tapping the dozing Sóc wakes it up. */
  onWake?: () => void;
  /** Welcome: no test yet, the first bar is lit green once the goal is confirmed. */
  lit?: boolean;
  /** Clicking the trophy (with its ✎ dot) opens the goal editor beside it; hovering shows "✎ Đổi mục tiêu". */
  onEditGoal?: (cup: SVGGElement) => void;
}

const ddmm = (date?: string) => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : '');
const SEEN_KEY = 'rd_stairs_seen_v1';
/** True once per climb when the current step is higher than on the last visit. */
function takeNewStep(target: number, index: number): boolean {
  try {
    const [t, i] = (localStorage.getItem(SEEN_KEY) ?? '').split(':').map(Number);
    localStorage.setItem(SEEN_KEY, `${target}:${index}`);
    return t === target && Number.isFinite(i) && index > i;
  } catch { return false; }
}
/** Sparkles thrown when the goal changes: [dx, dy, delay s]. */
const BURST: [number, number, number][] = [[-96, -70, 0], [90, -88, .05], [-70, 20, .1], [104, -10, .15], [-30, -118, .2], [40, -130, .08], [0, -100, .25]];
/** Room kept for the right-hand panel (matches .td-layer max-width). */
const PANEL_ROOM = 400;

/** Estimated stairs for a learner with no test yet: dashed blocks from a typical first score up to the trophy. */
function estimatePlan(target: number): Plan {
  const { step, values } = estimateMilestones(target);
  return { status: 'climbing', target, step, best: 0, currentIndex: 0, steps: values.map(value => ({ value, reached: false })) };
}

export function StairsScene({ plan, target, testsAhead, cupLabel, banner, gear, rest, onWake, lit, onEditGoal }: Props) {
  const empty = !plan;
  const p = useMemo(() => plan ?? estimatePlan(target), [plan, target]);
  const blocks = p.steps.length - 1;
  const sceneRef = useRef<HTMLDivElement>(null);
  // Scene width in units: the layers scale with the scene's height, so a wide window gives more room up to the panel.
  const [viewW, setViewW] = useState(SCENE_W);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const measure = () => {
      const h = scene.clientHeight, w = scene.clientWidth - PANEL_ROOM;
      if (h > 0 && w > 0) setViewW(Math.round(Math.max(SCENE_W, Math.min(1500, w * SCENE_H / h))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);
  const g = useMemo(() => stairsGeometry(blocks, viewW), [blocks, viewW]);
  const { tw, th } = g;
  const done = p.status === 'done';
  // Goal reached: every stair is gold and Sóc stands on the last one, beside the trophy.
  const cur = empty ? -1 : done ? blocks - 1 : p.currentIndex;
  // When the goal changes the eight stairs stay put and their numbers glide to the new spacing.
  const shownValues = useStairTween(p.steps.slice(0, blocks).map(s => s.value));
  const nextIdx = !empty && !done && p.next && p.next.index < blocks ? p.next.index : -1;

  const [tip, setTip] = useState<{ html: ReactNode; x: number; y: number; left?: boolean } | null>(null);
  const move = (event: MouseEvent, html: ReactNode, left = false) => {
    const r = sceneRef.current?.getBoundingClientRect();
    if (r) setTip({ html, x: event.clientX - r.left, y: event.clientY - r.top, left });
  };

  const [wiggle, setWiggle] = useState(0);
  // "✎ Đổi mục tiêu" sits above the trophy while it is hovered or focused.
  const [cupHover, setCupHover] = useState<{ x: number; y: number } | null>(null);
  const showCupTag = (el: Element) => {
    const s = sceneRef.current?.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (s) setCupHover({ x: r.left + r.width / 2 - s.left, y: r.top - s.top + 4 });
  };
  // Choosing a new goal makes the trophy bounce and throws a few sparkles.
  const [burst, setBurst] = useState(0);
  const lastTarget = useRef(target);
  useEffect(() => {
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    setBurst(b => b + 1);
  }, [target]);
  // The trophy base text flips when it changes ("?" to the chosen goal).
  const cupText = String(cupLabel ?? p.target);
  const lastText = useRef(cupText);
  const [flip, setFlip] = useState<{ n: number; from: string } | null>(null);
  useEffect(() => {
    if (lastText.current === cupText) return;
    const from = lastText.current;
    lastText.current = cupText;
    setFlip(f => ({ n: (f?.n ?? 0) + 1, from }));
  }, [cupText]);
  const [socState, setSocState] = useState<SocMood>('idle');
  const socRef = useRef<SVGGElement>(null);
  const socAt = Math.max(0, cur);
  // Where Sóc stood for the previous goal: a goal change makes her ride her stair to its new place instead of re-climbing.
  const lastSoc = useRef<{ target: number; at: number } | null>(null);
  useEffect(() => {
    const el = socRef.current;
    if (!el) return;
    // Before any test, Sóc waits on the ground at the foot of the stairs.
    const end = empty ? { x: Math.max(30, g.bx(0) - g.tw - 82), y: g.by(0) + 22 } : g.soc(socAt);
    const place = (x: number, y: number) => el.setAttribute('transform', `translate(${x} ${y})`);
    // Rest pose: star eyes on the goal (D), bounce on a step (C); a new step first gets a stronger bounce with confetti.
    const rest: SocMood = empty ? 'idle' : done ? 'cheerD' : 'cheerC';
    const newStep = !empty && !done && takeNewStep(target, socAt);
    let calm: number | undefined;
    const arrive = () => {
      if (newStep) { setSocState('cheerCplus'); calm = window.setTimeout(() => setSocState(rest), 4400); }
      else setSocState(rest);
    };
    const before = lastSoc.current;
    lastSoc.current = empty ? null : { target, at: socAt };
    if (!empty && before && before.target !== target && el.animate && !reduceMotion()) {
      const a = g.soc(before.at);
      const ride = el.animate([{ transform: `translate(${a.x}px, ${a.y}px)` }, { transform: `translate(${end.x}px, ${end.y}px)` }],
        { duration: before.at === socAt ? 1 : RESPACE_MS, easing: 'cubic-bezier(.33, 1, .68, 1)', fill: 'forwards' });
      ride.onfinish = () => { place(end.x, end.y); ride.cancel(); setSocState(rest); };
      return () => { ride.cancel(); window.clearTimeout(calm); };
    }
    if (empty || socAt === 0 || reduceMotion() || !el.animate) { place(end.x, end.y); arrive(); return () => window.clearTimeout(calm); }
    const frames: Keyframe[] = [];
    for (let i = 0; i <= socAt; i++) {
      const a = g.soc(i);
      frames.push({ transform: `translate(${a.x}px, ${a.y}px)`, offset: i / socAt });
      if (i < socAt) {
        const b = g.soc(i + 1);
        frames.push({ transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - 46}px)`, offset: (i + 0.5) / socAt });
      }
    }
    const start = g.soc(0);
    place(start.x, start.y);
    const anim = el.animate(frames, { duration: 400 * socAt, delay: 1000, easing: 'linear', fill: 'forwards' });
    anim.onfinish = () => {
      place(end.x, end.y);
      anim.cancel();
      arrive();
    };
    return () => { anim.cancel(); window.clearTimeout(calm); };
  }, [g, socAt, empty, done, target]);

  // Inline size beats .soc svg { width: 100% }, which would fill the whole scene.
  const coat = useSocCoat();
  const shownMood = stairsMood(socState, rest ?? null);
  const socHtml = useMemo(() => socMoodSvg(shownMood, gear, coat).replace('<svg viewBox="0 0 240 260"', '<svg viewBox="0 0 240 260" width="78" height="85" style="width:78px;height:85px"'), [shownMood, gear, coat]);

  const sleeping = shownMood === 'zzz' && !!onWake;
  // One element in both cases: the climb effect positions it through socRef.
  const socNode = <g ref={socRef} className={'soc td-socg' + (sleeping ? ' is-wake' : '')} pointerEvents={sleeping ? 'auto' : 'none'}
    role={sleeping ? 'button' : undefined} tabIndex={sleeping ? 0 : undefined} aria-label={sleeping ? 'Sóc đang ngủ gật trên bậc, chạm để đánh thức' : undefined}
    onClick={sleeping ? onWake : undefined} onKeyDown={sleeping ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onWake?.(); } } : undefined}
    dangerouslySetInnerHTML={{ __html: socHtml }} />;

  const cupLeft = p.target - (p.best || 0);
  const cupTip = done
    ? <>Cúp <b>{p.target}</b> · bạn đã chạm!</>
    : empty
      ? <>Cúp <b>{p.target}</b> · mục tiêu của bạn</>
      : <>Cúp <b>{p.target}</b> · còn {cupLeft} điểm{testsAhead ? <><br />khoảng {testsAhead} đề nữa nếu giữ đà</> : null}</>;

  return (
    <div className="td-scene" ref={sceneRef}>
      <SceneryBack cup={g.cup} banner={banner} viewW={viewW} />

      <svg className="td-layer td-stairs" viewBox={`0 0 ${viewW} ${SCENE_H}`} preserveAspectRatio="xMinYMax meet" role="img"
        aria-label={empty ? `Cầu thang tới mục tiêu ${p.target}` : `Bậc ${socAt + 1} trên ${blocks}, điểm cao nhất ${p.best}, mục tiêu ${p.target}`}>
        <defs>
          <linearGradient id="tdgT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe58f" /><stop offset="1" stopColor="#ffc83d" /></linearGradient>
          <linearGradient id="tdgL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f5b52a" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
          <linearGradient id="tdgR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d99a00" /><stop offset="1" stopColor="#bb8300" /></linearGradient>
          <linearGradient id="tdcT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7fd890" /><stop offset="1" stopColor="#46b35a" /></linearGradient>
          <linearGradient id="tdcL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a9a4d" /><stop offset="1" stopColor="#2f8a42" /></linearGradient>
          <linearGradient id="tdcR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f8a42" /><stop offset="1" stopColor="#25713a" /></linearGradient>
          <linearGradient id="tdfT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#f1effa" /></linearGradient>
          <linearGradient id="tdfL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ecebf6" /><stop offset="1" stopColor="#dcdbec" /></linearGradient>
          <linearGradient id="tdfR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7d6e8" /><stop offset="1" stopColor="#c6c4dc" /></linearGradient>
          <linearGradient id="tdCup" x1="0" x2="1"><stop offset="0" stopColor="#ffe9a3" /><stop offset=".45" stopColor="#ffc83d" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
          <clipPath id="tdCupClip"><path d="M-64 -76 H64 C64 -12 32 30 0 32 C-32 30 -64 -12 -64 -76Z" /></clipPath>
        </defs>

        {p.steps.slice(0, blocks).map((step, i) => {
          const x = g.bx(i), y = g.by(i), h = g.bh(i);
          const ok = !empty && (i < cur || done), isCur = i === cur && !done;
          const k = isCur || (empty && lit && i === 0) ? 'c' : ok ? 'g' : 'f';
          const edge = k === 'c' ? '#1f6a33' : k === 'g' ? '#b07a00' : '#b6b3cf';
          const hi = k === 'f' ? '#fff' : k === 'c' ? '#b8f0c2' : '#fff4c4';
          const bands: ReactNode[] = [];
          for (let b = 1; b * 46 < h - 10; b++) {
            const yy = y + b * 46;
            bands.push(<path key={'l' + b} d={`M${x - tw + 4} ${yy} L${x} ${yy + th}`} stroke={edge} strokeWidth="2" opacity=".18" />,
              <path key={'r' + b} d={`M${x} ${yy + th} L${x + tw - 4} ${yy}`} stroke={edge} strokeWidth="2" opacity=".14" />);
          }
          const tipHtml = empty ? null : isCur
            ? <>Điểm cao nhất <b>{p.best}</b> · bậc {i + 1}/{blocks}</>
            : step.reached
            ? (i === 0 ? <>Xuất phát <b>{step.value}</b><br />{ddmm(step.reachedDate)}</> : <>Bậc <b>{step.value}</b> · đạt {ddmm(step.reachedDate)}</>)
            : <>Bậc <b>{step.value}</b> · còn {step.value - p.best} điểm</>;
          return (
            <g key={i} className="td-blk" style={{ animationDelay: `${0.09 * i}s` }}
              onMouseMove={tipHtml ? e => move(e, tipHtml) : undefined} onMouseLeave={() => setTip(null)}>
              <path d={`M${x - tw} ${y} L${x} ${y + th} L${x} ${y + th + h} L${x - tw} ${y + h}Z`} fill={`url(#td${k}L)`} />
              <path d={`M${x} ${y + th} L${x + tw} ${y} L${x + tw} ${y + h} L${x} ${y + th + h}Z`} fill={`url(#td${k}R)`} />
              {bands}
              <path d={`M${x} ${y + th} L${x} ${y + th + h}`} stroke={edge} strokeWidth="2" opacity=".35" />
              <path className="td-top" d={`M${x - tw} ${y} L${x} ${y - th} L${x + tw} ${y} L${x} ${y + th}Z`} fill={`url(#td${k}T)`} />
              {k !== 'f' && <path d={`M${x - tw + 12} ${y} L${x} ${y - th + 6} L${x + tw - 12} ${y} L${x} ${y + th - 6}Z`} fill="none" stroke={hi} strokeWidth="2" opacity=".7" />}
              <path d={`M${x - tw} ${y} L${x} ${y + th} L${x + tw} ${y}`} fill="none" stroke={hi} strokeWidth="3" opacity=".8" strokeLinejoin="round" />
              {k === 'f' && i !== nextIdx && <path d={`M${x - tw} ${y} L${x} ${y - th} L${x + tw} ${y} L${x} ${y + th}Z`} fill="none" stroke="#c9c3e6" strokeWidth="2" strokeDasharray="5 5" />}
              <g transform={`translate(${x - tw / 2} ${y + th / 2 + 72})`}>
                <rect x="-26" y="-17" width="52" height="24" rx="12" fill={k === 'f' ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.14)'} />
                <text x="0" y="1" fontWeight="900" fontSize="16.5" fill={k === 'f' ? '#8f8bb0' : '#fff'} textAnchor="middle">{isCur ? p.best : shownValues[i] ?? step.value}</text>
              </g>
              {k === 'f' && !empty && <g transform={`translate(${x - tw / 2} ${y + th / 2 + 102})`} opacity=".7">
                <rect x="-7" y="-2" width="14" height="11" rx="3" fill="#a9a5c8" />
                <path d="M-4 -2 V-6 A4 4 0 0 1 4 -6 V-2" fill="none" stroke="#a9a5c8" strokeWidth="2.5" />
              </g>}
              {ok && <g transform={`translate(${x + tw - 12} ${y - 8})`}>
                <line x1="0" y1="0" x2="0" y2="-26" stroke="#5c675f" strokeWidth="2.5" strokeLinecap="round" />
                <path className="td-pf" d="M1 -26 L16 -21 L1 -16Z" fill="#ff7a9c" />
              </g>}
            </g>
          );
        })}

        {p.steps.slice(0, blocks).map((_, i) => !empty && (i < cur || done) ? (
          <g key={'c' + i} transform={`translate(${g.bx(i)} ${g.by(i) - 2})`}>
            <g className="td-coin" style={{ animationDelay: `${0.6 + 0.08 * i}s` }}><g className="td-spin">
              <ellipse cx="0" cy="0" rx="9" ry="9" fill="#ffd766" stroke="#d99a00" strokeWidth="2.5" />
              <path d="M-3 -1 Q0 -6 3 -1 Q0 1 -3 -1Z" fill="#8e5a35" /><ellipse cx="0" cy="2.5" rx="3" ry="3.3" fill="#c48a5c" />
            </g></g>
          </g>) : null)}

        {nextIdx >= 0 && p.next && (() => {
          const nx = g.bx(nextIdx), ny = g.by(nextIdx);
          return <g pointerEvents="none">
            <path d={`M${nx - tw} ${ny} L${nx} ${ny - th} L${nx + tw} ${ny} L${nx} ${ny + th}Z`} fill="#e9f8ec" />
            <path className="td-next" d={`M${nx - tw} ${ny} L${nx} ${ny - th} L${nx + tw} ${ny} L${nx} ${ny + th}Z`} fill="none" stroke="#46b35a" strokeWidth="3.5" strokeDasharray="7 6" strokeLinejoin="round" />
          </g>;
        })()}

        <g transform={`translate(${g.cup.x} ${g.cup.y})`}>
          <g className={'td-cupbox' + (wiggle % 2 ? ' is-wig' : '') + (wiggle && wiggle % 2 === 0 ? ' is-wig2' : '')}
            role="button" tabIndex={0} aria-label={onEditGoal ? `Cúp mục tiêu ${p.target}, đổi mục tiêu` : `Cúp mục tiêu ${p.target}`}
            onClick={e => { setWiggle(w => w + 1); setCupHover(null); onEditGoal?.(e.currentTarget); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWiggle(w => w + 1); onEditGoal?.(e.currentTarget); } }}
            onMouseEnter={onEditGoal ? e => showCupTag(e.currentTarget) : undefined}
            onFocus={onEditGoal ? e => { if (e.currentTarget.matches(':focus-visible')) showCupTag(e.currentTarget); } : undefined}
            onBlur={() => setCupHover(null)}
            onMouseMove={onEditGoal ? undefined : e => move(e, cupTip, true)} onMouseLeave={() => { setTip(null); setCupHover(null); }}>
            {/* Whole trophy (cup, base, ✎ dot) is one hit area, also while sparkles fly. */}
            <rect x="-104" y="-92" width="208" height="206" fill="transparent" />
            <ellipse cx="0" cy="104" rx="84" ry="16" fill="#b0784a" opacity=".18" />
            <path d="M-58 68 L58 68 L66 100 L-66 100Z" fill="#3a463e" /><rect x="-62" y="62" width="124" height="10" rx="5" fill="#2f3a33" />
            {flip && <text key={`o${flip.n}`} className="td-lab is-out" x="0" y="93" fontWeight="900" fontSize="20" fill="#ffe58f" textAnchor="middle">{flip.from}</text>}
            <text key={`i${flip?.n ?? 0}`} className={'td-lab' + (flip ? ' is-in' : '')} x="0" y="93" fontWeight="900" fontSize="20" fill="#ffe58f" textAnchor="middle">{cupText}</text>
            <g key={`pop${burst}`} className={burst ? 'td-cuppop' : undefined}><g className="td-cupwrap"><g className="td-cup">
              <rect x="-26" y="48" width="52" height="16" rx="5" fill="#e09a12" /><rect x="-12" y="28" width="24" height="24" fill="url(#tdCup)" />
              <path d="M-64 -64 C-104 -64 -100 -10 -58 -16" fill="none" stroke="#e8a516" strokeWidth="11" strokeLinecap="round" />
              <path d="M64 -64 C104 -64 100 -10 58 -16" fill="none" stroke="#d99a00" strokeWidth="11" strokeLinecap="round" />
              <path d="M-64 -76 H64 C64 -12 32 30 0 32 C-32 30 -64 -12 -64 -76Z" fill="url(#tdCup)" />
              <ellipse cx="0" cy="-76" rx="64" ry="9" fill="#ffe9a3" /><ellipse cx="0" cy="-76" rx="54" ry="6" fill="#e8a516" />
              <g clipPath="url(#tdCupClip)"><rect className="td-shine" x="-30" y="-90" width="26" height="140" fill="#fff" opacity=".55" transform="skewX(-18)" /></g>
              <g transform="translate(14 0)"><path d="M-14 -46 l5 10 11 1.6 -8 7.8 1.9 11 -9.9 -5.2 -9.9 5.2 1.9 -11 -8 -7.8 11 -1.6Z" fill="#fff" opacity=".9" /></g>
            </g></g></g>
            {burst > 0 && <g key={`burst${burst}`} className="td-burst" pointerEvents="none">
              {BURST.map(([dx, dy, delay], i) => (
                <path key={i} className="td-bst" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${delay}s` } as CSSProperties}
                  d="M0 -9 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3Z" fill={i % 2 ? '#fff' : '#ffe58f'} />
              ))}
            </g>}
            {onEditGoal && <g transform="translate(74 86)" aria-hidden="true">
              <circle r="17" fill="#fff" stroke="#ffd36b" strokeWidth="3" />
              <g transform="translate(-9 -9) scale(.75)" fill="none" stroke="#a06a00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
              </g>
            </g>}
            <path className="td-tw" d="M-92 -96 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3Z" fill="#fff" />
            <path className="td-tw" style={{ animationDelay: '.6s' }} d="M92 -118 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3Z" fill="#fff" />
            <path className="td-tw" style={{ animationDelay: '1.1s' }} d="M70 -20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#fff" />
          </g>
        </g>

        {!empty && socNode}
      </svg>

      <SceneryFront>{empty && socNode}</SceneryFront>

      {cupHover && <div className="td-cuptag" style={{ left: cupHover.x, top: cupHover.y }} role="tooltip">
        ✎ Đổi mục tiêu{!done && !empty && testsAhead ? <small>còn {cupLeft} điểm · khoảng {testsAhead} đề nữa</small> : null}
      </div>}
      {tip && <div className={'td-tip' + (tip.left ? ' is-left' : '')} style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.html}</div>}
    </div>
  );
}
