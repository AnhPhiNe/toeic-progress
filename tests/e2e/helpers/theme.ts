import type { Page } from '@playwright/test';

/** Below md the theme switch lives in the navigation drawer, so a phone user opens the menu first. */
export async function switchToDarkOnMobile(page: Page) {
  await page.getByRole('button', { name: 'Mở menu điều hướng', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Điều hướng', exact: true });
  await drawer.getByRole('button', { name: 'Giao diện tối', exact: true }).click();
  await drawer.getByRole('button', { name: 'Đóng menu', exact: true }).click();
}
