import { expect, test, type Page } from '@playwright/test';

const title = 'Cài Đặt Mục Tiêu & Kỷ Luật';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
async function open(page: Page) {
  await page.goto('/tu-vung');
  await page.getByRole('button', { name: /^Chưa đặt ngày thi|^Đếm ngược ngày thi/ }).click();
  return page.getByRole('dialog', { name: title, exact: true });
}
async function backup(page: Page) {
  const content = await page.evaluate(() => JSON.stringify({ ...JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!), exportDate: new Date().toISOString() }));
  return { name: 'settings-qa.json', mimeType: 'application/json', buffer: Buffer.from(content) };
}

test('settings fields are labelled, preserve a draft across background activity and merge current profile data', async ({ page }) => {
  const modal = await open(page);
  for (const name of ['Họ & Tên Học Viên', 'Mục Tiêu Điểm Số', 'Ngày Thi Thực Tế', 'Học Tối Thiểu (Phút)', 'Khiên Cứu Chuỗi', 'Châm Ngôn Kỷ Luật Cá Nhân']) {
    await expect(modal.getByLabel(name, { exact: true })).toHaveCount(1);
  }
  await modal.getByLabel('Họ & Tên Học Viên', { exact: true }).fill('Draft learner');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.profile.motto = 'Synced elsewhere';
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    // A background activity update exercises App's current profile props while the modal stays open.
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Lưu từ vựng')!.click();
  });
  await expect(modal.getByLabel('Họ & Tên Học Viên', { exact: true })).toHaveValue('Draft learner');
  await modal.getByRole('button', { name: 'Lưu Cấu Hình', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const bundle = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  expect(bundle.profile.name).toBe('Draft learner');
  expect(bundle.profile.motto).toBe('Synced elsewhere');
  expect(bundle.vocabLog.some((entry: { count: number }) => entry.count > 0)).toBe(true);
  expect(bundle.profile.currentStreak).toBe(1);
});

test('same-field conflicts and storage failures preserve the draft with an error', async ({ page }) => {
  const modal = await open(page);
  await modal.getByLabel('Họ & Tên Học Viên', { exact: true }).fill('My draft');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.profile.name = 'Another device';
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await modal.getByRole('button', { name: 'Lưu Cấu Hình', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('thay đổi ở nơi khác');
  await expect(modal.getByLabel('Họ & Tên Học Viên', { exact: true })).toHaveValue('My draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).profile.name)).toBe('Another device');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Chưa đặt ngày thi|^Đếm ngược ngày thi/ }).click();
  await modal.getByLabel('Họ & Tên Học Viên', { exact: true }).fill('Retry draft');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as typeof window & { restoreSettingsWrites?: () => void }).restoreSettingsWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Test storage quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await modal.getByRole('button', { name: 'Lưu Cấu Hình', exact: true }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByLabel('Họ & Tên Học Viên', { exact: true })).toHaveValue('Retry draft');
  await page.evaluate(() => (window as typeof window & { restoreSettingsWrites?: () => void }).restoreSettingsWrites?.());
  await modal.getByRole('button', { name: 'Lưu Cấu Hình', exact: true }).click();
  await expect(modal).toHaveCount(0);
});

test('backup previews and late file reads cannot survive closing and reopening settings', async ({ page }) => {
  const modal = await open(page), file = await backup(page);
  await modal.locator('input[type="file"]').setInputFiles(file);
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Chưa đặt ngày thi|^Đếm ngược ngày thi/ }).click();
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const Original = window.FileReader;
    window.FileReader = class extends Original {
      override readAsText(file: Blob, encoding?: string) { setTimeout(() => super.readAsText(file, encoding), 300); }
    };
  });
  await modal.locator('input[type="file"]').setInputFiles(file);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Chưa đặt ngày thi|^Đếm ngược ngày thi/ }).click();
  await page.waitForTimeout(550);
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toHaveCount(0);
  await expect(modal.getByText('Không thể khôi phục tệp', { exact: true })).toHaveCount(0);
});

test('an owner switch blocks both a stale profile draft and backup restore before mutation', async ({ page }) => {
  const modal = await open(page);
  await modal.getByLabel('Họ & Tên Học Viên', { exact: true }).fill('Old owner draft');
  await modal.locator('input[type="file"]').setInputFiles(await backup(page));
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toBeVisible();
  const before = await page.evaluate(() => {
    const bundle = localStorage.getItem('toeic_progress_bundle_v3')!;
    localStorage.setItem('toeic_progress_account_audit-new-owner_v3', bundle);
    localStorage.setItem('toeic_active_account_v1', 'audit-new-owner');
    return bundle;
  });
  // No auth or refresh event: the stale controls themselves must guard current storage ownership.
  await modal.getByRole('button', { name: 'Thay thế', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Tài khoản đã thay đổi');
  await modal.getByRole('button', { name: 'Lưu Cấu Hình', exact: true }).click();
  await expect(modal).toBeVisible();
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations += 1; await dialog.dismiss(); });
  await modal.getByRole('button', { name: 'Xóa trắng dữ liệu', exact: true }).click();
  await modal.getByRole('button', { name: 'Nạp dữ liệu mẫu', exact: true }).click();
  expect(confirmations).toBe(0);
  await expect(modal.getByRole('alert')).toContainText('Tài khoản đã thay đổi');
  expect(await page.evaluate(() => localStorage.getItem('toeic_progress_account_audit-new-owner_v3'))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'))).toBe(before);
});

test('urgent exam countdown respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/quy-doi');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const date = new Date(); date.setDate(date.getDate() + 3);
    data.profile.examDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const countdown = page.getByRole('button', { name: /^Đếm ngược ngày thi:/ });
  await expect(countdown).toHaveClass(/animate-pulse/);
  expect(await countdown.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});
