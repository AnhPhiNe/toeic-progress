import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockWrongDetailAI, noisyPng, openFromNotebook, screenshot, seedTests, TEST, WRONG, captureMore } from './helpers/wrongDetail';

type Call = { questions: number[]; images: number; context: number; batch: string; types: string[]; slices: number[][] };
const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []) as Promise<Call[]>;

/** Opens Gỡ câu sai on the capture step (Listening set aside). */
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  const flow = await openFromNotebook(page);
  await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
  return flow;
}
const item = (flow: Locator, name: string) => flow.getByRole('button', { name, exact: true });

test('passage groups are sent one after another and read side by side; a failed one is retried alone', async ({ page }) => {
  const flow = await open(page);
  await page.evaluate(() => { Object.assign(window, { __pageDelay: 3500, __failOnce: 191 }); });
  await item(flow, 'Nhóm 181–185').click();
  const sendGroup = async (count: number, next: RegExp) => {
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(Array.from({ length: count }, () => screenshot));
    await flow.getByRole('button', { name: next }).click();
  };
  await sendGroup(2, /^Gửi Sóc đọc · Nhóm tiếp/);
  await sendGroup(4, /^Gửi Sóc đọc · Nhóm tiếp/);
  await sendGroup(4, /^Gửi Sóc đọc · Nhóm tiếp/);
  await sendGroup(1, /^Gửi Sóc đọc · Nhóm cuối/);
  // Up to three groups run in parallel; the fourth waits its turn.
  await expect.poll(async () => (await calls(page)).length).toBe(3);
  await expect(item(flow, 'Nhóm 186–190, Sóc đang đọc')).toBeVisible();
  await expect(item(flow, 'Nhóm 196–200, Sóc đang đọc')).toBeVisible();
  if (process.env.WD_SHOTS) await page.screenshot({ path: 'design/previews/img/build-wrong-detail-7-groups-progress-desktop.png' });

  await expect(item(flow, 'Nhóm 191–195, chưa đọc được')).toBeVisible({ timeout: 10000 });
  const sent = await calls(page);
  expect(sent.map(call => [call.questions, call.images, call.context])).toEqual(expect.arrayContaining([
    [[186, 187, 188, 189, 190], 4, 0], [[191, 192, 193, 194, 195], 4, 0]]));
  // The whole sitting is one AI use: one batch id.
  expect(new Set(sent.map(call => call.batch)).size).toBe(1);

  // Once everything is back, Soát opens with what was read; the failed group waits on the capture screen.
  await expect(flow.getByRole('button', { name: 'Lưu tất cả (2)', exact: true })).toBeVisible({ timeout: 10000 });
  await flow.getByRole('button', { name: 'Chụp thêm', exact: true }).click();
  await flow.getByRole('button', { name: '191–195 · Thử lại', exact: true }).click();
  await expect(item(flow, 'Nhóm 191–195, xong')).toBeVisible({ timeout: 10000 });
  await flow.getByRole('button', { name: /^Soát 4 câu/ }).click();
  await expect(flow.getByText('Câu 190, 192: bạn làm đúng, Sóc bỏ qua.')).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Mở câu 186', exact: true })).toBeVisible();
  // 194: Sóc solved the missing answer and it matches the learner's choice, so it is shown but not saved.
  await expect(flow.getByRole('button', { name: 'Mở câu 194', exact: true })).toContainText('làm đúng');
  await flow.getByRole('button', { name: 'Lưu tất cả (3)', exact: true }).click();
  await expect(flow.getByText('Đã lưu 3 thẻ vào Sổ tay')).toBeVisible();
  // One batch takes 4 readings (backend AI_BATCH_MAX_REQUESTS); the retry is the 5th, so it starts a second batch.
  const all = await calls(page);
  expect(all).toHaveLength(5);
  expect(new Set(all.slice(0, 4).map(call => call.batch)).size).toBe(1);
  expect(all[4].batch).not.toBe(all[0].batch);
});

test('a Part 7 group range can be edited (149–151); photo review turns on paper mode; "Nhóm tiếp" moves on', async ({ page }) => {
  const flow = await open(page);
  await item(flow, 'Nhóm 149–150').click();
  await captureMore(flow, 'Đổi dải câu');
  await flow.getByLabel('Từ câu', { exact: true }).fill('149');
  await flow.getByLabel('Đến câu', { exact: true }).fill('151');
  await flow.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(item(flow, 'Nhóm 149–151')).toHaveAttribute('aria-current', 'step');

  await item(flow, 'Nhóm 186–190').click();
  await flow.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Chỉnh ảnh đoạn văn 1', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Chỉnh và cắt ảnh', exact: true });
  await expect(review).toBeVisible();
  await review.getByRole('checkbox').check();
  await review.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(flow.getByRole('button', { name: /^Ảnh giấy/ })).toHaveAttribute('aria-pressed', 'true');
  // Passage photos alone cannot be sent: the primary waits for the question photos.
  await expect(flow.getByRole('button', { name: /^Gửi Sóc đọc/ })).toBeDisabled();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);

  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm tiếp/ }).click();
  await expect(flow.getByRole('heading', { name: /^Nhóm 191–195/ })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Soát 2 câu', exact: true })).toBeVisible({ timeout: 5000 });
});

