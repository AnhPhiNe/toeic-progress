import { useEffect, useMemo, useState } from 'react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { SuggestedTask, UserProfile } from '@/shared/types';
import { suggestionsToday, toggleSuggestion, withoutRepeatedTimers } from '../lib/suggestedTasks';
import { STAIR_COUNT, estimateMilestones } from '@/shared/domain/milestones';
import { doneDates, streakWeek, weeklyGoal } from '@/shared/domain/streakWeek';
import { lastDoneDate, todaySocMood, useWake } from '../lib/socMood';
import { daysUntil } from '@/features/journey/lib/scoreJourney';
import { Soc } from '@/shared/ui/soc/Soc';
import { socLook } from '@/features/awards/lib/outfit';
import { pickTodayTasks, type TodayTask } from '../lib/todayTasks';
import { clampWeeklyGoal, extraStudyDates } from '../lib/habits';
import { PREVIEW_TARGET, hasChosenGoal, profileWithGoal, todayMode } from '../lib/goalSetup';
import { buildRoadModel } from '../lib/roadModel';
import { FirstDayPanel } from './FirstDayPanel';
import { GoalCard } from './GoalCard';
import { RoadScene, RoadSign } from './RoadScene';
import { TodayCard } from './TodayCard';
import { Confetti, GreetSoc, SocBubble } from './welcome/Welcome';
import { useWelcome } from './welcome/useWelcome';
import { CoatCard } from './welcome/CoatStep';
import { GoalPopover } from './goal/GoalEditor';
import { useGoalEdit } from './goal/useGoalEdit';
import { celebratedKey } from '../lib/goalEdit';
import { useSkippedToday } from '../lib/useSkippedToday';
import './today.css';

interface Props {
  bundle: DataBundle;
  today: string;
  onStartTask: (task: TodayTask) => void;
  /** A task added from Sóc's advice: the Part timer or that test in Sổ tay. */
  onStartSuggestion: (task: SuggestedTask) => void;
  onPracticeMore: () => void;
  onOpenSessionLogger: () => void;
  /** Unused since the goal and exam date are edited in place (kept so App's call site needs no change). */
  onOpenSettings?: () => void;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
  /** Opens a logged test's detail (Hành trình) from its flag on the road. */
  onOpenTest?: (id: string) => void;
}

