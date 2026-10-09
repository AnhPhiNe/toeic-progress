import type { WeeklyPlanRecord } from '@/shared/types';

/** Keep local writes within the existing backup and sync API limits. */
export function assertPlanFitsSync(plan: WeeklyPlanRecord): void {
  if (plan.tasks.length > 100) {
    throw new Error('Một tuần lưu tối đa 100 mục tiêu. Hãy xóa bớt mục tiêu trước khi lưu.');
  }
  // Pretty JSON is a conservative upper bound for the API's spaced JSON.
  // Reserve room for sync metadata added by the storage layer.
  const bytes = new TextEncoder().encode(JSON.stringify({ ...plan, id: plan.weekKey }, null, 1)).byteLength + 256;
  if (bytes > 32768) {
    throw new Error('Kế hoạch tuần có quá nhiều nội dung. Rút gọn ghi chú hoặc giảm số mục tiêu trước khi lưu.');
  }
}
