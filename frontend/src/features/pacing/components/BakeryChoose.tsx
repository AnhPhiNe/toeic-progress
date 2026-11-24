import { useEffect, useRef, useState } from 'react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import type { StudySession } from '@/shared/types';
import type { PacingMode } from '../lib/pacingModel';
import { dishName, dishOf, formatSpan, paceWords, recipeSteps, type Dish, type PaceTag } from '../lib/bakery';
import { Awning, BulbsG, ChefSoc, DishIcon, Dome, ItemArt, Oven } from './BakeryArt';

export interface BakeryChoice { mode: PacingMode; label: string; questions: number; minutes: number; record: string | null }
export interface RecentRow { id: string; session: StudySession; dish: Dish; title: string; sub: string; tag: PaceTag | null }

interface Props {
  mode: PacingMode;
  label: string;
  choices: BakeryChoice[];
  part7Options?: BakeryChoice[];
  /** Reason line under the headline. */
  reason: string;
  /** Time of the latest run of the chosen Part ("52:10"), for Sóc's bubble. */
  lastTime: string | null;
  minutes: number;
  canMinus: boolean;
  recent: RecentRow[];
  weekCount: number;
  error: string;
  onPick: (mode: PacingMode) => void;
  onStart: () => void;
  onMinutes: (delta: number) => void;
  onLog: () => void;
  onOpenSession: (session: StudySession) => void;
}

const REDUCED = '(prefers-reduced-motion: reduce)';
const SHOWN = 4;

