import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { X, Download, Upload, RotateCcw, Trash2, LogOut } from 'lucide-react';
import { profileInitials } from '@/app/components/profileInitials';
import { PHONE_SHEET_BACKDROP, PHONE_SHEET_PANEL } from '@/shared/ui/surfaces';
import { UserProfile } from '@/shared/types';
import { exportDataAsJSON, loadUserProfile, restoreBackup } from '@/shared/data/storage';
import { parseBackup, type BackupPreview } from '@/shared/data/backup';
import { getActiveAccountId, live, readDataBundle } from '@/shared/data/dataBundle';
import { mergeProfileEdit } from '@/features/account/lib/profileEdit';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneSettings, type PhoneSettingsField } from './PhoneSettings';

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
    if (phoneEditing) { setPhoneEditing(null); return; }
    if (!resetBusy) onClose();
  }, [resetBusy, signOutBusy, onClose, phoneEditing]);
  const modalRef = useModalA11y(isOpen, closeWhenIdle);

  if (!isOpen) return null;

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
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                <p className="font-semibold">Không thể khôi phục tệp</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">{backupErrors.slice(0, 10).map((error, index) => <li key={index}>{error}</li>)}</ul>
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
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-700 dark:bg-slate-900" aria-label="Xem trước bản sao lưu">
                  <p className="font-semibold">Xem trước tệp sao lưu v{backupPreview.version}</p>
                  <div className="space-y-1">
                    {Object.entries(labels).map(([key, label]) => (
                      <p key={key} className="flex justify-between gap-2"><span>{label}</span><span className="font-semibold">{backupPreview.counts[key] ?? '—'} trong tệp · {currentCounts[key]} hiện có</span></p>
                    ))}
                  </div>
                  {backupPreview.preserved.map(label => <p key={label} className="text-amber-700 dark:text-amber-300">Tệp này không có {label} — giữ nguyên dữ liệu hiện tại.</p>)}
                  {backupPreview.corrections.length > 0 && (
                    <details><summary>Đã chuẩn hóa {backupPreview.corrections.length} trường</summary><ul className="mt-1 list-disc pl-4">{backupPreview.corrections.map((item, index) => <li key={index}>{item}</li>)}</ul></details>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={exportDataAsJSON} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold dark:border-slate-600">Xuất bản hiện tại trước</button>
                    <button type="button" onClick={handleRestore} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white">Thay thế</button>
                  </div>
                </div>
              );
            })()}
    {isPhone && resetError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{resetError}</p>}
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
  const fieldBase = 'rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';
  const group = 'divide-y divide-slate-100 overflow-hidden rounded-2xl border-[1.5px] border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-[#121A2B]';
  const eyebrow = 'mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400';
  const dataButton = 'flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3 text-xs font-black text-slate-900 shadow-[2px_2px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:bg-slate-900 dark:text-white dark:shadow-none';
  const signOutAction = onSignOut ? <div className="mt-3 space-y-2">
    <button type="button" disabled={resetBusy || signOutBusy} onClick={async () => {
      setSignOutBusy(true); setSignOutError('');
      try { await onSignOut(); }
      catch (error) { setSignOutError(error instanceof Error ? error.message : 'Chưa đăng xuất được. Hãy thử lại.'); }
      finally { setSignOutBusy(false); }
    }} className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
      <LogOut size={17} aria-hidden="true" />{signOutBusy ? 'Đang đăng xuất…' : 'Đăng xuất'}
    </button>
    {signOutError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{signOutError}</p>}
  </div> : null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${PHONE_SHEET_BACKDROP}`} onClick={event => { if (event.target === event.currentTarget) closeWhenIdle(); }}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className={`w-full max-w-[820px] overflow-hidden max-h-[90vh] flex flex-col rounded-3xl border-2 border-slate-900 bg-white shadow-[6px_6px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#121A2B] dark:shadow-[6px_6px_0_0_#cbd5e1] ${PHONE_SHEET_PANEL}`}>

        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-3.5 max-md:px-4 max-md:py-3 dark:border-slate-800">
          <h3 id="settings-modal-title" className="text-xl font-black text-slate-900 max-md:text-base max-md:font-bold dark:text-white">Cài đặt</h3>
          <button onClick={closeWhenIdle} disabled={resetBusy} aria-label="Đóng cài đặt" className="p-1 max-md:p-2.5 max-md:-mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

        {isPhone ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#FDFBF7] dark:bg-[#0B132B]" aria-busy={resetBusy}>
            <PhoneSettings profile={formData} syncLabel={syncLabel} editing={phoneEditing} setEditing={setPhoneEditing} onClose={closeWhenIdle}
              onSaveField={savePhoneField} accountPanel={accountPanel} signOutAction={signOutAction}
              onExport={exportDataAsJSON} onPickBackup={() => fileInputRef.current?.click()}
              onLoadDemo={onLoadDemo ? loadDemo : undefined} onReset={onResetData ? () => void handleReset() : undefined} resetBusy={resetBusy}
              dataNotice={(backupErrors.length > 0 || backupPreview || resetError) ? renderDataNotice() : undefined} />
          </div>
        ) : (
        // Computers: a profile card on the left (who, exam countdown, goal), grouped settings on the right, save always in view.
        <form onSubmit={handleSubmit} aria-busy={resetBusy} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-[255px] shrink-0 flex-col justify-between gap-3.5 overflow-y-auto border-r-2 border-slate-900 bg-[#FFFDF7] p-4 dark:border-slate-700 dark:bg-[#0B132B]">
              <div className="space-y-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-slate-900 bg-[#DDD6FE] text-base font-black text-slate-950 dark:border-slate-300" aria-hidden="true">
                    {profileInitials(formData.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black leading-tight text-slate-900 dark:text-white">{(formData.name || '').trim() || 'Học viên'}</p>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">Học viên TOEIC</p>
                  </div>
                </div>
                <div className="rounded-2xl border-2 border-slate-900 bg-sky-200 px-3.5 py-2.5 text-slate-950 shadow-[2.5px_2.5px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none">
                  <p className="text-[11px] font-bold text-sky-900">{formData.examDate ? `Ngày thi ${formData.examDate.split('-').reverse().join('/')}` : 'Chưa đặt ngày thi'}</p>
                  <p className="mt-0.5 text-2xl font-black leading-tight tabular-nums">{daysLeft === null ? '—' : daysLeft >= 0 ? `D-${daysLeft}` : 'Đã thi'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-2 dark:border-slate-300 dark:bg-slate-900">
                    <p className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">Mục tiêu</p>
                    <p className="text-xl font-black tabular-nums text-slate-900 dark:text-white">{formData.targetScore || '—'}</p>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-2 dark:border-slate-300 dark:bg-slate-900">
                    <p className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">Mỗi ngày</p>
                    <p className="text-xl font-black tabular-nums text-slate-900 dark:text-white">{formData.dailyMinGoalMinutes ? `${formData.dailyMinGoalMinutes}p` : '—'}</p>
                  </div>
                </div>
              </div>
              {accountPanel && <div className="text-xs">{accountPanel}</div>}
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto p-4 text-xs">
              <fieldset disabled={resetBusy} className="min-w-0 space-y-3.5">
                <section>
                  <h4 className={eyebrow}>Hồ sơ & Động lực</h4>
                  <div className={group}>
                    <label htmlFor="settings-name" className="grid grid-cols-12 items-center gap-3 px-3.5 py-2 text-[13px] font-bold text-slate-800 dark:text-slate-100">
                      <span className="col-span-4">Tên của bạn</span>
                      <input id="settings-name" type="text" required placeholder="Ví dụ: Minh Tuấn" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={fieldBase + ' col-span-8 w-full'} />
                    </label>
                    <label htmlFor="settings-motto" className="grid grid-cols-12 items-center gap-3 px-3.5 py-2 text-[13px] font-bold text-slate-800 dark:text-slate-100">
                      <span className="col-span-4">Châm ngôn</span>
                      <input id="settings-motto" type="text" value={formData.motto} onChange={e => setFormData({ ...formData, motto: e.target.value })} className={fieldBase + ' col-span-8 w-full'} />
                    </label>
                  </div>
                </section>

                <section>
                  <h4 className={eyebrow}>Mục tiêu & Chuỗi học</h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label htmlFor="settings-target" className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border-[1.5px] border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-slate-800 dark:border-slate-700 dark:bg-[#121A2B] dark:text-slate-100">
                      <span>Điểm mục tiêu</span>
                      <input id="settings-target" type="number" required min="10" max="990" step="5" value={formData.targetScore} onChange={e => setFormData({ ...formData, targetScore: Number(e.target.value) })} className={fieldBase + ' w-24 text-center tabular-nums'} />
                    </label>
                    <label htmlFor="settings-exam-date" className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border-[1.5px] border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-slate-800 dark:border-slate-700 dark:bg-[#121A2B] dark:text-slate-100">
                      <span>Ngày thi</span>
                      <input id="settings-exam-date" type="date" value={formData.examDate} onChange={e => setFormData({ ...formData, examDate: e.target.value })} className={fieldBase + ' w-36 text-center tabular-nums'} />
                    </label>
                    <label htmlFor="settings-daily-minutes" className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border-[1.5px] border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-slate-800 dark:border-slate-700 dark:bg-[#121A2B] dark:text-slate-100">
                      <span>Học mỗi ngày (phút)</span>
                      <input id="settings-daily-minutes" type="number" required min="5" max="300" value={formData.dailyMinGoalMinutes} onChange={e => setFormData({ ...formData, dailyMinGoalMinutes: Number(e.target.value) })} className={fieldBase + ' w-20 text-center tabular-nums'} />
                    </label>
                    <label htmlFor="settings-shields" className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border-[1.5px] border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-slate-800 dark:border-slate-700 dark:bg-[#121A2B] dark:text-slate-100">
                      <span>Khiên cứu chuỗi</span>
                      <input id="settings-shields" type="number" required min="0" max="5" value={formData.streakFreezes} onChange={e => setFormData({ ...formData, streakFreezes: Number(e.target.value) })} className={fieldBase + ' w-20 text-center tabular-nums'} />
                    </label>
                  </div>
                </section>

                <section className="space-y-2">
                  <h4 className={eyebrow}>Dữ liệu</h4>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-[1.5px] border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={exportDataAsJSON} className={dataButton} title="Tải bản sao lưu JSON về máy"><Download className="h-4 w-4" aria-hidden="true" />Sao lưu ra tệp</button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className={dataButton} title="Khôi phục dữ liệu từ tệp JSON"><Upload className="h-4 w-4" aria-hidden="true" />Khôi phục từ tệp</button>
                      {onLoadDemo && (
                        <button type="button" onClick={loadDemo} className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40">
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Nạp dữ liệu mẫu
                        </button>
                      )}
                    </div>
                    {onResetData && (
                      <button type="button" onClick={() => void handleReset()} disabled={resetBusy}
                        className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa toàn bộ dữ liệu'}
                      </button>
                    )}
                  </div>
                  {renderDataNotice()}
                </section>
                {signOutAction}
              </fieldset>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t-2 border-slate-900 bg-white px-6 py-3 dark:border-slate-700 dark:bg-[#121A2B]">
            {resetError && <p role="alert" className="mr-auto text-sm text-rose-600 dark:text-rose-400">{resetError}</p>}
            <button type="button" onClick={onClose} className="min-h-10 cursor-pointer rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Hủy</button>
            <button type="submit" disabled={resetBusy}
              className="min-h-10 cursor-pointer rounded-xl border-2 border-slate-900 bg-blue-600 px-5 text-sm font-black text-white shadow-[3px_3px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 dark:border-slate-200 dark:shadow-none">Lưu cài đặt</button>
          </div>
        </form>
        )}

      </div>
    </div>
  );
};
