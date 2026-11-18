import { expect, test } from '@playwright/test';
import { openSettings } from './helpers/accountGroup';

const BUNDLE = 'toeic_progress_bundle_v3';
const profile = (page: import('@playwright/test').Page) =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key)!).profile, BUNDLE);

async function demo(page: import('@playwright/test').Page, path = '/') {
  await page.goto(path);
  await page.evaluate(async () => { localStorage.clear(); (await import('/src/shared/data/storage.ts' as string)).loadDemoData(); });
  await page.reload();
}

for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`${label}: Cài đặt opens the Hôm nay goal editor and a profile without goalChosen reads as chosen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await demo(page);
    // A profile saved before the goalChosen flag existed: its stored 990 is the goal, in Cài đặt as on Hôm nay.
    await page.evaluate(key => {
      const bundle = JSON.parse(localStorage.getItem(key)!);
      delete bundle.profile.goalChosen;
      localStorage.setItem(key, JSON.stringify(bundle));
    }, BUNDLE);
    await page.reload();
    const settings = await openSettings(page);
    // Computers: the gold Điểm mục tiêu tile and its Đổi; phones: the list row.
    const row = label === 'desktop' ? settings.getByRole('region', { name: 'Điểm mục tiêu', exact: true }) : settings.getByRole('button', { name: /^Điểm mục tiêu/ });
    await expect(row).toContainText('990');
    await expect(row).not.toContainText('Chưa chọn');

    await (label === 'desktop' ? row.getByRole('button', { name: 'Đổi điểm mục tiêu', exact: true }) : row).click();
    const editor = page.getByRole('dialog', { name: 'Mục tiêu của bạn', exact: true });
    await expect(editor.getByRole('group', { name: 'Mốc nhanh' })).toBeVisible();
    await expect(editor.getByText('Ngày thi', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: '850', exact: true }).click();
    // Demo best is 960, so 850 is already reached: the button says so.
    await editor.getByRole('button', { name: /^Vẫn lưu 850/ }).click();
    await expect(editor).toHaveCount(0);
    expect(await profile(page)).toMatchObject({ targetScore: 850, goalChosen: true });
    await expect(row).toContainText('850');
    await expect(settings).toBeVisible();
  });
}

test('desktop: saving the goal does not save other pending settings edits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await demo(page);
  const before = await profile(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await settings.getByLabel('Tên của bạn', { exact: true }).fill('Tên chưa lưu');
  // Opening another tile's editor leaves the unsaved name behind; only the goal reaches storage.
  await settings.getByRole('button', { name: 'Đổi điểm mục tiêu', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Mục tiêu của bạn', exact: true });
  await expect(settings.getByLabel('Tên của bạn', { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: '700', exact: true }).click();
  await editor.getByRole('button', { name: /^(Lưu · cúp|Vẫn lưu) 700/ }).click();
  await expect(editor).toHaveCount(0);
  await expect(settings.getByRole('region', { name: 'Điểm mục tiêu', exact: true })).toContainText('700');
  await expect(settings.locator('header')).toContainText(before.name);
  await settings.getByRole('button', { name: 'Đóng cài đặt', exact: true }).click();
  await expect(settings).toHaveCount(0);
  const after = await profile(page);
  expect(after.name).toBe(before.name);
  expect(after).toMatchObject({ targetScore: 700, goalChosen: true });
});

test('phone Sổ tay rows show the question text, not "Tự ghi"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, '/so-tay');
  const rows = page.locator('.pn-row');
  await expect(rows.first()).toContainText('Câu 182');
  await expect(rows.first()).toContainText('Thời điểm bảo trì');
  await expect(page.locator('.pn-rows')).not.toContainText('Tự ghi');
});
