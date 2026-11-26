import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { PhoneAvatarButton, usePhoneShell } from '@/app/components/phone';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { NavTabId, SuggestedTask, UserProfile } from '@/shared/types';
import { suggestionsToday, toggleSuggestion, withoutRepeatedTimers } from '../lib/suggestedTasks';
import type { SocLook } from '@/features/awards/lib/outfit';
import { STAIR_COUNT } from '@/shared/domain/milestones';
import { doneDates, streakWeek, weeklyGoal } from '@/shared/domain/streakWeek';
import { lastDoneDate, todaySocMood, useWake } from '../lib/socMood';
import { daysUntil } from '@/features/journey/lib/scoreJourney';
import { pickTodayTasks, type TodayTask } from '../lib/todayTasks';
import { clampWeeklyGoal, extraStudyDates } from '../lib/habits';
import { PREVIEW_TARGET, TARGET_PRESETS, hasChosenGoal, profileWithGoal, todayMode } from '../lib/goalSetup';
import { buildPhoneItems } from '../lib/phoneToday';
import { useSkippedToday } from '../lib/useSkippedToday';
import { RoadScene, RoadSign } from './RoadScene';
import { buildRoadModel } from '../lib/roadModel';
import { TaskPanel } from './phone/TaskPanel';
import { StreakSheet } from './phone/StreakSheet';
import { Confetti, GreetSoc, SocBubble } from './welcome/Welcome';
import { useWelcome } from './welcome/useWelcome';
import { CoatPanel } from './welcome/CoatStep';
import { Soc } from '@/shared/ui/soc/Soc';
import { GoalSheet } from './goal/GoalEditor';
import { useGoalEdit } from './goal/useGoalEdit';
import './today.css';
import './phone/todayPhone.css';

/**
 * Hôm nay on phones: the stairs-to-trophy scene fills the screen, a fixed bottom panel holds the next task,
 * one summary row (expands in place) and the streak / count / "+ Thêm việc" footer.
 * Design: design/previews/mock-phone-today-c.html. Logic is shared with the desktop TodayPage (lib/).
 */
export interface TodayPhoneProps {
  bundle: DataBundle;
  today: string;
  onStartTask: (task: TodayTask) => void;
  /** A task added from Sóc's advice: the Part timer or that test in Sổ tay. */
  onStartSuggestion: (task: SuggestedTask) => void;
  onPracticeMore: () => void;
  /** Opens the score logger (full test). */
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
  /** Current streak in days. */
  streak: number;
  /** Mistake cards due today. */
  dueMistakesCount: number;
  soc: SocLook;
  /** Unused since the trophy opens the goal editor instead of Hành trình (kept so App's call site needs no change). */
  onNavigate?: (tab: NavTabId) => void;
  /** Opens a logged test's detail (Hành trình) from its flag on the road. */
  onOpenTest?: (id: string) => void;
}

interface Size { w: number; h: number; head: number; panel: number }

