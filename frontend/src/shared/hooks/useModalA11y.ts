import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Gắn hành vi chuẩn của hộp thoại cho một modal:
 *  - Đóng bằng phím Escape
 *  - Giữ focus bên trong modal (focus trap) khi nhấn Tab / Shift+Tab
 *  - Đưa focus vào modal khi mở, và trả focus về nơi cũ khi đóng
 *  - Khóa cuộn nền phía sau
 *
 * Trả về ref để gắn vào phần tử bọc ngoài cùng của modal.
 */
export function useModalA11y(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Nhớ phần tử đang focus để còn trả lại khi đóng
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      // Ưu tiên phần tử tương tác đầu tiên; nếu không có thì focus chính khung modal
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The first Escape dismisses a combobox's popup; the next closes the modal.
        if (e.target instanceof Element && e.target.closest('[role="combobox"][aria-expanded="true"]')) return;
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const node = containerRef.current;
      if (!node) return;

      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null || el === document.activeElement);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    // Khóa cuộn nền
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  return containerRef;
}
