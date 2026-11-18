// Sync RPC on the v2 baseline: wire round-trip of every entity, cursors,
// last-writer-wins, tombstones, replace, retired types, reset barrier,
// operator edits and account deletion.
import assert from 'node:assert/strict';
import { createDatabase, uid } from './harness.mjs';

const stamp = '2026-11-20T00:00:00.000Z';
const later = '2026-11-20T01:00:00.000Z';
const row = (type, payload, updated = stamp, deleted = null) => ({
  entity_type: type, record_id: type === 'profile' ? 'profile' : payload.id, payload: deleted ? { id: payload.id } : payload, updated_at: updated, deleted_at: deleted
});
const profile = row('profile', { name: 'Alice', targetScore: 800, examDate: '2026-12-06', selectedSkill: 'LR', dailyMinGoalMinutes: 30,
  streakFreezes: 2, shieldAllowance: 2, currentStreak: 3, longestStreak: 5, lastStudyDate: '2026-11-19', motto: 'Keep learning',
  goalChosen: true, socCoat: 'xam', socName: 'Hạt Dẻ', habits: [{ id: 'h1', label: 'Nghe 10 phút' }],
  suggestedTasks: [{ id: 's1', kind: 'PART_TIMER', part: 5, addedAt: stamp }] });
const full = row('sessions', {
  id: 'full1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS Test 1', date: '2026-11-19', durationMinutes: 120,
  createdAt: stamp, rawListening: 75, rawReading: 70, scaledListening: 320, scaledReading: 285, totalScore: 605,
  partScores: { part1: 6, part2: 20, part3: 29, part4: 20, part5: 20, part6: 10, part7: 40 }, notes: 'First test',
  scoreSource: 'ESTIMATED', wrongQuestions: [7, 8],
  resultTiming: { source: 'IMAGE_CONFIRMED', totalSeconds: 6721, listeningSeconds: null, readingSeconds: null,
    parts: { part1: null, part2: null, part3: null, part4: null, part5: 870, part6: null, part7: null } }
});
const practice = row('sessions', { id: 'practice1', skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Mini', date: '2026-11-19',
  durationMinutes: 20, createdAt: stamp, practiceParts: [{ part: 5, correct: 10, total: 15, origin: 'book' }, { part: 7, correct: 5, total: 10 }] });
const mistake = row('mistakes', { id: 'm1', sessionId: 'full1', part: 5, category: 'ADVANCED_GRAMMAR', status: 'NEEDS_REVIEW',
  questionContext: 'Reports ____ submitted.', userMistake: '(A) are', correctAnswer: '(B) be', answerSource: 'AI_PROPOSED', trapTip: 'Subjunctive',
  options: ['(A) are', '(B) be', '(C) were', '(D) been'], tags: ['grammar'], createdAt: stamp, reviewStage: 0, nextReviewDate: '2026-11-22',
  userChoice: 'A', userChoiceState: 'CHOSEN', sourceImageIds: ['a'.repeat(64)], lastReviewedAt: '2026-11-20T08:30:00.000Z' });
const pacing = row('pacingRuns', { id: 'p1', presetId: 'FULL_TEST', presetName: 'Full Test', date: '2026-11-19', plannedMinutes: 120,
  actualMinutes: 125, finishedNaturally: false, createdAt: stamp, partType: 'FULL_READING',
  phases: [{ name: 'Reading', plannedMinutes: 75, actualMinutes: 80, overrunMinutes: 5, marker: 'late' }] });
const vocab = row('vocabLog', { id: 'v1', date: '2026-11-19', count: 12, sourceName: 'ETS 2024 Test 04', parts: [5, 7] });
const shield = row('shieldDays', { id: 'shield:2026-11-18', date: '2026-11-18' });
const fixtures = [profile, full, practice, mistake, pacing, vocab, shield];
const get = (reply, id) => reply.records.find(item => item.record_id === id);
const normalize = value => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, /At$/.test(key) && typeof item === 'string' ? new Date(item).toISOString() : normalize(item)]));
  return value;
};

