import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const stamp = '2026-10-05T00:00:00.000Z';
const row = (type, payload, updated = stamp, deleted = null) => ({ entity_type: type, record_id: type === 'profile' ? 'profile' : payload.id, payload, updated_at: updated, deleted_at: deleted });
const profile = row('profile', { name: 'Alice', targetScore: 800, examDate: '2026-12-06', selectedSkill: 'LR', dailyMinGoalMinutes: 30, streakFreezes: 2, motto: 'Keep learning', customPreference: 'calm' });
const full = row('sessions', {
  id: 'full1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS Test 1', date: '2026-10-05', durationMinutes: 120,
  createdAt: stamp, rawListening: 75, rawReading: 70, scaledListening: 320, scaledReading: 285, totalScore: 605,
  partScores: { part1: 6, part2: 20, part3: 29, part4: 20, part5: 20, part6: 10, part7: 40 }, notes: 'First test', source: 'paper',
  scoreSource: 'ESTIMATED', scoreConversionVersion: 'iibc-mock-2023-perfect-v2'
});
const practice = row('sessions', {
  id: 'practice1', skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Mini practice', date: '2026-10-06', durationMinutes: 20, createdAt: stamp,
  practiceParts: [{ part: 5, correct: 10, total: 15, origin: 'book' }, { part: 7, correct: 5, total: 10 }]
});
const mistake = row('mistakes', {
  id: 'm1', sessionId: 'full1', part: 5, category: 'ADVANCED_GRAMMAR', status: 'NEEDS_REVIEW',
  questionContext: 'Reports ____ submitted.', userMistake: '(A) are', correctAnswer: '(B) be', answerSource: 'AI_PROPOSED', trapTip: 'Subjunctive',
  options: ['(A) are','(B) be','(C) were','(D) been'], tags: ['grammar'], createdAt: stamp, reviewStage: 0, nextReviewDate: '2026-10-08',
  userChoice: 'A', userChoiceState: 'CHOSEN', userReason: 'Reports số nhiều\nMình chọn are.', answerProvidedBy: 'SOURCE',
  sourceTestName: 'ETS Test 1',
  lastReviewedAt: '2026-10-05T08:30:00.000Z'
});
const orphan = row('mistakes', { ...mistake.payload, id: 'orphan', sessionId: 'external-session' });
const plan = row('weeklyPlans', {
  id: '2026-10-05', weekKey: '2026-10-05', tasks: [
    { id: 't1', title: 'Practice test', type: 'CUSTOM', target: 1, unit: 'lần', createdAt: stamp, isCompleted: false, manualDone: 0, origin: 'import' },
    { id: 't2', title: 'Study time', type: 'AUTO_STUDY_TIME', target: 210, unit: 'phút', createdAt: stamp, color: 'indigo' }
  ]
});
const pacing = row('pacingRuns', {
  id: 'p1', presetId: 'FULL_TEST', presetName: 'Full Test', date: '2026-10-05', plannedMinutes: 120, actualMinutes: 125,
  finishedNaturally: false, createdAt: stamp, phases: [{ name: 'Reading', plannedMinutes: 75, actualMinutes: 80, overrunMinutes: 5, marker: 'late' }]
});
const fixtures = [profile, full, practice, mistake, orphan, plan, pacing,
  row('vocabLog', { id: 'v1', date: '2026-10-06', count: 12, sourceName: 'ETS 2024 Test 04', parts: [5,7] }), row('checklist', { id: 'exam-slip', checked: false }),
  row('shieldDays', { id: 'shield:2026-10-04', date: '2026-10-04' })];
