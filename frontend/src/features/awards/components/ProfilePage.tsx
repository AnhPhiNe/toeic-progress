import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Lock, Pencil, X } from 'lucide-react';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { NavTabId, UserProfile } from '@/shared/types';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { SOC_COATS, coatSwatch, type SocCoatId } from '@/shared/ui/soc/socCoat';
import { GEAR, gearAtLevel, gearItem, sanitizeGear, toggleGear, wornGear, type RankGearBase, type SocGearId } from '@/shared/ui/soc/socGear';
import { socIdentity, withSocCoat, withSocName } from '@/shared/ui/soc/socIdentity';
import { PhoneSheet } from '@/app/components/phone';
import type { RankState, RankTierKey } from '@/features/league/services/rankApi';
import { medalSvg, roomScene, tierIndex, tierLook } from '@/features/league/lib/rankArt';
import { computeBadges } from '../lib/badges';
import { GROUPS, TIER_COLORS, TIER_LABEL, badgeLabel, badgeLines, badgeValues, computeTierBadges, earnedTiers, fmtValue, loadBest, markTiersSeen, saveBest, segmentFill, type TierBadge } from '../lib/badgeTiers';
import { levelProgress, markLevelSeen, pendingLevelUps } from '../lib/levels';
import { LevelUpGift } from './LevelUpGift';
import './awardsDesk.css';
import { levelStars, loadOwnedGear } from '../lib/outfit';
import '@/features/league/components/rank.css';
import './profile.css';

interface Props {
  bundle: DataBundle;
  today: string;
  owner: string | null;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
  /** Xếp hạng state when signed in: season rewards and this season's best rank. */
  rank?: RankState | null;
  onGoTab: (tab: NavTabId) => void;
  onBack: () => void;
}

/** Season reward slots shown in Tủ đồ, with the rank that earns them. */
const RANK_SLOTS: readonly { base: RankGearBase; label: string; tier: RankTierKey }[] = [
  { base: 'frame-vang', label: 'Khung Vàng', tier: 'vang' },
  { base: 'khan-ngoc', label: 'Khăn ngọc', tier: 'bach-kim' },
  { base: 'ao-choang', label: 'Áo choàng mùa', tier: 'kim-cuong' },
  { base: 'vuong-mien', label: 'Vương miện mùa', tier: 'cao-thu' }
];

interface WardItem { id: string; label: string; sub: string; state: 'on' | 'free' | 'locked' | 'soon'; gear: string[] }

