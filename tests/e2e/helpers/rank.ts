import type { Page } from '@playwright/test';
import { emptyBundle, type DataBundle } from '../../../frontend/src/shared/data/dataBundle';

/** Mocked Xếp hạng backend shared by league.spec.ts and profile.spec.ts. */
export type State = Record<string, unknown>;

const week = { start: '2026-11-16', endsAt: '2026-11-23T00:00:00+07:00', daysLeft: 3 };
const starTable = { full_test: 20, part_practice: 8, bake: 6, vocab_day: 5, card_reviewed: 2, card_added: 1 };
const names = ['Mây Bay', 'Tí Hon', 'Kem Dâu', 'Bắp Rang', 'Trà Sữa', 'Mèo Mun', 'Gấu Bông', 'Hạt Tiêu', 'Su Su', 'Bánh Bao',
  'Cà Rốt', 'Na Na', 'Tôm Tít', 'Bơ Xanh', 'Mít Ướt', 'Hồng Trà', 'Kẹo Gừng', 'Lá Me', 'Bông Gòn', 'Ổi Chua'];
const ME = 7; // Hạt Tiêu, rank 8
const stars = [236, 230, 220, 212, 203, 198, 190, 184, 175, 167, 161, 150, 140, 133, 120, 101, 90, 70, 41, 12];
const board = (values: Array<number | null>) => names.map((nickname, i) => ({ nickname, i, value: values[i] }))
  .sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map((r, k) => ({ rank: k + 1, nickname: r.nickname, coat: 'nau', value: r.value, me: r.i === ME,
    award: r.i === 0 ? { tier: 'vang', season: 1 } : null }));
const describe = (level: number) => {
  const tiers = ['dong', 'bac', 'vang', 'bach-kim', 'kim-cuong', 'cao-thu'], names6 = ['Đồng', 'Bạc', 'Vàng', 'Bạch kim', 'Kim cương', 'Cao thủ'];
  const t = level >= 20 ? 5 : Math.floor(level / 4), division = t === 5 ? null : ['IV', 'III', 'II', 'I'][level % 4];
  return { level, tier: tiers[t], tierName: names6[t], division, name: names6[t] + (division ? ' ' + division : '') };
};
const rules = { pointsPerDivision: 100, starsPerPoint: 10, maxStarPoints: 25, topBonus: 20, bottomPenalty: 20, zeroPenalty: 20, demoteLandsAt: 75, seasonWeeks: 8 };
const season = { number: 1, start: '2026-11-23', end: '2027-01-17', daysLeft: 23 };
export const notJoined: State = { week, dailyCap: 60, starTable, member: null, mode: 'none', me: null, group: null, lastWeek: null,
  season, rules, rank: null, boards: null, zones: null, preview: null, rankWeek: null, rewards: [] };
export const joined: State = {
  ...notJoined, mode: 'table',
  member: { nickname: 'Hạt Tiêu', coat: 'nau', tier: 'vang' },
  me: { stars: 184, today: 24, rank: 8, lastWeekStars: 150 },
  group: { tier: 'vang', size: 20, promote: 5, demote: 5, rows: [] },
  rank: { ...describe(10), points: 64, toNext: 36, next: describe(11), best: describe(10), shield: true, shieldUsedWeek: null },
  boards: {
    stars: board(stars),
    listening: board(names.map((_, i) => (i === 19 ? null : 97 - i * 3))),
    reading: board(names.map((_, i) => 60 - i)),
    minutes: board(names.map((_, i) => 400 - i * 13)),
    streak: board(names.map((_, i) => 30 - i)),
    reviews: board(names.map((_, i) => 80 - i * 2))
  },
  zones: { up: 6, down: 5, size: 20 },
  preview: { stars: 184, base: 18, bonus: 0, penalty: 0, delta: 18 },
  rewards: [{ season: 0, best: describe(9), cosmetics: ['frame-bac.m1', 'frame-vang.m1', 'name-tag.m1'], aiBonus: 10, aiMonth: '2026-12-01' }]
};

/**
 * Signed-in learner with the transport mocked: supabaseClient and api.ts are swapped for tiny test modules,
 * sync answers with the stored profile, and /api/v1/rank* answer from `league.state`.
 */
export async function signIn(page: Page, initial: State, patch: Partial<DataBundle> = {}) {
  const league = { state: initial, joins: [] as Array<{ nickname: string }> };
  const bundle = emptyBundle();
  bundle.profile = { ...bundle.profile, name: 'Alice', targetScore: 800, goalChosen: true };
  Object.assign(bundle, patch, { profile: { ...bundle.profile, ...(patch.profile ?? {}) } });
  await page.addInitScript(data => {
    localStorage.setItem('toeic_active_account_v1', 'alice');
    localStorage.setItem('toeic_progress_account_alice_v3', JSON.stringify(data));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  }, bundle);
  await page.route('**/src/shared/api/supabaseClient.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      const session = { access_token: 'test-only', user: { id: 'alice', email: 'alice@example.test', is_anonymous: false } };
      export const cloud = { auth: {
        getSession: async () => ({ data: { session }, error: null }),
        getUser: async () => ({ data: { user: session.user }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      }};`
  }));
  await page.route('**/src/shared/api/api.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export const apiAvailable = true;
      export class ApiRequestError extends Error {}
      export async function backendRequest(path, method = 'GET', body) {
        const response = await fetch('/__test/api' + path, { method, headers: { 'Content-Type': 'application/json' },
          body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);
        return result;
      }`
  }));
  await page.route('**/__test/api/api/v1/sync', route => route.fulfill({ json: {
    cursor: 1, hasRecords: true,
    records: [{ entity_type: 'profile', record_id: 'profile', payload: bundle.profile, updated_at: bundle.profile.updatedAt, deleted_at: null }]
  } }));
  await page.route('**/__test/api/api/v1/rank**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/rank/join')) {
      const body = route.request().postDataJSON();
      league.joins.push(body);
      league.state = { ...joined, member: { nickname: body.nickname, coat: 'nau', tier: 'vang' } };
    }
    await route.fulfill({ json: league.state });
  });
  return league;
}


