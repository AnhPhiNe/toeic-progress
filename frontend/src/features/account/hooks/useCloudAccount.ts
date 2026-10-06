import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataBundle } from '@/shared/data/dataBundle';
import { activateAccount, clearRetiredCopies, deactivateAccount, getActiveAccountId, readAccountBundle, readGuestBundle, setAccountWriteEnabled, writeAccountBundle } from '@/shared/data/dataBundle';
import { bundleFromRecords, cloud, deleteCloudAccount, fetchCloudBundle, rememberSync, resetCloudLearningData } from '@/features/account/services/cloud';
import { finishAccountTransfer, synchronizeAccount } from '@/features/account/services/cloudSync';
import { hasPersonalData, type TransferChoice } from '@/shared/data/syncMerge';
import type { AccountStatus } from '@/features/account/components/AccountPanel';
import { apiAvailable } from '@/shared/api/api';

interface PendingTransfer { userId: string; device: DataBundle; account: DataBundle }

export function useCloudAccount(onDataChanged: () => void) {
  const [status, setStatus] = useState<AccountStatus>(apiAvailable ? 'loading' : 'guest');
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const userId = useRef<string | null>(null);
  const initialized = useRef(false);
  const syncing = useRef(false);
  const dirty = useRef(false);
  const generation = useRef(0);
  const resetting = useRef(false);

  const sync = useCallback(async () => {
    if (resetting.current || !userId.current || !initialized.current) return;
    if (syncing.current) { dirty.current = true; return; }
    if (!navigator.onLine) { setStatus('disconnected'); setAccountWriteEnabled(false); return; }
    syncing.current = true;
    const id = userId.current;
    const run = generation.current;
    do {
      dirty.current = false;
      setStatus('syncing');
      try {
        const changed = await synchronizeAccount(id, () => run === generation.current && userId.current === id && !resetting.current);
        if (run !== generation.current || userId.current !== id) break;
        setAccountWriteEnabled(navigator.onLine);
        if (changed) onDataChanged();
        setError('');
        setStatus(navigator.onLine ? 'synced' : 'disconnected');
      } catch (reason) {
        if (run !== generation.current || userId.current !== id) break;
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
  }, [onDataChanged]);

  const bootstrap = useCallback(async () => {
    if (resetting.current) return;
    const run = ++generation.current;
    if (!cloud || !apiAvailable) {
      if (getActiveAccountId()) { deactivateAccount(); onDataChanged(); }
      return;
    }
    setStatus('loading');
    setAccountWriteEnabled(false);
    initialized.current = false;
    userId.current = null;
    try {
      const session = await cloud.auth.getSession();
      if (run !== generation.current) return;
      if (!session.data.session || session.data.session.user.is_anonymous) {
        if (getActiveAccountId()) { deactivateAccount(); onDataChanged(); }
        setPendingTransfer(null);
        setEmail(null);
        setStatus('guest');
        return;
      }
      const { data, error: authError } = await cloud.auth.getUser();
      if (run !== generation.current) return;
      if (authError) throw authError;
      if (!data.user || data.user.is_anonymous) {
        if (getActiveAccountId()) { deactivateAccount(); onDataChanged(); }
        userId.current = null;
        setEmail(null);
        setStatus('guest');
        return;
      }
      const id = data.user.id;
      userId.current = id;
      setEmail(data.user.email || 'Tài khoản');
      const local = readAccountBundle(id);
      const remote = await fetchCloudBundle(id);
      if (run !== generation.current) return;
      if (!local) {
        const device = readGuestBundle();
        if (hasPersonalData(device) && hasPersonalData(remote.bundle)) {
          deactivateAccount();
          setPendingTransfer({ userId: id, device, account: remote.bundle });
          setStatus('choice');
          onDataChanged();
          return;
        }
        await finishAccountTransfer(id, device, remote.bundle, hasPersonalData(device) ? 'merge' : 'account');
      } else {
        await synchronizeAccount(id, () => run === generation.current && !resetting.current);
      }
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
      setAccountWriteEnabled(false);
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối tài khoản.');
      setStatus(navigator.onLine ? 'error' : 'disconnected');
    }
  }, [onDataChanged]);

  useEffect(() => {
    const requestEpoch = generation;
    void bootstrap();
    let disposed = false;
    const subscription = cloud?.auth.onAuthStateChange(event => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) {
        setTimeout(() => { if (!disposed) void bootstrap(); }, 0);
      }
    });
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId.current) void sync();
    };
    const offline = () => { if (userId.current) { setAccountWriteEnabled(false); setStatus('disconnected'); } };
    const online = () => { if (userId.current) void sync(); };
    const focused = () => { if (userId.current && navigator.onLine) void sync(); };
    window.addEventListener('toeic:account-data-changed', changed);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', focused);
    return () => {
      disposed = true;
      requestEpoch.current++;
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener('toeic:account-data-changed', changed);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focused);
    };
  }, [bootstrap, sync]);

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
  const signOut = async () => {
    if (!cloud) return;
    const { error: authError } = await cloud.auth.signOut({ scope: 'local' });
    if (authError) { setError(authError.message); return; }
    deactivateAccount();
    userId.current = null;
    initialized.current = false;
    setPendingTransfer(null);
    setEmail(null);
    setStatus('guest');
    setError('');
    onDataChanged();
  };
  const deleteAccount = async () => {
    if (!window.confirm('Xóa tài khoản và toàn bộ dữ liệu trên máy chủ? Dữ liệu đã lưu trên máy này vẫn được giữ.')) return;
    try {
      await deleteCloudAccount();
      deactivateAccount();
      userId.current = null;
      initialized.current = false;
      setPendingTransfer(null);
      setEmail(null);
      setStatus('guest');
      setError('');
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
      initialized.current = true;
      setAccountWriteEnabled(navigator.onLine);
      setError('');
      setStatus(navigator.onLine ? 'synced' : 'disconnected');
      onDataChanged();
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

  return { available: apiAvailable, status, email, error, pendingTransfer, chooseTransfer, signInGoogle, sendOtp, verifyOtp, signOut, deleteAccount, resetLearningData, retry: () => userId.current && initialized.current ? sync() : bootstrap() };
}