/** Chọn món (Desktop): balanced 2-column bakery workbench — interactive showcase + 5-dish picker on the left, live pacing plan + recent bakes on the right. */
export function BakeryChoose(p: Props) {
  const [all, setAll] = useState(false);
  const allRef = useModalA11y(all, () => setAll(false));
  const [recipe, setRecipe] = useState(false);
  const recipeBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!recipe) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setRecipe(false); };
    const click = (e: MouseEvent) => { if (!recipeBox.current?.contains(e.target as Node)) setRecipe(false); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', click);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', click); };
  }, [recipe]);

  const [going, setGoing] = useState(false);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);

  const isPart7 = p.mode === 'PART_7' || p.mode === 'PART_7_SINGLE' || p.mode === 'PART_7_MULTI';
  const selected = p.choices.findIndex(c => c.mode === (isPart7 ? 'PART_7' : p.mode));
  const chosen = (isPart7 ? p.part7Options?.find(c => c.mode === p.mode) : undefined) ?? p.choices[selected];
  const dish = dishName(p.mode);
  const free = p.mode === 'POMODORO';
  const totalQ = Math.max(1, chosen?.questions ?? 0);
  const perSec = (p.minutes * 60) / totalQ;
  const fullReading = p.mode === 'FULL_READING';
  const liveSteps = free ? [] : recipeSteps(totalQ, 0, p.mode, p.minutes * 60);

  const light = () => {
    if (going) return;
    if (window.matchMedia?.(REDUCED).matches) { p.onStart(); return; }
    setGoing(true);
    timeout.current = window.setTimeout(p.onStart, 480);
  };

  const renderRow = (row: RecentRow) => (
    <button key={row.id} type="button" className="bk-row" onClick={() => p.onOpenSession(row.session)}>
      <DishIcon dish={row.dish} />
      <span className="bk-row-text">
        <b>{row.title}</b>
        <small>{row.sub}</small>
        {row.tag && <span className={'bk-pill is-' + row.tag.kind}>{row.tag.text}</span>}
      </span>
    </button>
  );

  return (
    <div className="rd bk-root bk-page">
      <div className="bk-col">
        <header className="bk-chead">
          <div className="bk-chead-l">
            <h1 className="bk-h1">Hôm nay nướng <em>{p.label}</em> nhé?</h1>
            {p.reason && <p className="bk-sub">{p.reason}</p>}
          </div>
          <div className="bk-week-pill" aria-label={`Tuần này đã luyện ${p.weekCount} mẻ`}>
            <span aria-hidden="true">🧁</span>
            <span>Tuần này <b>{p.weekCount}</b> mẻ</span>
          </div>
        </header>

        <div className="bk-grid">
          {/* Left column: cohesive bakery showcase + 5-dish selector + integrated action dock */}
          <section className="bk-main" aria-label="Quầy chọn món luyện tốc độ">
            <div className="bk-showcase">
              <svg className="bk-showcase-top" viewBox="0 0 840 96" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
                <Awning width={840} height={36} />
                <BulbsG width={840} count={12} y={54} />
              </svg>

              <div className="bk-showcase-body">
                <div className="bk-hero-dish">
                  <div className="bk-hero-dome" aria-hidden="true"><Dome /></div>
                  <div className="bk-hero-art"><ItemArt dish={dishOf(p.mode)} selected /></div>
                </div>

                <div className="bk-hero-copy">
                  <span className="bk-hero-badge">
                    {free ? `Bánh sừng bò · Học tự do` : `${dish} · ${chosen?.questions ?? 0} câu`}
                  </span>
                  <div className="bk-hero-bub">
                    {free ? (
                      <>Đặt đồng hồ <b>{p.minutes} phút</b> cho một việc nhỏ, xong nghỉ ngắn 5 phút cùng Sóc nhé!</>
                    ) : (
                      <>{dish} cần <b>{chosen?.minutes ?? p.minutes} phút</b>.
                        {p.lastTime
                          ? <> Lần trước bạn xong trong <b>{p.lastTime}</b>!</>
                          : chosen?.record
                            ? <> Kỷ lục tốt nhất: <b>{chosen.record}</b>.</>
                            : <> Bật lò để lập kỷ lục đầu tiên nhé!</>}</>
                    )}
                  </div>
                </div>

                <div className="bk-hero-oven" aria-hidden="true">
                  <div className={'bk-hero-soc' + (going ? ' is-going' : '')}>
                    <ChefSoc size={76} mood="mix" />
                  </div>
                  <div className="bk-oven-mini">
                    <Oven w={116} h={154} variant="shop" />
                  </div>
                </div>
              </div>
              <div className="bk-counter-edge" aria-hidden="true" />
            </div>

            <div className="bk-picks-wrap">
              <div className="bk-picks-hd">
                <span className="bk-kicker">CHỌN MÓN HÔM NAY</span>
                {chosen?.record && !free && <span className="bk-best-chip">🏆 Kỷ lục {chosen.record}</span>}
              </div>
              <div className="bk-picks">
                {p.choices.map((c, i) => {
                  const on = i === selected, isFree = c.mode === 'POMODORO';
                  return (
                    <button
                      key={c.mode}
                      type="button"
                      className={'bk-pick' + (on ? ' is-on' : '')}
                      aria-pressed={on}
                      aria-label={isFree
                        ? `${c.label}, học tự do, ${c.minutes} phút`
                        : `${c.label}, ${c.questions} câu, ${c.minutes} phút, ${c.record ? 'kỷ lục ' + c.record : 'kỷ lục chưa có'}`}
                      onClick={() => p.onPick(c.mode)}
                    >
                      <span className="bk-pick-top">
                        <DishIcon dish={dishOf(c.mode)} />
                        <span className="bk-pick-min">{c.minutes}′</span>
                      </span>
                      <b className="bk-pick-name">{c.label}</b>
                      <span className="bk-pick-meta">{isFree ? 'Tự do · Pomodoro' : `${c.questions} câu`}</span>
                      <span className={'bk-pick-rec' + (c.record ? ' has-rec' : '')}>
                        {isFree ? 'Tính vào chuỗi' : c.record ? `Kỷ lục ${c.record}` : 'Chưa có kỷ lục'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {isPart7 && p.part7Options && p.part7Options.length > 0 && (
                <div className="bk-submodes" role="group" aria-label="Chế độ Part 7">
                  <span className="bk-submodes__lb">Chọn phạm vi Part 7:</span>
                  {p.part7Options.map(opt => (
                    <button key={opt.mode} type="button" className={'bk-submode' + (p.mode === opt.mode ? ' is-on' : '')}
                      aria-pressed={p.mode === opt.mode} onClick={() => p.onPick(opt.mode)}>
                      <b>{opt.label}</b><span>{opt.questions} câu · {opt.minutes}′</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bk-dock">
              <div className="bk-go">
                <button type="button" className="rd-btn bk-fire" data-guide="practice" onClick={light}>
                  <FlameIcon /> Bật lò · {p.minutes} phút
                </button>
                <div className="bk-step" role="group" aria-label="Số phút">
                  <span className="bk-step-lb">Đổi</span>
                  <button type="button" aria-label="Bớt một phút" onClick={() => p.onMinutes(-1)} disabled={!p.canMinus}>−</button>
                  <span className="bk-step-val">{p.minutes}p</span>
                  <button type="button" aria-label="Thêm một phút" onClick={() => p.onMinutes(1)}>+</button>
                </div>
              </div>

              <div className="bk-dock-foot">
                <div className="bk-links">
                  <button type="button" className="bk-quiet-pill" onClick={p.onLog}>Chỉ ghi kết quả</button>
                  <div className="bk-recipe-wrap" ref={recipeBox}>
                    <button type="button" className={'bk-quiet-pill' + (recipe ? ' is-on' : '')} aria-expanded={recipe} aria-controls="bk-recipe-pop" onClick={() => setRecipe(v => !v)}>Công thức</button>
                    {recipe && (free
                      ? <div className="bk-recipe-pop" id="bk-recipe-pop" role="region" aria-label="Công thức"><p className="bk-recipe-free">{FREE_RECIPE(p.minutes)}</p></div>
                      : <RecipePop mode={p.mode} label={p.label} questions={chosen?.questions ?? 0} minutes={p.minutes} />)}
                  </div>
                </div>
                <span className="bk-audio-note">Phần Nghe chạy theo audio → dùng “Chỉ ghi kết quả”</span>
              </div>
              {p.error && <p role="alert" className="bk-err">{p.error}</p>}
            </div>
          </section>

          {/* Right column: live pacing rhythm + recent bakes */}
          <aside className="bk-side" aria-label="Nhịp làm bài và lịch sử luyện tập">
            <section className="bk-side-card bk-pace-card">
              <div className="bk-side-hd">
                <span className="bk-kicker">{free ? 'NHỊP TẬP TRUNG' : 'NHỊP LÀM BÀI'}</span>
                <span className="bk-pace-badge">
                  {free ? `${p.minutes}p học · 5p nghỉ` : fullReading ? 'Gợi ý 12/8/55p' : `${paceWords(perSec)}/câu`}
                </span>
              </div>
              {free ? (
                <ol className="bk-pace-list">
                  <li><em>1</em><span>Chọn 1 việc cụ thể rồi tập trung</span><small>{p.minutes}p</small></li>
                  <li><em>2</em><span>Nghỉ ngắn uống nước, giãn mắt</span><small>5p</small></li>
                  <li><em>3</em><span>Sau 4 mẻ tự do → nghỉ dài nạp pin</span><small>15p</small></li>
                </ol>
              ) : (
                <ol className="bk-pace-list">
                  {liveSteps.map((step, i) => (
                    <li key={step.from}>
                      <em>{i + 1}</em>
                      <span>Câu {step.from}–{step.to} · {fullReading ? step.name : step.name.toLowerCase()}</span>
                      <small>{stepTime(step.durationSeconds ?? (step.to - step.from + 1) * perSec)}</small>
                    </li>
                  ))}
                </ol>
              )}
              <p className="bk-pace-tip">
                {free
                  ? 'Phút học tự do vẫn cộng vào chuỗi ngày và mục tiêu tuần.'
                  : fullReading
                    ? 'Chiến thuật phân bổ gợi ý khi luyện đề (không phải chia giờ cố định của ETS).'
                    : 'Quá giờ mỗi chặng thì đánh dấu rồi qua câu sau — đừng kẹt ở 1 câu khó.'}
              </p>
            </section>

            <section className="bk-side-card bk-recent-card">
              <div className="bk-recent-h">
                <h2>Mẻ bánh gần đây</h2>
                {p.recent.length > SHOWN && (
                  <button type="button" className="bk-link" onClick={() => setAll(true)}>Xem tất cả {p.recent.length} ›</button>
                )}
              </div>
              {p.recent.length ? (
                <div className="bk-rows">
                  {p.recent.slice(0, SHOWN).map(row => renderRow(row))}
                </div>
              ) : (
                <div className="bk-empty-box">
                  <DishIcon dish="cupcake" />
                  <p className="bk-empty">Chưa có mẻ bánh nào. Bật lò mẻ đầu tiên nhé.</p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {all && (
        <div className="bk-all-dim" onClick={() => setAll(false)}>
          <div ref={allRef} className="bk-all" role="dialog" aria-modal="true" aria-label="Tất cả mẻ bánh" tabIndex={-1} onClick={e => e.stopPropagation()}>
            <div className="bk-all-h"><h3>Tất cả mẻ bánh<span>{p.recent.length} mẻ</span></h3>
              <button type="button" className="bk-all-x" aria-label="Đóng" onClick={() => setAll(false)}>×</button></div>
            <div className="bk-all-list">{p.recent.map(row => renderRow(row))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mẻ tự do has no steps: its Công thức is one line, shared with the phone sheet. */
export const FREE_HINT = 'Học từ, nghe, shadowing… phút vẫn tính vào chuỗi.';
export const FREE_RECIPE = (minutes: number) => `Chọn một việc, học ${minutes} phút rồi nghỉ 5 phút; sau 4 mẻ nghỉ dài 15 phút.`;

/** Whole minutes for a recipe step ("10p"); seconds for very short steps. */
const stepTime = (seconds: number) => (seconds >= 60 ? `${Math.round(seconds / 60)}p` : formatSpan(seconds));

/** "Công thức" preview: the same steps as the running oven's recipe card, with minutes per step at the chosen time. */
function RecipePop({ mode, label, questions, minutes }: { mode: PacingMode; label: string; questions: number; minutes: number }) {
  const total = Math.max(1, questions);
  const per = (minutes * 60) / total;
  const steps = recipeSteps(total, 0, mode, minutes * 60);
  const fullReading = mode === 'FULL_READING';
  return (
    <div className="bk-recipe-pop" id="bk-recipe-pop" role="region" aria-label="Công thức">
      <b>{fullReading ? `${label} · chiến thuật gợi ý 12/8/55p` : `${label} · ${paceWords(per)} một câu`}</b>
      <ol>
        {steps.map((step, i) => (
          <li key={step.from}>
            <em>{i + 1}</em>
            <span>Câu {step.from}–{step.to} · {fullReading ? step.name : step.name.toLowerCase()}</span>
            <small>{stepTime(step.durationSeconds ?? (step.to - step.from + 1) * per)}</small>
          </li>
        ))}
      </ol>
      <p>{fullReading ? 'Chiến thuật phân bổ gợi ý khi luyện đề (không phải quy định chia giờ của ETS). Quá giờ thì đánh dấu, qua câu sau.' : 'Quá giờ thì đánh dấu, qua câu sau.'}</p>
    </div>
  );
}

const FlameIcon = () => (
  <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true"><path d="M10 1c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="#fff" /><path d="M10 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 1-3 1 1 2 0 2-2z" fill="#ffd25e" /></svg>
);
