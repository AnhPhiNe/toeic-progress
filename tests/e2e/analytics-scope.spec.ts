import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.goto('/phan-tich');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.sessions = Array.from({ length: 7 }, (_, index) => ({ id: `result-${index}`, testName: `ETS Test ${index + 1}`,
      skillType: 'LR', sessionType: 'FULL_TEST', date: `2026-10-0${index + 1}`, durationMinutes: 120,
      totalScore: 700 + index * 10, scaledListening: 350 + index * 5, scaledReading: 350 + index * 5,
      partScores: { part1: 6, part2: 22, part3: 34, part4: 23, part5: 27, part6: 13, part7: 43 }, createdAt: now, updatedAt: now, deletedAt: null }));
    data.mistakes = ['ETS Test 1', 'ETS Test 7', 'Notes only', ''].map((sourceTestName, index) => ({ id: `note-${index}`, sourceTestName,
      part: 5, category: 'VOCABULARY_TRAP', status: 'NEEDS_REVIEW', questionContext: `Question ${index} should ____ submitted.`,
      userMistake: '', correctAnswer: '(B) be', options: ['(A) are', '(B) be'], tags: [], createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('.analytics-bar-labels text')).toHaveCount(7);
}

test('test selector searches, supports keyboard, and carries the complete source notebook', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('button', { name: 'Đề: ETS Test 7', exact: true })).toBeVisible();
  await expect(page.getByText('380/495', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('img', { name: /^1 lỗi đã ghi:/ })).toBeVisible();
  await page.getByRole('button', { name: /^Đề:/ }).click();
  await expect(page.getByRole('option', { name: /^Tất cả|^5 lượt/ })).toHaveCount(0);
  const search = page.getByRole('combobox', { name: 'Tìm đề' });
  await search.fill('test 1');
  await expect(page.getByRole('listbox', { name: 'Chọn đề', exact: true }).getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(page.getByRole('button', { name: 'Đề: ETS Test 1', exact: true })).toBeFocused();
  await expect(page.getByText('350/495', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Mở Sổ tay của đề', exact: true }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await expect(page.getByLabel('Đề', { exact: true })).toHaveValue('test:ets test 1');
});

test('Full Test selector excludes practice-only sources while shared names keep their Full Test', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const base = data.sessions[0];
    data.sessions.push({ ...base, id: 'practice-only', testName: 'Cày Part 5 & 6', sessionType: 'PART_PRACTICE' });
    data.sessions.push({ ...base, id: 'shared-practice', sessionType: 'PART_PRACTICE' });
    data.sessions.push({ ...base, id: 'speaking-only', testName: 'SW only', skillType: 'SW' });
    data.mistakes.push({ ...data.mistakes[0], id: 'practice-note', sourceTestName: 'Cày Part 5 & 6' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: /^Đề:/ }).click();
  const list = page.getByRole('listbox', { name: 'Chọn đề', exact: true });
  await expect(list.getByRole('option', { name: 'Cày Part 5 & 6', exact: true })).toHaveCount(0);
  await expect(list.getByRole('option', { name: 'SW only', exact: true })).toHaveCount(0);
  await list.getByRole('option', { name: 'ETS Test 1', exact: true }).click();
  await expect(page.getByText('350/495', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('Lần làm', { exact: true }).locator('option')).toHaveCount(1);
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  expect(data.sessions.some((row: { id: string }) => row.id === 'practice-only')).toBe(true);
});

test('notes-only sources show missing scores and keep notebook reset available', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /^Đề:/ }).click();
  await page.getByRole('option', { name: 'Notes only', exact: true }).click();
  await expect(page.getByText('Chưa nhập kết quả', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa ghi', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('Lần làm', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Lần làm', { exact: true }).locator('option')).toHaveText(['Chưa có lượt làm']);
  await expect(page.getByRole('img', { name: /^Tỷ lệ đúng theo Part/ })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^1 lỗi đã ghi:/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mở Sổ tay của đề', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(4);
});

test('no named test leaves an empty source scope instead of assigning unlinked notes', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [];
    data.mistakes = data.mistakes.slice(-1);
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đề: Chưa có đề', exact: true })).toBeDisabled();
  await expect(page.getByRole('img', { name: /lỗi đã ghi:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở Sổ tay của đề', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(1);
});

test('analytics fits small and desktop viewports in both themes', async ({ page }, testInfo) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const categories = ['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER'];
    data.mistakes = categories.flatMap((category, index) => Array.from({ length: index === 0 ? 7 : index === 1 ? 2 : 1 }, (_, offset) => ({
      ...data.mistakes[1], id: `layout-${index}-${offset}`, category
    })));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  for (const width of [320, 375, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Độ chính xác 7 Part' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const scopeRow = page.getByRole('button', { name: /^Chọn đề và lần làm/ });
    if (width < 768 && !(await page.getByRole('dialog', { name: 'Chọn đề và lần làm' }).count())) await scopeRow.click();
    await page.getByRole('button', { name: /^Đề:/ }).click();
    await expect(page.getByRole('combobox', { name: 'Tìm đề' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('combobox', { name: 'Tìm đề' }).press('Escape');
  }
  await page.screenshot({ path: testInfo.outputPath('analytics-light.png'), fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Chuyển sang giao diện Tối', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lỗi đã ghi của đề' })).toBeVisible();
  await expect.poll(() => page.locator('.analytics-panel').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 26, 44)');
  await page.screenshot({ path: testInfo.outputPath('analytics-dark.png'), fullPage: true });
});

test('chart marks animate once and interpolate filters while labels stay fixed; reduced motion is live', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions[0].partScores.part1 = 3;
    const base = data.mistakes[0];
    data.mistakes = [
      ['ETS Test 7', 'VOCABULARY_TRAP'], ['ETS Test 7', 'VOCABULARY_TRAP'], ['ETS Test 7', 'ADVANCED_GRAMMAR'],
      ['ETS Test 1', 'TIME_PRESSURE'], ['ETS Test 1', 'TIME_PRESSURE'], ['ETS Test 1', 'LISTENING_SPEED']
    ].map(([sourceTestName, category], index) => ({ ...base, id: `motion-${index}`, sourceTestName, category }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-10-09T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-09T00:00:01Z'));
  await page.reload();
  const firstBar = page.locator('.recharts-bar-rectangle path').first();
  const labels = page.locator('.analytics-bar-labels');
  const donut = page.locator('.recharts-pie-sector path');
  const labelPositions = () => labels.locator('text').evaluateAll(elements => elements.map(element => [element.getAttribute('x'), element.getAttribute('y'), element.textContent]));
  const barHeight = () => firstBar.evaluate(element => Number(element.getAttribute('height')));
  await page.clock.runFor(120);
  await expect(firstBar).toBeAttached();
  const earlyHeight = await barHeight();
  const fixedLabels = await labelPositions();
  const earlyPie = await donut.evaluateAll(elements => elements.map(element => element.getAttribute('d')));
  await page.clock.runFor(150);
  expect(await barHeight()).toBeGreaterThan(earlyHeight);
  expect(await labelPositions()).toEqual(fixedLabels);
  expect(await donut.evaluateAll(elements => elements.map(element => element.getAttribute('d')))).not.toEqual(earlyPie);
  await page.clock.runFor(1000);
  const settledHeight = await barHeight();
  const settledPie = await donut.evaluateAll(elements => elements.map(element => element.getAttribute('d')));
  await page.clock.runFor(2000);
  expect(await barHeight()).toBe(settledHeight);
  expect(await donut.evaluateAll(elements => elements.map(element => element.getAttribute('d')))).toEqual(settledPie);

  await page.getByRole('button', { name: /^Đề:/ }).click();
  await page.getByRole('option', { name: 'ETS Test 1', exact: true }).click();
  await page.clock.runFor(100);
  const midHeight = await barHeight();
  expect(midHeight).toBeLessThan(settledHeight);
  expect(midHeight).toBeGreaterThan(settledHeight / 2);
  const nextLabels = await labelPositions();
  expect(nextLabels[0][2]).toBe('50%');
  await page.clock.runFor(300);
  expect(await barHeight()).toBeCloseTo(settledHeight / 2, 0);
  expect(await labelPositions()).toEqual(nextLabels);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /^Đề:/ }).click();
  await page.getByRole('option', { name: 'ETS Test 7', exact: true }).click();
  expect(await barHeight()).toBe(settledHeight);
  const staticPie = await donut.evaluateAll(elements => elements.map(element => element.getAttribute('d')));
  await page.clock.runFor(1000);
  expect(await barHeight()).toBe(settledHeight);
  expect(await donut.evaluateAll(elements => elements.map(element => element.getAttribute('d')))).toEqual(staticPie);
});
