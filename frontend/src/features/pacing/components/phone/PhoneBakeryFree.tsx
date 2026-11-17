import { ChefSoc, Oven } from '../BakeryArt';
import { BREAK_LINE, Colons, FreeDoneBody, breakLabel, type BreakProps, type FreeDoneProps } from '../BakeryFree';

/** Mẻ tự do on phones: ra lò and the cooling break (design/previews/mock-pomodoro.html, C3–C5). */
export function PhoneBakeryFreeDone(p: FreeDoneProps) {
  return (
    <div className="rd bk-done pp pp-done">
      <div className="bk-floor pp-floor" aria-hidden="true" />
      {!p.blocked && (
        <>
          <div className="pp-card" role="dialog" aria-modal="true" aria-labelledby="pp-free-title">
            <FreeDoneBody {...p} titleId="pp-free-title" sub={<p className="pp-card-sub">Mẻ tự do ra lò rồi.</p>} />
            {p.error && <p role="alert" className="bk-err">{p.error}</p>}
          </div>
          <div className="pp-run-soc pp-free-soc">
            <ChefSoc size={70} mood="cheerC" />
            <div className="pp-say pp-say--side">{p.long ? `${p.count} mẻ rồi, nghỉ dài cho đã nhé!` : 'Nghỉ chút cho đầu óc nguội đã.'}</div>
          </div>
          <div className="pp-bottom">
            <div className="pp-btns">
              <button type="button" className="rd-btn rd-btn--white pp-side pp-again" onClick={p.onAgain}>Nướng mẻ nữa</button>
              <button type="button" className="rd-btn bk-fire pp-fire" onClick={p.onBreak}>{breakLabel(p.long, p.breakMinutes)}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PhoneBakeryBreak(p: BreakProps) {
  return (
    <div className="rd bk-run is-cool pp pp-run">
      <div className="bk-floor pp-floor" aria-hidden="true" />
      <header className="pp-run-head">
        <div><b>{breakLabel(p.long, p.minutes)}</b><span>bánh đang nguội</span></div>
      </header>
      <div className="pp-oven">
        <Oven w={540} h={620} variant="run" rise={1} progress={p.progress} dialLabel={`${p.minutes}′`} caption="bánh đang nguội" />
        <div className={'bk-lcd' + (p.clock.length > 5 ? ' is-long' : '')} role="timer" aria-live="off" aria-label={`Còn ${p.clock}`}><Colons text={p.clock} /></div>
      </div>
      <div className="pp-run-soc">
        <ChefSoc size={70} mood="idle" />
        <div className="pp-say pp-say--side">{BREAK_LINE}</div>
      </div>
      <div className="pp-bottom">
        {p.error && <p role="alert" className="bk-err">{p.error}</p>}
        <div className="pp-btns">
          <button type="button" className="rd-btn rd-btn--white pp-skip" onClick={p.onSkip}>Bỏ nghỉ · nướng tiếp</button>
        </div>
      </div>
    </div>
  );
}
