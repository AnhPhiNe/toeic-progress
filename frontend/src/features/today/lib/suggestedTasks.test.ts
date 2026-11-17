import { describe, expect, it } from 'vitest';
import type { PacingRun, UserProfile } from '@/shared/types';
import { defaultProfile } from '@/shared/data/dataBundle';
import { addSuggestion, hasSuggestion, withoutRepeatedTimers, suggestionFrom, suggestionLabel, suggestionId, suggestionsToday, toggleSuggestion } from './suggestedTasks';
import { extraStudyDates } from './habits';
import { buildPhoneItems } from './phoneToday';

const base = (): UserProfile => defaultProfile();
const timer = { id: suggestionId('t1', 7, 'timer'), kind: 'timer' as const, title: 'Bấm giờ Part 7', minutes: 20, part: 7, testName: 'ETS Test 03', testDate: '2026-11-11' };
const notebook = { id: suggestionId('t1', 3, 'notebook'), kind: 'notebook' as const, title: 'Ôn 9 câu trong Sổ tay', minutes: 15, part: 3, testName: 'ETS Test 03', testDate: '2026-11-11' };
const run = (date: string, partType: PacingRun['partType']) => ({ id: date, date, partType, deletedAt: null } as unknown as PacingRun);

describe('suggested tasks', () => {
  it('adds once, labels for Hôm nay and shows as open', () => {
    let p = addSuggestion(base(), timer, '2026-11-14');
    p = addSuggestion(p, timer, '2026-11-14');
    expect(p.suggestedTasks).toHaveLength(1);
    expect(hasSuggestion(p, timer.id, '2026-11-14')).toBe(true);
    const [view] = suggestionsToday(p, [], '2026-11-14');
    expect(view.done).toBe(false);
    expect(suggestionLabel(view.task)).toBe('Bấm giờ Part 7 · 20′');
    expect(suggestionFrom(view.task)).toBe('Sóc gợi ý từ đề 11/11');
  });

  it('stays ticked on the day it is done, counts for the streak, then leaves', () => {
    let p = addSuggestion(base(), notebook, '2026-11-14');
    p = toggleSuggestion(p, notebook.id, '2026-11-15');
    expect(suggestionsToday(p, [], '2026-11-15')).toEqual([{ task: expect.objectContaining({ id: notebook.id }), done: true }]);
    expect(extraStudyDates(p, [])).toContain('2026-11-15');
    expect(suggestionsToday(p, [], '2026-11-16')).toEqual([]);
    expect(extraStudyDates(p, [])).toContain('2026-11-15');
    // Untick brings it back.
    expect(suggestionsToday(toggleSuggestion(p, notebook.id, '2026-11-15'), [], '2026-11-15')[0].done).toBe(false);
  });

  it('leaves after 7 days when not done', () => {
    const p = addSuggestion(base(), notebook, '2026-11-10');
    expect(suggestionsToday(p, [], '2026-11-16')).toHaveLength(1);
    expect(suggestionsToday(p, [], '2026-11-17')).toHaveLength(0);
    expect(hasSuggestion(p, notebook.id, '2026-11-17')).toBe(false);
    // Adding it again after it expired starts a fresh one.
    const again = addSuggestion(p, notebook, '2026-11-17');
    expect(again.suggestedTasks).toHaveLength(1);
    expect(again.suggestedTasks![0].addedDate).toBe('2026-11-17');
  });

  it('a timer suggestion is done once that Part is timed after it was added', () => {
    const p = addSuggestion(base(), timer, '2026-11-14');
    expect(suggestionsToday(p, [run('2026-11-13', 'PART_7')], '2026-11-14')[0].done).toBe(false);
    expect(suggestionsToday(p, [run('2026-11-14', 'PART_5')], '2026-11-14')[0].done).toBe(false);
    expect(suggestionsToday(p, [run('2026-11-14', 'PART_7_MULTI')], '2026-11-14')[0].done).toBe(true);
    expect(suggestionsToday(p, [run('2026-11-14', 'PART_7')], '2026-11-15')).toHaveLength(0);
  });

  it('phones keep open suggestions visible instead of folding them into the summary row', () => {
    const p = addSuggestion(addSuggestion(base(), timer, '2026-11-14'), notebook, '2026-11-14');
    const views = suggestionsToday(p, [], '2026-11-14');
    const task = { id: 'full_test:x', kind: 'FULL_TEST' as const, kicker: '', title: 'Làm 1 đề full', reason: '', minutes: 120, done: false };
    const withTask = buildPhoneItems([task], [], '2026-11-14', views);
    expect(withTask.hero?.key).toBe(task.id);
    expect(withTask.pinned.map(i => i.key)).toEqual([timer.id, notebook.id]);
    expect(withTask.restOpen).toBe(0);
    expect(withTask.total).toBe(3);
    const alone = buildPhoneItems([], [], '2026-11-14', views);
    expect(alone.hero?.key).toBe(timer.id);
    expect(alone.pinned.map(i => i.key)).toEqual([notebook.id]);
  });

  it('hides Sóc’s own timer for a Part that already has a suggested timer', () => {
    const views = suggestionsToday(addSuggestion(base(), timer, '2026-11-14'), [], '2026-11-14');
    const mk = (part: 5 | 7) => ({ id: `part_timer:${part}`, kind: 'PART_TIMER' as const, kicker: '', title: '', reason: '', minutes: 20, part, done: false });
    expect(withoutRepeatedTimers([mk(7), mk(5)], views).map(t => t.part)).toEqual([5]);
  });
});
