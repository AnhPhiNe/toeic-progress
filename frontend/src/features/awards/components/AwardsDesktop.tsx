import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { gearAtLevel, sanitizeGear, toggleGear, wornGear, type SocGearId } from '@/shared/ui/soc/socGear';
import { FAMILY_COLOR, FAMILY_LABEL, FAMILY_ORDER, badgeStars, badgeTip, computeBadges, ddmm, pickQuests, totalStars, type Badge, type BadgeFamily } from '../lib/badges';
import { levelProgress, markLevelSeen, pendingLevelUps } from '../lib/levels';
import { isFirstVisit, markVisited } from '../lib/seen';
import { useBadgeReveal } from '../lib/useBadgeReveal';
import { BadgeIcon } from './BadgeIcon';
import { FlipReveal } from './FlipReveal';
import { GearPanel } from './GearPanel';
import { socIdentity, withSocCoat, withSocName } from '@/shared/ui/soc/socIdentity';
import { LevelUpGift } from './LevelUpGift';
import './awards.css';
import './awardsDesk.css';

interface Props {
  bundle: DataBundle;
  today: string;
  owner: string | null;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
}

const TINT: Record<BadgeFamily, [string, string]> = {
  score: ['#fff4dc', '#a86a00'], streak: ['#ffe9ee', '#d6416a'], effort: ['#e6f8ea', '#24894f'],
  part: ['#e6f1ff', '#2c5fd6'], speed: ['#dcf6f8', '#0b8a99'], secret: ['#f1e9ff', '#6a3fe0']
};
const QUEST_BAR: Record<BadgeFamily, string> = {
  score: '#ffd25e,#ff9a2e', streak: '#ff8a5c,#ff3d6e', effort: '#7be08f,#2fb36b', part: '#6fc3ff,#3d6dff', speed: '#5eead4,#0ea5b7', secret: '#c9a3ff,#7c4dff'
};
const TAB_KEY = 'rd_awards_tab_v1';
const CONFETTI = ['#ffe58f', '#ff9eb8', '#7be08f', '#7ec8ff', '#ffffff'];
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 0 → target over about a second, only when `on`; otherwise the target at once. */
function useCountUp(target: number, on: boolean): number {
  const [value, setValue] = useState(on ? 0 : target);
  useEffect(() => {
    if (!on) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start - 350) / 1100);
      setValue(Math.round(target * (1 - (1 - Math.max(0, t)) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, on]);
  return value;
}

const RING_R = 80, RING_C = 2 * Math.PI * RING_R;

/** Thành tích, desktop (design/previews/mock-awards-v4.html, "C mới"). */
export function AwardsDesktop({ bundle, today, owner, onUpdateProfile }: Props) {
  const badges = useMemo(() => computeBadges(bundle, today), [bundle, today]);
  const quests = useMemo(() => pickQuests(badges), [badges]);
  const reveal = useBadgeReveal(badges, owner);
  const stars = totalStars(badges);
  const lp = levelProgress(stars);
  const lvl = lp.level.n;
  const worn = wornGear(bundle.profile.socGear, lvl);

  // First visit only: confetti falls, stars count up, the ring runs to its mark.
  const [first] = useState(() => isFirstVisit(owner) && !reduced());
  useEffect(() => { markVisited(owner); }, [owner]);
  const shownStars = useCountUp(stars, first);
  const [ringOn, setRingOn] = useState(!first);
  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => { setRingOn(true); setBarsOn(true); }, first ? 350 : 60);
    return () => window.clearTimeout(t);
  }, [first]);

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

  // Tooltip (fixed, so scrolling shelves never clip it).
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const showTip = (b: Badge, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ text: badgeTip(b), x: Math.min(window.innerWidth - 140, Math.max(140, r.left + r.width / 2)), y: r.top });
  };
  const tilt = (e: MouseEvent<HTMLElement>) => {
    const art = e.currentTarget.querySelector<HTMLElement>('.awd-bd');
    if (!art || reduced()) return;
    const r = e.currentTarget.getBoundingClientRect();
    art.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 36}deg`);
    art.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 24}deg`);
  };

  const earned = badges.filter(b => b.earned);
  const newest = [...earned].filter(b => b.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const nearIdx = quests.findIndex(q => q.progress >= 0.6);

  // Family tabs: the remembered one, else the newest badge's family, else the first quest's.
  const [tab, setTab] = useState<BadgeFamily>(() => {
    try { const saved = localStorage.getItem(TAB_KEY); if (FAMILY_ORDER.includes(saved as BadgeFamily)) return saved as BadgeFamily; } catch { /* no storage */ }
    return newest?.family ?? quests[0]?.family ?? FAMILY_ORDER[0];
  });
  const chooseTab = (fam: BadgeFamily) => { setTab(fam); setTip(null); try { localStorage.setItem(TAB_KEY, fam); } catch { /* remembered next time only with storage */ } };
  const tabItems = badges.filter(b => b.family === tab);
  const [gearOpen, setGearOpen] = useState(false);
  const gearBtn = useRef<HTMLButtonElement>(null);

  return (
    <div className="rd awd-page">
      <section className="awd-hero">
        <span className="awd-rays" />
        {Array.from({ length: 34 }, (_, i) => (
          <i key={i} className={'awd-conf' + (first ? ' is-fall' : '')}
            style={{ left: `${(i * 137) % 1080}px`, top: `${(i * 53) % 270}px`, width: i % 3 ? 8 : 5, height: i % 3 ? 4 : 9, background: CONFETTI[i % 5], transform: `rotate(${i * 41}deg)`, animationDelay: `${(i % 7) * 0.18}s` }} />
        ))}
        <div className="awd-lvl">
          <small>CẤP CỦA BẠN</small>
          <h1 className={lp.level.name.length > 12 ? 'is-long' : ''}>Cấp {lvl} · <em>{lp.level.name}</em></h1>
          <svg className="awd-ring" viewBox="0 0 200 200" role="img" aria-label={`${stars} sao`}>
            <circle cx="100" cy="100" r={RING_R} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.22)" strokeWidth="18" />
            <circle className="awd-ring-fill" cx="100" cy="100" r={RING_R} fill="none" stroke="#ffd25e" strokeWidth="18" strokeLinecap="round"
              strokeDasharray={`${RING_C * (ringOn ? lp.ratio : 0)} ${RING_C}`} opacity={lp.ratio > 0 ? 1 : 0} transform="rotate(-90 100 100)" />
            <text x="100" y="114" textAnchor="middle" fontWeight="900" fontSize="46" fill="#fff">{shownStars}<tspan fontSize="30" fill="#ffd25e" dx="4">★</tspan></text>
          </svg>
          <p className="awd-next">{lp.next ? <>còn <b>{lp.toNext} sao</b> lên cấp {lp.next.n}</> : 'Cấp cao nhất rồi!'}</p>
          <Soc state="cheerC" size={104} gear={worn} className="awd-soc" />
          <button type="button" className="awd-gearbtn" aria-expanded={gearOpen} onClick={() => setGearOpen(o => !o)} ref={gearBtn}>👕 Đổi đồ cho Sóc</button>
        </div>
        <div className="awd-shelf">
          <h3>Sắp mở khoá <span>vàng 3 ★ · bạc 2 ★ · đồng 1 ★</span></h3>
          <div className="awd-quests">
            {quests.map((q, k) => {
              const pct = Math.round(q.progress * 100);
              return (
                <div key={q.id} className={'awd-qc' + (k === nearIdx ? ' is-near' : '')}>
                  <span className="awd-qstar">+{badgeStars(q)} ★</span>
                  <div className="awd-qbd"><BadgeIcon badge={q} /></div>
                  <div className="awd-qtx"><b>{q.title}</b><p>{q.hint}</p></div>
                  <div className="awd-pbrow">
                    <div className="awd-pb"><i style={{ width: barsOn ? `${Math.max(pct, 3)}%` : '0%', background: `linear-gradient(90deg,${QUEST_BAR[q.family]})` }} /></div>
                    <span>{pct}%</span>
                  </div>
                </div>
              );
            })}
            {!quests.length && <div className="awd-qc awd-qdone"><b>Bạn đã mở hết huy hiệu thường!</b></div>}
          </div>
        </div>
      </section>

      <div className="awd-colhead">
        <div className="awd-coltitle"><b>Bộ sưu tập · {earned.length}/{badges.length}</b>{newest && <small>mới nhất: {newest.title} · {ddmm(newest.date)}</small>}</div>
        <div className="awd-tabs" role="tablist" aria-label="Nhóm huy hiệu">
          {FAMILY_ORDER.map(fam => {
            const items = badges.filter(b => b.family === fam);
            const on = fam === tab;
            return (
              <button key={fam} type="button" role="tab" aria-selected={on} className={'awd-tab' + (on ? ' is-on' : '')}
                style={{ '--tint': TINT[fam][0], '--ink': TINT[fam][1], '--solid': FAMILY_COLOR[fam] } as CSSProperties} onClick={() => chooseTab(fam)}>
                {FAMILY_LABEL[fam]} <span>{items.filter(b => b.earned).length}/{items.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="awd-col" role="tabpanel" style={{ background: TINT[tab][0] }}>
        <div className="awd-items" key={tab}>
          {tabItems.map((b, i) => {
            const secretOff = b.family === 'secret' && !b.earned;
            return (
              <div key={b.id} className={'awd-cell' + (b.earned ? ' is-on' : ' is-off')} tabIndex={0} aria-label={`${secretOff ? 'Huy hiệu bí mật' : b.title}${b.earned ? ', đã có' : ', chưa có'}`}
                onMouseEnter={e => showTip(b, e.currentTarget)} onMouseMove={b.earned ? tilt : undefined}
                onMouseLeave={e => { setTip(null); e.currentTarget.querySelector<HTMLElement>('.awd-bd')?.removeAttribute('style'); }}
                onFocus={e => showTip(b, e.currentTarget)} onBlur={() => setTip(null)}
                onClick={() => b.earned && reveal.show(b)} onKeyDown={e => { if (b.earned && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); reveal.show(b); } }}>
                <div className={'awd-bd' + (reveal.popped.has(b.id) ? ' is-pop' : '')}><BadgeIcon badge={b} shineDelay={(i * 0.7) % 4} /></div>
                <b>{secretOff ? '???' : b.title}</b>
                <small>{b.earned ? ddmm(b.date) || 'đã có' : secretOff ? 'tự khám phá' : b.left}</small>
              </div>
            );
          })}
        </div>
      </section>

      {gearOpen && gearBtn.current && <GearPanel anchor={gearBtn.current} level={lvl} worn={worn} onToggle={toggle}
        identity={socIdentity(bundle.profile)} onCoat={coat => onUpdateProfile(p => withSocCoat(p, coat))} onName={name => onUpdateProfile(p => withSocName(p, name))}
        onClose={() => setGearOpen(false)} />}
      {tip && <div className="awd-tip" style={{ left: tip.x, top: tip.y } as CSSProperties} role="tooltip">{tip.text}</div>}
      {reveal.current && <FlipReveal badge={reveal.current} remaining={reveal.remaining} flipped={reveal.flipped} onFlip={() => reveal.setFlipped(true)} onNext={reveal.next} />}
      {giftLevel && giftItem && <LevelUpGift key={giftLevel} level={giftLevel} item={giftItem} worn={worn} socName={socIdentity(bundle.profile).name} onWear={() => closeGift(true)} onLater={() => closeGift(false)} />}
    </div>
  );
}
