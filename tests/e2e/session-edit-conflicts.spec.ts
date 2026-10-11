import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page, practice = false) {
  await page.goto('/lich-su');
  await page.evaluate(practice => {
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions = [{ id: 'session-conflict', skillType: 'LR', sessionType: practice ? 'PART_PRACTICE' : 'FULL_TEST',
      testName: 'Audit session', date: '2026-10-09', durationMinutes: 120, totalScore: practice ? 0 : 800,
      ...(practice ? { practiceParts: [{ part: 5, correct: 20, total: 30 }] } : { scoreSource: 'MANUAL_TOTAL' }),
      createdAt: '2026-10-09T09:00:00Z', updatedAt: '2026-10-09T09:00:00Z', deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  }, practice);
  await page.reload();
  await page.getByRole('button', { name: 'Sửa bản ghi Audit session', exact: true }).click();
  return page.getByRole('dialog', { name: 'Sửa Buổi Học', exact: true });
}

test('a metadata edit cannot overwrite a score updated while the editor was open', async ({ page }) => {
  const editor = await seed(page);
  await editor.getByLabel('Tên Đề Thi / Nguồn', { exact: true }).fill('Draft name');
  await editor.getByLabel('Ghi Chú Buổi Học', { exact: true }).fill('Draft notes');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    Object.assign(bundle.sessions[0], { totalScore: 900, notes: 'Latest external note', updatedAt: '2026-10-10T09:00:00Z' });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Buổi học đã được sửa ở nơi khác');
  await expect(editor.getByLabel('Tên Đề Thi / Nguồn')).toHaveValue('Draft name');
  await expect(editor.getByLabel('Ghi Chú Buổi Học')).toHaveValue('Draft notes');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions[0])).toMatchObject({ totalScore: 900, notes: 'Latest external note' });
  await expect(editor.getByLabel('Ngày Luyện Đề')).toHaveValue('2026-10-09');
  await expect(editor.getByLabel('Thời Gian Làm (Phút)')).toHaveValue('120');
});

test('a deleted Part practice cannot be restored by an open editor', async ({ page }) => {
  const editor = await seed(page, true);
  await editor.getByLabel('Tên Đề Thi / Nguồn', { exact: true }).fill('Keep my draft');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions[0] = { id: 'session-conflict', updatedAt: '2026-10-10T09:00:00Z', deletedAt: '2026-10-10T09:00:00Z' };
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Buổi học đã bị xóa');
  await expect(editor.getByLabel('Tên Đề Thi / Nguồn')).toHaveValue('Keep my draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions[0].deletedAt)).toBeTruthy();
});

test('a Part practice change made elsewhere stays intact', async ({ page }) => {
  const editor = await seed(page, true);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions[0].practiceParts[0].correct = 25;
    bundle.sessions[0].updatedAt = '2026-10-10T09:00:00Z';
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('được sửa ở nơi khác');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions[0].practiceParts[0].correct)).toBe(25);
});

test('an open guest logger cannot write its draft into a newly active account', async ({ page }) => {
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Nhập kết quả đề thi mới, phím tắt N', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Ghi Nhận Kết Quả Buổi Học', exact: true });
  await editor.getByLabel('Tên Đề Thi / Nguồn', { exact: true }).fill('Guest draft');
  await editor.getByLabel('Nhập điểm từ kết quả đề (tùy chọn)').check();
  await editor.getByRole('button', { name: 'Chỉ tổng điểm', exact: true }).click();
  await editor.getByLabel('Tổng điểm TOEIC /990').fill('800');
  // Replace identity only; exercise the real draft guard and local storage writers.
  await page.evaluate(async () => {
    const path = '/src/shared/data/dataBundle.ts';
    const database = await import(/* @vite-ignore */ path);
    database.writeAccountBundle('audit-other-owner', database.emptyBundle());
    database.activateAccount('audit-other-owner');
    database.setAccountWriteEnabled(true);
  });
  await editor.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Tài khoản đã thay đổi');
  await expect(editor.getByLabel('Tên Đề Thi / Nguồn')).toHaveValue('Guest draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_account_audit-other-owner_v3')!).sessions)).toHaveLength(0);
});
