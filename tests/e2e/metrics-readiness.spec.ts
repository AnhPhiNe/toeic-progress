import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, fields: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(fields => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-22T09:00:00Z';
    data.sessions = [{ id: 'metrics', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'Metrics regression',
      date: '2026-10-22', durationMinutes: 120, totalScore: 745, scaledListening: 375, scaledReading: 370,
      createdAt: stamp, updatedAt: stamp, deletedAt: null, ...fields }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, fields);
  await page.reload();
}

test('fractional study minutes are readable on desktop and phone without rounding stored time', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T09:00:00Z') });
  await seed(page, { durationMinutes: 120.22985 });
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-22T09:00:00Z';
    data.weeklyPlans = [{ id: '2026-10-19', weekKey: '2026-10-19', updatedAt: stamp, deletedAt: null,
      tasks: [{ id: 'minutes', title: 'Study measured time', type: 'AUTO_STUDY_TIME', target: 210,
        unit: 'phút', createdAt: stamp, color: 'indigo' }] }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.goto('/ke-hoach');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('main')).toContainText('120,2');
    await expect(page.locator('main')).not.toContainText('120.22985');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions[0].durationMinutes)).toBe(120.22985);
});
