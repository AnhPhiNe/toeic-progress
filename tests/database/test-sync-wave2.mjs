// Security wave 2 on sync: bounded extra, paged replies, tombstone no-ops,
// reset frees deletion markers, the record limit ignores markers, tombstone
// floors and the immutable first-sync time.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MIGRATIONS_DIR, createDatabase, profile, record, uid } from './harness.mjs';

const h = await createDatabase();
const { db, value, sync } = h;
const alice = uid(1), bob = uid(2), carol = uid(3);
const vocab = (id, extra = {}, updated = '2026-11-20T00:00:00Z') => record('vocabLog', id, { date: '2026-11-19', count: 3, ...extra }, updated);
const gone = (type, id, at = '2026-11-21T00:00:00Z') => record(type, id, {}, at, at);
const page = (user, after) => value('select public.sync_page($1::uuid,$2::bigint)', [user, after]);
const setting = (key, val) => db.query('insert into private.settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value', [key, String(val)]);
async function follow(user, first) {
  const rows = [...first.records];
  let reply = first;
  while (reply.hasMore) {
    reply = await page(user, reply.cursor);
    rows.push(...reply.records);
  }
  return { rows, cursor: reply.cursor };
}

try {
  for (const id of [alice, bob, carol]) await h.addUser(id);

  // S-08: deleting a record the server never had leaves no tombstone, but the device gets an echo to stop re-sending.
  const ghost = await sync(alice, [profile(), gone('mistakes', 'never-there')]);
  assert.equal(await value('select count(*)::int from public.sync_tombstones where user_id=$1', [alice]), 0);
  const echo = ghost.records.find(r => r.record_id === 'never-there');
  assert.ok(echo && echo.deleted_at, 'The no-op deletion is acknowledged');
  const flood = Array.from({ length: 1000 }, (_, n) => gone('vocabLog', 'fake-' + n));
  await sync(alice, flood, ghost.cursor);
  assert.equal(await value('select count(*)::int from public.sync_tombstones where user_id=$1', [alice]), 0, '1000 fake markers store nothing');
  await assert.rejects(sync(alice, [...flood, gone('vocabLog', 'one-more')]), /Invalid sync request/, 'At most 1000 records per request');

  // A real deletion still leaves its marker.
  const live = await sync(alice, [vocab('v1')], ghost.cursor);
  await sync(alice, [gone('vocabLog', 'v1')], live.cursor);
  assert.equal(await value("select count(*)::int from public.sync_tombstones where user_id=$1 and record_id='v1'", [alice]), 1);

  // The record limit counts live records only; markers above 10,000 are trimmed and raise the floor.
  await db.query(`insert into public.sync_tombstones(user_id,entity_type,record_id,updated_at,deleted_at)
    select $1,'mistakes','old-'||n,now(),now() from generate_series(1,10000) n`, [alice]);
  const beforeTrim = await sync(alice, [vocab('v2')]);
  assert.equal(beforeTrim.records.some(r => r.record_id === 'v2' && !r.deleted_at), true, 'Markers never brick new records');
  assert.equal(await value('select count(*)::int from public.sync_tombstones where user_id=$1', [alice]), 10000, 'Oldest markers trimmed to 10,000');
  assert.ok(Number(await value('select server_version from private.sync_floors where user_id=$1', [alice])) > 0);
  // A device behind the floor keeps its writes and gets the full canonical set.
  const behind = await sync(alice, [vocab('v3')], live.cursor);
  assert.equal(behind.fullSnapshot, true);
  const all = await follow(alice, behind);
  assert.ok(all.rows.some(r => r.record_id === 'v3' && !r.deleted_at), 'Writes from a device behind the floor are kept');
  assert.ok(all.rows.some(r => r.entity_type === 'profile'));
  const caughtUp = await sync(alice, [], all.cursor);
  assert.equal(caughtUp.fullSnapshot, undefined, 'After the full snapshot the device syncs deltas again');

  // Reset frees every marker; a stale device still meets the barrier.
  await db.query('select public.reset_learning_data($1::uuid)', [alice]);
  assert.equal(await value('select count(*)::int from public.sync_tombstones where user_id=$1', [alice]), 0);
  const stale = await sync(alice, [vocab('v9', {}, '2026-11-23T00:00:00Z')], live.cursor);
  assert.equal(stale.resetBarrier, true);
  assert.equal(stale.records.length, 1, 'Only the reset profile');
  assert.equal(stale.hasMore, false);
  assert.equal(await value("select count(*)::int from public.vocabulary_logs where id='v9'"), 0);

  // Live record limit: 10,000 live rows refuse one more.
  await db.query(`insert into public.vocabulary_logs(user_id,id,study_date,word_count,updated_at)
    select $1,'bulk-'||n,'2026-11-19',1,now() from generate_series(1,9999) n`, [carol]);
  await sync(carol, [profile()]);
  await assert.rejects(sync(carol, [vocab('over')]), /Account record limit reached/);
  await db.query('delete from public.vocabulary_logs where user_id=$1', [carol]);

  // S-07: extra is bounded in size and depth on every table, also outside sync.
  await assert.rejects(sync(bob, [vocab('big', { junk: 'x'.repeat(5000) })]), /extra_bounded/);
  let deep = 'leaf';
  for (let n = 0; n < 9; n++) deep = { n: deep };
  await assert.rejects(sync(bob, [vocab('deep', { deep })]), /extra_bounded/);
  await assert.rejects(db.query(`insert into public.user_profiles(user_id,name,selected_skill,extra,updated_at)
    values($1,'Bob','LR',jsonb_build_object('junk',repeat('x',50000)),now())`, [bob]), /extra_bounded/);
  await assert.rejects(sync(bob, [record('pacingRuns', 'p1', { presetId: 'x'.repeat(101), presetName: 'P', date: '2026-11-19', plannedMinutes: 1,
    actualMinutes: 1, finishedNaturally: true, createdAt: '2026-11-19T00:00:00Z', phases: [] })]), /pacing_runs_preset_bounded/);
  assert.equal(await value('select private.jsonb_depth($1::jsonb)', [JSON.stringify({ a: [1, { b: 2 }] })]), 4);

  // S-07: replies are paged by rows and by bytes; following pages returns everything once.
  await setting('sync_page_rows', 3);
  const seven = [profile(), ...Array.from({ length: 6 }, (_, n) => vocab('p' + n))];
  const firstWrite = await sync(bob, seven);
  assert.equal(firstWrite.hasMore, true);
  assert.equal(new Set(firstWrite.records.map(r => r.record_id)).size, 7, 'Submitted records outside the page are echoed');
  const fresh = await sync(bob, []);
  assert.deepEqual([fresh.records.length, fresh.hasMore], [3, true]);
  const pages = await follow(bob, fresh);
  assert.deepEqual(pages.rows.map(r => r.record_id).sort(), seven.map(r => r.record_id).sort());
  const quiet = await sync(bob, [], pages.cursor);
  assert.deepEqual([quiet.records.length, quiet.hasMore, quiet.cursor], [0, false, pages.cursor], 'The last page cursor is the latest');
  await setting('sync_page_rows', 1000);
  await setting('sync_page_bytes', 1);
  const tiny = await sync(bob, []);
  assert.deepEqual([tiny.records.length, tiny.hasMore], [1, true], 'One oversized row per page, never zero');
  assert.equal((await follow(bob, tiny)).rows.length, 7);
  await db.query("delete from private.settings where key in ('sync_page_rows','sync_page_bytes')");
  const whole = await sync(bob, [], Number.MAX_SAFE_INTEGER);
  assert.deepEqual([whole.records.length, whole.hasMore], [7, false], 'Another generation cursor still gets everything');
  assert.equal(typeof whole.resetVersion, 'number');
  await assert.rejects(page(bob, -1), /Invalid sync request/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select public.sync_page($1::uuid,0)', [bob]), { sub: bob }), /permission denied/);

  // S-09: first_synced_at is set by the server once and never changes.
  await db.query("select set_config('toeic.now','2026-11-18T03:00:00Z',false)");
  await sync(bob, [record('sessions', 's1', { skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Mini', date: '2026-11-18',
    durationMinutes: 20, createdAt: '2026-11-18T02:00:00Z' })]);
  await db.query("select set_config('toeic.now','2026-12-20T03:00:00Z',false)");
  await sync(bob, [record('sessions', 's1', { skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Mini', date: '2026-12-20',
    durationMinutes: 20, createdAt: '2026-12-20T02:00:00Z' }, '2026-11-21T00:00:00Z')]);
  await db.query("update public.study_sessions set first_synced_at=now() where id='s1'");
  assert.equal(new Date(await value("select first_synced_at from public.study_sessions where id='s1'")).toISOString(), '2026-11-18T03:00:00.000Z');
  await db.query("select set_config('toeic.now','',false)");

  // S-07 + Card-v2: mistakes up to 64 KiB sync cleanly through both sync_account_records and public.mistakes.extra_bounded.
  const bigContext = 'A'.repeat(52000);
  const bigRes = await sync(bob, [record('mistakes', 'm-big', {
    part: 7, category: 'CARELESS_DISTRACTION', status: 'NEEDS_REVIEW', question: 'Q?', questionContext: 'Q?', context: bigContext,
    userMistake: '(A) x', correctAnswer: '(B) y', nextReviewDate: '2026-11-25', reviewStage: 0,
    createdAt: '2026-11-20T00:00:00Z'
  })]);
  assert.ok(bigRes.records.some(r => r.entity_type === 'mistakes' && r.record_id === 'm-big'), '52 KiB Card-v2 mistake must sync without hitting 48 KiB extra_bounded');

  // The migration is idempotent and keeps data.
  const rows = await value('select count(*)::int from public.vocabulary_logs');
  await db.exec(await readFile(new URL('20261125000000_security_wave2.sql', MIGRATIONS_DIR), 'utf8'));
  assert.equal(await value('select count(*)::int from public.vocabulary_logs'), rows);
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });
  assert.equal(await value("select count(*)::int from pg_trigger where tgname='keep_first_synced'"), 4);
  console.log('Sync wave 2: tombstone no-ops, record limit, trim floor, reset, bounded extra, paging and first_synced_at passed.');
} finally {
  await db.close();
}
