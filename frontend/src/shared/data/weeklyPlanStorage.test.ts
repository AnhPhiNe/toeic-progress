import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateAccount, deactivateAccount, defaultProfile, emptyBundle, readDataBundle, readGuestBundle, setAccountWriteEnabled, writeAccountBundle } from '@/shared/data/dataBundle';
import { getOrCreateWeeklyPlan, loadWeeklyPlans, saveWeeklyPlans } from '@/shared/data/storage';
import { parseBackup } from '@/shared/data/backup';
import { restoreBackup } from '@/shared/data/storage';
import { reconcileBundles } from '@/shared/data/syncMerge';

const values = new Map<string, string>();
const week = '2026-10-05';
const plan = { weekKey: week, tasks: [{ id: 'task', title: 'Ôn Part 5', type: 'CUSTOM' as const, target: 1, unit: 'lần', createdAt: '2026-10-05T00:00:00.000Z' }] };
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  setAccountWriteEnabled(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('weekly plan persistence and migration', () => {
  it('does not save generated defaults while rendering a summary', () => {
    const first = getOrCreateWeeklyPlan(week, defaultProfile(), false);
    const second = getOrCreateWeeklyPlan(week, defaultProfile(), false);
    expect(first.tasks.map(task => task.id)).toEqual(second.tasks.map(task => task.id));
    expect(loadWeeklyPlans()).toEqual({});
  });
  it('migrates v2 and the legacy guest plan without deleting original bytes', () => {
    const { weeklyPlans: _plans, ...old } = emptyBundle();
    const bytes = JSON.stringify({ ...old, schemaVersion: 2 });
    values.set('toeic_progress_bundle_v2', bytes);
    values.set('toeic_smart_weekly_plans_v1', JSON.stringify({ [week]: plan }));
    expect(readGuestBundle().weeklyPlans[0].tasks).toEqual(plan.tasks);
    expect(readGuestBundle().schemaVersion).toBe(3);
    expect(values.get('toeic_progress_bundle_v2')).toBe(bytes);
  });
  it('does not migrate shared legacy plans into another account or the guest', () => {
    const { weeklyPlans: _plans, ...old } = emptyBundle();
    values.set('toeic_progress_account_alice_v2', JSON.stringify({ ...old, schemaVersion: 2 }));
    values.set('toeic_progress_account_bob_v2', JSON.stringify({ ...old, schemaVersion: 2 }));
    values.set('toeic_smart_weekly_plans_v1', JSON.stringify({ [week]: plan }));
    activateAccount('alice');
    expect(readDataBundle().weeklyPlans).toHaveLength(1);
    activateAccount('bob');
    expect(readDataBundle().weeklyPlans).toHaveLength(0);
    deactivateAccount();
    expect(readGuestBundle().weeklyPlans).toHaveLength(0);
  });
  it('isolates guest and account plans and blocks account edits offline', () => {
    saveWeeklyPlans({ [week]: plan });
    writeAccountBundle('alice', emptyBundle());
    activateAccount('alice');
    expect(loadWeeklyPlans()).toEqual({});
    expect(() => saveWeeklyPlans({ [week]: plan })).toThrow('Chưa kết nối');
    deactivateAccount();
    expect(loadWeeklyPlans()[week].tasks).toEqual(plan.tasks);
  });
  it('preserves weekly plans when restoring an older v2 backup', () => {
    saveWeeklyPlans({ [week]: plan });
    const { weeklyPlans: _plans, ...old } = readDataBundle();
    const result = parseBackup(JSON.stringify({ ...old, schemaVersion: 2, exportDate: new Date().toISOString() }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    restoreBackup(result.preview);
    expect(loadWeeklyPlans()[week].tasks).toEqual(plan.tasks);
  });
  it('keeps a weekly plan deletion when reconciling another device', () => {
    saveWeeklyPlans({ [week]: plan });
    const original = readDataBundle();
    saveWeeklyPlans({});
    const merged = reconcileBundles(original, readDataBundle(), 'merge');
    expect(merged.weeklyPlans[0].deletedAt).toBeTruthy();
  });
  it('rejects malformed v3 plans before replacing data', () => {
    const source = { ...emptyBundle(), exportDate: new Date().toISOString(), weeklyPlans: [{ id: week, weekKey: week, tasks: [], updatedAt: new Date().toISOString(), deletedAt: null }] };
    source.weeklyPlans[0].id = '2026-10-12';
    expect(parseBackup(JSON.stringify(source)).ok).toBe(false);
    expect(defaultProfile().name).toBe('Học viên');
  });
});
