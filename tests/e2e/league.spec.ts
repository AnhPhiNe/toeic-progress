import { test, expect, type Page } from '@playwright/test';
import { joined, notJoined, signIn } from './helpers/rank';

/** Xếp hạng (was Giải đấu tuần): rank, season, five weekly boards with the own row pinned. Mockups: design/previews/rank-v1/. */
const myRow = (page: Page) => page.getByRole('list', { name: /^Bảng / }).locator('li[aria-current="true"]');

test.describe('Xếp hạng', () => {
  test('a guest sees the climb and a sign-in button; the old address redirects', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 700 });
    await page.addInitScript(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
    await page.goto('/giai-dau');
    await expect(page).toHaveURL(/\/xep-hang$/);
    await expect(page.getByRole('heading', { name: /Học đều mỗi tuần/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập để tham gia' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });

  test('joining with a nickname shows the rank, season and the star board', async ({ page }) => {
    const league = await signIn(page, notJoined);
    await page.goto('/xep-hang');
    await expect(page.getByText('Mùa 1 · còn 23 ngày')).toBeVisible();
    await page.getByRole('button', { name: 'Tham gia', exact: true }).click();
    const name = page.getByPlaceholder('Ví dụ: Sóc Nâu');
    await name.fill('x');
    await page.getByRole('button', { name: 'Vào bảng xếp hạng' }).click();
    await expect(page.getByText('Biệt danh cần 2–20 ký tự.')).toBeVisible();
    expect(league.joins).toHaveLength(0);
    await name.fill('  Hạt   Tiêu ');
    await page.getByRole('button', { name: 'Vào bảng xếp hạng' }).click();
    await expect(page.getByRole('heading', { name: 'Vàng II', level: 2 })).toBeVisible();
    expect(league.joins).toEqual([{ nickname: 'Hạt Tiêu', coat: 'nau' }]);
    await expect(page.getByText('còn 36 lên')).toBeVisible();
    await expect(page.getByText('1 khiên giữ hạng')).toBeVisible();
    await expect(page.getByText(/Tuần này đang \+18 điểm từ 184★/)).toBeVisible();
    await expect(page.getByText('Vùng lên hạng · top 6 +20 điểm hạng')).toBeVisible();
    await expect(myRow(page)).toContainText('Hạt Tiêu');
    await expect(myRow(page)).toContainText('còn 15★ là vào vùng lên hạng');
    await expect(page.getByText('Vàng · Mùa 1')).toBeVisible();
  });

  test('tabs switch boards; Tiến bộ has a Nghe/Đọc toggle; own row is pinned', async ({ page }) => {
    await signIn(page, joined);
    await page.goto('/xep-hang');
    const tabs = page.getByRole('tablist', { name: 'Bảng tuần này' });
    await tabs.getByRole('tab', { name: 'Tiến bộ' }).click();
    await expect(page.getByRole('list', { name: 'Bảng Tiến bộ' })).toBeVisible();
    await expect(myRow(page)).toContainText('+76');
    await page.getByRole('button', { name: 'Đọc', exact: true }).click();
    await expect(myRow(page)).toContainText('+53');
    await tabs.getByRole('tab', { name: 'Thời gian học' }).click();
    await expect(myRow(page)).toContainText('5 giờ 09');
    await tabs.getByRole('tab', { name: 'Chuỗi ngày' }).click();
    await expect(myRow(page)).toContainText('23 ngày');
    await tabs.getByRole('tab', { name: 'Ôn câu sai' }).click();
    await expect(myRow(page)).toContainText('66 câu');
    await expect(page.getByText(/chỉ để vui, không tính điểm hạng/)).toBeVisible();
    // Pinned: sticky to the bottom of the scrolling board.
    await expect(myRow(page)).toHaveCSS('position', 'sticky');
    await tabs.getByRole('tab', { name: 'Sao tuần' }).click();
    await page.getByRole('button', { name: 'Cách kiếm sao' }).click();
    await expect(page.getByRole('dialog', { name: 'Cách kiếm sao' })).toContainText('Ghi điểm một đề full');
  });

  test('desktop sidebar shows the live label and opens the page', async ({ page }) => {
    await signIn(page, joined);
    await page.goto('/');
    const item = page.getByRole('button', { name: /^Xếp hạng/ });
    await expect(item).toContainText('Vàng II · hạng 8');
    await item.click();
    await expect(page).toHaveURL(/\/xep-hang$/);
    await expect(item).toHaveAttribute('aria-current', 'page');
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the chip on Hôm nay and the avatar sheet row open Xếp hạng', async ({ page }) => {
      await signIn(page, joined);
      await page.goto('/');
      const chip = page.getByRole('button', { name: /^Xếp hạng Vàng II · hạng 8/ });
      await expect(chip).toHaveText('Hạng 8');
      await chip.click();
      await expect(page.getByRole('heading', { name: 'Xếp hạng', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Quay lại' }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByRole('button', { name: /^Hồ sơ của bạn/ }).first().click();
      const row = page.getByRole('dialog').getByRole('button', { name: /^Xếp hạng/ });
      await expect(row).toContainText('Vàng II · hạng 8');
      await row.click();
      await expect(page).toHaveURL(/\/xep-hang$/);
      await expect(page.getByRole('heading', { name: 'Vàng II', level: 2 })).toBeVisible();
    });

    test('phone board: tabs scroll, own row pinned, Quà & luật sheet', async ({ page }) => {
      await signIn(page, joined);
      await page.goto('/xep-hang');
      await expect(myRow(page)).toBeVisible();
      await expect(myRow(page)).toHaveCSS('position', 'sticky');
      await page.getByRole('tab', { name: 'Ôn câu sai' }).click();
      await expect(myRow(page)).toContainText('66 câu');
      await page.getByRole('button', { name: /Quà & luật/ }).click();
      const sheet = page.getByRole('dialog', { name: 'Quà & luật mùa 1' });
      await expect(sheet).toContainText('Khung avatar');
      await expect(sheet).toContainText('Mỗi tuần tụt tối đa 1 bậc.');
      await sheet.getByRole('button', { name: 'Đã hiểu' }).click();
      await expect(sheet).toHaveCount(0);
    });

    test('before joining the chip opens the join screen', async ({ page }) => {
      await signIn(page, notJoined);
      await page.goto('/');
      await page.getByRole('button', { name: 'Xếp hạng · tham gia' }).click();
      await expect(page.getByRole('heading', { name: /Học đều mỗi tuần/ })).toBeVisible();
    });
  });
});

/* Screenshots for the design review: RANK_SHOTS=1 npx playwright test league.spec.ts -g "rank screenshots" */
test.describe('rank screenshots', () => {
  test.skip(!process.env.RANK_SHOTS, 'only on request');
  const out = 'design/previews/rank-v1/built/';
  for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    test(`xep-hang ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await signIn(page, joined);
      await page.goto('/xep-hang');
      await expect(page.getByRole('heading', { name: 'Vàng II', level: 2 })).toBeVisible();
      await page.screenshot({ path: `${out}xephang-sao-${label}.png` });
      await page.getByRole('tab', { name: 'Tiến bộ' }).click();
      await page.screenshot({ path: `${out}xephang-tienbo-${label}.png` });
      await page.getByRole('tab', { name: 'Thời gian học' }).click();
      await page.screenshot({ path: `${out}xephang-thoigian-${label}.png` });
      if (label === 'phone') {
        await page.getByRole('tab', { name: 'Sao tuần' }).click();
        await page.getByRole('button', { name: /Quà & luật/ }).click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}xephang-luat-phone.png` });
      }
    });
    test(`xep-hang guest ${label}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await signIn(page, notJoined);
      await page.goto('/xep-hang');
      await expect(page.getByRole('heading', { name: /Học đều mỗi tuần/ })).toBeVisible();
      await page.screenshot({ path: `${out}xephang-khach-${label}.png` });
    });
  }
});
