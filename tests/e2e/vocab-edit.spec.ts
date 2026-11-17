import { test, expect, type Page } from '@playwright/test';
import { openRecordSheet } from './helpers/nav';

const iso = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dm = (offset: number) => { const [, m, d] = iso(offset).split('-'); return `${d}/${m}`; };

const saved = (page: Page) => page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
  const out: Record<string, number> = {};
  for (const e of data.vocabLog as { date: string; count: number; deletedAt: string | null }[]) if (!e.deletedAt) out[e.date] = e.count;
  return out;
});

/** Phone: "+ Ghi" sheet. Desktop: sidebar "Ghi điểm", then the "Từ vựng" mode. */
async function openVocab(page: Page, desktop: boolean) {
  if (!desktop) { await openRecordSheet(page, 'vocab'); return; }
  await page.getByRole('button', { name: 'Ghi điểm', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Từ vựng', exact: true }).click();
}
const pick = (page: Page, offset: number, text: string) => page.getByRole('dialog').getByRole('button', { name: new RegExp(`^Ngày ${dm(offset)}: ${text}`) });

for (const desktop of [false, true]) {
  test(`vocabulary days can be added, edited and deleted (${desktop ? 'desktop' : 'phone'})`, async ({ page }) => {
    await page.setViewportSize(desktop ? { width: 1280, height: 800 } : { width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const dialog = page.getByRole('dialog');
    const today = iso(0), yesterday = iso(1);
    const count = dialog.getByLabel('Số từ đã học');

    // Log today.
    await openVocab(page, desktop);
    await count.fill('10');
    await dialog.getByRole('button', { name: desktop ? 'Lưu từ vựng' : /^Lưu \d+ từ/ }).click();
    await expect.poll(() => saved(page)).toEqual({ [today]: 10 });

    // A day without words: add a forgotten day. No delete there.
    await openVocab(page, desktop);
    await pick(page, 1, 'chưa có từ').click();
    await expect(dialog.getByRole('heading', { name: `Sửa ngày ${dm(1)}` })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Xóa ngày này' })).toHaveCount(0);
    await count.fill('15');
    await dialog.getByRole('button', { name: `Lưu ngày ${dm(1)}` }).click();
    await expect.poll(() => saved(page)).toEqual({ [today]: 10, [yesterday]: 15 });

    // Edit it: the form is filled with the day's total, and saving replaces it.
    await openVocab(page, desktop);
    await pick(page, 1, '15 từ').click();
    await expect(count).toHaveValue('15');
    await count.fill('25');
    await dialog.getByRole('button', { name: `Lưu ngày ${dm(1)}` }).click();
    await expect.poll(() => saved(page)).toEqual({ [today]: 10, [yesterday]: 25 });

    // "‹ Hôm nay" returns to today; deleting asks first, and "Giữ lại" keeps the day.
    await openVocab(page, desktop);
    await pick(page, 1, '25 từ').click();
    await dialog.getByRole('button', { name: '‹ Hôm nay' }).click();
    await expect(dialog.getByRole('button', { name: 'Xóa ngày này' })).toHaveCount(0);
    await pick(page, 1, '25 từ').click();
    await dialog.getByRole('button', { name: 'Xóa ngày này' }).click();
    await dialog.getByRole('button', { name: 'Giữ lại' }).click();
    expect(await saved(page)).toEqual({ [today]: 10, [yesterday]: 25 });
    await dialog.getByRole('button', { name: 'Xóa ngày này' }).click();
    await dialog.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect.poll(() => saved(page)).toEqual({ [today]: 10 });
    await expect(pick(page, 1, 'chưa có từ')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '‹ Hôm nay' })).toHaveCount(0);

    // Everything survives a reload.
    await page.reload();
    expect(await saved(page)).toEqual({ [today]: 10 });
    await openVocab(page, desktop);
    await expect(pick(page, 0, '10 từ')).toBeVisible();
    await expect(pick(page, 1, 'chưa có từ')).toBeVisible();
  });
}
