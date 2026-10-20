import { test, expect } from '@playwright/test';
import { chooseNoteSource } from './helpers/noteSource';

for (const [status, message] of [
  ['pending', 'Tài khoản đang chờ được duyệt sử dụng AI. Bạn vẫn có thể nhập và lưu thủ công.'],
  ['blocked', 'Quyền sử dụng AI của tài khoản đang bị tạm khóa. Bạn vẫn có thể nhập và lưu thủ công.'],
  ['login_required', 'Đăng nhập Google để đăng ký dùng AI. Tài khoản cần được duyệt trước khi phân tích.'],
] as const) {
  test(`managed AI ${status} explains access, permits manual saving and rechecks approval`, async ({ page }, info) => {
    await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, freeformInput: true, managedAccess: true }; }
      export async function getAIUsage() {
        window.__accessReads = (window.__accessReads || 0) + 1;
        return window.__approved === true ? { remaining: 27, limit: 27, guest: false, enabled: true, accessStatus: 'active', accessMessage: '' }
          : { remaining: 0, limit: 10, guest: ${status === 'login_required'}, enabled: false, accessStatus: '${status}', accessMessage: ${JSON.stringify(message)} };
      }
      export async function extractMistakeWithAI() { throw new Error('AI must not be called by this test'); }
    ` }));
    await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
    const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
    await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
    await modal.getByLabel('Câu hỏi + phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
    await expect(modal.getByRole('status')).toContainText(message);
    await expect(modal.getByRole('button', { name: 'Phân tích với AI', exact: true })).toBeDisabled();
    for (const width of [375,1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.screenshot({ path: info.outputPath('ai-access-' + status + '.png') });
    await page.evaluate(() => { (window as Window & {__approved: boolean}).__approved = true; });
    await modal.getByRole('button', { name: 'Kiểm tra quyền AI', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Phân tích với AI', exact: true })).toBeEnabled();
    await expect(modal.getByText(message, { exact: true })).toHaveCount(0);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(modal.getByRole('button', { name: 'Phân tích với AI', exact: true })).toBeInViewport();
      await expect(modal.getByRole('button', { name: 'Lưu thủ công', exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (status === 'pending') await page.screenshot({ path: info.outputPath(`ai-approved-actions-${width}.png`) });
    }
    await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
    await expect(modal.getByRole('status')).toContainText('Đã lưu lỗi sai');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toHaveLength(1);
  });
}
