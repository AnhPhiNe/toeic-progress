import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StudySession } from '@/shared/types';
import type { PacingMode } from '../lib/pacingModel';
import { dishName, dishOf, type Dish, type PaceTag } from '../lib/bakery';
import { Dome, DishIcon, ChefSoc, ItemArt, ShopBackdrop, Whisk } from './BakeryArt';

export interface BakeryChoice { mode: PacingMode; label: string; questions: number; minutes: number; record: string | null }
export interface RecentRow { id: string; session: StudySession; dish: Dish; title: string; sub: string; tag: PaceTag | null }

interface Props {
  mode: PacingMode;
  label: string;
  choices: BakeryChoice[];
  /** Reason line under the headline. */
  reason: string;
  /** Time of the latest run of the chosen Part ("52:10"), for Sóc's bubble. */
  lastTime: string | null;
  minutes: number;
  canMinus: boolean;
  recent: RecentRow[];
  weekCount: number;
  error: string;
  onPick: (mode: PacingMode) => void;
  onStart: () => void;
  onMinutes: (delta: number) => void;
  onLog: () => void;
  onPomodoro: () => void;
  onOpenSession: (session: StudySession) => void;
}

const W = 1068, H = 450;
const XS = [110, 290, 470, 670];
const TILT = [-2, 1.5, 0, -1.5];
const REDUCED = '(prefers-reduced-motion: reduce)';

/** The stage is drawn at 1068 x 450 and scaled to the column. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1.12, Math.max(0.7, el.clientWidth / W)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, scale] as const;
}

/** Chọn món: a bakery whose four display-case items are the four Parts. */
export function BakeryChoose(p: Props) {
  const [fit, scale] = useFit();
  const [going, setGoing] = useState(false);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  const selected = p.choices.findIndex(c => c.mode === p.mode);
  const chosen = p.choices[selected];
  const dish = dishName(p.mode);

  const light = () => {
    if (going) return;
    if (window.matchMedia?.(REDUCED).matches) { p.onStart(); return; }
    setGoing(true);
    timeout.current = window.setTimeout(p.onStart, 480);
  };

  return (
    <div className="rd bk-root bk-page">
      <div className="bk-kick">LUYỆN TẬP</div>
      <h1 className="bk-h1">Hôm nay nướng <em>{p.label}</em> nhé?</h1>
      <p className="bk-sub">{p.reason}</p>

      <div className="bk-fit" ref={fit} style={{ height: H * scale }}>
        <div className="bk-stage" style={{ transform: `scale(${scale})` }}>
          <ShopBackdrop width={W} height={H} />

          {p.choices.map((c, i) => {
            const on = i === selected;
            return (
              <button key={c.mode} type="button" className={'bk-item' + (on ? ' is-on' : '')} style={{ left: XS[i] - 90 }}
                aria-pressed={on} aria-label={`${c.label}, ${c.questions} câu, ${c.minutes} phút, ${c.record ? 'kỷ lục ' + c.record : 'kỷ lục chưa có'}`}
                onClick={() => p.onPick(c.mode)}>
                <ItemArt dish={dishOf(c.mode)} selected={on} />
                <span className="bk-tag" style={{ transform: `rotate(${TILT[i]}deg)` }}>
                  <span className="bk-tag-top"><b>{c.label}</b><b className="bk-tag-min">{c.minutes}′</b></span>
                  <span className="bk-tag-sub">{c.questions} câu · {c.record ? `kỷ lục ${c.record}` : 'kỷ lục chưa có'}</span>
                </span>
              </button>
            );
          })}
          {selected >= 0 && <div className="bk-dome" style={{ left: XS[selected] - 130 }}><Dome /></div>}

          <div className={'bk-shop-soc' + (going ? ' is-going' : '')}>
            <ChefSoc size={82} mood="hi" />
            <Whisk className="bk-shop-whisk" />
          </div>
          <div className={'bk-bub' + (selected === 3 ? ' is-left' : '')}>
            {dish} cần <b>{chosen?.minutes ?? p.minutes} phút</b>.{p.lastTime && <> Lần trước bạn xong trong {p.lastTime}!</>}
          </div>
        </div>
      </div>

      <div className="bk-ctrl">
        <button type="button" className="rd-btn bk-fire" onClick={light}><span aria-hidden="true">🔥</span> Bật lò · {p.label} · {p.minutes} phút</button>
        <div className="bk-step" role="group" aria-label="Số phút">
          <button type="button" aria-label="Bớt một phút" onClick={() => p.onMinutes(-1)} disabled={!p.canMinus}>−</button>
          <b>{p.minutes}</b><span>phút</span>
          <button type="button" aria-label="Thêm một phút" onClick={() => p.onMinutes(1)}>+</button>
        </div>
        <button type="button" className="bk-ghost" onClick={p.onLog}>Ghi kết quả, không bấm giờ</button>
        <button type="button" className="bk-link" onClick={p.onPomodoro}>Đồng hồ Pomodoro ›</button>
      </div>
      {p.error && <p role="alert" className="bk-err">{p.error}</p>}

      <section className="bk-recent">
        <h2>Mẻ bánh gần đây<span>Tuần này {p.weekCount} mẻ · Phần Nghe chạy theo audio nên chỉ ghi kết quả</span></h2>
        {p.recent.length ? (
          <div className="bk-rows">
            {p.recent.map(row => (
              <button key={row.id} type="button" className="bk-row" onClick={() => p.onOpenSession(row.session)}>
                <DishIcon dish={row.dish} />
                <span className="bk-row-text"><b>{row.title}</b><small>{row.sub}</small></span>
                {row.tag ? <span className={'bk-pill is-' + row.tag.kind}>{row.tag.text}</span> : <span className="bk-pill">không bấm giờ</span>}
              </button>
            ))}
          </div>
        ) : <p className="bk-empty">Chưa có mẻ bánh nào. Bật lò mẻ đầu tiên nhé.</p>}
      </section>
    </div>
  );
}
