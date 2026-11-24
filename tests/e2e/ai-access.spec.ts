import { test, expect, type Page } from '@playwright/test';
import { PHONE_VIEWPORT, openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

for (const viewport of [{ width: 1280, height: 800 }, PHONE_VIEWPORT]) {
  const kind = viewport === PHONE_VIEWPORT ? 'phone' : 'desktop';
  for (const [status, message] of [
    ['pending', 'Tài khoản đang chờ được duyệt sử dụng AI. Bạn vẫn có thể nhập và lưu thủ công.'],
    ['blocked', 'Quyền sử dụng AI của tài khoản đang bị tạm khóa. Bạn vẫn có thể nhập và lưu thủ công.'],
  ] as const) {
    test(`managed AI ${status} (${kind}) explains access and permits manual saving`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockAccess(page, status, message);
      await gotoPage(page, '/so-tay');
      const modal = await openManualForm(page);
      await modal.getByLabel('Đề', { exact: true }).fill('ETS Access');
      await modal.getByLabel('Câu hỏi và các phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
      await expect(modal.getByRole('status').filter({ hasText: message })).toBeVisible();
      await expect(modal.getByRole('button', { name: 'Lưu vào Sổ tay', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await modal.getByRole('button', { name: 'Lưu vào Sổ tay', exact: true }).click();
      await expect(modal).toHaveCount(0);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toHaveLength(1);
    });
  }
}

test('a guest is invited to sign in with Google and can still save manually', async ({ page }) => {
  const message = 'Đăng nhập Google để Sóc giải thích. Bạn vẫn lưu được câu này.';
  await mockAccess(page, 'login_required', message);
  await gotoPage(page, '/so-tay');
  const modal = await openManualForm(page);
  await modal.getByLabel('Đề', { exact: true }).fill('ETS Guest');
  await modal.getByLabel('Câu hỏi và các phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await expect(modal.getByRole('status').filter({ hasText: message })).toBeVisible();
  await page.evaluate(() => window.addEventListener('toeic:ai-sign-in', () => { (window as Window & { __signIn?: number }).__signIn = 1; }));
  await modal.getByRole('button', { name: 'Đăng nhập Google', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { __signIn?: number }).__signIn)).toBe(1);
  await modal.getByRole('button', { name: 'Lưu vào Sổ tay', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toHaveLength(1);
});

async function mockAccess(page: Page, status: string, message: string) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, freeformInput: true, managedAccess: true }; }
    export async function getAIUsage() {
      return { remaining: 0, limit: 10, guest: ${status === 'login_required'}, enabled: false, accessStatus: '${status}', accessMessage: ${JSON.stringify(message)} };
    }
    export async function extractMistakeWithAI() { throw new Error('AI must not be called by this test'); }
  ` }));
}
