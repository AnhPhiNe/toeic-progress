import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { UserProfile } from '@/shared/types';
import { PhoneAvatarButton, PhoneSheet, usePhoneShell } from '@/app/components/phone';
import { Soc } from '@/shared/ui/soc/Soc';
import { GEAR, gearAtLevel, sanitizeGear, toggleGear, wornGear, type SocGearId } from '@/shared/ui/soc/socGear';
import { FAMILY_COLOR, FAMILY_LABEL, FAMILY_ORDER, TIER_NAME, badgeStars, computeBadges, ddmm, pickQuests, totalStars, type Badge, type BadgeFamily } from '../lib/badges';
import { levelProgress, markLevelSeen, pendingLevelUps } from '../lib/levels';
import { useBadgeReveal } from '../lib/useBadgeReveal';
import { BadgeIcon } from './BadgeIcon';
import { FlipReveal } from './FlipReveal';
import { LevelUpGift } from './LevelUpGift';
import { FAMILY_SHORT, badgeAction, badgePercent } from './phone/awardsPhoneLogic';
import './awards.css';
import './awardsDesk.css';
import './phone/awardsPhone.css';

interface Props {
  bundle: DataBundle;
  today: string;
  owner: string | null;
  /** Saves the outfit Sóc wears. */
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
}

const TINT: Record<BadgeFamily, [string, string]> = {
  score: ['#fff4d1', '#a06a00'], streak: ['#ffe9ee', '#d3456b'], effort: ['#e3f7e7', '#2f8a42'],
  part: ['#e6f1ff', '#1c6fc0'], speed: ['#e6faf6', '#0d8a7c'], secret: ['#f1e9ff', '#6a3fe0']
};
const TAB_KEY = 'rd_awards_tab_v1';
const RING_R = 54, RING_C = 2 * Math.PI * RING_R;
/** Scroll distance after which the level card is folded into the header line. */
const FOLD_AT = 150;

