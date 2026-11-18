import { test, expect, type Page } from '@playwright/test';
import { emptyBundle } from '../../frontend/src/shared/data/dataBundle';

type State = Record<string, unknown>;

const week = { start: '2026-11-16', endsAt: '2026-11-23T00:00:00+07:00', daysLeft: 3 };
const starTable = { full_test: 20, part_practice: 8, bake: 6, vocab_day: 5, card_reviewed: 2, card_added: 1 };
const names = ['Mây Bay', 'Tí Hon', 'Kem Dâu', 'Sóc Nâu', 'Bắp Rang', 'Hạt Dẻ', 'Trà Sữa', 'Mèo Mun', 'Gấu Bông', 'Su Su',
  'Cam Cam', 'Na Na', 'Tôm Tít', 'Bơ Xanh', 'Mít Ướt', 'Hồng Trà', 'Kẹo Gừng', 'Lá Me', 'Bông Gòn', 'Ổi Chua'];
const rows = names.map((nickname, i) => ({ rank: i + 1, nickname, coat: 'nau-cam', stars: 212 - i * 11, me: i === 3 }));
const notJoined: State = { week, dailyCap: 60, starTable, member: null, mode: 'none', me: null, group: null, lastWeek: null };
const tableState: State = {
  week, dailyCap: 60, starTable, mode: 'table',
  member: { nickname: 'Sóc Nâu', coat: 'nau-cam', tier: 'bac' },
  me: { stars: 179, today: 24, rank: 4, lastWeekStars: 113 },
  group: { tier: 'bac', size: 20, promote: 5, demote: 5, rows },
  lastWeek: { rank: 3, outcome: 'up', stars: 228, tier: 'dong' }
};
const fallbackState: State = {
  ...tableState, mode: 'fallback', lastWeek: null,
  me: { stars: 34, today: 12, rank: 1, lastWeekStars: 20 },
  group: { tier: 'dong', size: 3, promote: 0, demote: 0, rows: rows.slice(0, 3).map((row, i) => ({ ...row, me: i === 0 })) },
  member: { nickname: 'Sóc Nâu', coat: 'nau-cam', tier: 'dong' }
};

/**
 * Signed-in learner with the transport mocked: supabaseClient and api.ts are swapped for tiny test modules,
 * sync answers with the stored profile, and /api/v1/league* answer from `league.state`.
 */
async function signInWithLeague(page: Page, initial: State) {
  const league = { state: initial, joins: [] as Array<{ nickname: string }> };
  const bundle = emptyBundle();
  bundle.profile = { ...bundle.profile, name: 'Alice', targetScore: 800, goalChosen: true };
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
  await page.route('**/__test/api/api/v1/league**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/league/join')) {
      const body = route.request().postDataJSON();
      league.joins.push(body);
      league.state = { ...tableState, member: { nickname: body.nickname, coat: 'nau-cam', tier: 'dong' },
        group: { ...(tableState.group as object), tier: 'dong', rows: rows.map(row => row.me ? { ...row, nickname: body.nickname } : row) } };
    }
    await route.fulfill({ json: league.state });
  });
  return league;
}

test.describe('Giải đấu tuần', () => {
  test('a guest sees the opt-in card asking to sign in', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
    await page.goto('/giai-dau');
    await expect(page.getByRole('heading', { name: 'Tham gia giải đấu tuần?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập để tham gia' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Giải đấu/ })).not.toContainText('Tham gia');
  });

  test('joining with a nickname shows the group table with zones', async ({ page }) => {
    const league = await signInWithLeague(page, notJoined);
    await page.goto('/giai-dau');
    const name = page.getByPlaceholder('Ví dụ: Sóc Nâu');
    await name.fill('x');
    await page.getByRole('button', { name: 'Vào giải đấu' }).click();
    await expect(page.getByText('Biệt danh cần 2–20 ký tự.')).toBeVisible();
    expect(league.joins).toHaveLength(0);
    await name.fill('  Sóc   Nâu ');
    await page.getByRole('button', { name: 'Vào giải đấu' }).click();
    await expect(page.getByRole('heading', { name: 'Bạn đang hạng 4/20' })).toBeVisible();
    expect(league.joins).toEqual([{ nickname: 'Sóc Nâu', coat: 'nau' }]);
    const table = page.getByRole('list', { name: /Bảng xếp hạng giải Đồng/ });
    await expect(table.getByRole('listitem')).toHaveCount(20);
    await expect(page.getByText(/VÙNG LÊN GIẢI BẠC · TOP 5/)).toBeVisible();
    await expect(page.getByText(/VÙNG XUỐNG GIẢI/)).toHaveCount(0);
    await expect(table.locator('[aria-current="true"]')).toContainText('Sóc Nâu');
    await expect(page.getByText('Còn 12★ là vượt Kem Dâu')).toBeVisible();
  });

  test('a ranked Bạc group shows both zones and last week', async ({ page }) => {
    await signInWithLeague(page, tableState);
    await page.goto('/giai-dau');
    await expect(page.getByText(/VÙNG LÊN GIẢI VÀNG · TOP 5/)).toBeVisible();
    await expect(page.getByText(/VÙNG XUỐNG GIẢI ĐỒNG/)).toBeVisible();
    await expect(page.getByText(/Tuần trước bạn về hạng 3 và lên giải Bạc/)).toBeVisible();
  });

  test('few players: compare with last week instead of a table', async ({ page }) => {
    await signInWithLeague(page, fallbackState);
    await page.goto('/giai-dau');
    await expect(page.getByRole('heading', { name: 'Tuần này 34★' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Bạn so với tuần trước' })).toContainText('20★');
    await expect(page.getByText(/Nhóm của bạn mới có 3 người/)).toBeVisible();
    await expect(page.getByRole('list', { name: /Bảng xếp hạng/ })).toHaveCount(0);
  });

  test('desktop sidebar shows the live label and opens the page', async ({ page }) => {
    await signInWithLeague(page, tableState);
    await page.goto('/');
    const item = page.getByRole('button', { name: /^Giải đấu/ });
    await expect(item).toContainText('Hạng 4 · còn 3 ngày');
    await item.click();
    await expect(page).toHaveURL(/\/giai-dau$/);
    await expect(item).toHaveAttribute('aria-current', 'page');
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the 🛡 chip on Hôm nay and the avatar sheet row open the page', async ({ page }) => {
      await signInWithLeague(page, tableState);
      await page.goto('/');
      const chip = page.getByRole('button', { name: /^Giải đấu tuần · hạng 4/ });
      await expect(chip).toHaveText('Hạng 4');
      await chip.click();
      await expect(page.getByRole('heading', { name: 'Giải đấu tuần', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Quay lại' }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByRole('button', { name: /^Hồ sơ của bạn/ }).first().click();
      const row = page.getByRole('dialog').getByRole('button', { name: /^Giải đấu tuần/ });
      await expect(row).toContainText('Hạng 4 · còn 3 ngày');
      await row.click();
      await expect(page).toHaveURL(/\/giai-dau$/);
      await expect(page.getByRole('heading', { name: 'Bạn đang hạng 4/20' })).toBeVisible();
    });

    test('before joining the chip still opens the opt-in screen', async ({ page }) => {
      await signInWithLeague(page, notJoined);
      await page.goto('/');
      await page.getByRole('button', { name: 'Giải đấu tuần · tham gia' }).click();
      await expect(page.getByRole('heading', { name: 'Tham gia giải đấu tuần?' })).toBeVisible();
    });
  });
});
