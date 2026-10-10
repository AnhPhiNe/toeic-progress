export interface DateRange { from: string; to: string; preset: 7 | 14 | 30 | null }
export const formatRangeDate = (date: string) => date.split('-').reverse().join('/');
export const calendarDayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export const dateRangePreset = (today: string, days: 7 | 14 | 30): DateRange => ({
  from: new Date((calendarDayIndex(today) + 1 - days) * 86400000).toISOString().slice(0, 10), to: today, preset: days
});
export function validCalendarDate(date: string): boolean {
  const time = Date.parse(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(0, 4)) > 0
    && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}
export function dateRangeError(range: DateRange, today: string): string {
  if (!validCalendarDate(range.from) || !validCalendarDate(range.to)) return 'Nhập đủ hai ngày hợp lệ.';
  if (range.from > range.to) return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
  if (range.to > today) return 'Ngày kết thúc không vượt quá hôm nay.';
  if (calendarDayIndex(range.to) - calendarDayIndex(range.from) + 1 > 30) return 'Chọn khoảng tối đa 30 ngày, tính cả ngày bắt đầu và kết thúc.';
  return '';
}