/** Hồ sơ của Sóc: level, Tủ đồ with a big preview, and 20 badges × 3 tiers (Thành tích folded in). */
export function ProfilePage({ bundle, today, owner, onUpdateProfile, rank, onGoTab, onBack }: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const owned = useMemo(() => rank?.rewards ? rank.rewards.flatMap(r => r.cosmetics) : loadOwnedGear(owner), [rank, owner]);
  const progress = useMemo(() => levelProgress(levelStars(bundle, today, owner)), [bundle, today, owner]);
  const lvl = progress.level.n;
  const badges = useMemo(() => computeTierBadges(badgeValues(bundle, today), loadBest(owner), computeBadges(bundle, today)), [bundle, today, owner]);
  useEffect(() => { saveBest(owner, badges); markTiersSeen(badges, owner); }, [badges, owner]);

  const identity = socIdentity(bundle.profile);
  const saved = wornGear(bundle.profile.socGear, lvl, owned);
  const [coat, setCoat] = useState<SocCoatId>(identity.coat);
  const [gear, setGear] = useState<SocGearId[]>(saved);
  const savedKey = saved.join(',') + identity.coat;
  useEffect(() => { setGear(wornGear(bundle.profile.socGear, lvl, owned)); setCoat(identity.coat); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = gear.join(',') !== saved.join(',') || coat !== identity.coat;
  const [justSaved, setJustSaved] = useState(false);
  const save = () => {
    onUpdateProfile(p => ({ ...withSocCoat(p, coat), socGear: sanitizeGear(gear, lvl, owned) }));
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  };

  const items = useMemo<WardItem[]>(() => {
    const out: WardItem[] = GEAR.map(g => ({ id: g.id, label: g.label, gear: [g.id],
      state: g.level > lvl ? 'locked' : gear.includes(g.id) ? 'on' : 'free',
      sub: g.level > lvl ? `Cấp ${g.level}` : gear.includes(g.id) ? 'Đang đeo' : `Cấp ${g.level}` }));
    const best = rank?.rank ? Math.max(tierIndex(rank.rank.tier), rank.rank.best ? tierIndex(rank.rank.best.tier) : 0) : -1;
    const season = rank?.season.number ?? 1;
    const ownedIds = owned.filter(id => gearItem(id));
    const bySeason = (a: string, b: string) => (gearItem(a)?.season ?? 0) - (gearItem(b)?.season ?? 0);
    if (ownedIds.some(id => id.startsWith('frame-bac.')) && !ownedIds.some(id => id.startsWith('frame-vang.'))) {
      const id = ownedIds.filter(x => x.startsWith('frame-bac.')).sort(bySeason).slice(-1)[0];
      out.push({ id, label: 'Khung Bạc', gear: [id], state: gear.includes(id as SocGearId) ? 'on' : 'free', sub: gear.includes(id as SocGearId) ? 'Đang đeo' : `Quà mùa ${gearItem(id)!.season}` });
    }
    for (const slot of RANK_SLOTS) {
      const mine = ownedIds.filter(id => id.startsWith(slot.base + '.')).sort(bySeason).slice(-1)[0];
      if (mine) out.push({ id: mine, label: slot.label, gear: [mine], state: gear.includes(mine as SocGearId) ? 'on' : 'free', sub: gear.includes(mine as SocGearId) ? 'Đang đeo' : `Quà mùa ${gearItem(mine)!.season}` });
      else if (best >= tierIndex(slot.tier)) out.push({ id: `${slot.base}.m${season}`, label: slot.label, gear: [`${slot.base}.m${season}`], state: 'soon', sub: `Cuối mùa ${season}` });
      // Locked season cape and crown look like the level items of the same name: only shown once in reach.
      else if (slot.base === 'frame-vang' || slot.base === 'khan-ngoc') out.push({ id: `${slot.base}.m${season}`, label: slot.label, gear: [`${slot.base}.m${season}`], state: 'locked', sub: tierLook(slot.tier).name });
    }
    return out;
  }, [gear, lvl, owned, rank]);
  const toggle = (item: WardItem) => { if (item.state === 'on' || item.state === 'free') setGear(g => toggleGear(g, item.id as SocGearId, lvl, owned)); };

  // Level-up gift (from Thành tích): the newly unlocked item drops onto Sóc once.
  const [gifts, setGifts] = useState<number[]>([]);
  useEffect(() => { setGifts(pendingLevelUps(lvl, owner)); }, [lvl, owner]);
  const giftLevel = gifts[0];
  const giftItem = giftLevel ? gearAtLevel(giftLevel) : undefined;
  const closeGift = (wear: boolean) => {
    if (!giftLevel) return;
    if (wear && giftItem) onUpdateProfile(p => ({ ...p, socGear: sanitizeGear([...wornGear(p.socGear, lvl, owned), giftItem.id], lvl, owned) }));
    markLevelSeen(giftLevel, owner);
    setGifts(g => g.slice(1));
  };
  const gift = giftLevel && giftItem
    ? <LevelUpGift key={giftLevel} level={giftLevel} item={giftItem} worn={saved} socName={identity.name} onWear={() => closeGift(true)} onLater={() => closeGift(false)} />
    : null;

  const nextGear = progress.next ? gearAtLevel(progress.next.n) : undefined;
  const levelCard = (
    <div className="pf-lvl">
      <div className="pf-lvl__h"><b>Cấp {lvl} · {progress.level.name}</b><span><b>{progress.stars}</b>{progress.next ? `/${progress.next.stars}` : ''}★</span></div>
      <div className="pf-bar" role="progressbar" aria-label="Tiến độ lên cấp" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)}><i style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
      <p>{progress.next ? `còn ${progress.toNext}★ lên Cấp ${progress.next.n}${nextGear ? `, mở khoá ${nextGear.label}` : ''}` : 'Cấp cao nhất rồi!'}</p>
    </div>
  );
  const nameEditor = <SocName name={identity.name} onSave={name => onUpdateProfile(p => withSocName(p, name))} />;
  const wardrobe = <Wardrobe items={items} coat={coat} setCoat={setCoat} toggle={toggle} />;
  const saveBtn = <button type="button" className="rd-btn pf-save" onClick={save} disabled={!dirty && !justSaved}>{justSaved ? 'Đã lưu' : 'Lưu bộ đồ'}</button>;
  const [open, setOpen] = useState<TierBadge | null>(null);
  const badgeGrid = <BadgeGrid badges={badges} selected={open?.id} onOpen={setOpen} />;
  const detail = open && <BadgeDetail badge={open} isPhone={isPhone} onClose={() => setOpen(null)} onGo={tab => { setOpen(null); onGoTab(tab); }} />;
  const tiers = earnedTiers(badges);

  if (isPhone) return (
    <main className="rd pf is-phone" aria-labelledby="pf-title">
      <header className="pf-top">
        <button type="button" className="pf-back" onClick={onBack} aria-label="Quay lại"><ChevronLeft size={24} aria-hidden="true" /></button>
        <h1 id="pf-title">Hồ sơ của Sóc</h1>
      </header>
      <section className="pf-card pf-pid">
        <Soc state="idle" size={62} gear={saved} coat={identity.coat} />
        <div className="pf-pid__body">{nameEditor}{levelCard}</div>
      </section>
      <PhoneTabs tiers={tiers} render={tab => tab === 'tudo' ? (
        <>
          <div className="pf-stage" dangerouslySetInnerHTML={{ __html: roomScene(358, 150, 96, true, gear, coat) }} />
          {wardrobe}
          {(dirty || justSaved) && <div className="pf-pfoot">{saveBtn}</div>}
        </>
      ) : badgeGrid} />
      {detail}{gift}
    </main>
  );

  return (
    <main className="rd pf" aria-labelledby="pf-title">
      <header className="pf-top"><h1 id="pf-title">Hồ sơ của Sóc</h1></header>
      <section className="pf-card pf-ward">
        <div className="pf-room">
          <div className="pf-room__art" dangerouslySetInnerHTML={{ __html: roomScene(400, 372, 150, false, gear, coat) }} />
          <div className="pf-room__name">{nameEditor}</div>
          <div className="pf-room__lvl">{levelCard}</div>
        </div>
        <div className="pf-ward__side">
          <div className="pf-ward__h"><h2>Tủ đồ</h2><small>Chọn để Sóc mặc thử</small>{saveBtn}</div>
          {wardrobe}
        </div>
      </section>
      <section className="pf-card pf-badges" aria-labelledby="pf-badges-h">
        <div className="pf-badges__h">
          <h2 id="pf-badges-h">Huy hiệu <small>{tiers}/60 bậc</small></h2>
          <span className="pf-legend">{TIER_LABEL.slice(1).map((t, i) => <span key={t}><i style={{ background: TIER_COLORS[i] }} />{t}</span>)}</span>
        </div>
        {badgeGrid}
      </section>
      {detail}{gift}
    </main>
  );
}

