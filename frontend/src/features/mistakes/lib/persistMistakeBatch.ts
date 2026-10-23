import type { MistakeEntry } from '@/shared/types';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { updateMistakes } from '@/shared/data/storage';
import { assertBatchEntries } from './batchCapture';

/** One bundle replacement: no partial list is persisted if validation or storage fails. */
export function commitMistakeBatch(entries: MistakeEntry[], expectedOwner = getActiveAccountId()): MistakeEntry[] {
  if (getActiveAccountId() !== expectedOwner) throw new Error('Tài khoản đã thay đổi. Chưa lưu các câu đang nhập.');
  assertBatchEntries(entries);
  const ids = new Set(entries.map(entry => entry.id));
  return updateMistakes(current => {
    if (current.some(card => ids.has(card.id))) throw new Error('Có câu đã được lưu trước đó. Đóng form và kiểm tra Sổ tay trước khi tiếp tục.');
    return [...entries, ...current];
  });
}
