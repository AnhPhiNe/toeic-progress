import { useEffect, useState, type CSSProperties } from 'react';
import type { SuggestedTask } from '@/shared/types';
import { suggestionFrom, suggestionLabel, type SuggestionView } from '../lib/suggestedTasks';
import type { StreakWeek, WeeklyGoal } from '@/shared/domain/streakWeek';
import { Soc } from '@/shared/ui/soc/Soc';
import { StreakCake } from './StreakCake';
import { todayKicker, type TodayTask } from '../lib/todayTasks';
import type { RestMood } from '../lib/socMood';

interface Props {
  tasks: TodayTask[];
  today: string;
  week: StreakWeek;
  goal: WeeklyGoal;
  onStartTask: (task: TodayTask) => void;
  /** Hide a suggested task until tomorrow. */
  onSkipTask: (id: string) => void;
  onPracticeMore: () => void;
  /** Accessories Sóc wears (Thành tích → Tủ đồ). */
  gear?: readonly string[];
  /** Buồn nhẹ (streak broke) or Ngủ gật (long break); 'hi' while a tapped Sóc is awake. */
  rest?: RestMood | 'hi';
  /** Tapping the dozing Sóc wakes it up. */
  onWake?: () => void;
  /** One-off tasks added from Sóc's advice on a test. */
  suggestions?: SuggestionView[];
  onStartSuggestion?: (task: SuggestedTask) => void;
  onToggleSuggestion?: (id: string) => void;
}

const FIRST_DONE_KEY = 'rd_first_done_cheer_v1';

/** Toss-acorn cheer (B) once a day, the first time something on the card is done. */
function useFirstDoneCheer(doneCount: number, today: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (doneCount === 0) return;
    try {
      if (localStorage.getItem(FIRST_DONE_KEY) === today) return;
      localStorage.setItem(FIRST_DONE_KEY, today);
    } catch { return; }
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 4800);
    return () => window.clearTimeout(t);
  }, [doneCount, today]);
  return on;
}


function Burst() {
  return <span className="td-burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} style={{ '--a': `${i * 60}deg` } as CSSProperties} />)}</span>;
}

