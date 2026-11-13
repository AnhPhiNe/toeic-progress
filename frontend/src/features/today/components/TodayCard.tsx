import { useState, type FormEvent } from 'react';
import type { Habit } from '@/shared/types';
import type { StreakWeek, WeeklyGoal } from '@/shared/domain/streakWeek';
import { nextStreakMilestone } from '@/shared/domain/streakWeek';
import { Soc } from '@/shared/ui/soc/Soc';
import type { TodayTask } from '../lib/todayTasks';
import { HABIT_TITLE_MAX, MAX_HABITS, habitDoneToday } from '../lib/habits';

interface Props {
  tasks: TodayTask[];
  habits: Habit[];
  today: string;
  week: StreakWeek;
  goal: WeeklyGoal;
  onStartTask: (task: TodayTask) => void;
  onPracticeMore: () => void;
  onToggleHabit: (id: string) => void;
  onAddHabit: (title: string) => void;
  onRemoveHabit: (id: string) => void;
  onSetWeeklyGoal: (days: number) => void;
}

const ICON: Record<TodayTask['kind'], [string, string]> = {
  REVIEW_MISTAKES: ['📕', '#ffe1e9'],
  WORD_CARDS: ['🃏', '#fff3d1'],
  PART_TIMER: ['⏱️', '#f1ecff'],
  FULL_TEST: ['📝', '#e6f3fd']
};

