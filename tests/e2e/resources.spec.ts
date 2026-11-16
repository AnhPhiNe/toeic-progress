import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/quy-doi');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions = [{ id: 'score-reference', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS 2024 Test 04', date: '2026-10-09', durationMinutes: 120, rawListening: 97, rawReading: 94, totalScore: 985, scaledListening: 495, scaledReading: 490, createdAt: '2026-10-09T09:00:00Z', deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
}

const stamp = (page: Page, label: string) => page.locator('.cv-stamp', { hasText: label });

test('the passport shows the equivalents, qualifies per skill and never assigns C2 from TOEIC', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('estimated-total')).toHaveText('900');
  await expect(stamp(page, 'CEFR')).toContainText('B2');
  await expect(stamp(page, 'IELTS')).toContainText('5.5–6.5');
  await expect(stamp(page, 'VSTEP')).toContainText('Bậc 4');
  await expect(stamp(page, 'TOEFL iBT')).toContainText('4–4.5');
  await expect(page.getByRole('button', { name: /ETS 2024 Test 04/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Số câu đúng Nghe', { exact: true }).fill('80');
  await page.getByLabel('Số câu đúng Đọc', { exact: true }).fill('95');
  await expect(stamp(page, 'CEFR')).toContainText('B1');
  await expect(page.getByTestId('estimated-total')).toHaveText('770');
  await expect(page.getByRole('button', { name: /ETS 2024 Test 04/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Số câu đúng Nghe', { exact: true }).fill('87');
  await page.getByLabel('Số câu đúng Đọc', { exact: true }).fill('87');
  await expect(page.getByTestId('estimated-total')).toHaveText('805');
  await expect(stamp(page, 'CEFR')).toContainText('B2');
  await page.getByRole('button', { name: /ETS 2024 Test 04/ }).click();
  await expect(page.getByLabel('Số câu đúng Nghe', { exact: true })).toHaveValue('97');
  await expect(page.getByLabel('Số câu đúng Đọc', { exact: true })).toHaveValue('94');
  // Journey: A1-B1 passed, B2 is here, C1 is next and C2 is outside TOEIC.
  const road = page.getByRole('region', { name: 'Hành trình CEFR' });
  await expect(road.getByRole('listitem')).toHaveCount(6);
  await expect(road.locator('[aria-current="step"]')).toContainText('B2');
  await expect(road.getByRole('listitem').nth(4)).toContainText('945+');
  await expect(road.getByRole('listitem').nth(5)).toContainText('ngoài TOEIC');
  await expect(page.getByText('Sang C1 cần 945+', { exact: true })).toBeVisible();
  await page.getByLabel('Số câu đúng Nghe', { exact: true }).fill('0');
  await page.getByLabel('Số câu đúng Đọc', { exact: true }).fill('0');
  await expect(stamp(page, 'CEFR')).toContainText('Dưới A1');
  await expect(road.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'ETS', exact: true })).toHaveAttribute('href', 'https://www.ets.org/pdfs/toeic/toeic-mapping-cefr-reference.pdf');
});

test('the converter uses conservative ranges, wrong-answer mode and stepper controls', async ({ page }) => {
  await open(page);
  await page.getByLabel('Số câu đúng Nghe', { exact: true }).fill('0');
  await page.getByLabel('Số câu đúng Đọc', { exact: true }).fill('93');
  await expect(page.getByTestId('estimated-total')).toHaveText('430');
  await expect(page.getByRole('button', { name: 'Giảm số câu đúng Nghe', exact: true })).toBeDisabled();
  await expect(stamp(page, 'CEFR')).toContainText('Dưới A1');
  await page.getByRole('button', { name: 'Câu sai', exact: true }).click();
  await expect(page.getByLabel('Số câu sai Nghe', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Số câu sai Đọc', { exact: true })).toHaveValue('7');
  await page.getByLabel('Số câu sai Nghe', { exact: true }).fill('0');
  await page.getByLabel('Số câu sai Đọc', { exact: true }).fill('0');
  await expect(page.getByTestId('estimated-total')).toHaveText('990');
  await expect(page.getByText(/đã chạm/)).toBeVisible();
  await page.getByRole('button', { name: 'Câu đúng', exact: true }).click();
  await expect(page.getByLabel('Số câu đúng Nghe', { exact: true })).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Tăng số câu đúng Đọc', exact: true })).toBeDisabled();
  await page.getByLabel('Số câu đúng Nghe', { exact: true }).fill('99');
  await page.getByLabel('Số câu đúng Đọc', { exact: true }).fill('99');
  await expect(page.getByTestId('estimated-total')).toHaveText('935');
  await page.getByRole('button', { name: 'Tăng số câu đúng Nghe', exact: true }).click();
  await expect(page.getByTestId('estimated-total')).toHaveText('955');
  await page.getByLabel('Số câu đúng Đọc', { exact: true }).press('ArrowUp');
  await expect(page.getByTestId('estimated-total')).toHaveText('990');
  await page.getByRole('slider', { name: 'Thanh số câu đúng Đọc' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByLabel('Số câu đúng Đọc', { exact: true })).toHaveValue('0');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('the page fits the window without scrolling', async ({ page }) => {
  await open(page);
  for (const [width, height] of [[1440, 900], [1600, 925], [1640, 860]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await expect(page.getByLabel('Số câu đúng Nghe',{exact:true})).toHaveValue('97');
  await expect(page.getByLabel('Số câu đúng Đọc',{exact:true})).toHaveValue('94');
  await expect(page.getByTestId('estimated-total')).toHaveText('900');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((s:{id:string})=>s.id==='fractional-legacy').rawListening)).toBe(88.5);
  expect(errors).toEqual([]);
});

test('an untouched converter follows the newest test and explicit numbers stay until a test is picked', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    bundle.sessions.unshift({ ...bundle.sessions[0], id: 'newer', testName: 'New latest one error', date: '2026-10-12', rawListening: 100, rawReading: 99 });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload();
  await expect(page.getByLabel('Số câu đúng Nghe', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Số câu đúng Đọc', { exact: true })).toHaveValue('99');
  await expect(page.getByTestId('estimated-total')).toHaveText('955');
  await page.getByLabel('Số câu đúng Nghe', { exact: true }).fill('30');
  await expect(page.getByRole('button', { name: /New latest one error/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /ETS 2024 Test 04/ }).click();
  await expect(page.getByLabel('Số câu đúng Nghe', { exact: true })).toHaveValue('97');
  await expect(page.getByLabel('Số câu đúng Đọc', { exact: true })).toHaveValue('94');
  await expect(page.getByTestId('estimated-total')).toHaveText('900');
});

test('phones put the estimate first, step each skill on its wheel and restore the latest test', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const result = page.getByRole('region', { name: 'Kết quả quy đổi', exact: true });
  await expect(result.getByTestId('estimated-total')).toHaveText('900');
  await expect(result).toContainText('CEFR');
  await expect(result).toContainText('B2');
  const latest = page.getByRole('button', { name: /^ETS 2024 Test 04/ });
  await expect(latest).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Tự nhập', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // Each skill is a wheel (a spinbutton): keys step the number of correct answers and the estimate follows.
  const listening = page.getByRole('spinbutton', { name: 'Nghe: số câu', exact: true });
  await listening.focus();
  await page.keyboard.press('ArrowUp');
  await expect(listening).toHaveAttribute('aria-valuenow', '96');
  await expect(page.getByRole('button', { name: 'Tự nhập', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(latest).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('PageUp');
  await expect(listening).toHaveAttribute('aria-valuenow', '86');
  await expect(result.getByTestId('estimated-total')).not.toHaveText('900');
  const reading = page.getByRole('spinbutton', { name: 'Đọc: số câu', exact: true });
  await reading.focus();
  await page.keyboard.press('PageUp');
  await expect(reading).toHaveAttribute('aria-valuenow', '84');
  await latest.click();
  await expect(result.getByTestId('estimated-total')).toHaveText('900');
  await expect(listening).toHaveAttribute('aria-valuenow', '97');
  await expect(reading).toHaveAttribute('aria-valuenow', '94');
  await page.getByRole('button', { name: 'Nguồn và cách ước tính', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cách ước tính', exact: true })).toContainText('IIBC 2023');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
