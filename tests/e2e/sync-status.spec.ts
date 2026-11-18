import { test, expect, type Page } from '@playwright/test';
import { emptyBundle } from '../../frontend/src/shared/data/dataBundle';
import { openSettings } from './helpers/accountGroup';

/**
 * Cold start of the free-tier backend: the account sync shows a calm "connecting" state, retries
 * quietly, and only warns after a long failure. Only the transport/auth boundary is replaced.
 * window.__backend controls the fake server: { mode: 'ok' | 'wake' | 'down', delay, failFirst }.
 */
async function setup(page: Page, backend: { mode: string; delay?: number; failFirst?: number }) {
  const bundle = emptyBundle();
  bundle.profile.name = 'Alice';
  await page.addInitScript(([data, state]) => {
    localStorage.setItem('toeic_active_account_v1', 'alice');
    localStorage.setItem('toeic_progress_account_alice_v3', JSON.stringify(data));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
    (window as unknown as { __backend: unknown }).__backend = { calls: 0, ...(state as object) };
  }, [bundle, backend] as const);
  await page.route('**/src/shared/api/supabaseClient.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      const session = { access_token: 'test-only', user: { id: 'alice', email: 'alice@example.test', is_anonymous: false } };
      export const cloud = { auth: {
        getSession: async () => ({ data: { session }, error: null }),
        getUser: async () => ({ data: { user: session.user }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      }};
    `
  }));
  await page.route('**/src/shared/api/api.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export const apiAvailable = true;
      export class ApiRequestError extends Error {}
      export class NetworkError extends Error { constructor(m) { super(m); this.name = 'NetworkError'; } }
      export async function backendRequest(path) {
        const b = window.__backend;
        b.calls++;
        if (b.delay) await new Promise(resolve => setTimeout(resolve, b.delay));
        if (b.mode === 'down' || (b.mode === 'wake' && b.calls <= (b.failFirst ?? 2))) {
          throw new NetworkError('Chưa kết nối được backend. Vui lòng thử lại sau; dữ liệu trên máy vẫn được giữ.');
        }
        const profile = JSON.parse(localStorage.getItem('toeic_progress_account_alice_v3')).profile;
        return { cursor: b.calls, hasRecords: true, records: [
          { entity_type: 'profile', record_id: 'profile', payload: profile, updated_at: profile.updatedAt, deleted_at: null }] };
      }
    `
  }));
}

const sidebarSync = (page: Page) => page.getByRole('button', { name: /^Tài khoản & cài đặt/ });
const banner = (page: Page) => page.getByRole('alert').filter({ hasText: /lưu trên máy này/ });

test('a waking server shows a calm connecting state, no warning, then syncs', async ({ page }) => {
  await setup(page, { mode: 'wake', failFirst: 2 });
  await page.goto('/');
  await expect(sidebarSync(page)).toContainText('Đang kết nối máy chủ…');
  await expect(page.getByText('lần đầu có thể mất khoảng 30 giây')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Chưa kết nối tài khoản nên thay đổi chưa được lưu')).toHaveCount(0);
  await expect(sidebarSync(page)).toContainText(/Đã đồng bộ · vừa xong/, { timeout: 30_000 });
  await expect(page.getByText('lần đầu có thể mất khoảng 30 giây')).toHaveCount(0);
});

test('a slow first request is labelled as syncing, never as failed', async ({ page }) => {
  await setup(page, { mode: 'ok', delay: 6_000 });
  await page.goto('/');
  await expect(sidebarSync(page)).toContainText('Đang kết nối…');
  await expect(sidebarSync(page)).toContainText('Đang kết nối máy chủ…', { timeout: 12_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(sidebarSync(page)).toContainText('Đã đồng bộ', { timeout: 15_000 });
});

test('Cài đặt header pill follows the sync state', async ({ page }) => {
  await setup(page, { mode: 'ok', delay: 1_500 });
  await page.goto('/');
  await expect(sidebarSync(page)).toContainText('Đã đồng bộ', { timeout: 15_000 });
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('status').filter({ hasText: 'Đã đồng bộ · vừa xong' })).toBeVisible();
});

test('only a long outage shows the reassuring banner with a retry button', async ({ page }) => {
  await page.clock.install();
  await setup(page, { mode: 'down' });
  await page.goto('/');
  await expect(sidebarSync(page)).toContainText('Đang kết nối máy chủ…');
  for (let i = 0; i < 6; i++) { await page.clock.runFor(10_000); await page.waitForTimeout(50); }
  await expect(banner(page)).toHaveCount(0);
  for (let i = 0; i < 4; i++) { await page.clock.runFor(10_000); await page.waitForTimeout(50); }
  const alert = banner(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Dữ liệu vẫn lưu trên máy này. Sẽ đồng bộ khi kết nối lại.');
  await expect(alert.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(sidebarSync(page)).toContainText('Đồng bộ lỗi');
  await page.evaluate(() => { (window as unknown as { __backend: { mode: string } }).__backend.mode = 'ok'; });
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await expect(sidebarSync(page)).toContainText('Đã đồng bộ');
  await expect(alert).toHaveCount(0);
});

test('saving while signed in confirms with a short toast', async ({ page }) => {
  await setup(page, { mode: 'ok' });
  await page.goto('/');
  await expect(sidebarSync(page)).toContainText('Đã đồng bộ', { timeout: 15_000 });
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await dialog.getByLabel('Tên của bạn', { exact: true }).fill('Alice 2');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đồng bộ' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu và đồng bộ' })).toHaveCount(0, { timeout: 6_000 });
});
