import { expect, test, type Page } from '@playwright/test';
import { openSettings } from './helpers/accountGroup';

const title = 'Cài đặt';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
async function open(page: Page) {
  await page.goto('/');
  return openSettings(page);
}
async function backup(page: Page) {
  const content = await page.evaluate(() => JSON.stringify({ ...JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!), exportDate: new Date().toISOString() }));
  return { name: 'settings-qa.json', mimeType: 'application/json', buffer: Buffer.from(content) };
}

test('settings tiles are labelled, a draft survives background activity and each save merges only its own field', async ({ page }) => {
  const modal = await open(page);
  // Every setting is a labelled tile with its own Đổi; the goal's opens the same editor as Hôm nay.
  for (const name of ['Điểm mục tiêu', 'Ngày thi', 'Học mỗi ngày', 'Khiên cứu chuỗi', 'Châm ngôn']) {
    const tile = modal.getByRole('region', { name, exact: true });
    await expect(tile).toHaveCount(1);
    await expect(tile.getByRole('button', { name: /^(Đổi|\+ Đặt ngày thi)/ })).toHaveCount(1);
  }
  await expect(modal.getByRole('button', { name: 'Lưu cài đặt', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await modal.getByLabel('Tên của bạn', { exact: true }).fill('Draft learner');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.profile.motto = 'Synced elsewhere';
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
    // A background profile update (picking a goal on Hôm nay) exercises App's current profile props while the modal stays open.
    [...document.querySelectorAll<HTMLButtonElement>('.td-gc-chip')].find(button => button.textContent?.trim() === '700')!.click();
  });
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveValue('Draft learner');
  // The background goal shows in its tile while the name draft stays.
  await expect(modal.getByRole('region', { name: 'Điểm mục tiêu', exact: true })).toContainText('700');
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveCount(0);
  await expect(modal).toBeVisible();
  const bundle = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  expect(bundle.profile.name).toBe('Draft learner');
  expect(bundle.profile.motto).toBe('Synced elsewhere');
  expect(bundle.profile.targetScore).toBe(700);
  // The motto tile shows the synced motto and saves only the motto.
  const motto = modal.getByRole('region', { name: 'Châm ngôn', exact: true });
  await expect(motto).toContainText('Synced elsewhere');
  await motto.getByRole('button', { name: 'Đổi châm ngôn', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Châm ngôn', exact: true });
  await editor.getByLabel('Châm ngôn', { exact: true }).fill('Mỗi ngày một đề');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(motto).toContainText('Mỗi ngày một đề');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).profile);
  expect(after).toMatchObject({ name: 'Draft learner', motto: 'Mỗi ngày một đề', targetScore: 700 });
});

test('same-field conflicts and storage failures preserve the draft with an error', async ({ page }) => {
  const modal = await open(page);
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await modal.getByLabel('Tên của bạn', { exact: true }).fill('My draft');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.profile.name = 'Another device';
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('thay đổi ở nơi khác');
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveValue('My draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).profile.name)).toBe('Another device');
  // Escape closes the name editor first, then Cài đặt.
  await page.keyboard.press('Escape');
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveCount(0);
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await openSettings(page);
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveValue('Another device');
  await modal.getByLabel('Tên của bạn', { exact: true }).fill('Retry draft');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as typeof window & { restoreSettingsWrites?: () => void }).restoreSettingsWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Test storage quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveValue('Retry draft');
  await page.evaluate(() => (window as typeof window & { restoreSettingsWrites?: () => void }).restoreSettingsWrites?.());
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).profile.name)).toBe('Retry draft');
});

test('backup previews and late file reads cannot survive closing and reopening settings', async ({ page }) => {
  const modal = await open(page), file = await backup(page);
  await modal.locator('input[type="file"]').setInputFiles(file);
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await openSettings(page);
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const Original = window.FileReader;
    window.FileReader = class extends Original {
      override readAsText(file: Blob, encoding?: string) { setTimeout(() => super.readAsText(file, encoding), 300); }
    };
  });
  await modal.locator('input[type="file"]').setInputFiles(file);
  await page.keyboard.press('Escape');
  await openSettings(page);
  await page.waitForTimeout(550);
  await expect(modal.getByText('Xem trước tệp sao lưu v3', { exact: true })).toHaveCount(0);
  await expect(modal.getByText('Không thể khôi phục tệp', { exact: true })).toHaveCount(0);
});

test('an owner switch blocks both a stale profile draft and backup restore before mutation', async ({ page }) => {
  const modal = await open(page);
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await modal.getByLabel('Tên của bạn', { exact: true }).fill('Old owner draft');
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
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal).toBeVisible();
  // The name editor keeps the draft and says why; the dialog says it too.
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveValue('Old owner draft');
  await expect(modal.getByRole('alert').filter({ hasText: 'Tài khoản đã thay đổi' })).toHaveCount(2);
  let nativeDialogs = 0;
  page.on('dialog', async dialog => { nativeDialogs += 1; await dialog.dismiss(); });
  await modal.getByRole('button', { name: 'Xóa toàn bộ dữ liệu', exact: true }).click();
  await modal.getByRole('button', { name: 'Dữ liệu mẫu', exact: true }).click();
  expect(nativeDialogs).toBe(0);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(modal.getByRole('alert').filter({ hasText: 'Tài khoản đã thay đổi' }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('toeic_progress_account_audit-new-owner_v3'))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('toeic_progress_bundle_v3'))).toBe(before);
});
