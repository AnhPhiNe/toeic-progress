import { test, expect, type Page } from '@playwright/test';
import { usePartCounts } from './helpers/sessionForm';

async function open(page: Page) {
  await page.goto('/quy-doi');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions = [{ id: 'score-reference', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS 2024 Test 04', date: '2026-10-09', durationMinutes: 120, rawListening: 97, rawReading: 94, totalScore: 985, scaledListening: 495, scaledReading: 490, createdAt: '2026-10-09T09:00:00Z', deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
}

test('score references retain calculator controls, qualify per skill and never assign C2 from TOEIC', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true }).getByText('CEFR tham khảo: B2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lấy từ bài thi:/ })).toBeDisabled();
  const inputs = page.getByRole('spinbutton');
  await inputs.nth(0).fill('80');
  await inputs.nth(1).fill('95');
  await expect(page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true }).getByText('CEFR tham khảo: B1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('estimated-total')).toHaveText('770');
  await inputs.nth(0).fill('87');
  await inputs.nth(1).fill('87');
  await expect(page.getByTestId('estimated-total')).toHaveText('805');
  await expect(page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true }).getByText('CEFR tham khảo: B2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Lấy từ bài thi:/ }).click();
  await expect(inputs.nth(0)).toHaveValue('97');
  await expect(inputs.nth(1)).toHaveValue('94');
  await page.getByRole('button', { name: 'Bảng Đối Chiếu Thang Điểm', exact: true }).click();
  await expect(page.getByRole('columnheader')).toHaveCount(5);
  await expect(page.getByRole('row')).toHaveCount(7);
  await expect(page.getByText(/không quy đổi điểm chính thức/)).toBeVisible();
  const current = page.getByRole('row').filter({ has: page.getByText('945đ', { exact: true }) });
  await expect(current.getByRole('cell').first()).toHaveText('945đ');
  await expect(current.getByRole('cell').first()).toHaveAttribute('title', 'Listening từ 490đ và Reading từ 455đ.');
  await expect(current).not.toHaveClass(/bg-amber-100/);
  await expect(page.getByRole('row').filter({ has: page.getByText('785đ', { exact: true }) })).toHaveClass(/bg-amber-100/);
  await expect(current).toContainText('C1');
  await expect(current).not.toContainText('C2');
  await expect(current.getByRole('cell').nth(2)).toHaveText('7.0–8.0');
  await expect(current.getByRole('cell').nth(3)).toHaveText('Bậc 5');
  await expect(current.getByRole('cell').nth(4)).toHaveText('5–5.5');
  const c2 = page.getByRole('row').filter({ has: page.getByText('C2', { exact: true }) });
  await expect(c2.getByRole('cell').first()).toHaveText('—');
  await expect(c2.getByRole('cell').first()).toHaveAttribute('title', 'TOEIC Listening & Reading không đối chiếu đến C2.');
  await expect(c2.getByRole('cell').nth(3)).toHaveText('—');
  await expect(page.getByRole('table')).not.toContainText('≈');
  await expect(page.getByRole('link', { name: 'ETS TOEIC', exact: true })).toHaveAttribute('href', 'https://www.ets.org/pdfs/toeic/toeic-mapping-cefr-reference.pdf');
  await page.getByRole('button', { name: 'Máy Tính Điểm Dự Phóng', exact: true }).click();
  await inputs.nth(0).fill('0');
  await inputs.nth(1).fill('0');
  await expect(page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true }).getByText('CEFR tham khảo: Dưới A1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bảng Đối Chiếu Thang Điểm', exact: true }).click();
  await expect(page.getByRole('row').filter({ has: page.getByText('945đ', { exact: true }) })).not.toHaveClass(/bg-amber-100/);
});


