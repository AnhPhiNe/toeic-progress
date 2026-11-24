import type { Locator, Page } from '@playwright/test';

/**
 * The computer Full Test opens on the paste-an-image view; "Tự chọn câu sai" opens the 200-question grid directly.
 * A restored draft reopens on the view it was left on (short view or grid), and then nothing is clicked.
 * Phones (<768px) use the full-screen PhoneLogger instead and skip this.
 */
export async function openManualEntry(page: Page, form: Locator) {
  if ((page.viewportSize()?.width ?? 0) < 768) return;
  const direct = form.getByRole('button', { name: /^Tự chọn câu sai/ });
  const more = form.getByRole('button', { name: /^Cách khác/ });
  const shortView = form.getByRole('button', { name: /^Chạm từng câu trên lưới/ });
  const grid = form.getByRole('button', { name: 'Câu 1', exact: true });
  await direct.or(more).or(shortView).or(grid).first().waitFor();
  if (await grid.isVisible()) return;
  if (await direct.isVisible()) { await direct.click(); return; }
  if (await more.isVisible()) await chooseMore(form, /^Tự chọn câu sai/);
}

/** Desktop Ghi điểm exposes quick toggles & mode switches inline (and falls back to "Cách khác" menu where used). */
export async function chooseMore(scope: Locator, name: string | RegExp) {
  const direct = scope.getByRole('button', { name });
  if (await direct.first().isVisible()) { await direct.first().click(); return; }
  const item = scope.getByRole('menuitem', { name });
  if (!(await item.isVisible())) await scope.getByRole('button', { name: /^Cách khác/ }).click();
  await item.click();
}
