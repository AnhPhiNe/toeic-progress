import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateAccount, clearRetiredCopies, compactDeletedRecords, deactivateAccount, emptyBundle, purgeAccountLocalStorage, readDataBundle, StorageWriteError, writeAccountBundle, writeDataBundle } from '@/shared/data/dataBundle';
import { createBackupSnapshot, resetToCleanSlate } from '@/shared/data/storage';
import { parseBackup } from '@/shared/data/backup';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('deleted learning content', () => {
  it('reset removes only this owner drafts and advice cache, retaining other accounts and saved records', () => {
    values.set('toeic_form_draft_v1:alice:session%3Anew', 'private draft');
    values.set('toeic_form_draft_v1:alice:mistake%3Anew', 'another draft');
    values.set('toeic_form_draft_v1:bob:session%3Anew', 'bob draft');
    values.set('toeic_form_draft_v1:guest:session%3Anew', 'guest draft');
    values.set('toeic_attempt_advice_alice_v1', 'derived report');
    values.set('toeic_attempt_advice_alice_v2', 'derived v2 report');
    values.set('toeic_attempt_advice_bob_v1', 'bob report');
    values.set('toeic_attempt_advice_bob_v2', 'bob v2 report');
    values.set('toeic_explain_tickets_v1', JSON.stringify({
      c1: { owner: 'alice', ticket: 't1', expires: 9999999999999 },
      c2: { owner: 'bob', ticket: 't2', expires: 9999999999999 },
      c3: { owner: null, ticket: 't3', expires: 9999999999999 },
    }));
    values.set('toeic_progress_account_alice_v3', 'saved records');
    clearRetiredCopies('alice');
    expect(values.has('toeic_form_draft_v1:alice:session%3Anew')).toBe(false);
    expect(values.has('toeic_form_draft_v1:alice:mistake%3Anew')).toBe(false);
    expect(values.has('toeic_attempt_advice_alice_v1')).toBe(false);
    expect(values.has('toeic_attempt_advice_alice_v2')).toBe(false);
    expect(JSON.parse(values.get('toeic_explain_tickets_v1')!)).toEqual({
      c2: { owner: 'bob', ticket: 't2', expires: 9999999999999 },
      c3: { owner: null, ticket: 't3', expires: 9999999999999 },
    });
    expect(values.get('toeic_form_draft_v1:bob:session%3Anew')).toBe('bob draft');
    expect(values.get('toeic_form_draft_v1:guest:session%3Anew')).toBe('guest draft');
    expect(values.get('toeic_attempt_advice_bob_v1')).toBe('bob report');
    expect(values.get('toeic_attempt_advice_bob_v2')).toBe('bob v2 report');
    expect(values.get('toeic_progress_account_alice_v3')).toBe('saved records');
  });

  it('wraps QuotaExceededError in writeAccountBundle into a StorageWriteError', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: (key: string) => values.delete(key),
    });
    expect(() => writeAccountBundle('alice', emptyBundle())).toThrow(StorageWriteError);
  });
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

  it('purgeAccountLocalStorage scrubs every persisted key of the signed-out account while preserving other accounts and guest', () => {
    values.set('toeic_progress_account_alice_v3', '{"profile":{"name":"Alice"}}');
    values.set('toeic_progress_account_bob_v3', '{"profile":{"name":"Bob"}}');
    values.set('toeic_progress_bundle_v3', '{"profile":{"name":"Guest"}}');
    values.set('toeic_sync_cursor_alice_v3', '{"cursor":9}');
    values.set('toeic_attempt_advice_consent_alice_v1', 'true');
    values.set('toeic_pomodoro_settings_v2_alice', '{"focus":25}');
    values.set('toeic_pacing_sound_alice', 'true');
    values.set('toeic_source_image_cleanup_alice', '2026-11-20T00:00:00Z');
    values.set('rd_task_skip_v1:alice', '{"date":"2026-11-22","ids":["t1"]}');
    values.set('rd_journey_force_v1:alice', '["s1"]');
    values.set('rd_task_skip_v1:bob', '{"date":"2026-11-22","ids":["t2"]}');
    values.set('toeic_wrong_detail_skip_listening_v1', JSON.stringify({ alice: true, bob: true }));
    values.set('toeic_explain_tickets_v1', JSON.stringify({
      c1: { owner: 'alice', ticket: 'secret-hmac', expires: 9999999999999 },
      c2: { owner: 'bob', ticket: 'bob-hmac', expires: 9999999999999 },
    }));

    activateAccount('alice');
    deactivateAccount();
    purgeAccountLocalStorage('alice');

    for (const removed of [
      'toeic_progress_account_alice_v3',
      'toeic_sync_cursor_alice_v3',
      'toeic_attempt_advice_consent_alice_v1',
      'toeic_pomodoro_settings_v2_alice',
      'toeic_pacing_sound_alice',
      'toeic_source_image_cleanup_alice',
      'rd_task_skip_v1:alice',
      'rd_journey_force_v1:alice',
    ]) {
      expect(values.has(removed)).toBe(false);
    }
    expect(JSON.parse(values.get('toeic_wrong_detail_skip_listening_v1')!)).toEqual({ bob: true });
    expect(JSON.parse(values.get('toeic_explain_tickets_v1')!)).toEqual({
      c2: { owner: 'bob', ticket: 'bob-hmac', expires: 9999999999999 },
    });
    expect(values.get('toeic_progress_account_bob_v3')).toBe('{"profile":{"name":"Bob"}}');
    expect(values.get('toeic_progress_bundle_v3')).toBe('{"profile":{"name":"Guest"}}');
    expect(values.get('rd_task_skip_v1:bob')).toBe('{"date":"2026-11-22","ids":["t2"]}');
  });
});
