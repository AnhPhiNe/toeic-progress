import { useEffect, useRef, useState } from 'react';
import { MAX_TARGET, MIN_TARGET, TARGET_PRESETS, parseTargetInput, stairsSummary } from '../lib/goalSetup';

interface Props {
  /** The chosen goal, or null while the learner has not picked one. */
  target: number | null;
  examDate: string;
  today: string;
  onPick: (target: number) => void;
  onExamDate: (date: string) => void;
  onLog: () => void;
  /** Present once a goal exists: folds the card back into the page header. */
  onDone?: () => void;
  /** First visit: Sóc is greeting, so the heading introduces her. */
  greeting?: boolean;
}

const isPreset = (value: number | null) => TARGET_PRESETS.some(preset => preset === value);
const SAVE_DELAY_MS = 450;

/** Goal-setting card of the new-user Hôm nay page (S1): target chips, optional exam date, first-test button. */
export function GoalCard({ target, examDate, today, onPick, onExamDate, onLog, onDone, greeting }: Props) {
  const [draft, setDraft] = useState(() => (target !== null && !isPreset(target) ? String(target) : ''));
  const [touched, setTouched] = useState(false);
  const typed = parseTargetInput(draft);

  // Save a typed goal once it is a whole valid number and the learner pauses (or leaves the field).
  const save = useRef(onPick);
  save.current = onPick;
  useEffect(() => {
    if (typed === null || typed === target) return;
    const timer = window.setTimeout(() => save.current(typed), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [typed, target]);

  const commit = () => {
    setTouched(true);
    if (typed !== null && typed !== target) onPick(typed);
  };
  const pickPreset = (value: number) => {
    setDraft('');
    setTouched(false);
    onPick(value);
  };

  const typingOn = draft !== '' || (target !== null && !isPreset(target));
  const invalid = draft !== '' && typed === null && (touched || draft.length >= 3);
  const summary = target !== null ? stairsSummary(target) : null;

  return (
    <section className="td-gc" aria-label="Chọn mục tiêu">
      <small>{greeting ? 'LẦN ĐẦU GẶP NHAU' : 'BẮT ĐẦU'}</small>
      {greeting
        ? <h1>Chào bạn! <em>Mình là Sóc</em></h1>
        : <h1>Dựng cầu thang <em>{target !== null ? `lên cúp ${target}` : 'lên cúp của bạn'}</em></h1>}

      <span className="td-gc-lab" id="td-gc-target">Mục tiêu</span>
      <div className="td-gc-chips" role="group" aria-labelledby="td-gc-target">
        {TARGET_PRESETS.map(value => {
          const on = target === value && !typingOn;
          return <button key={value} type="button" className={'td-gc-chip' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => pickPreset(value)}>{value}</button>;
        })}
        <input
          className={'td-gc-in' + (typingOn ? ' is-on' : '')}
          value={draft}
          onChange={event => { setDraft(event.target.value.replace(/\D/g, '').slice(0, 3)); setTouched(false); }}
          onBlur={commit}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
          inputMode="numeric"
          placeholder="Số khác"
          maxLength={3}
          aria-label="Mục tiêu khác, từ 10 đến 990"
          aria-invalid={invalid}
        />
      </div>
      {invalid && <p className="td-gc-err" role="status">Nhập số từ {MIN_TARGET} đến {MAX_TARGET}, tròn 5 (ví dụ 725).</p>}

      <label className="td-gc-lab" htmlFor="td-gc-date">Ngày thi</label>
      <div className="td-gc-row">
        <input id="td-gc-date" className="td-gc-date" type="date" value={examDate} min={today} onChange={event => onExamDate(event.target.value)} />
        <span className="td-gc-hint">không bắt buộc</span>
      </div>

      <div className="td-gc-go">
        <button type="button" className="rd-btn" onClick={onLog}>+ Ghi điểm đề đầu tiên</button>
        {summary && <span className="td-gap">{summary.blocks} bậc · mỗi bậc {summary.step}</span>}
        {onDone && <button type="button" className="td-gc-done" onClick={onDone}>Xong</button>}
      </div>
    </section>
  );
}
