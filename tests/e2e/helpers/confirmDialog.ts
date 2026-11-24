import { expect, type Page } from '@playwright/test';

/** Responds to the themed <ConfirmDialog> (which replaced window.confirm) and optionally asserts its message. */
export async function answerConfirm(page: Page, accept: boolean, expectedText?: string | RegExp) {
  const host = page.getByTestId('confirm-dialog');
  await expect(host).toBeVisible();
  if (expectedText !== undefined) await expect(host).toContainText(expectedText);
  await host.locator('.cfm-actions button').nth(accept ? 1 : 0).click();
  await expect(host).toHaveCount(0);
}
