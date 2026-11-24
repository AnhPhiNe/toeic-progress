import { test, expect } from '@playwright/test';
import { PHONE_VIEWPORT, openCardEditor, openManualForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const options = ['(A) A man is standing.', '(B) A man is seated at a table.', '(C) Two people are talking.', '(D) A woman is cooking.'];
const description = 'Một người đang ngồi trước bàn; có một chiếc cốc trên bàn.';

test('new notes are Reading only, while an existing Part 1 card keeps its Part when edited', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  await page.evaluate(([options, description]) => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{ id: 'listening-1', part: 1, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: description, question: '', context: description,
      options, correctAnswer: options[1], answerSource: 'AI_PROPOSED', userChoice: 'A', userChoiceState: 'CHOSEN', userMistake: '', tags: [],
      sourceTestName: 'ETS Test 1', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, [options, description] as const);
  await page.reload();
  const modal = await openManualForm(page);
  await expect(modal.getByRole('group', { name: 'Part', exact: true }).getByRole('button')).toHaveText(['5', '6', '7']);
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  // An existing card is edited from its page; computers open the same form.
  await page.setViewportSize({ width: 1280, height: 800 }); await page.reload();
  const editor = await openCardEditor(page);
  await expect(editor.getByRole('button', { name: 'Part 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByRole('group', { name: 'Part', exact: true }).getByRole('button')).toHaveText(['1', '5', '6', '7']);
  // Listening keeps reason, error type and a short note: no picture to add, no transcript box.
  await expect(editor.getByLabel(/Chọn ảnh|Chụp tranh|Chụp trang/)).toHaveCount(0);
  await expect(editor.getByRole('region', { name: /Khu vực/ })).toHaveCount(0);
  await expect(editor.getByText('Tranh', { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Lý do chọn')).toBeVisible();
  await editor.getByLabel('Lý do chọn').fill('Nghe nhầm seated với standing.');
  await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved).toMatchObject({ part: 1, userReason: 'Nghe nhầm seated với standing.', context: description });
  expect(saved.sourceImageIds).toBeUndefined();
});
