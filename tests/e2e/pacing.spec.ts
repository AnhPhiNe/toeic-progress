import { test, expect, type Page } from '@playwright/test';

/**
 * Timer rules that outlived the classic clock (ReadingPacingView, no longer reachable): they now run on the bakery.
 * Flows of the bakery itself and of Mẻ tự do live in pacing-bakery.spec.ts.
 */
async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // "Bật lò" starts at once
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-09T09:00:01Z'));
  await page.goto('/luyen-toc-do');
}
async function data(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!)); }
const dish = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label}, `) });
const fire = (page: Page) => page.getByRole('button', { name: /Bật lò/ });
const minus = (page: Page) => page.getByRole('group', { name: 'Số phút', exact: true }).getByRole('button', { name: 'Bớt một phút', exact: true });

test('today counts saved real study time across modes and excludes breaks, pauses and deleted results', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const runs = [
      { presetId: 'PART_5', partType: 'PART_5', actualSeconds: 1500 },
      { presetId: 'POMODORO_WORK', partType: 'POMODORO', actualSeconds: 3300 },
      { presetId: 'POMODORO_SHORT_BREAK', partType: 'POMODORO', actualSeconds: 300 },
      { presetId: 'POMODORO_LONG_BREAK', partType: 'POMODORO', actualSeconds: 900 },
      { presetId: 'PART_6', partType: 'PART_6', actualSeconds: 900, deletedAt: '2026-10-09T09:00:00Z' },
      { presetId: 'PART_5', partType: 'PART_5', actualSeconds: 1800, date: '2026-10-08' }
    ];
    bundle.pacingRuns = runs.map((run, index) => ({ ...run, id: `daily-${index}`, presetName: run.presetId, date: run.date || '2026-10-09', plannedMinutes: 120, actualMinutes: run.actualSeconds / 60, createdAt: '2026-10-09T08:00:00Z', finishedNaturally: false, phases: [] }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await dish(page, 'Mẻ tự do').click();
  for (let i = 0; i < 4; i++) await minus(page).click(); // 25 → 5
  await fire(page).click();
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.clock.fastForward(60000); // a pause is not study time
  await page.getByRole('button', { name: 'Xong sớm · ra lò', exact: true }).click();
  const done = page.getByRole('dialog', { name: '+1 phút', exact: true });
  await expect(done).toContainText('Đã luyện hôm nay1 giờ 21 phút');
  expect((await data(page)).pacingRuns[0]).toMatchObject({ presetId: 'POMODORO_WORK', actualSeconds: 60, finishedNaturally: false });
  await page.getByRole('button', { name: 'Nướng mẻ nữa', exact: true }).click();
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await fire(page).click();
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(page.getByRole('dialog', { name: '+5 phút', exact: true })).toContainText('Đã luyện hôm nay5 phút');
});

test('expiry preserves results but waits for an existing logger dialog to close', async ({ page }) => {
  await open(page);
  await dish(page, 'Part 5').click();
  for (let i = 0; i < 11; i++) await minus(page).click(); // 12 → 1
  await fire(page).click();
  await page.keyboard.press('n');
  const logger = page.getByRole('dialog', { name: /^Ghi (điểm|buổi luyện)$/ });
  await expect(logger).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: /^Ra lò! Part 5/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /^Ra lò! Part 5/ })).toBeVisible();
  expect((await data(page)).pacingRuns).toHaveLength(0);
});

test('Reading 75p remains practice and its aggregate result is listed in the bakery without invented Part scores', async ({ page }) => {
  await open(page);
  await dish(page, 'Cả phần Đọc').click();
  await fire(page).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Xong rồi · ra lò', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Số câu sai', exact: true }).fill('20');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  const bundle = await data(page);
  expect(bundle.pacingRuns[0]).toMatchObject({ partType: 'FULL_READING', totalQuestions: 100, correctAnswers: 80 });
  expect(bundle.sessions[0].sessionType).toBe('PART_PRACTICE');
  expect(bundle.sessions[0]).not.toHaveProperty('partScores');
  expect(bundle.sessions[0]).not.toHaveProperty('totalScore');
  expect(bundle.sessions[0]).not.toHaveProperty('practiceParts');
  // The saved bake is listed in "Mẻ bánh gần đây"; opening it edits the measured result through the same grading form.
  await page.getByRole('button', { name: /^Cả phần Đọc · 20 sai/ }).click();
  const editor = page.getByRole('dialog', { name: 'Kết quả Reading', exact: true });
  await expect(editor.getByRole('spinbutton', { name: 'Số câu đúng' })).toHaveValue('80');
  await editor.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('70');
  await editor.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect((await data(page)).pacingRuns[0].correctAnswers).toBe(70);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Cả phần Đọc · 30 sai/ })).toBeVisible();
});

test('a legacy custom Part draft keeps its recorded count without creating invalid Part detail', async ({ page }) => {
  await open(page);
  await dish(page, 'Part 5').click();
  await fire(page).click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.evaluate(() => {
    const key = 'toeic_pacing_draft_v1_guest';
    const draft = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...draft, questions: 60, status: 'ready', elapsedMs: 0, startedAt: null, runningSince: null }));
  });
  await page.reload();
  await fire(page).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Xong rồi · ra lò', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Số câu sai', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Lưu vào sổ', exact: true }).click();
  const bundle = await data(page);
  expect(bundle.pacingRuns[0]).toMatchObject({ totalQuestions: 60, correctAnswers: 50 });
  expect(bundle.sessions[0]).not.toHaveProperty('practiceParts');
  await expect(page.getByRole('button', { name: /^Part 5 · 10 sai/ })).toBeVisible();
});

test('a stale tab cannot revive a draft that another tab reset', async ({ page }) => {
  await open(page);
  await dish(page, 'Part 5').click();
  await fire(page).click();
  await page.clock.fastForward(5000);
  await page.evaluate(() => {
    const old = JSON.parse(localStorage.getItem('toeic_pacing_draft_v1_guest')!);
    localStorage.setItem('toeic_pacing_draft_v1_guest', JSON.stringify({ ...old, id: 'pacing-v2-other-reset', mode: 'PART_6', plannedSeconds: 480, questions: 16, status: 'ready', elapsedMs: 0, runningSince: null, startedAt: null, endedAt: null }));
  });
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hôm nay nướng Part 6 nhé\?/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Số phút', exact: true })).toContainText('8');
  await expect(page.getByRole('alert')).toContainText('Phiên đã thay đổi ở tab khác');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_pacing_draft_v1_guest')!));
  expect(draft.id).toBe('pacing-v2-other-reset');
  expect((await data(page)).pacingRuns).toHaveLength(0);
});
