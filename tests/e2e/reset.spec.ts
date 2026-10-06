import { expect, test } from '@playwright/test';

test('guest reset removes content and retired copies with one confirmation', async ({ page }) => {
  await page.goto('/tu-vung');
  await page.getByRole('spinbutton', { name:'Số từ đã học' }).fill('12');
  await page.getByRole('button', { name:'Lưu từ vựng' }).click();
  await expect(page.getByText('12 từ tích lũy',{exact:true})).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('toeic_progress_bundle_v2','Sensitive retired copy');
    localStorage.setItem('toeic_990_sessions_v1','Private old test');
    localStorage.setItem('toeic_weekly_plans_v1_owner','guest');
    localStorage.setItem('toeic_smart_weekly_plans_v1','Private old plan');
  });
  await page.getByRole('button',{name:'Cài đặt hồ sơ Học viên'}).click();
  let confirmations=0;
  page.on('dialog',async dialog => { confirmations++; await dialog.accept(); });
  await page.getByRole('button',{name:'Xóa trắng dữ liệu'}).click();
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
  await expect(page.getByText('0 từ tích lũy',{exact:true})).toBeVisible();
});

test('canceling reset retains guest content', async ({ page }) => {
  await page.goto('/tu-vung');
  await page.getByRole('spinbutton',{name:'Số từ đã học'}).fill('4');
  await page.getByRole('button',{name:'Lưu từ vựng'}).click();
  const before=await page.evaluate(()=>localStorage.getItem('toeic_progress_bundle_v3'));
  await page.getByRole('button',{name:'Cài đặt hồ sơ Học viên'}).click();
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Xóa trắng dữ liệu'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('toeic_progress_bundle_v3'))).toBe(before);
});
