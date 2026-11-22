import { test, expect, type Page } from '@playwright/test';
import { emptyBundle } from '../../frontend/src/shared/data/dataBundle';
import { openSettings } from './helpers/accountGroup';

/** The profile name the app currently shows in Cài đặt (the old top bar's "Cài đặt hồ sơ <tên>" button is gone). */
async function profileName(page: Page) {
  const dialog = await openSettings(page);
  // Computers: the name is edited inline in the header (✎); its field shows the stored name.
  await dialog.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  const name = await dialog.getByLabel('Tên của bạn', { exact: true }).inputValue();
  await page.keyboard.press('Escape');
  await expect(dialog.getByLabel('Tên của bạn', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return name;
}

// Replace only the transport/auth boundary. The app, hook, storage and merge
// code remain real, and no request reaches Supabase or the deployed backend.
async function setupAccount(page: Page) {
  const accounts = { alice: emptyBundle(), bob: emptyBundle() };
  accounts.alice.profile.name = 'Alice';
  accounts.bob.profile.name = 'Bob';
  let userChecks = 0;
  let syncRequests = 0;
  let failSync = false;
  let holdSync: Promise<void> | undefined;
  const uploads: Array<{ entity_type: string; payload: { count?: number } }> = [];

  await page.addInitScript(bundle => {
    localStorage.setItem('toeic_active_account_v1', 'alice');
    localStorage.setItem('toeic_progress_account_alice_v3', JSON.stringify(bundle));
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
  }, accounts.alice);
  await page.route('**/src/shared/api/supabaseClient.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      const listeners = new Set();
      const session = { access_token: 'test-only', user: { id: 'alice', email: 'alice@example.test', is_anonymous: false } };
      window.__accountAuth = { session, emit(event, id = session.user.id) {
        session.user = { id, email: id + '@example.test', is_anonymous: false };
        listeners.forEach(callback => callback(event, session));
      }};
      export const cloud = { auth: {
        getSession: async () => ({ data: { session: window.__accountAuth.signedOut ? null : session }, error: null }),
        getUser: async () => ({ data: { user: await (await fetch('/__test/user?id=' + session.user.id)).json() }, error: null }),
        onAuthStateChange: callback => { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }; },
        signOut: async () => { window.__signOuts = (window.__signOuts || 0) + 1; window.__accountAuth.signedOut = true; return { error: null }; }
      }};
    `
  }));
  await page.route('**/src/shared/api/api.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      import { cloud } from './supabaseClient.ts';
      export const apiAvailable = true;
      export class ApiRequestError extends Error {}
      export async function backendRequest(path, method = 'GET', body, expectedUserId) {
        const { data: { session } } = await cloud.auth.getSession();
        if (expectedUserId && expectedUserId !== session.user.id) throw new Error('Changed account');
        const response = await fetch('/__test/api' + path, { method,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, userId: session.user.id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);
        return result;
      }
    `
  }));
  await page.route('**/__test/user?*', route => {
    userChecks++;
    const id = new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({ json: { id, email: `${id}@example.test`, is_anonymous: false } });
  });
  await page.route('**/__test/api/api/v1/sync', async route => {
    syncRequests++;
    const body = route.request().postDataJSON();
    uploads.push(...body.records);
    if (holdSync) await holdSync;
    if (failSync) return route.fulfill({ status: 503, json: { detail: 'Test backend unavailable' } });
    const bundle = accounts[body.userId as keyof typeof accounts];
    // Keep newer profile uploads, as the real server does, so they come back acknowledged.
    for (const row of body.records as Array<{ entity_type: string; payload: typeof bundle.profile; updated_at: string }>) {
      if (row.entity_type === 'profile' && Date.parse(row.updated_at) > Date.parse(bundle.profile.updatedAt)) bundle.profile = row.payload;
    }
    const records = [
      { entity_type: 'profile', record_id: 'profile', payload: bundle.profile, updated_at: bundle.profile.updatedAt, deleted_at: null },
      ...bundle.vocabLog.map(entry => ({ entity_type: 'vocabLog', record_id: entry.id, payload: entry, updated_at: entry.updatedAt, deleted_at: entry.deletedAt }))
    ];
    await route.fulfill({ json: { cursor: syncRequests, records, hasRecords: true } });
  });
  await page.goto('/');
  await expect.poll(() => profileName(page)).toBe('Alice');
  await expect(page.getByRole('alertdialog', { name: 'Trạng thái kết nối' })).toHaveCount(0);
  return {
    accounts, uploads, userChecks: () => userChecks, syncRequests: () => syncRequests,
    setFailure: (value = true) => { failSync = value; },
    hold: () => { let release!: () => void; holdSync = new Promise<void>(resolve => { release = resolve; }); return () => { holdSync = undefined; release(); }; }
  };
}