test('calculator uses conservative ranges consistently and supports mobile controls', async ({ page }) => {
  await open(page);
  await page.getByLabel('Số câu đúng Listening', { exact: true }).fill('0');
  await page.getByLabel('Số câu đúng Reading', { exact: true }).fill('93');
  await expect(page.getByTestId('estimated-total')).toHaveText('430');
  await expect(page.getByText('Khoảng tham khảo: 430–525đ', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Giảm số câu Listening', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true }).getByText('CEFR tham khảo: Dưới A1', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ước tính Listening', exact: true })).toContainText('CEFR tham khảo: Dưới A1');
  await expect(page.getByRole('region', { name: 'Ước tính Reading', exact: true })).toContainText('CEFR tham khảo: B2');
  await page.getByRole('group', { name: 'Chọn nhanh Listening' }).getByRole('button', { name: /^100 câu/ }).click();
  await page.getByRole('group', { name: 'Chọn nhanh Reading' }).getByRole('button', { name: /^100 câu/ }).click();
  await expect(page.getByTestId('estimated-total')).toHaveText('990');
  await expect(page.getByText('Đúng toàn bộ 200 câu', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tăng số câu Reading', exact: true })).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true })).toContainText('CEFR tham khảo: C1');
  await page.getByLabel('Số câu đúng Listening', { exact: true }).fill('99');
  await page.getByLabel('Số câu đúng Reading', { exact: true }).fill('99');
  await expect(page.getByTestId('estimated-total')).toHaveText('935');
  await page.getByRole('button', { name: 'Tăng số câu Listening', exact: true }).click();
  await expect(page.getByTestId('estimated-total')).toHaveText('955');
  await page.getByRole('button', { name: 'Tăng số câu Reading', exact: true }).click();
  await expect(page.getByTestId('estimated-total')).toHaveText('990');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});


test('legacy records with invalid raw counts cannot crash the calculator or displace a valid earlier test', async ({ page }) => {
  await open(page);
  const errors:string[]=[];page.on('pageerror', error=>errors.push(error.message));
  await page.evaluate(()=>{
    const bundle=JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions.unshift({...bundle.sessions[0], id:'fractional-legacy',date:'2026-10-10',testName:'Fractional legacy',rawListening:88.5});
    localStorage.setItem('toeic_progress_bundle_v3',JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.getByLabel('Số câu đúng Listening',{exact:true})).toHaveValue('97');
  await expect(page.getByLabel('Số câu đúng Reading',{exact:true})).toHaveValue('94');
  await expect(page.getByTestId('estimated-total')).toHaveText('900');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((s:{id:string})=>s.id==='fractional-legacy').rawListening)).toBe(88.5);
  expect(errors).toEqual([]);
});

test('new data updates an untouched calculator and preserves explicit simulations until restored', async ({ page }) => {
  await open(page);
  async function saveParts(name:string, part7:number) {
    await page.getByRole('button',{name:'Ghi điểm, phím tắt N'}).click();
    const dialog=page.getByRole('dialog',{name:'Ghi điểm'});
    await dialog.getByLabel('Tên Đề Thi / Nguồn').fill(name);
    await usePartCounts(dialog);
    for(const [index,count] of [6,25,39,30,30,16,part7].entries()) await dialog.getByLabel('Số câu đúng Part '+(index+1),{exact:true}).fill(String(count));
    await dialog.getByRole('button',{name:'Lưu kết quả'}).click();
    await expect(dialog).not.toBeVisible();
  }
  await saveParts('New latest perfect',54);
  await expect(page.getByLabel('Số câu đúng Listening',{exact:true})).toHaveValue('100');
  await expect(page.getByLabel('Số câu đúng Reading',{exact:true})).toHaveValue('100');
  await expect(page.getByTestId('estimated-total')).toHaveText('990');
  await page.getByLabel('Số câu đúng Listening',{exact:true}).fill('30');
  await page.getByLabel('Số câu đúng Reading',{exact:true}).fill('30');
  await saveParts('New latest one error',53);
  await expect(page.getByLabel('Số câu đúng Listening',{exact:true})).toHaveValue('30');
  await expect(page.getByLabel('Số câu đúng Reading',{exact:true})).toHaveValue('30');
  await page.getByRole('button',{name:/Lấy từ bài thi:/}).click();
  await expect(page.getByLabel('Số câu đúng Listening',{exact:true})).toHaveValue('100');
  await expect(page.getByLabel('Số câu đúng Reading',{exact:true})).toHaveValue('99');
  await expect(page.getByTestId('estimated-total')).toHaveText('955');
  await page.getByRole('button',{name:'Xem đối chiếu CEFR',exact:true}).click();
  const matrixButton=page.getByRole('button',{name:'Bảng Đối Chiếu Thang Điểm',exact:true});
  await expect(matrixButton).toBeFocused();
  await expect(matrixButton).toHaveAttribute('aria-pressed','true');
});

test('phones put the estimate first, step each skill and restore the latest test', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const total = page.getByRole('region', { name: 'Tổng điểm dự kiến', exact: true });
  await expect(total.getByTestId('estimated-total')).toHaveText('900');
  await expect(page.getByRole('button', { name: /^Lấy từ bài thi gần nhất/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Giảm số câu Listening', exact: true }).click();
  await expect(page.getByLabel('Số câu đúng Listening', { exact: true })).toHaveValue('96');
  await expect(page.getByRole('region', { name: 'Ước tính Listening', exact: true })).toContainText('câu đúng');
  await page.getByLabel('Số câu đúng Reading', { exact: true }).fill('60');
  await expect(total.getByTestId('estimated-total')).not.toHaveText('900');
  await page.getByRole('button', { name: /^Lấy từ bài thi gần nhất/ }).click();
  await expect(total.getByTestId('estimated-total')).toHaveText('900');
  await page.getByRole('button', { name: 'Cách ước tính điểm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cách ước tính điểm', exact: true })).toContainText('IIBC 2023');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bảng đối chiếu', exact: true }).click();
  await expect(page.locator('[aria-current="true"]')).toContainText('B2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
