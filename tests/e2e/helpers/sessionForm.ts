import type { Locator, Page } from '@playwright/test';

/** The score form is titled differently on phones ("Ghi điểm") and on larger screens. */
export const sessionDialog = (page: Page) => page.getByRole('dialog', { name: /^(Ghi điểm|Sửa kết quả)$/ });

export async function choosePractice(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Luyện Part', exact: true }).click();
}

/** Switch a Full Test from per-Part estimation to typing the official score. */
export async function useOfficialScore(dialog: Locator) {
  const checkbox = dialog.getByLabel('Nhập điểm từ kết quả đề (tùy chọn)');
  if (await checkbox.count()) await checkbox.check();
  else await dialog.getByRole('button', { name: 'Điểm chính thức', exact: true }).click();
}

/** Rows carry a pencil on larger screens; on phones the edit lives in the session detail. */
export async function openHistoryEdit(page: Page, testName: string) {
  const pencil = page.getByRole('button', { name: `Sửa bản ghi ${testName}` });
  if (await pencil.isVisible()) { await pencil.click(); return; }
  await page.getByRole('button', { name: new RegExp(`^Xem chi tiết ${testName}`) }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sửa kết quả', exact: true }).click();
}

/** Phones log a Full Test by its wrong questions; tests that type per-Part counts switch to the counts entry first. */
export async function usePartCounts(dialog: Locator) {
  const link = dialog.getByRole('button', { name: 'Số câu đúng mỗi Part', exact: true });
  if (await link.isVisible()) await link.click();
}
