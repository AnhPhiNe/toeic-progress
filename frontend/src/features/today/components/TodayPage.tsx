import { useEffect, useMemo, useState } from 'react';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { UserProfile } from '@/shared/types';
import { buildMilestones, estimateMilestones } from '@/shared/domain/milestones';
import { streakWeek, weeklyGoal } from '@/shared/domain/streakWeek';
import { daysUntil, forecast, journeyPoints } from '@/features/journey/lib/scoreJourney';
import { Soc } from '@/shared/ui/soc/Soc';
import { socLook } from '@/features/awards/lib/outfit';
import { pickTodayTasks, type TodayTask } from '../lib/todayTasks';
import { addHabit, clampWeeklyGoal, extraStudyDates, removeHabit, toggleHabit } from '../lib/habits';
import { countWord } from '../lib/stairsGeometry';
import { PREVIEW_TARGET, hasChosenGoal, profileWithGoal, todayMode } from '../lib/goalSetup';
import { FirstDayPanel } from './FirstDayPanel';
import { GoalCard } from './GoalCard';
import { StairsScene } from './StairsScene';
import { TodayCard } from './TodayCard';
import { Confetti, GreetSoc, SocBubble } from './welcome/Welcome';
import { useWelcome } from './welcome/useWelcome';
import { GoalPopover } from './goal/GoalEditor';
import { useGoalEdit } from './goal/useGoalEdit';
import { CELEBRATED_KEY } from '../lib/goalEdit';
import './today.css';

interface Props {
  bundle: DataBundle;
  today: string;
  onStartTask: (task: TodayTask) => void;
  onPracticeMore: () => void;
  onOpenSessionLogger: () => void;
  /** Unused since the goal and exam date are edited in place (kept so App's call site needs no change). */
  onOpenSettings?: () => void;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
}

const SKIP_KEY = 'rd_task_skip_v1';

