import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from 'react';
import { getPracticeScoreRange } from '@/shared/domain/etsScoring';
import { MAX_COUNT, clampCount, type InputMode } from '../lib/convert';

const TICKS = [0, 25, 50, 75, 100] as const;
const REPEAT_DELAY_MS = 420;
const REPEAT_EVERY_MS = 70;

/** Calls `step(delta)` once on press, then again and again while the pointer stays down. */
function useHoldToRepeat(step: (delta: number) => void) {
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; });
  const timers = useRef<{ delay?: number; every?: number }>({});
  const stop = useCallback(() => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.every);
  }, []);
  useEffect(() => stop, [stop]);
  const press = (delta: number) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    stepRef.current(delta);
    stop();
    timers.current.delay = window.setTimeout(() => { timers.current.every = window.setInterval(() => stepRef.current(delta), REPEAT_EVERY_MS); }, REPEAT_DELAY_MS);
    // A button that turns disabled at 0 or 100 never sees the release, so listen on the window.
    const release = () => { stop(); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };
  /** Keyboard activation arrives as a click without a pointer (detail 0). */
  const click = (delta: number) => (event: { detail: number }) => { if (event.detail === 0) stepRef.current(delta); };
  return { press, click };
}

interface Props {
  skill: 'listening' | 'reading';
  mode: InputMode;
  /** Right answers; the card shows the wrong count in "Câu sai" mode. */
  correct: number;
  points: number;
  inputRef?: Ref<HTMLInputElement>;
  /** The number the learner typed or dragged to, in the current mode. */
  onShown: (shown: number) => void;
  onStep: (delta: number) => void;
  onEnter: () => void;
}

export function ConvertSkillCard({ skill, mode, correct, points, inputRef, onShown, onStep, onEnter }: Props) {
  const listening = skill === 'listening';
  const name = listening ? 'Nghe' : 'Đọc';
  const shown = mode === 'correct' ? correct : MAX_COUNT - correct;
  const noun = mode === 'correct' ? 'đúng' : 'sai';
  const range = getPracticeScoreRange(skill, correct);
  const hold = useHoldToRepeat(onStep);
  const [draft, setDraft] = useState<string | null>(null);

  const onType = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    if (digits === '') { setDraft(''); return; }
    const value = clampCount(Number(digits));
    setDraft(String(value));
    onShown(value);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setDraft(null);
      onStep((event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setDraft(null);
      onEnter();
    }
  };

  const style = { ['--c' as string]: listening ? '#1c8fe3' : '#14b8a6', ['--p' as string]: shown } as CSSProperties;
  return (
    <section className={'cv-skill' + (listening ? ' is-listen' : ' is-read')} style={style} aria-label={`Ước tính ${name}`}>
      <div className="cv-skill__t">
        <b><span aria-hidden="true">{listening ? '🎧' : '📖'}</span> {name}</b>
        <span className="cv-skill__pts" title={`Khoảng tham khảo ${range.min}–${range.max} điểm; dùng cận dưới.`}>{points} điểm</span>
      </div>
      <div className="cv-skill__row">
        <button type="button" className="cv-step" tabIndex={-1} aria-label={`Giảm số câu ${noun} ${name}`} disabled={shown <= 0}
          onPointerDown={hold.press(-1)} onClick={hold.click(-1)}>−</button>
        <input ref={inputRef} className="cv-num" type="text" inputMode="numeric" autoComplete="off" aria-label={`Số câu ${noun} ${name}`}
          value={draft ?? String(shown)} onChange={event => onType(event.target.value)} onKeyDown={onKey}
          onFocus={event => event.currentTarget.select()} onBlur={() => setDraft(null)} />
        <button type="button" className="cv-step" tabIndex={-1} aria-label={`Tăng số câu ${noun} ${name}`} disabled={shown >= MAX_COUNT}
          onPointerDown={hold.press(1)} onClick={hold.click(1)}>+</button>
        <span className="cv-skill__q">/100<br />câu {noun}</span>
        <div className="cv-track">
          <input className="cv-range" type="range" min={0} max={MAX_COUNT} step={1} value={shown} aria-label={`Thanh số câu ${noun} ${name}`}
            onChange={event => { setDraft(null); onShown(Number(event.target.value)); }} />
          <div className="cv-ticks" aria-hidden="true">{TICKS.map(v => <em key={v} style={{ ['--v' as string]: v } as CSSProperties}>{v}</em>)}</div>
        </div>
      </div>
    </section>
  );
}
