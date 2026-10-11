import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.goto('/ke-hoach');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    data.profile.examDate = '2026-11-22';
    data.weeklyPlans = [{ id: '2026-10-05', weekKey: '2026-10-05', updatedAt: stamp, deletedAt: null, tasks: [{ id: 'full', title: 'Làm 1 đề Full Test', type: 'AUTO_FULL_TEST', target: 1, unit: 'đề', createdAt: stamp, color: 'blue' }, { id: 'time', title: 'Học 210 phút', type: 'AUTO_STUDY_TIME', target: 210, unit: 'phút', createdAt: stamp, color: 'indigo' }] }];
    data.sessions = [{ id: 'test', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS Test 1', totalScore: 800, date: '2026-10-09', durationMinutes: 120, createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
}
async function data(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!)); }

test('the classic plan layout stays, while the recommendation and duplicate exam countdown are removed', async ({ page }, testInfo) => {
  await seed(page);
  await expect(page.getByRole('heading', { name: /Việc Cần Làm Tuần Này/ })).toBeVisible();
  await expect(page.getByText(/^Gợi ý cho tuần này:/)).toHaveCount(0);
  const attendance = page.getByText('Đã học', { exact: true }).locator('..');
  await expect(attendance).toContainText('1 ngày');
  await expect(attendance).not.toContainText('/7');
  await expect(page.getByText('Mục tiêu đã hoàn thành', { exact: true })).toBeVisible();
  await expect(attendance).not.toContainText(/D-\d+/);
  await expect(page.locator('[data-task-id="full"]')).toContainText('Đã xong');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('main *')).filter(node => node.getBoundingClientRect().right > innerWidth).map(node => ({tag:node.tagName, classes:node.className, right:node.getBoundingClientRect().right})).slice(0, 8));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify({ width, overflow })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('plan-classic-cleanup.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await expect(modal.getByLabel('Chỉ tiêu', { exact: false })).toHaveValue('2');
  await expect(modal.getByLabel('Part luyện tập', { exact: true })).toHaveValue('7');
  await expect(modal.getByLabel('Đơn vị', { exact: true })).toHaveValue('bài');
  await expect(modal.getByLabel('Ghi chú', { exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('plan-goal-modal.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await modal.getByText('Màu & ghi chú', { exact: false }).click();
  await expect(modal.getByLabel('Ghi chú', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('plan-goal-modal-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Chuyển sang giao diện Tối', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('plan-goal-modal-dark.png'), fullPage: true, animations: 'disabled' });
});

test('Part targets accept a visible custom quantity, retain colors/notes and survive editing', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByLabel('Tên mục tiêu', { exact: false }).fill('Luyện 3 bài Part 7');
  await modal.getByLabel('Chỉ tiêu', { exact: false }).fill('3');
  await modal.getByText('Màu & ghi chú', { exact: false }).click();
  await modal.getByRole('button', { name: 'Tím Chàm', exact: true }).click();
  await modal.getByLabel('Ghi chú', { exact: true }).fill('Giữ ghi chú này');
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).click();
  await expect(modal).not.toBeVisible();
  let goal = (await data(page)).weeklyPlans[0].tasks.find((task: { title: string }) => task.title === 'Luyện 3 bài Part 7');
  expect(goal).toMatchObject({ type: 'AUTO_PART_PRACTICE', target: 3, partNumber: 7, unit: 'bài', color: 'indigo', notes: 'Giữ ghi chú này' });
  await page.reload();
  const row = page.locator(`[data-task-id="${goal.id}"]`);
  await row.getByTitle('Chỉnh sửa mục tiêu', { exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await expect(edit.getByLabel('Chỉ tiêu', { exact: false })).toHaveValue('3');
  await edit.getByLabel('Chỉ tiêu', { exact: false }).fill('4');
  await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  goal = (await data(page)).weeklyPlans[0].tasks.find((task: { id: string }) => task.id === goal.id);
  expect(goal).toMatchObject({ target: 4, color: 'indigo', notes: 'Giữ ghi chú này' });
  await row.getByRole('button', { name: 'Ghi kết quả', exact: true }).click();
  const logger = page.getByRole('dialog', { name: 'Ghi Nhận Kết Quả Buổi Học', exact: true });
  await expect(logger.locator('select').filter({ has: page.getByRole('option', { name: 'Part 7', exact: true }) }).first()).toHaveValue('7');
});

test('failed save keeps the draft, keyboard focus stays in the modal, and stale editing cannot overwrite a week', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByLabel('Tên mục tiêu', { exact: false }).fill('Giữ bản nháp');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'toeic_progress_bundle_v3') throw new DOMException('quota', 'QuotaExceededError'); original.call(this, key, value); };
  });
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByLabel('Tên mục tiêu', { exact: false })).toHaveValue('Giữ bản nháp');
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Đóng mục tiêu', exact: true })).toBeFocused();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await page.reload();
  await page.locator('[data-task-id="time"]').getByTitle('Chỉnh sửa mục tiêu', { exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await edit.getByLabel('Tên mục tiêu', { exact: false }).fill('Stale');
  await page.evaluate(() => { const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); bundle.weeklyPlans[0].tasks[1].title = 'Edited elsewhere'; localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle)); });
  await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('đã được sửa ở nơi khác');
  expect((await data(page)).weeklyPlans[0].tasks[1].title).toBe('Edited elsewhere');
});

