import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { PhoneAvatarButton } from '@/app/components/phone';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { NavTabId, UserProfile } from '@/shared/types';
import type { SocLook } from '@/features/awards/lib/outfit';
import { buildMilestones, estimateMilestones } from '@/shared/domain/milestones';
import { streakWeek, weeklyGoal } from '@/shared/domain/streakWeek';
import { daysUntil } from '@/features/journey/lib/scoreJourney';
import { pickTodayTasks, type TodayTask } from '../lib/todayTasks';
import { addHabit, clampWeeklyGoal, extraStudyDates, removeHabit, toggleHabit } from '../lib/habits';
import { countWord } from '../lib/stairsGeometry';
import { PREVIEW_TARGET, TARGET_PRESETS, hasChosenGoal, profileWithGoal, todayMode } from '../lib/goalSetup';
import { buildPhoneItems } from '../lib/phoneToday';
import { useSkippedToday } from '../lib/useSkippedToday';
import { PhoneStairs, type StairTest } from './phone/PhoneStairs';
import { TaskPanel } from './phone/TaskPanel';
import { StreakSheet } from './phone/StreakSheet';
import { AddHabitSheet } from './phone/AddHabitSheet';
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
  onNavigate: (tab: NavTabId) => void;
}

interface Size { w: number; h: number; head: number; panel: number }

