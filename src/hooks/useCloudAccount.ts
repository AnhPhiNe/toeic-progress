import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataBundle } from '../utils/dataBundle';
import { activateAccount, deactivateAccount, getActiveAccountId, readAccountBundle, readGuestBundle, setAccountWriteEnabled } from '../utils/dataBundle';
import { cloud, deleteCloudAccount, fetchCloudBundle } from '../utils/cloud';
import { finishAccountTransfer, synchronizeAccount } from '../utils/cloudSync';
import { hasPersonalData, type TransferChoice } from '../utils/syncMerge';
import type { AccountStatus } from '../components/AccountPanel';

interface PendingTransfer { userId: string; device: DataBundle; account: DataBundle }

export function useCloudAccount(onDataChanged: () => void) {
  const [status, setStatus] = useState<AccountStatus>(cloud ? 'loading' : 'guest');
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const userId = useRef<string | null>(null);
  const initialized = useRef(false);
  const syncing = useRef(false);
  const dirty = useRef(false);

  const sync = useCallback(async () => {
    if (!userId.current || !initialized.current) return;
    if (syncing.current) { dirty.current = true; return; }
    if (!navigator.onLine) { setStatus('disconnected'); setAccountWriteEnabled(false); return; }
    syncing.current = true;
    do {
      dirty.current = false;
      setStatus('syncing');
      try {
        const changed = await synchronizeAccount(userId.current);
        if (changed) onDataChanged();
        setError('');
        setStatus('synced');
      } catch (reason) {
        setAccountWriteEnabled(false);
        setError(reason instanceof Error ? reason.message : 'Không thể đồng bộ.');
        setStatus(navigator.onLine ? 'error' : 'disconnected');
        break;
      }
    } while (dirty.current);
    syncing.current = false;
  }, [onDataChanged]);

  const bootstrap = useCallback(async () => {
    if (!cloud) {
      if (getActiveAccountId()) { deactivateAccount(); onDataChanged(); }
      return;
    }
    setStatus('loading');
    setAccountWriteEnabled(false);
    initialized.current = false;
    try {
      const { data, error: authError } = await cloud.auth.getUser();
      if (authError) throw authError;
      if (!data.user) {
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
        activateAccount(id);
        await synchronizeAccount(id);
      }
      setPendingTransfer(null);
      initialized.current = true;
      setError('');
      setStatus('synced');
      onDataChanged();
    } catch (reason) {
      setAccountWriteEnabled(false);
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối tài khoản.');
      setStatus(navigator.onLine ? 'error' : 'disconnected');
    }
  }, [onDataChanged]);

  useEffect(() => {
    void bootstrap();
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
      window.removeEventListener('toeic:account-data-changed', changed);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focused);
    };
  }, [bootstrap, sync]);

  const chooseTransfer = async (choice: TransferChoice) => {
    if (!pendingTransfer) return;
    setStatus('syncing');
    try {
      await finishAccountTransfer(pendingTransfer.userId, pendingTransfer.device, pendingTransfer.account, choice);
      setPendingTransfer(null);
      initialized.current = true;
      setError('');
      setStatus('synced');
      onDataChanged();
    } catch (reason) {
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

  return { available: !!cloud, status, email, error, pendingTransfer, chooseTransfer, signInGoogle, sendOtp, verifyOtp, signOut, deleteAccount, retry: () => userId.current ? sync() : bootstrap() };
}
