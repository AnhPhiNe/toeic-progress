import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { 
  X, 
  Settings, 
  Save, 
  Target, 
  Calendar, 
  Clock, 
  Sparkles, 
  ShieldCheck,
  User,
  Database,
  Download,
  Upload,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { PHONE_SHEET_BACKDROP, PHONE_SHEET_FOOTER, PHONE_SHEET_PANEL } from '@/shared/ui/surfaces';
import { UserProfile } from '@/shared/types';
import { exportDataAsJSON, loadUserProfile, restoreBackup } from '@/shared/data/storage';
import { parseBackup, type BackupPreview } from '@/shared/data/backup';
import { getActiveAccountId, live, readDataBundle } from '@/shared/data/dataBundle';
import { mergeProfileEdit } from '@/features/account/lib/profileEdit';

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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onResetData,
  onLoadDemo,
  onImportSuccess,
  accountPanel
}) => {
  const [formData, setFormData] = useState<UserProfile>({ ...profile });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ownedPreview, setOwnedPreview] = useState<{ preview: BackupPreview; owner: string | null; cycle: number } | null>(null);
  const [backupErrors, setBackupErrors] = useState<string[]>([]);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
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

  const closeWhenIdle = useCallback(() => { if (!resetBusy) onClose(); }, [resetBusy, onClose]);
  const modalRef = useModalA11y(isOpen, closeWhenIdle);

  if (!isOpen) return null;

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

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${PHONE_SHEET_BACKDROP}`}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className={`w-full max-w-md rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${PHONE_SHEET_PANEL}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 max-md:px-4 max-md:py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="max-md:hidden p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 id="settings-modal-title" className="text-base font-bold text-slate-900 dark:text-white">Cài Đặt Mục Tiêu & Kỷ Luật</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tùy chỉnh thông số cá nhân và kỳ thi</p>
            </div>
          </div>
          <button onClick={closeWhenIdle} disabled={resetBusy} aria-label="Đóng cài đặt" className="p-1 max-md:p-2.5 max-md:-mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} aria-busy={resetBusy} className="p-5 max-md:px-4 max-md:pb-0 text-xs overflow-y-auto flex-1">
          <fieldset disabled={resetBusy} className="space-y-4">
          {accountPanel}
          
          {/* User Name */}
          <div>
            <label htmlFor="settings-name" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Họ & Tên Học Viên</span>
            </label>
            <input
              id="settings-name"
              type="text"
              required
              placeholder="Ví dụ: Minh Tuấn"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          {/* Target Score & Exam Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="settings-target" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Mục Tiêu Điểm Số</span>
              </label>
              <input
                id="settings-target"
                type="number"
                required
                min="10"
                max="990"
                step="5"
                value={formData.targetScore}
                onChange={e => setFormData({ ...formData, targetScore: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label htmlFor="settings-exam-date" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-500" />
                <span>Ngày Thi Thực Tế</span>
              </label>
              <input
                id="settings-exam-date"
                type="date"
                value={formData.examDate}
                onChange={e => setFormData({ ...formData, examDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Daily Goal & Streak Freezes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="settings-daily-minutes" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Học Tối Thiểu (Phút)</span>
              </label>
              <input
                id="settings-daily-minutes"
                type="number"
                required
                min="5"
                max="300"
                value={formData.dailyMinGoalMinutes}
                onChange={e => setFormData({ ...formData, dailyMinGoalMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label htmlFor="settings-shields" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Khiên Cứu Chuỗi</span>
              </label>
              <input
                id="settings-shields"
                type="number"
                required
                min="0"
                max="5"
                value={formData.streakFreezes}
                onChange={e => setFormData({ ...formData, streakFreezes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
          </div>

          {/* Motto */}
          <div>
            <label htmlFor="settings-motto" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
              <span>Châm Ngôn Kỷ Luật Cá Nhân</span>
            </label>
            <textarea
              id="settings-motto"
              rows={2}
              value={formData.motto}
              onChange={e => setFormData({ ...formData, motto: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          {/* Data Management Section */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Quản Lý Dữ Liệu Luyện Thi</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Chế độ khách lưu trên máy này; khi đăng nhập, dữ liệu tài khoản được đồng bộ. Bạn có thể xuất tệp JSON hoặc khôi phục bất cứ lúc nào.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={exportDataAsJSON}
                className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                title="Tải bản sao lưu JSON về máy"
              >
                <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Xuất Tệp Sao Lưu</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                title="Khôi phục dữ liệu từ tệp JSON"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-500" />
                <span>Khôi Phục Dữ Liệu</span>
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>

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

            <div className="flex items-center justify-between pt-1 text-[11px]">
              {onLoadDemo && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const session = requireSession();
                      if (!window.confirm('Bạn có muốn nạp dữ liệu mẫu Demo (bao gồm các lần làm bài thi mẫu và danh sách bẫy)?')) return;
                      requireSession(session);
                      onLoadDemo();
                      onClose();
                    } catch (reason) {
                      setResetError(reason instanceof Error ? reason.message : 'Chưa nạp được dữ liệu mẫu.');
                    }
                  }}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Nạp dữ liệu mẫu</span>
                </button>
              )}

              {onResetData && (
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={resetBusy}
                  className="text-rose-500 hover:text-rose-600 dark:text-rose-400 font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{resetBusy ? 'Đang xóa dữ liệu…' : 'Xóa trắng dữ liệu'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          {resetError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{resetError}</p>}
          {/* Điện thoại: chân form dính đáy màn hình trong vùng cuộn; nút X đã thay "Hủy" */}
          <div className={`pt-3 flex justify-end space-x-2 border-t border-slate-100 dark:border-slate-800 shrink-0 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:px-4 max-md:bg-white max-md:dark:bg-[#121A2B] ${PHONE_SHEET_FOOTER}`}>
            <button
              type="button"
              onClick={onClose}
              className="max-md:hidden px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 max-md:min-h-12 max-md:flex-1 max-md:justify-center max-md:text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm shadow-blue-600/25 cursor-pointer transition active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Lưu Cấu Hình</span>
            </button>
          </div>

          </fieldset>
        </form>

      </div>
    </div>
  );
};
