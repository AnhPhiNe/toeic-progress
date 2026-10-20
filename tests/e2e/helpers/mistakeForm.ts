import { expect, type Locator } from '@playwright/test';

/** Phones pick the Part with seven buttons; larger screens keep the select. */
export async function choosePart(modal: Locator, part: string) {
  const select = modal.getByRole('combobox', { name: 'Part', exact: true });
  if (await select.count()) await select.selectOption(part);
  else await modal.getByRole('button', { name: `Part ${part}`, exact: true }).click();
}

export async function expectPart(modal: Locator, part: string) {
  const select = modal.getByRole('combobox', { name: 'Part', exact: true });
  if (await select.count()) { await expect(select).toHaveValue(part); return; }
  const group = modal.getByRole('group', { name: 'Part', exact: true });
  if (part) await expect(group.getByRole('button', { name: `Part ${part}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  else await expect(group.locator('[aria-pressed="true"]')).toHaveCount(0);
}

/** Phones fold the answer key into the "Đáp án, loại lỗi" row; larger screens use their own disclosure. */
export async function openAnswerKey(modal: Locator) {
  const phoneRow = modal.locator('summary').filter({ hasText: 'Đáp án, loại lỗi' });
  if (await phoneRow.count()) await phoneRow.click();
  else await modal.getByText('Đáp án đúng từ đề', { exact: false }).click();
}

/** Desktop opens the note form from the notebook header; phones go through the bottom bar's "+" sheet. */
export async function openNoteForm(page: import('@playwright/test').Page) {
  const header = page.getByRole('button', { name: 'Thêm câu sai', exact: true });
  if (await header.isVisible()) { await header.click(); return; }
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Câu sai/ }).click();
}
