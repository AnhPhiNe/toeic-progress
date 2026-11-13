import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { MilestonePlan } from '@/shared/domain/milestones';
import { socSvg, type SocState } from '@/shared/ui/soc/socSvg';
import '@/shared/ui/soc/soc.css';
import { SCENE_H, SCENE_W, TILE_H as th, TILE_W as tw, stairsGeometry } from '../lib/stairsGeometry';

type Plan = Exclude<MilestonePlan, { status: 'empty' }>;

interface Props {
  plan: Plan | null;
  target: number;
  /** "khoảng N đề nữa nếu giữ đà"; null when the trend gives no honest estimate. */
  testsAhead: number | null;
}

const ddmm = (date?: string) => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : '');
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Placeholder stairs for a learner with no test yet: faded blocks and the goal trophy. */
function emptyPlan(target: number): Plan {
  return { status: 'climbing', target, step: 0, best: 0, currentIndex: 0, steps: [0, 0, 0, 0, 0, target].map(value => ({ value, reached: false })) };
}

export function StairsScene({ plan, target, testsAhead }: Props) {
  const empty = !plan;
  const p = plan ?? emptyPlan(target);
  const blocks = p.steps.length - 1;
  const g = useMemo(() => stairsGeometry(blocks), [blocks]);
  const done = p.status === 'done';
  const cur = empty ? -1 : done ? blocks - 1 : p.currentIndex;
  const nextIdx = !empty && !done && p.next && p.next.index < blocks ? p.next.index : -1;

  const sceneRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ html: ReactNode; x: number; y: number; left?: boolean } | null>(null);
  const move = (event: MouseEvent, html: ReactNode, left = false) => {
    const r = sceneRef.current?.getBoundingClientRect();
    if (r) setTip({ html, x: event.clientX - r.left, y: event.clientY - r.top, left });
  };

  const [wiggle, setWiggle] = useState(0);
  const [socState, setSocState] = useState<SocState>('idle');
  const socRef = useRef<SVGGElement>(null);
  const socAt = Math.max(0, cur);
  useEffect(() => {
    const el = socRef.current;
    if (!el) return;
    const end = g.soc(socAt);
    const place = (x: number, y: number) => el.setAttribute('transform', `translate(${x} ${y})`);
    if (empty || socAt === 0 || reduceMotion() || !el.animate) { place(end.x, end.y); return; }
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
    let calm: number | undefined;
    anim.onfinish = () => {
      place(end.x, end.y);
      anim.cancel();
      setSocState('yay');
      calm = window.setTimeout(() => setSocState('idle'), 2400);
    };
    return () => { anim.cancel(); window.clearTimeout(calm); };
  }, [g, socAt, empty]);

  // Inline size beats .soc svg { width: 100% }, which would fill the whole scene.
  const socHtml = useMemo(() => socSvg(socState).replace('<svg viewBox="0 0 240 260"', '<svg viewBox="0 0 240 260" width="78" height="85" style="width:78px;height:85px"'), [socState]);

  const rays = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = i / 16 * Math.PI * 2;
    return `M600 230 L${600 + Math.cos(a) * 900} ${230 + Math.sin(a) * 900} L${600 + Math.cos(a + 0.11) * 900} ${230 + Math.sin(a + 0.11) * 900}Z`;
  }), []);

  const cupLeft = p.target - (p.best || 0);
  const cupTip = done
    ? <>Cúp <b>{p.target}</b> · bạn đã chạm!</>
    : empty
      ? <>Cúp <b>{p.target}</b> · mục tiêu của bạn</>
      : <>Cúp <b>{p.target}</b> · còn {cupLeft} điểm{testsAhead ? <><br />khoảng {testsAhead} đề nữa nếu giữ đà</> : null}</>;

  return (
    <div className="td-scene" ref={sceneRef}>
      <svg className="td-sky" viewBox="0 0 1172 900" preserveAspectRatio="xMinYMax slice" aria-hidden="true">
        <defs>
          <radialGradient id="tdHalo"><stop offset="0" stopColor="#fff7d1" /><stop offset=".5" stopColor="#ffe58f" stopOpacity=".55" /><stop offset="1" stopColor="#ffe58f" stopOpacity="0" /></radialGradient>
        </defs>
        <g className="td-rays">{rays.map((d, i) => <path key={i} d={d} fill="#fff" opacity=".45" />)}</g>
        <circle className="td-glow" cx="600" cy="230" r="210" fill="url(#tdHalo)" />
        <g className="td-cloud"><g fill="#fff" opacity=".85"><ellipse cx="300" cy="300" rx="60" ry="18" /><ellipse cx="330" cy="288" rx="36" ry="20" /><ellipse cx="900" cy="560" rx="70" ry="20" /><ellipse cx="934" cy="546" rx="40" ry="22" /></g></g>
        <g className="td-cloud td-c2"><g fill="#fff" opacity=".7"><ellipse cx="1100" cy="250" rx="54" ry="16" /><ellipse cx="520" cy="620" rx="50" ry="14" /></g></g>
      </svg>

      <svg className="td-stairs" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMinYMax meet" role="img"
        aria-label={empty ? `Cầu thang tới mục tiêu ${p.target}` : `Bậc ${socAt + 1} trên ${blocks + 1}, điểm cao nhất ${p.best}, mục tiêu ${p.target}`}>
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
          const ok = !empty && i < cur, isCur = i === cur;
          const k = isCur ? 'c' : ok ? 'g' : 'f';
          const edge = k === 'c' ? '#1f6a33' : k === 'g' ? '#b07a00' : '#b6b3cf';
          const hi = k === 'f' ? '#fff' : k === 'c' ? '#b8f0c2' : '#fff4c4';
          const bands: ReactNode[] = [];
          for (let b = 1; b * 46 < h - 10; b++) {
            const yy = y + b * 46;
            bands.push(<path key={'l' + b} d={`M${x - tw + 4} ${yy} L${x} ${yy + th}`} stroke={edge} strokeWidth="2" opacity=".18" />,
              <path key={'r' + b} d={`M${x} ${yy + th} L${x + tw - 4} ${yy}`} stroke={edge} strokeWidth="2" opacity=".14" />);
          }
          const tipHtml = empty ? null : step.reached
            ? (i === 0 ? <>Xuất phát <b>{step.value}</b><br />{ddmm(step.reachedDate)}</> : <>Bậc <b>{step.value}</b> · đạt {ddmm(step.reachedDate)}</>)
            : <>Bậc <b>{step.value}</b> · còn {step.value - p.best} điểm</>;
          return (
            <g key={i} className="td-blk" style={{ animationDelay: `${0.08 * i}s` }}
              onMouseMove={tipHtml ? e => move(e, tipHtml) : undefined} onMouseLeave={() => setTip(null)}>
              <path d={`M${x - tw} ${y} L${x} ${y + th} L${x} ${y + th + h} L${x - tw} ${y + h}Z`} fill={`url(#td${k}L)`} />
              <path d={`M${x} ${y + th} L${x + tw} ${y} L${x + tw} ${y + h} L${x} ${y + th + h}Z`} fill={`url(#td${k}R)`} />
              {bands}
              <path d={`M${x} ${y + th} L${x} ${y + th + h}`} stroke={edge} strokeWidth="2" opacity=".35" />
              <path className="td-top" d={`M${x - tw} ${y} L${x} ${y - th} L${x + tw} ${y} L${x} ${y + th}Z`} fill={`url(#td${k}T)`} />
              {k !== 'f' && <path d={`M${x - tw + 12} ${y} L${x} ${y - th + 6} L${x + tw - 12} ${y} L${x} ${y + th - 6}Z`} fill="none" stroke={hi} strokeWidth="2" opacity=".7" />}
              <path d={`M${x - tw} ${y} L${x} ${y + th} L${x + tw} ${y}`} fill="none" stroke={hi} strokeWidth="3" opacity=".8" strokeLinejoin="round" />
              {k === 'f' && i !== nextIdx && <path d={`M${x - tw} ${y} L${x} ${y - th} L${x + tw} ${y} L${x} ${y + th}Z`} fill="none" stroke="#c9c3e6" strokeWidth="2" strokeDasharray="5 5" />}
              {!empty && <g transform={`translate(${x - tw / 2} ${y + th / 2 + 82})`}>
                <rect x="-26" y="-17" width="52" height="24" rx="12" fill={k === 'f' ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.14)'} />
                <text x="0" y="1" fontWeight="900" fontSize="16.5" fill={k === 'f' ? '#8f8bb0' : '#fff'} textAnchor="middle">{step.value}</text>
              </g>}
              {k === 'f' && !empty && <g transform={`translate(${x - tw / 2} ${y + th / 2 + 112})`} opacity=".7">
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

        {p.steps.slice(0, blocks).map((_, i) => !empty && i < cur ? (
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
            <g className="td-hint">
              <rect x={nx - 30} y={ny - th - 46} width="60" height="26" rx="13" fill="#46b35a" />
              <path d={`M${nx - 6} ${ny - th - 21} l6 7 l6 -7Z`} fill="#46b35a" />
              <text x={nx} y={ny - th - 28} fontWeight="900" fontSize="14" fill="#fff" textAnchor="middle">+{p.next.gap}</text>
            </g>
          </g>;
        })()}

        <g transform={`translate(${g.cup.x} ${g.cup.y})`}>
          <g className={'td-cupbox' + (wiggle % 2 ? ' is-wig' : '') + (wiggle && wiggle % 2 === 0 ? ' is-wig2' : '')}
            role="button" tabIndex={0} aria-label={`Cúp mục tiêu ${p.target}`}
            onClick={() => setWiggle(w => w + 1)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWiggle(w => w + 1); } }}
            onMouseMove={e => move(e, cupTip, true)} onMouseLeave={() => setTip(null)}>
            <ellipse cx="0" cy="104" rx="84" ry="16" fill="#b0784a" opacity=".18" />
            <path d="M-58 68 L58 68 L66 100 L-66 100Z" fill="#3a463e" /><rect x="-62" y="62" width="124" height="10" rx="5" fill="#2f3a33" />
            <text x="0" y="93" fontWeight="900" fontSize="20" fill="#ffe58f" textAnchor="middle">{p.target}</text>
            <g className="td-cupwrap"><g className="td-cup">
              <rect x="-26" y="48" width="52" height="16" rx="5" fill="#e09a12" /><rect x="-12" y="28" width="24" height="24" fill="url(#tdCup)" />
              <path d="M-64 -64 C-104 -64 -100 -10 -58 -16" fill="none" stroke="#e8a516" strokeWidth="11" strokeLinecap="round" />
              <path d="M64 -64 C104 -64 100 -10 58 -16" fill="none" stroke="#d99a00" strokeWidth="11" strokeLinecap="round" />
              <path d="M-64 -76 H64 C64 -12 32 30 0 32 C-32 30 -64 -12 -64 -76Z" fill="url(#tdCup)" />
              <ellipse cx="0" cy="-76" rx="64" ry="9" fill="#ffe9a3" /><ellipse cx="0" cy="-76" rx="54" ry="6" fill="#e8a516" />
              <g clipPath="url(#tdCupClip)"><rect className="td-shine" x="-30" y="-90" width="26" height="140" fill="#fff" opacity=".55" transform="skewX(-18)" /></g>
              <g transform="translate(14 0)"><path d="M-14 -46 l5 10 11 1.6 -8 7.8 1.9 11 -9.9 -5.2 -9.9 5.2 1.9 -11 -8 -7.8 11 -1.6Z" fill="#fff" opacity=".9" /></g>
            </g></g>
            <path className="td-tw" d="M-92 -96 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3Z" fill="#fff" />
            <path className="td-tw" style={{ animationDelay: '.6s' }} d="M92 -118 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3Z" fill="#fff" />
            <path className="td-tw" style={{ animationDelay: '1.1s' }} d="M70 -20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#fff" />
          </g>
        </g>

        <g ref={socRef} className="soc td-socg" pointerEvents="none" dangerouslySetInnerHTML={{ __html: socHtml }} />
      </svg>

      {tip && <div className={'td-tip' + (tip.left ? ' is-left' : '')} style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.html}</div>}
    </div>
  );
}