test('screenshots too heavy for one request are made smaller on the device, and the learner is told', async ({ page }) => {
  const flow = await open(page);
  // Three ~3 MB PNGs: 9 MB is over the 8 MB a request takes.
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([noisyPng(1000), noisyPng(1000), noisyPng(1000)]);
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Tấm tiếp/ }).click();
  await flow.getByRole('button', { name: /^Soát 2 câu/ }).click({ timeout: 20000 });
  await expect(flow.getByText('Ảnh nặng nên Sóc đã thu nhỏ hoặc cắt ảnh trên máy trước khi gửi.')).toBeVisible();
  if (process.env.WD_SHOTS) await page.screenshot({ path: 'design/previews/img/build-wrong-detail-8-compressed-note-desktop.png' });
  const [call] = await calls(page);
  expect(call.images).toBe(3);
  expect(call.types).toEqual(['image/jpeg', 'image/jpeg', 'image/jpeg']);
  // A Part 5 shot looks for every open Part 5 number.
  expect(call.questions).toEqual([103, 112, 118, 124, 129]);
});

test('the Listening step can be set aside and taken back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  const flow = await openFromNotebook(page);
  await expect(flow.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Gán cho 13 câu', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await page.reload();
  const again = await openFromNotebook(page);
  await expect(again.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await again.getByRole('button', { name: 'Phần Nghe còn 13 câu · Ghi lý do', exact: true }).click();
  await expect(again.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
});

test('Part 7 has two zones: pastes go to the active zone, ① is sent as the passage, and the zone is remembered', async ({ page }) => {
  const flow = await open(page);
  await item(flow, 'Nhóm 186–190').click();
  const passage = flow.locator('.cz[data-zone="passage"]'), questions = flow.locator('.cz[data-zone="questions"]');
  await expect(passage).toHaveAttribute('data-active', 'true');
  const bytes = [...readFileSync(screenshot)];
  const paste = (count: number) => page.evaluate(({ data, count }) => {
    const dt = new DataTransfer();
    for (let i = 0; i < count; i++) dt.items.add(new File([new Uint8Array(data)], `shot-${i}.png`, { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { data: bytes, count });
  await paste(3);
  await expect(passage.getByRole('img')).toHaveCount(3);
  await page.keyboard.press('2');
  await expect(questions).toHaveAttribute('data-active', 'true');
  await expect(passage).not.toHaveAttribute('data-active', 'true');
  await paste(1);
  await expect(passage.getByRole('img')).toHaveCount(3);
  await expect(questions.getByRole('img')).toHaveCount(1);
  // The explicit control is the only way an image changes zone.
  await questions.getByRole('button', { name: 'Chuyển ảnh câu hỏi 1 sang ô ①', exact: true }).click();
  await expect(passage.getByRole('img')).toHaveCount(4);
  await passage.getByRole('button', { name: 'Chuyển ảnh đoạn văn 4 sang ô ②', exact: true }).click();
  await expect(questions.getByRole('img')).toHaveCount(1);
  await expect(questions).toHaveAttribute('data-active', 'true');
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm tiếp/ }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  const [call] = await calls(page);
  expect([call.questions, call.context, call.images]).toEqual([[186, 187, 188, 189, 190], 3, 1]);
  // The next group opens on the zone the learner used last, also after reopening.
  await expect(questions).toHaveAttribute('data-active', 'true');
  await page.reload();
  const again = await openFromNotebook(page);
  await item(again, 'Nhóm 196–200').click();
  await expect(again.locator('.cz[data-zone="questions"]')).toHaveAttribute('data-active', 'true');
});

test('Part 6 has one tray: the whole group is sent together in one request', async ({ page }) => {
  const flow = await open(page);
  await item(flow, 'Nhóm 131–134').click();
  await expect(flow.locator('.cz[data-zone="passage"]')).toHaveCount(0);
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot, screenshot]);
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm tiếp/ }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  const [call] = await calls(page);
  expect(call.images + call.context).toBe(3);
});
