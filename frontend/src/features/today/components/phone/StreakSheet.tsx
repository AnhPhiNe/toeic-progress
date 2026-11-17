import { useState } from 'react';
import type { StreakWeek, WeeklyGoal } from '@/shared/domain/streakWeek';
import { PhoneSheet } from '@/app/components/phone';
import { StreakCake } from '../StreakCake';

interface Props {
  week: StreakWeek;
  goal: WeeklyGoal;
  onSetWeeklyGoal: (days: number) => void;
  onClose: () => void;
}

/** Candle cake, record, freezes and the weekly goal (with Sửa) in a bottom sheet; same pieces as the desktop card. */
export function StreakSheet({ week, goal, onSetWeeklyGoal, onClose }: Props) {
  const [edit, setEdit] = useState(false);
  return (
    <PhoneSheet title="Chuỗi học" onClose={onClose} hideTitle>
      <StreakCake week={week}>
        <div className="td-wk">
          <span>{goal.done >= goal.goal ? 'Đủ mục tiêu tuần' : <>Mục tiêu tuần: <b>{goal.done}/{goal.goal}</b> buổi học</>}</span>
          <div className="td-bar is-green"><i style={{ width: `${Math.min(100, goal.done / goal.goal * 100)}%` }} /></div>
          {edit
            ? <span className="td-step">
                <button type="button" onClick={() => onSetWeeklyGoal(goal.goal - 1)} disabled={goal.goal <= 1} aria-label="Bớt một buổi">−</button>
                <b>{goal.goal}</b>
                <button type="button" onClick={() => onSetWeeklyGoal(goal.goal + 1)} disabled={goal.goal >= 7} aria-label="Thêm một buổi">+</button>
                <button type="button" className="td-link" onClick={() => setEdit(false)}>Xong</button>
              </span>
            : <button type="button" className="td-link" onClick={() => setEdit(true)}>Sửa</button>}
        </div>
      </StreakCake>
      <p className="tp-sub">Học ít nhất 1 việc mỗi ngày để giữ lửa. Quên một hôm thì ngày nghỉ (băng) tự giữ chuỗi giúp bạn.</p>
    </PhoneSheet>
  );
}
