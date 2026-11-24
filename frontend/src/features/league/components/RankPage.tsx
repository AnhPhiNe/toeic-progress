import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Flame, Gift, RefreshCw, Shield, ArrowDown, Star, TrendingUp, X } from 'lucide-react';
import { askConfirm } from '@/shared/components/ConfirmDialog';
import { Soc } from '@/shared/ui/soc/Soc';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { PhoneSheet } from '@/app/components/phone';
import type { LeagueHandle } from '../hooks/useLeague';
import type { BoardKey, BoardRow, RankState, RankTierKey } from '../services/rankApi';
import { STAR_ACTIONS, nicknameProblem, weekRange } from '../lib/league';
import { leagueSocSvg } from '../lib/leagueSoc';
import { RANK_TIERS, climbScene, emblemSvg, rankScene, tierIndex, tierLook } from '../lib/rankArt';
import './rank.css';

interface Props {
  league: LeagueHandle;
  signedIn: boolean;
  /** Starts Google sign-in, or opens Cài đặt when sign-in is not available here. */
  onSignIn: () => void;
  onBack: () => void;
  /** What the learner's own Sóc wears, and its coat. */
  gear?: readonly string[];
  coat?: string;
}

type Tab = 'stars' | 'progress' | 'minutes' | 'streak' | 'reviews';
const TABS: readonly { key: Tab; label: string; Icon: typeof Star }[] = [
  { key: 'stars', label: 'Sao tuần', Icon: Star },
  { key: 'progress', label: 'Tiến bộ', Icon: TrendingUp },
  { key: 'minutes', label: 'Thời gian học', Icon: Clock3 },
  { key: 'streak', label: 'Chuỗi ngày', Icon: Flame },
  { key: 'reviews', label: 'Ôn câu sai', Icon: RefreshCw }
];

/** Season rewards by highest rank of the season (higher includes lower). */
const REWARDS: readonly { tier: RankTierKey; label: string; gear: string[] }[] = [
  { tier: 'vang', label: 'Khung avatar', gear: ['frame-vang.m1'] },
  { tier: 'bach-kim', label: 'Khăn ngọc', gear: ['khan-ngoc.m1'] },
  { tier: 'kim-cuong', label: 'Áo choàng', gear: ['ao-choang.m1'] },
  { tier: 'cao-thu', label: 'Vương miện', gear: ['vuong-mien.m1'] }
];

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')}` : `${m} phút`);

function seasonLabel(state: RankState, short = false) {
  const left = state.season.daysLeft;
  return `Mùa ${state.season.number}${left ? (short ? ` · ${left} ngày` : ` · còn ${left} ngày`) : ''}`;
}

function SeasonPill({ state, short }: { state: RankState; short?: boolean }) {
  return <span className="rk-season"><CalendarDays size={16} aria-hidden="true" />{seasonLabel(state, short)}</span>;
}

/** Xếp hạng: rank, season, rewards and the weekly group boards (desktop and phone). */
export function RankPage({ league, signedIn, onSignIn, onBack, gear = [], coat = 'nau' }: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const { state } = league;
  let body: ReactNode;
  if (!state && signedIn) {
    body = league.error
      ? <div className="rk-wait"><Soc state="think" size={92} /><p>{league.error}</p><button type="button" className="rd-btn rd-btn--blue" onClick={league.refresh}>Thử lại</button></div>
      : <div className="rk-wait" role="status"><Soc state="think" size={92} /><p>Đang tải bảng xếp hạng…</p></div>;
  } else if (!signedIn || !state?.member || !state.rank) {
    body = <Join guest={!signedIn} league={league} onSignIn={onSignIn} isPhone={isPhone} gear={gear} coat={coat} season={state} />;
  } else {
    body = isPhone ? <PhoneRank state={state} league={league} gear={gear} coat={coat} /> : <DeskRank state={state} league={league} gear={gear} coat={coat} />;
  }
  return (
    <main className={'rd rk' + (isPhone ? ' is-phone' : '')} aria-labelledby="rk-title">
      <header className="rk-top">
        {isPhone && <button type="button" className="rk-back" onClick={onBack} aria-label="Quay lại"><ChevronLeft size={24} aria-hidden="true" /></button>}
        <h1 id="rk-title">Xếp hạng</h1>
        {state && <SeasonPill state={state} short={isPhone} />}
      </header>
      {body}
    </main>
  );
}

