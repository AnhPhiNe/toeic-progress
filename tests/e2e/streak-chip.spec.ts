import { expect, test, type Page } from '@playwright/test';
import { openRecordSheet } from './helpers/nav';

async function saveVocab(page: Page) {
  await openRecordSheet(page, 'vocab');
  await page.getByRole('dialog').getByRole('button', { name: /^Lưu \d+ từ/ }).click();
}

test('the flame celebrates only the first study of the day and steps aside on the first tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await saveVocab(page);
  const celebration = page.getByRole('status').filter({ hasText: '1 ngày liên tiếp' });
  await expect(celebration).toBeVisible();
  // The overlay never blocks input while it plays, and steps aside on the first tap.
  await page.mouse.click(195, 300);
  await expect(celebration).toHaveCount(0, { timeout: 500 });

  await page.reload();
  await saveVocab(page);
  await page.waitForTimeout(500);
  await expect(page.getByRole('status').filter({ hasText: 'ngày liên tiếp' })).toHaveCount(0);
});