function Check() {
  return <svg width="13" height="11" viewBox="0 0 14 12" aria-hidden="true"><path d="M2 6 L5.5 9.5 L12 2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function TodayCard({ tasks, today, week, goal, onStartTask, onSkipTask, onPracticeMore, gear, rest = null, onWake, suggestions = [], onStartSuggestion, onToggleSuggestion }: Props) {
  const open = tasks.filter(t => !t.done);
  const [skip, setSkip] = useState(0);
  const hero = open.length ? open[skip % open.length] : null;
  const rows = tasks.filter(t => t !== hero);
  // With no suggested task left, Sóc's advice task (if any) leads the card.
  const sugHero = hero ? null : suggestions.find(v => !v.done) ?? null;
  const sugRows = suggestions.filter(v => v !== sugHero);
  const total = tasks.length + suggestions.length;
  const doneCount = tasks.length - open.length + suggestions.filter(v => v.done).length;
  const allDone = !hero && !sugHero && total > 0 && doneCount === total;
  const firstCheer = useFirstDoneCheer(doneCount, today);



  return (
    <>
    <section className="td-card" aria-label="Việc hôm nay">
      <div className={'td-hero' + (allDone ? ' is-done' : '')}>
        <span className="td-ring" aria-hidden="true" />
        {hero ? <>
          <small>{hero.kicker}</small>
          <h2>{hero.title}</h2>
          <p>{hero.reason}</p>
          <div className="td-acts">
            <button type="button" className="td-go" onClick={() => onStartTask(hero)}>▶ Bắt đầu</button>
            <button type="button" className="td-skip" onClick={() => open.length > 1 ? setSkip(s => s + 1) : onSkipTask(hero.id)}>{open.length > 1 ? 'Để sau' : 'Bỏ qua hôm nay'}</button>
          </div>
        </> : sugHero ? <>
          <small>{todayKicker(sugHero.task.minutes)}</small>
          <h2>{sugHero.task.title}</h2>
          <p>{suggestionFrom(sugHero.task)}</p>
          <div className="td-acts">
            <button type="button" className="td-go" onClick={() => onStartSuggestion?.(sugHero.task)}>▶ Bắt đầu</button>
            <button type="button" className="td-skip" onClick={() => onToggleSuggestion?.(sugHero.task.id)}>Xong rồi</button>
          </div>
        </> : allDone ? <>
          <small>XONG HẾT HÔM NAY</small>
          <h2>Xong hết rồi!</h2>
          <p>Chuỗi lên {week.current} ngày. Mai gặp nha.</p>
          <div className="td-acts"><button type="button" className="td-go" onClick={onPracticeMore}>Làm thêm</button></div>
        </> : <>
          <small>HÔM NAY</small>
          <h2>Không có việc đến hạn</h2>
          <p>Muốn thì bấm giờ một Part.</p>
          <div className="td-acts"><button type="button" className="td-go" onClick={onPracticeMore}>Luyện tập</button></div>
        </>}
        {rest === 'zzz' && onWake
          ? <button type="button" className="td-hero-soc td-wake" onClick={onWake} aria-label="Sóc đang ngủ gật, chạm để đánh thức"><Soc state="zzz" size={96} gear={gear} /></button>
          : <Soc state={allDone || firstCheer ? 'cheerB' : rest ?? 'idle'} size={96} className="td-hero-soc" gear={gear} />}
      </div>

      <div className="td-body">
        {total > 0 && <div className="td-lbl"><span>CÒN LẠI HÔM NAY</span><span>{doneCount}/{total} xong</span></div>}
        <ul className="td-rows">
          {rows.map(task => (
            <li key={task.id} className={task.done ? undefined : 'td-my'}>
              <button type="button" className={'td-r' + (task.done ? ' is-done' : '')} onClick={() => !task.done && onStartTask(task)} disabled={task.done}>
                <i className="td-c">{task.done && <><Check /><Burst /></>}</i>
                <span className="td-tx"><b>{task.title}</b><small>Sóc gợi ý · {task.reason}</small></span>
                {!task.done && <span className="td-do">Làm</span>}
                <span className="td-tm">{task.done ? 'xong' : `${task.minutes} phút`}</span>
              </button>
              {!task.done && <button type="button" className="td-x" onClick={() => onSkipTask(task.id)} aria-label={`Bỏ qua "${task.title}" hôm nay`} title="Bỏ qua hôm nay">×</button>}
            </li>
          ))}
          {sugRows.map(({ task, done }) => (
            <li key={task.id} className={'td-my td-sug' + (done ? ' is-done' : '')}>
              <button type="button" className={'td-r' + (done ? ' is-done' : '')} onClick={() => onToggleSuggestion?.(task.id)} aria-pressed={done} aria-label={`${done ? 'Bỏ đánh dấu' : 'Đánh dấu xong'}: ${suggestionLabel(task)}`}>
                <i className="td-c is-sq">{done && <><Check /><Burst /></>}</i>
                <span className="td-tx"><b>{suggestionLabel(task)}</b><small>{suggestionFrom(task)}</small></span>
              </button>
              {!done && <button type="button" className="td-sgo" onClick={() => onStartSuggestion?.(task)}>Làm</button>}
            </li>
          ))}
        </ul>
      </div>
    </section>

    <StreakCake week={week} broke={rest === 'sad'}>
        <div className="td-wk">
          <span>{goal.done >= goal.goal ? <>Đủ mục tiêu tuần 🎉</> : <>Mục tiêu tuần: <b>{goal.done}/{goal.goal}</b> buổi học</>}</span>
          <div className="td-bar is-green"><i style={{ width: `${Math.min(100, goal.done / goal.goal * 100)}%` }} /></div>
        </div>
    </StreakCake>
    </>
  );
}
