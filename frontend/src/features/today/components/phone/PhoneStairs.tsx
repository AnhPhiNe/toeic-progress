import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Soc, type SocMood } from '@/shared/ui/soc/Soc';
import { phoneStairsLayout } from '../../lib/phoneStairsLayout';

export interface StairTest { score: number; name: string; date: string }
export interface StairStep { value: number; reached: boolean }

interface Props {
  steps: StairStep[];
  /** Bar Sóc stands on (-1 = no test yet: Sóc waits on the first bar). */
  cur: number;
  best: number;
  /** True once the goal is reached: Sóc cheers with star eyes. */
  done: boolean;
  /** Dashed pale bars: the estimated stairs shown before the first test. */
  estimate: boolean;
  target: number;
  cupLabel?: string;
  /** Full tests in date order, used for the "680 · ETS 9 · 28/10" bubble. */
  tests: StairTest[];
  gear?: readonly string[];
  /** Scene size and the free band for the stairs (px). */
  w: number;
  top: number;
  base: number;
  onCup?: () => void;
  /** Welcome moments: hide the whole scene (Sóc is greeting), grow the dashed bars in one by one, light the first bar green. */
  hidden?: boolean;
  grow?: boolean;
  lit?: boolean;
}

const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const PAL = {
  done: { l: '#f5b82e', r: '#e39a12', cap: '#ffd25e' },
  now: { l: '#3fae55', r: '#2a8a40', cap: '#6fd07f' },
  next: { l: '#efedf8', r: '#e0dcf1', cap: '#f6f4fc' }
};

