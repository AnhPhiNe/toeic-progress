import { PhoneSheet } from '@/app/components/phone';
import type { StudySession } from '@/shared/types';
import { ISLAND_STATE_LABEL, islandState } from '../../lib/islands';
import { ddmm, fullTests } from '../../lib/journeyData';
import { partBars } from '../../lib/phoneJourney';

interface Props {
  session: StudySession;
  sessions: StudySession[];
  onClose: () => void;
  onOpenNotebook: (testName: string) => void;
  onEdit: (session: StudySession) => void;
  onDelete: (session: StudySession) => void;
}

const BAR = { strong: '#46b35a', ok: '#ffc83d', weak: '#ff7a9c' } as const;
const INK = { strong: '#2f8a42', ok: '#a87a00', weak: '#d6416a' } as const;

/** Detail sheet of one test: score, change, Nghe/Đọc, % per Part, wrong questions and edit/delete. */
export function TestSheet({ session, sessions, onClose, onOpenNotebook, onEdit, onDelete }: Props) {
  const list = fullTests(sessions);
  const at = list.findIndex(s => s.id === session.id);
  const prev = at > 0 ? list[at - 1] : null;
  const score = session.totalScore ?? 0;
  const delta = prev ? score - (prev.totalScore ?? 0) : null;
  const bars = partBars(session);
  const wrong = bars ? bars.reduce((s, b) => s + b.wrong, 0) : 0;

  return (
    <PhoneSheet title={session.testName} onClose={onClose} hideTitle>
      <div className="jp-ts">
        <div className="jp-ts__top">
          <div><h2>{session.testName}</h2><small>{ddmm(session.date)}{session.durationMinutes ? ` · ${session.durationMinutes} phút` : ''}</small></div>
          <div className="jp-ts__sc"><b>{score}</b>{delta !== null && delta !== 0 && <i className={'jp-dl' + (delta < 0 ? ' is-dn' : '')}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</i>}</div>
        </div>
        <div className="jp-ts__lr">
          <div><small>Nghe</small><b>{session.scaledListening ?? '–'}</b></div>
          <div><small>Đọc</small><b>{session.scaledReading ?? '–'}</b></div>
        </div>
        {bars ? (
          <>
            <h3>Đúng theo Part</h3>
            <ul className="jp-ts__bars">
              {bars.map(b => {
                const st = islandState(b.pct);
                return (
                  <li key={b.part}>
                    <span>P{b.part}</span>
                    <div role="img" aria-label={`Part ${b.part}: ${b.pct}% đúng, ${ISLAND_STATE_LABEL[st]}`}><i style={{ width: `${b.pct}%`, background: BAR[st] }} /></div>
                    <em style={{ color: st === 'weak' ? INK.weak : undefined }}>{b.pct}%</em>
                  </li>
                );
              })}
            </ul>
          </>
        ) : <p className="jp-ts__none">Đề này chỉ ghi điểm, chưa có câu sai. Bấm nút sửa để thêm.</p>}
        <div className="jp-ts__foot">
          {bars && wrong > 0
            ? <button type="button" className="rd-btn jp-main" onClick={() => onOpenNotebook(session.testName)}>Xem {wrong} câu sai</button>
            : <button type="button" className="rd-btn jp-main" onClick={() => onOpenNotebook(session.testName)}>Mở Sổ tay đề này</button>}
          <button type="button" className="jp-ico" aria-label="Sửa điểm" onClick={() => onEdit(session)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
          </button>
        </div>
        <button type="button" className="jp-del" onClick={() => { if (window.confirm(`Xoá bản ghi “${session.testName}” ngày ${ddmm(session.date)}?`)) onDelete(session); }}>Xoá bản ghi này</button>
      </div>
    </PhoneSheet>
  );
}