/* ------------------------------------------------------------------ join */

function Join({ guest, league, onSignIn, isPhone, gear, coat, season }: { guest: boolean; league: LeagueHandle; onSignIn: () => void; isPhone: boolean; gear: readonly string[]; coat: string; season: RankState | null }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [asking, setAsking] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const issue = nicknameProblem(name);
    setProblem(issue);
    if (!issue) await league.join(name.trim().replace(/\s+/g, ' '));
  };
  const art = useMemo(() => climbScene(isPhone ? 358 : 680, isPhone ? 300 : 788, isPhone, gear, coat), [isPhone, gear, coat]);
  const perks = [
    { Icon: Shield, bg: '#e6f3fd', c: '#136fb3', t: 'Nhóm tối đa 20 bạn cùng hạng', s: 'Bảng mới mỗi thứ Hai, ai chăm học là lên.' },
    { Icon: Star, bg: '#fff3d1', c: '#d99a00', t: 'Tính bằng sao học', s: 'Không so điểm TOEIC, chỉ so công sức trong tuần.' },
    { Icon: Gift, bg: '#ffe1e9', c: '#d6416a', t: 'Quà cuối mùa cho Sóc', s: 'Khung avatar, khăn, áo choàng theo hạng cao nhất.' }
  ];
  return (
    <section className="rk-join" aria-label="Tham gia xếp hạng">
      <div className="rk-join__art" dangerouslySetInnerHTML={{ __html: art }} />
      <div className="rk-join__text">
        <p className="rk-kick">MÙA {season?.season.number ?? 1} ĐANG DIỄN RA</p>
        <h2>Học đều mỗi tuần, leo từ <span className="is-dong">Đồng</span> lên <span className="is-cao">Cao thủ</span></h2>
        <ul className="rk-perks">
          {perks.map(p => <li key={p.t}><i style={{ background: p.bg, color: p.c }}><p.Icon size={20} aria-hidden="true" /></i><span><b>{p.t}</b><small>{p.s}</small></span></li>)}
        </ul>
        {guest ? (
          <>
            <button type="button" className="rd-btn rk-go" onClick={onSignIn}>Đăng nhập để tham gia</button>
            <p className="rk-note">Cần đăng nhập để giữ hạng giữa các máy. Bảng chỉ hiện biệt danh bạn chọn.</p>
          </>
        ) : !asking ? (
          <>
            <button type="button" className="rd-btn rk-go" onClick={() => setAsking(true)}>Tham gia</button>
            <p className="rk-note">Bảng chỉ hiện biệt danh bạn chọn, không có tên thật hay điểm TOEIC.</p>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="rk-joinform">
            <label className="rk-field">
              <span>Biệt danh</span>
              <input value={name} autoFocus onChange={event => { setName(event.target.value); setProblem(''); }} maxLength={20}
                placeholder="Ví dụ: Sóc Nâu" aria-invalid={problem ? true : undefined} aria-describedby="rk-name-hint" />
            </label>
            <small id="rk-name-hint" className={'rk-note' + (problem || league.error ? ' is-bad' : '')} role={problem || league.error ? 'alert' : undefined}>
              {problem || league.error || '2–20 ký tự · chữ, số, dấu cách · đổi được sau'}
            </small>
            <button type="submit" className="rd-btn rk-go" disabled={league.busy}>{league.busy ? 'Đang vào…' : 'Vào bảng xếp hạng'}</button>
          </form>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pieces */

function RankBar({ state, compact }: { state: RankState; compact?: boolean }) {
  const rank = state.rank!;
  const per = state.rules.pointsPerDivision;
  const pct = rank.next ? Math.min(100, Math.round((rank.points / per) * 100)) : 100;
  return (
    <div className="rk-bar-wrap">
      <div className="rk-bar" role="progressbar" aria-label="Điểm hạng" aria-valuemin={0} aria-valuemax={rank.next ? per : rank.points} aria-valuenow={rank.points}>
        <i style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tierLook(rank.tier).face}, ${tierLook(rank.tier).rim})` }} />
      </div>
      <p className="rk-bar__meta">
        <span><b>{rank.points}</b>{rank.next ? `/${per}` : ''} {compact ? '' : 'điểm hạng'}{compact && rank.next ? ` · còn ${rank.toNext} lên ${rank.next.name}` : ''}</span>
        {!compact && rank.next && <span>còn {rank.toNext} lên <b>{rank.next.name}</b></span>}
      </p>
    </div>
  );
}

function weekLine(state: RankState): string {
  const p = state.preview;
  if (!p) return '';
  const sign = p.delta > 0 ? '+' : p.delta < 0 ? '−' : '±';
  return `${sign}${Math.abs(p.delta)}`;
}

function Ladder({ state }: { state: RankState }) {
  const current = tierIndex(state.rank!.tier);
  return (
    <div className="rk-ladder" aria-label="Các bậc">
      {RANK_TIERS.map((t, i) => (
        <span key={t.key} className={'rk-ladder__it' + (i === current ? ' is-on' : '') + (i > current ? ' is-soft' : '')} aria-current={i === current ? 'true' : undefined}>
          <i dangerouslySetInnerHTML={{ __html: emblemSvg(t.key, null, `ld${i}`) }} />
          {t.name}
        </span>
      ))}
    </div>
  );
}

function Rewards({ state, coat }: { state: RankState; coat: string }) {
  const best = Math.max(tierIndex(state.rank!.tier), state.rank!.best ? tierIndex(state.rank!.best.tier) : 0);
  return (
    <div className="rk-rewards">
      {REWARDS.map(r => {
        const got = best >= tierIndex(r.tier);
        return (
          <span key={r.tier} className={'rk-reward' + (got ? ' is-got' : '')}>
            <Soc state="idle" size={44} gear={r.gear} coat={coat as 'nau'} />
            <b>{r.label}</b>
            <small>{tierLook(r.tier).name}{got ? ' · đã đạt' : ''}</small>
          </span>
        );
      })}
    </div>
  );
}

function Rules() {
  return (
    <ul className="rk-rules">
      <li><Star size={16} aria-hidden="true" />Điểm hạng chỉ đến từ sao học mỗi tuần, không từ điểm TOEIC tự ghi.</li>
      <li><Shield size={16} aria-hidden="true" />Khiên giữ hạng: 1 tuần bận không bị trừ điểm (1 khiên mỗi mùa).</li>
      <li><ArrowDown size={16} aria-hidden="true" />Mỗi tuần tụt tối đa 1 bậc.</li>
    </ul>
  );
}

function LastWeek({ state }: { state: RankState }) {
  const w = state.rankWeek;
  if (!w || w.weekStart < addDays(state.week.start, -7)) return null;
  const text = w.after.level > w.before.level ? `Tuần trước +${w.delta} điểm, lên ${w.after.name} 🎉`
    : w.after.level < w.before.level ? `Tuần trước về ${w.after.name}. Tuần này lấy lại nhé.`
      : w.shield ? 'Tuần trước khiên giữ hạng đã đỡ cho bạn.' : `Tuần trước ${w.delta >= 0 ? '+' : '−'}${Math.abs(w.delta)} điểm hạng.`;
  return <p className="rk-lastweek">{text}</p>;
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ board */

/** Season gear a member earned (highest item of their latest award), drawn on their board avatar. */
const AWARD_GEAR: Partial<Record<RankTierKey, string>> = { 'bach-kim': 'khan-ngoc', 'kim-cuong': 'ao-choang', 'cao-thu': 'vuong-mien' };
function Avatar({ row, size }: { row: Pick<BoardRow, 'coat' | 'award' | 'nickname'>; size?: number }) {
  const ring = row.award ? tierLook(row.award.tier).rim : undefined;
  const item = row.award ? AWARD_GEAR[row.award.tier] : undefined;
  const gear = item ? [`${item}.m${row.award!.season}`] : [];
  return <span className={'rk-av' + (ring ? ' has-frame' : '')} style={{ ['--ring' as string]: ring, width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: leagueSocSvg(row.coat, row.nickname, gear) }} />;
}

function valueText(tab: Tab, v: number | null): ReactNode {
  if (v === null) return <span className="rk-val is-none">—</span>;
  if (tab === 'stars') return <span className="rk-val">{v}<i className="rk-star" aria-hidden="true">★</i><span className="sr-only"> sao</span></span>;
  if (tab === 'progress') return <span className="rk-val">{v > 0 ? '+' : ''}{v}<small> điểm</small></span>;
  if (tab === 'minutes') return <span className="rk-val">{fmtMinutes(v)}</span>;
  if (tab === 'streak') return <span className="rk-val">{v}<small> ngày</small></span>;
  return <span className="rk-val">{v}<small> câu</small></span>;
}

function Board({ state, tab, section }: { state: RankState; tab: Tab; section: 'listening' | 'reading' }) {
  const key: BoardKey = tab === 'progress' ? section : tab;
  const rows = state.boards?.[key] ?? [];
  const zones = state.zones ?? { up: 0, down: 0, size: rows.length };
  const starsTab = tab === 'stars';
  const upRows = starsTab ? rows.filter(r => r.rank <= zones.up) : [];
  const rest = starsTab ? rows.filter(r => r.rank > zones.up) : rows;
  const mine = rows.find(r => r.me);
  const edge = starsTab && zones.up ? rows.find(r => r.rank === zones.up) : undefined;
  const hint = starsTab && mine && mine.value !== null && edge && mine.rank > zones.up ? `còn ${(edge.value ?? 0) - mine.value + 1}★ là vào vùng lên hạng` : '';
  const row = (r: BoardRow) => {
    const down = starsTab && zones.down > 0 && r.rank > zones.size - zones.down;
    return (
      <li key={r.rank + r.nickname} className={'rk-row' + (r.me ? ' is-me' : '') + (down ? ' is-down' : '')} aria-current={r.me ? 'true' : undefined}>
        <span className={'rk-pos' + (r.rank <= 3 ? ` is-${r.rank}` : '')}>{r.rank}</span>
        <Avatar row={r} />
        <span className="rk-nm">
          <span className="rk-nm__top">{r.nickname}{r.me && <em>Bạn</em>}
            {r.award && tierIndex(r.award.tier) >= 2 && <small className="rk-tag" style={{ background: tierLook(r.award.tier).hi, color: tierLook(r.award.tier).deep }}>{tierLook(r.award.tier).name} · Mùa {r.award.season}</small>}
          </span>
          {r.me && hint && <small className="rk-hint">{hint}</small>}
        </span>
        {valueText(tab, r.value)}
      </li>
    );
  };
  const label = TABS.find(t => t.key === tab)!.label;
  if (!rows.length) return <p className="rk-empty">Chưa có dữ liệu cho bảng {label.toLowerCase()} trong tuần này.</p>;
  return (
    <ol className="rk-list" aria-label={`Bảng ${label}`}>
      {upRows.length > 0 && (
        <li className="rk-zone" aria-label={`Vùng lên hạng, top ${zones.up}`}>
          <p className="rk-zone__h"><TrendingUp size={15} aria-hidden="true" />Vùng lên hạng · top {zones.up} +{state.rules.topBonus} điểm hạng</p>
          <ol className="rk-zone__rows">{upRows.map(row)}</ol>
        </li>
      )}
      {rest.map(row)}
    </ol>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  return (
    <div className="rk-tabs" role="tablist" aria-label="Bảng tuần này">
      {TABS.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={'rk-tab' + (tab === t.key ? ' is-on' : '')} onClick={() => setTab(t.key)}>
          <t.Icon size={16} aria-hidden="true" />{t.label}
        </button>
      ))}
    </div>
  );
}

function SubLine({ tab, section, setSection, onHow, phone }: { tab: Tab; section: 'listening' | 'reading'; setSection: (s: 'listening' | 'reading') => void; onHow: () => void; phone?: boolean }) {
  if (tab === 'stars') return <p className="rk-sub">{phone ? 'Mọi việc học trong app đều ra sao.' : 'Ghi đề, luyện Part, ôn thẻ câu sai… việc học nào cũng ra sao.'}<button type="button" className="rk-link" onClick={onHow}>Cách kiếm sao</button></p>;
  if (tab === 'progress') return (
    <p className="rk-sub">{phone ? 'So với đề đầu · không tính hạng' : 'Điểm tăng so với đề đầu tiên · không tính điểm hạng'}
      <span className="rk-toggle" role="group" aria-label="Kỹ năng">
        <button type="button" aria-pressed={section === 'listening'} className={section === 'listening' ? 'is-on' : ''} onClick={() => setSection('listening')}>Nghe</button>
        <button type="button" aria-pressed={section === 'reading'} className={section === 'reading' ? 'is-on' : ''} onClick={() => setSection('reading')}>Đọc</button>
      </span>
    </p>
  );
  return <p className="rk-sub">{tab === 'minutes' ? 'Phút học ghi trong app tuần này' : tab === 'streak' ? 'Ngày học liền nhau tới hôm nay' : 'Thẻ ôn đúng tuần này'} · chỉ để vui, không tính điểm hạng</p>;
}

function HowStars({ state, onClose }: { state: RankState; onClose: () => void }) {
  const ref = useModalA11y(true, onClose);
  return (
    <div className="rd rk-modal-root">
      <button type="button" tabIndex={-1} aria-label="Đóng" className="rk-dim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Cách kiếm sao" tabIndex={-1} className="rk-modal">
        <div className="rk-modal__h"><h2>Cách kiếm sao</h2><button type="button" className="rk-x" aria-label="Đóng" onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
        <StarTable state={state} />
      </div>
    </div>
  );
}

function StarTable({ state }: { state: RankState }) {
  return (
    <>
      <ul className="rk-how">
        {STAR_ACTIONS.filter(a => state.starTable[a.key]).map(a => (
          <li key={a.key}><i style={{ background: a.tint }} aria-hidden="true">{a.icon}</i>{a.label}<b>+{state.starTable[a.key]}★</b></li>
        ))}
      </ul>
      <p className="rk-cap">Tối đa {state.dailyCap}★ mỗi ngày · hôm nay {state.me?.today ?? 0}/{state.dailyCap}★. Điểm hạng mỗi tuần = sao ÷ {state.rules.starsPerPoint} (tối đa +{state.rules.maxStarPoints}), top {state.zones?.up ?? 6} +{state.rules.topBonus}, {state.zones?.down ?? 5} bạn cuối −{state.rules.bottomPenalty}, tuần 0 sao −{state.rules.zeroPenalty}.</p>
    </>
  );
}

function MemberFooter({ state, league }: { state: RankState; league: LeagueHandle }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.member!.nickname);
  const [problem, setProblem] = useState('');
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const issue = nicknameProblem(name);
    setProblem(issue);
    if (!issue && await league.rename(name.trim().replace(/\s+/g, ' '))) setEditing(false);
  };
  const leave = async () => {
    if (await askConfirm({ title: 'Rời bảng xếp hạng?', message: 'Tuần này bạn vẫn giữ chỗ và vẫn được tính. Tham gia lại lúc nào cũng được.', confirmLabel: 'Rời bảng', destructive: true })) {
      void league.leave();
    }
  };
  return (
    <section className="rk-foot" aria-label="Biệt danh trên bảng">
      {editing ? (
        <form onSubmit={save} className="rk-rename" noValidate>
          <input value={name} maxLength={20} aria-label="Biệt danh mới" onChange={event => { setName(event.target.value); setProblem(''); }} autoFocus />
          <button type="submit" className="rd-btn rd-btn--blue" disabled={league.busy}>Lưu</button>
          <button type="button" className="rk-link" onClick={() => { setEditing(false); setName(state.member!.nickname); setProblem(''); }}>Huỷ</button>
          {(problem || league.error) && <small className="rk-note is-bad" role="alert">{problem || league.error}</small>}
        </form>
      ) : (
        <>
          <span>Biệt danh: <b>{state.member!.nickname}</b></span>
          <button type="button" className="rk-link" onClick={() => setEditing(true)}>Sửa</button>
          <button type="button" className="rk-link is-quiet" onClick={leave} disabled={league.busy}>Rời bảng</button>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ desktop */

function DeskRank({ state, league, gear, coat }: { state: RankState; league: LeagueHandle; gear: readonly string[]; coat: string }) {
  const [tab, setTab] = useState<Tab>('stars');
  const [section, setSection] = useState<'listening' | 'reading'>('listening');
  const [how, setHow] = useState(false);
  const rank = state.rank!;
  const scene = useMemo(() => rankScene(440, 188, false, rank.tier, rank.division, gear, coat), [rank.tier, rank.division, gear, coat]);
  const group = state.group;
  return (
    <div className="rk-grid">
      <div className="rk-left">
        <section className="rk-card rk-hero" aria-label="Hạng của bạn">
          <div className="rk-hero__art" dangerouslySetInnerHTML={{ __html: scene }} />
          <div className="rk-hero__body">
            <div className="rk-hero__row">
              <h2 style={{ color: tierLook(rank.tier).deep }}>{rank.name}</h2>
              <span className={'rk-shield' + (rank.shield ? '' : ' is-used')}><Shield size={16} aria-hidden="true" />{rank.shield ? '1 khiên giữ hạng' : 'Đã dùng khiên mùa này'}</span>
            </div>
            <RankBar state={state} />
            {state.preview && <p className="rk-week">Tuần này đang <b className={state.preview.delta >= 0 ? 'is-up' : 'is-down'}>{weekLine(state)}</b> điểm từ {state.preview.stars}★</p>}
            <LastWeek state={state} />
          </div>
        </section>
        <section className="rk-card rk-pad"><h3>Các bậc</h3><Ladder state={state} /></section>
        <section className="rk-card rk-pad"><h3>Quà cuối mùa <small>theo hạng cao nhất trong mùa</small></h3><Rewards state={state} coat={coat} /></section>
        <Rules />
        <MemberFooter state={state} league={league} />
      </div>
      <section className="rk-card rk-board" aria-label="Bảng nhóm tuần này">
        <div className="rk-board__h">
          <h2>Nhóm {group ? tierLook(rank.tier).name : ''} · {state.zones?.size ?? group?.size ?? 0} bạn</h2>
          <span>{weekRange(state.week.start).replace(' – ', ' – ')} · còn {state.week.daysLeft} ngày</span>
        </div>
        <Tabs tab={tab} setTab={setTab} />
        <SubLine tab={tab} section={section} setSection={setSection} onHow={() => setHow(true)} />
        <div className="rk-scroll"><Board state={state} tab={tab} section={section} /></div>
      </section>
      {how && <HowStars state={state} onClose={() => setHow(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ phone */

function PhoneRank({ state, league, gear, coat }: { state: RankState; league: LeagueHandle; gear: readonly string[]; coat: string }) {
  const [tab, setTab] = useState<Tab>('stars');
  const [section, setSection] = useState<'listening' | 'reading'>('listening');
  const [sheet, setSheet] = useState<'rules' | 'how' | null>(null);
  const rank = state.rank!;
  const art = useMemo(() => rankScene(120, 120, true, rank.tier, rank.division, gear, coat), [rank.tier, rank.division, gear, coat]);
  return (
    <div className="rk-phone">
      <section className="rk-card rk-phero" aria-label="Hạng của bạn">
        <div className="rk-phero__art" dangerouslySetInnerHTML={{ __html: art }} />
        <div className="rk-phero__body">
          <h2 style={{ color: tierLook(rank.tier).deep }}>{rank.name}</h2>
          <RankBar state={state} compact />
          <div className="rk-phero__row">
            <span className={'rk-shield' + (rank.shield ? '' : ' is-used')}><Shield size={15} aria-hidden="true" />{rank.shield ? '1 khiên' : 'Hết khiên'}</span>
            <button type="button" className="rk-link" onClick={() => setSheet('rules')}>Quà &amp; luật<ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </section>
      {state.preview && <p className="rk-week is-phone">Tuần này đang <b className={state.preview.delta >= 0 ? 'is-up' : 'is-down'}>{weekLine(state)}</b> điểm từ {state.preview.stars}★ · còn {state.week.daysLeft} ngày</p>}
      <Tabs tab={tab} setTab={setTab} />
      <SubLine tab={tab} section={section} setSection={setSection} onHow={() => setSheet('how')} phone />
      <Board state={state} tab={tab} section={section} />
      <MemberFooter state={state} league={league} />
      {sheet === 'rules' && (
        <PhoneSheet title={`Quà & luật mùa ${state.season.number}`} onClose={() => setSheet(null)}>
          <h3 className="rk-sheet-h">Các bậc</h3>
          <Ladder state={state} />
          <h3 className="rk-sheet-h">Quà cuối mùa <small>theo hạng cao nhất</small></h3>
          <Rewards state={state} coat={coat} />
          <Rules />
          <button type="button" className="rd-btn rk-go" onClick={() => setSheet(null)}>Đã hiểu</button>
        </PhoneSheet>
      )}
      {sheet === 'how' && (
        <PhoneSheet title="Cách kiếm sao" onClose={() => setSheet(null)}>
          <StarTable state={state} />
          <button type="button" className="rd-btn rk-go" onClick={() => setSheet(null)}>Đã hiểu</button>
        </PhoneSheet>
      )}
    </div>
  );
}
