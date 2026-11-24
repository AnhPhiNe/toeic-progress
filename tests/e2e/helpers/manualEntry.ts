import type { Locator, Page } from '@playwright/test';

/**
 * The computer Full Test opens on the paste-an-image view; "Tự chọn câu sai" opens the 200-question grid directly.
 * A restored draft reopens on the view it was left on (short view or grid), and then nothing is clicked.
 * Phones (<768px) use the full-screen PhoneLogger instead and skip this.
 */
export async function openManualEntry(page: Page, form: Locator) {
  if ((page.viewportSize()?.width ?? 0) < 768) return;
  const more = form.getByRole('button', { name: /^Cách khác/ });
  const shortView = form.getByRole('button', { name: /^Chạm từng câu trên lưới/ });
  const grid = form.getByRole('button', { name: 'Câu 1', exact: true });
  await more.or(shortView).or(grid).first().waitFor();
  if (await grid.isVisible() || !(await more.isVisible())) return;
  await chooseMore(form, /^Tự chọn câu sai/);
}

/** Desktop Ghi điểm keeps its other ways (Phiếu tô giấy, Ghép nhiều ảnh, Tự chọn câu sai…) behind "Cách khác". */
export async function chooseMore(scope: Locator, name: string | RegExp) {
  const item = scope.getByRole('menuitem', { name });
  if (!(await item.isVisible())) await scope.getByRole('button', { name: /^Cách khác/ }).click();
  await item.click();
}
