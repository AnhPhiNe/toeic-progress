import { useState, type FormEvent } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Soc } from '@/shared/ui/soc/Soc';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneAvatarButton } from '@/app/components/phone';
import type { LeagueHandle } from '../hooks/useLeague';
import type { LeagueState, LeagueTier } from '../services/leagueApi';
import { STAR_ACTIONS, TIERS, TIER_COLOR, TIER_NAME, gapAbove, lowerTier, nextTier, nicknameProblem, rowZone, weekRange } from '../lib/league';
import { leagueSocSvg } from '../lib/leagueSoc';
import './league.css';

interface Props {
  league: LeagueHandle;
  signedIn: boolean;
  /** Starts Google sign-in, or opens Cài đặt when sign-in is not available here. */
  onSignIn: () => void;
  onBack: () => void;
  /** Gear the learner's own Sóc wears on the opt-in card. */
  gear?: readonly string[];
}

export function TierShield({ tier, size = 110, label = true }: { tier: LeagueTier; size?: number; label?: boolean }) {
  const [rim, face] = TIER_COLOR[tier];
  return (
    <svg className="lg-shield" viewBox="0 0 120 130" width={size} aria-hidden="true">
      <path d="M60 6 L110 24 V62 C110 96 86 118 60 126 C34 118 10 96 10 62 V24Z" fill={rim} />
      <path d="M60 16 L100 31 V62 C100 90 81 108 60 115 C39 108 20 90 20 62 V31Z" fill={face} />
      <path d="M60 38 l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" fill="#fff" />
      {label && <text x="60" y="103" textAnchor="middle" fontWeight="900" fontSize="12.5" fill="#fff">{TIER_NAME[tier].toUpperCase()}</text>}
    </svg>
  );
}

function Avatar({ coat }: { coat: string }) {
  return <span className="lg-av" aria-hidden="true" dangerouslySetInnerHTML={{ __html: leagueSocSvg(coat) }} />;
}

/** Giải đấu tuần: one page for computers and phones (full screen, reached from the avatar sheet or the 🛡 chip). */
export function LeaguePage({ league, signedIn, onSignIn, onBack, gear }: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const { state } = league;
  let body;
  if (!signedIn) body = <OptIn guest onSignIn={onSignIn} league={league} gear={gear} />;
  else if (!state) body = league.error
    ? <div className="lg-wait"><Soc state="think" size={92} /><p>{league.error}</p><button type="button" className="rd-btn rd-btn--blue" onClick={league.refresh}>Thử lại</button></div>
    : <div className="lg-wait" role="status"><Soc state="think" size={92} /><p>Đang tải giải đấu…</p></div>;
  else if (!state.member) body = <OptIn league={league} gear={gear} onSignIn={onSignIn} />;
  else body = <Board state={state} league={league} isPhone={isPhone} />;

  return (
    <main className={'rd lg' + (isPhone ? ' is-phone' : '')} aria-labelledby="lg-title">
      <header className="lg-top">
        {isPhone && <button type="button" className="lg-back" onClick={onBack} aria-label="Quay lại"><ChevronLeft size={24} aria-hidden="true" /></button>}
        <h1 id="lg-title">Giải đấu tuần</h1>
        {state && <span className="lg-week">Tuần {weekRange(state.week.start)}</span>}
        {isPhone && <PhoneAvatarButton className="lg-me" />}
      </header>
      {body}
    </main>
  );
}

