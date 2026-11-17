import { forwardRef } from 'react';
import { Check, ChevronDown, ChevronUp, Flame, Play, Shield, X } from 'lucide-react';
import { Soc } from '@/shared/ui/soc/Soc';
import type { PhoneItem, PhoneItems } from '../../lib/phoneToday';
import type { TodayTask } from '../../lib/todayTasks';
import type { SuggestedTask } from '@/shared/types';
import { suggestionFrom, suggestionLabel } from '../../lib/suggestedTasks';

export interface HeroFallback { kicker: string; title: string; button: string; onClick: () => void }

interface Props {
  items: PhoneItems;
  fallback: HeroFallback;
  streak: number;
  weekDone: number;
  weekGoal: number;
  expanded: boolean;
  gear?: readonly string[];
  onToggleExpanded: () => void;
  onStartTask: (task: TodayTask) => void;
  onSkipTask: (id: string) => void;
  onToggleHabit: (id: string) => void;
  onStartSuggestion: (task: SuggestedTask) => void;
  onToggleSuggestion: (id: string) => void;
  onPracticeMore: () => void;
  onOpenStreak: () => void;
  onOpenAdd: () => void;
  /** Giải đấu tuần chip next to the streak (shown even before joining). */
  league?: { text: string; short: string; aria: string; onOpen: () => void };
}

