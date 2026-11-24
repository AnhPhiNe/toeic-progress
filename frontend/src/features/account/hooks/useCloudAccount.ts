import { useCallback, useEffect, useRef, useState } from 'react';
import { askConfirm } from '@/shared/components/ConfirmDialog';
import type { DataBundle } from '@/shared/data/dataBundle';
import { activateAccount, clearRetiredCopies, deactivateAccount, getActiveAccountId, purgeAccountLocalStorage, readAccountBundle, readGuestBundle, setAccountWriteEnabled, writeAccountBundle } from '@/shared/data/dataBundle';
import { bundleFromRecords, cleanupResetImages, cloud, deleteCloudAccount, fetchCloudBundle, rememberSync, resetCloudLearningData, wakeBackend } from '@/features/account/services/cloud';
import { finishAccountTransfer, synchronizeAccount } from '@/features/account/services/cloudSync';
import { hasPersonalData, type TransferChoice } from '@/shared/data/syncMerge';
import type { AccountStatus } from '@/features/account/components/AccountPanel';
import { apiAvailable } from '@/shared/api/api';
import { SLOW_AFTER_MS, backoffDelay, shouldKeepWaking } from '@/features/account/lib/syncStatus';
import { clearCaptureSessionForAccountChange } from '@/features/mistakes/services/captureSession';
import { clearExplanationQueue } from '@/features/mistakes/services/explanationQueue';
import { clearScreenshotWatcherForOwner } from '@/features/mistakes/hooks/useScreenshotWatcher';
import { crossTabAccountChange, unsyncedRecordCount } from '@/features/account/lib/signOutSafety';

interface PendingTransfer { userId: string; device: DataBundle; account: DataBundle; accountHasData: boolean }
/** Shown before sign-out purges records the server has not acknowledged yet. */
export interface SignOutWarning { count: number; userId: string }

