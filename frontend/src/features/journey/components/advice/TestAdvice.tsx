import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { MistakeEntry, StudySession, SuggestedTask, UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { generateUUID } from '@/shared/domain/uuid';
import { requestAISignIn } from '@/shared/lib/aiSignIn';
import { hasSuggestion, suggestionId } from '@/features/today/lib/suggestedTasks';
import { ddmm } from '../../lib/journeyData';
import {
  adviceAction, adviceFingerprint, adviceRequestBody, adviceSnapshot, classifyAdviceError, hasAdviceConsent, headline,
  isStale, nextMonthStart, parseReport, praiseLine, readAdvice, rememberAdviceConsent, saveAdvice,
  type AdviceAction, type AdviceFailure, type AdvicePriority, type AdviceUsage, type CachedAdvice
} from '../../lib/attemptAdvice';
import { adviceAccount, adviceEnabled, postAnalyzeAttempt, readAdviceUsage, type AdviceAccount } from '../../services/adviceTransport';
import './advice.css';

interface Props {
  session: StudySession;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  profile: UserProfile;
  today: string;
  /** Adds the one-off task to Hôm nay (stored on the profile). */
  onAddTask: (task: Omit<SuggestedTask, 'addedDate' | 'doneDate'>) => void;
  /** "Làm ngay": Part 5–7 → the bakery timer, otherwise this test in Sổ tay. */
  onStart: (action: AdviceAction) => void;
  /** Opened from "Nhờ Sóc xem đề này": bring the block into view. */
  focus?: boolean;
}

const NOT_USED = 'Chưa dùng lượt nào.';

/** "Sóc nhận xét đề này" in the test drawer / sheet (design/previews/mock-test-advice.html, compact result). */
export function TestAdvice(props: Props) {
  if (!adviceEnabled()) return null;
  return <TestAdviceBlock {...props} />;
}

function TestAdviceBlock({ session, sessions, mistakes, profile, today, onAddTask, onStart, focus }: Props) {
  const [account, setAccount] = useState<AdviceAccount | null>(null);
  const owner = account?.kind === 'signed' ? account.owner : null;
  const [consent, setConsent] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [cached, setCached] = useState<CachedAdvice | null>(null);
  const [usage, setUsage] = useState<AdviceUsage | null>(null);
  const [thinking, setThinking] = useState(false);
  const [failure, setFailure] = useState<AdviceFailure | null>(null);
  const [canceled, setCanceled] = useState(false);
  const [second, setSecond] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const live = useRef({ alive: true, id: session.id });
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    live.current = { alive: true, id: session.id };
    let stop = false;
    void adviceAccount().then(value => { if (!stop) setAccount(value); }, () => { if (!stop) setAccount({ kind: 'off' }); });
    return () => { stop = true; live.current.alive = false; request.current?.abort(); };
  }, [session.id]);

  useEffect(() => {
    if (!owner) return;
    setConsent(hasAdviceConsent(owner));
    setCached(readAdvice(owner, session));
    let stop = false;
    void readAdviceUsage(owner).then(value => { if (!stop && value) setUsage(value); });
    return () => { stop = true; };
  }, [owner, session]);

  useEffect(() => {
    if (focus && account) box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focus, account]);

  const snapshot = useMemo(() => adviceSnapshot(session, mistakes), [session, mistakes]);
  const praise = useMemo(() => praiseLine(session, sessions), [session, sessions]);

  if (!account || account.kind === 'off') return null;

  const run = async () => {
    if (!owner || thinking) return;
    if (!consent) { rememberAdviceConsent(owner); setConsent(true); }
    const controller = new AbortController();
    request.current = controller;
    const attempt = session.id;
    const isCurrent = () => live.current.alive && live.current.id === attempt && !controller.signal.aborted;
    setThinking(true); setFailure(null); setCanceled(false);
    try {
      const response = await postAnalyzeAttempt(adviceRequestBody(snapshot, generateUUID()), owner, isCurrent, controller.signal);
      if (!isCurrent()) return;
      if (response.usage) setUsage(response.usage);
      const report = parseReport(response.report, session, mistakes);
      if (!report) { setFailure({ kind: 'failed', message: 'Nhận xét chưa hợp lệ nên Sóc không hiện.' }); return; }
      const row: CachedAdvice = { attemptId: attempt, fingerprint: adviceFingerprint(snapshot), generatedAt: new Date().toISOString(), report };
      saveAdvice(owner, row);
      setCached(row); setSecond(false);
    } catch (error) {
      if (controller.signal.aborted) { if (live.current.alive) setCanceled(true); return; }
      if (!isCurrent()) return;
      const next = classifyAdviceError(error);
      if (next.kind === 'guest') { setAccount({ kind: 'guest' }); return; }
      if (next.kind === 'quota') setUsage(u => ({ ...(u ?? { limit: null, guest: false }), remaining: 0 }));
      setFailure(next);
    } finally {
      if (request.current === controller) request.current = null;
      if (live.current.alive && live.current.id === attempt) setThinking(false);
    }
  };
  const cancel = () => { request.current?.abort(); setThinking(false); };

  const left = usage && !usage.unlimited && typeof usage.remaining === 'number' ? usage.remaining : null;
  const quotaLine = left !== null ? <p className="ta-quota">còn {left} lượt tháng này</p> : null;
  const noAccess = usage?.enabled === false && (usage.accessStatus === 'pending' || usage.accessStatus === 'blocked');
  const outOfTurns = left === 0 || failure?.kind === 'quota';

  let body: ReactElement;
  if (account.kind === 'guest') {
    body = <Plain mood="idle" title="Đăng nhập để nhờ Sóc nhận xét" sub="Điểm và câu sai của đề vẫn xem được bình thường.">
      <button type="button" className="ta-go is-green" onClick={requestAISignIn}>Đăng nhập</button>
    </Plain>;
  } else if (thinking) {
    body = <section className="ta" aria-live="polite" aria-busy="true">
      <div className="ta-think">
        <Soc state="think" size={92} />
        <b>Sóc đang đọc đề…</b>
        <small>Có thể mất tới một phút. Bạn cứ để màn hình này, điểm và câu sai vẫn nguyên.</small>
        <span className="ta-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <button type="button" className="ta-cancel" onClick={cancel}>Huỷ</button>
    </section>;
  } else if (cached) {
    const stale = isStale(cached, snapshot);
    const note = failure ? failureText(failure, today) : null;
    body = <Result cached={cached} praise={praise} stale={stale} note={note} left={left} blocked={outOfTurns || noAccess}
      second={second} onSecond={() => setSecond(true)} onRefresh={() => void run()}
      session={session} mistakes={mistakes} profile={profile} today={today} onAddTask={onAddTask} onStart={onStart} />;
  } else if (noAccess) {
    body = <Plain mood="idle" title="Tài khoản chưa dùng được AI" sub={usage?.accessMessage || 'Tài khoản đang chờ được duyệt sử dụng AI.'} />;
  } else if (outOfTurns) {
    body = <Plain mood="idle" title="Hết lượt nhận xét tháng này" sub={`Lượt mới vào ngày ${nextMonthStart(today)}. Nhận xét đã có vẫn xem lại được.`}>
      <button type="button" className="ta-go" disabled>Nhờ Sóc xem</button>
      <p className="ta-quota">còn 0 lượt tháng này</p>
    </Plain>;
  } else if (failure) {
    const { title, sub } = failureText(failure, today);
    body = <Plain mood="think" title={title} sub={sub}>
      <button type="button" className="ta-go" onClick={() => void run()}>Thử lại</button>
      {quotaLine}
    </Plain>;
  } else {
    body = <section className="ta">
      <div className="ta-head">
        <Soc state="idle" size={52} />
        <div><b>Sóc nhận xét đề này</b><small>Sóc đọc điểm từng Part và các câu sai bạn đã ghi.</small></div>
      </div>
      {!consent && (
        <label className="ta-consent">
          <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} />
          <span>Gửi điểm và câu sai của đề này cho OpenAI để nhận xét<small>Chỉ gửi khi bạn bấm nút. Không kèm tên hay email.</small></span>
        </label>
      )}
      <button type="button" className="ta-go" disabled={!consent && !ticked} onClick={() => void run()}>Nhờ Sóc xem</button>
      {quotaLine}
      {canceled && <p className="ta-quota">Đã huỷ. Nếu Sóc đã bắt đầu đọc, lượt đó vẫn được tính.</p>}
    </section>;
  }

  return <div className="ta-wrap" ref={box} data-testid="test-advice">{body}</div>;
}

