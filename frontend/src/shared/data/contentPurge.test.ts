import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateAccount, compactDeletedRecords, emptyBundle, readDataBundle, writeDataBundle } from '@/shared/data/dataBundle';
import { createBackupSnapshot, resetToCleanSlate } from '@/shared/data/storage';
import { parseBackup } from '@/shared/data/backup';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('deleted learning content', () => {
  it('stores only the deleted record ID and sync metadata', () => {
    const bundle = emptyBundle();
    const stamp = '2026-10-06T00:00:00.000Z';
    bundle.mistakes = [{ id:'m1', part:5, questionContext:'Private question', userMistake:'Private response', correctAnswer:'B',
      tags:['private'], category:'OTHER', status:'NEEDS_REVIEW', createdAt:stamp, updatedAt:stamp, deletedAt:stamp }];
    writeDataBundle(bundle);
    expect(readDataBundle().mistakes).toEqual([{ id:'m1', updatedAt:stamp, deletedAt:stamp }]);
    expect(values.get('toeic_progress_bundle_v3')).not.toContain('Private question');
    expect(bundle.mistakes[0].questionContext).toBe('Private question');
  });
  it('exports only live learning content and produces a valid backup', () => {
    const bundle = emptyBundle();
    bundle.vocabLog = [{ id:'old', date:'2026-10-04', count:1, updatedAt:bundle.profile.updatedAt, deletedAt:bundle.profile.updatedAt },
      { id:'live', date:'2026-10-06', count:2, updatedAt:bundle.profile.updatedAt, deletedAt:null }];
    writeDataBundle(bundle);
    const snapshot = createBackupSnapshot();
    expect(snapshot.vocabLog.map(item=>item.id)).toEqual(['live']);
    expect(parseBackup(JSON.stringify(snapshot)).ok).toBe(true);
  });
  it('clears only the guest scope and its retired copies after guest reset', () => {
    const bundle = emptyBundle();
    bundle.vocabLog = [{ id:'guest-log', date:'2026-10-06', count:10, updatedAt:bundle.profile.updatedAt, deletedAt:null }];
    writeDataBundle(bundle);
    values.set('toeic_progress_bundle_v2','old guest data');
    values.set('toeic_990_sessions_v1','old sessions');
    values.set('toeic_weekly_plans_v1_owner','guest');
    values.set('toeic_smart_weekly_plans_v1','old plans');
    values.set('toeic_progress_account_bob_v2','other owner data');
    resetToCleanSlate();
    expect(readDataBundle().vocabLog[0]).toMatchObject({id:'guest-log',deletedAt:expect.any(String)});
    expect(Object.keys(readDataBundle().vocabLog[0]).sort()).toEqual(['deletedAt','id','updatedAt']);
    expect(values.has('toeic_progress_bundle_v2')).toBe(false);
    expect(values.has('toeic_990_sessions_v1')).toBe(false);
    expect(values.has('toeic_smart_weekly_plans_v1')).toBe(false);
    expect(values.get('toeic_progress_account_bob_v2')).toBe('other owner data');
  });
  it('requires server reset for an active account', () => {
    activateAccount('alice');
    expect(()=>resetToCleanSlate()).toThrow('qua backend');
  });
  it('does not strip fields from records still in use', () => {
    const bundle = emptyBundle();
    bundle.vocabLog = [{id:'v1',date:'2026-10-06',count:12,updatedAt:bundle.profile.updatedAt,deletedAt:null}];
    expect(compactDeletedRecords(bundle).vocabLog).toEqual(bundle.vocabLog);
  });
});
