import type { MistakeEntry } from '@/shared/types';
import { getActiveAccountId, live, nextUpdatedAt, updateDataBundle } from '@/shared/data/dataBundle';
import { reviewContentKey } from './mistakeUpdates';

const SCHEDULE = ['status', 'reviewStage', 'reviewCount', 'nextReviewDate', 'lastReviewedAt'] as const;
const scheduleKey = (card: MistakeEntry) => JSON.stringify(SCHEDULE.map(key => card[key] ?? null));
function assertOwner(owner: string | null) {
  if (getActiveAccountId() !== owner) throw new Error('Tài khoản đã thay đổi. Không thể hoàn tác thao tác của tài khoản trước.');
}

/** A grade undo restores only scheduling, retaining later notes while rejecting later grades/question edits. */
export function undoMistakeGrade(before: MistakeEntry, after: MistakeEntry, owner: string | null) {
  assertOwner(owner);
  const next = updateDataBundle(bundle => {
    const latest = bundle.mistakes.find(card => card.id === before.id);
    if (!latest || latest.deletedAt || reviewContentKey(latest) !== reviewContentKey(after) || scheduleKey(latest) !== scheduleKey(after)) {
      throw new Error('Thẻ đã thay đổi sau lần chấm này. Không thể hoàn tác; hãy mở lại thẻ để kiểm tra.');
    }
    const restored = { ...latest, updatedAt: nextUpdatedAt(latest.updatedAt) };
    for (const key of SCHEDULE) {
      delete restored[key];
      if (before[key] !== undefined) Object.assign(restored, { [key]: before[key] });
    }
    return { ...bundle, mistakes: bundle.mistakes.map(card => card.id === before.id ? restored : card) };
  });
  return live(next.mistakes);
}

/** The exact tombstone is required: an old Undo cannot revive a newer deletion or overwrite a restored card. */
export function undoMistakeDeletion(before: MistakeEntry, deletionVersion: string, owner: string | null) {
  assertOwner(owner);
  const next = updateDataBundle(bundle => {
    const tombstone = bundle.mistakes.find(card => card.id === before.id);
    if (!tombstone?.deletedAt || tombstone.updatedAt !== deletionVersion) {
      throw new Error('Thẻ đã được khôi phục hoặc thay đổi ở nơi khác. Không thể hoàn tác lần xóa này.');
    }
    const restored = { ...before, deletedAt: null, updatedAt: nextUpdatedAt(tombstone.updatedAt) };
    return { ...bundle, mistakes: bundle.mistakes.map(card => card.id === before.id ? restored : card) };
  });
  return live(next.mistakes);
}
