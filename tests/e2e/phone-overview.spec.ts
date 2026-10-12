import { expect, test } from '@playwright/test';

test('phone overview plots the four latest tests, marks retakes instead of offering a filter, and shows the record date', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-01T09:00:00Z';
    const rows: Array<[string, string, number]> = [
      ['a', 'ETS A', 800], ['b', 'ETS B', 820], ['c', 'ETS C', 840], ['d', 'ETS A', 900], ['e', 'ETS D', 870]
    ];
    data.sessions = rows.map(([id, testName, totalScore], index) => ({
      id, skillType: 'LR', sessionType: 'FULL_TEST', testName, totalScore, scaledListening: 450, scaledReading: totalScore - 450,
      date: `2026-09-0${index + 1}`, durationMinutes: 120, createdAt: stamp, updatedAt: stamp, deletedAt: null
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();

  await expect(page.getByRole('tab', { name: 'Lần đầu' })).toHaveCount(0);
  await expect(page.locator('.overview-chart-labels text')).toHaveCount(4);
  await expect(page.locator('.overview-chart-labels [data-retest]')).toHaveCount(1);
  await expect(page.getByText('Làm lại đề cũ', { exact: true })).toBeVisible();
  await expect(page.getByText('Ngày 04/09', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('tab', { name: 'Lần đầu' })).toBeVisible();
  await expect(page.locator('.overview-chart-labels text')).toHaveCount(5);
  await expect(page.locator('.overview-chart-labels [data-retest]')).toHaveCount(0);
});
