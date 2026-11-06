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
const tasks = (page: Page) => page.getByRole('region', { name: /^Nhiệm vụ/ });
async function openMenu(page: Page, id: string) {
  await page.locator(`[data-task-id="${id}"]`).getByRole('button', { name: /^Tùy chọn/ }).click();
  return page.getByRole('menu');
}

test('the week shows minutes per day beside six fixed goal slots; done goals sit in their own view', async ({ page }, testInfo) => {
  await seed(page);
  await expect(page.getByRole('heading', { name: 'Kế hoạch tuần', exact: true })).toBeVisible();
  const days = page.getByRole('region', { name: 'Thời gian học mỗi ngày' });
  await expect(days).toContainText('120 / 210 phút tuần này');
  await expect(days.getByText('120p', { exact: true })).toBeVisible();
  // The exam countdown lives in the top bar only.
  await expect(page.getByText(/ngày đến kỳ thi/)).toHaveCount(0);
  await expect(tasks(page).getByRole('heading')).toContainText('1/2 xong');
  await expect(page.locator('[data-task-id="time"]')).toContainText('120/210');
  await expect(page.locator('[data-task-id="full"]')).toHaveCount(0);
  const before = await days.boundingBox();
  await page.getByRole('button', { name: 'Đã xong (1)', exact: true }).click();
  await expect(page.locator('[data-task-id="full"]')).toContainText('Đã xong');
  await expect(page.locator('[data-task-id="time"]')).toHaveCount(0);
  expect((await days.boundingBox())!.height).toBe(before!.height);
  await page.getByRole('button', { name: /^Quay lại việc đang làm/ }).click();
  await expect(page.locator('[data-task-id="time"]')).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `width ${width}`).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('plan-week.png'), fullPage: true, animations: 'disabled' });
});

test('a goal is picked, not typed: kind, Part and quantity name it, and edits keep its colour and notes', async ({ page }) => {
  await seed(page);
  await tasks(page).getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByRole('radio', { name: /Luyện một Part/ }).click();
  await modal.getByRole('radio', { name: 'Part 7', exact: true }).click();
  await expect(modal.getByLabel('Chỉ tiêu')).toHaveValue('2');
  await modal.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(modal.getByText('Luyện 3 bài Part 7', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: '+ Thêm ghi chú', exact: true }).click();
  await modal.getByLabel('Ghi chú', { exact: true }).fill('Giữ ghi chú này');
  await modal.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  await expect(modal).not.toBeVisible();
  let goal = (await data(page)).weeklyPlans[0].tasks.find((task: { title: string }) => task.title === 'Luyện 3 bài Part 7');
  expect(goal).toMatchObject({ type: 'AUTO_PART_PRACTICE', target: 3, partNumber: 7, unit: 'bài', color: 'amber', notes: 'Giữ ghi chú này' });
  await page.reload();
  await (await openMenu(page, goal.id)).getByRole('menuitem', { name: 'Sửa mục tiêu' }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await expect(edit.getByLabel('Chỉ tiêu')).toHaveValue('3');
  await edit.getByLabel('Chỉ tiêu').fill('4');
  await expect(edit.getByText('Luyện 4 bài Part 7', { exact: true })).toBeVisible();
  await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  goal = (await data(page)).weeklyPlans[0].tasks.find((task: { id: string }) => task.id === goal.id);
  expect(goal).toMatchObject({ title: 'Luyện 4 bài Part 7', target: 4, color: 'amber', notes: 'Giữ ghi chú này' });
  await page.locator(`[data-task-id="${goal.id}"]`).getByRole('button', { name: 'Ghi kết quả', exact: true }).click();
  const logger = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await expect(logger.locator('select').filter({ has: page.getByRole('option', { name: 'Part 7', exact: true }) }).first()).toHaveValue('7');
});

test('a renamed goal keeps its own name; a failed save keeps the draft and stale editing cannot overwrite a week', async ({ page }) => {
  await seed(page);
  await tasks(page).getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await modal.getByLabel('Tên mục tiêu').fill('Giữ bản nháp');
  await modal.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(modal.getByLabel('Tên mục tiêu')).toHaveValue('Giữ bản nháp');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'toeic_progress_bundle_v3') throw new DOMException('quota', 'QuotaExceededError'); original.call(this, key, value); };
  });
  await modal.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByLabel('Tên mục tiêu')).toHaveValue('Giữ bản nháp');
  await modal.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Đóng mục tiêu', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await page.reload();
  await (await openMenu(page, 'time')).getByRole('menuitem', { name: 'Sửa mục tiêu' }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await edit.getByLabel('Chỉ tiêu').fill('240');
  await page.evaluate(() => { const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); bundle.weeklyPlans[0].tasks[1].title = 'Edited elsewhere'; localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle)); });
  await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('đã được sửa ở nơi khác');
  expect((await data(page)).weeklyPlans[0].tasks[1].title).toBe('Edited elsewhere');
});

