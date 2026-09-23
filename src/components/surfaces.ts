/**
 * Bề mặt thẻ dùng chung cho mọi màn hình (SPEC 5.2): nền trắng, viền mảnh,
 * bóng nhẹ. Thẻ tách khỏi nền trang nhờ nền trang đậm hơn (#EAEFF5), KHÔNG
 * nhờ tô màu thẻ - mỗi thẻ một màu nền đã thử và bị chê chói, rời rạc.
 */
export const CARD =
  'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)] dark:bg-[#111A2C] dark:border-slate-800 dark:shadow-none';

/**
 * Màu danh tính kỹ năng, giống nhau ở mọi màn hình.
 * Listening chàm, Reading xanh ngọc (người dùng chọn theo mẫu).
 */
export const SKILL_COLORS = {
  listening: {
    hex: '#4F46E5',
    text: 'text-indigo-600 dark:text-indigo-400',
    bar: 'bg-indigo-600 dark:bg-indigo-400',
    soft: 'bg-indigo-50 border-indigo-100 dark:bg-indigo-950/50 dark:border-indigo-900/60',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
  },
  reading: {
    hex: '#0D9488',
    text: 'text-teal-600 dark:text-teal-400',
    bar: 'bg-teal-600 dark:bg-teal-400',
    soft: 'bg-teal-50 border-teal-100 dark:bg-teal-950/50 dark:border-teal-900/60',
    chip: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
  }
} as const;
