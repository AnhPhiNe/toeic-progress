import { expect, test, type Page } from '@playwright/test';
import { openDesktopFlow, screenshot, storedCard, TIP } from './helpers/detailAI';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []);

test('a computer works through a test Part by Part: Part 5 images are read one by one, checked and saved', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  // Every wrong question has its place, Listening included; the Part with the most to do leads.
  await expect(flow.getByRole('heading', { name: /^Gỡ câu sai/ })).toBeVisible();
  await expect(flow.getByRole('img', { name: 'Đã ghi 0 trên 4 câu', exact: true })).toBeVisible();
  await expect(flow.getByText('Gỡ Part 5 trước nhé!', { exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Part 1 · Tranh, 1 câu sai/ })).toContainText('Chọn lý do');
  await expect(flow.getByRole('button', { name: /^Part 6 · Điền đoạn văn, 1 câu sai/ })).toContainText('Chụp trang chữa bài');

  await flow.getByRole('button', { name: /Chụp trang chữa bài Part 5/ }).click();
  await expect(flow.getByRole('heading', { name: /^Part 5 · Điền câu/ })).toBeVisible();
  await page.evaluate(() => { (window as Window & { __explainDelay?: number }).__explainDelay = 1500; });
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot]);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc 2 ảnh', exact: true }).click();

  // Each image is its own reading, compressed to JPEG on the device; the capture is one batch (one AI use).
  await expect(flow.getByRole('heading', { name: /^Sóc đọc được 2 câu/ })).toBeVisible();
  const sent = await calls(page) as { questions: number[]; images: number; context: number; batch: string; jpeg: boolean }[];
  expect(sent.map(call => [call.questions, call.images, call.context, call.jpeg])).toEqual([[[104, 112], 1, 0, true], [[104, 112], 1, 0, true]]);
  expect(new Set(sent.map(call => call.batch)).size).toBe(1);

  // Rows read like an answer sheet; a missing answer asks for a tap.
  await expect(flow.getByRole('group', { name: 'Câu 104: Bạn chọn C, đáp án A', exact: true })).toBeVisible();
  await expect(flow.getByRole('group', { name: 'Câu 112: Bạn chọn B, chưa có đáp án', exact: true })).toBeVisible();
  await expect(flow.getByText('Ảnh không có đáp án. Chạm chữ cái đúng.')).toBeVisible();
  await expect(flow.getByText(/Đang viết lời giải 2 câu/)).toBeVisible();

  // The explanation suggests the reason (and the page's missing answer); keys 1–6 change the reason on a row.
  await expect(flow.getByRole('group', { name: 'Vì sao sai câu 104' }).getByRole('button', { name: 'Ngữ pháp' })).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByRole('group', { name: 'Câu 112: Bạn chọn B, đáp án A', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).focus();
  await page.keyboard.press('1');
  await expect(flow.getByRole('group', { name: 'Vì sao sai câu 104' }).getByRole('button', { name: 'Từ vựng' })).toHaveAttribute('aria-pressed', 'true');
  // A tap on another letter sets the right answer.
  await flow.getByRole('group', { name: 'Câu 112: Bạn chọn B, đáp án A', exact: true }).getByRole('button', { name: 'Đáp án đúng D' }).click();
  await expect(flow.getByRole('group', { name: 'Câu 112: Bạn chọn B, đáp án D', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await expect(flow.getByText(TIP)).toBeVisible();

  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  // Back on the overview: a toast, the progress and the next Part.
  await expect(flow.getByRole('status').filter({ hasText: 'Đã lưu 2 câu vào Sổ tay' })).toBeVisible();
  await expect(flow.getByRole('img', { name: 'Đã ghi 2 trên 4 câu', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: /^Part 5 · Điền câu/ })).toContainText('Xong');
  expect(await storedCard(page, 104)).toMatchObject({ userChoice: 'C', correctAnswer: '(A) accommodates', category: 'VOCABULARY_TRAP', explanation: { quickTip: TIP } });
  // Changing a key also invalidates the earlier rationale and its inferred reason.
  const q112 = await storedCard(page, 112);
  expect(q112).toMatchObject({ userChoice: 'B', correctAnswer: '(D) to accommodate', category: 'OTHER' });
  expect(q112.explanation).toBeUndefined();
});

test('a Part 6 set sends its passage and question images together and keeps the right answers out', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /^Part 6 · Điền đoạn văn/ }).click();
  await expect(flow.getByRole('button', { name: /^Nhóm 131–134/ })).toHaveAttribute('aria-pressed', 'true');
  await flow.getByLabel('Ảnh đoạn văn', { exact: true }).setInputFiles(screenshot);
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc nhóm này', exact: true }).click();
  await expect(flow.getByRole('heading', { name: /^Sóc đọc được 2 câu/ })).toBeVisible();
  // One request: the passage as context, the question page as the image, the whole set's numbers.
  expect((await calls(page) as { questions: number[]; images: number; context: number }[]).map(call => [call.questions, call.images, call.context]))
    .toEqual([[[131, 132, 133, 134], 1, 1]]);
  await expect(flow.getByText(/bạn làm đúng, bỏ qua/)).toContainText('Câu 132');

  // AI solved 131 differently from the page: the row is yellow until the learner decides.
  await expect(flow.getByText('Sóc giải ra C, trang đề ghi A')).toBeVisible();
  await flow.getByRole('button', { name: 'Mở câu 131', exact: true }).click();
  await expect(flow.getByText('AI chọn', { exact: true })).toBeVisible();
  await expect(flow.getByText('Trang đề', { exact: true })).toBeVisible();
  await flow.getByRole('button', { name: /^▸ Đoạn văn: Library Reopens/ }).click();
  await expect(flow.getByText(/welcomed residents back/)).toBeVisible();
  await flow.getByRole('button', { name: 'Đổi sang C', exact: true }).click();
  await expect(flow.getByRole('group', { name: 'Câu 131: Bạn chọn B, đáp án C', exact: true })).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 1 câu', exact: true }).click();
  await expect(flow.getByRole('img', { name: 'Đã ghi 1 trên 4 câu', exact: true })).toBeVisible();
  expect(await storedCard(page, 131)).toMatchObject({ correctAnswer: '(C) accommodation', answerProvidedBy: 'LEARNER' });
  expect(await storedCard(page, 132)).toBeUndefined();
});

