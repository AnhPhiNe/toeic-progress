import type { Habit } from '@/shared/types';
import type { TodayTask } from './todayTasks';
import { habitDoneToday } from './habits';

/** One line of the phone task panel: a Sóc suggestion or one of the learner's own habits. */
export interface PhoneItem {
  key: string;
  kind: 'task' | 'habit';
  title: string;
  done: boolean;
  task?: TodayTask;
  habit?: Habit;
}

export interface PhoneItems {
  /** The green "next" card: first open suggestion, else first open habit. */
  hero: PhoneItem | null;
  /** Every other line: open ones first, then done ones. */
  rest: PhoneItem[];
  restOpen: number;
  doneCount: number;
  total: number;
}

export function buildPhoneItems(tasks: TodayTask[], habits: Habit[], today: string): PhoneItems {
  const items: PhoneItem[] = [
    ...tasks.map((task): PhoneItem => ({ key: task.id, kind: 'task', title: task.title, done: task.done, task })),
    ...habits.map((habit): PhoneItem => ({ key: habit.id, kind: 'habit', title: habit.title, done: habitDoneToday(habit, today), habit }))
  ];
  const hero = items.find(i => !i.done && i.kind === 'task') ?? items.find(i => !i.done) ?? null;
  const others = items.filter(i => i !== hero);
  const rest = [...others.filter(i => !i.done), ...others.filter(i => i.done)];
  return { hero, rest, restOpen: others.filter(i => !i.done).length, doneCount: items.filter(i => i.done).length, total: items.length };
}
