import { getActiveAccountId } from './dataBundle';

const PREFIX = 'toeic_form_draft_v1:';
const MAX_BYTES = 512 * 1024;
const key = (scope: string, owner: string | null) => `${PREFIX}${encodeURIComponent(owner ?? 'guest')}:${encodeURIComponent(scope)}`;
const current = (owner: string | null) => owner === getActiveAccountId();

/** Drafts stay on this browser, separated from synchronized study records and other accounts. */
export function readFormDraft<T>(scope: string, validate: (input: unknown) => T | null, owner?: string | null): { value: T; updatedAt: string } | null {
  try {
    const target = owner === undefined ? getActiveAccountId() : owner;
    if (!current(target)) return null;
    const raw = localStorage.getItem(key(scope, target));
    if (!raw || raw.length > MAX_BYTES) return null;
    const record = JSON.parse(raw);
    if (record.version !== 1 || record.owner !== target || record.scope !== scope || typeof record.updatedAt !== 'string') return null;
    const age = Date.now() - Date.parse(record.updatedAt);
    if (!Number.isFinite(age) || age < -60_000) return null;
    const value = validate(record.value);
    return value === null ? null : { value, updatedAt: record.updatedAt };
  } catch { return null; }
}

function draftJSON(value: unknown): string {
  return JSON.stringify(value, (name, item) => {
    if (typeof item === 'function' || typeof item === 'bigint' || (typeof Blob !== 'undefined' && item instanceof Blob)) throw new Error('Draft contains a nonserializable value.');
    if (/^(ticket|explainTicket|access_token|refresh_token|signedUrl|dataUrl|base64)$/i.test(name)
      || typeof item === 'string' && (/^data:image\//i.test(item) || /^https?:\/\/[^\s]*(?:[?&](?:token|signature)=)/i.test(item))) throw new Error('Draft contains temporary credentials or image data.');
    return item;
  });
}

export function writeFormDraft(scope: string, value: unknown, owner?: string | null): boolean {
  try {
    const target = owner === undefined ? getActiveAccountId() : owner;
    if (!current(target)) return false;
    const raw = draftJSON({ version: 1, owner: target, scope, updatedAt: new Date().toISOString(), value });
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return false;
    localStorage.setItem(key(scope, target), raw);
    return true;
  } catch { return false; }
}

export function removeFormDraft(scope: string, owner?: string | null): boolean {
  try {
    const target = owner === undefined ? getActiveAccountId() : owner;
    if (!current(target)) return false;
    localStorage.removeItem(key(scope, target));
    return true;
  } catch { return false; }
}
