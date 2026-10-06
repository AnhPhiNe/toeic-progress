// Runs only read operations against a staging API; never calls Gemini or resets data.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const { SUPABASE_TEST_PROJECT, SUPABASE_STAGING_API_URL, SUPABASE_STAGING_USER_TOKEN } = process.env;
if (SUPABASE_TEST_PROJECT !== 'staging' || !SUPABASE_STAGING_API_URL || !SUPABASE_STAGING_USER_TOKEN) {
  console.error('Set staging-only API URL/user token and SUPABASE_TEST_PROJECT=staging.');
  process.exit(2);
}
const base = new URL(SUPABASE_STAGING_API_URL);
assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname)));
assert.ok(!base.username && !base.password && !base.search && !base.hash);
const url = path => new URL(path, base).href;
const ready = await fetch(url('/ready'), { signal: AbortSignal.timeout(90_000) });
assert.equal(ready.status, 200, 'Staging readiness failed');
const first = await fetch(url('/api/v1/sync'), {
  method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_STAGING_USER_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ records: [], cursor: 0 }), signal: AbortSignal.timeout(90_000)
});
assert.equal(first.status, 200, 'Staging account authentication/sync failed');
const { cursor } = await first.json();
assert.ok(Number.isSafeInteger(cursor));
const times = [];
const statuses = {};
// Modest smoke load: 10 read-only requests, maximum two in flight.
for (let batch=0; batch<5; batch++) {
  await Promise.all([0,1].map(async () => {
    const start = performance.now();
    const response = await fetch(url('/api/v1/sync'), {
      method: 'POST', headers: { Authorization: `Bearer ${SUPABASE_STAGING_USER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [], cursor }), signal: AbortSignal.timeout(30_000)
    });
    times.push(performance.now()-start);
    statuses[response.status]=(statuses[response.status]||0)+1;
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.ok(response.headers.get('x-request-id'));
    await response.arrayBuffer();
  }));
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({ requests:times.length,concurrency:2,statuses,p50_ms:Math.round(times[4]),p95_ms:Math.round(times[9]) }));
assert.ok(Object.keys(statuses).every(status=>status==='200'), 'Staging smoke returned errors; inspect request logs.');
