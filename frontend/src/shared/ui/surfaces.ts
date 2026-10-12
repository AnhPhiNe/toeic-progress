/**
 * Bề mặt thẻ Neo-Brutalism dùng chung cho mọi màn hình:
 * viền đen 2px rõ nét, bóng đổ hình học sắc nét 4px không mờ (shadow-[4px_4px_0px_#0f172a]).
 */
export const CARD =
  'rounded-2xl border-2 border-slate-900 bg-white p-3 sm:p-3.5 shadow-[2.5px_2.5px_0px_0px_#0f172a] dark:bg-[#111A2C] dark:border-slate-200 dark:shadow-[2.5px_2.5px_0px_0px_#cbd5e1] hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_0px_#0f172a] dark:hover:shadow-[3.5px_3.5px_0px_0px_#cbd5e1] transition-all duration-200';

/**
 * Điện thoại (<768px): form mở toàn màn hình, nút lưu nằm sát đáy (tránh vùng thanh home của iPhone).
 * Ghép vào lớp nền mờ, khung hộp thoại và chân form hiện có; từ tablet trở lên không đổi.
 */
export const PHONE_SHEET_BACKDROP = 'max-md:items-stretch max-md:p-0';
export const PHONE_SHEET_PANEL = 'max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none';
export const PHONE_SHEET_FOOTER = 'max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]';

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
