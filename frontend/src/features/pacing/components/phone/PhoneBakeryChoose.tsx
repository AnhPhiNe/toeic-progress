import { useEffect, useRef, useState } from 'react';
import { PhoneAvatarButton, PhoneSheet } from '@/app/components/phone';
import type { StudySession } from '@/shared/types';
import type { PacingMode } from '../../lib/pacingModel';
import { dishName, dishOf, formatSpan, paceWords, recipeSteps } from '../../lib/bakery';
import { Awning, BulbsG, ChefSoc, DishIcon, ItemArt } from '../BakeryArt';
import type { BakeryChoice, RecentRow } from '../BakeryChoose';
import { ClockIcon, FlameIcon } from './PracticePhoneIcons';
import { FREE_HINT, FREE_RECIPE } from '../BakeryChoose';

interface Props {
  mode: PacingMode;
  label: string;
  choices: BakeryChoice[];
  part7Options?: BakeryChoice[];
  lastTime: string | null;
  minutes: number;
  canMinus: boolean;
  recent: RecentRow[];
  error: string;
  onPick: (mode: PacingMode) => void;
  onStart: () => void;
  onMinutes: (delta: number) => void;
  onLog: () => void;
  onOpenSession: (session: StudySession) => void;
}

const REDUCED = '(prefers-reduced-motion: reduce)';
/** Phone cards say "Cả Đọc"; the heading keeps the Part label. */
const cardName = (c: BakeryChoice) => (c.mode === 'FULL_READING' ? 'Cả Đọc' : c.label);
const stepTime = (seconds: number) => formatSpan(seconds);