function OptIn({ guest = false, league, gear, onSignIn }: { guest?: boolean; league: LeagueHandle; gear?: readonly string[]; onSignIn: () => void }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const issue = nicknameProblem(name);
    setProblem(issue);
    if (!issue) await league.join(name.trim().replace(/\s+/g, ' '));
  };
  return (
    <section className="lg-optin" aria-label="Tham gia giải đấu">
      <TierShield tier="dong" size={128} />
      <h2>Tham gia giải đấu tuần?</h2>
      <p>So sao với tối đa 19 bạn cùng hạng. Chăm thì lên hạng; không ai thấy tên thật hay điểm TOEIC của bạn.</p>
      {guest ? (
        <>
          <button type="button" className="rd-btn rd-btn--blue lg-go" onClick={onSignIn}>Đăng nhập để tham gia</button>
          <small className="lg-note">Giải đấu cần tài khoản để lưu bảng xếp hạng.</small>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <label className="lg-field">
            <Soc state="idle" size={46} gear={gear} />
            <span>
              <b>Biệt danh</b>
              <input value={name} onChange={event => { setName(event.target.value); setProblem(''); }} maxLength={20}
                placeholder="Ví dụ: Sóc Nâu" aria-invalid={problem ? true : undefined} aria-describedby="lg-name-hint" />
            </span>
          </label>
          <small id="lg-name-hint" className={'lg-note' + (problem || league.error ? ' is-bad' : '')} role={problem || league.error ? 'alert' : undefined}>
            {problem || league.error || '2–20 ký tự · chữ, số, dấu cách · đổi được sau'}
          </small>
          <button type="submit" className="rd-btn rd-btn--blue lg-go" disabled={league.busy}>{league.busy ? 'Đang vào giải…' : 'Vào giải đấu'}</button>
          <small className="lg-note">Rời giải lúc nào cũng được.</small>
        </form>
      )}
    </section>
  );
}

function Board({ state, league, isPhone }: { state: LeagueState; league: LeagueHandle; isPhone: boolean }) {
  const group = state.group!;
  const me = state.me!;
  const tier = group.tier;
  const up = nextTier(tier), down = lowerTier(tier);
  const gap = gapAbove(state);
  const table = state.mode === 'table';
  const last = state.lastWeek;
  const lastLine = last?.rank && last.outcome === 'up' ? `Tuần trước bạn về hạng ${last.rank} và lên giải ${TIER_NAME[tier]} 🎉`
    : last?.rank && last.outcome === 'down' ? `Tuần trước bạn về hạng ${last.rank}; tuần này lấy lại phong độ nhé.` : '';

  const hero = (
    <section className={'lg-hero is-' + tier} aria-label="Hạng của bạn">
      <TierShield tier={tier} size={isPhone ? 76 : 112} />
      <small>GIẢI {TIER_NAME[tier].toUpperCase()} · CÒN {state.week.daysLeft} NGÀY</small>
      {table
        ? <h2>Bạn đang hạng {me.rank}/{group.size}</h2>
        : <h2>Tuần này {me.stars}★</h2>}
      <p>{table
        ? gap ? `Còn ${gap.stars}★ là vượt ${gap.nickname}` : 'Bạn đang dẫn đầu nhóm!'
        : `Hôm nay ${me.today}/${state.dailyCap}★`}</p>
      {lastLine && <p className="lg-last">{lastLine}</p>}
      <div className="lg-tiers" aria-label="Các hạng">
        {TIERS.map(t => <span key={t} className={t === tier ? 'is-on' : undefined} aria-current={t === tier ? 'true' : undefined}>{TIER_NAME[t]}</span>)}
      </div>
    </section>
  );

  const versus = (
    <section className="lg-card lg-vs" aria-label="Bạn so với tuần trước">
      <h3>Bạn so với tuần trước</h3>
      <VersusBars last={me.lastWeekStars ?? 0} now={me.stars} />
      {!table && <p className="lg-few">Nhóm của bạn mới có {group.size} người. Khi có thêm bạn cùng hạng, bảng xếp hạng sẽ hiện ở đây.</p>}
    </section>
  );

  const list = table && (
    <ol className="lg-list" aria-label={`Bảng xếp hạng giải ${TIER_NAME[tier]}`}>
      {group.rows.map((row, index) => {
        const zone = rowZone(row, group);
        const prevZone = index > 0 ? rowZone(group.rows[index - 1], group) : null;
        return (
          <li key={row.rank} className={'lg-rw' + (row.me ? ' is-me' : '') + (zone ? ' is-' + zone : '')} aria-current={row.me ? 'true' : undefined}>
            {zone === 'up' && index === 0 && up && <p className="lg-zone is-up" aria-hidden="true">▲ VÙNG LÊN GIẢI {TIER_NAME[up].toUpperCase()} · TOP {group.promote}</p>}
            {zone === 'down' && prevZone !== 'down' && down && <p className="lg-zone is-down" aria-hidden="true">▼ VÙNG XUỐNG GIẢI {TIER_NAME[down].toUpperCase()}</p>}
            <div className="lg-rw__in">
              <span className={'lg-rk' + (row.rank <= 3 ? ' is-' + row.rank : '')}>{row.rank}</span>
              <Avatar coat={row.coat} />
              <span className="lg-nm">{row.nickname}{row.me && <small>Bạn</small>}</span>
              <span className="lg-pts">{row.stars} <i aria-hidden="true">★</i><span className="sr-only"> sao</span></span>
            </div>
          </li>
        );
      })}
    </ol>
  );

  const earn = (
    <section className="lg-card" aria-label="Kiếm sao tuần này">
      <h3>Kiếm sao tuần này</h3>
      <ul className="lg-how">
        {STAR_ACTIONS.filter(action => state.starTable[action.key]).map(action => (
          <li key={action.key}><i style={{ background: action.tint }} aria-hidden="true">{action.icon}</i>{action.label}<b>+{state.starTable[action.key]}★</b></li>
        ))}
      </ul>
      <p className="lg-cap">Tối đa {state.dailyCap}★ mỗi ngày · hôm nay {me.today}/{state.dailyCap}★ · chỉ tính việc làm thật trong app, sau khi đồng bộ.</p>
    </section>
  );

  const footer = <MemberFooter state={state} league={league} />;

  if (isPhone) return <div className="lg-col">{hero}{table ? list : versus}{earn}{footer}</div>;
  return (
    <div className="lg-grid">
      <div className="lg-col">{hero}{table ? list : versus}</div>
      <div className="lg-col">{earn}{table && versus}{footer}</div>
    </div>
  );
}

