import { expect, type Locator, type Page } from '@playwright/test';
import { openScoreLogger } from './nav';
import { chooseMore } from './manualEntry';
import { openManualEntry } from './manualEntry';

/** A new Full Test ends on its result screen; tests that keep working in the app close it first. */
export async function closeTestResult(page: Page) {
  const close = page.getByRole('button', { name: 'Đóng kết quả', exact: true });
  await close.click();
  await expect(close).toHaveCount(0);
}

/** The score form is titled differently on phones ("Ghi điểm") and on larger screens. */
export const sessionDialog = (page: Page) => page.getByRole('dialog', { name: /^(Ghi điểm|Sửa kết quả)$/ });

export async function choosePractice(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Luyện Part', exact: true }).click();
}

/** Switch a Full Test from per-Part estimation to typing the official score. */
export async function useOfficialScore(dialog: Locator) {
  const direct = dialog.getByRole('button', { name: 'Điểm chính thức', exact: true });
  if (await direct.isVisible()) { await direct.click(); return; }
  const more = dialog.getByRole('button', { name: /^Cách khác/ });
  if (await more.isVisible()) {
    const grid = dialog.getByRole('button', { name: 'Câu 1', exact: true });
    if (!(await grid.isVisible())) await chooseMore(dialog, /^Tự chọn câu sai/);
    await chooseMore(dialog, 'Điểm chính thức');
    return;
  }
  await direct.click();
}

/** Hành trình: the "Các đề" tab lists full tests; a row opens the test drawer (desktop) or sheet (phone), whose "Sửa điểm" opens the edit form. */
export async function openHistoryEdit(page: Page, testName: string) {
  if (!page.url().includes('/lich-su')) await page.goto('/lich-su', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Các đề/ }).click();
  await page.getByRole('button', { name: testName }).first().click();
  await page.getByRole('button', { name: 'Sửa điểm', exact: true }).click();
}

/** Phones log a Full Test by its wrong questions; tests that type per-Part counts switch to the counts entry first. */
export async function usePartCounts(dialog: Locator) {
  const more = dialog.getByRole('button', { name: /^Cách khác/ });
  const phoneManual = dialog.getByRole('button', { name: /^✎ Tự chọn câu sai/ });
  if (await phoneManual.isVisible()) await phoneManual.click();
  const link = dialog.getByRole('button', { name: 'Số câu đúng mỗi Part', exact: true });
  if (await link.isVisible()) { await link.click(); return; }
  if (await more.isVisible()) {
    const grid = dialog.getByRole('button', { name: 'Câu 1', exact: true });
    if (!(await grid.isVisible())) await chooseMore(dialog, /^Tự chọn câu sai/);
    await chooseMore(dialog, 'Số câu đúng mỗi Part');
  }
}

/** A Part practice is edited from its row under "Mẻ bánh gần đây" on Luyện tập (a sheet behind the clock button on phones); rows read "Part 7 · 1 sai". */
export async function openPracticeEdit(page: Page, rowTitle: string) {
  if (!page.url().includes('/luyen-toc-do')) await page.goto('/luyen-toc-do', { waitUntil: 'domcontentloaded' });
  const recent = page.getByRole('button', { name: 'Mẻ bánh gần đây', exact: true });
  if (await recent.isVisible()) await recent.click();
  await page.getByRole('button', { name: rowTitle }).first().click();
}

/** The computer score form on its grid view: the paste view has no test-name field, the grid view behind "Tự chọn câu sai" does. */
export async function openGridForm(page: Page) {
  await openScoreLogger(page);
  const form = sessionDialog(page);
  await openManualEntry(page, form);
  return form;
}

/** The full-screen PhoneLogger (phones log new results here; its header changes per step, so it is found by its class). */
export const phoneLogger = (page: Page) => page.locator('[role="dialog"].pl-dialog');

/** PhoneLogger step 1: choose the test from the chips, or type a new name under "Đề khác". */
export async function pickPhoneTestName(page: Page, name: string) {
  const dialog = phoneLogger(page);
  const chip = dialog.getByRole('group', { name: 'Đề', exact: true }).getByRole('button', { name, exact: true });
  if (await chip.count()) { await chip.click(); return; }
  await dialog.getByRole('button', { name: /Đề khác/ }).click();
  await page.keyboard.type(name);
  const existing = page.getByRole('option', { name, exact: true });
  await ((await existing.count()) ? existing : page.getByRole('option', { name: `+ Thêm tên đề “${name}”`, exact: true })).click();
}

/** PhoneLogger: step 1 (name) then "Tự chọn câu sai" and "Sửa điểm" to reach the Nghe/Đọc wheels. */
export async function phoneManualScore(page: Page, name: string) {
  await pickPhoneTestName(page, name);
  await phoneLogger(page).getByRole('button', { name: /^✎ Tự chọn câu sai/ }).click();
  await phoneLogger(page).getByRole('button', { name: /^Sửa điểm/ }).click();
}

/** Moves a wheel to a value with the keyboard (Home, then PageDown = 10 rows, ArrowDown = 1 row). */
export async function setWheel(dialog: Locator, label: 'Điểm Nghe' | 'Điểm Đọc', target: number, step = 5, min = 5) {
  const wheel = dialog.getByRole('spinbutton', { name: label, exact: true });
  await wheel.focus();
  await wheel.press('Home');
  const rows = Math.round((target - min) / step);
  for (let jump = Math.floor(rows / 10); jump > 0; jump--) await wheel.press('PageDown');
  for (let one = rows % 10; one > 0; one--) await wheel.press('ArrowDown');
  await expect(wheel).toHaveAttribute('aria-valuenow', String(target));
}
