import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFormDraft, removeFormDraft, writeFormDraft } from './formDrafts';

const { account } = vi.hoisted(() => ({ account: { id: null as string | null } }));
vi.mock('./dataBundle', () => ({ getActiveAccountId: () => account.id }));
let values: Map<string, string>;
const validate = (input: unknown) => typeof input === 'object' && input !== null && typeof (input as { text?: unknown }).text === 'string' ? input as { text: string } : null;
beforeEach(() => {
  account.id = 'owner-a'; values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); })
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('durable account-scoped form drafts', () => {
  it('keeps account and guest drafts separate and rejects stale owner writes or deletes', () => {
    expect(writeFormDraft('session:new', { text: 'A' }, 'owner-a')).toBe(true);
    account.id = 'owner-b';
    expect(readFormDraft('session:new', validate)).toBeNull();
    expect(writeFormDraft('session:new', { text: 'stale A' }, 'owner-a')).toBe(false);
    expect(removeFormDraft('session:new', 'owner-a')).toBe(false);
    writeFormDraft('session:new', { text: 'B' });
    account.id = null;
    expect(readFormDraft('session:new', validate)).toBeNull();
    writeFormDraft('session:new', { text: 'Guest' });
    account.id = 'owner-a'; expect(readFormDraft('session:new', validate)?.value.text).toBe('A');
    account.id = 'owner-b'; expect(readFormDraft('session:new', validate)?.value.text).toBe('B');
    account.id = null; expect(readFormDraft('session:new', validate)?.value.text).toBe('Guest');
  });
  it('keeps scopes independent and removes only the requested draft after success/discard', () => {
    writeFormDraft('session:new', { text: 'result' }); writeFormDraft('mistake:card-1', { text: 'note' });
    expect(removeFormDraft('session:new')).toBe(true);
    expect(readFormDraft('session:new', validate)).toBeNull();
    expect(readFormDraft('mistake:card-1', validate)?.value.text).toBe('note');
  });
  it('ignores invalid, future or unsupported records without touching study data', () => {
    writeFormDraft('session:new', { text: 'valid' }); const [key, raw] = [...values.entries()][0];
    for (const record of ['{bad', JSON.stringify({ ...JSON.parse(raw), version: 2 }), JSON.stringify({ ...JSON.parse(raw), value: { text: 3 } }),
      JSON.stringify({ ...JSON.parse(raw), updatedAt: 'bad' }),
      JSON.stringify({ ...JSON.parse(raw), updatedAt: '2099-01-01' })]) {
      values.set(key, record); expect(readFormDraft('session:new', validate)).toBeNull();
    }
    values.set(key, JSON.stringify({ ...JSON.parse(raw), updatedAt: '2000-01-01' }));
    expect(readFormDraft('session:new', validate)?.value.text).toBe('valid');
  });
  it('preserves the last durable draft when quota fails or a payload is oversized', () => {
    writeFormDraft('session:new', { text: 'safe' });
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
    expect(writeFormDraft('session:new', { text: 'new' })).toBe(false);
    expect(readFormDraft('session:new', validate)?.value.text).toBe('safe');
    expect(writeFormDraft('session:new', { text: 'x'.repeat(600_000) })).toBe(false);
  });
  it('refuses image bytes, File/Blob values, signed URLs and explanation tickets', () => {
    for (const value of [{ image: 'data:image/png;base64,AAAA' }, { file: new Blob(['image']) }, { signedUrl: 'anything' },
      { source: 'https://example.com/image?token=secret' }, { batch: [{ ticket: 'secret' }] }]) expect(writeFormDraft('mistake:new', value)).toBe(false);
    expect(values.size).toBe(0);
    expect(writeFormDraft('mistake:new', { imageIds: ['image-1'], text: 'safe extracted content' })).toBe(true);
  });
});
