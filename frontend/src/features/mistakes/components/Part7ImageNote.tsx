import { Info } from 'lucide-react';
import { MAX_CONTEXT_IMAGES } from '@/features/mistakes/lib/imageInput';

export function Part7ImageNote() {
  return <div role="note" aria-label="Lưu ý chụp ảnh Part 7" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <p><strong className="font-semibold">Chụp riêng từng bài đọc.</strong> Tránh thu nhỏ để gộp nhiều bài; giữ chữ rõ, đủ nội dung. Có thể gửi tối đa {MAX_CONTEXT_IMAGES} ảnh cùng lúc.</p>
  </div>;
}
