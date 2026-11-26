import { mkdirSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { mockWrongDetailAI, openFromNotebook, pageTopPng, seedTests, stored, TEST, WRONG } from './helpers/wrongDetail';
import { mockResultsAI } from './helpers/resultsAI';
import { openScoreLogger } from './helpers/nav';

const DESKTOP = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844 };
// CV_SHOTS=1 saves the built screens next to the approved mockups (CV_SHOTS_DIR, default design/previews/capture-v3/built).
const BUILT = process.env.CV_SHOTS_DIR ?? 'design/previews/capture-v3/built';
async function shot(page: Page, name: string) {
  if (!process.env.CV_SHOTS) return;
  mkdirSync(BUILT, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${BUILT}/${name}.png` });
}

/** A flat white page: no edges, so the on-device check calls it blurry. */
function flatPng(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 240)])));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  return { name: 'flat.png', mimeType: 'image/png', buffer: png };
}

const SEVEN = [14, 22, 38, 45, 46, 71, 88, 103, 107, 112, 128, 135, 149, 189];
const OPTIONS = ['(A) by', '(B) until', '(C) at', '(D) since'];
const read = (number: number, question: string, choice: string, answer: string, context = '') => ({
  number, draft: { part: number >= 147 ? 7 : number >= 131 ? 6 : 5, category: 'VOCABULARY_TRAP', question, questionContext: question, context,
    options: OPTIONS, correctAnswer: OPTIONS['ABCD'.indexOf(answer)], answerSource: 'PROVIDED', userChoice: choice, userChoiceState: 'CHOSEN',
    userMistake: '', trapTip: '', tags: [], missingInformation: [], optionNotes: [], explanation: null }
});
const EMAIL = 'Đoạn 1 — Email\nFrom: Lena Ortiz\nI am writing about my stay.';
const READS: Record<number, ReturnType<typeof read>> = {
  103: read(103, 'The manager asked that all reports ___ by Friday.', 'B', 'C'),
  107: read(107, 'Ms. Lee has worked ___ the finance team since 2019.', 'A', 'D'),
  112: read(112, 'Tickets are available ___ the front desk.', 'D', 'B'),
  128: read(128, 'The new parking policy will take effect ___ the end of the month.', 'B', 'C'),
  135: read(135, 'Đoạn 135–138 · thư gửi khách hàng', 'C', 'A', 'Dear customer, …'),
  149: read(149, 'What is the purpose of the e-mail?', 'A', 'C', EMAIL),
  189: read(189, 'What will Ms. Tran most likely do next?', 'B', 'D', EMAIL)
};

async function mockSeven(page: Page, omit: number[] = []) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true, pageContextImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI(questions) {
        await new Promise(resolve => setTimeout(resolve, window.__pageDelay ?? 0));
        const reads = ${JSON.stringify(READS)}; const omit = ${JSON.stringify(omit)};
        const items = questions.map(item => reads[item.number]).filter(item => item && !omit.includes(item.number));
        return { items, missing: questions.map(item => item.number).filter(number => !items.some(item => item.number === number)), explainTicket: null, explainNumbers: [], usage: {} };
      }
      export async function explainBatchWithAI() { return { failed: [], items: [] }; }`
  }));
}

async function openSeven(page: Page, size = DESKTOP, omit: number[] = []) {
  await page.setViewportSize(size);
  await mockSeven(page, omit);
  await seedTests(page, [{ id: 's7', name: TEST, wrong: SEVEN }]);
  const flow = await openFromNotebook(page);
  await flow.getByRole('button', { name: 'Bỏ qua phần Nghe', exact: true }).click();
  return flow;
}
const delay = (page: Page, ms: number) => page.evaluate(value => { (window as Window & { __pageDelay?: number }).__pageDelay = value; }, ms);
const files = (count: number) => Array.from({ length: count }, () => pageTopPng());
const send = (flow: ReturnType<Page['locator']>) => flow.getByRole('button', { name: /^Gửi Sóc đọc/ });

