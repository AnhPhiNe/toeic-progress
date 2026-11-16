import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import './phone.css';

/** Bottom sheet: slides up, dim backdrop, grab handle; closes on backdrop, Escape and device Back (via useModalA11y). */
export function PhoneSheet({ title, onClose, children, hideTitle }: { title: string; onClose: () => void; children: ReactNode; hideTitle?: boolean }) {
  const ref = useModalA11y(true, onClose);
  return createPortal(
    <div className="rd ph-sheet-root">
      <button type="button" tabIndex={-1} aria-label="Đóng" className="ph-dim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="ph-sheet">
        <div className="ph-grab" aria-hidden="true" />
        {hideTitle ? null : <h2 className="ph-sheet__title">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body
  );
}
