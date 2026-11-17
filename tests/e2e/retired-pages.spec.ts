import { expect, test } from '@playwright/test';
import { gotoPage } from './helpers/nav';

// The old Từ vựng and Kế hoạch pages are gone; their links land on Hôm nay.
for (const path of ['/tu-vung', '/ke-hoach']) {
  for (const width of [1280, 390]) {
    test(`${path} lands on Hôm nay at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await gotoPage(page, path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(/cúp|Chào bạn|Dựng cầu thang|Mình là Sóc/);
    });
  }
}