const sync = async (owner, records = [], cursor = 0, replace = false) => (await db.query(
  'select public.sync_account_records($1::uuid,$2::jsonb,$3::bigint,$4::boolean) as result', [owner, JSON.stringify(records), cursor, replace]
)).rows[0].result;
const get = (reply, id) => reply.records.find(item => item.record_id === id);
const normalize = value => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /At$/.test(key) && typeof item === 'string' ? new Date(item).toISOString() : normalize(item)]));
  return value;
};

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const filename of ['20260923000000_sync_records.sql','20261005000000_fastapi_backend.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/'+filename, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users values($1,false),($2,false)', [alice,bob]);
  const original = await sync(alice, fixtures);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006000000_domain_tables.sql', import.meta.url), 'utf8'));
  const migrated = await sync(alice);
  assert.equal(migrated.cursor, original.cursor, 'Migration must not invalidate browser cursors');
  assert.equal(migrated.records.length, fixtures.length);
  for (const fixture of fixtures) {
    const payload = normalize(get(migrated,fixture.record_id).payload);
    for (const [key,value] of Object.entries(normalize(fixture.payload))) assert.deepEqual(payload[key],value, `${fixture.record_id}.${key} changed during backfill`);
  }
  assert.equal(get(migrated, 'm1').payload.answerSource, 'AI_PROPOSED', 'Answer provenance must survive database backfill/sync');
  assert.equal((await db.query("select count(*)::int as total from information_schema.columns where table_schema='public' and table_name in ('user_profiles','study_sessions','mistakes','vocabulary_logs','weekly_plans') and column_name='payload'")).rows[0].total, 0, 'Business tables must contain native columns');
  assert.deepEqual((await db.query('select id from public.exam_history')).rows.map(item=>item.id), ['full1']);
  assert.equal((await db.query('select count(*)::int as total from public.study_session_parts')).rows[0].total, 2);
  assert.equal((await db.query('select count(*)::int as total from public.weekly_plan_tasks')).rows[0].total, 2);
  assert.equal((await db.query('select linked_session_id from public.mistakes where id=$1', ['m1'])).rows[0].linked_session_id, 'full1');
  assert.equal((await db.query('select linked_session_id from public.mistakes where id=$1', ['orphan'])).rows[0].linked_session_id, null);
  await sync(alice, [row('sessions', { ...full.payload, id: 'external-session' })], migrated.cursor);
  assert.equal((await db.query('select linked_session_id from public.mistakes where id=$1', ['orphan'])).rows[0].linked_session_id, 'external-session');

  // New score modes use the existing nullable native columns and extra metadata.
  const manual = row('sessions', { id:'manual-score', skillType:'LR', sessionType:'FULL_TEST', testName:'Manual score', date:'2026-10-05', durationMinutes:120, createdAt:stamp, scoreSource:'MANUAL_SECTIONS', scaledListening:445, scaledReading:350, totalScore:795 });
  let manualReply = await sync(alice, [manual]);
  assert.equal(get(manualReply, 'manual-score').payload.scoreSource, 'MANUAL_SECTIONS');
  assert.equal(get(manualReply, 'manual-score').payload.totalScore, 795);
  const totalOnly = row('sessions', { id:'manual-score', skillType:'LR', sessionType:'FULL_TEST', testName:'Manual score', date:'2026-10-05', durationMinutes:120, createdAt:stamp, scoreSource:'MANUAL_TOTAL', totalScore:800 }, '2026-10-06T00:00:00.000Z');
  manualReply = await sync(alice, [totalOnly]);
  const totalPayload = get(manualReply, 'manual-score').payload;
  assert.equal(totalPayload.scoreSource, 'MANUAL_TOTAL');
  assert.equal(totalPayload.totalScore, 800);
  for (const field of ['scaledListening','scaledReading','rawListening','rawReading','partScores']) assert.ok(!(field in totalPayload), `${field} must remain absent for total-only entry`);
  assert.equal((await db.query("select scaled_listening from public.study_sessions where id='manual-score'")).rows[0].scaled_listening, null);

  const vocabPayload = get(await sync(alice), 'v1').payload;
  assert.equal(vocabPayload.sourceName, 'ETS 2024 Test 04');
  assert.deepEqual(vocabPayload.parts, [5,7]);
  await db.query("update public.vocabulary_logs set word_count=15 where user_id=$1 and id='v1'", [alice]);
  const editedVocab = get(await sync(alice), 'v1').payload;
  assert.equal(editedVocab.count, 15);
  assert.equal(editedVocab.sourceName, 'ETS 2024 Test 04');
  assert.deepEqual(editedVocab.parts, [5,7]);

  const readAs = (owner, anonymous, query) => db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [owner, JSON.stringify({is_anonymous:anonymous})]);
    return (await tx.query(query)).rows;
  });
  for (const table of ['user_profiles','study_sessions','mistakes','vocabulary_logs','weekly_plans','pacing_runs','exam_checklist','streak_shields','study_session_parts','weekly_plan_tasks','pacing_run_phases','sync_records','exam_history']) {
    assert.ok((await readAs(alice,false,`select * from public.${table}`)).length>0, `${table} owner read missing`);
    assert.equal((await readAs(bob,false,`select * from public.${table}`)).length, 0, `${table} leaked across accounts`);
    assert.equal((await readAs(alice,true,`select * from public.${table}`)).length, 0, `${table} leaked to anonymous identity`);
  }
  await assert.rejects(readAs(alice,false,'select * from public.sync_records_legacy'), /permission denied/);
  await assert.rejects(readAs(alice,false,"update public.vocabulary_logs set word_count=100"), /permission denied/);
  await assert.rejects(db.query('update public.sync_records_legacy set payload=payload where user_id=$1', [alice]), /Legacy storage is frozen/);
  await assert.rejects(db.query('update public.study_sessions set part5_correct=31 where id=$1', ['full1']), /check constraint/);
  await assert.rejects(db.query('update public.vocabulary_logs set word_count=0 where id=$1', ['v1']), /check constraint/);
  await sync(bob, [row('sessions', { ...practice.payload, id: 'bob-session' })]);
  await sync(alice, [row('mistakes', { ...mistake.payload, id: 'cross-reference', sessionId: 'bob-session' })]);
  assert.equal((await db.query('select linked_session_id from public.mistakes where id=$1', ['cross-reference'])).rows[0].linked_session_id, null, 'A historical string reference must never link to another owner');

  const beforeEdit = (await sync(alice)).cursor;
  await db.query('update public.study_sessions set notes=$1 where user_id=$2 and id=$3', ['Edited in native table',alice,'full1']);
  const edited = await sync(alice, [], beforeEdit);
  assert.equal(get(edited,'full1').payload.notes, 'Edited in native table');
  const stale = await sync(alice, [full], edited.cursor);
  assert.equal(get(stale,'full1').payload.notes, 'Edited in native table');
  await db.query('update public.weekly_plan_tasks set target=2 where user_id=$1 and id=$2', [alice,'t1']);
  const childEdit = await sync(alice, [], edited.cursor);
  assert.equal(get(childEdit,plan.record_id).payload.tasks[0].target, 2, 'Child edits must appear in sync delta');

  await db.query('delete from public.vocabulary_logs where user_id=$1 and id=$2', [alice,'v1']);
  assert.ok((await db.query('select deleted_at from public.vocabulary_logs where id=$1', ['v1'])).rows[0].deleted_at);
  const deletion = await sync(alice, [], childEdit.cursor);
  assert.ok(get(deletion,'v1').deleted_at, 'Operator deletion must become a sync tombstone');

  const replacement = await sync(alice, [profile], 0, true);
  assert.ok(replacement.records.filter(item=>item.entity_type!=='profile').every(item=>item.deleted_at), 'Replace must tombstone all omitted business tables');
  assert.equal((await db.query('select count(*)::int as total from public.exam_history')).rows[0].total, 0);
  await db.query('delete from auth.users where id=$1', [alice]);
  for (const table of ['sync_records_legacy','user_profiles','study_sessions','mistakes','vocabulary_logs','weekly_plans','weekly_plan_tasks','study_session_parts','pacing_runs','pacing_run_phases','exam_checklist','streak_shields']) {
    assert.equal((await db.query(`select count(*)::int as total from public.${table} where user_id=$1`, [alice])).rows[0].total, 0, `${table} survived account deletion`);
  }
  console.log('Native schema backfill, payload compatibility, child relations, RLS, operator edits, tombstones and Auth deletion passed.');
} catch (error) {
  console.error('Domain database check failed:', error.message, error.where || '', error.code || '');
  process.exitCode = 1;
} finally {
  await db.close();
}

