import { test, expect, type Page } from '@playwright/test';
import { openScoreLogger } from './helpers/nav';
import { openManualEntry } from './helpers/manualEntry';
import { openHistoryEdit, sessionDialog, useOfficialScore, usePartCounts } from './helpers/sessionForm';

test.setTimeout(60_000);

async function openLogger(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openScoreLogger(page);
  const dialog = sessionDialog(page);
  await openManualEntry(page, dialog);
  return dialog;
}

async function savedSession(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions[0]);
}

test('manual section scores override the estimate and survive reload and editing', async ({ page }) => {
  let dialog = await openLogger(page);
  await dialog.getByLabel(/^Tên (đề|Đề Thi \/ Nguồn)$/).fill('Manual sections');
  await usePartCounts(dialog);
  for (const [index, count] of [5, 20, 35, 27, 25, 12, 33].entries()) await dialog.getByLabel(`Số câu đúng Part ${index + 1}`, { exact: true }).fill(String(count));
  await expect(dialog.getByText('Ước tính tham khảo', { exact: true })).toBeVisible();
  await expect(dialog.getByText('690', { exact: true })).toBeVisible();
  await useOfficialScore(dialog);
  await dialog.getByLabel('Điểm Nghe /495').fill('445');
  await dialog.getByLabel('Điểm Đọc /495').fill('350');
  await expect(dialog.getByText('795', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Lưu kết quả' }).click();
  await expect(dialog).not.toBeVisible();
  const original = await savedSession(page);
  expect(original).toMatchObject({ totalScore: 795, scaledListening: 445, scaledReading: 350, rawListening: 87, rawReading: 70, scoreSource: 'MANUAL_SECTIONS' });
  await page.goto('/lich-su', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openHistoryEdit(page, 'Manual sections');
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Điểm Nghe /495')).toHaveValue('445');
  await expect(dialog.getByLabel('Điểm Đọc /495')).toHaveValue('350');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({ id: original.id, createdAt: original.createdAt, totalScore: 795, scoreSource: 'MANUAL_SECTIONS' });
});

test('total-only entry validates limits and can later add or remove section scores', async ({ page }) => {
  // Phones now log a Full Test on the wheel-based PhoneLogger (no total-only mode); the narrowest layout that keeps this form is a 768px tablet.
  await page.setViewportSize({ width: 768, height: 900 });
  let dialog = await openLogger(page);
  await dialog.getByLabel(/^Tên (đề|Đề Thi \/ Nguồn)$/).fill('Manual total');
  await useOfficialScore(dialog);
  await dialog.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await expect(dialog.getByLabel('Số câu đúng Part 1', { exact: true })).not.toBeVisible();
  const total = dialog.getByLabel('Tổng điểm /990');
  await total.fill('995');
  await dialog.getByRole('button', { name: 'Lưu kết quả' }).click();
  await expect(dialog).toBeVisible();
  expect(await total.evaluate(input => (input as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await total.fill('800');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole('button', { name: 'Lưu kết quả' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({ totalScore: 800, scoreSource: 'MANUAL_TOTAL' });
  for (const field of ['scaledListening', 'scaledReading', 'partScores', 'rawListening', 'rawReading']) expect(await savedSession(page)).not.toHaveProperty(field);
  await page.goto('/lich-su', { waitUntil: 'domcontentloaded' });
  // Hành trình's test list shows a total-only result without inventing Listening/Reading scores.
  await page.getByRole('tab', { name: /^Các đề/ }).click();
  await expect(page.getByRole('button', { name: /Manual total/ }).getByText('Nghe — · Đọc —')).toBeVisible();
  await openHistoryEdit(page, 'Manual total');
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Tổng điểm /990')).toHaveValue('800');
  await dialog.getByRole('button', { name: 'Nghe + Đọc', exact: true }).click();
  await dialog.getByLabel('Điểm Nghe /495').fill('450');
  await dialog.getByLabel('Điểm Đọc /495').fill('350');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({ scaledListening: 450, scaledReading: 350, totalScore: 800 });
  await openHistoryEdit(page, 'Manual total');
  await dialog.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await dialog.getByLabel('Tổng điểm /990').fill('805');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).not.toBeVisible();
  const changed = await savedSession(page);
  expect(changed).toMatchObject({ totalScore: 805, scoreSource: 'MANUAL_TOTAL' });
  expect(changed).not.toHaveProperty('scaledListening');
  expect(changed).not.toHaveProperty('scaledReading');
});


test('old estimates retain their version on metadata edits and switch only when raw counts change', async ({ page }) => {
  await page.goto('/lich-su');
  await page.evaluate(() => {
    const bundle=JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions=[{id:'legacy-estimate',skillType:'LR',sessionType:'FULL_TEST',testName:'Legacy estimate',date:'2026-10-09',durationMinutes:120,createdAt:'2026-10-09T09:00:00Z',partScores:{part1:5,part2:20,part3:35,part4:27,part5:25,part6:12,part7:33},rawListening:87,rawReading:70,scaledListening:490,scaledReading:365,totalScore:855,scoreSource:'ESTIMATED',scoreConversionVersion:'legacy-reference-v1'}];
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(bundle));
  });
  await page.reload();
  await openHistoryEdit(page, 'Legacy estimate');
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('855',{exact:true})).toBeVisible();
  await dialog.getByLabel(/^Tên (đề|Đề Thi \/ Nguồn)$/).fill('Legacy renamed');
  await dialog.getByRole('button',{name:'Lưu thay đổi'}).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({totalScore:855,scoreConversionVersion:'legacy-reference-v1'});
  await openHistoryEdit(page, 'Legacy renamed');
  await dialog.getByLabel('Số câu đúng Part 3',{exact:true}).fill('39');
  await expect(dialog.getByText('720',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Lưu thay đổi'}).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({totalScore:720,scoreConversionVersion:'iibc-mock-2023-perfect-v2'});
});


test('a newly saved perfect Full Test receives 495 per section and 990 total', async ({ page }) => {
  const dialog = await openLogger(page);
  await dialog.getByLabel(/^Tên (đề|Đề Thi \/ Nguồn)$/).fill('Perfect estimate');
  await usePartCounts(dialog);
  for (const [index,count] of [6,25,39,30,30,16,54].entries()) await dialog.getByLabel('Số câu đúng Part '+(index+1), {exact:true}).fill(String(count));
  await expect(dialog.getByText('990',{exact:true})).toBeVisible();
  await dialog.getByLabel('Số câu đúng Part 7',{exact:true}).fill('53');
  await expect(dialog.getByText('955',{exact:true})).toBeVisible();
  await dialog.getByLabel('Số câu đúng Part 7',{exact:true}).fill('54');
  await dialog.getByRole('button',{name:'Lưu kết quả'}).click();
  await expect(dialog).not.toBeVisible();
  expect(await savedSession(page)).toMatchObject({rawListening:100,rawReading:100,scaledListening:495,scaledReading:495,totalScore:990,scoreSource:'ESTIMATED',scoreConversionVersion:'iibc-mock-2023-perfect-v2'});
});
