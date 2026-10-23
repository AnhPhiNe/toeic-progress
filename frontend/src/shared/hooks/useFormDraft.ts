import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { readFormDraft, removeFormDraft, writeFormDraft } from '@/shared/data/formDrafts';

export function useFormDraft<T>({ scope, enabled = true, value, validate, restore, meaningful, snapshot }: {
  scope: string; enabled?: boolean; value: T; validate: (value: unknown) => T | null;
  restore: (value: T) => void; meaningful: boolean;
  snapshot?: () => T;
}) {
  const owner = useRef(getActiveAccountId());
  const latest = useRef({ value, enabled, meaningful, validate, restore, snapshot });
  latest.current = { value, enabled, meaningful, validate, restore, snapshot };
  const initialized = useRef('');
  const skip = useRef(false);
  const cleared = useRef<string | null>(null);
  const hasDraft = useRef(false);
  const [state, setState] = useState<'idle' | 'saved' | 'restored' | 'unavailable'>('idle');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) { initialized.current = ''; return; }
    if (initialized.current === scope || owner.current !== getActiveAccountId()) return;
    initialized.current = scope; skip.current = true; cleared.current = null;
    const record = readFormDraft(scope, latest.current.validate, owner.current);
    hasDraft.current = Boolean(record);
    if (record) { latest.current.restore(record.value); setState('restored'); }
    else setState('idle');
  }, [scope, enabled]);

  const persist = useCallback(() => {
    const snapshot = latest.current;
    if (owner.current !== getActiveAccountId()) return false;
    if (!snapshot.enabled || (!snapshot.meaningful && !hasDraft.current)) return true;
    const payload = snapshot.snapshot?.() ?? snapshot.value;
    if (cleared.current === JSON.stringify(payload)) return true;
    const validated = snapshot.validate(payload);
    if (validated === null) { setState('unavailable'); return false; }
    const result = writeFormDraft(scope, validated, owner.current);
    if (result) hasDraft.current = true;
    setState(old => result ? old === 'restored' ? old : 'saved' : 'unavailable');
    return result;
  }, [scope]);
  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    persist();
  }, [value, enabled, meaningful, persist, revision]);
  useEffect(() => {
    window.addEventListener('pagehide', persist);
    window.addEventListener('beforeunload', persist);
    return () => { window.removeEventListener('pagehide', persist); window.removeEventListener('beforeunload', persist); };
  }, [persist]);
  const clear = useCallback(() => {
    cleared.current = JSON.stringify(latest.current.snapshot?.() ?? latest.current.value);
    const result = removeFormDraft(scope, owner.current);
    if (result) hasDraft.current = false;
    setState(result ? 'idle' : 'unavailable');
    return result;
  }, [scope]);
  const restart = useCallback(() => { cleared.current = null; setRevision(value => value + 1); }, []);
  return { state, clear, restart, persist };
}