function PhoneTabs({ tiers, render }: { tiers: number; render: (tab: 'tudo' | 'huyhieu') => ReactNode }) {
  const [tab, setTab] = useState<'tudo' | 'huyhieu'>('tudo');
  return (
    <>
      <div className="pf-seg" role="tablist" aria-label="Hồ sơ">
        <button type="button" role="tab" aria-selected={tab === 'tudo'} className={tab === 'tudo' ? 'is-on' : ''} onClick={() => setTab('tudo')}>Tủ đồ</button>
        <button type="button" role="tab" aria-selected={tab === 'huyhieu'} className={tab === 'huyhieu' ? 'is-on' : ''} onClick={() => setTab('huyhieu')}>Huy hiệu · {tiers}/60</button>
      </div>
      <div role="tabpanel">{render(tab)}</div>
    </>
  );
}

function SocName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  if (editing) return (
    <form className="pf-name is-edit" onSubmit={e => { e.preventDefault(); cancelled.current = false; onSave(draft); setEditing(false); }}>
      <input value={draft} maxLength={20} autoFocus aria-label="Tên của Sóc" onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setDraft(name); setEditing(false); } }}
        onBlur={() => { if (!cancelled.current) onSave(draft); cancelled.current = false; setEditing(false); }} />
    </form>
  );
  return (
    <div className="pf-name"><b>{name}</b>
      <button type="button" className="pf-pen" aria-label="Đổi tên Sóc" onClick={() => { setDraft(name); setEditing(true); }}><Pencil size={18} aria-hidden="true" /></button>
    </div>
  );
}

