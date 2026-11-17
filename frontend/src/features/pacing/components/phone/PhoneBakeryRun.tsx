import type { ReactNode } from 'react';
import type { RecipeStep } from '../../lib/bakery';
import { ChefSoc, Oven } from '../BakeryArt';

interface Props {
  label: string;
  questions: number;
  plannedMinutes: number;
  progress: number;
  clock: string;
  plannedClock: string;
  paused: boolean;
  hot: boolean;
  steps: RecipeStep[];
  at: number;
  error: string;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onStop: () => void;
  /** Mẻ tự do: no questions and no steps; the oven's own progress track shows the time instead. */
  free?: boolean;
}

function Colons({ text }: { text: string }) {
  const out: ReactNode[] = [];
  text.split(':').forEach((part, i) => { if (i) out.push(<i key={'c' + i} className="bk-colon">:</i>); out.push(part); });
  return <>{out}</>;
}

/** Đang nướng on phones: the whole screen is the oven; the recipe shrinks to one line and five bars. */
export function PhoneBakeryRun(p: Props) {
  const line = p.hot ? 'Sắp chín rồi! Còn ít phút nữa thôi.' : p.paused ? 'Sóc giữ lò ấm cho bạn nhé.' : p.free ? 'Chỉ một việc thôi, xong là nghỉ.' : 'Câu nào kẹt thì đánh dấu, qua câu sau đã.';
  const now = p.free ? undefined : p.steps.find(s => s.state === 'now') ?? p.steps[p.steps.length - 1];
  return (
    <div className={'rd bk-run pp pp-run' + (p.hot ? ' is-hot' : '') + (p.paused ? ' is-paused' : '')}>
      <div className="bk-floor pp-floor" aria-hidden="true" />
      <header className="pp-run-head">
        <div><b>{p.label}</b><span>{p.free ? `${p.plannedMinutes} phút` : `${p.questions} câu · ${p.plannedMinutes} phút`}</span></div>
        <button type="button" className="bk-stop" onClick={p.onStop}>× Dừng</button>
      </header>

      <div className="pp-oven">
        <Oven w={540} h={620} variant="run" track={Boolean(p.free)} rise={p.progress} progress={p.progress} dialLabel={`${p.plannedMinutes}′`}
          caption={p.paused ? 'đang tạm dừng' : ''} />
        <div className={'bk-lcd' + (p.clock.length > 5 ? ' is-long' : '')} role="timer" aria-live="off" aria-label={`Còn ${p.clock}`}><Colons text={p.clock} /></div>
      </div>

      {now && (
        <div className="pp-step" aria-live="polite">
          <b>{now.from === now.to ? `Câu ${now.from}` : `Câu ${now.from}–${now.to}`} · {now.name.toLowerCase()}</b>
          <small>nên ở khoảng câu {p.at}</small>
          <div className="pp-bars" aria-hidden="true">
            {p.steps.map(s => <i key={s.name} className={s.state === 'done' ? 'd' : s.state === 'now' ? 'n' : ''} />)}
          </div>
        </div>
      )}

      <div className="pp-run-soc">
        <ChefSoc size={70} mood={p.hot ? 'think' : 'mix'} />
        <div className="pp-say pp-say--side">{line}</div>
      </div>

      <div className="pp-bottom">
        {p.error && <p role="alert" className="bk-err">{p.error}</p>}
        <div className="pp-btns">
          {p.paused
            ? <button type="button" className="rd-btn rd-btn--white pp-side" onClick={p.onResume}>Tiếp tục</button>
            : <button type="button" className="rd-btn rd-btn--white pp-side" onClick={p.onPause}>Tạm dừng</button>}
          <button type="button" className="rd-btn bk-fire pp-fire" onClick={p.onFinish}>{p.free ? 'Xong sớm · ra lò' : 'Xong rồi · ra lò'}</button>
        </div>
      </div>
    </div>
  );
}
