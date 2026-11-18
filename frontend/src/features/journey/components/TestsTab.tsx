import type { StudySession } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { ddmm, fullTests } from '../lib/journeyData';

interface Props {
  sessions: StudySession[];
  onOpenTest: (id: string) => void;
  onOpenSessionLogger: () => void;
}

const sameTest = (a: StudySession, b: StudySession) => a.testName.trim().toLowerCase() === b.testName.trim().toLowerCase();

/** Các đề tab: newest first on a timeline; a row opens the test drawer. */
export function TestsTab({ sessions, onOpenTest, onOpenSessionLogger }: Props) {
  const oldestFirst = fullTests(sessions);
  const list = [...oldestFirst].reverse();
  if (!list.length) {
    return (
      <div className="jr-empty">
        <Soc state="zzz" size={110} wakeable />
        <p>Chưa có đề nào. Ghi điểm đề đầu tiên để bắt đầu hành trình.</p>
        <button type="button" className="rd-btn" onClick={onOpenSessionLogger}>+ Ghi điểm</button>
      </div>
    );
  }
  const first = oldestFirst[0].totalScore ?? 0, latest = list[0].totalScore ?? 0;
  const best = Math.max(...list.map(s => s.totalScore ?? 0));
  return (
    <div>
      <h2 className="jr-h2">{list.length} đề đã ghi{list.length > 1 ? (latest >= first ? `, từ ${first} lên ${latest}` : `, gần nhất ${latest}`) : ''}</h2>
      <ol className="jr-tl">
        {list.map((s, i) => {
          const prev = list[i + 1];
          const d = prev ? (s.totalScore ?? 0) - (prev.totalScore ?? 0) : 0;
          const retake = (s.attemptNumber ?? 1) > 1 || oldestFirst.slice(0, oldestFirst.indexOf(s)).some(o => sameTest(o, s));
          return (
            <li key={s.id} className={i === 0 ? 'is-now' : undefined}>
              <span className="jr-dt">{ddmm(s.date)}</span>
              <span className="jr-dot" aria-hidden="true" />
              <button type="button" className="jr-row" onClick={() => onOpenTest(s.id)}>
                <span><span className="jr-sc">{s.totalScore}</span>{d !== 0 && <span className={'jr-dl' + (d < 0 ? ' is-dn' : '')}>{d > 0 ? '+' : '−'}{Math.abs(d)}</span>}</span>
                <span className="jr-nm">{s.testName}{retake && <span className="jr-tg is-re">làm lại</span>}{s.totalScore === best && list.length > 1 && <span className="jr-tg is-best">cao nhất</span>}</span>
                <span className="jr-lr">Nghe {s.scaledListening ?? '—'} · Đọc {s.scaledReading ?? '—'}</span>
                <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M2 2 L10 10 L2 18" fill="none" stroke="#a3aba5" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