export function TodayPage({ bundle, today, onStartTask, onStartSuggestion, onPracticeMore, onOpenSessionLogger, onUpdateProfile, onOpenTest }: Props) {
  const { profile, sessions, mistakes } = bundle;
  const target = profile.targetScore;
  const [skipped, skipTask] = useSkippedToday(today);
  const suggestions = useMemo(() => suggestionsToday(profile, bundle.pacingRuns, today), [profile, bundle.pacingRuns, today]);
  const tasks = useMemo(() => withoutRepeatedTimers(pickTodayTasks(bundle, today, { off: profile.suggestOff }).filter(t => !skipped.includes(t.id)), suggestions), [bundle, today, skipped, profile.suggestOff, suggestions]);
  const extra = useMemo(() => extraStudyDates(profile, mistakes), [profile, mistakes]);
  const week = useMemo(() => streakWeek(bundle, today, extra), [bundle, today, extra]);
  const lastDone = useMemo(() => lastDoneDate(doneDates(bundle, today, extra), today), [bundle, today, extra]);
  const [rest, wake] = useWake(todaySocMood({ today, lastDone, current: week.current, longest: week.longest }));
  const goal = useMemo(() => weeklyGoal(bundle, today, clampWeeklyGoal(profile.weeklyGoalDays), extra), [bundle, today, profile.weeklyGoalDays, extra]);
  const examIn = daysUntil(profile.examDate, today);
  const gear = useMemo(() => socLook(bundle, today).worn, [bundle, today]);

  // No test yet: pick a goal (choose), see the estimated road (ready), or walk the real one.
  const chosen = hasChosenGoal(profile);
  const road = useMemo(() => buildRoadModel(sessions, target, profile.examDate, today, chosen ? target : PREVIEW_TARGET), [sessions, target, profile.examDate, today, chosen]);
  const plan = road.plan;
  const climbing = plan.status === 'empty' ? null : plan;
  const [editingGoal, setEditingGoal] = useState(() => !hasChosenGoal(profile));
  const mode = todayMode({ hasTests: climbing !== null, chosen, editing: editingGoal });
  const estimate = useMemo(() => estimateMilestones(chosen ? target : PREVIEW_TARGET), [chosen, target]);
  const welcome = useWelcome({ hasTests: climbing !== null, chosen });
  const goalEdit = useGoalEdit({ profile, sessions, today, onUpdateProfile });
  const canEdit = mode !== 'choose' && !welcome.greeting;
  // First visit: after the goal, one compact step to pick Sóc's coat and name (skippable), then the confetti.
  const [coatStep, setCoatStep] = useState(false);
  const finishGoal = () => { setCoatStep(false); setEditingGoal(false); welcome.confirm(); };
  const firstTask = tasks.find(item => !item.done) ?? null;
  const stairDots = Array.from({ length: STAIR_COUNT }, (_, i) => i);

  // One full-page celebration per goal, the first time it is reached.
  const [celebrate, setCelebrate] = useState(false);
  const celebrateRef = useModalA11y(celebrate && climbing !== null, () => setCelebrate(false));
  useEffect(() => {
    if (plan.status !== 'done') return;
    try {
      const key = celebratedKey();
      if (localStorage.getItem(key) === String(target)) return;
      localStorage.setItem(key, String(target));
    } catch { /* Without storage the celebration may repeat; harmless. */ }
    setCelebrate(true);
  }, [plan.status, target]);

  const scored = useMemo(() => sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR' && Number.isFinite(s.totalScore))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')), [sessions]);

  return (
    <div className={'rd td-page' + (welcome.fresh ? ' is-welcome' : '') + (welcome.greeting ? ' is-greeting' : '') + (mode !== 'choose' && goalEdit.pastTip ? ' has-pasttip' : '')}>
      <RoadScene
        key={welcome.grew ? 'grown' : 'plain'}
        variant="desk"
        lit={welcome.lit}
        steps={road.steps}
        cur={road.cur}
        best={road.best}
        done={road.done}
        estimate={road.estimate}
        proj={road.proj}
        tests={road.tests}
        walkFrom={road.walkFrom}
        target={chosen || climbing ? target : PREVIEW_TARGET}
        cupLabel={chosen || climbing ? undefined : '?'}
        gear={gear}
        rest={rest}
        onWake={wake}
        onEditGoal={canEdit ? el => goalEdit.open(el as SVGElement) : undefined}
        onOpenTest={onOpenTest}
        hidden={welcome.greeting}
      />

      {mode === 'choose' && coatStep && <CoatCard profile={profile} onUpdateProfile={onUpdateProfile} onDone={finishGoal} />}
      {mode === 'choose' && !coatStep && (
        <GoalCard
          target={chosen ? target : null}
          examDate={profile.examDate}
          today={today}
          onPick={value => onUpdateProfile(p => profileWithGoal(p, value))}
          onExamDate={date => onUpdateProfile(p => ({ ...p, examDate: date }))}
          onLog={onOpenSessionLogger}
          greeting={welcome.greeting}
          onDone={chosen ? () => (welcome.fresh ? setCoatStep(true) : finishGoal()) : undefined}
        />
      )}

      {mode !== 'choose' && <header className={'td-hd' + (climbing ? '' : ' is-ready')}>
        {climbing ? <>
          <div className="td-row">
            <div className="td-dots" aria-hidden="true">
              {stairDots.map(i => <i key={i} className={i < climbing.currentIndex ? 'is-on' : i === climbing.currentIndex ? 'is-cur' : ''} />)}
            </div>
            <small>{plan.status === 'done' ? `ĐÃ CHẠM ${target}` : `BẬC ${climbing.currentIndex + 1}/${STAIR_COUNT}`}</small>
          </div>
          {plan.status === 'done'
            ? <><h1>Bạn đã<br /><em>chạm tay vào cúp</em></h1><p>Điểm cao nhất {climbing.best} ·<button type="button" className="td-edit" onClick={e => goalEdit.open(e.currentTarget)}>Đặt mục tiêu mới</button></p></>
            : <><h1>Còn {target - climbing.best} điểm là<br /><em>chạm tay vào cúp</em></h1><RoadSign text={road.sign} late={road.late} /></>}
        </> : <>
          <div className="td-row">
            <div className="td-dots" aria-hidden="true">{stairDots.map(i => <i key={i} />)}</div>
            <small>{STAIR_COUNT} BẬC ƯỚC LƯỢNG · {estimate.values[0]} → {target}</small>
          </div>
          <h1>Đường tới <em>cúp {target}</em><br />đã sẵn sàng</h1>
          <p>Ghi đề đầu tiên để Sóc đặt bạn lên đúng chặng.<button type="button" className="td-edit" onClick={e => goalEdit.open(e.currentTarget)}>Sửa mục tiêu</button></p>
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
          rest={rest}
          onWake={wake}
          tasks={tasks}
          today={today}
          week={week}
          goal={goal}
          onStartTask={onStartTask}
          suggestions={suggestions}
          onStartSuggestion={onStartSuggestion}
          onToggleSuggestion={id => onUpdateProfile(p => toggleSuggestion(p, id, today))}
          onSkipTask={skipTask}
          onPracticeMore={onPracticeMore}
        /> : <FirstDayPanel task={firstTask} firstStep={estimate.values[0]} week={week} onStartTask={onStartTask} hideCta={mode === 'choose'} />}
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
          <div ref={celebrateRef} tabIndex={-1} className="td-cele-box">
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
