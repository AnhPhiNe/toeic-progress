import { expect, test, type Page } from '@playwright/test';
import { openSettings } from './helpers/accountGroup';

// Computers: Cài đặt option B. Each tile's Đổi opens a small editor beside it that saves only that field.
const BUNDLE = 'toeic_progress_bundle_v3';
const profile = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).profile, BUNDLE);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.evaluate(async () => { localStorage.clear(); (await import('/src/shared/data/storage.ts' as string)).loadDemoData(); });
  await page.reload();
});

test('each tile editor saves only its own field and the edited tile stays bright', async ({ page }) => {
  const settings = await openSettings(page);
  const before = await profile(page);
  const tile = (name: string) => settings.getByRole('region', { name, exact: true });

  // Học mỗi ngày: preset, Lưu.
  await tile('Học mỗi ngày').getByRole('button', { name: 'Đổi học mỗi ngày', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Học mỗi ngày', exact: true });
  await expect(editor).toBeVisible();
  await expect(tile('Học mỗi ngày')).toHaveClass(/is-on/);
  await expect.poll(() => tile('Ngày thi').evaluate(node => Number(getComputedStyle(node).opacity))).toBeLessThan(0.5);
  await editor.getByRole('button', { name: '45', exact: true }).click();
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(tile('Học mỗi ngày')).toContainText('45');
  expect(await profile(page)).toMatchObject({ dailyMinGoalMinutes: 45, name: before.name, motto: before.motto, examDate: before.examDate, streakFreezes: before.streakFreezes, targetScore: before.targetScore });

  // Khiên cứu chuỗi: stepper, Lưu.
  await tile('Khiên cứu chuỗi').getByRole('button', { name: 'Đổi khiên cứu chuỗi', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Khiên cứu chuỗi', exact: true });
  await editor.getByRole('button', { name: '3', exact: true }).click();
  await editor.getByRole('button', { name: 'Tăng', exact: true }).click();
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(tile('Khiên cứu chuỗi')).toContainText('×4');
  expect((await profile(page)).streakFreezes).toBe(4);

  // Ngày thi: clear it, then set it again from "+ Đặt ngày thi".
  await tile('Ngày thi').getByRole('button', { name: 'Đổi ngày thi', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Ngày thi', exact: true });
  await editor.getByRole('button', { name: 'Bỏ ngày thi', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(tile('Ngày thi')).toContainText('Chưa đặt');
  expect((await profile(page)).examDate).toBe('');
  await tile('Ngày thi').getByRole('button', { name: '+ Đặt ngày thi', exact: true }).click();
  await editor.getByLabel('Ngày thi', { exact: true }).fill('2030-03-02');
  await editor.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(tile('Ngày thi')).toContainText('02/03/2030');
  const after = await profile(page);
  expect(after).toMatchObject({ examDate: '2030-03-02', dailyMinGoalMinutes: 45, streakFreezes: 4, name: before.name, motto: before.motto, targetScore: before.targetScore });
});

test('Escape and a click outside close a tile editor without saving, and focus returns to its Đổi', async ({ page }) => {
  const settings = await openSettings(page);
  const before = await profile(page);
  const open = settings.getByRole('button', { name: 'Đổi châm ngôn', exact: true });
  await open.click();
  const editor = page.getByRole('dialog', { name: 'Châm ngôn', exact: true });
  await expect(editor.getByLabel('Châm ngôn', { exact: true })).toBeFocused();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  // Tab stays inside the editor and the settings dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await editor.getByLabel('Châm ngôn', { exact: true }).fill('Không lưu');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(open).toBeFocused();

  await open.click();
  await editor.getByLabel('Châm ngôn', { exact: true }).fill('Cũng không lưu');
  await settings.getByRole('heading', { name: 'Cài đặt', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(settings).toBeVisible();
  expect((await profile(page)).motto).toBe(before.motto);
});

test('the header edits the name inline and keeps account actions reachable', async ({ page }) => {
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  const name = settings.getByLabel('Tên của bạn', { exact: true });
  await expect(name).toBeFocused();
  await name.fill('Hạt Dẻ');
  await name.press('Enter');
  await expect(name).toHaveCount(0);
  await expect(settings.locator('header')).toContainText('Hạt Dẻ');
  expect((await profile(page)).name).toBe('Hạt Dẻ');

  // Account panel (sync, OTP, retry, delete account) opens from "Tài khoản ›".
  await settings.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'Tài khoản và đồng bộ', exact: true });
  await expect(account.getByRole('region', { name: 'Tài khoản và đồng bộ', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(account).toHaveCount(0);
  await expect(settings).toBeVisible();
});
