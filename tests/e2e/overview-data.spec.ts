import { test, expect, type Page } from '@playwright/test';

/** Hôm nay with a chosen goal and no test yet shows the streak cake's week (its candles carry a <title> each). */
async function seed(page: Page) {
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.goto('/');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.profile.goalChosen = true;
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
  });
  await page.reload();
}

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
  const titles = await page.locator('section[aria-label^="Chuỗi"] svg title').allTextContents();
  // Mon-Wed studied (vocabulary twice, one measured Part 5 run). The deleted vocabulary entry on Thu is not a study day;
  // Thu and the shield date today show as rest days, never as studied; Sat and Sun have not come yet.
  expect(titles).toEqual(['T2: đã học', 'T3: đã học', 'T4: đã học', 'Ngày nghỉ giữ chuỗi', 'Ngày nghỉ giữ chuỗi', 'T7', 'CN']);
});
