import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import './confirmDialog.css';

export interface ConfirmOptions {
  title: string;
  /** One sentence saying what will happen. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Irreversible: the main button is red-pink instead of green. */
  destructive?: boolean;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

/** Themed replacement for window.confirm. Resolves false when cancelled (button, Esc or backdrop). Needs <ConfirmHost /> mounted. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise<boolean>(resolve => { pending = { ...options, resolve }; emit(); });
}

function answer(ok: boolean) {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(ok);
}

function Dialog({ options }: { options: Pending }) {
  // Esc and the focus trap come from useModalA11y; Esc means "no".
  const ref = useModalA11y(true, () => answer(false));
  return (
    <div className="cfm-back" data-testid="confirm-dialog">
      <button type="button" tabIndex={-1} aria-label="Đóng" onClick={() => answer(false)} className="absolute inset-0 cursor-default" />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="cfm-title" aria-describedby="cfm-note" tabIndex={-1} className="cfm relative">
        <Soc state={options.destructive ? 'think' : 'idle'} size={84} className="mx-auto" />
        <h2 id="cfm-title">{options.title}</h2>
        <p id="cfm-note">{options.message}</p>
        <div className="cfm-actions">
          <button type="button" autoFocus className="cfm-btn" onClick={() => answer(false)}>{options.cancelLabel ?? 'Hủy'}</button>
          <button type="button" className={`cfm-btn ${options.destructive ? 'cfm-btn--danger' : 'cfm-btn--ok'}`} onClick={() => answer(true)}>{options.confirmLabel ?? 'Đồng ý'}</button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmHost() {
  const current = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => pending,
    () => null
  );
  return current ? createPortal(<Dialog options={current} />, document.body) : null;
}
