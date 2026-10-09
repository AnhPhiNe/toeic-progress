import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.clock.install({ time: new Date('2026-10-09T09:00:00Z') });
  await page.goto('/tu-vung');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    data.vocabLog = [1, 35, 20, 20, 20, 12, 16].map((count, index) => ({ id: `vocab:2026-10-0${index + 1}`, date: `2026-10-0${index + 1}`, count, updatedAt: stamp, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
}

test('daily totals edit by date, replace instead of add, paginate five rows and stay saved after reload', async ({ page }) => {
  await seed(page);
  await expect(page.locator('[data-vocab-day]')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Từ đã học theo ngày', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sửa ghi nhận ngày 05/10/2026', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa ghi nhận', exact: true });
  await expect(edit).toContainText('05/10/2026');
  await expect(edit.getByLabel('Số từ đã học')).toHaveValue('20');
  await edit.getByLabel('Số từ đã học').fill('25');
  await edit.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu 25 từ');
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).vocabLog.filter((log: {date:string;deletedAt:string|null}) => log.date === '2026-10-05' && !log.deletedAt));
  expect(saved).toHaveLength(1);
  expect(saved[0].count).toBe(25);
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Sửa ghi nhận ngày 01/10/2026', exact: true }).click();
  await expect(edit.getByLabel('Số từ đã học')).toHaveValue('1');
  await page.keyboard.press('Escape');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Xóa ghi nhận ngày 01/10/2026', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa ghi nhận ngày 02/10/2026', exact: true }).click();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(5);
  await expect(page.getByRole('navigation', { name: 'Trang lịch sử từ vựng' })).toHaveCount(0);
});

test('invalid count and failed save keep the input; a stale day cannot overwrite another edit', async ({ page }) => {
  await seed(page);
  const count = page.getByLabel('Số từ đã học');
  await count.fill('');
  await expect(count).toHaveValue('');
  await count.fill('1.5');
  await page.getByRole('button', { name: 'Lưu từ vựng', exact: true }).click();
  expect(await count.evaluate(input => (input as HTMLInputElement).validity.stepMismatch)).toBe(true);
  await count.fill('22');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if(key === 'toeic_progress_bundle_v3') throw new DOMException('quota','QuotaExceededError'); original.call(this,key,value); };
  });
  await page.getByRole('button', { name: 'Lưu từ vựng', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(count).toHaveValue('22');
  await page.reload();
  await page.getByRole('button', { name: 'Sửa ghi nhận ngày 05/10/2026', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa ghi nhận', exact: true });
  await edit.getByLabel('Số từ đã học').fill('30');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.vocabLog.find((log: {date:string}) => log.date === '2026-10-05').count = 99;
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(data));
  });
  await edit.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('vừa được sửa ở nơi khác');
  await expect(edit.getByLabel('Số từ đã học')).toHaveValue('30');
});

test('compact layout fits widths and themes; bars grow while numeric labels remain fixed', async ({ page }, testInfo) => {
  await seed(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320,375,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), String(width)).toBe(true);
  }
  await expect(page.getByText('TB mỗi ngày ghi nhận', {exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('vocabulary-desktop.png'), fullPage:true, animations:'disabled'});
  await page.getByRole('button',{name:'Chuyển sang giao diện Tối',exact:true}).click();
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:testInfo.outputPath('vocabulary-mobile-dark.png'), fullPage:true, animations:'disabled'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await page.reload();
  await page.clock.runFor(120);
  const labels = page.locator('.vocab-chart-labels text');
  expect(await labels.count()).toBeGreaterThan(0);
  const positions = await labels.evaluateAll(nodes => nodes.map(node=>[node.getAttribute('x'),node.getAttribute('y'),node.textContent]));
  const bar = page.locator('.recharts-bar-rectangle path').first();
  const early = await bar.evaluate(node=>Number(node.getAttribute('height')));
  await page.clock.runFor(150);
  expect(await bar.evaluate(node=>Number(node.getAttribute('height')))).toBeGreaterThan(early);
  expect(await labels.evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('x'),node.getAttribute('y'),node.textContent]))).toEqual(positions);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.runFor(700);
  const final = await bar.getAttribute('d');
  await page.clock.runFor(1000);
  expect(await bar.getAttribute('d')).toBe(final);
});

test('legacy duplicate dates show one daily total and editing/deleting keeps totals and streak consistent', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    data.sessions = [];
    data.pacingRuns = [];
    data.shieldDays = [];
    data.vocabLog = [
      { id:'old-a',date:'2026-10-09',count:10,updatedAt:stamp,deletedAt:null },
      { id:'old-b',date:'2026-10-09',count:20,updatedAt:stamp,deletedAt:null }
    ];
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(data));
  });
  await page.reload();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(1);
  await expect(page.getByLabel('Số từ đã học')).toHaveValue('30');
  await page.getByLabel('Số từ đã học').fill('25');
  await page.getByRole('button',{name:'Cập nhật',exact:true}).click();
  await expect(page.getByText('25 từ tích lũy',{exact:true})).toBeVisible();
  const data = await page.evaluate(()=>JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!));
  expect(data.vocabLog.filter((log:{deletedAt:string|null})=>!log.deletedAt)).toHaveLength(1);
  expect(data.vocabLog.filter((log:{deletedAt:string|null})=>log.deletedAt)).toHaveLength(2);
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Xóa ghi nhận ngày 09/10/2026',exact:true}).click();
  await expect(page.getByText('0 từ tích lũy',{exact:true})).toBeVisible();
  await expect(page.locator('[data-vocab-day]')).toHaveCount(0);
  await page.getByRole('button',{name:'Tổng Quan',exact:true}).click();
  await expect(page.getByRole('group',{name:'Chuỗi học 0 ngày',exact:true})).toBeVisible();
});
