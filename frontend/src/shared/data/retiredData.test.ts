import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateAccount, defaultProfile, emptyBundle, readDataBundle, readGuestBundle } from '@/shared/data/dataBundle';
import { BACKUP_VERSION, parseBackup } from '@/shared/data/backup';
import { createBackupSnapshot, restoreBackup } from '@/shared/data/storage';
import { recordsFromBundle } from '@/features/account/services/cloud';

// Weekly plans and the exam checklist were retired (no screen, no sync).
const values = new Map<string, string>();
const now = '2026-11-10T00:00:00.000Z';
const retired = {
  checklist: [{ id: 'exam_slip', checked: true, updatedAt: now, deletedAt: null }],
  weeklyPlans: [{ id: '2026-11-09', weekKey: '2026-11-09', tasks: [], updatedAt: now, deletedAt: null }]
};
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('retired weekly plans and checklist', () => {
  it('a new bundle has neither and nothing seeds checklist defaults', () => {
    const bundle = emptyBundle() as unknown as Record<string, unknown>;
    expect(bundle.checklist).toBeUndefined();
    expect(bundle.weeklyPlans).toBeUndefined();
    expect(recordsFromBundle(emptyBundle()).map(row => row.entity_type)).toEqual(['profile']);
  });

  it('bundles stored by older versions still load, without the retired sections', () => {
    values.set('toeic_progress_bundle_v3', JSON.stringify({ ...emptyBundle(), ...retired }));
    const guest = readGuestBundle() as unknown as Record<string, unknown>;
    expect(guest.checklist).toBeUndefined();
    expect(guest.weeklyPlans).toBeUndefined();
    activateAccount('alice');
    values.set('toeic_progress_account_alice_v3', JSON.stringify({ ...emptyBundle(), ...retired }));
    expect(recordsFromBundle(readDataBundle()).some(row => (row.entity_type as string) === 'checklist')).toBe(false);
  });

  it('old v2 and v3 backups restore and drop those sections; new backups are v4 without them', () => {
    for (const schemaVersion of [2, 3]) {
      const result = parseBackup(JSON.stringify({ ...emptyBundle(), ...retired, schemaVersion, exportDate: now,
        profile: { ...defaultProfile(), name: 'Old file', updatedAt: now, deletedAt: null } }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.preview.counts.checklist).toBeUndefined();
      expect(result.preview.counts.weeklyPlans).toBeUndefined();
      expect('checklist' in result.preview.data).toBe(false);
      restoreBackup(result.preview);
      expect(readDataBundle().profile.name).toBe('Old file');
      expect('weeklyPlans' in readDataBundle()).toBe(false);
    }
    const snapshot = createBackupSnapshot();
    expect(snapshot.schemaVersion).toBe(BACKUP_VERSION);
    expect('checklist' in snapshot || 'weeklyPlans' in snapshot).toBe(false);
    expect(parseBackup(JSON.stringify(snapshot)).ok).toBe(true);
    expect(parseBackup(JSON.stringify({ ...snapshot, schemaVersion: 5 })).ok).toBe(false);
  });
});
