import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StudySession } from '@/shared/types';
import type { PacingMode } from '../lib/pacingModel';
import { dishName, dishOf, formatSpan, paceWords, recipeSteps, type Dish, type PaceTag } from '../lib/bakery';
import { Dome, DishIcon, ChefSoc, ItemArt, ShopBackdrop } from './BakeryArt';

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

const W = 1068, H = 450;
// Five items on the counter (x 24–800): the four Parts and Mẻ tự do.
const XS = [96, 248, 400, 552, 704];
const TILT = [-2, 1.5, 0, -1.5, 1];
const REDUCED = '(prefers-reduced-motion: reduce)';

/** Height kept under the stage for the buttons row and one row of recent bakes, so the page fits the window. */
const BELOW = 244;

/**
 * The stage is drawn at 1068 x 450 and scaled to fit both the column width and the window height, so the buttons
 * and the recent bakes stay on screen. Very short windows stop at 0.62 and scroll instead.
 */
function useFit() {
  const page = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wide, setWide] = useState(W);
  useLayoutEffect(() => {
    const root = page.current, el = ref.current;
    if (!root || !el) return;
    const measure = () => {
      const cs = getComputedStyle(root);
      const width = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const top = el.getBoundingClientRect().top + window.scrollY;
      const byHeight = (window.innerHeight - top - BELOW) / H;
      const k = Math.min(1.12, width / W, Math.max(0.62, byHeight));
      setScale(k);
      // A height-limited stage widens in scene units so it still spans the column.
      setWide(Math.max(W, Math.min(1500, Math.floor(width / k))));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return [page, ref, scale, wide] as const;
}

const SHOWN = 4;

/** Chọn món: a bakery whose display-case items are the four Parts and Mẻ tự do (free study). */
export function BakeryChoose(p: Props) {
  const [page, fit, scale, wide] = useFit();
  const off = (wide - W) / 2;
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (!all) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setAll(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [all]);
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

  const light = () => {
    if (going) return;
    if (window.matchMedia?.(REDUCED).matches) { p.onStart(); return; }
    setGoing(true);
    timeout.current = window.setTimeout(p.onStart, 480);
  };

  const renderRow = (row: RecentRow) => (
    <button key={row.id} type="button" className="bk-row" onClick={() => p.onOpenSession(row.session)}>
      <DishIcon dish={row.dish} />
      <span className="bk-row-text"><b>{row.title}</b><small>{row.sub}</small></span>
      {row.tag ? <span className={'bk-pill is-' + row.tag.kind}>{row.tag.text}</span> : <span className="bk-pill">không bấm giờ</span>}
    </button>
  );

  return (
    <div className="rd bk-root bk-page" ref={page}>
      <div className="bk-col">
      <div className="bk-chead">
        <h1 className="bk-h1">Hôm nay nướng <em>{p.label}</em> nhé?</h1>
        {p.reason && <p className="bk-sub">{p.reason}</p>}
      </div>

      <div className="bk-fit" ref={fit} style={{ height: H * scale }}>
        <div className="bk-stage" style={{ width: wide, transform: `scale(${scale})` }}>
          <ShopBackdrop width={wide} height={H} offset={off} />
          <div className="bk-shop" style={{ left: off }}>

          {p.choices.map((c, i) => {
            const on = i === selected, isFree = c.mode === 'POMODORO';
            return (
              <button key={c.mode} type="button" className={'bk-item' + (on ? ' is-on' : '')} style={{ left: XS[i] - 90 }}
                aria-pressed={on} aria-label={isFree ? `${c.label}, học tự do, ${c.minutes} phút` : `${c.label}, ${c.questions} câu, ${c.minutes} phút, ${c.record ? 'kỷ lục ' + c.record : 'kỷ lục chưa có'}`}
                onClick={() => p.onPick(c.mode)}>
                <ItemArt dish={dishOf(c.mode)} selected={on} />
                <span className="bk-tag" style={{ transform: `rotate(${TILT[i]}deg)` }}>
                  {isFree ? <>
                    <span className="bk-tag-top"><b>{c.label}</b></span>
                    <span className="bk-tag-sub">Học tự do · {c.minutes}′</span>
                  </> : <>
                    <span className="bk-tag-top"><b>{c.label}</b><b className="bk-tag-min">{c.minutes}′</b></span>
                    <span className="bk-tag-sub">{c.questions} câu · {c.record ? `kỷ lục ${c.record}` : 'kỷ lục chưa có'}</span>
                  </>}
                </span>
              </button>
            );
          })}
          {selected >= 0 && <div className="bk-dome" style={{ left: XS[selected] - 130 }}><Dome /></div>}

          <div className={'bk-shop-soc' + (going ? ' is-going' : '')}>
            <ChefSoc size={82} mood="mix" />
          </div>
          {/* Mẻ tự do says its one hint under the heading; Sóc stays quiet so it is not said twice. */}
          {!free && <div className="bk-bub">
            {dish} cần <b>{chosen?.minutes ?? p.minutes} phút</b>.{p.lastTime && <> Lần trước bạn xong trong {p.lastTime}!</>}
          </div>}
          </div>
        </div>
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

      <div className="bk-ctrl">
        <button type="button" className="rd-btn bk-fire" data-guide="practice" onClick={light}><FlameIcon /> Bật lò</button>
        <div className="bk-step" role="group" aria-label="Số phút">
          <button type="button" aria-label="Bớt một phút" onClick={() => p.onMinutes(-1)} disabled={!p.canMinus}>−</button>
          <b>{p.minutes}</b><span>p</span>
          <button type="button" aria-label="Thêm một phút" onClick={() => p.onMinutes(1)}>+</button>
        </div>
        <button type="button" className="bk-tool is-mint" onClick={p.onLog}><i aria-hidden="true"><PenIcon /></i>Chỉ ghi kết quả</button>
        <div className="bk-recipe-wrap" ref={recipeBox}>
          <button type="button" className={'bk-tool is-gold' + (recipe ? ' is-on' : '')} aria-expanded={recipe} aria-controls="bk-recipe-pop" onClick={() => setRecipe(v => !v)}>
            <i aria-hidden="true"><CardIcon /></i>Công thức
          </button>
          {recipe && (free
            ? <div className="bk-recipe-pop" id="bk-recipe-pop" role="region" aria-label="Công thức"><p className="bk-recipe-free">{FREE_RECIPE(p.minutes)}</p></div>
            : <RecipePop mode={p.mode} label={p.label} questions={chosen?.questions ?? 0} minutes={p.minutes} />)}
        </div>
      </div>
      {p.error && <p role="alert" className="bk-err">{p.error}</p>}

      <section className="bk-recent">
        <div className="bk-recent-h">
          <h2>Mẻ bánh gần đây<span>Tuần này {p.weekCount} mẻ · Phần Nghe chạy theo audio nên chỉ ghi kết quả</span></h2>
          {p.recent.length > SHOWN && <button type="button" className="bk-link" onClick={() => setAll(true)}>Xem tất cả {p.recent.length} mẻ ›</button>}
        </div>
        {p.recent.length ? (
          <div className="bk-rows">
            {p.recent.slice(0, SHOWN).map(row => renderRow(row))}
          </div>
        ) : <p className="bk-empty">Chưa có mẻ bánh nào. Bật lò mẻ đầu tiên nhé.</p>}
      </section>
      </div>

      {all && (
        <div className="bk-all-dim" onClick={() => setAll(false)}>
          <div className="bk-all" role="dialog" aria-modal="true" aria-label="Tất cả mẻ bánh" onClick={e => e.stopPropagation()}>
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
const PenIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 15l1-4 8-8 3 3-8 8z" fill="#2f8a42" /><path d="M11 4l3 3" stroke="#fff" strokeWidth="1.5" /></svg>
);
const CardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="3" fill="#e0a100" /><path d="M5 7h8M5 10h8M5 13h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