test('Part 1 asks only the reason; the Listening card is created when saved', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /^Part 1 · Tranh/ }).click();
  await expect(flow.getByLabel('Ảnh câu hỏi')).toHaveCount(0);
  await flow.getByRole('group', { name: 'Vì sao sai câu 3' }).getByRole('button', { name: 'Nghe', exact: true }).click();
  await flow.getByRole('button', { name: 'Lưu 1 câu', exact: true }).click();
  await expect(flow.getByRole('button', { name: /^Part 1 · Tranh/ })).toContainText('Xong');
  expect(await storedCard(page, 3)).toMatchObject({ part: 1, category: 'LISTENING_SPEED', id: expect.stringMatching(/^draft:/) });
});

test('a doubt left open when saving stays on the notebook card until the learner decides', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await flow.getByRole('button', { name: /^Part 6 · Điền đoạn văn/ }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: 'Gửi Sóc đọc nhóm này', exact: true }).click();
  await expect(flow.getByText('Sóc giải ra C, trang đề ghi A')).toBeVisible();
  await flow.getByRole('button', { name: 'Lưu 1 câu', exact: true }).click();
  await flow.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(flow).toHaveCount(0);

  expect(await storedCard(page, 131)).toMatchObject({ correctAnswer: '(A) accommodates', answerDoubt: 'C' });
  await gotoPage(page, '/so-tay');
  await openCard(page, /The new reading room/);
  await expect(page.getByRole('note')).toContainText('AI chọn C, trang đề chọn A.');
  await page.getByRole('button', { name: 'Giữ A', exact: true }).click();
  await expect(page.getByRole('note')).toHaveCount(0);
  const kept = await storedCard(page, 131);
  expect(kept.correctAnswer).toBe('(A) accommodates');
  expect(kept.answerDoubt).toBeUndefined();
});
