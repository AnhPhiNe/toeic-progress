import { expect, test, type Page } from '@playwright/test';
import { openRecordSheet } from './helpers/nav';

async function saveVocab(page: Page) {
  await openRecordSheet(page, 'vocab');
  await page.getByRole('dialog').getByRole('button', { name: /^Lưu \d+ từ/ }).click();
}

test('phone streak chip lights up and the flame celebrates only the first study of the day', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Từ vựng is the phone page that still has the top bar (and so the streak chip).
  await page.goto('/tu-vung');
  await expect(page.getByRole('button', { name: 'Chuỗi học 0 ngày, xem tuần này', exact: true })).toBeVisible();

  await saveVocab(page);
  const celebration = page.getByRole('status').filter({ hasText: '1 ngày liên tiếp' });
  await expect(celebration).toBeVisible();
  // The overlay never blocks input while it plays, and steps aside on the first tap.
  await page.getByRole('button', { name: 'Chuỗi học 1 ngày, xem tuần này', exact: true }).click();
  await expect(celebration).toHaveCount(0, { timeout: 500 });
  const week = page.getByRole('dialog', { name: 'Chuỗi 1 ngày', exact: true });
  await expect(week.getByText('Hôm nay đã học. Mai học tiếp để giữ lửa.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(celebration).toHaveCount(0, { timeout: 5000 });

  await page.reload();
  await saveVocab(page);
  await page.waitForTimeout(500);
  await expect(page.getByRole('status').filter({ hasText: 'ngày liên tiếp' })).toHaveCount(0);
});
