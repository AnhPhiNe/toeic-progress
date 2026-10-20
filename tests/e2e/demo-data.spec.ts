import { expect, test } from '@playwright/test';

const settings = 'Cài đặt';
const openSettings = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /^Chưa đặt ngày thi|^Đếm ngược ngày thi/ }).click();
  return page.getByRole('dialog', { name: settings, exact: true });
};

test('sample data is offered only on an empty guest device', async ({ page }) => {
  await page.goto('/tu-vung');
  const modal = await openSettings(page);
  await expect(modal.getByRole('button', { name: 'Nạp dữ liệu mẫu', exact: true })).toBeVisible();
});

test('sample data cannot replace a learner record that already exists', async ({ page }) => {
  await page.goto('/tu-vung');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.sessions.push({
      id: 'own-test', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'My own test', date: now.slice(0, 10),
      durationMinutes: 120, scaledListening: 400, scaledReading: 400, totalScore: 800, scoreSource: 'MANUAL_SECTIONS',
      createdAt: now, updatedAt: now, deletedAt: null
    });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const modal = await openSettings(page);
  await expect(modal.getByRole('button', { name: 'Nạp dữ liệu mẫu', exact: true })).toHaveCount(0);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions
    .filter((session: { deletedAt: string | null }) => !session.deletedAt).map((session: { id: string }) => session.id));
  expect(kept).toEqual(['own-test']);
});
