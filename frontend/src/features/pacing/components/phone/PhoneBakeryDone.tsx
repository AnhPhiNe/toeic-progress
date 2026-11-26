import { useEffect, useState } from 'react';
import { playChime } from '@/shared/lib/sound';
import { triggerHaptic } from '@/shared/lib/haptics';
import { STRAWBERRY_EVERY, strawberryCount } from '../../lib/bakery';
import { CakePlate, ChefSoc } from '../BakeryArt';

interface Props {
  label: string;
  questions: number;
  clock: string;
  wrong: number;
  recordGain: string | null;
  blocked: boolean;
  timeUp: boolean;
  error: string;
  onWrong: (next: number) => void;
  onSave: (withScore: boolean) => void;
}

/** Ra lò on phones: one card with the decorated cake, wrong-count stepper and the time from the oven. */
export function PhoneBakeryDone(p: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    playChime('complete');
    triggerHaptic(10);
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const correct = Math.max(0, p.questions - p.wrong);
  return (
    <div className="rd bk-done pp pp-done">
      <div className="bk-floor pp-floor" aria-hidden="true" />
      {!p.blocked && (
        <>
          <div className="pp-card" role="dialog" aria-modal="true" aria-labelledby="pp-done-title">
            {p.recordGain && <div className="pp-ribbon"><span aria-hidden="true">🎀</span> Kỷ lục mới · nhanh hơn {p.recordGain}</div>}
            <CakePlate count={ready ? strawberryCount(correct) : 0} />
            <h2 id="pp-done-title">Ra lò! {p.label} trong {p.clock}</h2>
            <p className="pp-card-sub">{p.timeUp ? 'Hết giờ nướng rồi. ' : ''}Ghi số câu sai, Sóc trang trí bánh cho bạn.</p>
            <div className="pp-fld">
              <div><b>Số câu sai</b><small>{correct}/{p.questions} đúng · {STRAWBERRY_EVERY} đúng = 1 dâu</small></div>
              <div className="pp-mins pp-mins--white">
                <button type="button" aria-label="Bớt một câu sai" onClick={() => p.onWrong(Math.max(0, p.wrong - 1))} disabled={p.wrong <= 0}>−</button>
                <input type="number" inputMode="numeric" min={0} max={p.questions} value={p.wrong} aria-label="Số câu sai"
                  onChange={e => p.onWrong(Math.min(p.questions, Math.max(0, Math.round(Number(e.target.value)) || 0)))} onFocus={e => e.target.select()} />
                <button type="button" aria-label="Thêm một câu sai" onClick={() => p.onWrong(Math.min(p.questions, p.wrong + 1))} disabled={p.wrong >= p.questions}>+</button>
              </div>
            </div>
            <div className="pp-fld"><div><b>Thời gian</b><small>lấy từ đồng hồ lò</small></div><b className="pp-val">{p.clock}</b></div>
            {p.error && <p role="alert" className="bk-err">{p.error}</p>}
          </div>
          <div className="pp-done-soc"><ChefSoc size={70} mood="cheerC" /></div>
          <div className="pp-bottom">
            <div className="pp-btns">
              <button type="button" className="rd-btn rd-btn--white pp-side" onClick={() => p.onSave(false)}>Để sau</button>
              <button type="button" className="rd-btn pp-save" onClick={() => p.onSave(true)}>Lưu vào sổ</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
