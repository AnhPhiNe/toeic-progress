import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { X, Download, Upload, RotateCcw, Trash2, LogOut, Calendar, Quote, ShieldCheck, Target, Timer, User } from 'lucide-react';
import { profileInitials } from '@/app/components/profileInitials';
import { UserProfile } from '@/shared/types';
import { exportDataAsJSON, loadUserProfile, restoreBackup } from '@/shared/data/storage';
import { parseBackup, type BackupPreview } from '@/shared/data/backup';
import { getActiveAccountId, live, readDataBundle } from '@/shared/data/dataBundle';
import { mergeProfileEdit } from '@/features/account/lib/profileEdit';
import { goalLabel, shownGoal } from '@/features/today/lib/goalSetup';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneSettings, type PhoneSettingsField } from './PhoneSettings';
import { SettingsGoalEditor, SETTINGS_GOAL_POPOVER_ID } from './SettingsGoalEditor';
import { describeSync } from './AccountSyncIndicator';
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
  accountAvailable?: boolean;
  accountStatus?: AccountStatus;
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
  accountAvailable,
  accountStatus,
  onSignOut
}) => {
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
  // Computers: the goal row opens the same editor as Hôm nay in a popover.
  const [goalOpen, setGoalOpen] = useState(false);
  const goalButton = useRef<HTMLButtonElement>(null);
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
    setSignOutError('');
    return () => { sessionRef.current = null; readRequest.current += 1; };
  }, [isOpen]);
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

  // Escape (or the X) closes an open phone edit sheet first, then the whole dialog.
  const closeWhenIdle = useCallback(() => {
    if (signOutBusy) return;
    if (goalOpen) { setGoalOpen(false); return; }
    if (phoneEditing) { setPhoneEditing(null); return; }
    if (!resetBusy) onClose();
  }, [resetBusy, signOutBusy, onClose, phoneEditing, goalOpen]);
  const modalRef = useModalA11y(isOpen, closeWhenIdle);

  if (!isOpen) return null;
  // A fresh profile keeps the placeholder 990 until a goal is chosen: the field reads "Chưa chọn" instead.
  const goalSet = shownGoal(formData) !== null;

  const savePhoneField = (patch: Partial<UserProfile>): string | null => {
    setResetError('');
    try {
      const session = requireSession();
      const edited = { ...formData, ...patch };
      const merged = mergeProfileEdit(loadUserProfile(), session.profile, edited);
      requireSession(session);
      onSaveProfile(merged);
      setFormData(edited);
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Chưa lưu được. Hãy thử lại.';
    }
  };

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
        checklist: live(current.checklist).length,
        vocabLog: live(current.vocabLog).length,
        shieldDays: live(current.shieldDays).length,
        weeklyPlans: live(current.weeklyPlans).length
      };
      const labels: Record<string, string> = {
        sessions: 'Buổi học', mistakes: 'Lỗi sai', pacingRuns: 'Lượt Phòng Thi',
        checklist: 'Checklist', vocabLog: 'Ngày từ vựng', shieldDays: 'Ngày dùng khiên', weeklyPlans: 'Kế hoạch tuần'
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    try {
      const session = requireSession();
      const merged = mergeProfileEdit(loadUserProfile(), session.profile, formData);
      requireSession(session);
      onSaveProfile(merged);
      onClose();
    } catch (reason) {
      setResetError(reason instanceof Error ? reason.message : 'Chưa lưu được cấu hình. Nội dung đang nhập được giữ nguyên.');
    }
  };

  const daysLeft = formData.examDate ? Math.ceil((Date.parse(`${formData.examDate}T00:00:00`) - new Date(new Date().toDateString()).getTime()) / 86_400_000) : null;
  const sync = describeSync(!!accountAvailable, accountStatus ?? 'guest');
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
  const field = (id: string, label: string, tone: string, icon: React.ReactNode, input: React.ReactNode) => (
    <label htmlFor={id} className="st-field">
      <span className={'st-ic ' + tone} aria-hidden="true">{icon}</span><span className="st-lbl">{label}</span>{input}
    </label>
  );

  return (
    <div className="rd st st-scrim" onClick={event => { if (event.target === event.currentTarget) closeWhenIdle(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabIndex={-1} className="st-modal">
        <div className="st-modal__head">
          <h3 id="settings-modal-title">Cài đặt</h3>
          <button type="button" onClick={closeWhenIdle} disabled={resetBusy} aria-label="Đóng cài đặt" className="st-x"><X size={20} /></button>
        </div>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

        {isPhone ? (
          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={resetBusy}>
            <PhoneSettings profile={formData} syncLabel={syncLabel} editing={phoneEditing} setEditing={setPhoneEditing}
              onSaveField={savePhoneField} accountPanel={accountPanel} signOutAction={signOutAction}
              onExport={exportDataAsJSON} onPickBackup={() => fileInputRef.current?.click()}
              onLoadDemo={onLoadDemo ? loadDemo : undefined} onReset={onResetData ? () => void handleReset() : undefined} resetBusy={resetBusy}
              dataNotice={(backupErrors.length > 0 || backupPreview || resetError) ? renderDataNotice() : undefined} />
          </div>
        ) : (
        // Computers: the same groups as the phone list, one column, save always in view.
        <form onSubmit={handleSubmit} aria-busy={resetBusy} className="flex min-h-0 flex-1 flex-col">
          <div className="st-modal__body">
            <fieldset disabled={resetBusy}>
              <div className="st-me">
                <span className="st-me__av" aria-hidden="true">{profileInitials(formData.name)}</span>
                <div className="st-me__who">
                  <b>{(formData.name || '').trim() || 'Học viên'}</b>
                  <small><span className={'st-dot' + (sync.failed ? ' st-dot--warn' : sync.localOnly ? '' : ' st-dot--ok')} aria-hidden="true" />{syncLabel ?? sync.label}</small>
                </div>
                <div className="st-me__d">
                  <b>{daysLeft === null ? '—' : daysLeft >= 0 ? `D-${daysLeft}` : 'Đã thi'}</b>
                  <small>{formData.examDate ? `Thi ${formData.examDate.split('-').reverse().join('/')}` : 'Chưa đặt ngày thi'}</small>
                </div>
              </div>

              <section>
                <h4 className="st-h">Tài khoản</h4>
                <div className="st-group">
                  {field('settings-name', 'Tên của bạn', 'st-g', <User size={19} />,
                    <input id="settings-name" type="text" required placeholder="Ví dụ: Minh Tuấn" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />)}
                </div>
                {accountPanel && <div className="mt-2">{accountPanel}</div>}
              </section>

              <section>
                <h4 className="st-h">Mục tiêu</h4>
                <div className="st-group">
                  {field('settings-target', 'Điểm mục tiêu', 'st-b', <Target size={19} />,
                    <button id="settings-target" type="button" ref={goalButton} className="st-goal" aria-haspopup="dialog" aria-expanded={goalOpen}
                      aria-controls={goalOpen ? SETTINGS_GOAL_POPOVER_ID : undefined} onClick={event => { event.preventDefault(); setGoalOpen(open => !open); }}>
                      <b>{goalLabel(formData)}</b><span>{goalSet ? 'Đổi' : 'Chọn'}</span>
                    </button>)}
                  {field('settings-exam-date', 'Ngày thi', 'st-v', <Calendar size={19} />,
                    <input id="settings-exam-date" type="date" value={formData.examDate} onChange={e => setFormData({ ...formData, examDate: e.target.value })} />)}
                  {field('settings-daily-minutes', 'Học mỗi ngày (phút)', 'st-g', <Timer size={19} />,
                    <input id="settings-daily-minutes" type="number" required min="5" max="300" value={formData.dailyMinGoalMinutes} onChange={e => setFormData({ ...formData, dailyMinGoalMinutes: Number(e.target.value) })} />)}
                </div>
              </section>

              <section>
                <h4 className="st-h">Chuỗi học</h4>
                <div className="st-group">
                  {field('settings-shields', 'Khiên cứu chuỗi', 'st-y', <ShieldCheck size={19} />,
                    <input id="settings-shields" type="number" required min="0" max="5" value={formData.streakFreezes} onChange={e => setFormData({ ...formData, streakFreezes: Number(e.target.value) })} />)}
                  {field('settings-motto', 'Châm ngôn', 'st-p', <Quote size={19} />,
                    <input id="settings-motto" type="text" value={formData.motto} onChange={e => setFormData({ ...formData, motto: e.target.value })} />)}
                </div>
              </section>

              <section>
                <h4 className="st-h">Dữ liệu</h4>
                <div className="st-group st-data">
                  <button type="button" onClick={exportDataAsJSON} className="st-btn" title="Tải bản sao lưu JSON về máy"><Download size={16} aria-hidden="true" />Sao lưu ra tệp</button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="st-btn" title="Khôi phục dữ liệu từ tệp JSON"><Upload size={16} aria-hidden="true" />Khôi phục từ tệp</button>
                  {onLoadDemo && <button type="button" onClick={loadDemo} className="st-btn st-btn--quiet"><RotateCcw size={16} aria-hidden="true" />Nạp dữ liệu mẫu</button>}
                  {onResetData && (
                    <button type="button" onClick={() => void handleReset()} disabled={resetBusy} className="st-btn st-btn--danger ml-auto">
                      <Trash2 size={16} aria-hidden="true" />{resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa toàn bộ dữ liệu'}
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-2">{renderDataNotice()}</div>
              </section>
              {signOutAction}
            </fieldset>
          </div>
          <div className="st-modal__foot">
            {resetError && <p role="alert" className="st-err">{resetError}</p>}
            <button type="button" onClick={onClose} className="st-btn st-btn--quiet">Hủy</button>
            <button type="submit" disabled={resetBusy} className="st-btn st-btn--green">Lưu cài đặt</button>
          </div>
        </form>
        )}

        {!isPhone && goalOpen && <SettingsGoalEditor phone={false} anchor={goalButton.current} profile={formData} onSaveField={savePhoneField} onClose={() => setGoalOpen(false)} />}
      </div>
    </div>
  );
};
