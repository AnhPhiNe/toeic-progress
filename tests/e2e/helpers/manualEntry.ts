import type { Locator, Page } from '@playwright/test';

/** The computer Full Test opens on the paste-an-image view; the 200-question grid sits behind "Nhập tay". Phones are unchanged. */
export async function openManualEntry(page: Page, form: Locator) {
  if ((page.viewportSize()?.width ?? 0) < 1024) return;
  await form.getByRole('button', { name: /^Nhập tay/ }).click();
}
