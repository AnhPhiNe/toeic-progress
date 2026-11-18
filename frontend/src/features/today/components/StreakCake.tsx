import type { ReactNode } from 'react';
import type { StreakWeek } from '@/shared/domain/streakWeek';
import { streakCake } from '../lib/streakCake';
import { BROKE_LINE } from '../lib/socMood';

const COLS = ['#ff7a9c', '#ffc83d', '#7ec8ff', '#7fd18c', '#a78bfa', '#ff9a4d', '#ff7a9c'];
const TIER = ['#ffd1dc', '#fff1c9'], TIER_LINE = ['#ff9eb8', '#ffd766'];
const H = 112;

function BigFlame({ lit }: { lit: boolean }) {
  return (
    <svg className="td-sc-fl" viewBox="0 0 44 52" aria-hidden="true">
      <defs><linearGradient id="tdScFl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={lit ? '#ffb347' : '#f6e7d2'} /><stop offset="1" stopColor={lit ? '#ff6a1a' : '#ead6b9'} /></linearGradient></defs>
      <g className={lit ? 'td-sc-big' : undefined}>
        <path d="M22 2 C26 14 40 19 40 32 a18 17 0 0 1 -36 0 C4 23 11 19 13 10 C16 14 18 16 22 2Z" fill="url(#tdScFl)" />
        {lit && <path d="M22 24 c4 5 8 8 8 13 a8 8 0 0 1 -16 0 c0-5 4-7 8-13Z" fill="#ffe58f" />}
      </g>
    </svg>
  );
}

/**
 * Compact streak card: big count with the one next step under it, a low cake whose seven candles are this week's
 * days, then `children` (the weekly-goal line) so the right column stays short even with three habits.
 */
export function StreakCake({ week, now, broke, children }: { week: StreakWeek; now?: Date; broke?: boolean; children?: ReactNode }) {
  const m = streakCake(week, now);
  const n = Math.max(0, week.current);
  const act = (broke || m.recordAbove) && n === 0 ? <>{BROKE_LINE}</>
    : n === 0 ? <>Xong 1 việc là <b>thắp nến đầu tiên</b></>
    : m.danger ? <>⏰ Còn <b>{m.hoursLeft} tiếng</b> để giữ chuỗi</>
    : !m.studiedToday ? <>Xong 1 việc là thắp nến hôm nay</>
    : m.litThisWeek >= 7 ? <>Xong bánh tuần này rồi! 🎂</>
    : <>Còn <b>{7 - m.litThisWeek} nến</b> là xong bánh tuần{m.cakes ? ` · 🎂 ${m.cakes}` : ''}</>;
  let y = H - 26;
  const tiers: JSX.Element[] = [];
  for (let t = 0; t < m.tiers; t++) {
    const w = 300 - t * 40, x = 165 - w / 2, gold = m.gold && t === 0;
    y -= 24;
    tiers.push(
      <g key={t}>
        <rect x={x} y={y} width={w} height="24" rx="9" fill={gold ? '#ffe9a3' : TIER[t]} />
        <path d={`M${x} ${y + 8} ${Array.from({ length: Math.round(w / 26) }, () => 'q13 11 26 0').join(' ')}`} fill="none" stroke={gold ? '#ffc83d' : TIER_LINE[t]} strokeWidth="5" />
      </g>
    );
  }
  const topW = 300 - (m.tiers - 1) * 40;
  const cx = (i: number) => 165 - topW / 2 + 22 + i * (topW - 44) / 6;

  return (
    <section className="td-skcard" aria-label={`Chuỗi ${n} ngày`}>
      <div className="td-sc-top">
        <BigFlame lit={n > 0} />
        <div className="td-sc-n"><b>{n}<span>ngày liền</span></b><small className={m.danger ? 'is-warn' : undefined}>{act}</small></div>
        <span className="td-sc-chips">
          <span className="td-frz" title="Ngày nghỉ được giữ chuỗi">❄ {week.freezesLeft}</span>
          {m.recordAbove && <span className="td-rec" title="Kỷ lục chuỗi của bạn">🏅 {week.longest}</span>}
        </span>
      </div>
      <svg className="td-sc-cake" viewBox={`0 ${y - 52} 330 ${H - y + 52}`} role="img" aria-label={`Tuần này ${m.litThisWeek} trên 7 nến đã thắp`}>
        <rect x="10" y={H - 26} width="310" height="8" rx="4.5" fill="#efeaf5" />
        {tiers}
        {m.candles.map((c, i) => (
          <g key={i} transform={`translate(${cx(i)} ${y})`}>
            <title>{c.state === 'lit' ? `${c.label}: đã học` : c.state === 'freeze' ? 'Ngày nghỉ giữ chuỗi' : c.isToday ? 'Hôm nay: chưa thắp' : c.label}</title>
            <rect x="-5" y="-28" width="10" height="28" rx="3" fill={c.state === 'lit' ? COLS[i] : c.state === 'freeze' ? '#cfe8ff' : '#f3eef3'}
              stroke={c.state === 'today' ? '#ff8a2a' : 'none'} strokeWidth="2.5" className={c.state === 'today' && m.danger ? 'td-sc-danger' : undefined} />
            {c.state === 'lit' && <>
              <circle cx="0" cy="-38" r="11" fill="#ffd38a" opacity=".35" />
              <path className="td-sc-flame" style={{ animationDelay: `-${i * 0.21}s` }} d="M0 -48 C5 -41 6 -37 0 -29 C-6 -37 -5 -41 0 -48Z" fill="#ff9a2e" />
              <path d="M0 -40 C2 -37 2 -34 0 -31 C-2 -34 -2 -37 0 -40Z" fill="#ffe58f" />
            </>}
            {c.state === 'freeze' && <text x="0" y="-34" textAnchor="middle" fontSize="14">❄</text>}
          </g>
        ))}
        {m.candles.map((c, i) => (
          <text key={'l' + i} x={cx(i)} y={H - 6} textAnchor="middle" fontWeight="900" fontSize="11.5" fill={c.isToday ? '#e8730c' : '#a3aba5'}>{c.label}</text>
        ))}
      </svg>
      {children}
    </section>
  );
}
