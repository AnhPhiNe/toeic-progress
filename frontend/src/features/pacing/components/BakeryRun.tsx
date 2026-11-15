import type { ReactNode } from 'react';
import type { RecipeStep } from '../lib/bakery';
import { BulbString, ChefSoc, Oven, Whisk } from './BakeryArt';

interface Props {
  label: string;
  /** "Bánh kem Part 7" */
  recipe: string;
  questions: number;
  plannedMinutes: number;
  /** Elapsed share 0..1. */
  progress: number;
  /** Countdown, "38:24". */
  clock: string;
  /** Full planned length, "55:00". */
  plannedClock: string;
  paused: boolean;
  hot: boolean;
  steps: RecipeStep[];
  /** One question per this many seconds, as words: "1 phút" or "30 giây". */
  pace: string;
  /** The question the pace says you should be at. */
  at: number;
  error: string;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onStop: () => void;
}

function Colons({ text }: { text: string }) {
  const parts = text.split(':');
  const out: ReactNode[] = [];
  parts.forEach((part, i) => { if (i) out.push(<i key={'c' + i} className="bk-colon">:</i>); out.push(part); });
  return <>{out}</>;
}

/** Đang nướng: the big oven with a rising cake and the pinned recipe card. */
export function BakeryRun(p: Props) {
  const line = p.hot ? 'Sắp chín rồi! Còn ít phút nữa thôi.' : p.paused ? 'Sóc giữ lò ấm cho bạn nhé.' : 'Thơm quá! Câu nào kẹt thì đánh dấu, qua câu sau đã.';
  return (
    <div className={'rd bk-root bk-run' + (p.hot ? ' is-hot' : '') + (p.paused ? ' is-paused' : '')}>
      <BulbString />
      <div className="bk-floor" aria-hidden="true" />
      <header className="bk-head">
        <div><b>{p.label}</b><span>{p.questions} câu · {p.plannedMinutes} phút</span></div>
        <button type="button" className="bk-stop" onClick={p.onStop}>× Dừng</button>
      </header>

      <div className="bk-run-main">
        <div className="bk-run-left">
          <div className="bk-bub bk-bub--static">{line}</div>
          <div className="bk-run-soc"><ChefSoc size={150} mood={p.hot ? 'think' : 'idle'} /><Whisk className="bk-run-whisk" /></div>
        </div>

        <div className="bk-oven-wrap">
          <Oven w={540} h={620} variant="run" rise={p.progress} progress={p.progress} dialLabel={`${p.plannedMinutes}′`}
            caption={p.paused ? 'đang tạm dừng' : `còn lại trong ${p.plannedClock}`} />
          <div className={'bk-lcd' + (p.clock.length > 5 ? ' is-long' : '')} role="timer" aria-live="off" aria-label={`Còn ${p.clock}`}><Colons text={p.clock} /></div>
        </div>

        <aside className="bk-recipe" aria-label="Công thức">
          <i className="bk-tape" aria-hidden="true" />
          <div className="bk-recipe-kick">CÔNG THỨC</div>
          <h2>{p.recipe}</h2>
          <div className="bk-recipe-meta">{p.questions} câu · {p.plannedMinutes} phút · nhịp {p.pace} một câu</div>
          <ol>
            {p.steps.map(step => (
              <li key={step.name} className={'is-' + step.state} aria-current={step.state === 'now' ? 'step' : undefined}>
                <i aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'now' ? '●' : ''}</i>
                <div>
                  <b>{step.from === step.to ? `Câu ${step.from}` : `Câu ${step.from}–${step.to}`}</b>
                  <small>{step.name}{step.state === 'now' && ` · nên ở khoảng câu ${p.at}`}</small>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <div className="bk-acts">
        <div className="bk-acts-row">
          {p.paused
            ? <button type="button" className="rd-btn rd-btn--white" onClick={p.onResume}>Tiếp tục</button>
            : <button type="button" className="rd-btn rd-btn--white" onClick={p.onPause}>Tạm dừng</button>}
          <button type="button" className="rd-btn bk-fire" onClick={p.onFinish}>Xong rồi · ra lò</button>
        </div>
        <p>Đồng hồ vẫn chạy khi bạn chuyển sang tab làm đề. Phím cách để tạm dừng.</p>
        {p.error && <p role="alert" className="bk-err">{p.error}</p>}
      </div>
    </div>
  );
}