/** Fixed bottom panel: next-task card, ONE summary row (expandable in place), footer with streak chip, count and "+ Thêm việc". */
export const TaskPanel = forwardRef<HTMLElement, Props>(function TaskPanel(p, ref) {
  const { items, fallback, expanded } = p;
  const { hero, rest, pinned, restOpen, doneCount, total } = items;
  const allDone = !hero && total > 0;
  const allItems: PhoneItem[] = hero ? [hero, ...pinned, ...rest] : [...pinned, ...rest];
  const names = rest.filter(i => !i.done).map(i => i.title).join(' · ');

  return (
    <section ref={ref} className="tp-panel" aria-label="Việc hôm nay">
      {allDone ? (
        <div className="tp-donebox">
          <Soc state="idle" size={58} gear={p.gear} />
          <div className="tp-donebox__tx">
            <b>Xong hết hôm nay 🎉</b>
            <small>{doneCount}/{total} việc · mai gặp lại nhé</small>
            <button type="button" className="tp-more" onClick={p.onPracticeMore}>Làm thêm</button>
          </div>
        </div>
      ) : (
        <div className="tp-next">
          <div className="tp-next__tx">
            <small>{hero ? (hero.task ? `${hero.task.kicker} · SÓC GỢI Ý` : hero.suggestion ? `${hero.suggestion.minutes} PHÚT · ${suggestionFrom(hero.suggestion).toUpperCase()}` : 'VIỆC CỦA MÌNH') : fallback.kicker}</small>
            <b>{hero ? hero.title : fallback.title}</b>
          </div>
          {hero?.suggestion
            ? <button type="button" className="tp-go" onClick={() => p.onStartSuggestion(hero.suggestion!)}><Play size={15} fill="currentColor" aria-hidden="true" />Bắt đầu</button>
            : hero?.task
            ? <button type="button" className="tp-go" onClick={() => p.onStartTask(hero.task!)}><Play size={15} fill="currentColor" aria-hidden="true" />Bắt đầu</button>
            : hero?.habit
              ? <button type="button" className="tp-go" onClick={() => p.onToggleHabit(hero.habit!.id)}><Check size={16} strokeWidth={3.2} aria-hidden="true" />Xong</button>
              : <button type="button" className="tp-go" onClick={fallback.onClick}>{fallback.button}</button>}
          {hero?.suggestion && (
            <button type="button" className="tp-skip" aria-label={`Đánh dấu xong: ${suggestionLabel(hero.suggestion)}`} onClick={() => p.onToggleSuggestion(hero.suggestion!.id)}><Check size={16} strokeWidth={3} aria-hidden="true" /></button>
          )}
          {hero?.task && restOpen === 0 && (
            <button type="button" className="tp-skip" aria-label={`Bỏ qua "${hero.title}" hôm nay`} onClick={() => p.onSkipTask(hero.task!.id)}><X size={16} aria-hidden="true" /></button>
          )}
        </div>
      )}

      {!allDone && pinned.length > 0 && (
        <ul className="tp-list tp-pin">
          {pinned.map(item => (
            <li key={item.key} className={'tp-sug' + (item.done ? ' is-done' : '')}>
              <button type="button" className="tp-tick" aria-pressed={item.done} aria-label={`${item.done ? 'Bỏ đánh dấu' : 'Đánh dấu xong'}: ${suggestionLabel(item.suggestion!)}`} onClick={() => p.onToggleSuggestion(item.key)}>
                <i className={'tp-box' + (item.done ? ' is-on' : '')}>{item.done && <Check size={15} strokeWidth={3.4} aria-hidden="true" />}</i>
              </button>
              <button type="button" className="tp-row" disabled={item.done} onClick={() => p.onStartSuggestion(item.suggestion!)}>
                <span className="tp-row__t">{suggestionLabel(item.suggestion!)}<small>{suggestionFrom(item.suggestion!)}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(restOpen > 0 || expanded) && !allDone && (
        <>
          <button type="button" className="tp-sum" aria-expanded={expanded} onClick={p.onToggleExpanded}>
            <span className="tp-dots" aria-hidden="true">{allItems.map(i => <i key={i.key} className={i.done ? 'is-on' : undefined} />)}</span>
            <span className="tp-sum__tx"><b>Còn {restOpen} việc khác</b>{!expanded && names && <small>{names}</small>}</span>
            <span className="tp-sum__go">{expanded ? <>Thu gọn<ChevronUp size={16} aria-hidden="true" /></> : <>Xem<ChevronDown size={16} aria-hidden="true" /></>}</span>
          </button>
          {expanded && (
            <ul className="tp-list">
              {rest.map(item => (
                <li key={item.key} className={item.done ? 'is-done' : undefined}>
                  {item.habit ? (
                    <button type="button" className="tp-row" aria-pressed={item.done} onClick={() => p.onToggleHabit(item.habit!.id)}>
                      <i className={'tp-box' + (item.done ? ' is-on' : '')}>{item.done && <Check size={15} strokeWidth={3.4} aria-hidden="true" />}</i>
                      <span className="tp-row__t">{item.title}</span>
                    </button>
                  ) : (
                    <button type="button" className="tp-row" disabled={item.done} onClick={() => item.task && p.onStartTask(item.task)}>
                      <i className={'tp-box' + (item.done ? ' is-on' : ' is-play')}>{item.done ? <Check size={15} strokeWidth={3.4} aria-hidden="true" /> : <Play size={11} fill="currentColor" aria-hidden="true" />}</i>
                      <span className="tp-row__t">{item.title}{!item.done && <small>Sóc gợi ý</small>}</span>
                      {!item.done && item.task && <em>{item.task.minutes} phút</em>}
                    </button>
                  )}
                  {item.task && !item.done && (
                    <button type="button" className="tp-x" aria-label={`Bỏ qua "${item.title}" hôm nay`} onClick={() => p.onSkipTask(item.task!.id)}><X size={18} aria-hidden="true" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="tp-ft">
        <button type="button" className="tp-chip is-fire" onClick={p.onOpenStreak} aria-label={`Chuỗi ${p.streak} ngày, mở bánh nến`}>
          <Flame size={15} fill="currentColor" aria-hidden="true" />{allDone ? `${p.streak} ngày liền` : p.streak}
        </button>
        {p.league && (
          <button type="button" className="tp-chip is-league" onClick={p.league.onOpen} aria-label={p.league.aria}>
            <Shield size={14} fill="currentColor" aria-hidden="true" />{allDone ? p.league.short : p.league.text}
          </button>
        )}
        <span className="tp-chip is-count">{allDone ? `Tuần ${p.weekDone}/${p.weekGoal} buổi` : total > 0 ? `${doneCount}/${total} xong` : 'Chưa có việc'}</span>
        <button type="button" className="tp-add" onClick={p.onOpenAdd}>+ Thêm việc</button>
      </div>
    </section>
  );
});
