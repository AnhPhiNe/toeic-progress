import { test, expect, type Page } from '@playwright/test';

/** Sóc của bạn: coat + name picked in the welcome, changed in Tủ đồ; every Sóc follows. Sketch: design/previews/mock-soc-variety.html */
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3') ?? '{}').profile ?? {});

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Any tap ends Sóc's greeting.
  await page.mouse.click(5, 300);
}

test('phone: pick a coat and name after the goal, change both in Hồ sơ của Sóc', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  const avatar = page.locator('.ph-av .soc').first();
  await expect(avatar).toHaveAttribute('data-coat', 'nau');

  await page.getByRole('button', { name: '700', exact: true }).click();
  await page.getByRole('button', { name: 'Xong, mục tiêu 700' }).click();
  await expect(page.getByRole('heading', { name: /Sóc của bạn/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Sô-cô-la' }).click();
  await expect(page.getByRole('radio', { name: 'Sô-cô-la' })).toHaveAttribute('aria-checked', 'true');
  await expect(avatar).toHaveAttribute('data-coat', 'soco');
  await page.getByLabel('Tên Sóc').fill('Bắp Rang');
  await page.getByRole('button', { name: 'Chọn Sóc sô-cô-la' }).click();
  await expect(page.getByText('Ghi đề đầu tiên là mình leo bậc 1!')).toBeVisible();
  expect(await stored(page)).toMatchObject({ socCoat: 'soco', socName: 'Bắp Rang', targetScore: 700, goalChosen: true });

  // The step shows once: after a reload Hôm nay is the usual page.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Sô-cô-la' })).toHaveCount(0);
  await expect(page.locator('.tp-soc .soc')).toHaveAttribute('data-coat', 'soco');

  await page.getByRole('button', { name: /Hồ sơ của bạn/ }).click();
  await page.getByRole('button', { name: /Hồ sơ của Sóc/ }).click();
  await expect(page.locator('.pf-name b')).toHaveText('Bắp Rang');
  await page.getByRole('button', { name: 'Đổi tên Sóc' }).click();
  await page.getByLabel('Tên của Sóc').fill('Mây Bay');
  await page.getByLabel('Tên của Sóc').press('Enter');
  await page.getByRole('radio', { name: 'Hồng dâu' }).click();
  await page.getByRole('button', { name: 'Lưu bộ đồ' }).click();
  await expect(page.locator('.pf-pid .soc')).toHaveAttribute('data-coat', 'dau');
  expect(await stored(page)).toMatchObject({ socCoat: 'dau', socName: 'Mây Bay' });
});

test('desktop: the welcome coat card, then Tủ đồ in Hồ sơ của Sóc; the sidebar Sóc follows, the logo stays Nâu cam', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await fresh(page);
  const me = page.locator('.rd-side__me .soc');
  await expect(me).toHaveAttribute('data-coat', 'nau');

  await page.getByRole('button', { name: '700', exact: true }).click();
  await page.getByRole('button', { name: 'Xong', exact: true }).click();
  const card = page.getByRole('region', { name: 'Sóc của bạn' });
  await card.getByRole('radio', { name: 'Xám tro' }).click();
  await expect(me).toHaveAttribute('data-coat', 'xam');
  await expect(card.getByRole('button', { name: 'Chọn Sóc xám tro' })).toBeVisible();
  await card.getByRole('button', { name: 'Chọn Sóc xám tro' }).click();
  await expect(card).toHaveCount(0);
  const profile = await stored(page);
  expect(profile).toMatchObject({ socCoat: 'xam' });
  expect(profile.socName).toBeUndefined();
  await expect(page.locator('.rd-side__logosoc')).toHaveAttribute('data-coat', 'nau');

  await me.click();
  await expect(page).toHaveURL(/\/ho-so-soc$/);
  await expect(page.locator('.pf-name b')).toHaveText('Hạt Tiêu');
  await page.getByRole('radio', { name: 'Kem sữa' }).click();
  await expect(me).toHaveAttribute('data-coat', 'xam'); // a preview until saved
  await page.getByRole('button', { name: 'Đổi tên Sóc' }).click();
  await page.getByLabel('Tên của Sóc').fill('Trà Sữa');
  await page.getByLabel('Tên của Sóc').press('Enter');
  await page.getByRole('button', { name: 'Lưu bộ đồ' }).click();
  await expect(me).toHaveAttribute('data-coat', 'kem');
  expect(await stored(page)).toMatchObject({ socCoat: 'kem', socName: 'Trà Sữa' });
});

test('Để sau keeps Nâu cam and the default name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await page.getByRole('button', { name: '800', exact: true }).click();
  await page.getByRole('button', { name: 'Xong, mục tiêu 800' }).click();
  await page.getByRole('button', { name: 'Để sau' }).click();
  await expect(page.getByText('Ghi đề đầu tiên là mình leo bậc 1!')).toBeVisible();
  const profile = await stored(page);
  expect(profile.socCoat).toBeUndefined();
  expect(profile.socName).toBeUndefined();
});

test('Hôm nay: Sóc dozes off after a long break and wakes up when tapped', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Demo study days end on 2026-09-13; four days later Sóc is asleep on its step.
  await page.clock.install({ time: new Date('2026-09-17T10:00:00') });
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    (await import('/src/shared/data/storage.ts' as string)).loadDemoData();
    localStorage.setItem('rd_welcome_seen_v1:guest', '1');
  });
  await page.reload();
  const sleeper = page.getByRole('button', { name: /Sóc đang ngủ gật trên bậc/ });
  await expect(sleeper.locator('.soc')).toHaveAttribute('data-mood', 'zzz');
  await sleeper.click();
  await expect(page.locator('.tp-soc .soc')).toHaveAttribute('data-mood', 'hi');
});
