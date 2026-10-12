import { test, expect, type Page } from '@playwright/test';
import { switchToDarkOnMobile } from './helpers/theme';

async function seed(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/phan-tich');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = '2026-10-09T09:00:00Z';
    const parts = { part1:6,part2:25,part3:39,part4:30,part5:30,part6:16,part7:54 };
    const base = { skillType:'LR',sessionType:'FULL_TEST',durationMinutes:120,updatedAt:stamp,deletedAt:null,partScores:parts };
    data.sessions = [
      { ...base,id:'old',testName:'ETS A',date:'2026-09-13',createdAt:'2026-09-13T09:00:00Z',scaledListening:350,scaledReading:350,totalScore:700,partScores:{...parts,part5:15} },
      { ...base,id:'retake',testName:'ETS A',date:'2026-10-05',createdAt:'2026-10-05T09:00:00Z',scaledListening:400,scaledReading:400,totalScore:800 },
      { ...base,id:'other',testName:'ETS B',date:'2026-10-08',createdAt:'2026-10-08T09:00:00Z',scaledListening:450,scaledReading:450,totalScore:900 }
    ];
    data.mistakes = [
      { id:'old-note',createdAt:'2026-09-15T09:00:00Z',category:'ADVANCED_GRAMMAR',sourceTestName:'ETS A' },
      { id:'new-note',createdAt:'2026-10-06T09:00:00Z',category:'VOCABULARY_TRAP',sourceTestName:'ETS A' },
      { id:'other-note',createdAt:'2026-10-08T09:00:00Z',category:'TIME_PRESSURE',sourceTestName:'ETS B' }
    ].map(note=>({ ...note,part:5,questionContext:'Reports should ____ submitted.',userMistake:'A',correctAnswer:'B',options:['A. are','B. be'],trapTip:'Review',status:'NEEDS_REVIEW',tags:[],updatedAt:stamp,deletedAt:null }));
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(data));
  });
  await page.reload();
}
async function chooseTest(page: Page, name: string) {
  await page.getByRole('button',{name:/^Đề:/}).click();
  await page.getByRole('option',{name,exact:true}).click();
}

test('latest test defaults to its latest attempt; selecting an older attempt changes scores but keeps all source notes', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('button',{name:'Đề: ETS B',exact:true})).toBeVisible();
  await expect(page.getByLabel('Lần làm',{exact:true})).toHaveValue('other');
  await expect(page.getByLabel('Lần làm',{exact:true}).locator('option')).toHaveText(['Lần 1 · 08/10/2026 · Mới nhất']);
  await expect(page.locator('.date-range-trigger')).toHaveCount(0);
  await expect(page.getByRole('group',{name:'Thời gian',exact:true})).toHaveCount(0);
  await chooseTest(page,'ETS A');
  const attempts = page.getByLabel('Lần làm',{exact:true});
  const scorePanel = page.getByRole('region',{name:'Độ chính xác 7 Part',exact:true});
  const notesPanel = page.getByRole('region',{name:'Lỗi đã ghi của đề',exact:true});
  await expect(attempts).toHaveValue('retake');
  await expect(attempts.locator('option')).toHaveText(['Lần 2 · 05/10/2026 · Mới nhất','Lần 1 · 13/09/2026']);
  await expect(page.getByText('400/495',{exact:true})).toHaveCount(2);
  await expect(page.getByText(/Cả 7 Part đạt 100% trong lượt này/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Phiên tập trung',exact:true})).toHaveCount(0);
  await expect(page.getByRole('img',{name:/^2 lỗi đã ghi:/})).toBeVisible();
  await attempts.selectOption('old');
  await expect(scorePanel.getByRole('status')).toHaveText('Lần 1 · 13/09/2026');
  await expect(page.getByText('350/495',{exact:true})).toHaveCount(2);
  await expect(page.getByRole('img',{name:/Tỷ lệ đúng theo Part,.*P5: 50%/})).toBeVisible();
  await expect(page.getByRole('img',{name:/^2 lỗi đã ghi:/})).toBeVisible();
  await expect(notesPanel.getByText('Gồm các lần làm của đề',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Bấm giờ P5',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mở Sổ tay của đề',exact:true}).click();
  await expect(page).toHaveURL(/so-tay$/);
  await expect(page.getByRole('button',{name:/^Mở câu:/})).toHaveCount(2);
  await expect(page.getByText(/^Ngày ghi lỗi:/)).toHaveCount(0);
  await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();
  await page.getByRole('button',{name:'Đặt lại bộ lọc',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Mở câu:/})).toHaveCount(3);
});

