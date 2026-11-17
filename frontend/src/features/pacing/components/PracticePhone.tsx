import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { ReadingPartType, StudySession } from '@/shared/types';
import { useBakery } from '../hooks/useBakery';
import { PhoneBakeryChoose } from './phone/PhoneBakeryChoose';
import { PhoneBakeryRun } from './phone/PhoneBakeryRun';
import { PhoneBakeryDone } from './phone/PhoneBakeryDone';
import { PhoneBakeryBreak, PhoneBakeryFreeDone } from './phone/PhoneBakeryFree';
import { PageTip } from '@/features/guide/PageTip';
import './bakery.css';
import './phone/practice-phone.css';

/**
 * Luyện tập on phones (design/previews/mock-phone-practice.html): chọn mẻ, đang nướng, ra lò; Mẻ tự do adds its break.
 * Same timer, result and saved data as PracticePage (desktop); only the screens differ.
 * While a clock runs, is paused or awaits its result the shell hides the bottom nav (onFocusChange).
 */
export interface PracticePhoneProps {
  /** Same data and handlers PracticePage (desktop) receives. */
  sessions: StudySession[];
  initialPart?: ReadingPartType;
  resultDialogBlocked?: boolean;
  onOpenSessionLogger: (prefill?: { sessionType?: 'PART_PRACTICE'; partNumber?: number; durationMinutes?: number }) => void;
  onEditSession: (session: StudySession) => void;
  onSessionsChanged: () => void;
  onFocusChange: (focus: boolean) => void;
}

export function PracticePhone(props: PracticePhoneProps) {
  const owner = getActiveAccountId();
  return <PracticePhoneWorkspace key={owner ?? 'guest'} owner={owner} {...props} />;
}

function PracticePhoneWorkspace({ owner, resultDialogBlocked = false, onEditSession, ...rest }: PracticePhoneProps & { owner: string | null }) {
  const b = useBakery({ owner, ...rest });
  const { free } = b;
  if (free.resting) {
    return <PhoneBakeryBreak long={free.longBreak} minutes={free.breakMinutes} progress={b.progress} clock={b.clock} error={b.error} onSkip={free.skipBreak} />;
  }
  if (b.status === 'running' || b.status === 'paused') {
    return (
      <PhoneBakeryRun
        label={b.label} questions={b.questions} plannedMinutes={b.plannedMinutes} progress={b.progress}
        clock={b.clock} plannedClock={b.plannedClock} paused={b.paused} hot={b.hot}
        steps={b.steps} at={b.at} error={b.error}
        onPause={b.timer.pause} onResume={b.start} onFinish={b.timer.finish} onStop={b.stop} free={free.on}
      />
    );
  }
  if (b.status === 'finished' && free.on) {
    return (
      <PhoneBakeryFreeDone gained={free.gained} today={free.todayLabel} count={free.focusToday} interval={free.interval}
        long={free.next.long} breakMinutes={free.next.minutes} blocked={resultDialogBlocked} error={b.error}
        onBreak={free.takeBreak} onAgain={free.bakeAgain} />
    );
  }
  if (b.status === 'finished') {
    return (
      <PhoneBakeryDone
        label={b.label} questions={b.questions} clock={b.spentShort} wrong={b.wrong}
        recordGain={b.recordGain} blocked={resultDialogBlocked} timeUp={b.timeUp}
        error={b.error} onWrong={b.setWrong} onSave={b.save}
      />
    );
  }
  return (
    <>
    <PageTip id="practice" />
    <PhoneBakeryChoose
      mode={b.mode} label={b.label} choices={b.choices}
      lastTime={b.lastTime} minutes={b.plannedMinutes} canMinus={b.canMinus}
      recent={b.rows} error={b.error}
      onPick={b.pick} onStart={b.start} onMinutes={b.setMinutes}
      onLog={b.logResult} onOpenSession={onEditSession}
    />
    </>
  );
}
