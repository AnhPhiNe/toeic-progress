import { StorageWriteError } from '@/shared/data/dataBundle';

export function pacingError(reason: unknown, fallback: string): string {
  if (reason instanceof Error) {
    if (reason.name === 'QuotaExceededError' || (reason instanceof StorageWriteError && reason.reason === 'quota')) return 'Không đủ dung lượng trên máy. Dữ liệu nhập vẫn được giữ.';
    if (reason.name === 'SecurityError') return 'Trình duyệt chưa cho phép lưu dữ liệu trên máy.';
    return reason.message || fallback;
  }
  return fallback;
}
