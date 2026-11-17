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
    const row = settings.getByRole('button', { name: /^Điểm mục tiêu/ });
    await expect(row).toContainText('990');
    await expect(row).not.toContainText('Chưa chọn');

    await row.click();
    const editor = page.getByRole('dialog', { name: 'Mục tiêu của bạn', exact: true });
    await expect(editor.getByRole('group', { name: 'Mốc nhanh' })).toBeVisible();
    await expect(editor.getByText('Ngày thi', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: '850', exact: true }).click();
    // Demo best is 960, so 850 is already reached: the button says so.
    await editor.getByRole('button', { name: /^Vẫn lưu 850/ }).click();
    await expect(editor).toHaveCount(0);
    expect(await profile(page)).toMatchObject({ targetScore: 850, goalChosen: true });
    await expect(settings.getByRole('button', { name: /^Điểm mục tiêu/ })).toContainText('850');
    await expect(settings).toBeVisible();
  });
}

test('phone Sổ tay rows show the question text, not "Tự ghi"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, '/so-tay');
  const rows = page.locator('.pn-row');
  await expect(rows.first()).toContainText('Câu 182');
  await expect(rows.first()).toContainText('Thời điểm bảo trì');
  await expect(page.locator('.pn-rows')).not.toContainText('Tự ghi');
});
