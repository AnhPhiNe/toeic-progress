import type { StreakWeek, WeeklyGoal } from '@/shared/domain/streakWeek';
import { PhoneSheet } from '@/app/components/phone';
import { StreakCake } from '../StreakCake';

interface Props {
  week: StreakWeek;
  goal: WeeklyGoal;
  onClose: () => void;
  /** The streak just broke: the cake says "Không sao, hôm nay làm lại nhé". */
  broke?: boolean;
}

/** Candle cake, record, freezes and the weekly goal in a bottom sheet; same pieces as the desktop card. */
export function StreakSheet({ week, goal, broke, onClose }: Props) {
  return (
    <PhoneSheet title="Chuỗi học" onClose={onClose} hideTitle>
      <StreakCake week={week} broke={broke}>
        <div className="td-wk">
          <span>{goal.done >= goal.goal ? 'Đủ mục tiêu tuần' : <>Mục tiêu tuần: <b>{goal.done}/{goal.goal}</b> buổi học</>}</span>
          <div className="td-bar is-green"><i style={{ width: `${Math.min(100, goal.done / goal.goal * 100)}%` }} /></div>
        </div>
      </StreakCake>
      <p className="tp-sub">Học ít nhất 1 việc mỗi ngày để giữ lửa. Quên một hôm thì ngày nghỉ (băng) tự giữ chuỗi giúp bạn.</p>
    </PhoneSheet>
  );
}