function failureText(failure: AdviceFailure, today: string): { title: string; sub: string } {
  if (failure.kind === 'failed') return { title: 'Sóc chưa đọc xong đề này', sub: 'Lượt này đã được tính. Bạn thử lại sau ít phút nhé.' };
  if (failure.kind === 'quota') return { title: 'Hết lượt nhận xét tháng này', sub: `Lượt mới vào ngày ${nextMonthStart(today)}.` };
  if (failure.kind === 'access') return { title: 'Tài khoản chưa dùng được AI', sub: failure.message };
  if (failure.kind === 'refused') {
    const sub = failure.kept && !/lượt/i.test(failure.message) ? `${failure.message} ${NOT_USED}` : failure.message;
    return { title: 'Sóc chưa xem được đề này', sub };
  }
  return { title: 'Đăng nhập để nhờ Sóc nhận xét', sub: '' };
}

function Plain({ mood, title, sub, children }: { mood: 'idle' | 'think'; title: string; sub: string; children?: ReactNode }) {
  return (
    <section className="ta is-plain" role={mood === 'think' ? 'alert' : undefined}>
      <div className="ta-head is-na">
        <Soc state={mood} size={56} />
        <div><b>{title}</b>{sub && <small>{sub}</small>}</div>
      </div>
      {children}
    </section>
  );
}

