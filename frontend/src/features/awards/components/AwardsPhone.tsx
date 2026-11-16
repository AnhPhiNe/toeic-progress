import { useMemo } from 'react';
import type { DataBundle } from '@/shared/data/dataBundle';
import { Soc } from '@/shared/ui/soc/Soc';
import { FAMILY_COLOR, FAMILY_LABEL, FAMILY_ORDER, ddmm, computeBadges } from '../lib/badges';
import { useBadgeReveal } from '../lib/useBadgeReveal';
import { BadgeIcon } from './BadgeIcon';
import { FlipReveal } from './FlipReveal';
import './awards.css';

interface Props { bundle: DataBundle; today: string; owner: string | null }

/** Thành tích on phones: the shelf layout kept from before the desktop redesign (design/previews/mock-awards-v2.html, A). */
export function AwardsPhone({ bundle, today, owner }: Props) {
  const badges = useMemo(() => computeBadges(bundle, today), [bundle, today]);
  const reveal = useBadgeReveal(badges, owner);

  const earned = badges.filter(b => b.earned);
  const tally = { g: earned.filter(b => b.tier === 'g').length, s: earned.filter(b => b.tier === 's').length, b: earned.filter(b => b.tier === 'b').length };
  const newest = [...earned].filter(b => b.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const near = badges.find(b => !b.earned && b.family !== 'secret' && b.left);

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
        {FAMILY_ORDER.map(fam => {
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
                      onClick={() => reveal.show(b)} title={secret ? 'Tự khám phá nhé' : b.how}>
                      <BadgeIcon badge={b} size={88} />
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

      {reveal.current && <FlipReveal badge={reveal.current} remaining={reveal.remaining} flipped={reveal.flipped} onFlip={() => reveal.setFlipped(true)} onNext={reveal.next} />}
    </div>
  );
}
