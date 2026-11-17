import { expect, test, type Page } from '@playwright/test';
import { openSettings } from './helpers/accountGroup';

/** Puts one day of word counts into the guest bundle (the page that used to record them is gone), then reloads. */
async function seedVocab(page: Page, count: number) {
  await page.evaluate(count => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    data.vocabLog = [{ id: 'vocab:2026-10-01', date: '2026-10-01', count, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, count);
  await page.reload();
}

test('guest reset removes content and retired copies with one confirmation', async ({ page }) => {
  await page.goto('/');
  await seedVocab(page, 12);
  await page.evaluate(() => {
    localStorage.setItem('toeic_progress_bundle_v2','Sensitive retired copy');
    localStorage.setItem('toeic_990_sessions_v1','Private old test');
    localStorage.setItem('toeic_weekly_plans_v1_owner','guest');
    localStorage.setItem('toeic_smart_weekly_plans_v1','Private old plan');
  });
  await openSettings(page);
  let confirmations=0;
  page.on('dialog',async dialog => { confirmations++; await dialog.accept(); });
  await page.getByRole('button',{name:'Xóa toàn bộ dữ liệu'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(confirmations).toBe(1);
  const result = await page.evaluate(() => {
    const bundle=JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    return {records:bundle.vocabLog,oldBundle:localStorage.getItem('toeic_progress_bundle_v2'),legacy:localStorage.getItem('toeic_990_sessions_v1'),plans:localStorage.getItem('toeic_smart_weekly_plans_v1')};
  });
  expect(result.oldBundle).toBeNull();
  expect(result.legacy).toBeNull();
  expect(result.plans).toBeNull();
  expect(result.records).toHaveLength(1);
  expect(Object.keys(result.records[0]).sort()).toEqual(['deletedAt','id','updatedAt']);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).vocabLog.filter((entry: { deletedAt: string | null }) => !entry.deletedAt))).toHaveLength(0);
});

test('canceling reset retains guest content', async ({ page }) => {
  await page.goto('/');
  await seedVocab(page, 4);
  const before=await page.evaluate(()=>localStorage.getItem('toeic_progress_bundle_v3'));
  await openSettings(page);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Xóa toàn bộ dữ liệu'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('toeic_progress_bundle_v3'))).toBe(before);
});
