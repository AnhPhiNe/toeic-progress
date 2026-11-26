import { useEffect, useState, type CSSProperties } from 'react';
import { playChime } from '@/shared/lib/sound';
import { triggerHaptic } from '@/shared/lib/haptics';
import { STRAWBERRY_EVERY, sprinkles, strawberryCount } from '../lib/bakery';
import { BulbString, CakePlate, ChefSoc, Oven, Tray } from './BakeryArt';

interface Props {
  label: string;
  questions: number;
  plannedMinutes: number;
  /** "50:40" */
  clock: string;
  wrong: number;
  /** "1′30" when this run beat the Part's record. */
  recordGain: string | null;
  /** The other dialogs of the app are open: show the scene, hold the card back. */
  blocked: boolean;
  /** The clock ran out (no hand-stop). */
  timeUp: boolean;
  error: string;
  onWrong: (next: number) => void;
  onSave: (withScore: boolean) => void;
}

const SPRINKLES = sprinkles();
const COLORS = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa', '#ff8a3d'];

/** Ra lò: the oven door drops, sprinkles fall, and the cake is decorated with one strawberry per 7 correct answers. */
export function BakeryDone(p: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    playChime('complete');
    triggerHaptic(10);
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const correct = Math.max(0, p.questions - p.wrong);
  const berries = strawberryCount(correct);

  return (
    <div className="rd bk-root bk-done">
      <BulbString />
      <div className="bk-floor" aria-hidden="true" />
      <header className="bk-head">
        <div><b>{p.label}</b><span>{p.questions} câu · {p.plannedMinutes} phút</span></div>
      </header>
      <div className="bk-oven-done"><Oven w={300} h={380} variant="open" /></div>
      <div className="bk-sprinkles" aria-hidden="true">
        {SPRINKLES.map((s, i) => (
          <i key={i} className={'bk-sp' + (s.star ? ' is-star' : '')}
            style={{ left: `${s.x}%`, top: `${s.y}%`, background: COLORS[s.hue], '--r': `${s.rot}deg`, '--dl': `${s.delay}s`, '--t': s.time } as CSSProperties} />
        ))}
      </div>
      <div className="bk-done-soc"><ChefSoc size={150} mood="hi" /><div className="bk-tray"><Tray /></div></div>

      {!p.blocked && (
        <div className="bk-card" role="dialog" aria-modal="true" aria-labelledby="bk-done-title">
          {p.recordGain && <div className="bk-ribbon"><span aria-hidden="true">🎀</span> Kỷ lục mới · nhanh hơn {p.recordGain}</div>}
          <CakePlate count={ready ? berries : 0} />
          <h2 id="bk-done-title">Ra lò! {p.label} trong {p.clock}</h2>
          <p className="bk-card-sub">{p.timeUp ? 'Hết giờ nướng rồi. ' : ''}Chấm bài rồi ghi số câu sai, Sóc trang trí bánh cho bạn.</p>
          <div className="bk-row2">
            <div><b>Số câu sai</b><small>{correct}/{p.questions} đúng · mỗi {STRAWBERRY_EVERY} câu đúng là 1 quả dâu</small></div>
            <div className="bk-step">
              <button type="button" aria-label="Bớt một câu sai" onClick={() => p.onWrong(Math.max(0, p.wrong - 1))} disabled={p.wrong <= 0}>−</button>
              <input type="number" inputMode="numeric" min={0} max={p.questions} value={p.wrong} aria-label="Số câu sai"
                onChange={e => p.onWrong(Math.min(p.questions, Math.max(0, Math.round(Number(e.target.value)) || 0)))} onFocus={e => e.target.select()} />
              <button type="button" aria-label="Thêm một câu sai" onClick={() => p.onWrong(Math.min(p.questions, p.wrong + 1))} disabled={p.wrong >= p.questions}>+</button>
            </div>
          </div>
          <div className="bk-row2"><div><b>Thời gian</b><small>lấy từ đồng hồ lò</small></div><b className="bk-val">{p.clock}</b></div>
          {p.error && <p role="alert" className="bk-err">{p.error}</p>}
          <div className="bk-mbtns">
            <button type="button" className="rd-btn rd-btn--white" onClick={() => p.onSave(false)}>Để sau</button>
            <button type="button" className="rd-btn" onClick={() => p.onSave(true)}>Lưu vào sổ</button>
          </div>
        </div>
      )}
    </div>
  );
}
