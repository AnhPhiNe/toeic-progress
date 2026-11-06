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

test('official scaled-only scores keep raw counts unknown and skill buttons expose selection', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /Xem chi tiết Listening/ }).click();
  const modal = page.getByRole('dialog', { name: /^Chi tiết (Listening|Reading):/ });
  await expect(modal.getByTestId('skill-correct')).toHaveText('Chưa ghi');
  await expect(modal.getByTestId('skill-accuracy')).toHaveText('—');
  const listening = modal.getByRole('tab', { name: /^Listening/ });
  const reading = modal.getByRole('tab', { name: /^Reading/ });
  await expect(listening).toHaveAttribute('aria-selected', 'true');
  await expect(reading).toHaveAttribute('aria-selected', 'false');
  await reading.click();
  await expect(reading).toHaveAttribute('aria-selected', 'true');
  await expect(listening).toHaveAttribute('aria-selected', 'false');
  await expect(modal.getByTestId('skill-correct')).toHaveText('Chưa ghi');
  await expect(modal.getByTestId('skill-accuracy')).toHaveText('—');
});

test('partial Parts do not invent a skill total while explicit raw zero stays visible', async ({ page }) => {
  await seed(page, { partScores: { part1: 6 }, rawReading: 0 });
  await page.getByRole('button', { name: /Xem chi tiết Listening/ }).click();
  const modal = page.getByRole('dialog', { name: /^Chi tiết (Listening|Reading):/ });
  await expect(modal.getByTestId('skill-correct')).toHaveText('Chưa ghi');
  await expect(modal.getByText('6 / 6 câu · 100%', { exact: true })).toBeVisible();
  await modal.getByRole('tab', { name: /^Reading/ }).click();
  await expect(modal.getByTestId('skill-correct')).toHaveText('0/100');
  await expect(modal.getByTestId('skill-accuracy')).toHaveText('0.0%');
});

test('total-only scores have no CEFR and unbalanced section scores use the shared reference', async ({ page }) => {
  await seed(page, { totalScore: 945, scaledListening: undefined, scaledReading: undefined });
  const report = page.getByRole('region', { name: 'Kết quả gần nhất' });
  await expect(report).not.toContainText(/Trình độ [ABC][12]/);
  await expect(report).toContainText('chỉ có tổng điểm');
  await seed(page, { totalScore: 945, scaledListening: 495, scaledReading: 450 });
  await expect(report.getByText('Trình độ B2', { exact: true })).toBeVisible();
  await expect(report).not.toContainText('Trình độ C1');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByText('C1 Master', { exact: true })).toHaveCount(0);
  await expect(report.getByText('Trình độ B2', { exact: true })).toBeVisible();
});

test('logging a first result updates the mounted phone summary without a hook-order crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chưa có bài thi nào', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Khám phá Dashboard ngay', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi điểm đề đầu tiên', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Ghi lại', exact: true });
  if (await chooser.isVisible()) await chooser.getByRole('button', { name: /^Điểm đề thi/ }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await form.locator('#session-test-name').fill('First phone result');
  await form.getByRole('button', { name: 'Câu 3', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kết quả gần nhất' })).toContainText('First phone result');
  expect(errors).toEqual([]);
});

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

test('phone loss bars follow lost question counts while accuracy has a separate label', async ({ page }) => {
  await seed(page, { partScores: { part1: 6, part2: 25, part3: 39, part4: 30, part5: 20, part6: 16, part7: 40 } });
  await page.goto('/phan-tich');
  const rows = page.getByRole('list', { name: /^Số câu sai theo Part/ }).getByRole('listitem');
  const p7 = rows.filter({ hasText: 'P7' });
  const p5 = rows.filter({ hasText: 'P5' });
  await expect(p7).toContainText('14 câu sai');
  await expect(p7).toContainText('đúng 74%');
  await expect(p5).toContainText('10 câu sai');
  await expect(p5).toContainText('đúng 67%');
  const width = (node: Element) => Number.parseFloat((node as HTMLElement).style.width);
  expect(await p7.locator('[style*="width"]').evaluate(width)).toBe(100);
  expect(await p5.locator('[style*="width"]').evaluate(width)).toBeCloseTo(10 / 14 * 100, 1);
});
