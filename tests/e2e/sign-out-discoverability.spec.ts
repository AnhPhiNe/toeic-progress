import { expect, test, type Page } from '@playwright/test';

async function settings(page: Page, width: number, guest = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/src/features/account/hooks/useCloudAccount.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export function useCloudAccount() { return { available: true, hasAccountSession: ${!guest}, status: '${guest ? 'guest' : 'synced'}',
        email: ${guest ? 'null' : JSON.stringify('qa@example.test')}, error: '', pendingTransfer: null,
        signOut: async () => { window.__logoutCalls = (window.__logoutCalls || 0) + 1; if (window.__logoutFails) throw new Error('QA logout failed'); },
        retry: async () => {}, signInGoogle: async () => {}, sendOtp: async () => false, verifyOtp: async () => {},
        deleteAccount: async () => {}, resetLearningData: async () => {}, chooseTransfer: async () => {} }; }
    `
  }));
  await page.goto('/so-tay');
  if (width < 768) await page.getByRole('button', { name: /^Tài khoản và cài đặt:/ }).click();
  else await page.getByRole('button', { name: /^Cài đặt hồ sơ/ }).click();
  return page.getByRole('dialog', { name: 'Cài đặt', exact: true });
}

for (const width of [375, 1280]) {
  test(`sign out is visible in the first settings layer at ${width}px`, async ({ page }, testInfo) => {
    const dialog = await settings(page, width);
    const button = dialog.getByRole('button', { name: 'Đăng xuất', exact: true });
    await expect(button).toHaveCount(1);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    const reset = dialog.getByRole('button', { name: 'Xóa toàn bộ dữ liệu', exact: true });
    expect(await reset.evaluate((element, label) => Boolean(element.compareDocumentPosition([...element.closest('[role="dialog"]')!.querySelectorAll('button')].find(button => button.textContent?.trim() === label)!) & Node.DOCUMENT_POSITION_FOLLOWING), 'Đăng xuất')).toBe(true);
    expect(await dialog.getByRole('dialog', { name: 'Tài khoản', exact: true }).count()).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`sign-out-${width}.png`), fullPage: true });
    await button.click();
    expect(await page.evaluate(() => (window as Window & { __logoutCalls: number }).__logoutCalls)).toBe(1);
  });
}

test('failed sign out remains visible with an error and guests do not see sign out', async ({ page }) => {
  const dialog = await settings(page, 375);
  await page.evaluate(() => { (window as Window & { __logoutFails?: boolean }).__logoutFails = true; });
  await dialog.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('QA logout failed');
  await expect(dialog.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeEnabled();
});

test('guest settings have no sign out action', async ({ page }) => {
  const dialog = await settings(page, 375, true);
  await expect(dialog.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
});