test('automatic completion, week copying and deletion persist without changing the previous week', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByLabel('Tên mục tiêu', { exact: false }).fill('Làm 2 đề Full Test');
  await modal.getByLabel('Chỉ tiêu', { exact: false }).fill('0');
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).click();
  await expect(modal).toBeVisible();
  expect((await data(page)).weeklyPlans[0].tasks).toHaveLength(2);
  await modal.getByLabel('Chỉ tiêu', { exact: false }).fill('2');
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).click();
  const original = (await data(page)).weeklyPlans[0].tasks.find((task: { title: string }) => task.title === 'Làm 2 đề Full Test');
  const row = page.locator(`[data-task-id="${original.id}"]`);
  await expect(row).toContainText('1/2');
  await expect(row.getByRole('button', { name: /đánh dấu/i })).toHaveCount(0);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions.push({ ...bundle.sessions[0], id: 'test-2' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.locator(`[data-task-id="${original.id}"]`)).toContainText('Đã xong');
  await page.getByTitle('Tuần sau', { exact: true }).click();
  await page.getByRole('button', { name: /Sao chép tuần trước/ }).click();
  const bundle = await data(page);
  const previous = bundle.weeklyPlans.find((week: { weekKey: string }) => week.weekKey === '2026-10-05');
  const next = bundle.weeklyPlans.find((week: { weekKey: string }) => week.weekKey === '2026-10-12');
  const copy = next.tasks.find((task: { title: string }) => task.title === 'Làm 2 đề Full Test');
  expect(previous.tasks.find((task: { id: string }) => task.id === original.id).target).toBe(2);
  expect(copy).toMatchObject({ isCompleted: false, manualDone: 0, target: 2 });
  expect(copy.id).not.toBe(original.id);
  await page.locator(`[data-task-id="${copy.id}"]`).getByTitle('Xóa mục tiêu', { exact: true }).click();
  await page.reload();
  await expect(page.locator(`[data-task-id="${copy.id}"]`)).toHaveCount(0);
  expect((await data(page)).weeklyPlans.find((week: { weekKey: string }) => week.weekKey === '2026-10-05').tasks).toHaveLength(3);
});


