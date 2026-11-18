// The live rebuild, end to end: v1 (archived migrations) with data ->
// export_v1.sql -> drop_v1.sql -> baseline -> restore_v2.sql. Every step is
// re-run to prove it is idempotent, and device cursors from v1 still work.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { baselineSql, createDatabase, uid } from './harness.mjs';

const archive = new URL('../../supabase/migrations/archive/', import.meta.url);
const rebuild = name => readFile(new URL('../../supabase/rebuild/' + name, import.meta.url), 'utf8');
const stamp = '2026-11-10T00:00:00.000Z';
const row = (type, payload, updated = stamp, deleted = null) => ({
  entity_type: type, record_id: type === 'profile' ? 'profile' : payload.id, payload: deleted ? { id: payload.id } : payload, updated_at: updated, deleted_at: deleted
});
const comparable = reply => reply.records.filter(r => !['checklist', 'weeklyPlans'].includes(r.entity_type))
  .map(r => ({ ...r, updated_at: new Date(r.updated_at).toISOString(), deleted_at: r.deleted_at && new Date(r.deleted_at).toISOString() }))
  .sort((a, b) => (a.entity_type + a.record_id).localeCompare(b.entity_type + b.record_id));

const h = await createDatabase({ apply: false });
const { db, value } = h;
const alice = uid(1), owner = uid(2), gone = uid(3);
const v1sync = async (user, records, cursor = 0) => value(
  'select public.sync_account_records($1::uuid,$2::jsonb,$3::bigint,false)', [user, JSON.stringify(records), cursor]);
