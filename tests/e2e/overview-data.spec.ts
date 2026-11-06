import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    const base = { skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, updatedAt: stamp, deletedAt: null };
    data.profile.targetScore = 990;
    data.sessions = [
      { ...base, id: 'first', testName: 'ETS 1', totalScore: 825, scaledListening: 430, scaledReading: 395, date: '2026-08-15', createdAt: '2026-08-15T09:00:00Z' },
      { ...base, id: 'latest', testName: 'Low score', totalScore: 10, scaledListening: 5, scaledReading: 5, date: '2026-10-09', createdAt: stamp },
      { ...base, id: 'sw', skillType: 'SW', testName: 'SW result', totalScore: 990, date: '2026-10-09', createdAt: stamp },
      { ...base, id: 'deleted', testName: 'Deleted result', totalScore: 990, date: '2026-10-09', createdAt: stamp, deletedAt: stamp }
    ];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
}

test('LR statistics keep low scores and exclude SW/deleted results; the chart does not clip a score of ten', async ({ page }) => {
  await seed(page);
  await expect(page.getByText('825', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('418', { exact: true })).toBeVisible();
  await expect(page.getByText('-815', { exact: true })).toBeVisible();
  const latest = page.getByRole('region', { name: 'Kết quả gần nhất' });
  await expect(latest).toContainText('Low score');
  await expect(page.locator('.overview-chart-labels text')).toHaveCount(2);
  const bottom = await page.locator('.overview-chart-labels circle').last().evaluate(node => {
    const point = node.getBoundingClientRect();
    const chart = node.closest('svg')!.getBoundingClientRect();
    return { point: point.bottom, chart: chart.bottom };
  });
  expect(bottom.point).toBeLessThanOrEqual(bottom.chart);
  await expect(latest.getByText('còn 980 điểm', { exact: true })).toBeVisible();
});

test('partial legacy scores show the known skill and keep the missing skill unknown', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    delete data.sessions[1].scaledReading;
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const latest = page.getByRole('region', { name: 'Kết quả gần nhất' });
  const missingReading = latest.getByRole('button', { name: 'Xem chi tiết Reading: chưa có điểm', exact: true });
  await expect(missingReading).toBeVisible();
  await expect(missingReading).toContainText('—');
  await expect(missingReading).not.toContainText('0 / 495');
  await expect(latest.getByRole('button', { name: 'Xem chi tiết Listening: 5', exact: true })).toBeVisible();
});

test('weekly study days include vocabulary and measured practice but not shield dates or deleted activity', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    data.sessions = [];
    data.profile.lastStudyDate = '2026-10-09';
    data.vocabLog = [
      { id: 'v1', date: '2026-10-05', count: 3, updatedAt: stamp, deletedAt: null },
      { id: 'v2', date: '2026-10-06', count: 2, updatedAt: stamp, deletedAt: null },
      { id: 'deleted', date: '2026-10-08', count: 2, updatedAt: stamp, deletedAt: stamp }
    ];
    data.shieldDays = [{ id: 'shield', date: '2026-10-09', updatedAt: stamp, deletedAt: null }];
    data.pacingRuns = [{ id: 'run', presetId: 'PART_5', presetName: 'Part 5', date: '2026-10-07', actualMinutes: 12, plannedMinutes: 12, finishedNaturally: true, phases: [], createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const week = page.getByRole('group', { name: /^Chuỗi học/ });
  for (const day of ['T2: đã học', 'T3: đã học', 'T4: đã học', 'T5: khiên giữ chuỗi', 'T6: hôm nay, chưa học']) await expect(week.getByText(day, { exact: true })).toBeAttached();
});