const h = await createDatabase();
const { db, one, value, sync } = h;
const alice = uid(1), bob = uid(2), guest = uid(3);
try {
  await h.addUser(alice, { email: 'alice@example.test' });
  await h.addUser(bob, { email: 'bob@example.test' });
  await h.addUser(guest, { anonymous: true });

  // Round-trip: the payload comes back exactly as the app sent it.
  const first = await sync(alice, fixtures);
  assert.equal(first.records.length, fixtures.length);
  assert.ok(first.cursor > 0 && first.hasRecords);
  assert.match(first.epoch, /^[0-9a-f-]{36}$/);
  for (const fixture of fixtures) {
    const back = get(first, fixture.record_id);
    assert.equal(back.deleted_at, null);
    assert.deepEqual(normalize(back.payload), normalize(fixture.payload), `${fixture.record_id} payload changed`);
  }
  assert.equal(await value('select count(*)::int from public.study_session_parts'), 2);
  assert.equal(await value('select count(*)::int from public.pacing_run_phases'), 1);
  assert.deepEqual(await one('select (extra->>\'goalChosen\')::boolean as goal, extra->>\'socCoat\' as coat from public.user_profiles where user_id=$1', [alice]),
    { goal: true, coat: 'xam' }, 'UI preferences live in user_profiles.extra');

  // Cursors: quiet sync returns nothing; a newer write is returned once.
  const quiet = await sync(alice, [], first.cursor);
  assert.deepEqual([quiet.records.length, quiet.cursor], [0, first.cursor]);
  const changed = await sync(alice, [row('vocabLog', { ...vocab.payload, count: 20 }, later)], first.cursor);
  assert.equal(changed.records.length, 1);
  assert.equal(get(changed, 'v1').payload.count, 20);
  assert.ok(changed.cursor > first.cursor);
  const stale = await sync(alice, [vocab], changed.cursor);
  assert.equal(get(stale, 'v1').payload.count, 20, 'An older write is refused and the canonical row returned');
  assert.equal(stale.cursor, changed.cursor);

  // Deletion: content removed, tombstone kept; equal timestamps let deletion win.
  const deleted = await sync(alice, [row('mistakes', mistake.payload, stamp, stamp)], changed.cursor);
  assert.ok(get(deleted, 'm1').deleted_at);
  assert.deepEqual(get(deleted, 'm1').payload, { id: 'm1' });
  assert.equal(await value('select count(*)::int from public.mistakes'), 0);
  assert.equal(await value("select count(*)::int from public.sync_tombstones where record_id='m1'"), 1);
  const revive = await sync(alice, [mistake], deleted.cursor);
  assert.ok(get(revive, 'm1').deleted_at, 'An older live copy cannot revive a deleted card');
  const recreated = await sync(alice, [row('mistakes', mistake.payload, later)], deleted.cursor);
  assert.equal(get(recreated, 'm1').deleted_at, null, 'A newer edit recreates the card');
  assert.equal(await value("select count(*)::int from public.sync_tombstones where record_id='m1'"), 0);

  // Retired entity types from older apps are accepted and ignored.
  const retired = await sync(alice, [row('checklist', { id: 'exam_slip', checked: true }),
    row('weeklyPlans', { id: '2026-11-16', weekKey: '2026-11-16', tasks: [] })], recreated.cursor);
  assert.equal(retired.records.length, 0);
  await assert.rejects(sync(alice, [row('unknown', { id: 'x' })]), /Invalid record/);
  await assert.rejects(sync(alice, [{ ...vocab, record_id: 'other' }]), /Invalid record identity/);
  await assert.rejects(sync(alice, [{ ...profile, deleted_at: stamp }]), /Invalid profile/);
  await assert.rejects(sync(alice, [row('vocabLog', { id: 'bad', date: '2026-11-19', count: 0 })]), /check constraint/);
  await assert.rejects(sync(guest, []), /Permanent account/);
  await assert.rejects(sync(alice, [], -1), /Invalid sync request/);

  // Accounts are isolated.
  assert.equal((await sync(bob, [])).records.length, 0);
  await sync(bob, [row('sessions', { ...practice.payload, id: 'bob-session' })]);
  assert.equal((await sync(alice, [], 0)).records.some(item => item.record_id === 'bob-session'), false);

  // A cursor from another database generation (larger than ours) gets everything.
  const all = await sync(alice, [], Number.MAX_SAFE_INTEGER);
  assert.equal(all.records.filter(item => !item.deleted_at).length, fixtures.length);

  // Operator edits and deletes in the Table Editor reach every device.
  const beforeEdit = all.cursor;
  await db.query("update public.study_sessions set notes='Edited by operator' where user_id=$1 and id='full1'", [alice]);
  await db.query("update public.study_session_parts set correct=11 where user_id=$1 and session_id='practice1' and position=0", [alice]);
  const edited = await sync(alice, [], beforeEdit);
  assert.equal(get(edited, 'full1').payload.notes, 'Edited by operator');
  assert.equal(get(edited, 'practice1').payload.practiceParts[0].correct, 11, 'Child edits bump the parent');
  await db.query("delete from public.vocabulary_logs where user_id=$1 and id='v1'", [alice]);
  const operatorDelete = await sync(alice, [], edited.cursor);
  assert.ok(get(operatorDelete, 'v1').deleted_at, 'Operator deletion becomes a tombstone');
  await assert.rejects(db.query("update public.study_sessions set id='other' where user_id=$1 and id='full1'", [alice]), /immutable/);

  // Replace: the device's set wins; server-only records are deleted.
  const replaced = await sync(alice, [profile, full], 0, true);
  assert.equal(get(replaced, 'full1').deleted_at, null);
  assert.ok(get(replaced, 'practice1').deleted_at, 'Replacement deletes records the device does not have');
  await assert.rejects(sync(alice, [full], 0, true), /replacement/i);

  // Reset: content erased, profile back to defaults, stale devices blocked.
  await sync(alice, [row('vocabLog', { id: 'v2', date: '2026-11-19', count: 4 }, later)]);
  const reset = await value('select public.reset_learning_data($1::uuid)', [alice]);
  assert.equal(reset.resetBarrier, true);
  assert.ok(reset.records.filter(item => item.entity_type !== 'profile').every(item => item.deleted_at));
  assert.equal(get(reset, 'profile').payload.name, 'Học viên');
  assert.equal(await value('select count(*)::int from public.study_sessions where user_id=$1', [alice]), 0);
  const staleDevice = await sync(alice, [row('vocabLog', { id: 'v3', date: '2026-11-19', count: 4 }, '2026-11-21T00:00:00Z')], replaced.cursor);
  assert.equal(staleDevice.resetBarrier, true, 'A device that missed the reset cannot upload');
  assert.equal(await value("select count(*)::int from public.vocabulary_logs where id='v3'"), 0);
  const fresh = await sync(alice, [row('vocabLog', { id: 'v3', date: '2026-11-19', count: 4 }, '2026-11-21T00:00:00Z')], reset.cursor);
  assert.equal(get(fresh, 'v3').deleted_at, null, 'A device that saw the reset writes normally');

  // Size limits.
  const tooMany = Array.from({ length: 10001 }, (_, n) => row('vocabLog', { id: 'n' + n, date: '2026-11-19', count: 1 }));
  await assert.rejects(sync(alice, tooMany), /Invalid sync request/);

  // Deleting the Auth account removes every row, leaving no tombstones behind.
  await db.query('delete from auth.users where id=$1', [alice]);
  for (const table of ['user_profiles', 'study_sessions', 'study_session_parts', 'mistakes', 'vocabulary_logs', 'pacing_runs',
    'pacing_run_phases', 'streak_shields', 'sync_tombstones', 'learning_data_resets', 'ai_access_grants']) {
    assert.equal(await value(`select count(*)::int from public.${table} where user_id=$1`, [alice]), 0, `${table} survived account deletion`);
  }
  assert.equal(await value('select count(*)::int from public.study_sessions where user_id=$1', [bob]), 1, 'Other accounts are untouched');
  console.log('Sync round-trip, cursors, LWW, tombstones, retired types, replace, reset barrier, operator edits and account deletion passed.');
} finally {
  await db.close();
}
