import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { ReadingPartType, StudySession } from '@/shared/types';
import { useBakery } from '../hooks/useBakery';
import { dishName, paceWords } from '../lib/bakery';
import { BakeryChoose, FREE_HINT } from './BakeryChoose';
import { BakeryRun } from './BakeryRun';
import { BakeryDone } from './BakeryDone';
import { BakeryBreak, BakeryFreeDone } from './BakeryFree';
import { PageTip } from '@/features/guide/PageTip';
import './bakery.css';

interface Props {
  sessions: StudySession[];
  initialPart?: ReadingPartType;
  /** Results arrive while a logger or another dialog is open; the finish card waits for it to close. */
  resultDialogBlocked?: boolean;
  onOpenSessionLogger: (prefill?: { sessionType?: 'PART_PRACTICE'; partNumber?: number; durationMinutes?: number }) => void;
  onEditSession: (session: StudySession) => void;
  onSessionsChanged: () => void;
  /** True while a clock is running, paused or awaiting its result: the app hides the sidebar for focus. */
  onFocusChange?: (focused: boolean) => void;
}

/** Luyện tập on computers as a bakery (design/previews/mock-practice-bakery.html); Mẻ tự do replaces the old Pomodoro clock. */
export function PracticePage(props: Props) {
  const owner = getActiveAccountId();
  return <PracticeWorkspace key={owner ?? 'guest'} owner={owner} {...props} />;
}

function PracticeWorkspace({ owner, resultDialogBlocked = false, onEditSession, ...rest }: Props & { owner: string | null }) {
  const b = useBakery({ owner, ...rest });
  const { mode, label, free } = b;

  if (free.resting) {
    return <BakeryBreak long={free.longBreak} minutes={free.breakMinutes} progress={b.progress} clock={b.clock} error={b.error} onSkip={free.skipBreak} />;
  }
  if (b.status === 'running' || b.status === 'paused') {
    return (
      <BakeryRun
        mode={mode} label={label} recipe={mode === 'FULL_READING' ? dishName(mode) : `${dishName(mode)} ${label}`}
        questions={b.questions} plannedMinutes={b.plannedMinutes} progress={b.progress}
        clock={b.clock} plannedClock={b.plannedClock} paused={b.paused} hot={b.hot}
        steps={b.steps} at={b.at} pace={paceWords(b.planned / Math.max(1, b.questions))} error={b.error}
        onPause={b.timer.pause} onResume={b.start} onFinish={b.timer.finish} onStop={b.stop} free={free.on}
      />
    );
  }
  if (b.status === 'finished' && free.on) {
    return (
      <BakeryFreeDone gained={free.gained} today={free.todayLabel} count={free.focusToday} interval={free.interval}
        long={free.next.long} breakMinutes={free.next.minutes} blocked={resultDialogBlocked} error={b.error}
        onBreak={free.takeBreak} onAgain={free.bakeAgain} />
    );
  }
  if (b.status === 'finished') {
    return (
      <BakeryDone
        label={label} questions={b.questions} plannedMinutes={b.plannedMinutes} clock={b.spentShort} wrong={b.wrong}
        recordGain={b.recordGain} blocked={resultDialogBlocked} timeUp={b.timeUp}
        error={b.error} onWrong={b.setWrong} onSave={b.save}
      />
    );
  }
  const { suggestion, suggested } = b;
  return (
    <>
    <PageTip id="practice" />
    <BakeryChoose
      mode={mode} label={label} choices={b.choices} part7Options={b.part7Options}
      reason={free.on ? FREE_HINT : suggested === mode && suggestion ? suggestion.reason
        : suggestion && suggested ? `Gợi ý hôm nay: ${b.choices.find(c => c.mode === suggested)?.label ?? ''} · ${suggestion.reason}` : ''}
      lastTime={b.lastTime} minutes={b.plannedMinutes} canMinus={b.canMinus}
      recent={b.rows} weekCount={b.weekCount} error={b.error}
      onPick={b.pick} onStart={b.start} onMinutes={b.setMinutes}
      onLog={b.logResult} onOpenSession={onEditSession}
    />
    </>
  );
}
