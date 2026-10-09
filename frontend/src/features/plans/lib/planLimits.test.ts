import { describe, expect, it } from 'vitest';
import type { SmartWeeklyTask } from '@/shared/types';
import { assertPlanFitsSync } from './planLimits';

const task: SmartWeeklyTask = { id: 'task', title: 'Luyện Part 7', type: 'AUTO_PART_PRACTICE', partNumber: 7, target: 2, unit: 'bài', createdAt: '2026-10-09T09:00:00Z' };

describe('weekly plan sync limits', () => {
  it('accepts ordinary goals and rejects more than 100 goals', () => {
    expect(() => assertPlanFitsSync({ weekKey: '2026-10-05', tasks: [task] })).not.toThrow();
    expect(() => assertPlanFitsSync({ weekKey: '2026-10-05', tasks: Array.from({ length: 101 }, (_, index) => ({ ...task, id: `task-${index}` })) })).toThrow('100 mục tiêu');
  });

  it('measures UTF-8 bytes so Vietnamese notes cannot silently exceed the API payload limit', () => {
    const tasks = Array.from({ length: 3 }, (_, index) => ({ ...task, id: `task-${index}`, notes: 'a'.repeat(4000) }));
    expect(() => assertPlanFitsSync({ weekKey: '2026-10-05', tasks })).not.toThrow();
    expect(() => assertPlanFitsSync({ weekKey: '2026-10-05', tasks: tasks.map(goal => ({ ...goal, notes: 'ấ'.repeat(4000) })) })).toThrow('quá nhiều nội dung');
  });
});
