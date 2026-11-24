/**
 * Bề mặt thẻ dùng chung (giống .rd-card): nền trắng, viền nhạt, đáy dày nhẹ.
 */
export const CARD =
  'rounded-[22px] border-2 border-[#e6e9e6] bg-white p-3 sm:p-3.5 shadow-[0_4px_0_#e6e9e6]';

/**
 * Điện thoại (<768px): form mở toàn màn hình, nút lưu nằm sát đáy (tránh vùng thanh home của iPhone).
 * Ghép vào lớp nền mờ, khung hộp thoại và chân form hiện có; từ tablet trở lên không đổi.
 */
export const PHONE_SHEET_BACKDROP = 'max-md:items-stretch max-md:p-0';
export const PHONE_SHEET_PANEL = 'max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none';
export const PHONE_SHEET_FOOTER = 'max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]';