if (!process.exitCode) {
  const invalid = new PGlite();
  try {
    await invalid.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`);
    for (const filename of ['20260923000000_sync_records.sql','20261005000000_fastapi_backend.sql']) {
      await invalid.exec(await readFile(new URL('../../supabase/migrations/'+filename, import.meta.url), 'utf8'));
    }
    await invalid.query('insert into auth.users values($1,false)', [alice]);
    const bad = row('vocabLog', { id:'invalid-vocabulary', date:'2026-10-05', count:0 });
    await invalid.query('select public.sync_account_records($1::uuid,$2::jsonb,0,false)', [alice,JSON.stringify([bad])]);
    await assert.rejects(invalid.exec(await readFile(new URL('../../supabase/migrations/20261006000000_domain_tables.sql', import.meta.url), 'utf8')), /check constraint/);
    await invalid.exec('rollback');
    assert.equal((await invalid.query("select relkind from pg_class where oid='public.sync_records'::regclass")).rows[0].relkind, 'r');
    assert.equal((await invalid.query('select payload from public.sync_records')).rows[0].payload.count, 0, 'Failure must leave original data intact');
    assert.equal((await invalid.query("select to_regclass('public.study_sessions') as relation")).rows[0].relation, null, 'Failure must roll back new schema');
    console.log('Invalid legacy data rolls back the complete migration without deleting source records.');
  } catch (error) {
    console.error('Migration rollback check failed:', error.message, error.where || '', error.code || '');
    process.exitCode=1;
  } finally {
    await invalid.close();
  }
}