/** Thành tích on phones (design/previews/mock-phone-awards.html): level card, quests to swipe, then the collection. */
export function AwardsPhone({ bundle, today, owner, onUpdateProfile }: Props) {
  const { goTab } = usePhoneShell();
  const badges = useMemo(() => computeBadges(bundle, today), [bundle, today]);
  const quests = useMemo(() => pickQuests(badges), [badges]);
  const reveal = useBadgeReveal(badges, owner);
  const stars = totalStars(badges);
  const lp = levelProgress(stars);
  const lvl = lp.level.n;
  const worn = wornGear(bundle.profile.socGear, lvl);

  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setStuck(window.scrollY > FOLD_AT)); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);

  const [ringOn, setRingOn] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setRingOn(true), 60); return () => window.clearTimeout(t); }, []);

  // Level-up gift, after the badge flip cards.
  const [gifts, setGifts] = useState<number[]>([]);
  useEffect(() => { setGifts(pendingLevelUps(lvl, owner)); }, [lvl, owner]);
  const giftLevel = !reveal.current ? gifts[0] : undefined;
  const giftItem = giftLevel ? gearAtLevel(giftLevel) : undefined;
  const closeGift = (wear: boolean) => {
    if (!giftLevel) return;
    if (wear && giftItem) onUpdateProfile(p => ({ ...p, socGear: sanitizeGear([...wornGear(p.socGear, lvl), giftItem.id], lvl) }));
    markLevelSeen(giftLevel, owner);
    setGifts(g => g.slice(1));
  };
  const toggle = (id: SocGearId) => onUpdateProfile(p => ({ ...p, socGear: toggleGear(wornGear(p.socGear, lvl), id, lvl) }));

  const earned = badges.filter(b => b.earned);
  const newest = [...earned].filter(b => b.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const [tab, setTab] = useState<BadgeFamily>(() => {
    try { const saved = localStorage.getItem(TAB_KEY); if (FAMILY_ORDER.includes(saved as BadgeFamily)) return saved as BadgeFamily; } catch { /* no storage */ }
    return newest?.family ?? quests[0]?.family ?? FAMILY_ORDER[0];
  });
  const chooseTab = (fam: BadgeFamily) => { setTab(fam); try { localStorage.setItem(TAB_KEY, fam); } catch { /* remembered only with storage */ } };
  const chipRow = useRef<HTMLDivElement>(null);
  useEffect(() => { chipRow.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [tab]);

  const [detail, setDetail] = useState<Badge | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const tabItems = badges.filter(b => b.family === tab);

  return (
    <div className="rd awp">
      <header className={'awp-top' + (stuck ? ' is-stuck' : '')}>
        <h1>Thành tích</h1>
        <span className="awp-mini" aria-hidden={!stuck}>Cấp {lvl} · {stars}★</span>
        <PhoneAvatarButton />
      </header>

      <section className="awp-hero" aria-label={`Cấp ${lvl}, ${stars} sao`}>
        <span className="awp-rays" />
        <div className="awp-lvl">
          <small>CẤP CỦA BẠN</small>
          <h2>Cấp {lvl} · <em>{lp.level.name}</em></h2>
        </div>
        <svg className="awp-ring" viewBox="0 0 132 132" role="img" aria-label={`${stars} sao`}>
          <circle cx="66" cy="66" r={RING_R} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" strokeWidth="13" />
          <circle cx="66" cy="66" r={RING_R} fill="none" stroke="#ffd25e" strokeWidth="13" strokeLinecap="round" transform="rotate(-90 66 66)"
            strokeDasharray={`${RING_C * (ringOn ? lp.ratio : 0)} ${RING_C}`} opacity={lp.ratio > 0 ? 1 : 0} style={{ transition: 'stroke-dasharray .9s cubic-bezier(.3,1,.4,1)' }} />
          <text x="66" y="76" textAnchor="middle" fontWeight="900" fontSize="34" fill="#fff">{stars}<tspan fontSize="22" fill="#ffd25e" dx="3">★</tspan></text>
        </svg>
        <p className="awp-ringsub">{lp.next ? <>còn <b>{lp.toNext} sao</b> lên cấp {lp.next.n}</> : 'Cấp cao nhất rồi!'}</p>
        <div className="awp-soc"><Soc state="idle" size={190} gear={worn} /></div>
        <button type="button" className="awp-wear" aria-haspopup="dialog" onClick={() => setGearOpen(true)}>👕 Đồ cho Sóc</button>
      </section>

      <div className="awp-body">
        <div className="awp-sh">Sắp mở khoá<small>vàng 3★ · bạc 2★ · đồng 1★</small></div>
        <div className="awp-quests">
          {quests.map(q => {
            const pct = Math.max(badgePercent(q), 3);
            return (
              <button key={q.id} type="button" className="awp-qc" aria-label={`${q.title}, ${q.left ?? ''}`} onClick={() => setDetail(q)}>
                <span className="awp-bd"><BadgeIcon badge={q} /></span>
                <div>
                  <b>{q.title}</b>
                  <small>{q.left}</small>
                  <div className="awp-bar"><i style={{ width: `${pct}%`, background: FAMILY_COLOR[q.family] }} /></div>
                </div>
              </button>
            );
          })}
          {!quests.length && <div className="awp-qdone">Bạn đã mở hết huy hiệu thường!</div>}
        </div>

        <div className="awp-coll">
          <div className="awp-sh">Bộ sưu tập · {earned.length}/{badges.length}{newest && <span className="awp-new">mới nhất: {newest.title}</span>}</div>
          <div className="awp-fams" role="tablist" aria-label="Nhóm huy hiệu" ref={chipRow}>
            {FAMILY_ORDER.map(fam => {
              const items = badges.filter(b => b.family === fam);
              const on = fam === tab;
              return (
                <button key={fam} type="button" role="tab" aria-selected={on} aria-label={FAMILY_LABEL[fam]} className={'awp-fam' + (on ? ' is-on' : '')}
                  style={{ '--b': TINT[fam][0], '--c': TINT[fam][1] } as CSSProperties} onClick={() => chooseTab(fam)}>
                  {FAMILY_SHORT[fam]}<em>{items.filter(b => b.earned).length}/{items.length}</em>
                </button>
              );
            })}
          </div>
          <div className="awp-grid" role="tabpanel">
            {tabItems.map(b => {
              const secretOff = b.family === 'secret' && !b.earned;
              return (
                <button key={b.id} type="button" className={'awp-cell' + (b.earned ? '' : ' is-off')} onClick={() => setDetail(b)}
                  aria-label={`${secretOff ? 'Huy hiệu bí mật' : b.title}${b.earned ? ', đã có' : ', chưa có'}`}>
                  <span className="awp-bd"><BadgeIcon badge={b} /></span>
                  <b>{secretOff ? '???' : b.title}</b>
                  <small>{b.earned ? ddmm(b.date) || 'đã có' : secretOff ? 'tự khám phá' : b.left}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {detail && <BadgeSheet badge={detail} onClose={() => setDetail(null)} onGo={tab => { setDetail(null); goTab(tab); }} />}
      {gearOpen && <WardrobeSheet level={lvl} worn={worn} onToggle={toggle} onClose={() => setGearOpen(false)} />}
      {reveal.current && <FlipReveal badge={reveal.current} remaining={reveal.remaining} flipped={reveal.flipped} onFlip={() => reveal.setFlipped(true)} onNext={reveal.next} />}
      {giftLevel && giftItem && <LevelUpGift key={giftLevel} level={giftLevel} item={giftItem} worn={worn} onWear={() => closeGift(true)} onLater={() => closeGift(false)} />}
    </div>
  );
}

function BadgeSheet({ badge, onClose, onGo }: { badge: Badge; onClose: () => void; onGo: (tab: NonNullable<ReturnType<typeof badgeAction>>['tab']) => void }) {
  const secretOff = badge.family === 'secret' && !badge.earned;
  const action = badgeAction(badge);
  const pct = badgePercent(badge);
  const [bg, ink] = TINT[badge.family];
  const rarity = secretOff ? 'Huy hiệu bí mật' : `Huy hiệu ${TIER_NAME[badge.tier]} · +${badgeStars(badge)}★`;
  const line = secretOff ? 'Tự khám phá nhé, không ai nói trước đâu.' : badge.earned ? `${badge.how}${badge.date ? ` Đạt ngày ${ddmm(badge.date)}.` : ''}` : badge.hint || badge.left || badge.how;
  return (
    <PhoneSheet title={secretOff ? 'Huy hiệu bí mật' : badge.title} onClose={onClose} hideTitle>
      <div className="awp-det">
        <span className="awp-bd"><BadgeIcon badge={badge} /></span>
        <span className="awp-rar awp-rar--x" style={{ '--b': bg, '--c': ink } as CSSProperties}>{rarity}</span>
        <h3>{secretOff ? '???' : badge.title}</h3>
        <p>{line}</p>
        {!badge.earned && !secretOff && (
          <>
            <div className="awp-pbar" role="progressbar" aria-label="Tiến độ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <i style={{ width: `${Math.max(pct, 3)}%`, background: FAMILY_COLOR[badge.family] }} />
            </div>
            <div className="awp-plab"><span>{pct}% xong</span><span>+{badgeStars(badge)}★ khi đạt</span></div>
          </>
        )}
        {action && <button type="button" className="rd-btn awp-act" onClick={() => onGo(action.tab)}>{action.label}</button>}
      </div>
    </PhoneSheet>
  );
}

function WardrobeSheet({ level, worn, onToggle, onClose }: { level: number; worn: SocGearId[]; onToggle: (id: SocGearId) => void; onClose: () => void }) {
  return (
    <PhoneSheet title="Đồ cho Sóc" onClose={onClose} hideTitle>
      <div className="awp-wh">
        <Soc state="idle" size={92} gear={worn} />
        <div><b>Đồ cho Sóc</b><small>Mỗi cấp mở một món · đang mặc {worn.length} món. Món đội đầu chỉ chọn một.</small></div>
      </div>
      <div className="awp-wd">
        {GEAR.map(g => {
          const owned = g.level <= level, on = worn.includes(g.id);
          return owned
            ? <button key={g.id} type="button" className={'awp-wi' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => onToggle(g.id)}><span className="ic">{g.emoji}</span>{g.label}<small>cấp {g.level}</small></button>
            : <div key={g.id} className="awp-wi is-lock" aria-label={`${g.label}, mở ở cấp ${g.level}`}><span className="ic">{g.emoji}</span>{g.label}<small>🔒 cấp {g.level}</small></div>;
        })}
      </div>
      <button type="button" className="rd-btn rd-btn--violet awp-done" onClick={onClose}>Xong</button>
    </PhoneSheet>
  );
}
