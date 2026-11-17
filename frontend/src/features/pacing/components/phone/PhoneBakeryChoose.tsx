import { useEffect, useRef, useState } from 'react';
import { PhoneAvatarButton, PhoneSheet } from '@/app/components/phone';
import type { StudySession } from '@/shared/types';
import type { PacingMode } from '../../lib/pacingModel';
import { dishName, dishOf, formatSpan, paceWords, recipeSteps } from '../../lib/bakery';
import { Awning, BulbsG, ChefSoc, DishIcon, ItemArt } from '../BakeryArt';
import type { BakeryChoice, RecentRow } from '../BakeryChoose';
import { CardIcon, ClockIcon, FlameIcon, PenIcon, TomatoIcon } from './PracticePhoneIcons';

interface Props {
  mode: PacingMode;
  label: string;
  choices: BakeryChoice[];
  lastTime: string | null;
  minutes: number;
  canMinus: boolean;
  recent: RecentRow[];
  error: string;
  onPick: (mode: PacingMode) => void;
  onStart: () => void;
  onMinutes: (delta: number) => void;
  onLog: () => void;
  onPomodoro: () => void;
  onOpenSession: (session: StudySession) => void;
}

const REDUCED = '(prefers-reduced-motion: reduce)';
/** Phone cards say "Cả Đọc"; the heading keeps the Part label. */
const cardName = (c: BakeryChoice) => (c.mode === 'FULL_READING' ? 'Cả Đọc' : c.label);
const stepTime = (seconds: number) => (seconds >= 60 ? `${Math.round(seconds / 60)}p` : formatSpan(seconds));

/** Chọn mẻ on phones: awning, display case with the chosen cake, swipeable Part cards, fire button and tools. */
export function PhoneBakeryChoose(p: Props) {
  const [sheet, setSheet] = useState<'recent' | 'recipe' | null>(null);
  const [going, setGoing] = useState(false);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  const strip = useRef<HTMLDivElement>(null);
  const chosen = p.choices.find(c => c.mode === p.mode);

  // Bring the selected card into view (also when the page opens on a remembered Part).
  useEffect(() => {
    const box = strip.current, on = box?.querySelector<HTMLElement>('.is-on');
    if (!box || !on) return;
    box.scrollTo({ left: on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [p.mode]);

  const light = () => {
    if (going) return;
    if (window.matchMedia?.(REDUCED).matches) { p.onStart(); return; }
    setGoing(true);
    timeout.current = window.setTimeout(p.onStart, 380);
  };

  const row = (r: RecentRow) => (
    <button key={r.id} type="button" className="bk-row" onClick={() => { setSheet(null); p.onOpenSession(r.session); }}>
      <DishIcon dish={r.dish} />
      <span className="bk-row-text"><b>{r.title}</b><small>{r.sub}</small></span>
      {r.tag ? <span className={'bk-pill is-' + r.tag.kind}>{r.tag.text}</span> : <span className="bk-pill">không bấm giờ</span>}
    </button>
  );

  return (
    <div className="rd pp pp-choose">
      <svg className="pp-awn" viewBox="0 0 390 120" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <Awning width={390} height={44} />
        <BulbsG width={390} count={12} y={82} />
      </svg>
      <header className="pp-head">
        <h1>Hôm nay nướng <em>{p.label}</em> nhé?</h1>
        <button type="button" className="pp-recent" aria-label="Mẻ bánh gần đây" onClick={() => setSheet('recent')}><ClockIcon /></button>
        <PhoneAvatarButton />
      </header>

      <div className="pp-case">
        <div className="pp-say">
          {dishName(p.mode)} cần <b>{chosen?.minutes ?? p.minutes} phút</b>.{p.lastTime && <><br />Lần trước bạn xong trong {p.lastTime}!</>}
        </div>
        {/* The cake is sized to the case height so a tall case is filled, not left empty above it. */}
        <div className="pp-cake" key={p.mode}><ItemArt dish={dishOf(p.mode)} selected /></div>
        <div className={'pp-soc' + (going ? ' is-going' : '')}><ChefSoc size={72} mood="mix" /></div>
        <div className="pp-shelf" aria-hidden="true" />
      </div>

      <div className="pp-cards" ref={strip} role="group" aria-label="Chọn Part">
        {p.choices.map(c => (
          <button key={c.mode} type="button" className={'pp-pc' + (c.mode === p.mode ? ' is-on' : '')} aria-pressed={c.mode === p.mode}
            aria-label={`${c.label}, ${c.questions} câu, ${c.minutes} phút, ${c.record ? 'kỷ lục ' + c.record : 'kỷ lục chưa có'}`} onClick={() => p.onPick(c.mode)}>
            <DishIcon dish={dishOf(c.mode)} />
            <b>{cardName(c)}<em>{c.minutes}′</em></b>
            <small>{c.questions} câu</small>
          </button>
        ))}
      </div>

      <div className="pp-panel">
        <div className="pp-fire-row" data-guide="practice">
          <button type="button" className="rd-btn bk-fire pp-fire" onClick={light}><FlameIcon /> Bật lò</button>
          <div className="pp-mins" role="group" aria-label="Số phút">
            <button type="button" aria-label="Bớt một phút" onClick={() => p.onMinutes(-1)} disabled={!p.canMinus}>−</button>
            <b>{p.minutes}</b><span>p</span>
            <button type="button" aria-label="Thêm một phút" onClick={() => p.onMinutes(1)}>+</button>
          </div>
        </div>
        {p.error && <p role="alert" className="bk-err">{p.error}</p>}
        <div className="pp-tools">
          <button type="button" className="bk-tool is-mint" onClick={p.onLog}><i><PenIcon /></i>Ghi kết quả</button>
          <button type="button" className="bk-tool is-gold" aria-haspopup="dialog" onClick={() => setSheet('recipe')}><i><CardIcon /></i>Công thức</button>
          <button type="button" className="bk-tool is-rose" onClick={p.onPomodoro}><i><TomatoIcon /></i>Pomodoro</button>
        </div>
      </div>

      {sheet === 'recent' && (
        <PhoneSheet title="Mẻ bánh gần đây" onClose={() => setSheet(null)}>
          {p.recent.length ? <div className="pp-rows">{p.recent.map(row)}</div> : <p className="bk-empty pp-empty">Chưa có mẻ bánh nào. Bật lò mẻ đầu tiên nhé.</p>}
        </PhoneSheet>
      )}
      {sheet === 'recipe' && <RecipeSheet label={p.label} questions={chosen?.questions ?? 0} minutes={p.minutes} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Công thức: the five steps of the chosen Part at the chosen time (same plan as the desktop popover). */
function RecipeSheet({ label, questions, minutes, onClose }: { label: string; questions: number; minutes: number; onClose: () => void }) {
  const total = Math.max(1, questions);
  const per = (minutes * 60) / total;
  return (
    <PhoneSheet title={`${label} · ${paceWords(per)} một câu`} onClose={onClose}>
      <ol className="pp-steps-list">
        {recipeSteps(total, 0).map((step, i) => (
          <li key={step.from}><em>{i + 1}</em><span>Câu {step.from}–{step.to} · {step.name.toLowerCase()}</span><small>{stepTime((step.to - step.from + 1) * per)}</small></li>
        ))}
      </ol>
      <p className="pp-steps-note">Quá giờ thì đánh dấu, qua câu sau.</p>
    </PhoneSheet>
  );
}