/** Suggested tasks the learner set aside for today (per device; they come back tomorrow if still needed). */
function useSkippedToday(today: string) {
  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(SKIP_KEY) ?? 'null'); return v && v.date === today && Array.isArray(v.ids) ? v.ids as string[] : []; } catch { return []; }
  };
  const [ids, setIds] = useState<string[]>(read);
  useEffect(() => { setIds(read()); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = (id: string) => setIds(prev => {
    const next = prev.includes(id) ? prev : [...prev, id];
    try { localStorage.setItem(SKIP_KEY, JSON.stringify({ date: today, ids: next })); } catch { /* storage blocked */ }
    return next;
  });
  return [ids, skip] as const;
}

export function TodayPage({ bundle, today, onStartTask, onPracticeMore, onOpenSessionLogger, onUpdateProfile }: Props) {
  const { profile, sessions, mistakes } = bundle;
  const target = profile.targetScore;
  const plan = useMemo(() => buildMilestones(sessions, target), [sessions, target]);
  const [skipped, skipTask] = useSkippedToday(today);
  const tasks = useMemo(() => pickTodayTasks(bundle, today, { off: profile.suggestOff }).filter(t => !skipped.includes(t.id)), [bundle, today, skipped, profile.suggestOff]);
  const extra = useMemo(() => extraStudyDates(profile, mistakes), [profile, mistakes]);
  const week = useMemo(() => streakWeek(bundle, today, extra), [bundle, today, extra]);
  const goal = useMemo(() => weeklyGoal(bundle, today, clampWeeklyGoal(profile.weeklyGoalDays), extra), [bundle, today, profile.weeklyGoalDays, extra]);
  const ahead = useMemo(() => {
    const f = forecast(journeyPoints(sessions), target, profile.examDate, today);
    return f && f.kind === 'rising' ? f.testsAhead : null;
  }, [sessions, target, profile.examDate, today]);
  const examIn = daysUntil(profile.examDate, today);
  const gear = useMemo(() => socLook(bundle, today).worn, [bundle, today]);

  const climbing = plan.status === 'empty' ? null : plan;
  // No test yet: pick a goal (choose), see the estimated stairs (ready), or climb the real ones.
  const chosen = hasChosenGoal(profile);
  const [editingGoal, setEditingGoal] = useState(() => !hasChosenGoal(profile));
  const mode = todayMode({ hasTests: climbing !== null, chosen, editing: editingGoal });
  const estimate = useMemo(() => estimateMilestones(chosen ? target : PREVIEW_TARGET), [chosen, target]);
  const welcome = useWelcome({ hasTests: climbing !== null, chosen });
  const goalEdit = useGoalEdit({ profile, sessions, today, onUpdateProfile });
  const canEdit = mode !== 'choose' && !welcome.greeting;
  const firstTask = tasks.find(item => !item.done) ?? null;
  const blocks = climbing ? climbing.steps.length - 1 : 0;
  const remaining = climbing ? blocks - climbing.currentIndex : 0;

  // One full-page celebration per goal, the first time it is reached.
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (plan.status !== 'done') return;
    try {
      if (localStorage.getItem(CELEBRATED_KEY) === String(target)) return;
      localStorage.setItem(CELEBRATED_KEY, String(target));
    } catch { /* Without storage the celebration may repeat; harmless. */ }
    setCelebrate(true);
  }, [plan.status, target]);

  const scored = useMemo(() => sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR' && Number.isFinite(s.totalScore))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')), [sessions]);

  return (
    <div className={'rd td-page' + (welcome.fresh ? ' is-welcome' : '') + (welcome.greeting ? ' is-greeting' : '') + (mode !== 'choose' && goalEdit.pastTip ? ' has-pasttip' : '')}>
      <StairsScene
        key={welcome.grew ? 'grown' : 'plain'}
        lit={welcome.lit}
        plan={climbing}
        target={chosen || climbing ? target : PREVIEW_TARGET}
        testsAhead={ahead}
        cupLabel={chosen || climbing ? undefined : '?'}
        banner={mode === 'choose' ? (chosen ? `Mục tiêu ${target}` : 'Chọn mục tiêu') : undefined}
        gear={gear}
        onEditGoal={canEdit ? goalEdit.open : undefined}
        added={goalEdit.grow}
      />

      {mode === 'choose' && (
        <GoalCard
          target={chosen ? target : null}
          examDate={profile.examDate}
          today={today}
          onPick={value => onUpdateProfile(p => profileWithGoal(p, value))}
          onExamDate={date => onUpdateProfile(p => ({ ...p, examDate: date }))}
          onLog={onOpenSessionLogger}
          greeting={welcome.greeting}
          onDone={chosen ? () => { setEditingGoal(false); welcome.confirm(); } : undefined}
        />
      )}

      {mode !== 'choose' && <header className={'td-hd' + (climbing ? '' : ' is-ready')}>
        {climbing ? <>
          <div className="td-row">
            <div className="td-dots" aria-hidden="true">
              {climbing.steps.map((_, i) => <i key={i} className={i < climbing.currentIndex ? 'is-on' : i === climbing.currentIndex ? 'is-cur' : ''} />)}
            </div>
            <small>{plan.status === 'done' ? `ĐÃ CHẠM ${target}` : `BẬC ${climbing.currentIndex + 1}/${blocks + 1} · CÒN ${target - climbing.best} ĐIỂM`}</small>
          </div>
          {plan.status === 'done'
            ? <><h1>Bạn đã <em>chạm tay vào cúp</em></h1><p>Điểm cao nhất {climbing.best} ·<button type="button" className="td-edit" onClick={e => goalEdit.open(e.currentTarget)}>Đặt mục tiêu mới</button></p></>
            : <><h1>{countWord(remaining)} bậc nữa là <em>chạm tay vào cúp</em></h1><p>Mỗi bậc {climbing.step} điểm · rê chuột để xem ngày đạt</p></>}
        </> : <>
          <div className="td-row">
            <div className="td-dots" aria-hidden="true">{estimate.values.map((_, i) => <i key={i} />)}</div>
            <small>{estimate.values.length} BẬC ƯỚC LƯỢNG · {estimate.values[0]} → {target}</small>
          </div>
          <h1>Cầu thang lên <em>cúp {target}</em><br />đã dựng xong</h1>
          <p>Ghi đề đầu tiên để Sóc đặt bạn lên đúng bậc.<button type="button" className="td-edit" onClick={e => goalEdit.open(e.currentTarget)}>Sửa mục tiêu</button></p>
        </>}
      </header>}

      <aside className="td-panel">
        {mode !== 'choose' && <div className="td-chips">
          {goalEdit.exam.kind === 'past'
            ? <button type="button" className="is-exam-past" onClick={e => goalEdit.open(e.currentTarget)}>Đã qua ngày thi · Cập nhật</button>
            : examIn !== null
              ? <button type="button" onClick={e => goalEdit.open(e.currentTarget)}>{examIn === 0 ? 'Thi hôm nay!' : `Thi sau ${examIn} ngày`}</button>
              : <button type="button" onClick={e => goalEdit.open(e.currentTarget)}>📅 Đặt ngày thi</button>}
        </div>}
        {climbing ? <TodayCard
          gear={gear}
          tasks={tasks}
          habits={profile.habits ?? []}
          today={today}
          week={week}
          goal={goal}
          onStartTask={onStartTask}
          onSkipTask={skipTask}
          onPracticeMore={onPracticeMore}
          onToggleHabit={id => onUpdateProfile(p => toggleHabit(p, id, today))}
          onAddHabit={title => onUpdateProfile(p => addHabit(p, title, crypto.randomUUID()))}
          onRemoveHabit={id => onUpdateProfile(p => removeHabit(p, id))}
          suggestOff={profile.suggestOff ?? []}
          onToggleSuggest={kind => onUpdateProfile(p => { const off = p.suggestOff ?? []; return { ...p, suggestOff: off.includes(kind) ? off.filter(k => k !== kind) : [...off, kind] }; })}
          onSetWeeklyGoal={days => onUpdateProfile(p => ({ ...p, weeklyGoalDays: clampWeeklyGoal(days) }))}
        /> : <FirstDayPanel task={firstTask} firstStep={estimate.values[0]} week={week} onStartTask={onStartTask} />}
      </aside>

      {welcome.greeting && <GreetSoc size={190} className="td-greet" />}
      {welcome.leapBubble && mode === 'ready' && <SocBubble tail="down" className="td-leap">Ghi <b>đề đầu tiên</b> là mình leo bậc 1!</SocBubble>}
      {welcome.confetti && <Confetti className="td-wl-conf" />}
      {goalEdit.said && <SocBubble tail="down" className="td-said">{goalEdit.said}</SocBubble>}
      {mode !== 'choose' && goalEdit.pastTip && (
        <SocBubble tail="up" className="td-pasttip">
          Thi xong chưa? <button type="button" className="ge-tipbtn" onClick={() => { goalEdit.hidePastTip(); onOpenSessionLogger(); }}>Ghi điểm thật</button> hoặc đặt ngày mới.
        </SocBubble>
      )}
      {goalEdit.isOpen && (
        <GoalPopover anchor={goalEdit.anchor} sessions={sessions} current={target} initial={target} best={goalEdit.best}
          examDate={profile.examDate} today={today} onSave={goalEdit.save} onClose={goalEdit.close} />
      )}

      {celebrate && climbing && (
        <div className="td-cele" role="dialog" aria-modal="true" aria-label={`Bạn đã chạm ${target}`}>
          <div className="td-rays2" aria-hidden="true" />
          {Array.from({ length: 60 }, (_, i) => (
            <i key={i} className="td-confp" aria-hidden="true" style={{ left: `${(i * 37) % 100}%`, background: ['#ffd766', '#ff7a9c', '#46b35a', '#1c8fe3', '#a78bfa'][i % 5], animationDuration: `${2 + (i % 7) * 0.3}s`, animationDelay: `${(i % 11) * 0.11}s` }} />
          ))}
          <Soc state="cheerD" size={130} className="td-cele-soc is-l" />
          <Soc state="cheerD" size={130} className="td-cele-soc is-r" />
          <div className="td-cele-box">
            <svg className="td-bigcup" viewBox="-110 -110 220 190" aria-hidden="true">
              <defs><linearGradient id="tdCup2" x1="0" x2="1"><stop offset="0" stopColor="#ffe9a3" /><stop offset=".45" stopColor="#ffc83d" /><stop offset="1" stopColor="#e09a12" /></linearGradient></defs>
              <path d="M-64 -64 C-104 -64 -100 -10 -58 -16" fill="none" stroke="#e8a516" strokeWidth="11" strokeLinecap="round" /><path d="M64 -64 C104 -64 100 -10 58 -16" fill="none" stroke="#d99a00" strokeWidth="11" strokeLinecap="round" />
              <path d="M-64 -76 H64 C64 -12 32 30 0 32 C-32 30 -64 -12 -64 -76Z" fill="url(#tdCup2)" /><ellipse cx="0" cy="-76" rx="64" ry="9" fill="#ffe9a3" /><rect x="-12" y="28" width="24" height="22" fill="url(#tdCup2)" /><rect x="-44" y="48" width="88" height="24" rx="7" fill="#2f3a33" />
              <text x="0" y="66" fontWeight="900" fontSize="17" fill="#ffe58f" textAnchor="middle">{climbing.best}</text>
              <path d="M0 -62 l7 14 15 2 -11 11 3 15 -14 -7 -14 7 3 -15 -11 -11 15 -2Z" fill="#fff" />
            </svg>
            <h1>Bạn đã chạm {target}!</h1>
            <p>Từ {scored[0]?.totalScore} lên {climbing.best} sau {scored.length} đề.</p>
            <div className="td-cele-bt">
              <button type="button" className="rd-btn" onClick={() => { setCelebrate(false); goalEdit.open(); }}>Đặt mục tiêu mới</button>
              <button type="button" className="rd-btn rd-btn--white" onClick={() => setCelebrate(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
