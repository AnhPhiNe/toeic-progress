import type { UserProfile } from '@/shared/types';

const EDITABLE_FIELDS = ['name', 'targetScore', 'examDate'] as const;

/** Merge only the fields this settings draft changed; activity and sync metadata stay current. */
export function mergeProfileEdit(latest: UserProfile, snapshot: UserProfile, edited: UserProfile): UserProfile {
  if (latest.deletedAt) throw new Error('Hồ sơ đã thay đổi. Đóng và mở lại Cài đặt trước khi lưu.');
  const result = { ...latest };
  for (const field of EDITABLE_FIELDS) {
    if (edited[field] === snapshot[field]) continue;
    if (latest[field] !== snapshot[field] && latest[field] !== edited[field]) {
      throw new Error('Thông số bạn đang sửa đã thay đổi ở nơi khác. Nội dung đang nhập được giữ; đóng và mở lại Cài đặt để tải hồ sơ mới.');
    }
    Object.assign(result, { [field]: edited[field] });
  }
  // A goal set here counts as chosen (Hôm nay stops asking): an edited target, or the target field touched
  // (goalChosen in the draft) even when the learner kept the placeholder 990.
  if (edited.targetScore !== snapshot.targetScore || (edited.goalChosen === true && snapshot.goalChosen !== true)) result.goalChosen = true;
  if (!result.name.trim()) throw new Error('Vui lòng nhập tên học viên.');
  if (!Number.isInteger(result.targetScore) || result.targetScore < 10 || result.targetScore > 990 || result.targetScore % 5 !== 0)
    throw new Error('Mục tiêu điểm cần từ 10 đến 990, theo bước 5.');
  return result;
}
