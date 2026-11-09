import type { Locator, Page } from '@playwright/test';

/** The computer Full Test opens on the paste-an-image view; "Nhập tay" opens a short view and the 200-question grid sits one step further. Phones are unchanged. */
export async function openManualEntry(page: Page, form: Locator) {
  if ((page.viewportSize()?.width ?? 0) < 1024) return;
  await form.getByRole('button', { name: /^Nhập tay/ }).click();
  await form.getByRole('button', { name: /^Chạm từng câu trên lưới/ }).click();
}
