import { expect, test } from '@playwright/test';

// The e2e web server hides page tips (VITE_GUIDE_TIPS=off); this spec turns them back on.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __GUIDE_TIPS__: boolean }).__GUIDE_TIPS__ = true; });
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    (await import('/src/shared/data/storage.ts')).loadDemoData();
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
  });
});

test('a page tip shows once, and Xem lại on Cách dùng app brings it back', async ({ page }) => {
  await page.goto('/so-tay');
  const tip = page.getByRole('dialog', { name: 'Gợi ý của Sóc' });
  await expect(tip).toContainText('Chữa đề xong, chụp trang chữa bài');
  await expect(tip).toBeFocused();
  await tip.getByRole('button', { name: 'Hiểu rồi' }).click();
  await expect(tip).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: /Chụp trang chữa bài/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(tip).toBeHidden();

  await page.getByRole('button', { name: 'Cách dùng app', exact: true }).click();
  await expect(page).toHaveURL(/\/cach-dung$/);
  await expect(page.getByText('Đã xem 1/3 trang')).toBeVisible();
  await page.getByRole('button', { name: 'Xem lại' }).click();
  await expect(page.getByText('Đã xem 0/3 trang')).toBeVisible();

  await page.getByRole('button', { name: /Mở Sổ tay/ }).click();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('no tip on an empty page or while the score logger is open', async ({ page }) => {
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('rd_welcome_seen_v1:guest', '1'); });
  const tip = page.getByRole('dialog', { name: 'Gợi ý của Sóc' });
  for (const path of ['/so-tay', '/lich-su']) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    await expect(tip).toBeHidden();
  }

  await page.evaluate(async () => (await import('/src/shared/data/storage.ts')).loadDemoData());
  await page.goto('/lich-su');
  await expect(page.getByRole('heading', { name: 'Hành trình điểm' })).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(tip).toBeHidden();
});
