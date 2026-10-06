import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const guest = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-10-05T00:00:00.000Z';
const deleted = '2026-10-06T00:00:00.000Z';
const record = (entity_type, payload, updated_at = stamp, deleted_at = null) => ({ entity_type,
  record_id: entity_type==='profile' ? 'profile' : payload.id, payload, updated_at, deleted_at });
const profile = record('profile', { name:'Private learner', targetScore:750, selectedSkill:'LR', dailyMinGoalMinutes:30,
  streakFreezes:2, examDate:'2027-01-01', motto:'Private motto', sensitiveExtra:'old private field' });
const session = record('sessions', { id:'s1', skillType:'LR', sessionType:'PART_PRACTICE', testName:'Private test name',
  date:'2026-10-05', durationMinutes:15, createdAt:stamp, notes:'Sensitive study notes', practiceParts:[{part:5,correct:10,total:15}] });
const mistake = record('mistakes', { id:'m1', sessionId:'s1', part:5, category:'OTHER', status:'NEEDS_REVIEW',
  questionContext:'Private question context', userMistake:'Private response', correctAnswer:'B', tags:['private'], createdAt:stamp });
const plan = record('weeklyPlans', { id:'2026-10-05', weekKey:'2026-10-05', tasks:[{id:'t1',title:'Private task title',type:'CUSTOM',target:1,unit:'lần',createdAt:stamp}] });
const pacing = record('pacingRuns', { id:'p1', presetId:'TEST', presetName:'Private pace', date:'2026-10-05',plannedMinutes:10,actualMinutes:10,
  finishedNaturally:true,createdAt:stamp,phases:[{name:'Phase',plannedMinutes:10,actualMinutes:10,overrunMinutes:0}] });
const fixtures = [profile,session,mistake,plan,pacing,record('vocabLog',{id:'vocab:2026-10-05',date:'2026-10-05',count:13}),
  record('shieldDays',{id:'shield:2026-10-05',date:'2026-10-05'})];
const sync = async (owner, records=[], cursor=0, replace=false) => (await db.query(
  'select public.sync_account_records($1::uuid,$2::jsonb,$3::bigint,$4::boolean) as value',[owner,JSON.stringify(records),cursor,replace])).rows[0].value;
