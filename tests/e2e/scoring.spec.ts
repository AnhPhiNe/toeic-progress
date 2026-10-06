import { test, expect, type Page } from '@playwright/test';

test.setTimeout(60_000);

async function openLogger(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Khám phá Dashboard ngay' }).click();
  await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N' }).click();
  return page.getByRole('dialog', { name: 'Ghi Nhận Kết Quả Buổi Học' });
}

async function savedSession(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions[0]);
}

test('manual section scores override the estimate and survive reload and editing', async ({ page }) => {
  let dialog = await openLogger(page);
  await dialog.getByLabel('Tên Đề Thi / Nguồn').fill('Manual sections');
  for (const [index, count] of [5, 20, 35, 27, 25, 12, 33].entries()) await dialog.getByLabel(`Số câu đúng Part ${index + 1}`, { exact: true }).fill(String(count));
  await expect(dialog.getByText('Ước tính tham khảo', { exact: true })).toBeVisible();
  await expect(dialog.getByText('855', { exact: true })).toBeVisible();
  await dialog.getByLabel('Nhập điểm từ kết quả đề (tùy chọn)').check();
  await dialog.getByLabel('Điểm Listening /495').fill('445');
  await dialog.getByLabel('Điểm Reading /495').fill('350');
  await expect(dialog.getByText('795', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Lưu & Giữ Streak' }).click();
  await expect(dialog).not.toBeVisible();
  const original = await savedSession(page);
  expect(original).toMatchObject({ totalScore: 795, scaledListening: 445, scaledReading: 350, rawListening: 87, rawReading: 70, scoreSource: 'MANUAL_SECTIONS' });
  await page.goto('/lich-su', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sửa bản ghi Manual sections' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Điểm Listening /495')).toHaveValue('445');
  await expect(dialog.getByLabel('Điểm Reading /495')).toHaveValue('350');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({ id: original.id, createdAt: original.createdAt, totalScore: 795, scoreSource: 'MANUAL_SECTIONS' });
});

test('total-only entry validates limits and can later add or remove section scores', async ({ page }) => {
  let dialog = await openLogger(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await dialog.getByLabel('Tên Đề Thi / Nguồn').fill('Manual total');
  await dialog.getByLabel('Nhập điểm từ kết quả đề (tùy chọn)').check();
  await dialog.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await expect(dialog.getByLabel('Số câu đúng Part 1', { exact: true })).not.toBeVisible();
  const total = dialog.getByLabel('Tổng điểm TOEIC /990');
  await total.fill('995');
  await dialog.getByRole('button', { name: 'Lưu & Giữ Streak' }).click();
  await expect(dialog).toBeVisible();
  expect(await total.evaluate(input => (input as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await total.fill('800');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole('button', { name: 'Lưu & Giữ Streak' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({ totalScore: 800, scoreSource: 'MANUAL_TOTAL' });
  for (const field of ['scaledListening', 'scaledReading', 'partScores', 'rawListening', 'rawReading']) expect(await savedSession(page)).not.toHaveProperty(field);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.')).toBeVisible();
  await page.goto('/lich-su', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Sửa bản ghi Manual total' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('800');
  await dialog.getByRole('button', { name: 'Listening + Reading', exact: true }).click();
  await dialog.getByLabel('Điểm Listening /495').fill('450');
  await dialog.getByLabel('Điểm Reading /495').fill('350');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({ scaledListening: 450, scaledReading: 350, totalScore: 800 });
  await page.getByRole('button', { name: 'Sửa bản ghi Manual total' }).click();
  await dialog.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await dialog.getByLabel('Tổng điểm TOEIC /990').fill('805');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).not.toBeVisible();
  const changed = await savedSession(page);
  expect(changed).toMatchObject({ totalScore: 805, scoreSource: 'MANUAL_TOTAL' });
  expect(changed).not.toHaveProperty('scaledListening');
  expect(changed).not.toHaveProperty('scaledReading');
});