function VersusBars({ last, now }: { last: number; now: number }) {
  const top = Math.max(last, now, 1);
  return (
    <div className="lg-bars">
      <div><i style={{ height: `${Math.max(8, Math.round(84 * last / top))}px` }} /><b>{last}★</b><small>tuần trước</small></div>
      <div className="is-now"><i style={{ height: `${Math.max(8, Math.round(84 * now / top))}px` }} /><b>{now}★</b><small>tuần này</small></div>
    </div>
  );
}

function MemberFooter({ state, league }: { state: LeagueState; league: LeagueHandle }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.member!.nickname);
  const [problem, setProblem] = useState('');
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const issue = nicknameProblem(name);
    setProblem(issue);
    if (!issue && await league.rename(name.trim().replace(/\s+/g, ' '))) setEditing(false);
  };
  const leave = () => {
    if (window.confirm('Rời giải đấu? Bạn sẽ không còn trong bảng tuần này. Tham gia lại lúc nào cũng được.')) void league.leave();
  };
  return (
    <section className="lg-foot" aria-label="Biệt danh trong giải">
      {editing ? (
        <form onSubmit={save} className="lg-rename" noValidate>
          <input value={name} maxLength={20} aria-label="Biệt danh mới" onChange={event => { setName(event.target.value); setProblem(''); }} autoFocus />
          <button type="submit" className="rd-btn rd-btn--blue" disabled={league.busy}>Lưu</button>
          <button type="button" className="lg-link" onClick={() => { setEditing(false); setName(state.member!.nickname); setProblem(''); }}>Huỷ</button>
          {(problem || league.error) && <small className="lg-note is-bad" role="alert">{problem || league.error}</small>}
        </form>
      ) : (
        <>
          <Avatar coat={state.member!.coat} />
          <span>Biệt danh: <b>{state.member!.nickname}</b></span>
          <button type="button" className="lg-link" onClick={() => setEditing(true)}>Sửa</button>
          <button type="button" className="lg-link is-quiet" onClick={leave} disabled={league.busy}>Rời giải</button>
        </>
      )}
    </section>
  );
}