export function TodayPhone({ bundle, today, onStartTask, onPracticeMore, onOpenSessionLogger, onOpenSettings, onUpdateProfile, streak, soc, onNavigate }: TodayPhoneProps) {
  const { profile, sessions, mistakes } = bundle;
  const target = profile.targetScore;
  const plan = useMemo(() => buildMilestones(sessions, target), [sessions, target]);
  const climbing = plan.status === 'empty' ? null : plan;
  const chosen = hasChosenGoal(profile);
  const [editingGoal, setEditingGoal] = useState(() => !hasChosenGoal(profile));
  const mode = todayMode({ hasTests: climbing !== null, chosen, editing: editingGoal });
  const shownTarget = chosen || climbing ? target : PREVIEW_TARGET;
  const estimate = useMemo(() => estimateMilestones(shownTarget), [shownTarget]);

  const [skipped, skipTask] = useSkippedToday(today);
  const tasks = useMemo(() => pickTodayTasks(bundle, today, { off: profile.suggestOff }).filter(t => !skipped.includes(t.id)), [bundle, today, skipped, profile.suggestOff]);
  const habits = useMemo(() => profile.habits ?? [], [profile.habits]);
  const items = useMemo(() => buildPhoneItems(tasks, habits, today), [tasks, habits, today]);
  const extra = useMemo(() => extraStudyDates(profile, mistakes), [profile, mistakes]);
  const week = useMemo(() => streakWeek(bundle, today, extra), [bundle, today, extra]);
  const goal = useMemo(() => weeklyGoal(bundle, today, clampWeeklyGoal(profile.weeklyGoalDays), extra), [bundle, today, profile.weeklyGoalDays, extra]);
  const examIn = daysUntil(profile.examDate, today);

  const tests = useMemo<StairTest[]>(() => sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR' && Number.isFinite(s.totalScore))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map(s => ({ score: s.totalScore as number, name: s.testName, date: s.date })), [sessions]);

  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<'streak' | 'add' | null>(null);

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
  });
  useEffect(() => { if (items.restOpen === 0) setExpanded(false); }, [items.restOpen]);

  const blocks = climbing ? climbing.steps.length - 1 : estimate.values.length - 1;
  const remaining = climbing ? blocks - climbing.currentIndex : 0;
  const steps = climbing ? climbing.steps : estimate.values.map(value => ({ value, reached: false }));
  const finished = plan.status === 'done';
  const cur = !climbing ? -1 : finished ? blocks - 1 : climbing.currentIndex;
  const dotsFor = climbing ? climbing.steps.length : estimate.values.length;
  const base = Math.min(size.h, size.h - size.panel + 26);

  const fallback = mode === 'ready'
    ? { kicker: 'BƯỚC ĐẦU TIÊN', title: 'Ghi đề đầu tiên', button: 'Ghi đề', onClick: onOpenSessionLogger }
    : { kicker: 'HÔM NAY', title: 'Không có việc đến hạn', button: 'Luyện tập', onClick: onPracticeMore };

  return (
    <div className="rd tp" ref={root}>
      <PhoneStairs
        steps={steps} cur={cur} best={climbing?.best ?? 0} done={finished} estimate={!climbing}
        target={shownTarget} cupLabel={chosen || climbing ? undefined : '?'} tests={tests} gear={soc.worn}
        w={size.w} top={size.head + 6} base={base}
        onCup={climbing ? () => onNavigate('history') : undefined}
      />

      <header className="tp-top">
        {examIn !== null
          ? <span className="tp-chip is-exam">{examIn === 0 ? 'Thi hôm nay!' : `Thi sau ${examIn} ngày`}</span>
          : <button type="button" className="tp-chip is-exam" onClick={onOpenSettings}><CalendarDays size={15} aria-hidden="true" />Đặt ngày thi</button>}
        <PhoneAvatarButton />
      </header>

      <div className="tp-head" ref={headRef}>
        <div className="tp-prog">
          <span className="tp-pdots" aria-hidden="true">
            {Array.from({ length: dotsFor }, (_, i) => <i key={i} className={climbing ? (i < climbing.currentIndex || (finished && i <= climbing.currentIndex) ? 'is-on' : i === climbing.currentIndex ? 'is-cur' : '') : ''} />)}
          </span>
          <small>{climbing
            ? (finished ? `ĐÃ CHẠM ${target}` : `BẬC ${climbing.currentIndex + 1}/${blocks + 1} · CÒN ${target - climbing.best} ĐIỂM`)
            : `${estimate.values.length} BẬC ƯỚC LƯỢNG · ${estimate.values[0]} → ${shownTarget}`}</small>
        </div>
        {climbing
          ? (finished
            ? <h1>Bạn đã<br /><em>chạm tay vào cúp</em></h1>
            : <h1>{countWord(remaining)} bậc nữa là<br /><em>chạm tay vào cúp</em></h1>)
          : mode === 'choose'
            ? <h1>Bạn muốn lên<br /><em>cúp bao nhiêu?</em></h1>
            : <h1>Cầu thang lên<br /><em>cúp {target}</em> đã dựng</h1>}
        {mode === 'ready' && <button type="button" className="tp-edit" onClick={() => setEditingGoal(true)}>Sửa mục tiêu</button>}
      </div>

      {mode === 'choose' ? (
        <section ref={panelRef} className="tp-panel" aria-label="Chọn mục tiêu">
          <h2 className="tp-gh">Mục tiêu điểm TOEIC</h2>
          <div className="tp-presets" role="group" aria-label="Mục tiêu điểm">
            {TARGET_PRESETS.map(v => (
              <button key={v} type="button" aria-pressed={chosen && target === v} className={'tp-preset' + (chosen && target === v ? ' is-on' : '')}
                onClick={() => onUpdateProfile(p => profileWithGoal(p, v))}>{v}</button>
            ))}
          </div>
          <button type="button" className="tp-go tp-go--wide" disabled={!chosen} onClick={() => setEditingGoal(false)}>{chosen ? `Xong, mục tiêu ${target}` : 'Chọn một mục tiêu'}</button>
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
          onToggleHabit={id => onUpdateProfile(p => toggleHabit(p, id, today))}
          onPracticeMore={onPracticeMore}
          onOpenStreak={() => setSheet('streak')} onOpenAdd={() => setSheet('add')}
        />
      )}

      {sheet === 'streak' && (
        <StreakSheet week={week} goal={goal} onSetWeeklyGoal={days => onUpdateProfile(p => ({ ...p, weeklyGoalDays: clampWeeklyGoal(days) }))} onClose={() => setSheet(null)} />
      )}
      {sheet === 'add' && (
        <AddHabitSheet
          habits={habits} suggestOff={profile.suggestOff ?? []}
          onAdd={title => onUpdateProfile(p => addHabit(p, title, crypto.randomUUID()))}
          onRemove={id => onUpdateProfile(p => removeHabit(p, id))}
          onToggleSuggest={kind => onUpdateProfile(p => { const off = p.suggestOff ?? []; return { ...p, suggestOff: off.includes(kind) ? off.filter(k => k !== kind) : [...off, kind] }; })}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
