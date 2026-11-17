import type { Locator, Page } from '@playwright/test';

/**
 * The computer Full Test opens on the paste-an-image view; "Nhập tay" opens a short view and the 200-question grid sits one step further.
 * A restored draft reopens on the view it was left on (short view or grid), and then nothing is clicked.
 * Phones (<768px) use the full-screen PhoneLogger instead and skip this.
 */
export async function openManualEntry(page: Page, form: Locator) {
  if ((page.viewportSize()?.width ?? 0) < 768) return;
  const manual = form.getByRole('button', { name: /^Nhập tay/ });
  const shortView = form.getByRole('button', { name: /^Chạm từng câu trên lưới/ });
  const grid = form.getByRole('button', { name: 'Câu 1', exact: true });
  await manual.or(shortView).or(grid).first().waitFor();
  if (!(await manual.isVisible())) return;
  await manual.click();
  await shortView.click();
}
