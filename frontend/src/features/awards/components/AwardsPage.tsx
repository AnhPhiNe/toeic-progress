import { useEffect, useMemo, useState } from 'react';
import type { DataBundle } from '@/shared/data/dataBundle';
import { Soc } from '@/shared/ui/soc/Soc';
import { FAMILY_COLOR, FAMILY_LABEL, computeBadges, weekRecaps, type Badge, type BadgeFamily } from '../lib/badges';
import { BadgeIcon } from './BadgeIcon';
import './awards.css';

interface Props { bundle: DataBundle; today: string; owner: string | null }

const FAMILIES: BadgeFamily[] = ['score', 'streak', 'effort', 'part', 'secret'];
const ddmm = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const RARITY: Record<string, string> = { b: 'Thường', s: 'Hiếm', g: 'Huyền thoại' };
const seenKey = (owner: string | null) => `rd_badges_seen_v1:${owner ?? 'guest'}`;

/** Badges the learner has not been shown yet; the very first visit marks everything as seen. */
export function unseenBadges(badges: Badge[], owner: string | null): Badge[] {
  try {
    const raw = localStorage.getItem(seenKey(owner));
    if (raw === null) return [];
    const seen = new Set<string>(JSON.parse(raw));
    return badges.filter(b => b.earned && !seen.has(b.id));
  } catch { return []; }
}
function markSeen(badges: Badge[], owner: string | null) {
  try { localStorage.setItem(seenKey(owner), JSON.stringify(badges.filter(b => b.earned).map(b => b.id))); } catch { /* Shown again next time. */ }
}

/** Thành tích (design/previews/mock-awards-v2.html, A + flip cards from C). */
export function AwardsPage({ bundle, today, owner }: Props) {
  const badges = useMemo(() => computeBadges(bundle, today), [bundle, today]);
  const weeks = useMemo(() => weekRecaps(bundle, today), [bundle, today]);
  const [queue, setQueue] = useState<Badge[]>([]);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const fresh = unseenBadges(badges, owner);
    if (fresh.length) setQueue(fresh);
    markSeen(badges, owner);
  }, [badges, owner]);
  useEffect(() => {
    if (!queue.length) return;
    setFlipped(false);
    const t = window.setTimeout(() => setFlipped(true), 450);
    return () => window.clearTimeout(t);
  }, [queue]);

  const earned = badges.filter(b => b.earned);
  const tally = { g: earned.filter(b => b.tier === 'g').length, s: earned.filter(b => b.tier === 's').length, b: earned.filter(b => b.tier === 'b').length };
  const newest = [...earned].filter(b => b.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const near = badges.find(b => !b.earned && b.family !== 'secret' && b.left);
  const current = queue[0];
  const nextSunday = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); })();

  return (
    <div className="rd aw-page">
      <h1>Thành tích</h1>
      <p className="aw-lead">Tất cả tính từ các đề và buổi học bạn đã ghi.</p>
      <section className="aw-hero">
        <Soc state={earned.length ? 'cheerC' : 'idle'} size={110} />
        <div>
          <h2>{earned.length} / {badges.length} huy hiệu</h2>
          <p>{newest ? <>Mới nhất: <b>{newest.title}</b> ({ddmm(newest.date)}). </> : 'Ghi đề đầu tiên để nhận huy hiệu đầu tiên. '}
            {near ? <>Gần nhất: <b>{near.title}</b>, {near.left}.</> : null}</p>
        </div>
        <div className="aw-tally"><div><b>{tally.g}</b>vàng</div><div><b>{tally.s}</b>bạc</div><div><b>{tally.b}</b>đồng</div></div>
      </section>

      <section className="aw-shelves">
        {FAMILIES.map(fam => {
          const items = badges.filter(b => b.family === fam);
          const have = items.filter(b => b.earned).length;
          return (
            <div key={fam} className="aw-shelf">
              <div className="aw-sh"><b>{FAMILY_LABEL[fam]}</b><small>{have}/{items.length} đã có</small>
                <div className="aw-pr"><i style={{ width: `${have / items.length * 100}%`, background: FAMILY_COLOR[fam] }} /></div></div>
              <div className="aw-items">
                {items.map(b => {
                  const secret = fam === 'secret' && !b.earned;
                  return (
                    <button key={b.id} type="button" className={'aw-it' + (b.earned ? '' : ' is-off')} disabled={!b.earned}
                      onClick={() => setQueue([b])} title={secret ? 'Tự khám phá nhé' : b.how}>
                      <BadgeIcon badge={b} hidden={secret} />
                      <b>{secret ? '???' : b.title}</b>
                      <small>{b.earned ? ddmm(b.date) || 'đã có' : secret ? 'tự khám phá' : b.left}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="aw-weeks">
        <h3>Bản tin tuần</h3>
        <p>Mỗi Chủ nhật Sóc gói một tuần của bạn thành một tấm thẻ.</p>
        <div className="aw-wgrid">
          {weeks.map((w, i) => (
            <div key={w.start} className={'aw-week c' + i}>
              <small>Tuần {ddmm(w.start)} đến {ddmm(w.end)}</small>
              <b>{w.delta !== null ? `${w.delta >= 0 ? '+' : '−'}${Math.abs(w.delta)}` : `${w.days} ngày`}</b>
              <p>{w.best !== null ? <>{w.record ? `Kỷ lục mới ${w.best}.` : `Cao nhất ${w.best} điểm.`}<br /></> : null}
                {w.tests ? `${w.tests} đề full. ` : ''}Học {w.days} trên 7 ngày.</p>
            </div>
          ))}
          <div className="aw-week is-next"><b>Tuần này</b><span>Mở vào Chủ nhật {ddmm(nextSunday)}</span></div>
        </div>
      </section>

      {current && (
        <div className="aw-flipwrap" role="dialog" aria-modal="true" aria-label={`Huy hiệu mới: ${current.title}`}>
          <div className={'aw-flip' + (flipped ? ' is-flipped' : '')} onClick={() => setFlipped(true)}>
            <div className="aw-face aw-back"><span>?</span><small>Huy hiệu mới!</small></div>
            <div className="aw-face aw-front" style={{ background: `linear-gradient(160deg, ${FAMILY_COLOR[current.family]}, ${current.family === 'secret' ? '#7c5ce0' : current.family === 'part' ? '#136fb3' : current.family === 'effort' ? '#2f8a42' : current.family === 'streak' ? '#e2701a' : '#e0a400'})` }}>
              <span className="aw-rar">{current.family === 'secret' ? 'Bí mật' : RARITY[current.tier]}</span>
              <BadgeIcon badge={current} size={130} />
              <b>{current.title}</b>
              <small>{current.how}</small>
              {current.date && <em>đạt {ddmm(current.date)}</em>}
              <span className="aw-shine" />
            </div>
          </div>
          <div className="aw-flipbtns">
            {queue.length > 1 && <span>còn {queue.length - 1} huy hiệu nữa</span>}
            <button type="button" className="rd-btn" onClick={() => setQueue(q => q.slice(1))}>{queue.length > 1 ? 'Tiếp' : 'Tuyệt!'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
