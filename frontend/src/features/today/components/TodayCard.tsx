import { useEffect, useState, type CSSProperties } from 'react';
import type { Habit } from '@/shared/types';
import type { StreakWeek, WeeklyGoal } from '@/shared/domain/streakWeek';
import { Soc } from '@/shared/ui/soc/Soc';
import { StreakCake } from './StreakCake';
import { AddHabitPanel } from './AddHabitPanel';
import type { TodayTask } from '../lib/todayTasks';
import { habitDoneToday } from '../lib/habits';

interface Props {
  tasks: TodayTask[];
  habits: Habit[];
  today: string;
  week: StreakWeek;
  goal: WeeklyGoal;
  onStartTask: (task: TodayTask) => void;
  /** Hide a suggested task until tomorrow. */
  onSkipTask: (id: string) => void;
  onPracticeMore: () => void;
  onToggleHabit: (id: string) => void;
  onAddHabit: (title: string) => void;
  onRemoveHabit: (id: string) => void;
  suggestOff: string[];
  onToggleSuggest: (kind: string) => void;
  onSetWeeklyGoal: (days: number) => void;
  /** Accessories Sóc wears (Thành tích → Tủ đồ). */
  gear?: readonly string[];
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

export function TodayCard({ tasks, habits, today, week, goal, onStartTask, onSkipTask, onPracticeMore, onToggleHabit, onAddHabit, onRemoveHabit, onSetWeeklyGoal, suggestOff, onToggleSuggest, gear }: Props) {
  const open = tasks.filter(t => !t.done);
  const [skip, setSkip] = useState(0);
  const hero = open.length ? open[skip % open.length] : null;
  const rows = tasks.filter(t => t !== hero);
  const habitsDone = habits.filter(h => habitDoneToday(h, today)).length;
  const total = tasks.length + habits.length;
  const doneCount = tasks.length - open.length + habitsDone;
  const allDone = !hero && total > 0 && doneCount === total;
  const firstCheer = useFirstDoneCheer(doneCount, today);

  const [addAt, setAddAt] = useState<HTMLElement | null>(null);
  const [editGoal, setEditGoal] = useState(false);



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
        <Soc state={allDone || firstCheer ? 'cheerB' : 'idle'} size={96} className="td-hero-soc" gear={gear} />
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
          {habits.map(habit => {
            const on = habitDoneToday(habit, today);
            return (
              <li key={habit.id} className="td-my">
                <button type="button" className={'td-r' + (on ? ' is-done' : '')} onClick={() => onToggleHabit(habit.id)} aria-pressed={on}>
                  <i className="td-c is-sq">{on && <><Check /><Burst /></>}</i>
                  <span className="td-tx"><b title={habit.title}>{habit.title}</b><small>việc của mình · mỗi ngày</small></span>
                </button>
                <button type="button" className="td-x" onClick={() => onRemoveHabit(habit.id)} aria-label={`Bỏ việc "${habit.title}"`} title="Bỏ việc này">×</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="td-add" aria-expanded={!!addAt} onClick={e => setAddAt(addAt ? null : e.currentTarget)}>+ Thêm việc của mình</button>
        {addAt && <AddHabitPanel anchor={addAt} habits={habits} suggestOff={suggestOff} onAdd={onAddHabit} onToggleSuggest={onToggleSuggest} onClose={() => setAddAt(null)} />}
      </div>
    </section>

    <StreakCake week={week}>
        <div className="td-wk">
          <span>{goal.done >= goal.goal ? <>Đủ mục tiêu tuần 🎉</> : <>Mục tiêu tuần: <b>{goal.done}/{goal.goal}</b> buổi học</>}</span>
          <div className="td-bar is-green"><i style={{ width: `${Math.min(100, goal.done / goal.goal * 100)}%` }} /></div>
          {editGoal
            ? <span className="td-step">
                <button type="button" onClick={() => onSetWeeklyGoal(goal.goal - 1)} disabled={goal.goal <= 1} aria-label="Bớt một buổi">−</button>
                <b>{goal.goal}</b>
                <button type="button" onClick={() => onSetWeeklyGoal(goal.goal + 1)} disabled={goal.goal >= 7} aria-label="Thêm một buổi">+</button>
                <button type="button" className="td-link" onClick={() => setEditGoal(false)}>Xong</button>
              </span>
            : <button type="button" className="td-link" onClick={() => setEditGoal(true)}>Sửa</button>}
        </div>
    </StreakCake>
    </>
  );
}