const reset = async owner => (await db.query('select public.reset_learning_data($1::uuid) as value',[owner])).rows[0].value;
const count = async (table,owner=alice) => (await db.query(`select count(*)::int as total from public.${table} where user_id=$1`,[owner])).rows[0].total;

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const file of ['20260923000000_sync_records.sql','20261005000000_fastapi_backend.sql']) await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1,false),($2,false),($3,true)',[alice,bob,guest]);
  const first = await sync(alice,fixtures);
  await sync(alice,[record('vocabLog',{id:'old-deleted',date:'2026-10-04',count:99,secret:'retired note'},deleted,deleted)],first.cursor);
  await sync(bob,[profile,record('vocabLog',{id:'bob-vocab',date:'2026-10-05',count:8})]);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006000000_domain_tables.sql',import.meta.url),'utf8'));
  const beforeMigration = await sync(alice);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006010000_purge_deleted_content.sql',import.meta.url),'utf8'));
  const afterMigration = await sync(alice);
  assert.equal(afterMigration.cursor,beforeMigration.cursor,'Scrubbing old deletions must preserve sync versions');
  assert.deepEqual(afterMigration.records.find(item=>item.record_id==='old-deleted').payload,{id:'old-deleted'});
  assert.equal((await db.query("select count(*)::int as total from public.vocabulary_logs where id='old-deleted'")).rows[0].total,0);
  assert.equal((await db.query("select count(*)::int as total from public.sync_records_legacy where record_id='old-deleted'")).rows[0].total,0);
  assert.equal(await count('study_sessions'),1,'Migration must retain active learning data');

  // A single delete removes parent content and children, but preserves an active linked mistake.
  const single = await sync(alice,[record('sessions',{id:'s1'},deleted,deleted)],afterMigration.cursor);
  assert.equal(await count('study_sessions'),0);
  assert.equal(await count('study_session_parts'),0);
  assert.equal(await count('mistakes'),1);
  assert.equal((await db.query("select linked_session_id from public.mistakes where id='m1'")).rows[0].linked_session_id,null);
  assert.deepEqual(single.records.find(item=>item.record_id==='s1').payload,{id:'s1'});
  const stale = await sync(alice,[session],single.cursor);
  assert.ok(stale.records.find(item=>item.record_id==='s1').deleted_at,'Old device must not revive a deleted session');
  assert.equal(await count('study_sessions'),0);

  // A failure while rebuilding defaults must roll back every preceding purge.
  const beforeFailure = await count('mistakes');
  const legacyBeforeFailure = await count('sync_records_legacy');
  await db.exec(`create function private.test_reset_failure() returns trigger language plpgsql as $$
    begin if new.id='id_original' then raise exception 'Simulated reset failure'; end if; return new; end; $$;
    create trigger test_fail_reset before insert on public.exam_checklist for each row execute function private.test_reset_failure();`);
  await assert.rejects(reset(alice),/Simulated reset failure/);
  assert.equal(await count('mistakes'),beforeFailure);
  assert.equal(await count('sync_records_legacy'),legacyBeforeFailure);
  assert.equal(await count('learning_data_resets'),0);
  await db.exec('drop trigger test_fail_reset on public.exam_checklist; drop function private.test_reset_failure();');

  // Reset erases all owner content, old migration copies and every child table.
  const cleared = await reset(alice);
  assert.equal(cleared.resetBarrier,true);
  for (const table of ['study_sessions','study_session_parts','mistakes','vocabulary_logs','weekly_plans','weekly_plan_tasks','pacing_runs','pacing_run_phases','streak_shields','sync_records_legacy']) {
    assert.equal(await count(table),0,`${table} retained erased learning content`);
  }
  const freshProfile = cleared.records.find(item=>item.entity_type==='profile').payload;
  assert.equal(freshProfile.name,'Học viên');
  assert.equal(freshProfile.targetScore,990);
  assert.ok(!('sensitiveExtra' in freshProfile));
  assert.equal(await count('exam_checklist'),8);
  for (const item of cleared.records.filter(item=>item.deleted_at)) assert.deepEqual(item.payload,{id:item.record_id});
  assert.equal(await count('vocabulary_logs',bob),1,'Reset changed another user');
  assert.ok(await count('sync_tombstones')>=6);
  const fields = (await db.query("select column_name from information_schema.columns where table_name='sync_tombstones' order by ordinal_position")).rows.map(row=>row.column_name);
  assert.deepEqual(fields,['user_id','entity_type','record_id','updated_at','deleted_at','server_version']);

  // Pre-reset cursor invalidates even a newer edit and a record never seen by the server.
  const newer = new Date(Date.now()+120000).toISOString();
  const unseen = record('vocabLog',{id:'unseen-on-another-device',date:'2026-10-06',count:100},newer);
  const rejected = await sync(alice,[record('sessions',session.payload,newer),unseen],beforeMigration.cursor);
  assert.equal(rejected.resetBarrier,true);
  assert.equal(await count('study_sessions'),0);
  assert.equal(await count('vocabulary_logs'),0);
  assert.equal(rejected.records.length,cleared.records.length,'Barrier must return the complete authoritative snapshot');
  const postReset = record('vocabLog',{id:'new-after-reset',date:'2026-10-06',count:3},newer);
  const resumed = await sync(alice,[postReset],cleared.cursor);
  assert.equal(await count('vocabulary_logs'),1,'New writes after observing reset must work');
  assert.equal(resumed.records.find(item=>item.record_id==='new-after-reset').payload.count,3);

  // Manual restore remains explicit via replacement and fresh server timestamps.
  const restored = await sync(alice,fixtures,0,true);
  assert.equal(await count('study_sessions'),1);
  assert.equal(await count('study_session_parts'),1);
  assert.equal(await count('weekly_plan_tasks'),1);
  assert.equal((await db.query("select count(*)::int as total from public.sync_tombstones where entity_type='sessions' and record_id='s1'")).rows[0].total,0);
  assert.ok(restored.records.find(item=>item.record_id==='s1').deleted_at===null);

  // Operator deletes get compacted; direct calls by browser roles remain forbidden.
  await db.query("delete from public.weekly_plans where user_id=$1 and id='2026-10-05'",[alice]);
  assert.equal(await count('weekly_plans'),0);
  assert.equal(await count('weekly_plan_tasks'),0);
  assert.ok((await sync(alice)).records.find(item=>item.entity_type==='weeklyPlans').deleted_at);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.reset_learning_data(uuid)','execute') as allowed")).rows[0].allowed,false);
  await assert.rejects(reset(guest),/Permanent account/);
  await db.query('delete from auth.users where id=$1',[alice]);
  assert.equal(await count('sync_tombstones'),0);
  assert.equal(await count('learning_data_resets'),0);
  console.log('Content purge, legacy cleanup, reset atomicity, stale-device barrier, fresh edits, explicit restore and child deletion passed.');
} catch(error) {
  console.error('Content purge check failed:',error.message,error.where||'',error.code||'');
  process.exitCode=1;
} finally {
  await db.close();
}
