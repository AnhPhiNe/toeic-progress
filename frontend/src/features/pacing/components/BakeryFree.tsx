import type { CSSProperties, ReactNode } from 'react';
import { sprinkles } from '../lib/bakery';
import { BulbString, ChefSoc, CroissantPlate, Oven, Tray } from './BakeryArt';

/** Mẻ tự do on computers: the ra-lò card (no wrong-question prompt) and the cooling break. Sketch: design/previews/mock-pomodoro.html, C. */

export interface FreeDoneProps {
  /** "+25 phút" */
  gained: string;
  /** "1 giờ 10 phút" */
  today: string;
  /** Today's focus runs, this one included. */
  count: number;
  /** Every `interval`-th run of the day is followed by a long break. */
  interval: number;
  long: boolean;
  breakMinutes: number;
  blocked: boolean;
  error: string;
  onBreak: () => void;
  onAgain: () => void;
}

const SPRINKLES = sprinkles();
const COLORS = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa', '#ff8a3d'];

/** Shared card body: gained minutes, today's total, and on a long-break run the dots of the day's bakes. */
export function FreeDoneBody({ gained, today, count, interval, long, titleId, sub }: Pick<FreeDoneProps, 'gained' | 'today' | 'count' | 'interval' | 'long'> & { titleId: string; sub: ReactNode }) {
  return (
    <>
      <CroissantPlate />
      <h2 id={titleId}>{gained}</h2>
      {sub}
      <div className="bk-free-today"><small>Đã luyện hôm nay</small><b>{today}</b></div>
      {long && (
        <div className="bk-free-dots">
          {Array.from({ length: interval }, (_, i) => <i key={i} aria-hidden="true" />)}
          <span>Mẻ thứ {count} hôm nay</span>
        </div>
      )}
    </>
  );
}

export const breakLabel = (long: boolean, minutes: number) => `${long ? 'Nghỉ dài' : 'Nghỉ'} ${minutes} phút`;

export function BakeryFreeDone(p: FreeDoneProps) {
  return (
    <div className="rd bk-root bk-done">
      <BulbString />
      <div className="bk-floor" aria-hidden="true" />
      <header className="bk-head"><div><b>Mẻ tự do</b><span>ra lò</span></div></header>
      <div className="bk-oven-done"><Oven w={300} h={380} variant="open" /></div>
      <div className="bk-sprinkles" aria-hidden="true">
        {SPRINKLES.map((s, i) => (
          <i key={i} className={'bk-sp' + (s.star ? ' is-star' : '')}
            style={{ left: `${s.x}%`, top: `${s.y}%`, background: COLORS[s.hue], '--r': `${s.rot}deg`, '--dl': `${s.delay}s`, '--t': s.time } as CSSProperties} />
        ))}
      </div>
      <div className="bk-done-soc"><ChefSoc size={150} mood="hi" /><div className="bk-tray"><Tray croissant /></div></div>

      {!p.blocked && (
        <div className="bk-card" role="dialog" aria-modal="true" aria-labelledby="bk-free-title">
          <FreeDoneBody {...p} titleId="bk-free-title"
            sub={<p className="bk-card-sub">{p.long ? `${p.count} mẻ rồi, nghỉ dài cho đã nhé!` : 'Mẻ tự do ra lò rồi. Nghỉ chút cho đầu óc nguội đã.'}</p>} />
          {p.error && <p role="alert" className="bk-err">{p.error}</p>}
          <div className="bk-mbtns">
            <button type="button" className="rd-btn rd-btn--white" onClick={p.onAgain}>Nướng mẻ nữa</button>
            <button type="button" className="rd-btn bk-fire" onClick={p.onBreak}>{breakLabel(p.long, p.breakMinutes)}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BreakProps {
  long: boolean;
  minutes: number;
  progress: number;
  clock: string;
  error: string;
  onSkip: () => void;
}

export function Colons({ text }: { text: string }) {
  const out: ReactNode[] = [];
  text.split(':').forEach((part, i) => { if (i) out.push(<i key={'c' + i} className="bk-colon">:</i>); out.push(part); });
  return <>{out}</>;
}
export const BREAK_LINE = 'Uống nước, đứng dậy duỗi người nhé.';

/** Nghỉ: the oven cools in lavender, Sóc rests (idle pose, arms down), one way out. */
export function BakeryBreak(p: BreakProps) {
  return (
    <div className="rd bk-root bk-run is-cool">
      <BulbString />
      <div className="bk-floor" aria-hidden="true" />
      <header className="bk-head">
        <div><b>{breakLabel(p.long, p.minutes)}</b><span>bánh đang nguội</span></div>
      </header>
      <div className="bk-run-main">
        <div className="bk-run-left">
          <div className="bk-bub bk-bub--static">{BREAK_LINE}</div>
          <div className="bk-run-soc"><ChefSoc size={150} mood="idle" /></div>
        </div>
        <div className="bk-oven-wrap">
          <Oven w={540} h={620} variant="run" rise={1} progress={p.progress} dialLabel={`${p.minutes}′`} caption="bánh đang nguội" />
          <div className={'bk-lcd' + (p.clock.length > 5 ? ' is-long' : '')} role="timer" aria-live="off" aria-label={`Còn ${p.clock}`}><Colons text={p.clock} /></div>
        </div>
      </div>
      <div className="bk-acts">
        <div className="bk-acts-row">
          <button type="button" className="rd-btn rd-btn--white" onClick={p.onSkip}>Bỏ nghỉ · nướng tiếp</button>
        </div>
        <p>Hết giờ nghỉ, lò kêu một tiếng rồi chờ mẻ sau.</p>
        {p.error && <p role="alert" className="bk-err">{p.error}</p>}
      </div>
    </div>
  );
}
