import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { ReadingPartType, StudySession } from '@/shared/types';
import { useBakery } from '../hooks/useBakery';
import { PhoneBakeryChoose } from './phone/PhoneBakeryChoose';
import { PhoneBakeryRun } from './phone/PhoneBakeryRun';
import { PhoneBakeryDone } from './phone/PhoneBakeryDone';
import './bakery.css';
import './phone/practice-phone.css';

/**
 * Luyện tập on phones (design/previews/mock-phone-practice.html): chọn mẻ, đang nướng, ra lò.
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
  onOpenPomodoro: () => void;
  onFocusChange: (focus: boolean) => void;
}

export function PracticePhone(props: PracticePhoneProps) {
  const owner = getActiveAccountId();
  return <PracticePhoneWorkspace key={owner ?? 'guest'} owner={owner} {...props} />;
}

function PracticePhoneWorkspace({ owner, resultDialogBlocked = false, onEditSession, onOpenPomodoro, ...rest }: PracticePhoneProps & { owner: string | null }) {
  const b = useBakery({ owner, ...rest });
  if (b.status === 'running' || b.status === 'paused') {
    return (
      <PhoneBakeryRun
        label={b.label} questions={b.questions} plannedMinutes={b.plannedMinutes} progress={b.progress}
        clock={b.clock} plannedClock={b.plannedClock} paused={b.paused} hot={b.hot}
        steps={b.steps} at={b.at} error={b.error}
        onPause={b.timer.pause} onResume={b.start} onFinish={b.timer.finish} onStop={b.stop}
      />
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
    <PhoneBakeryChoose
      mode={b.mode} label={b.label} choices={b.choices}
      lastTime={b.lastTime} minutes={b.plannedMinutes} canMinus={b.canMinus}
      recent={b.rows} error={b.error}
      onPick={b.pick} onStart={b.start} onMinutes={b.setMinutes}
      onLog={b.logResult} onPomodoro={onOpenPomodoro} onOpenSession={onEditSession}
    />
  );
}
