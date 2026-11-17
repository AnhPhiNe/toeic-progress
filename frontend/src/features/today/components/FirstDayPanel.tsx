import type { StreakWeek } from '@/shared/domain/streakWeek';
import { Soc } from '@/shared/ui/soc/Soc';
import { StreakCake } from './StreakCake';
import type { TodayTask } from '../lib/todayTasks';

interface Props {
  /** Next task; the first test for a brand-new learner. */
  task: TodayTask | null;
  /** Value of the first stair, shown on the third reward. */
  firstStep: number;
  week: StreakWeek;
  onStartTask: (task: TodayTask) => void;
}

const GOLD = ['#ffd766', '#e0a400', '#6b4a00'] as const;
const OFF = ['#f1ede1', '#dcd6c4', '#b5ad95'] as const;

function Rewards({ firstStep }: { firstStep: number }) {
  const [gf, gd, gi] = GOLD;
  const [nf, nd, ni] = OFF;
  return (
    <section className="td-rw" aria-label="Phần thưởng đầu tiên">
      <h3>Phần thưởng đầu tiên đang chờ</h3>
      <p>Ghi đề đầu tiên là nhận cả ba.</p>
      <ul>
        <li className="is-lit">
          <svg viewBox="0 0 100 104" aria-hidden="true">
            <circle cx="50" cy="46" r="34" fill={gf} stroke={gd} strokeWidth="5" />
            <path d="M34 74 L28 96 L40 90 L46 100 L50 80Z M66 74 L72 96 L60 90 L54 100 L50 80Z" fill="#ff7a9c" />
            <text x="50" y="52" textAnchor="middle" fontWeight="900" fontSize="26" fill={gi}>1</text>
            <text x="50" y="64" textAnchor="middle" fontWeight="800" fontSize="10" fill={gi}>đề</text>
          </svg>
          <b>Đề đầu tiên</b><small>huy hiệu</small>
        </li>
        <li>
          <svg viewBox="0 0 100 104" aria-hidden="true">
            <path d="M50 6 C58 26 84 34 84 60 a34 32 0 0 1 -68 0 C16 44 28 36 32 20 C38 30 44 32 50 6Z" fill={nf} stroke={nd} strokeWidth="5" strokeLinejoin="round" />
            <text x="50" y="72" textAnchor="middle" fontWeight="900" fontSize="26" fill={ni}>1</text>
          </svg>
          <b>Chuỗi 1 ngày</b><small>ngọn lửa đầu</small>
        </li>
        <li>
          <svg viewBox="0 0 100 104" aria-hidden="true">
            <path d="M12 60 L50 40 L88 60 L50 80Z" fill={nf} stroke={nd} strokeWidth="5" strokeLinejoin="round" />
            <path d="M12 60 V72 L50 92 V80Z M88 60 V72 L50 92 V80Z" fill={nd} opacity=".6" />
            <text x="50" y="66" textAnchor="middle" fontWeight="900" fontSize="18" fill={ni}>{firstStep}</text>
          </svg>
          <b>Bậc đầu tiên</b><small>sáng vàng</small>
        </li>
      </ul>
    </section>
  );
}

/** Right-hand column of the new-user Hôm nay page: next task, the rewards waiting, and a ghost of the first week. */
export function FirstDayPanel({ task, firstStep, week, onStartTask }: Props) {
  return (
    <>
      <section className="td-card" aria-label="Việc tiếp theo">
        <div className="td-hero is-first">
          <span className="td-ring" aria-hidden="true" />
          {task ? <>
            <small>{task.kicker}</small>
            <h2>{task.title}</h2>
            <p>{task.reason}</p>
            <div className="td-acts"><button type="button" className="td-go" onClick={() => onStartTask(task)}>{task.kind === 'FULL_TEST' ? '+ Ghi điểm' : '▶ Bắt đầu'}</button></div>
          </> : <>
            <small>HÔM NAY</small>
            <h2>Ghi điểm đề đầu tiên</h2>
            <p>Để biết mình đang ở đâu</p>
          </>}
          <Soc state="idle" size={112} className="td-hero-soc" />
        </div>
      </section>
      <Rewards firstStep={firstStep} />
      <StreakCake week={week} />
    </>
  );
}
