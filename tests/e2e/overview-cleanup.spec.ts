import { test, expect } from '@playwright/test';

test('overview preserves the original layout with only the requested label and copy cleanup', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    const date = stamp.slice(0, 10);
    const base = { skillType: 'LR', sessionType: 'FULL_TEST', date, durationMinutes: 120, updatedAt: stamp, deletedAt: null };
    data.sessions = [
      { ...base, id: 'first', testName: 'ETS 2024 Test 01', totalScore: 825, scaledListening: 430, scaledReading: 395, createdAt: '2026-08-15T09:00:00Z' },
      { ...base, id: 'latest', testName: 'ETS 2024 Test 03', totalScore: 400, scaledListening: 250, scaledReading: 150, createdAt: stamp }
    ];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByText('SO VỚI BÀI ĐẦU', { exact: true })).toBeVisible();
  await expect(page.getByText('PHONG ĐỘ ⚡', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Cần ôn tập:/)).toHaveCount(0);
  await expect(page.getByText(/trần điểm|để chạm trần/)).toHaveCount(0);
  await expect(page.getByText('250/495', { exact: true })).toHaveCount(0);
  await expect(page.getByText('150/495', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kết quả gần nhất' })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'));
  for (const width of [320, 375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px`).toBe(true);
  }
  // Cards keep their natural height: the chart matches the latest-score card and nothing stretches with the window.
  const rowBottoms = () => page.locator('[data-overview-grid]').evaluate(grid => {
    const card = grid.querySelector('[aria-labelledby="score-report-title"]')!.getBoundingClientRect();
    const chart = grid.querySelector('.recharts-responsive-container')!.closest('[class*="xl:col-span-8"]')!.getBoundingClientRect();
    return { height: Math.round(card.height), gap: Math.abs(card.bottom - chart.bottom) };
  });
  let first = 0;
  for (const height of [730, 850, 1080]) {
    await page.setViewportSize({ width: 1440, height });
    const measured = await rowBottoms();
    expect(measured.gap, `${height}px tall`).toBeLessThan(3);
    first ||= measured.height;
    expect(measured.height).toBe(first);
  }
  await page.setViewportSize({ width: 1280, height: 730 });
  await page.evaluate(() => { document.documentElement.style.zoom = '125%'; });
  await expect.poll(async () => (await rowBottoms()).gap).toBeLessThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.screenshot({ path: testInfo.outputPath('overview-original-cleanup.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions[1].rawListening = 0;
    data.sessions[1].rawReading = 20;
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByText('0/100 câu', { exact: true })).toBeVisible();
  await expect(page.getByText('20/100 câu', { exact: true })).toBeVisible();
  expect(JSON.parse(before!).sessions[1].totalScore).toBe(400);
});


test('the score report keeps its own height and the goal summary follows the latest score and profile target', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    data.profile.targetScore = 990;
    data.sessions = [{ id: 'latest', skillType: 'LR', sessionType: 'FULL_TEST', date: stamp.slice(0,10), testName: 'ETS 2024 Test 04', totalScore: 960, scaledListening: 495, scaledReading: 465, rawListening: 97, rawReading: 94, durationMinutes: 112, createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.reload();
  await expect(page.locator('[data-latest-goal]')).toHaveText('Mục tiêu 990còn 30 điểm');
  const latest = page.getByRole('region', { name: 'Kết quả gần nhất' });
  const height = await latest.evaluate(node => Math.round(node.getBoundingClientRect().height));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect.poll(async () => latest.evaluate(node => Math.round(node.getBoundingClientRect().height))).toBe(height);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.profile.targetScore = 900;
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('[data-latest-goal]')).toHaveText('Mục tiêu 900Đã đạt mục tiêu');
  await expect(page.getByRole('button', { name: 'Xem 7 Part chi tiết', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('[data-latest-goal]')).toHaveCount(0);
});
