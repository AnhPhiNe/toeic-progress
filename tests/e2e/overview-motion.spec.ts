import { test, expect } from '@playwright/test';

test('overview draws once on entry, keeps labels visible, and respects fast filters and live reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [825, 870, 930].map((totalScore, index) => ({
      id: `motion-${index}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: index === 1 ? 'ETS Test 2' : 'ETS Test 1',
      totalScore, scaledListening: 430, scaledReading: totalScore - 430, date: `2026-10-0${index + 5}`, durationMinutes: 120,
      createdAt: `2026-10-0${index + 5}T09:00:00Z`, updatedAt: '2026-10-09T09:00:00Z', deletedAt: null
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.reload();
  await page.clock.runFor(120);
  const labels = page.locator('.overview-chart-labels text');
  const positions = () => labels.evaluateAll(nodes => nodes.map(node => [node.getAttribute('x'), node.getAttribute('y'), node.textContent]));
  await expect(labels).toHaveCount(3);
  const initialLabels = await positions();
  const clip = page.locator('clipPath[id^="animationClipPath-"] rect');
  const earlyWidth = await clip.evaluate(node => Number(node.getAttribute('width')));
  await page.clock.runFor(200);
  expect(await clip.evaluate(node => Number(node.getAttribute('width')))).toBeGreaterThan(earlyWidth);
  expect(await positions()).toEqual(initialLabels);
  await page.clock.runFor(1000);
  const curve = page.locator('.overview-score-area .recharts-area-curve');
  const settled = await curve.getAttribute('d');
  await page.clock.runFor(1000);
  expect(await curve.getAttribute('d')).toBe(settled);

  await page.getByRole('tab', { name: 'Lần đầu', exact: true }).click();
  await page.clock.runFor(100);
  await expect(labels).toHaveCount(2);
  const nextLabels = await positions();
  const mid = await curve.getAttribute('d');
  await page.clock.runFor(400);
  expect(await curve.getAttribute('d')).not.toBe(mid);
  expect(await positions()).toEqual(nextLabels);

  await page.getByRole('tab', { name: 'Tất cả', exact: true }).click();
  await page.clock.runFor(50);
  await page.getByRole('tab', { name: 'Lần đầu', exact: true }).click();
  await page.clock.runFor(50);
  await page.getByRole('tab', { name: 'Tất cả', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(labels).toHaveCount(3);
  expect(await curve.getAttribute('d')).toBe(settled);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Lần đầu', exact: true }).click();
  await expect(labels).toHaveCount(2);
  const staticCurve = await curve.getAttribute('d');
  await page.clock.runFor(1000);
  expect(await curve.getAttribute('d')).toBe(staticCurve);
  await expect(clip).toHaveCount(0);
  await page.getByRole('button', { name: 'Kế Hoạch', exact: true }).click();
  await page.getByRole('button', { name: 'Tổng Quan', exact: true }).click();
  await expect(labels).toHaveCount(3);
  await expect(clip).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Kế Hoạch', exact: true }).click();
  await page.getByRole('button', { name: 'Tổng Quan', exact: true }).click();
  await page.clock.runFor(120);
  await expect(labels).toHaveCount(3);
  await expect(clip).toHaveCount(1);
  const reopenedEarlyWidth = await clip.evaluate(node => Number(node.getAttribute('width')));
  await page.clock.runFor(1000);
  const reopenedFinalWidth = await clip.evaluate(node => Number(node.getAttribute('width')));
  expect(reopenedFinalWidth).toBeGreaterThan(reopenedEarlyWidth);
  await page.clock.runFor(2000);
  expect(await clip.evaluate(node => Number(node.getAttribute('width')))).toBe(reopenedFinalWidth);
});
