import type { Habit, SuggestedTask } from '@/shared/types';
import type { SuggestionView } from './suggestedTasks';
import type { TodayTask } from './todayTasks';
import { habitDoneToday } from './habits';

/** One line of the phone task panel: a Sóc suggestion or one of the learner's own habits. */
export interface PhoneItem {
  key: string;
  kind: 'task' | 'habit' | 'suggested';
  title: string;
  done: boolean;
  task?: TodayTask;
  habit?: Habit;
  suggestion?: SuggestedTask;
}

export interface PhoneItems {
  /** The green "next" card: first open suggestion, else first open habit. */
  hero: PhoneItem | null;
  /** Every other line: open ones first, then done ones. */
  rest: PhoneItem[];
  /** Tasks from Sóc's advice that are not the hero: always shown, never folded into the summary row. */
  pinned: PhoneItem[];
  restOpen: number;
  doneCount: number;
  total: number;
}

export function buildPhoneItems(tasks: TodayTask[], habits: Habit[], today: string, suggestions: SuggestionView[] = []): PhoneItems {
  const sug = suggestions.map((v): PhoneItem => ({ key: v.task.id, kind: 'suggested', title: v.task.title, done: v.done, suggestion: v.task }));
  const items: PhoneItem[] = [
    ...tasks.map((task): PhoneItem => ({ key: task.id, kind: 'task', title: task.title, done: task.done, task })),
    ...sug,
    ...habits.map((habit): PhoneItem => ({ key: habit.id, kind: 'habit', title: habit.title, done: habitDoneToday(habit, today), habit }))
  ];
  const hero = items.find(i => !i.done && i.kind === 'task') ?? items.find(i => !i.done && i.kind === 'suggested') ?? items.find(i => !i.done) ?? null;
  const pinned = sug.filter(i => i !== hero);
  const others = items.filter(i => i !== hero && i.kind !== 'suggested');
  const rest = [...others.filter(i => !i.done), ...others.filter(i => i.done)];
  return { hero, rest, pinned, restOpen: others.filter(i => !i.done).length, doneCount: items.filter(i => i.done).length, total: items.length };
}