test('automatic completion, week copying and deletion persist without changing the previous week', async ({ page }) => {
  await seed(page);
  await tasks(page).getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByLabel('Chỉ tiêu').fill('0');
  await modal.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  await expect(modal).toBeVisible();
  expect((await data(page)).weeklyPlans[0].tasks).toHaveLength(2);
  await modal.getByLabel('Chỉ tiêu').fill('2');
  await modal.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const original = (await data(page)).weeklyPlans[0].tasks.find((task: { title: string }) => task.title === 'Làm 2 đề Full Test');
  await expect(page.locator(`[data-task-id="${original.id}"]`)).toContainText('1/2');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions.push({ ...bundle.sessions[0], id: 'test-2' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  // The second test also lifts the week past 210 minutes, so all three goals are done.
  await page.getByRole('button', { name: 'Đã xong (3)', exact: true }).click();
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
  page.once('dialog', dialog => dialog.accept());
  await (await openMenu(page, copy.id)).getByRole('menuitem', { name: 'Xóa mục tiêu' }).click();
  await page.reload();
  await expect(page.locator(`[data-task-id="${copy.id}"]`)).toHaveCount(0);
  expect((await data(page)).weeklyPlans.find((week: { weekKey: string }) => week.weekKey === '2026-10-05').tasks).toHaveLength(3);
});

for (const width of [390, 1280]) {
  test(`goal deletion requires confirmation and cancel preserves it at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    const remove = async () => {
      if (width < 768) {
        await page.locator('[data-task-id="time"]').click();
        await page.getByRole('dialog').getByRole('button', { name: 'Xóa', exact: true }).click();
      } else {
        await (await openMenu(page, 'time')).getByRole('menuitem', { name: 'Xóa mục tiêu' }).click();
      }
    };
    page.once('dialog', dialog => dialog.dismiss());
    await remove();
    expect((await data(page)).weeklyPlans[0].tasks.some((task: { id: string }) => task.id === 'time')).toBe(true);
    page.once('dialog', dialog => dialog.accept());
    await remove();
    await page.reload();
    expect((await data(page)).weeklyPlans[0].tasks.some((task: { id: string }) => task.id === 'time')).toBe(false);
    if (width < 768) await expect(page.getByRole('checkbox')).toHaveCount(0);
  });
}

test('a 320px plan keeps the complete pending goal title readable beside its progress', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seed(page);
  const title = 'Học 210 phút tuần này và ôn các câu sai đã ghi';
  await page.evaluate(title => {
    const key = 'toeic_progress_bundle_v3';
    const bundle = JSON.parse(localStorage.getItem(key)!);
    bundle.weeklyPlans[0].tasks.find((task: { id: string }) => task.id === 'time').title = title;
    localStorage.setItem(key, JSON.stringify(bundle));
  }, title);
  await page.reload();
  const row = page.locator('[data-task-id="time"]');
  const heading = row.getByText(title, { exact: true });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await expect(row).toContainText('120/210 phút');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await row.click();
  await expect(page.getByRole('dialog')).toContainText(title);
});

test('legacy manual goals are preserved and can convert to automatic tracking', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks[1].isCompleted = true;
    bundle.weeklyPlans[0].tasks.push({ id: 'legacy', title: 'Ôn lỗi cũ', type: 'CUSTOM', target: 1, unit: 'lần', isCompleted: true, manualDone: 1, color: 'rose', notes: 'Giữ nội dung', createdAt: '2026-10-09T09:00:00Z' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.locator('[data-task-id="time"]')).toContainText('120/210');
  await page.getByRole('button', { name: 'Đã xong (2)', exact: true }).click();
  await expect(page.locator('[data-task-id="legacy"]')).toContainText('Đã xong');
  await (await openMenu(page, 'legacy')).getByRole('menuitem', { name: 'Sửa mục tiêu' }).click();
  const modal = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await expect(modal.getByLabel('Tên mục tiêu')).toHaveValue('Ôn lỗi cũ');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Chọn cách theo dõi tự động');
  await modal.getByRole('radio', { name: /Luyện một Part/ }).click();
  await modal.getByRole('radio', { name: 'Part 7', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const goal = (await data(page)).weeklyPlans[0].tasks.find((task: { id: string }) => task.id === 'legacy');
  expect(goal).toMatchObject({ title: 'Ôn lỗi cũ', type: 'AUTO_PART_PRACTICE', partNumber: 7, target: 2, unit: 'bài', isCompleted: false, manualDone: 0, notes: 'Giữ nội dung' });
  await page.getByRole('button', { name: /^Quay lại việc đang làm/ }).click();
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
  await page.getByRole('button', { name: 'Đã xong (1)', exact: true }).click();
  await (await openMenu(page, 'full')).getByRole('menuitem', { name: 'Sửa mục tiêu' }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  await edit.getByLabel('Chỉ tiêu').fill('2');
  await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('6 mục tiêu đang làm');
  expect((await data(page)).weeklyPlans[0].tasks[0].target).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Quay lại việc đang làm/ }).click();
  const add = page.getByRole('button', { name: 'Thêm mục tiêu (6/6)', exact: true });
  await expect(add).toHaveAttribute('aria-haspopup', 'dialog');
  await add.click();
  const limit = page.getByRole('dialog', { name: 'Đã có 6 mục tiêu đang làm', exact: true });
  await expect(limit.getByRole('button', { name: 'Đã hiểu', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(limit.getByRole('button', { name: 'Đã hiểu', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(limit).not.toBeVisible();
  await expect(add).toBeFocused();
});

test('time summary follows the edited target and motion turns off immediately with reduced motion', async ({ page }) => {
  await seed(page);
  await (await openMenu(page, 'time')).getByRole('menuitem', { name: 'Sửa mục tiêu' }).click();
  const modal = page.getByRole('dialog', { name: 'Sửa mục tiêu', exact: true });
  expect(await modal.evaluate(node => getComputedStyle(node).animationName)).toBe('plan-modal-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await modal.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await modal.getByRole('button', { name: '420', exact: true }).click();
  await modal.getByLabel('Chỉ tiêu').fill('480');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu kế hoạch' })).toContainText('Đã lưu kế hoạch');
  const days = page.getByRole('region', { name: 'Thời gian học mỗi ngày' });
  await expect(days).toContainText('120 / 480 phút tuần này');
  await expect(page.locator('[data-task-id="time"]')).toContainText('120/480');
  for (const progress of await page.locator('[data-plan-progress]').all()) {
    expect(await progress.evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
  }
  await page.reload();
  await expect(days).toContainText('120 / 480 phút tuần này');
});

test('an empty week offers the suggestion and the add slot; adding the suggestion makes it a goal', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks = [];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  const panel = tasks(page);
  await expect(panel.getByText(/^Gợi ý: Làm 1 đề Full Test/)).toBeVisible();
  await panel.getByRole('button', { name: '+ Thêm', exact: true }).click();
  await expect(page.locator('[data-task-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đã xong (1)', exact: true }).click();
  await expect(page.locator('[data-task-id]')).toContainText('Làm 1 đề Full Test');
  expect((await data(page)).weeklyPlans[0].tasks).toHaveLength(1);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `width ${width}`).toBe(true);
  }
});

test('oversized weekly notes are rejected before any local write and keep the draft', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks.forEach((task: { notes: string }) => { task.notes = 'ấ'.repeat(4000); });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await tasks(page).getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Thêm mục tiêu', exact: true });
  await modal.getByRole('button', { name: '+ Thêm ghi chú', exact: true }).click();
  await modal.getByLabel('Ghi chú', { exact: true }).fill('ấ'.repeat(4000));
  await modal.getByRole('button', { name: 'Thêm mục tiêu', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('quá nhiều nội dung');
  await expect(modal.getByRole('textbox', { name: 'Ghi chú' })).toHaveValue('ấ'.repeat(4000));
  expect((await data(page)).weeklyPlans[0].tasks).toHaveLength(2);
});

test('goals reorder from the options menu inside the pending group; phones use "Đưa lên đầu"', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.weeklyPlans[0].tasks.push({ id: 'part', title: 'Luyện Part 7', type: 'AUTO_PART_PRACTICE', partNumber: 7, target: 2, unit: 'bài', createdAt: '2026-10-09T09:00:00Z' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await page.setViewportSize({ width: 1024, height: 812 });
  const menu = await openMenu(page, 'part');
  await expect(menu.getByRole('menuitem', { name: 'Đưa xuống' })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Đưa lên' }).click();
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'part');
  await page.reload();
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'part');
  await (await openMenu(page, 'part')).getByRole('menuitem', { name: 'Đưa xuống' }).click();
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'time');
  await expect(page.getByRole('status').filter({ hasText: 'Đã đổi thứ tự' })).toContainText('Đã đổi thứ tự');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-task-id="part"]').click();
  await page.getByRole('dialog', { name: 'Luyện Part 7', exact: true }).getByRole('button', { name: 'Đưa lên đầu', exact: true }).click();
  await expect(page.locator('[data-task-id]').first()).toHaveAttribute('data-task-id', 'part');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the done view resets when the week changes and the menu closes on an outside click', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Đã xong (1)', exact: true }).click();
  await expect(page.locator('[data-task-id="full"]')).toBeVisible();
  await page.getByTitle('Tuần sau', { exact: true }).click();
  await page.getByTitle('Tuần trước', { exact: true }).click();
  await expect(page.locator('[data-task-id="full"]')).toHaveCount(0);
  await openMenu(page, 'time');
  await page.getByRole('heading', { name: 'Kế hoạch tuần', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});
