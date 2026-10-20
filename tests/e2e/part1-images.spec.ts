import { test, expect } from '@playwright/test';

const options = ['(A) A man is standing.', '(B) A man is seated at a table.', '(C) Two people are talking.', '(D) A woman is cooking.'];
const description = 'Một người đang ngồi trước bàn; có một chiếc cốc trên bàn.';

test('new notes are Reading only, while an existing Part 1 card keeps its Part when edited', async ({ page }) => {
  await page.goto('/so-tay');
  await page.evaluate(([options, description]) => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{ id: 'listening-1', part: 1, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: description, question: '', context: description,
      options, correctAnswer: options[1], answerSource: 'AI_PROPOSED', userChoice: 'A', userChoiceState: 'CHOSEN', userMistake: '', tags: [],
      sourceTestName: 'ETS Test 1', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, [options, description] as const);
  await page.reload();
  await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('group', { name: 'Part', exact: true }).getByRole('button')).toHaveText(['5', '6', '7']);
  await modal.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('button', { name: 'Part 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByRole('group', { name: 'Part', exact: true }).getByRole('button')).toHaveText(['1', '5', '6', '7']);
});
