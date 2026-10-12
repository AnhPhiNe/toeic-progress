import { test, expect, type Page } from '@playwright/test';
import { switchToDarkOnMobile } from './helpers/theme';

async function open(page: Page) {
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-09T09:00:01Z'));
  await page.goto('/luyen-toc-do');
  await page.getByRole('button', { name: 'Âm báo', exact: true }).click();
}
async function data(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!)); }
async function showMetric(page: Page, name: 'Thời gian mỗi câu' | 'Độ chính xác') {
  await page.getByRole('group', { name: 'Chỉ số biểu đồ' }).getByRole('button', { name, exact: true }).click();
}
async function expectCenteredPhases(page: Page) {
  const offset = await page.locator('.pacing-phases').evaluate(element => {
    const phases = element.getBoundingClientRect();
    const clock = element.closest('.pacing-panel')!.querySelector('.pacing-time')!.getBoundingClientRect();
    return Math.abs(phases.x + phases.width / 2 - clock.x - clock.width / 2);
  });
  expect(offset).toBeLessThan(1);
}
async function finishReading(page: Page) {
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Xong bài', exact: true }).click();
  return page.getByRole('dialog', { name: 'Kết quả Part 5', exact: true });
}
async function nameResult(page: Page, name = 'ETS 2024 Test 04') {
  await page.getByRole('combobox', { name: 'Đề của lượt luyện', exact: true }).fill(name);
  await page.getByRole('option', { name: `+ Thêm tên đề “${name}”`, exact: true }).click();
}