test('legacy manual goals are preserved and can convert to automatic tracking; cards have no shadow', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks[1].isCompleted = true;
    bundle.weeklyPlans[0].tasks.push({ id: 'legacy', title: 'Ôn lỗi cũ', type: 'CUSTOM', target: 1, unit: 'lần', isCompleted: true, manualDone: 1, color: 'rose', notes: 'Giữ nội dung', createdAt: '2026-10-09T09:00:00Z' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.locator('[data-task-id="time"]')).toContainText('120/210');
  await expect(page.locator('[data-task-id="time"]')).not.toContainText('Đã xong');
  await expect(page.locator('[data-task-id="legacy"]')).toContainText('Đã xong');
  for (const row of await page.locator('[data-task-id]').all()) {
    expect(await row.evaluate(node => getComputedStyle(node).boxShadow)).toBe('none');
    await expect(row.getByRole('button', { name: /đánh dấu/i })).toHaveCount(0);
  }
  const panel = page.getByRole('heading', { name: /Việc Cần Làm Tuần Này/ }).locator('..').locator('..').locator('..');
  expect(await panel.evaluate(node => getComputedStyle(node).boxShadow)).not.toBe('none');
  await page.locator('[data-completed-goals] > summary').click();
  await page.locator('[data-task-id="legacy"]').getByTitle('Chỉnh sửa mục tiêu', { exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await expect(modal.getByRole('option', { name: 'Đánh dấu thủ công', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Chọn cách theo dõi tự động');
  await modal.getByLabel('Theo dõi', { exact: true }).selectOption('AUTO_PART_PRACTICE');
  await modal.getByLabel('Part luyện tập', { exact: true }).selectOption('7');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const goal = (await data(page)).weeklyPlans[0].tasks.find((task: { id: string }) => task.id === 'legacy');
  expect(goal).toMatchObject({ type: 'AUTO_PART_PRACTICE', partNumber: 7, target: 2, unit: 'bài', isCompleted: false, manualDone: 0, notes: 'Giữ nội dung' });
  await expect(page.locator('[data-task-id="legacy"]')).toContainText('0/2');
});


test('editing a completed goal cannot exceed six pending tasks and the limit dialog is keyboard accessible', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    bundle.weeklyPlans[0].tasks = [bundle.weeklyPlans[0].tasks[0], ...Array.from({ length: 6 }, (_, index) => ({ id: `part-${index}`, title: `Luyện Part 7: ${index + 1}`, type: 'AUTO_PART_PRACTICE', partNumber: 7, target: index + 1, unit: 'bài', createdAt: stamp }))];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `limit state at ${width}`).toBe(true);
  }
  await page.locator('[data-completed-goals] > summary').click();
  await page.locator('[data-task-id="full"]').getByTitle('Chỉnh sửa mục tiêu', { exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await edit.getByLabel('Chỉ tiêu', { exact: false }).fill('2');
  await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('6 mục tiêu đang làm');
  expect((await data(page)).weeklyPlans[0].tasks[0].target).toBe(1);
  await page.keyboard.press('Escape');
  const add = page.getByRole('button', { name: 'Thêm mục tiêu (6/6)', exact: true });
  await expect(add).toHaveAttribute('aria-haspopup', 'dialog');
  await add.click();
  const limit = page.getByRole('dialog', { name: 'Đã có 6 mục tiêu đang làm', exact: true });
  await expect(limit.getByRole('button', { name: 'Đã hiểu', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(limit.getByRole('button', { name: 'Đã hiểu', exact: true })).toBeFocused();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(limit).not.toBeVisible();
  await expect(add).toBeFocused();
});

test('time summary follows the edited target and motion turns off immediately with reduced motion', async ({ page }) => {
  await seed(page);
  await page.locator('[data-task-id="time"]').getByTitle('Chỉnh sửa mục tiêu', { exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  expect(await modal.evaluate(node => getComputedStyle(node).animationName)).toBe('plan-modal-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await modal.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await modal.getByLabel('Chỉ tiêu', { exact: false }).fill('480');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu kế hoạch');
  await expect(page.getByText('Thời Lượng Học', { exact: true }).locator('..')).toContainText('/ 480p');
  await expect(page.locator('[data-task-id="time"]')).toContainText('120/480');
  for (const progress of await page.locator('[data-plan-progress]').all()) {
    expect(await progress.evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
  }
  await page.reload();
  await expect(page.getByText('Thời Lượng Học', { exact: true }).locator('..')).toContainText('/ 480p');
});

test('empty and completed plan states fit narrow screens and filters expose their selected state', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks = [];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thiết lập mục tiêu tuần', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thiết lập mục tiêu tuần', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByRole('button', { name: '1 đề Full Test', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).click();
  await expect(page.getByText('Xuất sắc! Bạn đã hoàn thành 100% mục tiêu tuần này!', { exact: true })).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `completed state at ${width}`).toBe(true);
  }
  const pending = page.getByRole('button', { name: 'Cần làm (0)', exact: true });
  await pending.click();
  await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Không có mục tiêu nào phù hợp với bộ lọc đã chọn.', { exact: true })).toBeVisible();
});


test('oversized weekly notes are rejected before any local write and keep the draft', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks.forEach((task: { notes: string }) => { task.notes = 'ấ'.repeat(4000); });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByLabel('Tên mục tiêu', { exact: false }).fill('Giữ nguyên bản nháp');
  await modal.getByText('Màu & ghi chú', { exact: false }).click();
  await modal.getByLabel('Ghi chú', { exact: true }).fill('ấ'.repeat(4000));
  await modal.getByRole('button', { name: 'Lưu mục tiêu', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('quá nhiều nội dung');
  await expect(modal.getByLabel('Tên mục tiêu', { exact: false })).toHaveValue('Giữ nguyên bản nháp');
  expect((await data(page)).weeklyPlans[0].tasks).toHaveLength(2);
});


test('reordering also works by tapping or keyboard and stays inside the pending group', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks.push({ id: 'part', title: 'Luyện Part 7', type: 'AUTO_PART_PRACTICE', partNumber: 7, target: 2, unit: 'bài', createdAt: '2026-10-09T09:00:00Z' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.setViewportSize({ width: 375, height: 812 });
  const order = page.getByRole('button', { name: 'Sắp xếp Luyện Part 7', exact: true });
  await order.click();
  await page.getByRole('button', { name: 'Di chuyển lên', exact: true }).click();
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'part');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'part');
  await order.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'time');
  await expect(page.getByRole('status')).toContainText('Đã đổi thứ tự');
  await expect(page.locator('[data-task-id]').last()).toHaveAttribute('data-task-id', 'full');
});


test('completed goals start collapsed, expand by keyboard, and stay fully visible in the completed tab', async ({ page }) => {
  await seed(page);
  const section = page.locator('[data-completed-goals]');
  const summary = section.locator('summary');
  await expect(summary).toContainText('Đã hoàn thành (1)');
  await expect(page.locator('[data-task-id="full"]')).not.toBeVisible();
  await expect(page.locator('[data-task-id="time"]')).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-task-id="full"]')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-task-id="full"]')).not.toBeVisible();
  await page.getByRole('button', { name: 'Đã xong (1)', exact: true }).click();
  await expect(page.locator('[data-task-id="full"]')).toBeVisible();
  await expect(section).toHaveCount(0);
  await page.getByRole('button', { name: 'Tất cả (2)', exact: true }).click();
  await expect(page.locator('[data-task-id="full"]')).not.toBeVisible();
  await summary.click();
  await page.getByTitle('Tuần sau', { exact: true }).click();
  await page.getByTitle('Tuần trước', { exact: true }).click();
  await expect(page.locator('[data-task-id="full"]')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('[data-task-id="full"]')).not.toBeVisible();
  expect((await data(page)).weeklyPlans[0].tasks).toHaveLength(2);
});