test('a total-only latest attempt stays incomplete; switching tests resets the attempt without borrowing old details', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data=JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const retake=data.sessions.find((row:{id:string})=>row.id==='retake');
    delete retake.partScores; delete retake.scaledListening; delete retake.scaledReading;
    retake.scoreSource='MANUAL_TOTAL';
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(data));
  });
  await page.reload();
  await chooseTest(page,'ETS A');
  await expect(page.getByText('Lượt này chưa có chi tiết Part.',{exact:true})).toBeVisible();
  await expect(page.getByText(/Sổ tay ghi nhiều lỗi nhất ở nhóm/)).toBeVisible();
  await expect(page.getByText('Chưa ghi',{exact:true})).toHaveCount(2);
  await expect(page.getByRole('img',{name:/^Tỷ lệ đúng theo Part/})).toHaveCount(0);
  await page.getByLabel('Lần làm',{exact:true}).selectOption('old');
  await expect(page.getByRole('img',{name:/^Tỷ lệ đúng theo Part/})).toBeVisible();
  await chooseTest(page,'ETS B');
  await expect(page.getByLabel('Lần làm',{exact:true})).toHaveValue('other');
  await expect(page.getByLabel('Lần làm',{exact:true}).locator('option')).toHaveText(['Lần 1 · 08/10/2026 · Mới nhất']);
  await chooseTest(page,'ETS A');
  await expect(page.getByLabel('Lần làm',{exact:true})).toHaveValue('retake');
  await expect(page.getByText('Lượt này chưa có chi tiết Part.',{exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:/^2 lỗi đã ghi:/})).toBeVisible();
  await page.getByRole('button',{name:'Bổ sung chi tiết',exact:true}).click();
  const editor=page.getByRole('dialog');
  await expect(editor.getByLabel('Tên Đề Thi / Nguồn')).toHaveValue('ETS A');
  await expect(editor.getByLabel('Tổng điểm TOEIC /990')).toHaveValue('800');
  await editor.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByLabel('Lần làm',{exact:true}).locator('option')).toHaveCount(2);
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions);
  expect(records).toHaveLength(3);
  expect(records.find((row:{id:string})=>row.id==='retake')).toMatchObject({ id:'retake',date:'2026-10-05',totalScore:800 });
});

test('same-day retakes have distinct attempt labels and cannot be mixed with SW or Part practice', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data=JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const retake=data.sessions.find((row:{id:string})=>row.id==='retake');
    data.sessions.push({...retake,id:'same-day',createdAt:'2026-10-05T10:00:00Z',scaledReading:425});
    data.sessions.push({...retake,id:'sw',skillType:'SW',date:'2026-10-09'});
    data.sessions.push({...retake,id:'practice',sessionType:'PART_PRACTICE',date:'2026-10-09'});
    data.sessions.push({...retake,id:'deleted',date:'2026-10-09',deletedAt:'2026-10-09T09:00:00Z'});
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(data));
  });
  await page.reload();
  await chooseTest(page,'ETS A');
  const attempts=page.getByLabel('Lần làm',{exact:true});
  await expect(attempts.locator('option')).toHaveText(['Lần 3 · 05/10/2026 · Mới nhất','Lần 2 · 05/10/2026','Lần 1 · 13/09/2026']);
  await expect(attempts).toHaveValue('same-day');
  await expect(page.getByText('425/495',{exact:true})).toBeVisible();
  await attempts.selectOption('retake');
  await expect(page.getByText('400/495',{exact:true})).toHaveCount(2);
});

test('test and attempt controls fit mobile and desktop in both themes, with search and keyboard selection', async ({ page },testInfo) => {
  await seed(page);
  await chooseTest(page,'ETS A');
  for(const width of [320,375,768,1440]) {
    await page.setViewportSize({width,height:812});
    await page.getByRole('button',{name:'Đề: ETS A',exact:true}).click();
    const search=page.getByRole('combobox',{name:'Tìm đề',exact:true});
    await search.fill('ETS A');
    await expect(page.getByRole('listbox',{name:'Chọn đề',exact:true}).getByRole('option')).toHaveCount(1);
    await search.press('Enter');
    await expect(page.getByRole('button',{name:'Đề: ETS A',exact:true})).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const box=await page.getByLabel('Lần làm',{exact:true}).boundingBox();
    expect(box!.x+box!.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({path:testInfo.outputPath('analytics-attempts-desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await page.getByLabel('Lần làm',{exact:true}).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Lần làm',{exact:true})).toHaveValue('old');
  await switchToDarkOnMobile(page);
  await expect.poll(() => page.locator('.analytics-panel').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 26, 44)');
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity).map(animation => animation.finished.catch(() => {}))); });
  await page.screenshot({path:testInfo.outputPath('analytics-attempts-mobile.png'),fullPage:true});
});