test('desktop: quick buttons stay visible under the zone and Cách khác holds the rest', async ({ page }) => {
  const flow = await openSeven(page);
  await flow.getByRole('button', { name: 'Nhóm 149–150', exact: true }).click();
  await expect(flow.getByRole('heading', { name: 'Nhóm 149–150', level: 3 })).toBeVisible();
  for (const name of [/^Dán ảnh vừa chụp/, /^Tự nhận ảnh mới/, /^Chọn ảnh/]) await expect(flow.getByRole('button', { name })).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Ảnh giấy/ })).toHaveCount(0);
  // Part 7: two zones, the primary waits for the question photos.
  await expect(flow.getByText('Đoạn văn', { exact: true })).toBeVisible();
  await expect(flow.getByText('Câu hỏi', { exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Gửi Sóc đọc/ })).toBeDisabled();
  await expect(flow.getByText('Thêm ảnh câu hỏi để gửi')).toBeVisible();
  await flow.getByRole('button', { name: /^Cách khác/ }).click();
  for (const name of ['Ghi tay câu này', 'Bỏ qua nhóm này', 'Đổi dải câu']) await expect(flow.getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeVisible();
  await shot(page, '2c-part7-o3-cach-khac-desktop');
  await flow.getByRole('menuitem', { name: /^Đổi dải câu/ }).click();
  await expect(flow.getByRole('group', { name: 'Đổi dải câu Part 7' })).toBeVisible();
});

test('phone: ⋯ opens a sheet with the other ways', async ({ page }) => {
  const flow = await openSeven(page, PHONE);
  await flow.getByRole('button', { name: 'Nhóm 149–150', exact: true }).click();
  await flow.getByRole('button', { name: 'Thêm lựa chọn', exact: true }).click();
  const sheet = flow.getByRole('dialog', { name: 'Thêm lựa chọn' });
  for (const name of ['Dán ảnh vừa chụp', 'Ghi tay câu này', 'Bỏ qua nhóm này', 'Đổi dải câu']) await expect(sheet.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await shot(page, '2c-part7-o3-cach-khac-phone');
  await sheet.getByRole('button', { name: /^Ghi tay câu này/ }).click();
  await expect(page.getByRole('group', { name: 'Ghi tay một câu' })).toBeVisible();
});

test('phone: the bottom primary is always the action that works now', async ({ page }) => {
  const flow = await openSeven(page, PHONE);
  const bar = flow.locator('.cv-bar');
  // Empty Part 5: take or choose a photo.
  await expect(bar.getByRole('button', { name: /^Chụp hoặc chọn ảnh/ })).toBeVisible();
  await shot(page, '2a-part5-trong-phone');
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(files(2));
  await expect(bar.getByRole('button', { name: /^Gửi Sóc đọc · Tấm tiếp/ })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Chụp tiếp', exact: true })).toBeVisible();
  // The outlined button sits 16px below the primary.
  const gap = await bar.evaluate(node => {
    const [first, second] = [...node.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return Math.round(second.top - first.bottom);
  });
  expect(gap).toBe(16);
  await shot(page, '2b-part5-da-them-phone');
  // Part 7 with passage photos only: the primary asks for the question photos.
  await flow.getByRole('button', { name: 'Nhóm 149–150', exact: true }).click();
  await flow.getByRole('tab', { name: /^Đoạn văn/ }).click();
  await flow.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(files(3));
  await expect(bar.getByRole('button', { name: /^Chụp câu hỏi/ })).toBeVisible();
  await expect(bar.getByText('Cần ảnh câu hỏi để gửi')).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Gửi Sóc đọc/ })).toHaveCount(0);
  await shot(page, '2c-part7-o1-phone');
  await flow.getByRole('tab', { name: /^Câu hỏi/ }).click();
  await shot(page, '2c-part7-o2-phone');
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(files(1));
  await expect(bar.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm tiếp/ })).toBeVisible();
});

