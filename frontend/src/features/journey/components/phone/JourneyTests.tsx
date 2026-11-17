import { useMemo } from 'react';
import type { StudySession } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { fullTests } from '../../lib/journeyData';
import { monthGroups } from '../../lib/phoneJourney';

interface Props {
  sessions: StudySession[];
  onOpenTest: (id: string) => void;
  onOpenSessionLogger: () => void;
}

/** Các đề on phones (mock-phone-journey.html, "Bản bớt chữ"): rows by month with date, name, score and change. */
export function JourneyTests({ sessions, onOpenTest, onOpenSessionLogger }: Props) {
  const oldestFirst = useMemo(() => fullTests(sessions), [sessions]);
  const deltas = useMemo(() => new Map(oldestFirst.map((s, i) => [s.id, i > 0 ? (s.totalScore ?? 0) - (oldestFirst[i - 1].totalScore ?? 0) : null])), [oldestFirst]);
  const groups = useMemo(() => monthGroups([...oldestFirst].reverse()), [oldestFirst]);

  if (!oldestFirst.length) {
    return (
      <div className="jp-empty is-list">
        <Soc state="idle" size={110} />
        <p>Chưa có đề nào. Ghi điểm đề đầu tiên để bắt đầu hành trình.</p>
        <button type="button" className="rd-btn" onClick={onOpenSessionLogger}>+ Ghi điểm</button>
      </div>
    );
  }
  return (
    <div className="jp-list">
      {groups.map(g => (
        <section key={g.key}>
          <h2 className="jp-mo">{g.label}</h2>
          {g.tests.map(s => {
            const d = deltas.get(s.id) ?? null;
            return (
              <button key={s.id} type="button" className="jp-row" onClick={() => onOpenTest(s.id)}>
                <span className="jp-dt">{s.date.slice(8, 10)}<small>T{Number(s.date.slice(5, 7))}</small></span>
                <span className="jp-nm">{s.testName}</span>
                <span className="jp-sc">{s.totalScore}</span>
                {d !== null && d !== 0 ? <i className={'jp-dl' + (d < 0 ? ' is-dn' : '')}>{d > 0 ? '+' : '−'}{Math.abs(d)}</i> : <i className="jp-dl is-none" aria-hidden="true" />}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