try {
  // v1 as deployed: the archived migrations in order (auth.identities is used by its owner bootstrap).
  await db.exec('create table auth.identities(user_id uuid, provider text, identity_data jsonb)');
  for (const name of (await readdir(archive)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, archive), 'utf8'));
  }
  for (const [id, n] of [[alice, 1], [owner, 2], [gone, 3]]) await h.addUser(id, { email: `user${n}@example.test` });
  await db.query("update public.ai_access_grants set monthly_limit=null where user_id=$1", [owner]);
  await db.query("update public.ai_access_grants set monthly_limit=40 where user_id=$1", [alice]);
  const records = [
    row('profile', { name: 'Alice', targetScore: 750, examDate: '2026-12-06', selectedSkill: 'LR', dailyMinGoalMinutes: 45, streakFreezes: 2, goalChosen: true, socCoat: 'kem' }),
    row('sessions', { id: 's1', skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Mini', date: '2026-11-09', durationMinutes: 20, createdAt: stamp,
      practiceParts: [{ part: 5, correct: 10, total: 15 }] }),
    row('mistakes', { id: 'm1', sessionId: 's1', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: 'Q "quoted" \\ back\nline',
      userMistake: '(A)', correctAnswer: '(B)', tags: ['x'], createdAt: stamp, question: 'Câu hỏi có dấu' }),
    row('vocabLog', { id: 'v1', date: '2026-11-09', count: 12 }),
    row('vocabLog', { id: 'v-deleted', date: '2026-11-09', count: 1 }, stamp, stamp),
    row('pacingRuns', { id: 'p1', presetId: 'P5', presetName: 'Part 5', date: '2026-11-09', plannedMinutes: 10, actualMinutes: 9, finishedNaturally: true,
      createdAt: stamp, phases: [{ name: 'Part 5', plannedMinutes: 10, actualMinutes: 9, overrunMinutes: -1 }] }),
    row('shieldDays', { id: 'shield:2026-11-08', date: '2026-11-08' }),
    row('checklist', { id: 'exam_slip', checked: true }),
    row('weeklyPlans', { id: '2026-11-09', weekKey: '2026-11-09', tasks: [] }),
  ];
  const before = await v1sync(alice, records);
  await v1sync(gone, [row('vocabLog', { id: 'g1', date: '2026-11-09', count: 2 })]);
  await db.query('select public.reset_learning_data($1::uuid)', [owner]);
  const ownerBefore = await v1sync(owner, []);
  const deviceCursor = before.cursor;

  // (b) export: read-only and repeatable.
  const exportJson = async () => (await db.exec(await rebuild('export_v1.sql'))).at(-1).rows[0].toeic_export_v1;
  const doc = await exportJson();
  assert.equal(typeof doc, 'string');
  assert.ok(!doc.includes('\n'), 'One line of JSON (load_export.psql reads it as one row)');
  const parsed = JSON.parse(doc);
  assert.equal(parsed.format, 'toeic-progress-v1-export');
  assert.ok(parsed.maxServerVersion >= deviceCursor);
  assert.equal(parsed.records.find(r => r.user_id === alice).records.some(r => r.entity_type === 'checklist'), false);
  assert.ok(parsed.tables.user_profiles.length >= 2);
  assert.equal(JSON.parse(await exportJson()).records.length, parsed.records.length);

  // (c) drop: refused without confirmation; then removes app objects only.
  await assert.rejects(db.exec(await rebuild('drop_v1.sql')), /Not confirmed/);
  const drop = async () => db.exec("set toeic.rebuild_confirm = 'drop-v1';\n" + await rebuild('drop_v1.sql'));
  await drop();
  assert.equal(await value("select count(*)::int from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','S')"), 0);
  assert.equal(await value("select count(*)::int from pg_proc where pronamespace='public'::regnamespace"), 0);
  assert.equal(await value("select count(*)::int from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal"), 0);
  assert.equal(await value('select count(*)::int from auth.users'), 3, 'auth.users untouched');
  await drop();

  // (d) baseline, then drop_v1 again must be a no-op on v2.
  await db.query('delete from auth.users where id=$1', [gone]);
  await db.exec(await baselineSql());
  await drop();
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });

  // (e) restore, twice.
  const restore = async () => {
    await db.exec('create temp table if not exists rebuild_import(doc text); truncate rebuild_import;');
    await db.query('insert into rebuild_import values($1)', [doc]);
    await db.exec(await rebuild('restore_v2.sql'));
  };
  await restore();
  const after = await h.sync(alice, [], 0);
  assert.deepEqual(comparable(after), comparable(before), 'Every learning record and tombstone comes back unchanged');
  assert.equal(after.records.find(r => r.record_id === 'v-deleted').deleted_at !== null, true);
  const fromOldCursor = await h.sync(alice, [], deviceCursor);
  assert.equal(comparable(fromOldCursor).length, comparable(before).length, 'A v1 device cursor still receives every restored row');
  assert.notEqual(after.epoch, undefined, 'New database generation is announced');
  const ownerAfter = await h.sync(owner, [], ownerBefore.cursor);
  assert.equal(ownerAfter.resetBarrier, undefined, 'A device that saw the v1 reset is not blocked');
  assert.equal((await h.sync(owner, [], 1)).resetBarrier, true, 'A device that missed it still is');
  assert.equal(await value('select count(*)::int from public.vocabulary_logs where user_id=$1', [gone]), 0, 'Deleted accounts are skipped');
  assert.deepEqual((await value('select public.get_ai_access($1::uuid)', [owner])).unlimited, true, 'Unlimited v1 grant -> admin plan');
  assert.equal((await value('select public.get_ai_access($1::uuid)', [alice])).monthlyLimit, 40, 'Custom v1 cap -> user_plans');
  assert.equal(await value("select email from public.ai_access_grants where user_id=$1", [alice]), 'user1@example.test');

  const cursor = after.cursor;
  await restore();
  assert.equal((await h.sync(alice, [], 0)).cursor, cursor, 'Restoring again changes nothing');
  assert.equal(await value('select count(*)::int from public.user_plans'), 2);
  console.log('Rebuild: v1 export, guarded drop, baseline, restore and cursor continuity passed (each step re-run).');
} finally {
  await db.close();
}
