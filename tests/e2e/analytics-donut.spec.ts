import { test, expect } from '@playwright/test';

test('donut hover and keyboard details stay below the ring without rectangular focus outlines', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/phan-tich');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); const now = new Date().toISOString();
    bundle.sessions = [{ id: 'donut-result', testName: 'ETS Donut', skillType: 'LR', sessionType: 'FULL_TEST',
      date: '2026-10-10', durationMinutes: 120, totalScore: 700, scaledListening: 350, scaledReading: 350,
      createdAt: now, updatedAt: now, deletedAt: null }];
    bundle.mistakes = ['ADVANCED_GRAMMAR', 'ADVANCED_GRAMMAR', 'VOCABULARY_TRAP'].map((category, index) => ({
      id: `donut-note-${index}`, sourceTestName: 'ETS Donut', part: 5, category, status: 'NEEDS_REVIEW',
      questionContext: `Question ${index} should ____ submitted.`, userMistake: '', correctAnswer: '(B) be',
      options: ['(A) are', '(B) be'], tags: [], createdAt: now, updatedAt: now, deletedAt: null
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  const donut = page.locator('.analytics-donut'); const caption = donut.locator('.analytics-donut-detail');
  await expect(donut).toHaveAttribute('aria-label', /^3 lỗi đã ghi:/);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const segment = donut.locator('.recharts-sector[fill="#F59E0B"]');
    const segmentBounds = (await segment.boundingBox())!;
    // The bounding-box center falls in the donut hole, so point inside the colored arc.
    const position = { x: segmentBounds.width - 15, y: segmentBounds.height / 2 };
    await segment.hover({ position }); await expect(caption).toContainText('Bẫy từ vựng & paraphrase');
    await expect(caption).toContainText('1 lỗi · 33%');
    await segment.click({ position });
    expect(await segment.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
    await expect(donut.locator('.recharts-tooltip-wrapper')).toHaveCount(0);
    await expect(donut.locator('strong')).toHaveText('3');
    const chartBounds = (await donut.locator('.analytics-donut-chart').boundingBox())!;
    const captionBounds = (await caption.boundingBox())!;
    expect(captionBounds.y).toBeGreaterThanOrEqual(chartBounds.y + chartBounds.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`donut-hover-${width}.png`), fullPage: true });
    await page.mouse.move(0, 0); await expect(caption).toHaveText('');
  }
  const pie = donut.locator('.recharts-pie'); await pie.focus(); await pie.press('ArrowLeft');
  await expect(caption).toContainText('Ngữ pháp'); await expect(caption).toContainText('2 lỗi · 67%');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('none');
  const focusedSegment = donut.locator('.recharts-pie-sector:focus-visible path');
  await expect(focusedSegment).toHaveCSS('stroke', 'rgb(37, 99, 235)');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(focusedSegment).toHaveCSS('stroke', 'rgb(147, 197, 253)');
  await pie.press('Escape'); await expect(caption).toHaveText('');
});