async function confirmSession(page: Page, id = 'alice') {
  await page.evaluate(userId => {
    const auth = (window as unknown as { __accountAuth: { emit: (event: string, id: string) => void } }).__accountAuth;
    window.dispatchEvent(new Event('focus'));
    auth.emit('SIGNED_IN', userId);
  }, id);
}

/** The sidebar's account button carries the sync state ("Đã đồng bộ", "Đang đồng bộ", "Đồng bộ lỗi"). */
const syncState = (page: Page) => page.getByRole('button', { name: /^Tài khoản & cài đặt/ });
/** Word counts stored in a bundle, read from the active account's copy (or the guest copy once detached). */
async function storedVocab(page: Page, key: string) {
  return page.evaluate(storageKey => (JSON.parse(localStorage.getItem(storageKey) ?? '{"vocabLog":[]}').vocabLog as Array<{ count?: number; deletedAt: string | null }>)
    .filter(entry => !entry.deletedAt).map(entry => entry.count), key);
}

test('returning to an existing session syncs in the background and preserves edits', async ({ page }) => {
  const state = await setupAccount(page);
  await expect(syncState(page)).toContainText('Đã đồng bộ');
  const checksBefore = state.userChecks();
  const requestsBefore = state.syncRequests();
  const release = state.hold();
  const modal = await openSettings(page);
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  const name = modal.getByLabel('Tên của bạn', { exact: true });
  await name.fill('Alice edited');
  await confirmSession(page);
  await expect.poll(state.syncRequests).toBe(requestsBefore + 1);
  await expect(page.getByRole('alertdialog', { name: 'Trạng thái kết nối' })).toHaveCount(0);
  await expect(name).toHaveValue('Alice edited');
  await expect(name).toBeFocused();
  // A real edit during that request must still queue a subsequent upload.
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(name).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(syncState(page)).toContainText('Đang đồng bộ');
  release();
  await expect.poll(() => state.uploads.some(row => row.entity_type === 'profile' && (row.payload as { name?: string }).name === 'Alice edited')).toBe(true);
  await expect(syncState(page)).toContainText('Đã đồng bộ');
  expect(state.userChecks()).toBe(checksBefore);
});

test('confirming the session pulls changes made on another device', async ({ page }) => {
  const state = await setupAccount(page);
  const checksBefore = state.userChecks();
  state.accounts.alice.vocabLog = [{ id: 'remote', date: '2026-10-06', count: 12, updatedAt: new Date().toISOString(), deletedAt: null }];
  await confirmSession(page);
  await expect.poll(() => storedVocab(page, 'toeic_progress_account_alice_v3')).toEqual([12]);
  await expect(page.getByRole('alertdialog', { name: 'Trạng thái kết nối' })).toHaveCount(0);
  expect(state.userChecks()).toBe(checksBefore);
});

test('a different account still runs identity initialization', async ({ page }) => {
  const state = await setupAccount(page);
  const checksBefore = state.userChecks();
  await confirmSession(page, 'bob');
  await expect.poll(() => profileName(page)).toBe('Bob');
  expect(state.userChecks()).toBeGreaterThan(checksBefore);
});

