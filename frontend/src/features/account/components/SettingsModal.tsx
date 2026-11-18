import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { X, LogOut } from 'lucide-react';
import { UserProfile } from '@/shared/types';
import { exportDataAsJSON, loadUserProfile, restoreBackup } from '@/shared/data/storage';
import { parseBackup, type BackupPreview } from '@/shared/data/backup';
import { getActiveAccountId, live, readDataBundle } from '@/shared/data/dataBundle';
import { mergeProfileEdit } from '@/features/account/lib/profileEdit';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneSettings, type PhoneSettingsField } from './PhoneSettings';
import { SettingsDesktop, type DesktopSettingsField } from './SettingsDesktop';
import { describeSync, type SyncDetail } from '@/features/account/lib/syncStatus';
import type { AccountStatus } from './AccountPanel';
import './account.css';

interface SettingsSession { owner: string | null; cycle: number; profile: UserProfile }

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
  onResetData?: () => Promise<void>;
  onLoadDemo?: () => void;
  onImportSuccess?: () => void;
  accountPanel?: React.ReactNode;
  /** Phone account card subtitle, e.g. "Chỉ lưu trên máy". */
  syncLabel?: string;
  syncDetail?: SyncDetail;
  accountAvailable?: boolean;
  accountStatus?: AccountStatus;
  /** Signed-in email; computers show it under the name with a quiet Đăng xuất. */
  accountEmail?: string | null;
  accountError?: string;
  /** Computers: the header's "Đăng nhập với Google" for guests. */
  onSignIn?: () => Promise<void>;
  onSignOut?: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onResetData,
  onLoadDemo,
  onImportSuccess,
  accountPanel,
  syncLabel,
  syncDetail,
  accountAvailable,
  accountStatus,
  accountEmail,
  accountError,
  onSignIn,
  onSignOut
}) => {
  // The saved profile as shown; edits live in each tile's editor (or phone sheet) until that field is saved.
  const [formData, setFormData] = useState<UserProfile>({ ...profile });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ownedPreview, setOwnedPreview] = useState<{ preview: BackupPreview; owner: string | null; cycle: number } | null>(null);
  const [backupErrors, setBackupErrors] = useState<string[]>([]);
  const [resetBusy, setResetBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [resetError, setResetError] = useState('');
  // Phones show a grouped list; one row at a time opens a sheet that saves just that field.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [phoneEditing, setPhoneEditing] = useState<PhoneSettingsField | null>(null);
  // Computers: one tile (or the name, or the account popover) at a time opens a small editor that saves just that field.
  const [editing, setEditingState] = useState<DesktopSettingsField | null>(null);
  // The profile the open editor started from, so a same-field change made elsewhere meanwhile is a conflict, not an overwrite.
  const editSnapshot = useRef<UserProfile | null>(null);
  const formRef = useRef(formData);
  formRef.current = formData;
  const sessionRef = useRef<SettingsSession | null>(null);
  const cycleRef = useRef(0);
  const readRequest = useRef(0);
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const activeOwner = getActiveAccountId();
  const backupPreview = ownedPreview && ownedPreview.owner === activeOwner && ownedPreview.cycle === sessionRef.current?.cycle ? ownedPreview.preview : null;
  const sessionIsCurrent = (session: SettingsSession) => openRef.current && sessionRef.current === session && getActiveAccountId() === session.owner;
  const requireSession = (expected?: SettingsSession) => {
    const session = sessionRef.current;
    if (!session || expected && session !== expected || !sessionIsCurrent(session)) throw new Error('Tài khoản đã thay đổi. Đóng và mở lại Cài đặt trước khi tiếp tục.');
    return session;
  };
  const setEditing = useCallback((field: DesktopSettingsField | null) => {
    editSnapshot.current = field ? formRef.current : null;
    setEditingState(field);
  }, []);

  useEffect(() => {
    if (!isOpen) { setOwnedPreview(null); setBackupErrors([]); return; }
    const initial = loadUserProfile();
    sessionRef.current = { owner: getActiveAccountId(), cycle: ++cycleRef.current, profile: initial };
    setFormData({ ...initial });
    setOwnedPreview(null);
    setBackupErrors([]);
    setResetError('');
    setResetBusy(false);
    setPhoneEditing(null);
    setEditingState(null);
    setSignOutError('');
    return () => { sessionRef.current = null; readRequest.current += 1; };
  }, [isOpen]);
  // A profile change made elsewhere while open (a goal picked on Hôm nay, a sync) shows in the tiles; open editors keep their drafts.
  useEffect(() => {
    if (isOpen && sessionRef.current && sessionRef.current.owner === getActiveAccountId()) setFormData({ ...loadUserProfile() });
  }, [isOpen, profile]);
  useEffect(() => {
    if (!isOpen || sessionRef.current?.owner === activeOwner) return;
    sessionRef.current = null;
    readRequest.current += 1;
    setOwnedPreview(null);
    setBackupErrors([]);
    setResetError('Tài khoản đã thay đổi. Đóng và mở lại Cài đặt trước khi tiếp tục.');
  }, [isOpen, activeOwner]);

  const handleReset = async () => {
    if (!onResetData || resetBusy) return;
    setResetError('');
    let session: SettingsSession | null = null;
    try {
      session = requireSession();
      const message = session.owner
        ? 'Xóa nội dung học của tài khoản này trên server và máy đang dùng? Máy chủ chỉ giữ mã bản ghi và dấu xóa để đồng bộ. Không thể phục hồi nếu chưa xuất bản sao lưu. Dữ liệu khách riêng và tệp backup đã tải không bị xóa.'
        : 'Xóa nội dung học khách trên trình duyệt này? Không thể phục hồi nếu chưa xuất bản sao lưu. Dữ liệu tài khoản và tệp backup đã tải không bị xóa.';
      if (!window.confirm(message)) return;
      requireSession(session);
      setResetBusy(true);
      await onResetData();
      if (sessionIsCurrent(session)) onClose();
    } catch (reason) {
      if (!session || sessionIsCurrent(session)) setResetError(reason instanceof Error ? reason.message : 'Chưa xác nhận được kết quả xóa. Vui lòng kết nối và thử lại.');
    } finally {
      if (!session || sessionIsCurrent(session)) setResetBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const session = requireSession(), request = ++readRequest.current;
      setOwnedPreview(null);
      setBackupErrors([]);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (request !== readRequest.current || !sessionIsCurrent(session)) return;
        const content = event.target?.result as string;
        const result = parseBackup(content || '');
        setOwnedPreview(result.ok ? { preview: result.preview, owner: session.owner, cycle: session.cycle } : null);
        setBackupErrors(result.ok ? [] : result.errors);
      };
      reader.onerror = () => {
        if (request === readRequest.current && sessionIsCurrent(session)) setBackupErrors(['Tệp: không thể đọc tệp sao lưu']);
      };
      reader.readAsText(file);
    } catch (reason) {
      setBackupErrors([reason instanceof Error ? reason.message : 'Tệp: không thể đọc tệp sao lưu']);
    }
  };

  const handleRestore = () => {
    try {
      const session = requireSession();
      if (!backupPreview || ownedPreview?.owner !== session.owner || ownedPreview.cycle !== session.cycle) return;
      if (!window.confirm('Thay thế dữ liệu bằng bản sao lưu đã xem trước? Dữ liệu hiện tại sẽ bị ghi đè.')) return;
      requireSession(session);
      restoreBackup(backupPreview);
      setOwnedPreview(null);
      onImportSuccess?.();
      onClose();
    } catch (reason) {
      setBackupErrors([reason instanceof Error ? reason.message : 'Không thể ghi dữ liệu. Dữ liệu hiện tại vẫn được giữ nguyên.']);
    }
  };

  // Escape (or the X) closes an open editor or phone sheet first, then the whole dialog.
  const closeWhenIdle = useCallback(() => {
    if (signOutBusy) return;
    if (editing) { setEditing(null); return; }
    if (phoneEditing) { setPhoneEditing(null); return; }
    if (!resetBusy) onClose();
  }, [resetBusy, signOutBusy, onClose, phoneEditing, editing, setEditing]);
  const modalRef = useModalA11y(isOpen, closeWhenIdle);

  if (!isOpen) return null;

  // Goal editor: only the goal fields reach storage, merged into the latest profile like Hôm nay's editor.
  const saveGoalOnly = (patch: Partial<UserProfile>): string | null => {
    try {
      const session = requireSession();
      const latest = loadUserProfile();
      const merged = mergeProfileEdit(latest, latest, { ...latest, ...patch });
      requireSession(session);
      onSaveProfile(merged);
      setFormData({ ...merged });
      setResetError('');
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Chưa lưu được. Hãy thử lại.';
    }
  };

  // One tile's field (computers) or one sheet's field (phones): only that field is merged into the stored profile.
  const saveOneField = (patch: Partial<UserProfile>, snapshot: UserProfile): string | null => {
    try {
      const session = requireSession();
      const merged = mergeProfileEdit(loadUserProfile(), snapshot, { ...snapshot, ...patch });
      requireSession(session);
      onSaveProfile(merged);
      setFormData({ ...merged });
      setResetError('');
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Chưa lưu được. Hãy thử lại.';
    }
  };
  const saveTileField = (patch: Partial<UserProfile>) => saveOneField(patch, editSnapshot.current ?? formData);
  const savePhoneField = (patch: Partial<UserProfile>) => saveOneField(patch, formData);

  const loadDemo = () => {
    try {
      const session = requireSession();
      if (!window.confirm('Bạn có muốn nạp dữ liệu mẫu Demo (bao gồm các lần làm bài thi mẫu và danh sách bẫy)?')) return;
      requireSession(session);
      onLoadDemo?.();
      onClose();
    } catch (reason) {
      setResetError(reason instanceof Error ? reason.message : 'Chưa nạp được dữ liệu mẫu.');
    }
  };

  const renderDataNotice = () => <>
    {backupErrors.length > 0 && (
      <div role="alert" className="st-notice st-notice--err">
        <b>Không thể khôi phục tệp</b>
        <ul>{backupErrors.slice(0, 10).map((error, index) => <li key={index}>{error}</li>)}</ul>
      </div>
    )}

    {backupPreview && (() => {
      const current = readDataBundle();
      const currentCounts: Record<string, number> = {
        sessions: live(current.sessions).length,
        mistakes: live(current.mistakes).length,
        pacingRuns: live(current.pacingRuns).length,
        vocabLog: live(current.vocabLog).length,
        shieldDays: live(current.shieldDays).length
      };
      const labels: Record<string, string> = {
        sessions: 'Buổi học', mistakes: 'Lỗi sai', pacingRuns: 'Lượt Phòng Thi',
        vocabLog: 'Ngày từ vựng', shieldDays: 'Ngày dùng khiên'
      };
      return (
        <div className="st-notice space-y-2" aria-label="Xem trước bản sao lưu">
          <p><b>Xem trước tệp sao lưu v{backupPreview.version}</b></p>
          <div>
            {Object.entries(labels).map(([key, label]) => (
              <p key={key} className="st-line"><span>{label}</span><b>{backupPreview.counts[key] ?? '—'} trong tệp · {currentCounts[key]} hiện có</b></p>
            ))}
          </div>
          {backupPreview.preserved.map(label => <p key={label} className="st-warn">Tệp này không có {label} — giữ nguyên dữ liệu hiện tại.</p>)}
          {backupPreview.corrections.length > 0 && (
            <details><summary>Đã chuẩn hóa {backupPreview.corrections.length} trường</summary><ul>{backupPreview.corrections.map((item, index) => <li key={index}>{item}</li>)}</ul></details>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={exportDataAsJSON} className="st-btn">Xuất bản hiện tại trước</button>
            <button type="button" onClick={handleRestore} className="st-btn st-btn--green">Thay thế</button>
          </div>
        </div>
      );
    })()}
    {isPhone && resetError && <p role="alert" className="st-err">{resetError}</p>}
  </>;

  const sync = describeSync(!!accountAvailable, accountStatus ?? 'guest', syncDetail);
  const signOutAction = onSignOut ? <div className="mt-3 space-y-2">
    <button type="button" disabled={resetBusy || signOutBusy} onClick={async () => {
      setSignOutBusy(true); setSignOutError('');
      try { await onSignOut(); }
      catch (error) { setSignOutError(error instanceof Error ? error.message : 'Chưa đăng xuất được. Hãy thử lại.'); }
      finally { setSignOutBusy(false); }
    }} className="st-btn st-btn--wide">
      <LogOut size={17} aria-hidden="true" />{signOutBusy ? 'Đang đăng xuất…' : 'Đăng xuất'}
    </button>
    {signOutError && <p role="alert" className="st-err">{signOutError}</p>}
  </div> : null;

  return (
    <div className="rd st st-scrim" onClick={event => { if (event.target === event.currentTarget) closeWhenIdle(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabIndex={-1} className={'st-modal' + (isPhone ? '' : ' st-modal--b')}>
        {isPhone ? (
          <div className="st-modal__head">
            <h3 id="settings-modal-title">Cài đặt</h3>
            <button type="button" onClick={closeWhenIdle} disabled={resetBusy} aria-label="Đóng cài đặt" className="st-x"><X size={20} /></button>
          </div>
        ) : (
          <button type="button" onClick={closeWhenIdle} disabled={resetBusy} aria-label="Đóng cài đặt" className="st-x stb-x"><X size={20} /></button>
        )}

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

        {isPhone ? (
          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={resetBusy}>
            <PhoneSettings profile={formData} syncLabel={syncLabel} syncTone={sync.tone} editing={phoneEditing} setEditing={setPhoneEditing}
              onSaveField={savePhoneField} accountPanel={accountPanel} signOutAction={signOutAction}
              onExport={exportDataAsJSON} onPickBackup={() => fileInputRef.current?.click()}
              onLoadDemo={onLoadDemo ? loadDemo : undefined} onReset={onResetData ? () => void handleReset() : undefined} resetBusy={resetBusy}
              dataNotice={(backupErrors.length > 0 || backupPreview || resetError) ? renderDataNotice() : undefined} />
          </div>
        ) : (
          <SettingsDesktop profile={formData} editing={editing} onEdit={setEditing} onSaveField={saveTileField} onSaveGoal={saveGoalOnly}
            sync={sync} email={accountEmail ?? null} accountAvailable={!!accountAvailable} accountError={accountError} accountPanel={accountPanel}
            onSignIn={onSignIn} onSignOut={onSignOut} busy={resetBusy}
            onExport={exportDataAsJSON} onPickBackup={() => fileInputRef.current?.click()}
            onLoadDemo={onLoadDemo ? loadDemo : undefined} onReset={onResetData ? () => void handleReset() : undefined} resetBusy={resetBusy}
            dataNotice={(backupErrors.length > 0 || backupPreview) ? renderDataNotice() : undefined} error={resetError || undefined}
            dialog={modalRef.current} />
        )}
      </div>
    </div>
  );
};
