import { expect, test, type Page } from '@playwright/test';
import { mockWrongDetailAI, noisyPng, openFromNotebook, screenshot, seedTests, TEST, WRONG } from './helpers/wrongDetail';

type Call = { questions: number[]; images: number; context: number; batch: string; types: string[]; slices: number[][] };
const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []) as Promise<Call[]>;

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWrongDetailAI(page);
  await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
  return openFromNotebook(page);
}

test('three passage groups are read side by side with unified tray and Auto-Advance; a failed one is retried alone', async ({ page }) => {
  const flow = await open(page);
  await page.evaluate(() => { Object.assign(window, { __pageDelay: 3500, __failOnce: 191 }); });
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 7/ }).click();
  const sendGroup = async (name: RegExp, count: number) => {
    await flow.getByRole('button', { name }).click();
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(Array.from({ length: count }, () => screenshot));
    await flow.getByRole('button', { name: 'Gửi Sóc đọc nhóm này', exact: true }).click();
  };
  await sendGroup(/^Nhóm 181–185/, 2);
  await sendGroup(/^Nhóm 186–190/, 4);
  await sendGroup(/^Nhóm 191–195/, 4);
  await sendGroup(/^Nhóm 196–200/, 1);
  // Up to three groups run in parallel; the fourth waits its turn.
  await expect.poll(async () => (await calls(page)).length).toBe(3);
  await expect(flow.getByRole('button', { name: /^Nhóm 186–190/ })).toContainText('Đang đọc…');
  await expect(flow.getByRole('button', { name: /^Nhóm 196–200/ })).toContainText('Chờ đọc…');
  await expect(flow.getByRole('status').filter({ hasText: /Nhóm 196–200 chờ đọc|Đang đọc nhóm 196–200/ })).toBeVisible();
  if (process.env.WD_SHOTS) await page.screenshot({ path: 'design/previews/img/build-wrong-detail-7-groups-progress-desktop.png' });

  // 186–190 finishes while the learner looks at 196–200: a note, and its row offers the result.
  await expect(flow.getByRole('button', { name: /^Nhóm 186–190/ })).toContainText('Đã đọc 2 câu · Xem', { timeout: 10000 });
  await expect(flow.getByRole('button', { name: /^Nhóm 191–195/ })).toContainText('Chưa đọc được · Thử lại', { timeout: 10000 });
  const sent = await calls(page);
  expect(sent.map(call => [call.questions, call.images, call.context])).toEqual(expect.arrayContaining([
    [[186, 187, 188, 189, 190], 4, 0], [[191, 192, 193, 194, 195], 4, 0]]));
  // The whole sitting is one AI use: one batch id.
  expect(new Set(sent.map(call => call.batch)).size).toBe(1);

  await flow.getByRole('button', { name: /^Nhóm 191–195/ }).click();
  await expect(flow.getByRole('alert')).toContainText('Máy chủ đang bận.');
  await flow.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(flow.getByRole('heading', { name: /^Sóc đọc được 3 câu/ })).toBeVisible({ timeout: 10000 });
  await expect(flow.getByText(/Câu 192.*bạn làm đúng/)).toBeVisible();
  await flow.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await flow.getByRole('button', { name: /^Nhóm 186–190/ }).click();
  await flow.getByRole('button', { name: 'Xem và lưu', exact: true }).click();
  await expect(flow.getByRole('group', { name: /^Câu 186:/ })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await expect(flow.getByRole('img', { name: 'Đã ghi 2 trên 43 câu', exact: true })).toBeVisible();
  // One batch takes 4 readings (backend AI_BATCH_MAX_REQUESTS); the retry is the 5th, so it starts a second batch.
  const all = await calls(page);
  expect(all).toHaveLength(5);
  expect(new Set(all.slice(0, 4).map(call => call.batch)).size).toBe(1);
  expect(all[4].batch).not.toBe(all[0].batch);
});

test('Part 7 allows editing group range (e.g. 149–151), Auto-Advance, and optional PhotoReview', async ({ page }) => {
  const flow = await open(page);
  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 7/ }).click();
  // Edit first group 149–150 -> 149–151.
  await flow.getByRole('button', { name: '✎ Đổi dải câu', exact: true }).click();
  await flow.getByLabel('Từ câu', { exact: true }).fill('149');
  await flow.getByLabel('Đến câu', { exact: true }).fill('151');
  await flow.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(flow.getByRole('button', { name: /^Nhóm 149–151/ })).toHaveAttribute('aria-pressed', 'true');

  // Attach photo, open optional PhotoReview to enable paper mode without altering original pixels, then Auto-Advance.
  await flow.getByRole('button', { name: /^Nhóm 186–190/ }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Chỉnh ảnh câu hỏi 1', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Chỉnh và cắt ảnh', exact: true });
  await expect(review).toBeVisible();
  await review.getByRole('checkbox').check();
  await review.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(flow.getByRole('button', { name: /Ảnh chụp giấy/ })).toHaveAttribute('aria-pressed', 'true');

  await flow.getByRole('button', { name: /Gửi & qua nhóm tiếp/ }).click();
  // Auto-Advanced immediately to the next unread group while 186–190 finishes in background.
  await expect(flow.getByRole('button', { name: /^Nhóm 191–195/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByRole('button', { name: /Soát & Lưu tất cả \(2\)/ }).first()).toBeVisible({ timeout: 5000 });
});

test('screenshots too heavy for one request are made smaller on the device, and the learner is told', async ({ page }) => {
  const flow = await open(page);
  await flow.getByRole('button', { name: /^Part 5 · Điền câu/ }).click();
  // Three ~3 MB PNGs: 9 MB is over the 8 MB a request takes.
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([noisyPng(1000), noisyPng(1000), noisyPng(1000)]);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 3 ảnh', exact: true }).click();
  await expect(flow.getByRole('heading', { name: /^Sóc đọc được/ })).toBeVisible({ timeout: 20000 });
  await expect(flow.getByText('Ảnh nặng nên Sóc đã thu nhỏ hoặc cắt ảnh trên máy trước khi gửi.')).toBeVisible();
  if (process.env.WD_SHOTS) await page.screenshot({ path: 'design/previews/img/build-wrong-detail-8-compressed-note-desktop.png' });
  const [call] = await calls(page);
  expect(call.images).toBe(3);
  expect(call.types).toEqual(['image/jpeg', 'image/jpeg', 'image/jpeg']);
});

test('the Listening Parts can be set aside and taken back', async ({ page }) => {
  const flow = await open(page);
  await expect(flow.getByRole('img', { name: 'Đã ghi 0 trên 43 câu', exact: true })).toBeVisible();
  // Listening asks only the reason: no capture on its cards.
  await expect(flow.getByRole('button', { name: /^Part 3 · Hội thoại/ })).toContainText('Chọn lý do');
  await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
  await expect(flow.getByRole('img', { name: 'Đã ghi 0 trên 30 câu', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Part 1 · Tranh/ })).toHaveCount(0);
  await expect(flow.getByText(/Phần Nghe đã bỏ qua \(13 câu\)/)).toBeVisible();
  await page.reload();
  const again = await openFromNotebook(page);
  await expect(again.getByRole('img', { name: 'Đã ghi 0 trên 30 câu', exact: true })).toBeVisible();
  await again.getByRole('button', { name: 'Ghi lại phần Nghe', exact: true }).click();
  await expect(again.getByRole('img', { name: 'Đã ghi 0 trên 43 câu', exact: true })).toBeVisible();
});