test('failed background sync keeps the connection error visible', async ({ page }) => {
  const state = await setupAccount(page);
  state.setFailure();
  await confirmSession(page);
  // A non-blocking banner, not a full-screen dialog: the rest of the app stays usable.
  const error = page.getByRole('alert').filter({ hasText: 'Test backend unavailable' });
  await expect(error).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(error).toContainText('Test backend unavailable');
  await expect(error.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
  await expect(syncState(page)).toContainText('Đồng bộ lỗi');
  state.setFailure(false);
  await error.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(syncState(page)).toContainText('Đã đồng bộ');
  await expect(error).toHaveCount(0);
});

test('failed initialization of a different account detaches the previous owner without deleting its bundle', async ({ page }) => {
  const state = await setupAccount(page);
  state.accounts.alice.vocabLog = [{ id: 'alice-private', date: '2026-10-06', count: 23, updatedAt: new Date().toISOString(), deletedAt: null }];
  await confirmSession(page);
  await expect.poll(() => storedVocab(page, 'toeic_progress_account_alice_v3')).toEqual([23]);
  state.setFailure();
  const checksBefore = state.userChecks();
  await confirmSession(page, 'bob');
  await expect.poll(state.userChecks).toBeGreaterThan(checksBefore);
  const error = page.getByRole('alert').filter({ hasText: 'Test backend unavailable' });
  await expect(error).toContainText('Test backend unavailable');
  expect(await profileName(page)).not.toBe('Alice');
  expect(await storedVocab(page, 'toeic_progress_bundle_v3')).not.toContain(23);
  expect(await page.evaluate(() => localStorage.getItem('toeic_active_account_v1'))).toBeNull();
  const preserved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_account_alice_v3')!));
  expect(preserved.profile.name).toBe('Alice');
  expect(preserved.vocabLog).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'alice-private', count: 23 })]));
  await expect(error.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
  state.setFailure(false);
  await error.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect.poll(() => profileName(page)).toBe('Bob');
  await expect(error).toHaveCount(0);
  expect(await storedVocab(page, 'toeic_progress_bundle_v3')).not.toContain(23);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_account_alice_v3')!).profile.name)).toBe('Alice');
});

async function renameInSettings(page: Page, name: string) {
  const modal = await openSettings(page);
  await modal.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await modal.getByLabel('Tên của bạn', { exact: true }).fill(name);
  await modal.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(modal.getByLabel('Tên của bạn', { exact: true })).toHaveCount(0);
  return modal;
}
const signOuts = (page: Page) => page.evaluate(() => (window as Window & { __signOuts?: number }).__signOuts ?? 0);
const storedName = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_account_alice_v3') ?? 'null')?.profile.name ?? null);

test('signing out with an edit the server never received warns first, and staying keeps the data', async ({ page }) => {
  const state = await setupAccount(page);
  await expect(syncState(page)).toContainText('Đã đồng bộ');
  state.setFailure();
  const modal = await renameInSettings(page, 'Alice offline edit');
  await expect(syncState(page)).toContainText('Đồng bộ lỗi');
  const requestsBefore = state.syncRequests();
  await modal.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  const warning = page.getByRole('alertdialog', { name: /chưa lưu lên mây/ });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Còn 1 thay đổi chưa lưu lên mây');
  expect(state.syncRequests()).toBeGreaterThan(requestsBefore);
  await expect(warning.getByRole('button', { name: 'Tải bản sao lưu', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await warning.getByRole('button', { name: 'Tải bản sao lưu', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^toeic-progress-990-backup-.*\.json$/);
  await warning.getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(warning).toHaveCount(0);
  expect(await signOuts(page)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('toeic_active_account_v1'))).toBe('alice');
  expect(await storedName(page)).toBe('Alice offline edit');

  // Once the upload goes through, sign-out needs no warning.
  state.setFailure(false);
  await modal.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect.poll(() => signOuts(page)).toBe(1);
  await expect(warning).toHaveCount(0);
  expect(state.uploads.some(row => row.entity_type === 'profile' && (row.payload as { name?: string }).name === 'Alice offline edit')).toBe(true);
  expect(await storedName(page)).toBeNull();
});

test('signing out with everything synced shows no warning', async ({ page }) => {
  await setupAccount(page);
  await expect(syncState(page)).toContainText('Đã đồng bộ');
  const modal = await openSettings(page);
  await modal.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect.poll(() => signOuts(page)).toBe(1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('toeic_active_account_v1'))).toBeNull();
  expect(await storedName(page)).toBeNull();
});

test('another tab signing out stops this tab showing the account', async ({ page }) => {
  await setupAccount(page);
  await expect(syncState(page)).toContainText('Đã đồng bộ');
  // What another tab's sign-out leaves behind: no pointer, no account copy, then a storage event here.
  await page.evaluate(() => {
    (window as unknown as { __accountAuth: { signedOut: boolean } }).__accountAuth.signedOut = true;
    localStorage.removeItem('toeic_active_account_v1');
    localStorage.removeItem('toeic_progress_account_alice_v3');
    window.dispatchEvent(new StorageEvent('storage', { key: 'toeic_active_account_v1', oldValue: 'alice', newValue: null, storageArea: localStorage }));
  });
  await expect.poll(() => profileName(page)).not.toBe('Alice');
  expect(await storedName(page)).toBeNull();
  expect(await storedVocab(page, 'toeic_progress_bundle_v3')).toEqual([]);
});
