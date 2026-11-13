import type { TicketKind } from '../lib/journeyData';

interface Props {
  kind: TicketKind;
  first: number;
  score: number;
  goal: number;
  delta: number;
  listening?: number;
  reading?: number;
  date: string;
  test: string;
  retake: boolean;
}

const W = 420, x0 = 30, x1 = W - 80, yb = 92, ya = 34;
const arc = (t: number): [number, number] => [x0 + (x1 - x0) * t, t > 1 ? ya : yb - (yb - ya) * Math.sin(t * Math.PI / 2)];
const path = (a: number, b: number) => {
  let s = '';
  for (let i = 0; i <= 48; i++) { const [x, y] = arc(a + (b - a) * i / 48); s += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
  return s;
};

const BANNER: Record<TicketKind, string> = { rec: 'Kỷ lục mới!', down: 'Lần sau nha!', first: 'Cất cánh!', goal: 'Chạm mục tiêu!', up: 'Tiếp tục bay!' };
const TAG: Record<TicketKind, [string, string, string]> = {
  rec: ['Kỷ lục mới', '#ffc83d', '#5a4410'], down: ['Chững lại', '#eef1f5', '#5c675f'], first: ['Đề đầu tiên', '#e7f6ea', '#2f8a42'],
  goal: ['Chạm mục tiêu', '#ff7a9c', '#fff'], up: ['Lên điểm', '#e7f6ea', '#2f8a42']
};

/** "Vé lên đỉnh" (design/previews/mock-journey-tabs.html, ticket B): the plane tows a banner toward the trophy. */
export function TestTicket({ kind, first, score, goal, delta, listening, reading, date, test, retake }: Props) {
  const p = Math.max(0, Math.min(1, (score - first) / Math.max(1, goal - first)));
  const pg = kind === 'goal' ? 1.2 : Math.max(p, 0.36);
  const [gx, gy] = arc(pg), [tx, ty] = arc(pg + 0.01);
  const ang = Math.atan2(ty - gy, tx - gx) * 180 / Math.PI;
  const ban = BANNER[kind], bw = ban.length * 7.1 + 22, dn = kind === 'down';
  const tag = TAG[kind];
  const d = kind === 'first' ? '#1' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
  return (
    <div className="jr-tk">
      <div className="jr-tkm">
        <div className="jr-tksky">
          <svg viewBox={`0 0 ${W} 108`} aria-hidden="true">
            <g fill="#fff" opacity=".9"><ellipse cx="96" cy="22" rx="30" ry="10" /><ellipse cx="114" cy="14" rx="18" ry="11" /><ellipse cx="300" cy="92" rx="24" ry="7" /></g>
            <path d={path(0, 1)} fill="none" stroke="#9fd0f5" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
            <path d={path(0, kind === 'goal' ? 1.2 : p)} fill="none" stroke="#1c8fe3" strokeWidth="3.5" strokeLinecap="round" opacity=".55" />
            <circle cx={x0} cy={yb} r="5" fill="#1c8fe3" /><text x={x0} y={yb + 14} fontWeight="900" fontSize="11.5" fill="#4d6a80" textAnchor="middle">{first}</text>
            <g transform={`translate(${x1 + 4} ${ya - 6})`}>
              <circle r="26" fill="#fff6c8" opacity=".75" />
              <path d="M-13 -14 C-22 -14 -21 -3 -12 -4" fill="none" stroke="#e8a516" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M13 -14 C22 -14 21 -3 12 -4" fill="none" stroke="#d99a00" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M-14 -17 H14 C14 -2 7 6 0 7 C-7 6 -14 -2 -14 -17Z" fill="#ffc83d" /><ellipse cx="0" cy="-17" rx="14" ry="2.5" fill="#ffe9a3" />
              <rect x="-3" y="6" width="6" height="6" fill="#e8a516" /><rect x="-9" y="11" width="18" height="5" rx="2" fill="#2f3a33" />
              <path d="M0 -13 l2 4 4.4 .6 -3.2 3.1 .8 4.3 -4 -2.1 -4 2.1 .8 -4.3 -3.2 -3.1 4.4 -.6Z" fill="#fff" />
            </g>
            <text x={x1 + 4} y={ya + 28} fontWeight="900" fontSize="14" fill="#d9547a" textAnchor="middle">{goal}</text>
            <g transform={`translate(${gx} ${gy}) rotate(${ang}) scale(.85)`}>
              <line x1="-30" y1="0" x2="-44" y2="0" stroke="#7a857e" strokeWidth="1.5" />
              <path d={`M${-44 - bw} -10 H-44 V10 H${-44 - bw} L${-50 - bw} 0Z`} fill={dn ? '#fff' : '#ffd766'} stroke={dn ? '#d5dcd6' : '#e8b62c'} strokeWidth="1.5" />
              <text x={-44 - bw / 2 - 2} y="4.5" fontWeight="900" fontSize="12" fill={dn ? '#4d5850' : '#5a4410'} textAnchor="middle">{ban}</text>
              <path d="M-30 2 C-30 -8 -20 -12 -8 -12 L14 -12 C26 -12 34 -6 36 0 C34 6 26 10 14 10 L-8 10 C-20 10 -30 8 -30 2Z" fill="#fff" stroke="#1c8fe3" strokeWidth="2.5" />
              <path d="M-26 -8 L-34 -26 L-22 -26 L-14 -11Z" fill="#1c8fe3" /><path d="M-4 2 L-14 20 L-2 20 L10 4Z" fill="#46b35a" />
              <path d="M26 -9 C31 -7 35 -3 36 0 L24 0 Z" fill="#9ed6ff" />
              <circle cx="-14" cy="-3" r="3" fill="#9ed6ff" /><circle cx="-4" cy="-3" r="3" fill="#9ed6ff" /><circle cx="6" cy="-3" r="3" fill="#9ed6ff" />
              <path d="M-30 4 L36 4" stroke="#ffc83d" strokeWidth="3" />
            </g>
          </svg>
        </div>
        <div className="jr-tklow">
          <div className="jr-tkbig">{score}</div><div className="jr-tkvr" />
          <div className="jr-tklr">
            <div>Nghe<b>{listening ?? '—'}</b></div><div>Đọc<b>{reading ?? '—'}</b></div>
            <div>{score >= goal ? `Vượt ${goal}` : `Còn tới ${goal}`}<b>{Math.abs(goal - score)}</b></div>
          </div>
        </div>
      </div>
      <div className="jr-tks">
        <div className="jr-tkd" style={{ color: dn ? '#7a857e' : '#2f8a42' }}>{d}</div>
        <span className="jr-tktag" style={{ background: tag[1], color: tag[2] }}>{tag[0]}</span>
        {retake && <span className="jr-tkre">làm lại</span>}
        <div className="jr-tkdt">{date}<br />{test}</div>
      </div>
    </div>
  );
}