interface ResultProps {
  cached: CachedAdvice; praise: string | null; stale: boolean; note: { title: string; sub: string } | null;
  left: number | null; blocked: boolean; second: boolean; onSecond: () => void; onRefresh: () => void;
  session: StudySession; mistakes: MistakeEntry[]; profile: UserProfile; today: string;
  onAddTask: Props['onAddTask']; onStart: Props['onStart'];
}

function Result({ cached, praise, stale, note, left, blocked, second, onSecond, onRefresh, session, mistakes, profile, today, onAddTask, onStart }: ResultProps) {
  const [first, next] = cached.report.priorities;
  const card = (priority: AdvicePriority) => (
    <PriorityCard key={priority.title} priority={priority} session={session} mistakes={mistakes} profile={profile} today={today} onAddTask={onAddTask} onStart={onStart} />
  );
  return (
    <section className="ta" aria-label="Sóc nhận xét đề này">
      <div className="ta-head">
        <Soc state="idle" size={52} />
        <div>
          {praise && <p className="ta-praise">{praise}</p>}
          <b className="ta-say">{headline(first)}</b>
        </div>
      </div>
      {stale && !note && (
        <div className="ta-stale">
          <span>Bạn vừa sửa điểm hoặc câu sai, nhận xét có thể lệch.</span>
          {!blocked && <button type="button" onClick={onRefresh}>Cập nhật lại</button>}
        </div>
      )}
      {note && <div className="ta-stale is-note" role="alert"><span><b>{note.title}.</b> {note.sub}</span></div>}
      {card(first)}
      {next && (second ? card(next) : (
        <button type="button" className="ta-more" onClick={onSecond}>Còn 1 việc nữa<i aria-hidden="true">›</i></button>
      ))}
      <div className="ta-fine">
        <span>Làm ngày {ddmm(localDay(cached.generatedAt) ?? today)}</span>
        {!stale && !blocked && <button type="button" className="ta-link" onClick={onRefresh}>Cập nhật lại{left !== null ? ` · còn ${left} lượt` : ''}</button>}
      </div>
    </section>
  );
}

function localDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PriorityCard({ priority, session, mistakes, profile, today, onAddTask, onStart }: {
  priority: AdvicePriority; session: StudySession; mistakes: MistakeEntry[]; profile: UserProfile; today: string;
  onAddTask: Props['onAddTask']; onStart: Props['onStart'];
}) {
  const [open, setOpen] = useState(false);
  const action = adviceAction(priority, session, mistakes);
  const id = suggestionId(session.id, action.part, action.kind);
  const added = hasSuggestion(profile, id, today);
  return (
    <div className="ta-card">
      <button type="button" className={'ta-ob' + (open ? ' is-open' : '')} aria-expanded={open} onClick={() => setOpen(v => !v)}>{priority.observation}</button>
      <p className="ta-try"><b>Thử:</b> {priority.practice}</p>
      {added
        ? <p className="ta-go is-done" role="status">✓ Đã thêm vào Hôm nay</p>
        : <button type="button" className="ta-go is-green" onClick={() => onAddTask({ id, kind: action.kind, title: action.label, minutes: action.minutes,
            part: action.part, testName: session.testName, testDate: session.date })}>＋ Thêm vào việc hôm nay</button>}
      <button type="button" className="ta-quiet" onClick={() => onStart(action)}>Làm ngay: {action.label} · {action.minutes}′</button>
    </div>
  );
}
