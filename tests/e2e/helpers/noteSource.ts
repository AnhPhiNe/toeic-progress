import type { Locator } from '@playwright/test';

export async function chooseNoteSource(modal: Locator, name = 'ETS Test 1') {
  const trigger = modal.getByRole('button', { name: 'Chọn đề', exact: true });
  if (await trigger.textContent() !== 'Chọn đề') return;
  await trigger.click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill(name);
  const existing = modal.page().getByRole('option', { name, exact: true });
  await (await existing.count() ? existing : modal.page().getByRole('option', { name: `+ Thêm tên đề “${name}”`, exact: true })).click();
}