test('whole Part 7 is the first choice; whole modes lock counts and partial Part 7 saves its chosen denominator', async ({ page }) => {
  await open(page);
  const part7 = page.getByLabel('Chọn Part 7');
  await expect(part7.locator('option:not([hidden])')).toHaveText(['Part 7 · Toàn bộ', 'Part 7 · Đoạn đơn', 'Part 7 · Đôi/ba']);
  await part7.selectOption('PART_7');
  await expect(page.getByRole('timer')).toHaveText('55:00');
  await expect(page.locator('.pacing-setup')).toContainText('54 câu');
  for (const [mode, count] of [['PART_7', 54], ['Part 5', 30], ['Part 6', 16], ['Reading 75p', 100]] as const) {
    if (mode === 'PART_7') await part7.selectOption(mode);
    else await page.getByRole('button', { name: mode, exact: true }).click();
    await page.getByRole('button', { name: 'Điều chỉnh', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Điều chỉnh thời gian', exact: true });
    await expect(dialog.getByRole('spinbutton')).toHaveCount(1);
    await dialog.getByLabel('Thời gian luyện (phút)').fill('10');
    await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(page.getByRole('timer')).toHaveText('10:00');
    await expect(page.locator('.pacing-setup')).toContainText(`${count} câu`);
  }
  for (const [mode, count] of [['PART_7_SINGLE', 29], ['PART_7_MULTI', 25]] as const) {
    await part7.selectOption(mode);
    await page.getByRole('button', { name: 'Điều chỉnh', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Điều chỉnh lượt luyện', exact: true });
    await expect(dialog.getByLabel('Số câu luyện')).toHaveValue(String(count));
    await dialog.getByLabel('Số câu luyện').fill(String(count + 1));
    await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Số câu luyện').fill('10');
    await dialog.getByLabel('Thời gian luyện (phút)').fill('9');
    await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
    await expect(page.locator('.pacing-setup')).toContainText('10 câu');
    await expect(page.locator('.pacing-clock-meta')).toContainText('54 giây/câu');
  }
  await page.reload();
  await expect(page.locator('.pacing-setup')).toContainText('10 câu');
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Xong bài', exact: true }).click();
  await page.getByLabel('Số câu đúng').fill('8');
  await page.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  const bundle = await data(page);
  expect(bundle.pacingRuns[0]).toMatchObject({ partType: 'PART_7_MULTI', totalQuestions: 10, correctAnswers: 8, accuracyPercent: 80 });
  expect(bundle.sessions[0].practiceParts).toEqual([{ part: 7, correct: 8, total: 10 }]);
});

test('today badge counts saved real study time across modes and excludes breaks, pauses and deleted results', async ({ page }) => {
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
  await expect(page.locator('.pacing-today')).toContainText('1 giờ 20 phút');
  const sound = page.getByRole('button', { name: 'Âm báo', exact: true });
  await expect(sound).toHaveText('');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await sound.click();
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(60000);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.clock.fastForward(60000);
  await expect(page.locator('.pacing-today')).toContainText('1 giờ 20 phút');
  await page.getByRole('button', { name: 'Xong bài', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu thời gian', exact: true }).click();
  await expect(page.locator('.pacing-today')).toContainText('1 giờ 21 phút');
  expect((await data(page)).pacingRuns[0].actualSeconds).toBe(60);
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  await expect(page.locator('.pacing-today')).toContainText('1 giờ 21 phút');
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(page.locator('.pacing-today')).toContainText('0 phút');
});

test('ungraded Reading saves only real time; later grading updates the paired session and deletion removes both', async ({ page }) => {
  await open(page);
  const modal = await finishReading(page);
  await expect(modal.getByRole('spinbutton', { name: 'Số câu đúng' })).toHaveValue('');
  await nameResult(page);
  await modal.getByRole('button', { name: 'Lưu thời gian', exact: true }).click();
  await expect(modal).not.toBeVisible();
  let bundle = await data(page);
  expect(bundle.pacingRuns).toHaveLength(1); expect(bundle.sessions).toHaveLength(1);
  expect(bundle.pacingRuns[0].id).toBe(bundle.sessions[0].id);
  expect(bundle.sessions[0].testName).toBe('ETS 2024 Test 04');
  expect(bundle.pacingRuns[0]).not.toHaveProperty('correctAnswers');
  expect(bundle.pacingRuns[0].actualSeconds).toBeCloseTo(10, 0);
  expect(bundle.sessions[0].durationMinutes).toBeCloseTo(10 / 60, 2);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    bundle.mistakes = [{ id: 'legacy-pacing-note', sessionId: bundle.sessions[0].id, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: 'Keep this source after deletion.', userMistake: '', correctAnswer: '(B) be', tags: [], createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  await showMetric(page, 'Độ chính xác');
  await expect(page.getByText('Chưa có lượt đã chấm.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByRole('button', { name: 'Sửa kết quả ETS 2024 Test 04', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('0');
  await page.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  bundle = await data(page);
  expect(bundle.pacingRuns[0]).toMatchObject({ correctAnswers: 0, accuracyPercent: 0 });
  expect(bundle.sessions[0].practiceParts).toEqual([{ part: 5, correct: 0, total: 30 }]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Xóa lượt ETS 2024 Test 04', exact: true }).click();
  bundle = await data(page);
  expect(bundle.pacingRuns[0].deletedAt).toBeTruthy(); expect(bundle.sessions[0].deletedAt).toBeTruthy();
  expect(bundle.mistakes[0].sourceTestName).toBe('ETS 2024 Test 04');
  expect(bundle.mistakes[0].questionContext).toBe('Keep this source after deletion.');
  await expect(page.getByText('Chưa có lượt luyện nào.', { exact: true })).toBeVisible();
});

test('running and paused drafts survive navigation/reload; switching paused mode asks first', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('progressbar', { name: 'Thời gian còn lại' })).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(5000);
  await expect(page.getByText('11:55', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Thời gian còn lại' })).toHaveAttribute('aria-valuenow', '99');
  await page.getByRole('button', { name: 'Lịch Sử Đề Thi', exact: true }).click();
  await page.clock.fastForward(5000);
  await page.goto('/luyen-toc-do');
  await expect(page.getByText('11:50', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.clock.fastForward(60000);
  await page.reload();
  await expect(page.getByText('11:50', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Part 6', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Part 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Part 6', exact: true }).click();
  await expect(page.getByText('08:00', { exact: true })).toBeVisible();
});

test('an explicit Part request from Analytics switches the preserved draft only after confirmation', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(5000);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.goto('/phan-tich');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    bundle.sessions = [{ id: 'part-request', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'Request Part 6', date: '2026-10-09', createdAt: stamp,
      durationMinutes: 120, totalScore: 800, scaledListening: 400, scaledReading: 400,
      partScores: { part1: 6, part2: 25, part3: 39, part4: 30, part5: 30, part6: 0, part7: 54 }, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Bấm giờ P6', exact: true }).click();
  await expect(page).toHaveURL(/\/phan-tich$/);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Bấm giờ P6', exact: true }).click();
  await expect(page).toHaveURL(/\/luyen-toc-do$/);
  await expect(page.getByText('08:00', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Part 6', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('result draft stays intact on reload, validates grades and retains input after a failed save', async ({ page }) => {
  await open(page);
  await finishReading(page);
  await nameResult(page, 'Keep my result');
  await page.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('2.5');
  await page.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  expect((await data(page)).pacingRuns).toHaveLength(0);
  await page.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('27');
  await page.reload();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('combobox', { name: 'Đề của lượt luyện' })).toHaveValue('Keep my result');
  await expect(modal.getByRole('spinbutton', { name: 'Số câu đúng' })).toHaveValue('27');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'toeic_progress_bundle_v3') throw new DOMException('quota reached', 'QuotaExceededError'); original.call(this, key, value); };
  });
  await modal.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Không đủ dung lượng');
  await expect(modal.getByRole('spinbutton', { name: 'Số câu đúng' })).toHaveValue('27');
  expect((await data(page)).sessions).toHaveLength(0);
});

test('early Pomodoro records only actual focus time and never claims a completed cycle', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Kết thúc phiên', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Kết thúc phiên sớm', exact: true });
  await expect(modal.getByRole('spinbutton', { name: 'Số câu đúng' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Lưu thời gian', exact: true }).click();
  const bundle = await data(page);
  expect(bundle.pacingRuns[0]).toMatchObject({ partType: 'POMODORO', finishedNaturally: false, actualSeconds: 10 });
  expect(bundle.pacingRuns[0]).not.toHaveProperty('accuracyPercent');
  expect(bundle.sessions[0].durationMinutes).toBeCloseTo(10 / 60);
  await page.getByRole('tab', { name: 'Luyện tập', exact: true }).click();
  await expect(page.locator('.pacing-today')).toContainText('Đã luyện hôm nay');
  await expect(page.locator('.pacing-today')).not.toContainText('phiên');
});

test('natural Pomodoro completes once; breaks stay out of study time and settings remain available', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click();
  await page.getByRole('button', { name: 'Điều chỉnh', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Thời gian Pomodoro', exact: true });
  await settings.getByRole('spinbutton', { name: 'Tập trung (phút)', exact: true }).fill('1');
  await settings.getByRole('spinbutton', { name: 'Nghỉ ngắn (phút)', exact: true }).fill('1');
  await settings.getByRole('button', { name: 'Lưu thiết lập', exact: true }).click();
  await expectCenteredPhases(page);
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await expectCenteredPhases(page);
  await page.clock.fastForward(61000);
  const finished = page.getByRole('dialog', { name: 'Phiên tập trung hoàn thành', exact: true });
  await expect(finished).toBeVisible();
  expect((await data(page)).sessions).toHaveLength(1);
  expect((await data(page)).sessions[0].durationMinutes).toBe(1);
  await page.reload();
  await expect(finished).toBeVisible();
  expect((await data(page)).sessions).toHaveLength(1);
  await finished.getByRole('button', { name: 'Nghỉ ngắn 1p', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('dialog', { name: 'Hết giờ nghỉ', exact: true })).toBeVisible();
  const bundle = await data(page);
  expect(bundle.pacingRuns).toHaveLength(2); expect(bundle.sessions).toHaveLength(1);
  expect(bundle.pacingRuns[0].presetId).toBe('POMODORO_SHORT_BREAK');
});

test('expiry preserves results but waits for an existing logger dialog to close', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Điều chỉnh', exact: true }).click();
  await page.getByLabel('Thời gian luyện (phút)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N', exact: true }).click();
  const logger = page.getByRole('dialog', { name: 'Ghi Nhận Kết Quả Buổi Học', exact: true });
  await expect(logger).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Kết quả Part 5', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Kết quả Part 5', exact: true })).toBeVisible();
  expect((await data(page)).pacingRuns).toHaveLength(0);
});

test('statistics quick scopes paginate both metrics together and recover from an empty period', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.pacingRuns = Array.from({ length: 26 }, (_, index) => ({ id: `chart-${index}`, presetId: 'PART_5', presetName: 'Part 5', partType: 'PART_5', date: '2026-10-09', createdAt: `2026-10-09T08:00:${String(index).padStart(2, '0')}Z`, plannedMinutes: 12, actualMinutes: 10, actualSeconds: 600 + index, totalQuestions: 30, correctAnswers: index ? undefined : 0, finishedNaturally: false, phases: [], updatedAt: '2026-10-09T08:00:00Z', deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  await expect(page.getByLabel('Phạm vi thống kê').locator('option')).toHaveText(['Hôm nay', 'Hôm qua', '3 ngày gần nhất', '7 ngày gần nhất']);
  await expect(page.getByLabel('Phạm vi thống kê')).toHaveValue('TODAY');
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(6);
  await page.getByLabel('Phạm vi thống kê').selectOption('YESTERDAY');
  await expect(page.getByText('Chưa có lượt luyện hôm qua.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xem 7 ngày gần nhất', exact: true }).click();
  await expect(page.getByLabel('Phạm vi thống kê')).toHaveValue('LAST_7_DAYS');
  const navigation = page.getByRole('navigation', { name: 'Trang biểu đồ' });
  await expect(page.getByText('Đang xem 21–26 / 26 lượt', { exact: true })).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(6);
  await expect(navigation.getByRole('button', { name: 'Sau', exact: true })).toBeDisabled();
  await navigation.getByRole('button', { name: 'Trước', exact: true }).click();
  await expect(page.getByText('Đang xem 11–20 / 26 lượt', { exact: true })).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(10);
  await navigation.getByRole('button', { name: 'Trước', exact: true }).click();
  await expect(page.getByText('Đang xem 1–10 / 26 lượt', { exact: true })).toBeVisible();
  await showMetric(page, 'Độ chính xác');
  await expect(page.getByText('1/10 lượt đã chấm', { exact: true })).toBeVisible();
  await expect(page.locator('.pacing-point-label[data-kind="accuracy"]')).toHaveText('0%');
  await expect(navigation.getByRole('button', { name: 'Trước', exact: true })).toBeDisabled();
  await navigation.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect(page.getByText('0/10 lượt đã chấm', { exact: true })).toBeVisible();
  await expect(page.getByText('Đang xem 11–20 / 26 lượt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Độ chính xác', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await showMetric(page, 'Thời gian mỗi câu');
  await page.getByLabel('Phạm vi thống kê').selectOption('LAST_3_DAYS');
  await expect(page.getByText('Đang xem 21–26 / 26 lượt', { exact: true })).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(6);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.pacing-chart')).toHaveCount(1);
    await expect(page.locator('.recharts-yAxis')).toHaveCount(1);
  }
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.pacingRuns.forEach((run: { date: string }) => { run.date = '2026-10-08'; });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  await expect(page.getByLabel('Phạm vi thống kê')).toHaveValue('TODAY');
  await expect(page.getByText('Chưa có lượt luyện hôm nay.', { exact: true })).toBeVisible();
  await expect(page.locator('.pacing-chart')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem 7 ngày gần nhất', exact: true }).click();
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(6);
  await expect(page.getByRole('navigation', { name: 'Trang biểu đồ' })).toHaveCount(1);
  await page.getByLabel('Chế độ thống kê').selectOption('PART_6');
  await expect(page.getByText('Chưa có kết quả cho Part 6.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Xóa lượt/ })).toHaveCount(5);
  await expect(page.getByText('1–5 / 26 lượt', { exact: true })).toBeVisible();
});

test('Reading 75p remains practice and its aggregate result is visible in main history without invented Part scores', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Reading 75p', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(10000);
  await page.getByRole('button', { name: 'Xong bài', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('80');
  await page.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  const bundle = await data(page);
  expect(bundle.sessions[0].sessionType).toBe('PART_PRACTICE');
  expect(bundle.sessions[0]).not.toHaveProperty('partScores');
  expect(bundle.sessions[0]).not.toHaveProperty('totalScore');
  await page.getByRole('button', { name: 'Lịch Sử Đề Thi', exact: true }).click();
  await expect(page.getByText(/80\/100/).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: /^Xem chi tiết Luyện Reading/ }).filter({ visible: true }).click();
  const detail = page.getByRole('dialog', { name: 'Luyện Reading', exact: true });
  await expect(detail.getByText('80/100', { exact: true })).toBeVisible();
  await expect(detail.getByText('80%', { exact: true })).toBeVisible();
  await expect(detail.getByText('Chưa ghi chi tiết Part.', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
  await page.getByRole('button', { name: /^Sửa bản ghi/ }).click();
  const editor = page.getByRole('dialog', { name: 'Kết quả Reading', exact: true });
  await expect(editor.getByRole('spinbutton', { name: 'Số câu đúng' })).toHaveValue('80');
  await editor.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('70');
  await editor.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByText(/70\/100/).filter({ visible: true })).toBeVisible();
  expect((await data(page)).pacingRuns[0].correctAnswers).toBe(70);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /^Xóa bản ghi/ }).click();
  expect((await data(page)).pacingRuns[0].deletedAt).toBeTruthy();
});

test('a legacy custom Part draft keeps its recorded count without creating invalid Part detail', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.evaluate(() => {
    const key = 'toeic_pacing_draft_v1_guest';
    const draft = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...draft, questions: 60, status: 'ready', elapsedMs: 0, startedAt: null, runningSince: null }));
  });
  await page.reload();
  await finishReading(page);
  await page.getByRole('spinbutton', { name: 'Số câu đúng' }).fill('50');
  await page.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  const bundle = await data(page);
  expect(bundle.pacingRuns[0]).toMatchObject({ totalQuestions: 60, correctAnswers: 50 });
  expect(bundle.sessions[0]).not.toHaveProperty('practiceParts');
  await page.getByRole('button', { name: 'Lịch Sử Đề Thi', exact: true }).click();
  await page.getByRole('button', { name: /^Xem chi tiết Luyện Part 5/ }).filter({ visible: true }).click();
  const detail = page.getByRole('dialog', { name: 'Luyện Part 5', exact: true });
  await expect(detail.getByText('50/60', { exact: true })).toBeVisible();
  await expect(detail.getByText('Chưa ghi chi tiết Part.', { exact: true })).toBeVisible();
});

test('a stale tab cannot revive a draft that another tab reset', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  await page.clock.fastForward(5000);
  await page.evaluate(() => {
    const old = JSON.parse(localStorage.getItem('toeic_pacing_draft_v1_guest')!);
    localStorage.setItem('toeic_pacing_draft_v1_guest', JSON.stringify({ ...old, id: 'pacing-v2-other-reset', mode: 'PART_6', plannedSeconds: 480, questions: 16, status: 'ready', elapsedMs: 0, runningSince: null, startedAt: null, endedAt: null }));
  });
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await expect(page.getByText('08:00', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Phiên đã thay đổi ở tab khác');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_pacing_draft_v1_guest')!));
  expect(draft.id).toBe('pacing-v2-other-reset');
  expect((await data(page)).pacingRuns).toHaveLength(0);
});

test('pacing layout, settings and result dialog fit small screens and dark mode', async ({ page }, testInfo) => {
  await open(page);
  await expect(page.getByText('Sẵn sàng', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Đã dùng 00:00', { exact: true })).toHaveCount(0);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const centered = await page.locator('.pacing-modes').evaluate(group => {
      const clock = document.querySelector('.pacing-clock')!.getBoundingClientRect();
      const rows = new Map<number, { left: number; right: number }>();
      for (const element of group.children) {
        const bounds = element.getBoundingClientRect(), key = Math.round(bounds.top);
        const row = rows.get(key) || { left: bounds.left, right: bounds.right };
        row.left = Math.min(row.left, bounds.left); row.right = Math.max(row.right, bounds.right); rows.set(key, row);
      }
      return [...rows.values()].every(row => Math.abs((row.left + row.right) / 2 - clock.x - clock.width / 2) < 1);
    });
    expect(centered).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('pacing-ready.png'), fullPage: true });
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click();
  await expectCenteredPhases(page);
  await expect(page.locator('.pacing-today')).toContainText('0 phút');
  await page.screenshot({ path: testInfo.outputPath('pacing-pomodoro.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  for (const [phase, tone] of [['Nghỉ ngắn', 'short-break'], ['Nghỉ dài', 'long-break'], ['Tập trung', 'focus']]) {
    await page.getByRole('button', { name: phase, exact: true }).click();
    await expect(page.getByRole('tabpanel')).toHaveAttribute('data-clock-tone', tone);
    await expect(page.getByRole('button', { name: 'Điều chỉnh', exact: true })).toBeVisible();
    await expectCenteredPhases(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Điều chỉnh', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Thời gian Pomodoro' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Part 5', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 900 });
  const modal = await finishReading(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(modal.getByRole('button', { name: 'Lưu thời gian', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pacing-result-mobile.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Đóng hộp thoại' }).click();
  await switchToDarkOnMobile(page);
  await page.clock.runFor(250);
  await expect.poll(() => page.locator('#root > div').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(7, 12, 22)');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('pacing-paused-dark.png'), fullPage: true });
});

test('compact history preserves tiny durations and zero grades, filters across pages, and fits mobile', async ({ page }, testInfo) => {
  await open(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const samples = [
      { presetId: 'PART_6', presetName: 'Part 6', partType: 'PART_6', totalQuestions: 16, correctAnswers: 0, actualSeconds: .48 },
      { presetId: 'PART_5', presetName: 'Part 5', partType: 'PART_5', testName: 'ETS 2024 Test 04', totalQuestions: 30, correctAnswers: 27, actualSeconds: 650 },
      { presetId: 'PART_6', presetName: 'Part 6', partType: 'PART_6', totalQuestions: 16, actualSeconds: 320 },
      { presetId: 'POMODORO_WORK', presetName: 'Pomodoro', partType: 'POMODORO', testName: 'Ôn từ vựng', actualSeconds: 1500, finishedNaturally: true },
      { presetId: 'POMODORO_SHORT_BREAK', presetName: 'Nghỉ ngắn', partType: 'POMODORO', actualSeconds: 300, finishedNaturally: true },
      { presetId: 'FULL_READING', presetName: 'Reading', partType: 'FULL_READING', testName: 'ETS 2024 Test 03', totalQuestions: 100, correctAnswers: 80, actualSeconds: 4350 }
    ];
    bundle.pacingRuns = samples.map((run, index) => ({ ...run, id: `history-display-${index}`, date: '2026-10-09', createdAt: `2026-10-09T09:0${5 - index}:00Z`, updatedAt: '2026-10-09T09:05:00Z', plannedMinutes: 25, actualMinutes: run.actualSeconds / 60, phases: [], deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  const history = page.locator('.pacing-history-panel');
  await expect(history.locator('tbody tr')).toHaveCount(5);
  await expect(history.getByText('<1 s', { exact: true })).toBeVisible();
  await expect(history.getByText('<0,1 s/câu', { exact: true })).toBeVisible();
  await expect(history.getByText('0/16', { exact: true })).toBeVisible();
  await expect(history.getByText('27/30', { exact: true })).toBeVisible();
  await expect(history.getByText('Chưa chấm', { exact: true })).toBeVisible();
  await expect(history).not.toContainText('%');
  await history.getByLabel('Tìm đề trong lịch sử').fill('ETS 2024 Test 03');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history.getByText('80/100', { exact: true })).toBeVisible();
  await history.getByLabel('Tìm đề trong lịch sử').fill('');
  await history.getByLabel('Lọc chế độ lịch sử').selectOption('POMODORO');
  await expect(history.locator('tbody tr')).toHaveCount(2);
  await history.getByLabel('Lọc chế độ lịch sử').selectOption('ALL');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const fits = await history.locator('.pacing-history-value').evaluateAll(elements => elements.every(element => {
      const value = element.getBoundingClientRect(), cell = element.closest('td')!.getBoundingClientRect();
      return value.left >= cell.left - 1 && value.right <= cell.right + 1;
    }));
    expect(fits).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('pacing-history-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('pacing-history-mobile.png'), fullPage: true });
  await switchToDarkOnMobile(page);
  await page.clock.runFor(250);
  await expect.poll(() => page.locator('#root > div').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(7, 12, 22)');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('pacing-history-dark.png'), fullPage: true });
});

test('statistics keeps stable run labels, missing grades and unclipped latest values', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const speeds = [32, 30, 29, 28, 27, 26], grades = [10, 11, undefined, 12, 14, 15];
    bundle.pacingRuns = speeds.map((speed, index) => ({ id: `stats-readable-${index}`, presetId: 'PART_6', presetName: 'Part 6', partType: 'PART_6', testName: index === 0 || index === 5 ? 'ETS 2024 Test 01' : `Reading ${index + 1}`, date: '2026-10-09', createdAt: `2026-10-09T09:0${index}:00Z`, updatedAt: '2026-10-09T09:05:00Z', deletedAt: null, plannedMinutes: 8, actualMinutes: speed * 16 / 60, actualSeconds: speed * 16, totalQuestions: 16, correctAnswers: grades[index], phases: [], finishedNaturally: false }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  await page.getByLabel('Chế độ thống kê').selectOption('PART_6');
  await showMetric(page, 'Độ chính xác');
  await expect(page.getByText('5/6 lượt đã chấm', { exact: true })).toBeVisible();
  await expect(page.locator('.recharts-xAxis').first()).toContainText('Lượt 6');
  await expect(page.locator('.recharts-line-dot')).toHaveCount(5);
  await showMetric(page, 'Thời gian mỗi câu');
  await page.locator('.recharts-bar-rectangle').nth(2).hover();
  await expect(page.locator('.pacing-chart-tooltip')).toContainText('Lượt 3 · 09/10/2026');
  await expect(page.locator('.pacing-chart-tooltip')).toContainText('Chưa chấm');
  await page.mouse.move(0, 0);
  await page.getByLabel('Phạm vi thống kê').selectOption('LAST_7_DAYS');
  await showMetric(page, 'Độ chính xác');
  await expect(page.getByText('5/6 lượt đã chấm', { exact: true })).toBeVisible();
  await showMetric(page, 'Thời gian mỗi câu');
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(6);
  await expect(page.locator('.pacing-point-label[data-kind="speed"]')).toHaveCount(1);
  await expect(page.locator('.recharts-xAxis').first()).toContainText('Lượt 6');
  await page.getByLabel('Phạm vi thống kê').selectOption('LAST_3_DAYS');
  await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(6);
  await expect(page.locator('.recharts-xAxis').first()).toContainText('Lượt 6');
  await page.getByLabel('Phạm vi thống kê').selectOption('TODAY');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await showMetric(page, 'Thời gian mỗi câu');
    await expect(page.locator('.pacing-point-label[data-kind="speed"]')).toHaveCount(1);
    await expect.poll(() => page.locator('.pacing-point-label').evaluateAll(elements => elements.every(element => {
      const label = element.getBoundingClientRect(), svg = element.closest('svg')!.getBoundingClientRect();
      return label.left >= svg.left && label.right <= svg.right && label.top >= svg.top && label.bottom <= svg.bottom;
    }))).toBe(true);
    const speedTicks = await page.locator('.recharts-xAxis').evaluate(axis => {
      const svg = axis.closest('svg')!.getBoundingClientRect();
      return [...axis.querySelectorAll('.recharts-cartesian-axis-tick text')].map(tick => {
        const bounds = tick.getBoundingClientRect();
        return { label: tick.textContent, center: bounds.x + bounds.width / 2 - svg.x };
      });
    });
    await showMetric(page, 'Độ chính xác');
    await expect(page.locator('.pacing-chart')).toHaveCount(1);
    await expect(page.locator('.recharts-yAxis')).toHaveCount(1);
    await expect(page.locator('.pacing-point-label[data-kind="accuracy"]')).toHaveCount(1);
    await expect.poll(() => page.locator('.recharts-xAxis').evaluate((axis, speedTicks) => {
      const svg = axis.closest('svg')!.getBoundingClientRect();
      const ticks = [...axis.querySelectorAll('.recharts-cartesian-axis-tick text')];
      return ticks.length === speedTicks.length && ticks.every((tick, index) => {
        const bounds = tick.getBoundingClientRect();
        return tick.textContent === speedTicks[index].label && Math.abs(bounds.x + bounds.width / 2 - svg.x - speedTicks[index].center) < 1;
      });
    }, speedTicks)).toBe(true);
    await expect.poll(() => page.locator('.pacing-point-label').evaluateAll(elements => elements.every(element => {
      const label = element.getBoundingClientRect(), svg = element.closest('svg')!.getBoundingClientRect();
      return label.left >= svg.left && label.right <= svg.right && label.top >= svg.top && label.bottom <= svg.bottom;
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.pacingRuns = [{ ...bundle.pacingRuns[0], actualSeconds: .48, actualMinutes: .48 / 60, correctAnswers: 0 }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  await page.getByLabel('Chế độ thống kê').selectOption('PART_6');
  await expect(page.locator('.pacing-point-label[data-kind="speed"]')).toHaveText('<0,1');
  await expect(page.getByText('Chưa đủ lượt để theo dõi xu hướng.', { exact: true })).toBeVisible();
  await showMetric(page, 'Độ chính xác');
  await expect(page.locator('.pacing-point-label[data-kind="accuracy"]')).toHaveText('0%');
});

test('statistics speed axis follows the filtered data and stays stable across pages', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.pacingRuns = Array.from({ length: 12 }, (_, index) => ({
      id: `auto-axis-${index}`, presetId: 'PART_5', presetName: 'Part 5', partType: 'PART_5',
      date: index < 2 ? '2026-10-08' : '2026-10-09', createdAt: `2026-10-09T08:00:${String(index).padStart(2, '0')}Z`,
      plannedMinutes: 12, actualMinutes: (index === 1 ? 32 : index === 11 ? 7.9 : 2) / 2,
      actualSeconds: (index === 1 ? 32 : index === 11 ? 7.9 : 2) * 30,
      totalQuestions: 30, correctAnswers: 15, finishedNaturally: false, phases: [], deletedAt: null
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Thống kê', exact: true }).click();
  const speed = page.locator('.pacing-chart[data-metric="speed"]');
  const axis = speed.locator('.recharts-yAxis text');
  await expect(axis).toHaveText(['0', '2', '4', '6', '8', '10']);
  await expect(speed.getByText('Mục tiêu ≤24 s/câu', { exact: true })).toBeVisible();
  await expect(speed.locator('.recharts-reference-line')).toHaveCount(0);
  await page.getByLabel('Phạm vi thống kê').selectOption('LAST_7_DAYS');
  await expect(axis).toHaveText(['0', '10', '20', '30', '40']);
  await expect(speed.locator('.recharts-reference-line')).toHaveCount(1);
  await page.getByRole('navigation', { name: 'Trang biểu đồ' }).getByRole('button', { name: 'Trước', exact: true }).click();
  await expect(axis).toHaveText(['0', '10', '20', '30', '40']);
  await page.getByLabel('Phạm vi thống kê').selectOption('TODAY');
  await expect(axis).toHaveText(['0', '2', '4', '6', '8', '10']);
  await expect(speed.locator('.recharts-bar-rectangle')).toHaveCount(10);
  await expect(speed.locator('.recharts-reference-line')).toHaveCount(0);
});