export function useCloudAccount(onDataChanged: () => void) {
  const [status, setStatus] = useState<AccountStatus>(apiAvailable ? 'loading' : 'guest');
  const [email, setEmail] = useState<string | null>(null);
  const [hasAccountSession, setHasAccountSession] = useState(false);
  const [error, setError] = useState('');
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [signOutWarning, setSignOutWarning] = useState<SignOutWarning | null>(null);
  const warningAnswer = useRef<((proceed: boolean) => void) | null>(null);
  const userId = useRef<string | null>(null);
  const initialized = useRef(false);
  const syncing = useRef(false);
  const dirty = useRef(false);
  const generation = useRef(0);
  const resetting = useRef(false);
  // Cold start: Render's free tier sleeps. Slow or unreachable requests are retried quietly with backoff.
  const [waking, setWaking] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const userEdit = useRef(false);
  const wake = useRef<{ startedAt: number; attempt: number; slow?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setTimeout> }>({ startedAt: 0, attempt: 0 });

  const armSlow = useCallback(() => {
    if (!wake.current.startedAt) wake.current.startedAt = Date.now();
    if (wake.current.slow) clearTimeout(wake.current.slow);
    wake.current.slow = setTimeout(() => setWaking(true), SLOW_AFTER_MS);
  }, []);
  const resetWake = useCallback(() => {
    clearTimeout(wake.current.slow); clearTimeout(wake.current.retry);
    wake.current = { startedAt: 0, attempt: 0 };
    setWaking(false);
  }, []);
  /** True when the failure should be retried quietly; schedules the retry. */
  const keepWaking = useCallback((reason: unknown, retry: () => void) => {
    if (!wake.current.startedAt || !shouldKeepWaking(wake.current.startedAt, Date.now(), reason)) return false;
    clearTimeout(wake.current.slow);
    setWaking(true);
    clearTimeout(wake.current.retry);
    wake.current.retry = setTimeout(retry, backoffDelay(wake.current.attempt++));
    return true;
  }, []);
  const markSynced = useCallback(() => {
    resetWake();
    const at = Date.now();
    setSyncedAt(at); setNow(at);
    if (userEdit.current) { userEdit.current = false; setSavedAt(at); }
  }, [resetWake]);

  const sync = useCallback(async (queueIfBusy = true) => {
    if (resetting.current || !userId.current || !initialized.current) return;
    if (syncing.current) { if (queueIfBusy) dirty.current = true; return; }
    if (!navigator.onLine) { setStatus('disconnected'); setAccountWriteEnabled(false); return; }
    syncing.current = true;
    clearTimeout(wake.current.retry);
    const id = userId.current;
    const run = generation.current;
    do {
      dirty.current = false;
      setStatus('syncing');
      armSlow();
      try {
        const cleanupKey = `toeic_source_image_cleanup_${id}`;
        const cleanupBefore = localStorage.getItem(cleanupKey);
        if (cleanupBefore) { await cleanupResetImages(id, cleanupBefore); localStorage.removeItem(cleanupKey); }
        const changed = await synchronizeAccount(id, () => run === generation.current && userId.current === id && !resetting.current);
        if (run !== generation.current || userId.current !== id) break;
        setAccountWriteEnabled(navigator.onLine);
        if (changed) onDataChanged();
        setError('');
        setStatus(navigator.onLine ? 'synced' : 'disconnected');
        markSynced();
      } catch (reason) {
        if (run !== generation.current || userId.current !== id) break;
        if (keepWaking(reason, () => void sync(false))) { dirty.current = false; break; }
        resetWake();
        setAccountWriteEnabled(false);
        setError(reason instanceof Error ? reason.message : 'Không thể đồng bộ.');
        setStatus(navigator.onLine ? 'error' : 'disconnected');
        // A failed flush must await a new user/online action, not spin on pending edits.
        dirty.current = false;
        break;
      }
    } while (dirty.current);
    syncing.current = false;
    if (dirty.current && initialized.current && !resetting.current) setTimeout(() => void sync(), 0);
  }, [onDataChanged, armSlow, keepWaking, markSynced, resetWake]);

  const bootstrap = useCallback(async () => {
    if (resetting.current) return;
    const run = ++generation.current;
    // Another tab may already have cleared the pointer: still refresh if this tab was showing an account.
    const shownBefore = userId.current;
    const leaveAccount = () => {
      if (getActiveAccountId() || shownBefore) { deactivateAccount(); onDataChanged(); }
    };
    if (!cloud || !apiAvailable) {
      setHasAccountSession(false);
      leaveAccount();
      return;
    }
    setStatus('loading');
    clearTimeout(wake.current.retry);
    setAccountWriteEnabled(false);
    initialized.current = false;
    userId.current = null;
    setPendingTransfer(null);
    const detachDifferentOwner = (id: string) => {
      const active = getActiveAccountId();
      if (active && active !== id) {
        // Keep the previous owner's stored bundle, but stop rendering it as
        // the new identity even if authentication or its first sync fails.
        deactivateAccount();
        clearCaptureSessionForAccountChange();
        clearExplanationQueue();
        setEmail(null);
        onDataChanged();
      }
    };
    try {
      const session = await cloud.auth.getSession();
      if (run !== generation.current) return;
      if (!session.data.session || session.data.session.user.is_anonymous) {
        setHasAccountSession(false);
        leaveAccount();
        setPendingTransfer(null);
        setEmail(null);
        setStatus('guest');
        return;
      }
      setHasAccountSession(true);
      armSlow();
      detachDifferentOwner(session.data.session.user.id);
      wakeBackend();
      const { data, error: authError } = await cloud.auth.getUser();
      if (run !== generation.current) return;
      if (authError) throw authError;
      if (!data.user || data.user.is_anonymous) {
        setHasAccountSession(false);
        leaveAccount();
        userId.current = null;
        setEmail(null);
        setStatus('guest');
        return;
      }
      const id = data.user.id;
      detachDifferentOwner(id);
      userId.current = id;
      setEmail(data.user.email || 'Tài khoản');
      const local = readAccountBundle(id);
      if (!local) {
        // A full snapshot is only needed for the first sign-in on this device; otherwise the
        // incremental sync below is enough and saves one request during a server cold start.
        const remote = await fetchCloudBundle(id);
        if (run !== generation.current) return;
        const device = readGuestBundle();
        if (hasPersonalData(device)) {
          deactivateAccount();
          setPendingTransfer({ userId: id, device, account: remote.bundle, accountHasData: hasPersonalData(remote.bundle) });
          setStatus('choice');
          onDataChanged();
          return;
        }
        await finishAccountTransfer(id, device, remote.bundle, 'account');
      } else {
        await synchronizeAccount(id, () => run === generation.current && userId.current === id && !resetting.current);
      }
      if (run !== generation.current || userId.current !== id) return;
      activateAccount(id);
      setAccountWriteEnabled(navigator.onLine);
      setPendingTransfer(null);
      initialized.current = true;
      setError('');
      setStatus('synced');
      markSynced();
      onDataChanged();
    } catch (reason) {
      if (run !== generation.current) return;
      if (keepWaking(reason, () => void bootstrap())) return;
      resetWake();
      setAccountWriteEnabled(false);
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối tài khoản.');
      setStatus(navigator.onLine ? 'error' : 'disconnected');
    }
  }, [onDataChanged, armSlow, keepWaking, markSynced, resetWake]);

  /** Stop showing and writing the account at once (signed out here or in another tab); bootstrap settles the rest. */
  const detachSignedOut = useCallback(() => {
    const shown = userId.current;
    setAccountWriteEnabled(false);
    initialized.current = false;
    userId.current = null;
    if (!shown || getActiveAccountId() === shown) deactivateAccount();
    if (shown) { clearCaptureSessionForAccountChange(); clearExplanationQueue(); void clearScreenshotWatcherForOwner(shown); }
    onDataChanged();
  }, [onDataChanged]);

  useEffect(() => {
    const requestEpoch = generation;
    void bootstrap();
    let disposed = false;
    const subscription = cloud?.auth.onAuthStateChange((event, session) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) {
        if (event === 'SIGNED_OUT') detachSignedOut();
        setTimeout(() => {
          if (disposed) return;
          // Supabase also emits SIGNED_IN when an existing session is confirmed
          // after returning to the tab. Keep the active account usable while
          // pulling changes; only a new identity needs the blocking bootstrap.
          if (event === 'SIGNED_IN' && session && !session.user.is_anonymous
            && initialized.current && userId.current === session.user.id
            && getActiveAccountId() === session.user.id) {
            void sync(false);
            return;
          }
          void bootstrap();
        }, 0);
      }
    });
    // Another tab signed out, switched account or purged/rewrote the shown account's copy.
    const storageChanged = (event: StorageEvent) => {
      if (disposed || (event.storageArea && event.storageArea !== localStorage)) return;
      const kind = crossTabAccountChange(event.key, userId.current);
      if (!kind) return;
      if (kind === 'data' && event.newValue !== null) { onDataChanged(); return; }
      if (userId.current && getActiveAccountId() !== userId.current) detachSignedOut();
      void bootstrap();
    };
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId.current) { userEdit.current = true; void sync(); }
    };
    const offline = () => { if (userId.current) { setAccountWriteEnabled(false); setStatus('disconnected'); } };
    const online = () => { if (userId.current) void sync(); };
    const focused = () => { if (userId.current && navigator.onLine) void sync(false); };
    window.addEventListener('toeic:account-data-changed', changed);
    window.addEventListener('storage', storageChanged);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', focused);
    return () => {
      disposed = true;
      requestEpoch.current++;
      clearTimeout(wake.current.slow); clearTimeout(wake.current.retry);
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener('toeic:account-data-changed', changed);
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focused);
    };
  }, [bootstrap, sync, detachSignedOut, onDataChanged]);

  // Keeps "vừa xong" / "3 phút trước" fresh without re-rendering constantly.
  useEffect(() => {
    if (syncedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [syncedAt]);

  const chooseTransfer = async (choice: TransferChoice) => {
    if (!pendingTransfer) return;
    setStatus('syncing');
    const run = generation.current;
    const id = pendingTransfer.userId;
    try {
      await finishAccountTransfer(pendingTransfer.userId, pendingTransfer.device, pendingTransfer.account, choice);
      if (run !== generation.current) return;
      activateAccount(id);
      setAccountWriteEnabled(navigator.onLine);
      setPendingTransfer(null);
      initialized.current = true;
      setError('');
      setStatus('synced');
      onDataChanged();
    } catch (reason) {
      if (run !== generation.current) return;
      setError(reason instanceof Error ? reason.message : 'Không thể chuyển dữ liệu.');
      setStatus('choice');
    }
  };

  const signInGoogle = async () => {
    if (!cloud) return;
    const { error: authError } = await cloud.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (authError) setError(authError.message);
  };
  const sendOtp = async (address: string) => {
    if (!cloud) return false;
    const { error: authError } = await cloud.auth.signInWithOtp({ email: address, options: { emailRedirectTo: window.location.origin } });
    setError(authError?.message || 'Đã gửi mã. Hãy kiểm tra hộp thư.');
    return !authError;
  };
  const verifyOtp = async (address: string, token: string) => {
    if (!cloud) return;
    const { error: authError } = await cloud.auth.verifyOtp({ email: address, token, type: 'email' });
    if (authError) { setError(authError.message); return; }
    await bootstrap();
  };
  const settleSync = async () => {
    for (let waited = 0; syncing.current && waited < 15_000; waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
  };
  const askSignOut = (count: number, id: string) => new Promise<boolean>(resolve => {
    warningAnswer.current?.(false);
    warningAnswer.current = resolve;
    setSignOutWarning({ count, userId: id });
  });
  const answerSignOutWarning = (proceed: boolean) => {
    const answer = warningAnswer.current;
    warningAnswer.current = null;
    setSignOutWarning(null);
    answer?.(proceed);
  };
  const signOut = async () => {
    if (!cloud) return;
    const id = userId.current ?? getActiveAccountId();
    if (id && unsyncedRecordCount(id) > 0) {
      // Try one upload first; warn only about what is still not on the server.
      if (initialized.current && userId.current === id && navigator.onLine) {
        await settleSync();
        await sync(false);
        await settleSync();
      }
      const count = unsyncedRecordCount(id);
      if (count > 0 && !await askSignOut(count, id)) return;
    }
    const { error: authError } = await cloud.auth.signOut({ scope: 'local' });
    if (authError) { setError(authError.message); throw new Error(authError.message); }
    generation.current += 1;
    resetWake();
    deactivateAccount();
    if (id) purgeAccountLocalStorage(id);
    clearCaptureSessionForAccountChange();
    clearExplanationQueue();
    void clearScreenshotWatcherForOwner(id);
    userId.current = null;
    initialized.current = false;
    setPendingTransfer(null);
    setEmail(null);
    setHasAccountSession(false);
    setStatus('guest');
    setError('');
    setSyncedAt(null);
    onDataChanged();
  };
  const deleteAccount = async () => {
    if (!await askConfirm({ title: 'Xóa tài khoản vĩnh viễn?', message: 'Tài khoản và toàn bộ dữ liệu trên máy chủ lẫn bản sao cục bộ trên trình duyệt này sẽ bị xóa, không thể khôi phục.', confirmLabel: 'Xóa tài khoản', destructive: true })) return;
    const id = userId.current ?? getActiveAccountId();
    try {
      await deleteCloudAccount();
      generation.current += 1;
      resetWake();
      deactivateAccount();
      if (id) purgeAccountLocalStorage(id);
      clearCaptureSessionForAccountChange();
      clearExplanationQueue();
      void clearScreenshotWatcherForOwner(id);
      userId.current = null;
      initialized.current = false;
      setPendingTransfer(null);
      setEmail(null);
      setHasAccountSession(false);
      setStatus('guest');
      setError('');
      setSyncedAt(null);
      onDataChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa tài khoản.');
    }
  };

  const resetLearningData = async () => {
    const id = userId.current;
    if (!id || getActiveAccountId() !== id || resetting.current || !navigator.onLine) {
      throw new Error('Cần đăng nhập và kết nối mạng để xóa dữ liệu tài khoản.');
    }
    resetting.current = true;
    const run = ++generation.current;
    initialized.current = false;
    dirty.current = false;
    setAccountWriteEnabled(false);
    setStatus('syncing');
    try {
      const reply = await resetCloudLearningData(id);
      if (run !== generation.current || userId.current !== id) throw new Error('Tài khoản đã thay đổi. Vui lòng tải lại để kiểm tra kết quả xóa.');
      writeAccountBundle(id, bundleFromRecords(reply.records));
      rememberSync(id, reply, true);
      clearRetiredCopies(id);
      clearCaptureSessionForAccountChange();
      clearExplanationQueue();
      void clearScreenshotWatcherForOwner(id);
      initialized.current = true;
      setAccountWriteEnabled(navigator.onLine);
      setError('');
      setStatus(navigator.onLine ? 'synced' : 'disconnected');
      onDataChanged();
      if (reply.sourceImageCleanupBefore) {
        localStorage.setItem(`toeic_source_image_cleanup_${id}`, reply.sourceImageCleanupBefore);
        setError('Dữ liệu học đã xóa; ảnh nguồn chưa dọn hết. Bấm thử kết nối lại để hoàn tất dọn ảnh.');
        setStatus('error');
      }
    } catch (reason) {
      if (run === generation.current) {
        // Recovery must fetch a full canonical snapshot; never re-upload a stale
        // local snapshot after a reset whose HTTP response may have been lost.
        localStorage.removeItem(`toeic_sync_cursor_${id}_v3`);
        setError(reason instanceof Error ? reason.message : 'Chưa xác nhận được kết quả xóa.');
        setStatus(navigator.onLine ? 'error' : 'disconnected');
      }
      throw reason;
    } finally {
      resetting.current = false;
    }
  };

  return { available: apiAvailable, hasAccountSession, status, email, error, pendingTransfer, signOutWarning, answerSignOutWarning, chooseTransfer, signInGoogle, sendOtp, verifyOtp, signOut, deleteAccount, resetLearningData, waking, syncedAt, savedAt, now, retry: () => { resetWake(); return userId.current && initialized.current ? sync() : bootstrap(); } };
}