/** Flat stairs of the phone Hôm nay scene (bars, Sóc on the current one, trophy), laid out for the height left above the task panel. */
export function PhoneStairs({ steps, cur, best, done, estimate, target, cupLabel, tests, gear, w, top, base, onCup, hidden, grow, lit }: Props) {
  const blocks = Math.max(1, steps.length - 1);
  const layout = useMemo(() => phoneStairsLayout({ w, top, base, blocks, cur: Math.max(0, cur) }), [w, top, base, blocks, cur]);
  const [tip, setTip] = useState<number | null>(null);
  useEffect(() => {
    if (tip === null) return;
    const t = window.setTimeout(() => setTip(null), 4000);
    return () => window.clearTimeout(t);
  }, [tip]);

  const tipText = (i: number): string => {
    const step = steps[i];
    if (estimate) return `Bậc ${step.value} · ước lượng`;
    if (!step.reached) return `Bậc ${step.value} · còn ${Math.max(0, step.value - best)} điểm`;
    const hit = tests.find(t => t.score >= step.value);
    return hit ? `${hit.score} · ${hit.name} · ${ddmm(hit.date)}` : `Bậc ${step.value}`;
  };

  // The trophy base text flips when it changes ("?" to the chosen goal) and the cup wiggles.
  const cupText = String(cupLabel ?? target);
  const lastLabel = useRef(cupText);
  const [flip, setFlip] = useState<{ n: number; from: string } | null>(null);
  useEffect(() => {
    if (lastLabel.current === cupText) return;
    const from = lastLabel.current;
    lastLabel.current = cupText;
    setFlip(f => ({ n: (f?.n ?? 0) + 1, from }));
  }, [cupText]);

  const mood: SocMood = estimate ? 'idle' : done ? 'cheerD' : 'cheerC';
  const { bars, soc, cup } = layout;
  const tipBar = tip !== null ? bars[tip] : null;
  const tipTop = tipBar ? Math.min(tipBar.y, tip === Math.max(0, cur) ? soc.top : tipBar.y) - 40 : 0;
  const tipLeft = tipBar ? Math.min(w - 90, Math.max(90, tipBar.x + tipBar.w / 2)) : 0;
  const cupCx = cup.left + cup.width / 2;
  const cupCy = cup.top + cup.height / 2;
  const cupSvg = (
    <svg viewBox="0 0 90 100" width={cup.width} height={cup.height} aria-hidden="true">
      <path d="M18 10 C2 10 2 40 24 44" fill="none" stroke="#f0a500" strokeWidth="7" />
      <path d="M72 10 C88 10 88 40 66 44" fill="none" stroke="#f0a500" strokeWidth="7" />
      <path d="M16 4 H74 C74 40 62 56 45 58 C28 56 16 40 16 4Z" fill="#ffc83d" />
      <path d="M45 18 l4 9 10 1-7.5 6.5 2.3 10-8.8-5.3-8.8 5.3 2.3-10L31 28l10-1Z" fill="#fff6d0" />
      <rect x="38" y="58" width="14" height="12" fill="#f0a500" />
      <rect x="24" y="70" width="42" height="9" rx="3" fill="#ffc83d" />
      <rect x="18" y="79" width="54" height="17" rx="3" fill="#2f3a33" />
      {flip && <text key={`o${flip.n}`} className="tp-lab is-out" x="45" y="92" textAnchor="middle" fontWeight="900" fontSize="12" fill="#ffd25e">{flip.from}</text>}
      <text key={`i${flip?.n ?? 0}`} className={'tp-lab' + (flip ? ' is-in' : '')} x="45" y="92" textAnchor="middle" fontWeight="900" fontSize="12" fill="#ffd25e">{cupText}</text>
    </svg>
  );

  return (
    <div className={'tp-stairs' + (hidden ? ' is-hidden' : '') + (grow ? ' is-grow' : '')} onClick={() => setTip(null)}>
      <div className="tp-sun" style={{ left: cupCx - 120, top: cupCy - 110 }} aria-hidden="true" />
      <div className="tp-rays" style={{ left: cupCx - 450, top: cupCy - 450 }} aria-hidden="true" />
      <div className="tp-hill" style={{ top: base - 56 }} aria-hidden="true" />

      <svg className="tp-bars" width={w} height={base + 4} role="img"
        aria-label={estimate ? `Cầu thang ước lượng tới mục tiêu ${target}` : `Bậc ${Math.max(0, cur) + 1} trên ${steps.length}, điểm cao nhất ${best}, mục tiêu ${target}`}>
        {bars.map((b, i) => {
          const k = estimate ? (lit && i === 0 ? 'now' : 'next') : i < cur ? 'done' : i === cur ? 'now' : 'next';
          const pal = PAL[k];
          const label = String(steps[i].value);
          return (
            <g key={i} role="button" tabIndex={0} aria-label={tipText(i)} className="tp-bar" style={{ '--i': i } as CSSProperties}
              onClick={e => { e.stopPropagation(); setTip(t => (t === i ? null : i)); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTip(t => (t === i ? null : i)); } }}>
              <rect x={b.x} y={b.y} width={b.w / 2} height={b.h} fill={pal.l} />
              <rect x={b.x + b.w / 2} y={b.y} width={b.w / 2} height={b.h} fill={pal.r} />
              <rect x={b.x} y={b.y - 4} width={b.w} height="10" rx="3" fill={pal.cap} />
              {estimate && <rect x={b.x + 1} y={b.y - 3} width={b.w - 2} height={b.h + 3} rx="3" fill="none" stroke="#c9c3e6" strokeWidth="2" strokeDasharray="5 5" />}
              {b.h > 54 && <>
                <rect x={b.x + b.w / 2 - 16} y={b.y + 9} width="32" height="17" rx="8.5" fill={k === 'next' ? '#fff' : 'rgba(0,0,0,.18)'} />
                <text x={b.x + b.w / 2} y={b.y + 21.5} textAnchor="middle" fontWeight="900" fontSize="10.5" fill={k === 'next' ? '#9a94bb' : '#fff'}>{label}</text>
              </>}
            </g>
          );
        })}
      </svg>

      <span className="tp-soc" style={{ left: soc.left, top: soc.top, width: soc.width }}>
        <Soc state={mood} size={soc.width} gear={gear} />
      </span>

      {onCup
        ? <button type="button" className="tp-cup" aria-label={`Cúp mục tiêu ${target}, mở Hành trình`} style={{ left: cup.left - 6, top: cup.top - 6, width: cup.width + 12, height: cup.height + 12 }}
            onClick={e => { e.stopPropagation(); onCup(); }}><span key={flip?.n ?? 0} className={flip ? 'tp-wig' : undefined}>{cupSvg}</span></button>
        : <div className="tp-cup" aria-hidden="true" style={{ left: cup.left - 6, top: cup.top - 6, width: cup.width + 12, height: cup.height + 12 }}><span key={flip?.n ?? 0} className={flip ? 'tp-wig' : undefined}>{cupSvg}</span></div>}

      {tip !== null && tipBar && <div className="tp-tip" role="status" style={{ left: tipLeft, top: tipTop }}>{tipText(tip)}</div>}
    </div>
  );
}