export function TodayPhone({ bundle, today, onStartTask, onStartSuggestion, onPracticeMore, onOpenSessionLogger, onOpenSettings, onUpdateProfile, streak, soc, onOpenTest }: TodayPhoneProps) {
  const { profile, sessions, mistakes } = bundle;
  const shell = usePhoneShell();
  const target = profile.targetScore;
  const chosen = hasChosenGoal(profile);
  const road = useMemo(() => buildRoadModel(sessions, target, profile.examDate, today, chosen ? target : PREVIEW_TARGET), [sessions, target, profile.examDate, today, chosen]);
  const plan = road.plan;
  const climbing = plan.status === 'empty' ? null : plan;
  const [editingGoal, setEditingGoal] = useState(() => !hasChosenGoal(profile));
  const mode = todayMode({ hasTests: climbing !== null, chosen, editing: editingGoal });
  const welcome = useWelcome({ hasTests: climbing !== null, chosen });
  const shownTarget = chosen || climbing ? target : PREVIEW_TARGET;

  const [skipped, skipTask] = useSkippedToday(today);
  const suggestions = useMemo(() => suggestionsToday(profile, bundle.pacingRuns, today), [profile, bundle.pacingRuns, today]);
  const tasks = useMemo(() => withoutRepeatedTimers(pickTodayTasks(bundle, today, { off: profile.suggestOff }).filter(t => !skipped.includes(t.id)), suggestions), [bundle, today, skipped, profile.suggestOff, suggestions]);
  const items = useMemo(() => buildPhoneItems(tasks, [], today, suggestions), [tasks, today, suggestions]);
  const extra = useMemo(() => extraStudyDates(profile, mistakes), [profile, mistakes]);
  const week = useMemo(() => streakWeek(bundle, today, extra), [bundle, today, extra]);
  const lastDone = useMemo(() => lastDoneDate(doneDates(bundle, today, extra), today), [bundle, today, extra]);
  const [rest, wake] = useWake(todaySocMood({ today, lastDone, current: week.current, longest: week.longest }));
  const goal = useMemo(() => weeklyGoal(bundle, today, clampWeeklyGoal(profile.weeklyGoalDays), extra), [bundle, today, profile.weeklyGoalDays, extra]);
  const examIn = daysUntil(profile.examDate, today);
  const goalEdit = useGoalEdit({ profile, sessions, today, onUpdateProfile });
  const canEdit = mode !== 'choose' && !welcome.greeting;
  // First visit: after the goal, one compact step to pick Sóc's coat and name (skippable), then the confetti.
  const [coatStep, setCoatStep] = useState(false);
  const finishGoal = () => { setCoatStep(false); setEditingGoal(false); welcome.confirm(); };

  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<'streak' | null>(null);

  // Scene size, heading bottom and panel height: the stairs are recomputed for what is left between them.
  const root = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<Size>({ w: 390, h: 640, head: 190, panel: 260 });
  useLayoutEffect(() => {
    const measure = () => {
      const r = root.current, hd = headRef.current, pn = panelRef.current;
      if (!r) return;
      const next = { w: r.clientWidth, h: r.clientHeight, head: hd ? hd.offsetTop + hd.offsetHeight : 190, panel: pn ? pn.offsetHeight : 260 };
      setSize(prev => (prev.w === next.w && prev.h === next.h && prev.head === next.head && prev.panel === next.panel ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    for (const el of [root.current, headRef.current, panelRef.current]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [mode, expanded, welcome.greeting, coatStep]);
  useEffect(() => { if (items.restOpen === 0) setExpanded(false); }, [items.restOpen]);

  const finished = plan.status === 'done';
  // The road fills the band between the heading and the task panel.
  const base = Math.min(size.h - 20, size.h - size.panel - 10);

  const fallback = mode === 'ready'
    ? { kicker: 'BƯỚC ĐẦU TIÊN', title: 'Ghi đề đầu tiên', button: 'Ghi đề', onClick: onOpenSessionLogger }
    : { kicker: 'HÔM NAY', title: 'Không có việc đến hạn', button: 'Luyện tập', onClick: onPracticeMore };

  return (
    <div className={'rd tp' + (welcome.fresh ? ' is-welcome' : '') + (canEdit && goalEdit.pastTip ? ' has-pasttip' : '')} ref={root}>
      <RoadScene
        variant="phone"
        steps={road.steps} cur={road.cur} best={road.best} done={road.done} estimate={road.estimate} lit={welcome.lit}
        proj={road.proj} tests={road.tests} walkFrom={road.walkFrom}
        target={shownTarget} cupLabel={chosen || climbing ? undefined : '?'} gear={soc.worn} rest={rest} onWake={wake}
        top={size.head + 10} base={base}
        onEditGoal={canEdit ? el => goalEdit.open(el as SVGElement) : undefined}
        onOpenTest={onOpenTest}
        hidden={welcome.greeting || coatStep}
      />

      <header className="tp-top">
        {!canEdit
          ? (examIn !== null
            ? <span className="tp-chip is-exam">{examIn === 0 ? 'Thi hôm nay!' : `Thi sau ${examIn} ngày`}</span>
            : <button type="button" className="tp-chip is-exam" onClick={onOpenSettings}><CalendarDays size={15} aria-hidden="true" />Đặt ngày thi</button>)
          : goalEdit.exam.kind === 'past'
            ? <button type="button" className="tp-chip is-exam is-exam-past" onClick={e => goalEdit.open(e.currentTarget)}>Đã qua ngày thi · Cập nhật</button>
            : <button type="button" className="tp-chip is-exam" onClick={e => goalEdit.open(e.currentTarget)}>
                {examIn !== null ? (examIn === 0 ? 'Thi hôm nay!' : `Thi sau ${examIn} ngày`) : <><CalendarDays size={15} aria-hidden="true" />Đặt ngày thi</>}
              </button>}
        <PhoneAvatarButton />
      </header>
      {canEdit && goalEdit.pastTip && (
        <SocBubble tail="up" className="tp-pasttip">
          Thi xong chưa? <button type="button" className="ge-tipbtn" onClick={() => { goalEdit.hidePastTip(); onOpenSessionLogger(); }}>Ghi điểm thật</button> hoặc đặt ngày mới.
        </SocBubble>
      )}

      <div className="tp-head" ref={headRef}>
        {welcome.greeting || coatStep
          ? <div className="tp-prog"><small className="tp-kick">{coatStep ? 'SÓC CỦA BẠN' : 'LẦN ĐẦU GẶP NHAU'}</small></div>
          : welcome.lit && mode === 'ready'
            ? <div className="tp-prog"><small className="tp-kick">MỤC TIÊU {target}</small></div>
            : <div className="tp-prog">
          <span className="tp-pdots" aria-hidden="true">
            {Array.from({ length: STAIR_COUNT }, (_, i) => <i key={i} className={climbing ? (finished || i < climbing.currentIndex ? 'is-on' : i === climbing.currentIndex ? 'is-cur' : '') : ''} />)}
          </span>
          <small>{climbing
            ? (finished ? `ĐÃ CHẠM ${target}` : `BẬC ${climbing.currentIndex + 1}/${STAIR_COUNT}`)
            : `${STAIR_COUNT} BẬC ƯỚC LƯỢNG · ${road.steps[0].value} → ${shownTarget}`}</small>
        </div>}
        {welcome.greeting ? <h1>Chào bạn!<br /><em>Mình là Sóc</em></h1> : coatStep ? <h1>Sóc của bạn<br /><em>trông thế nào?</em></h1> : climbing
          ? (finished
            ? <h1>Bạn đã<br /><em>chạm tay vào cúp</em></h1>
            : <><h1>Còn {target - climbing.best} điểm là<br /><em>chạm tay vào cúp</em></h1><RoadSign text={road.sign} late={road.late} className="tp-sign" /></>)
          : mode === 'choose'
            ? <h1>Bạn muốn lên<br /><em>cúp bao nhiêu?</em></h1>
            : <h1>Đường tới<br /><em>cúp {target}</em> đã sẵn sàng</h1>}
      </div>

      {mode === 'choose' && coatStep ? (
        <CoatPanel ref={panelRef} profile={profile} onUpdateProfile={onUpdateProfile} onDone={finishGoal} />
      ) : mode === 'choose' ? (
        <section ref={panelRef} className="tp-panel" aria-label="Chọn mục tiêu">
          <h2 className="tp-gh">Mục tiêu điểm TOEIC</h2>
          <div className="tp-presets" role="group" aria-label="Mục tiêu điểm">
            {TARGET_PRESETS.map(v => (
              <button key={v} type="button" aria-pressed={chosen && target === v} className={'tp-preset' + (chosen && target === v ? ' is-on' : '')}
                onClick={() => onUpdateProfile(p => profileWithGoal(p, v))}>{v}</button>
            ))}
          </div>
          <button type="button" className="tp-go tp-go--wide" disabled={!chosen} onClick={() => (welcome.fresh ? setCoatStep(true) : finishGoal())}>{chosen ? `Xong, mục tiêu ${target}` : 'Chọn một mục tiêu'}</button>
          <div className="tp-ft is-links">
            <button type="button" className="tp-add" onClick={onOpenSettings}>Số khác trong Cài đặt</button>
            <button type="button" className="tp-add" onClick={onOpenSessionLogger}>Ghi đề đã làm</button>
          </div>
        </section>
      ) : (
        <TaskPanel
          ref={panelRef} items={items} fallback={fallback} streak={streak} weekDone={goal.done} weekGoal={goal.goal}
          expanded={expanded} gear={soc.worn}
          onToggleExpanded={() => setExpanded(v => !v)}
          onStartTask={onStartTask} onSkipTask={skipTask}
          onStartSuggestion={onStartSuggestion}
          onToggleSuggestion={id => onUpdateProfile(p => toggleSuggestion(p, id, today))}
          onPracticeMore={onPracticeMore}
          onOpenStreak={() => setSheet('streak')}
          league={shell.league ? { text: shell.league.chip, short: shell.league.chipShort, aria: shell.league.chipAria, onOpen: () => shell.goTab('league') } : undefined}
        />
      )}

      {coatStep && <div className="tp-coat-stage" style={{ top: size.head + 6, bottom: size.panel + 12 }}><Soc state="hi" size={Math.min(190, Math.max(110, size.h - size.head - size.panel - 40))} /></div>}
      {welcome.greeting && <GreetSoc size={150} style={{ left: 0, right: 0, top: size.head + 6, bottom: size.panel + 12 }} />}
      {welcome.leapBubble && mode === 'ready' && <SocBubble tail="down" className="tp-leap" style={{ bottom: size.panel + 120 }}>Ghi <b>đề đầu tiên</b> là mình leo bậc 1!</SocBubble>}
      {welcome.confetti && <Confetti style={{ top: size.head + 60 }} />}
      {goalEdit.said && <SocBubble tail="up" className="tp-said" style={{ top: size.head + 10 }}>{goalEdit.said}</SocBubble>}

      {goalEdit.isOpen && (
        <GoalSheet sessions={sessions} current={target} initial={target} best={goalEdit.best}
          examDate={profile.examDate} today={today} onSave={goalEdit.save} onClose={goalEdit.close} />
      )}

      {sheet === 'streak' && (
        <StreakSheet week={week} goal={goal} broke={rest === 'sad'} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