test('phone: a thumbnail opens a full-screen preview and "Chuyển sang" moves the photo to the other zone', async ({ page }) => {
  const flow = await openSeven(page, PHONE);
  await flow.getByRole('button', { name: 'Nhóm 149–150', exact: true }).click();
  await flow.getByRole('tab', { name: /^Đoạn văn/ }).click();
  await flow.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(files(3));
  await flow.getByRole('img', { name: 'Ảnh đoạn văn 2', exact: true }).click();
  const preview = flow.getByRole('dialog', { name: /^Xem ảnh 2\/3/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Ảnh 2/3')).toBeVisible();
  await shot(page, '2i-xem-anh-phone');
  await preview.getByRole('button', { name: 'Chuyển sang Câu hỏi', exact: true }).click();
  const open = flow.locator('.cv-pv');
  await open.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(flow.getByRole('tab', { name: 'Đoạn văn · 2' })).toBeVisible();
  await expect(flow.getByRole('tab', { name: 'Câu hỏi · 1' })).toBeVisible();
  // Nothing moved by itself: the photo went where the learner sent it, and Xoá removes one.
  await flow.getByRole('img', { name: 'Ảnh đoạn văn 1', exact: true }).click();
  await flow.locator('.cv-pv').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(flow.locator('.cv-pv')).toContainText('Ảnh 1/1');
});

test('Ghi điểm: "Lưu điểm" appears only after Sóc has read the photo; quick tools sit right below the dropzone', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await mockResultsAI(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('toeic_onboarding_done_v1', 'true'));
  await page.reload();
  await openScoreLogger(page);
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await expect(form.getByRole('button', { name: 'Chọn ảnh', exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Lưu điểm', exact: true })).toHaveCount(0);
  await shot(page, '6a-ghi-diem-desktop');
  for (const name of [/^Dán ảnh vừa chụp/, /^Tự nhận ảnh mới/, /^Không có ảnh\? Tự nhập tay/]) {
    await expect(form.getByRole('button', { name })).toBeVisible();
  }
  await expect(form.getByRole('button', { name: /^Phiếu tô giấy/ })).toHaveCount(0);
  await shot(page, '6b-ghi-diem-cach-khac-desktop');
  await form.getByLabel('Ảnh kết quả', { exact: true }).setInputFiles(pageTopPng());
  await expect(form.getByRole('button', { name: 'Lưu điểm', exact: true })).toBeVisible({ timeout: 10000 });
  await shot(page, '6c-ghi-diem-da-doc-desktop');
});

for (const size of [DESKTOP, PHONE]) {
  const phone = size === PHONE, kind = phone ? 'phone' : 'desktop';
  test(`screens for the design review: Part 5, blurry photo, missing number (${kind})`, async ({ page }) => {
    test.skip(!process.env.CV_SHOTS, 'CV_SHOTS=1 takes the built screenshots');
    const flow = await openSeven(page, size, [128]);
    const inputQ = flow.getByLabel('Ảnh câu hỏi', { exact: true });
    await shot(page, `2a-part5-trong-${kind}`);
    await inputQ.setInputFiles(files(2));
    await shot(page, `2b-part5-da-them-${kind}`);
    await inputQ.setInputFiles(flatPng(500, 700));
    await shot(page, `2g-anh-mo-${kind}`);
    await flow.getByRole('button', { name: 'Vẫn gửi', exact: true }).first().click();
    await expect(flow.getByRole('button', { name: /^Tấm 1 · câu 103–112, xong/ })).toBeVisible({ timeout: 10000 });
    await flow.getByRole('button', { name: /^Tấm 2/ }).click();
    await expect(flow.getByText(/Còn thiếu câu/).first()).toBeVisible();
    await inputQ.setInputFiles(files(1));
    await shot(page, `2f-con-thieu-${kind}`);
  });

  test(`screens for the design review: Part 7 to saved (${kind})`, async ({ page }) => {
    test.skip(!process.env.CV_SHOTS, 'CV_SHOTS=1 takes the built screenshots');
    const flow = await openSeven(page, size);
    const inputQ = flow.getByLabel('Ảnh câu hỏi', { exact: true });
    await inputQ.setInputFiles(files(1));
    await send(flow).click();
    await expect(flow.getByRole('button', { name: /^Tấm 1 · câu 103–112, xong/ })).toBeVisible({ timeout: 10000 });
    await flow.getByRole('button', { name: /^Nhóm 135–138/ }).click();
    await inputQ.setInputFiles(files(1));
    await send(flow).click();
    await flow.getByRole('button', { name: /^Nhóm 149–150/ }).click();
    if (phone) await flow.getByRole('tab', { name: /^Đoạn văn/ }).click();
    await flow.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(files(3));
    await shot(page, `2c-part7-o1-${kind}`);
    if (!phone) await flow.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(files(2));
    if (!phone) await shot(page, `2c-part7-o4-nhieu-anh-${kind}`);
    if (phone) { await flow.getByRole('tab', { name: /^Câu hỏi/ }).click(); await shot(page, `2c-part7-o2-${kind}`); }
    await delay(page, 5000);
    if (phone) await flow.getByRole('tab', { name: /^Câu hỏi/ }).click();
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(files(1));
    await send(flow).click();
    await expect(flow.getByText('Sóc đang đọc… ~10 giây')).toBeVisible().catch(() => undefined);
    await shot(page, `2d-doc-nhom-truoc-${kind}`);
    await expect(flow.getByRole('button', { name: /^Nhóm 149–150, xong/ })).toBeVisible({ timeout: 15000 });
    await delay(page, 0);
    await flow.getByRole('button', { name: /^Nhóm 189|^Nhóm 186–190/ }).first().click();
    if (phone) await flow.getByRole('tab', { name: /^Câu hỏi/ }).click();
    await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(files(1));
    await send(flow).click();
    await expect(flow.getByRole('button', { name: /^Lưu tất cả/ })).toBeVisible({ timeout: 15000 });
    await flow.getByRole('button', { name: phone ? 'Quay lại' : /^Chụp thêm/ }).click();
    await expect(flow.getByText(/câu sai đã sẵn sàng thành thẻ/)).toBeVisible();
    await shot(page, `2e-soat-${kind}`);
    await flow.getByRole('button', { name: /^Soát \d+ câu/ }).click();
    await flow.getByRole('button', { name: /^Lưu tất cả/ }).click();
    await expect(flow.getByText(/^Đã lưu \d+ thẻ vào Sổ tay/)).toBeVisible();
    await shot(page, `2h-da-luu-${kind}`);
    expect((await stored(page)).length).toBeGreaterThan(0);
  });
}

for (const size of [DESKTOP, PHONE]) {
  const phone = size === PHONE, kind = phone ? 'phone' : 'desktop';
  test(`Sổ tay capture uses the same calm layout and bottom-bar rules (${kind})`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockWrongDetailAI(page);
    await seedTests(page, [{ id: 's1', name: TEST, wrong: WRONG }]);
    await page.evaluate(() => localStorage.setItem('toeic.capture.tipsSeen', '1'));
    await page.goto('/so-tay');
    await page.getByRole('button', { name: phone ? /Chụp$/ : /Chụp trang chữa bài/ }).first().click();
    const capture = page.getByRole('dialog', { name: 'Chụp trang chữa bài', exact: true });
    await shot(page, `7-so-tay-trong-${kind}`);
    if (phone) {
      await expect(capture.getByRole('button', { name: /^Chụp hoặc chọn ảnh/ }).last()).toBeVisible();
      await capture.getByRole('button', { name: 'Part 7 · Đọc hiểu', exact: true }).click();
      await capture.getByRole('button', { name: /^Nhóm 186–190/ }).click();
      await capture.getByRole('tab', { name: /^Đoạn văn/ }).click();
      await capture.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(files(2));
      // Passage photos alone: the primary asks for the question photos.
      await expect(capture.getByRole('button', { name: /^Chụp câu hỏi/ })).toBeVisible();
      await expect(capture.getByText('Cần ảnh câu hỏi để gửi')).toBeVisible();
      await shot(page, `7-so-tay-doan-van-${kind}`);
      await capture.getByRole('tab', { name: /^Câu hỏi/ }).click();
      await capture.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(files(1));
      await expect(capture.getByRole('button', { name: /^Gửi Sóc đọc/ })).toBeVisible();
      await expect(capture.getByRole('button', { name: /^Chụp tiếp/ })).toBeVisible();
      await shot(page, `7-so-tay-san-sang-${kind}`);
      await capture.getByRole('button', { name: 'Thêm lựa chọn', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Thêm lựa chọn' }).getByRole('button', { name: /^Tự gõ một câu/ })).toBeVisible();
    } else {
      for (const name of [/^Dán ảnh vừa chụp/, /^Tự nhận ảnh mới/, /^Chọn ảnh/]) await expect(capture.getByRole('button', { name })).toBeVisible();
      await expect(capture.getByRole('button', { name: 'Gửi Sóc đọc', exact: true })).toBeDisabled();
      await capture.getByRole('button', { name: 'Part 7 · Đọc hiểu', exact: true }).click();
      await capture.getByRole('button', { name: /^Nhóm 186–190/ }).click();
      await capture.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(files(2));
      await expect(capture.getByRole('button', { name: 'Gửi Sóc đọc', exact: true })).toBeDisabled();
      await capture.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(files(1));
      await expect(capture.getByRole('button', { name: 'Gửi Sóc đọc', exact: true })).toBeEnabled();
      await shot(page, `7-so-tay-san-sang-${kind}`);
      await capture.getByRole('button', { name: /^Cách khác/ }).click();
      for (const name of ['Tự gõ một câu', 'Gửi & chụp tiếp']) await expect(capture.getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
  });
}