function Check() {
  return <svg width="13" height="11" viewBox="0 0 14 12" aria-hidden="true"><path d="M2 6 L5.5 9.5 L12 2" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Flame({ n }: { n: number }) {
  return (
    <span className="td-sk-big" aria-hidden="true">
      <svg viewBox="0 0 44 52" width="54" height="62">
        <defs><linearGradient id="tdFlame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb347" /><stop offset="1" stopColor="#ff6a1a" /></linearGradient></defs>
        <ellipse className="td-glw" cx="22" cy="34" rx="20" ry="18" fill="#ffb35c" opacity=".35" />
        <g className="td-flk"><path d="M22 2 C26 14 40 19 40 32 a18 17 0 0 1 -36 0 C4 23 11 19 13 10 C16 14 18 16 22 2Z" fill="url(#tdFlame)" /><path d="M22 24 c4 5 8 8 8 13 a8 8 0 0 1 -16 0 c0-5 4-7 8-13Z" fill="#ffe58f" /></g>
      </svg>
      <b>{n}</b>
    </span>
  );
}

export function TodayCard({ tasks, habits, today, week, goal, onStartTask, onPracticeMore, onToggleHabit, onAddHabit, onRemoveHabit, onSetWeeklyGoal }: Props) {
  const open = tasks.filter(t => !t.done);
  const [skip, setSkip] = useState(0);
  const hero = open.length ? open[skip % open.length] : null;
  const rows = tasks.filter(t => t !== hero);
  const habitsDone = habits.filter(h => habitDoneToday(h, today)).length;
  const total = tasks.length + habits.length;
  const doneCount = tasks.length - open.length + habitsDone;
  const allDone = !hero && total > 0 && doneCount === total;
  const studiedToday = week.days.some(d => d.isToday && d.state === 'done');

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editGoal, setEditGoal] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onAddHabit(draft);
    setDraft('');
    setAdding(false);
  };

  const ms = nextStreakMilestone(week.current);
  const streakTitle = studiedToday ? `Ngày thứ ${week.current} liền!` : week.current > 0 ? `Đang có ${week.current} ngày liền` : 'Bắt đầu chuỗi mới';
  const streakSub = studiedToday ? `Kỷ lục của bạn: ${week.longest} ngày` : week.current > 0 ? `Xong một việc là lên ${week.current + 1} ngày` : 'Xong một việc hôm nay là có ngày 1';

  return (
    <section className="td-card" aria-label="Việc hôm nay">
      <div className={'td-hero' + (allDone ? ' is-done' : '')}>
        <span className="td-ring" aria-hidden="true" />
        {hero ? <>
          <small>{hero.kicker}</small>
          <h2>{hero.title}</h2>
          <p>{hero.reason}</p>
          <div className="td-acts">
            <button type="button" className="td-go" onClick={() => onStartTask(hero)}>▶ Bắt đầu</button>
            {open.length > 1 && <button type="button" className="td-skip" onClick={() => setSkip(s => s + 1)}>Để sau</button>}
          </div>
        </> : allDone ? <>
          <small>XONG HẾT HÔM NAY</small>
          <h2>Xong hết rồi!</h2>
          <p>Chuỗi lên {week.current} ngày. Mai gặp nha.</p>
          <div className="td-acts"><button type="button" className="td-go" onClick={onPracticeMore}>Làm thêm</button></div>
        </> : <>
          <small>HÔM NAY</small>
          <h2>Không có việc đến hạn</h2>
          <p>Muốn thì bấm giờ một Part bất kỳ.</p>
          <div className="td-acts"><button type="button" className="td-go" onClick={onPracticeMore}>Luyện tập</button></div>
        </>}
        <Soc state={allDone ? 'yay' : 'idle'} size={112} className="td-hero-soc" />
      </div>

      <div className="td-body">
        {total > 0 && <div className="td-lbl"><span>CÒN LẠI HÔM NAY</span><span>{doneCount}/{total} xong</span></div>}
        <ul className="td-rows">
          {rows.map(task => (
            <li key={task.id}>
              <button type="button" className={'td-r' + (task.done ? ' is-done' : '')} onClick={() => !task.done && onStartTask(task)} disabled={task.done}>
                <i className="td-c">{task.done && <Check />}</i>
                <span className="td-ic" style={{ background: ICON[task.kind][1] }} aria-hidden="true">{ICON[task.kind][0]}</span>
                <span className="td-tx"><b>{task.title}</b><small>{task.reason}</small></span>
                {!task.done && <span className="td-do">Làm</span>}
                <span className="td-tm">{task.done ? 'xong' : `${task.minutes} phút`}</span>
              </button>
            </li>
          ))}
          {habits.map(habit => {
            const on = habitDoneToday(habit, today);
            return (
              <li key={habit.id} className="td-my">
                <button type="button" className={'td-r' + (on ? ' is-done' : '')} onClick={() => onToggleHabit(habit.id)} aria-pressed={on}>
                  <i className="td-c is-sq">{on && <Check />}</i>
                  <span className="td-ic" style={{ background: '#e6f3fd' }} aria-hidden="true">✏️</span>
                  <span className="td-tx"><b>{habit.title}</b><small>việc của mình · mỗi ngày</small></span>
                  <span className="td-tm">{on ? 'xong' : 'tự đánh dấu'}</span>
                </button>
                <button type="button" className="td-x" onClick={() => onRemoveHabit(habit.id)} aria-label={`Bỏ việc "${habit.title}"`} title="Bỏ việc này">×</button>
              </li>
            );
          })}
        </ul>
        {habits.length < MAX_HABITS && (adding
          ? <form className="td-addf" onSubmit={submit}>
              <input autoFocus value={draft} maxLength={HABIT_TITLE_MAX} onChange={e => setDraft(e.target.value)} placeholder="Ví dụ: Học 20 từ Mochi" aria-label="Tên việc của mình" />
              <button type="submit" className="rd-btn" disabled={!draft.trim()}>Thêm</button>
              <button type="button" className="td-cancel" onClick={() => { setAdding(false); setDraft(''); }}>Huỷ</button>
            </form>
          : <button type="button" className="td-add" onClick={() => setAdding(true)}>+ Thêm việc của mình</button>)}

        <div className="td-sk">
          <div className="td-sk-hd">
            <Flame n={week.current} />
            <div className="td-sk-t"><b>{streakTitle}</b><small>{streakSub}</small></div>
            {week.freezesLeft > 0 && <span className="td-frz" title="Ngày nghỉ được giữ chuỗi">❄ {week.freezesLeft}</span>}
          </div>
          <div className="td-week">
            {week.days.map(d => (
              <div key={d.date} className={'td-dd is-' + d.state + (d.isToday ? ' is-today' : '')}>
                <span>{d.isToday ? 'Nay' : d.label}</span>
                <i>{d.state === 'done' ? <Check /> : d.state === 'freeze' ? '❄' : ''}</i>
              </div>
            ))}
          </div>
          <div className="td-next">🎁 Mốc {ms.target} ngày<div className="td-bar"><i style={{ width: `${Math.round(ms.progress * 100)}%` }} /></div><b>còn {ms.left}</b></div>
        </div>

        <div className="td-wk">
          <span>Tuần này <b>{goal.done}/{goal.goal}</b> buổi</span>
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
      </div>
    </section>
  );
}