/** Chọn mẻ on phones: awning, display case with the chosen cake, swipeable Part cards, fire button and tools. */
export function PhoneBakeryChoose(p: Props) {
  const [sheet, setSheet] = useState<'recent' | 'recipe' | 'parts' | null>(null);
  const [going, setGoing] = useState(false);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  const isPart7 = p.mode === 'PART_7' || p.mode === 'PART_7_SINGLE' || p.mode === 'PART_7_MULTI';
  const chosen = (isPart7 ? p.part7Options?.find(c => c.mode === p.mode) : undefined) ?? p.choices.find(c => c.mode === p.mode);
  const free = p.mode === 'POMODORO';
  const chosenCard = p.choices.find(c => c.mode === (isPart7 ? 'PART_7' : p.mode));

  const light = () => {
    if (going) return;
    if (window.matchMedia?.(REDUCED).matches) { p.onStart(); return; }
    setGoing(true);
    timeout.current = window.setTimeout(p.onStart, 380);
  };

  const row = (r: RecentRow) => (
    <button key={r.id} type="button" className="bk-row" onClick={() => { setSheet(null); p.onOpenSession(r.session); }}>
      <DishIcon dish={r.dish} />
      <span className="bk-row-text"><b>{r.title}</b><small>{r.sub}</small>
        {r.tag && <span className={'bk-pill is-' + r.tag.kind}>{r.tag.text}</span>}</span>
    </button>
  );

  return (
    <div className="rd pp pp-choose">
      <svg className="pp-awn" viewBox="0 0 390 120" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <Awning width={390} height={44} />
        <BulbsG width={390} count={12} y={82} />
      </svg>
      <header className="pp-head">
        <h1 className={free ? 'is-long' : undefined}>Hôm nay nướng <em>{p.label}</em> nhé?</h1>
        <button type="button" className="pp-recent" aria-label="Mẻ bánh gần đây" onClick={() => setSheet('recent')}><ClockIcon /></button>
        <PhoneAvatarButton />
      </header>

      <div className="pp-case">
        <div className="pp-say">
          {free ? FREE_HINT : <>{dishName(p.mode)} cần <b>{chosen?.minutes ?? p.minutes} phút</b>.{p.lastTime && <><br />Lần trước bạn xong trong {p.lastTime}!</>}</>}
        </div>
        {/* The cake is sized to the case height so a tall case is filled, not left empty above it. */}
        <div className="pp-cake" key={p.mode}><ItemArt dish={dishOf(p.mode)} selected /></div>
        <div className={'pp-soc' + (going ? ' is-going' : '')}><ChefSoc size={72} mood="mix" /></div>
        <div className="pp-shelf" aria-hidden="true" />
      </div>

      <button type="button" className="pp-chosen" aria-haspopup="dialog" aria-label={`Part đang chọn: ${chosenCard ? cardName(chosenCard) : p.label}. Đổi Part`} onClick={() => setSheet('parts')}>
        <DishIcon dish={dishOf(p.mode)} />
        <span className="pp-chosen__t"><b>{chosenCard ? cardName(chosenCard) : p.label}<em>{chosen?.minutes ?? p.minutes}′</em></b>
          <small>{free ? 'học tự do' : `${chosen?.questions ?? chosenCard?.questions ?? 0} câu`}</small></span>
        <span className="pp-chosen__chg">Đổi ›</span>
      </button>

      <div className="pp-panel">
        {isPart7 && p.part7Options && p.part7Options.length > 0 && (
          <div className="pp-submodes" role="group" aria-label="Chế độ Part 7">
            {p.part7Options.map(opt => (
              <button key={opt.mode} type="button" className={'pp-submode' + (p.mode === opt.mode ? ' is-on' : '')}
                aria-pressed={p.mode === opt.mode} onClick={() => p.onPick(opt.mode)}>
                <b>{opt.label}</b><small>{opt.questions}c · {opt.minutes}′</small>
              </button>
            ))}
          </div>
        )}
        <div className="pp-fire-row" data-guide="practice">
          <button type="button" className="rd-btn bk-fire pp-fire" onClick={light}><FlameIcon /> Bật lò · {p.minutes} phút</button>
          <div className="pp-mins" role="group" aria-label="Số phút">
            <button type="button" aria-label="Bớt một phút" onClick={() => p.onMinutes(-1)} disabled={!p.canMinus}>−</button>
            <span className="bk-sr">{p.minutes} phút</span>
            <button type="button" aria-label="Thêm một phút" onClick={() => p.onMinutes(1)}>+</button>
          </div>
        </div>
        {p.error && <p role="alert" className="bk-err">{p.error}</p>}
        <div className="pp-links">
          <button type="button" className="bk-quiet" onClick={p.onLog}>Ghi kết quả</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="bk-quiet" aria-haspopup="dialog" onClick={() => setSheet('recipe')}>Công thức</button>
        </div>
      </div>

      {sheet === 'parts' && (
        <PhoneSheet title="Chọn Part" onClose={() => setSheet(null)}>
          <div className="pp-pick" role="group" aria-label="Chọn Part">
            {p.choices.map(c => {
              const active = c.mode === (isPart7 ? 'PART_7' : p.mode), isFree = c.mode === 'POMODORO';
              return (
                <button key={c.mode} type="button" className={'pp-pick__row' + (active ? ' is-on' : '')} aria-pressed={active}
                  aria-label={isFree ? `${c.label}, học tự do, ${c.minutes} phút` : `${c.label}, ${c.questions} câu, ${c.minutes} phút, ${c.record ? 'kỷ lục ' + c.record : 'kỷ lục chưa có'}`}
                  onClick={() => { p.onPick(c.mode); setSheet(null); }}>
                  <DishIcon dish={dishOf(c.mode)} />
                  <span className="pp-pick__t"><b>{c.label}</b><small>{isFree ? 'học tự do' : `${c.questions} câu · ${c.record ? 'kỷ lục ' + c.record : 'chưa có kỷ lục'}`}</small></span>
                  <em>{c.minutes}′</em>
                </button>
              );
            })}
          </div>
        </PhoneSheet>
      )}

      {sheet === 'recent' && (
        <PhoneSheet title="Mẻ bánh gần đây" onClose={() => setSheet(null)}>
          {p.recent.length ? <div className="pp-rows">{p.recent.map(row)}</div> : <p className="bk-empty pp-empty">Chưa có mẻ bánh nào. Bật lò mẻ đầu tiên nhé.</p>}
        </PhoneSheet>
      )}
      {sheet === 'recipe' && free && (
        <PhoneSheet title="Mẻ tự do" onClose={() => setSheet(null)}><p className="pp-steps-note">{FREE_RECIPE(p.minutes)}</p></PhoneSheet>
      )}
      {sheet === 'recipe' && !free && <RecipeSheet mode={p.mode} label={p.label} questions={chosen?.questions ?? 0} minutes={p.minutes} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Công thức: the steps of the chosen Part at the chosen time (same plan as the desktop popover). */
function RecipeSheet({ mode, label, questions, minutes, onClose }: { mode: PacingMode; label: string; questions: number; minutes: number; onClose: () => void }) {
  const total = Math.max(1, questions);
  const per = (minutes * 60) / total;
  const steps = recipeSteps(total, 0, mode, minutes * 60);
  const fullReading = mode === 'FULL_READING';
  return (
    <PhoneSheet title={fullReading ? `${label} · gợi ý 12/8/55p` : `${label} · ${paceWords(per)} một câu`} onClose={onClose}>
      <ol className="pp-steps-list">
        {steps.map((step, i) => (
          <li key={step.from}>
            <em>{i + 1}</em>
            <span>Câu {step.from}–{step.to} · {fullReading ? step.name : step.name.toLowerCase()}</span>
            <small>{stepTime(step.durationSeconds ?? (step.to - step.from + 1) * per)}</small>
          </li>
        ))}
      </ol>
      <p className="pp-steps-note">
        {fullReading
          ? 'Chiến thuật phân bổ gợi ý khi luyện đề (không phải quy định chia giờ của ETS). Quá giờ thì đánh dấu, qua câu sau.'
          : 'Quá giờ thì đánh dấu, qua câu sau.'}
      </p>
    </PhoneSheet>
  );
}
