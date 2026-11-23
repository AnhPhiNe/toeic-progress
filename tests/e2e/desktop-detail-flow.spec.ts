import { expect, test, type Page } from '@playwright/test';
import { openDesktopFlow, screenshot, skipListening, storedCard, TIP } from './helpers/detailAI';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const calls = (page: Page) => page.evaluate(() => (window as Window & { __pageCalls?: unknown[] }).__pageCalls ?? []);

test('a computer works through a test: Listening first, then the shot list; Part 5 is read, checked in Soát and saved', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  // Listening asks only the reason; it can be set aside.
  await expect(flow.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Câu 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await skipListening(flow);

  // The shot list comes from the wrong list: one Part 5 Tấm and one Part 6 group.
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Tấm 1 · câu 104–112', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Nhóm 131–134', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as Window & { __explainDelay?: number }).__explainDelay = 1500; });
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot]);
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm tiếp/ }).click();
  // The next item opens while Sóc reads; the screenshots go together, as they are, in one request.
  await expect(flow.getByRole('heading', { name: /^Nhóm 131–134/ })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Tấm 1 · câu 104–112, xong', exact: true })).toBeVisible();
  const sent = await calls(page) as { questions: number[]; images: number; context: number; types: string[] }[];
  expect(sent.map(call => [call.questions, call.images, call.context, call.types])).toEqual([[[104, 112], 2, 0, ['image/png', 'image/png']]]);

  await flow.getByRole('button', { name: 'Soát 2 câu', exact: true }).click();
  await expect(flow.getByRole('heading', { name: '2 câu sai đã sẵn sàng thành thẻ', exact: true })).toBeVisible();
  await expect(flow.getByText(/Đang viết lời giải 2 câu/)).toBeVisible();
  // The explanation suggests the reason and solves the page's missing answer; both rows are confident and folded.
  await expect(flow.getByRole('region', { name: /^Kiểm lại/ })).toHaveCount(0);
  await flow.getByRole('button', { name: 'Mở câu 104', exact: true }).click();
  await expect(flow.getByRole('group', { name: 'Vì sao sai câu 104' }).getByRole('button', { name: 'Ngữ pháp' })).toHaveAttribute('aria-pressed', 'true');
  await flow.getByRole('group', { name: 'Vì sao sai câu 104' }).getByRole('button', { name: 'Từ vựng' }).click();
  await expect(flow.getByText(TIP)).toBeVisible();
  await flow.getByRole('button', { name: 'Mở câu 112', exact: true }).click();
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await flow.getByRole('group', { name: 'Đáp án', exact: true }).getByRole('button', { name: 'D', exact: true }).click();

  await flow.getByRole('button', { name: 'Lưu tất cả (2)', exact: true }).click();
  // Back on the list: a toast and the ticked Tấm.
  await expect(flow.getByRole('status').filter({ hasText: 'Đã lưu 2 câu vào Sổ tay' })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Tấm 1 · câu 104–112, xong', exact: true })).toBeVisible();
  expect(await storedCard(page, 104)).toMatchObject({ userChoice: 'C', correctAnswer: '(A) accommodates', category: 'VOCABULARY_TRAP', explanation: { quickTip: TIP } });
  // Changing a key also invalidates the earlier rationale and its inferred reason.
  const q112 = await storedCard(page, 112);
  expect(q112).toMatchObject({ userChoice: 'B', correctAnswer: '(D) to accommodate', category: 'OTHER' });
  expect(q112.explanation).toBeUndefined();
});

test('a Part 6 set sends its images together in one tray, keeps the right answers out and asks about Sóc’s different answer', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await skipListening(flow);
  await flow.getByRole('button', { name: 'Nhóm 131–134', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Nhóm 131–134', exact: true })).toHaveAttribute('aria-current', 'step');
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles([screenshot, screenshot]);
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm cuối/ }).click();
  // After the last item Soát opens by itself.
  await expect(flow.getByRole('heading', { name: '1 câu sai đã sẵn sàng thành thẻ', exact: true })).toBeVisible();
  expect((await calls(page) as { questions: number[]; images: number; context: number }[]).map(call => [call.questions, call.images, call.context]))
    .toEqual([[[131, 132, 133, 134], 2, 0]]);
  await expect(flow.getByText('Câu 132: bạn làm đúng, Sóc bỏ qua.')).toBeVisible();

  // Sóc solved 131 differently from the page: the row opens at the top until the learner decides.
  const check = flow.getByRole('region', { name: 'Kiểm lại câu 131' });
  await expect(check).toContainText('Sóc giải ra C, trang đề ghi A');
  await check.getByRole('button', { name: 'Đổi sang C', exact: true }).click();
  await expect(flow.getByRole('region', { name: /^Kiểm lại/ })).toHaveCount(0);
  await flow.getByRole('button', { name: 'Lưu tất cả (1)', exact: true }).click();
  await expect(flow.getByRole('button', { name: 'Nhóm 131–134, xong', exact: true })).toBeVisible();
  expect(await storedCard(page, 131)).toMatchObject({ correctAnswer: '(C) accommodation', answerProvidedBy: 'LEARNER' });
  expect(await storedCard(page, 132)).toBeUndefined();
});

test('Part 1 takes a reason on the Listening step; the Listening card is created when saved', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await expect(flow.getByLabel('Ảnh câu hỏi')).toHaveCount(0);
  await flow.getByRole('group', { name: 'Lý do sai' }).getByRole('button', { name: /^Không kịp tốc độ/ }).click();
  await flow.getByRole('button', { name: 'Gán cho 1 câu', exact: true }).click();
  await expect(flow.getByRole('heading', { name: 'Chụp câu sai', exact: true })).toBeVisible();
  expect(await storedCard(page, 3)).toMatchObject({ part: 1, category: 'LISTENING_SPEED', id: expect.stringMatching(/^draft:/) });
});

test('a doubt left open when saving stays on the notebook card until the learner decides', async ({ page }) => {
  const flow = await openDesktopFlow(page);
  await skipListening(flow);
  await flow.getByRole('button', { name: 'Nhóm 131–134', exact: true }).click();
  await flow.getByLabel('Ảnh câu hỏi', { exact: true }).setInputFiles(screenshot);
  await flow.getByRole('button', { name: /^Gửi Sóc đọc · Nhóm cuối/ }).click();
  await expect(flow.getByRole('region', { name: 'Kiểm lại câu 131' })).toContainText('Sóc giải ra C, trang đề ghi A');
  await flow.getByRole('button', { name: 'Lưu tất cả (1)', exact: true }).click();
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
