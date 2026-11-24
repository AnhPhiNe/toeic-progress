import { test, expect } from '@playwright/test';

test('landing shows the hero and its primary button opens the app', async ({ page }) => {
  await page.goto('/gioi-thieu');
  await expect(page).toHaveTitle('Giới thiệu · TOEIC Progress');
  await expect(page.getByRole('heading', { level: 1, name: /Chụp câu sai/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sóc giúp bạn thế nào' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ghi điểm & chụp trang chữa bài/ })).toBeVisible();
  await expect(page.getByText(/không liên kết với ETS/)).toBeVisible();
  // One main action.
  await expect(page.getByRole('link', { name: 'Bắt đầu miễn phí' })).toHaveCount(1);
  await page.getByRole('link', { name: 'Bắt đầu miễn phí' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Hành trình điểm', exact: true })).toBeVisible();
});

test('phone landing shows the main action in the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/gioi-thieu');
  await expect(page.getByRole('link', { name: 'Bắt đầu miễn phí' })).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('"Đã có tài khoản? Đăng nhập" opens Cài đặt in the app', async ({ page }) => {
  await page.goto('/gioi-thieu');
  await page.getByRole('link', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('dialog', { name: 'Cài đặt', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('privacy and terms pages render with the shared header and footer', async ({ page }) => {
  await page.goto('/chinh-sach-quyen-rieng-tu');
  await expect(page.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dữ liệu chúng tôi xử lý' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vào ứng dụng' })).toHaveAttribute('href', '/');
  await page.getByRole('navigation', { name: 'Trang công khai' }).getByRole('link', { name: 'Điều khoản' }).click();
  await expect(page).toHaveURL(/\/dieu-khoan$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Điều khoản sử dụng' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Phạm vi dịch vụ' })).toBeVisible();
  await expect(page.getByText(/không liên kết với ETS/)).toBeVisible();
});