function Wardrobe({ items, coat, setCoat, toggle }: { items: WardItem[]; coat: SocCoatId; setCoat: (c: SocCoatId) => void; toggle: (i: WardItem) => void }) {
  return (
    <div className="pf-wd">
      <h3>Bộ lông</h3>
      <div className="pf-coats" role="radiogroup" aria-label="Bộ lông">
        {SOC_COATS.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={coat === c.id} className={'pf-coat' + (coat === c.id ? ' is-on' : '')} onClick={() => setCoat(c.id)}>
            <i style={{ background: coatSwatch(c) }} aria-hidden="true" /><span>{c.label}</span>
          </button>
        ))}
      </div>
      <h3>Đồ đeo</h3>
      <div className="pf-gear">
        {items.map(item => (
          <button key={item.id} type="button" className={'pf-gt is-' + item.state} aria-pressed={item.state === 'on' || item.state === 'free' ? item.state === 'on' : undefined}
            disabled={item.state === 'locked' || item.state === 'soon'} onClick={() => toggle(item)}>
            <span className="pf-gt__art"><Soc state="idle" size={46} gear={item.gear} coat={coat} /></span>
            <span className="pf-gt__l"><b>{item.label}</b><small>{item.state === 'locked' && <Lock size={11} aria-hidden="true" />}{item.sub}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Medal({ badge, size }: { badge: TierBadge; size: number }) {
  const color = GROUPS.find(g => g.key === badge.group)!.color;
  return <span className={'pf-medal' + (badge.tier ? '' : ' is-locked')} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: medalSvg(badge.icon, badge.tier, color) }} />;
}

function TierBar({ badge }: { badge: TierBadge }) {
  return <span className="pf-tb3" aria-hidden="true">{segmentFill(badge).map((f, k) => <u key={k} style={{ ['--f' as string]: `${Math.round(f * 100)}%`, ['--c' as string]: TIER_COLORS[k] }} />)}</span>;
}

function BadgeGrid({ badges, selected, onOpen }: { badges: TierBadge[]; selected?: string; onOpen: (b: TierBadge) => void }) {
  return (
    <div className="pf-cats">
      {GROUPS.map(g => (
        <div key={g.key} className="pf-cat" style={{ ['--cc' as string]: g.color }}>
          <h3>{g.name}</h3>
          <div className="pf-bgrid">
            {badges.filter(b => b.group === g.key).map(b => (
              <button key={b.id} type="button" className={'pf-bt' + (b.tier ? '' : ' is-locked') + (selected === b.id ? ' is-sel' : '')} onClick={() => onOpen(b)}
                aria-label={`${b.name}: ${badgeLabel(b)}`}>
                <Medal badge={b} size={60} />
                <span className="pf-bn">{b.name}</span>
                <TierBar badge={b} />
                <span className="pf-nx">{badgeLines(b).map((line, i) => <span key={i} className={i ? 'pf-nx__p' : 'pf-nx__t'}>{line}</span>)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BadgeDetail({ badge, isPhone, onClose, onGo }: { badge: TierBadge; isPhone: boolean; onClose: () => void; onGo: (tab: NavTabId) => void }) {
  const group = GROUPS.find(g => g.key === badge.group)!;
  const body = (
    <>
      <div className="pf-dt__h">
        <Medal badge={badge} size={64} />
        <div><h2>{badge.name}</h2><p>Bậc hiện tại: <b>{TIER_LABEL[badge.tier]}</b></p></div>
      </div>
      <p className="pf-dt__what">{describe(badge)}</p>
      <p className="pf-dt__label">{badgeLabel(badge)}</p>
      <ul className="pf-dt__tiers">
        {badge.th.map((t, k) => {
          const got = badge.tier > k, next = badge.tier === k;
          return (
            <li key={k} className={got ? 'is-got' : next ? 'is-next' : ''}>
              <i style={{ background: got ? TIER_COLORS[k] : '#e4e6e1' }} aria-hidden="true" />
              <span><b>{TIER_LABEL[k + 1]}</b> · {fmtValue(badge, t)} {badge.unit}</span>
              {got ? <em>Đã đạt</em> : next ? <span className="pf-dt__prog"><u><i style={{ width: `${Math.round((segmentFill(badge) as number[])[k] * 100)}%` }} /></u>{fmtValue(badge, badge.value)}/{fmtValue(badge, t)}</span> : <small>chưa mở</small>}
            </li>
          );
        })}
      </ul>
      <button type="button" className="rd-btn pf-go" onClick={() => onGo(group.tab)}>{group.cta}</button>
    </>
  );
  if (isPhone) return <PhoneSheet title={badge.name} onClose={onClose} hideTitle><div className="pf-dt">{body}</div></PhoneSheet>;
  return <DeskDialog title={badge.name} onClose={onClose}>{body}</DeskDialog>;
}

function DeskDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useModalA11y(true, onClose);
  return (
    <div className="rd pf-modal-root">
      <button type="button" tabIndex={-1} aria-label="Đóng" className="pf-dim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="pf-modal pf-dt">
        <button type="button" className="pf-x" aria-label="Đóng" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        {children}
      </div>
    </div>
  );
}

const DESCRIBE: Record<string, string> = {
  'on-streak': 'Trả lời đúng liền khi ôn thẻ câu sai. Sai một câu thì đếm lại từ 0, kỷ lục vẫn được giữ.',
  'on-clean': 'Mọi câu sai của một đề đều đã thuộc trong Sổ tay.',
  'on-hard': 'Thẻ từng sai ít nhất 2 lần, giờ nhớ đúng 3 lần liền.',
  'on-reason': 'Thẻ câu sai có ghi lý do mình sai. Ghi rõ giúp nhớ lâu hơn.',
  'on-due': 'Những ngày bạn mở Sổ tay ôn thẻ đến hạn.',
  'de-hours': 'Tổng giờ từ đề, buổi luyện và lượt bấm giờ trong app.'
};
const describe = (b: TierBadge) => DESCRIBE[b.id] ?? `Đếm ${b.what}. Chỉ là thành tích cá nhân, không ảnh hưởng điểm hạng.`;
