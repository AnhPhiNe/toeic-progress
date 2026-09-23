import React, { useState, useRef, useEffect } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';
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
import { UserProfile } from '../types';
import { exportDataAsJSON, restoreBackup } from '../utils/storage';
import { parseBackup, type BackupPreview } from '../utils/backup';
import { live, readDataBundle } from '../utils/dataBundle';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
  onResetData?: () => void;
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
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupErrors, setBackupErrors] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...profile });
    }
  }, [isOpen, profile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const result = parseBackup(content || '');
        setBackupPreview(result.ok ? result.preview : null);
        setBackupErrors(result.ok ? [] : result.errors);
      };
      reader.onerror = () => setBackupErrors(['Tệp: không thể đọc tệp sao lưu']);
      reader.readAsText(file);
      e.target.value = '';
    }
  };

  const handleRestore = () => {
    if (!backupPreview || !window.confirm('Thay thế dữ liệu bằng bản sao lưu đã xem trước? Dữ liệu hiện tại sẽ bị ghi đè.')) return;
    try {
      restoreBackup(backupPreview);
      setBackupPreview(null);
      onImportSuccess?.();
      onClose();
    } catch {
      setBackupErrors(['Không thể ghi dữ liệu. Dữ liệu hiện tại vẫn được giữ nguyên.']);
    }
  };

  const modalRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 id="settings-modal-title" className="text-base font-bold text-slate-900 dark:text-white">Cài Đặt Mục Tiêu & Kỷ Luật</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tùy chỉnh thông số cá nhân và kỳ thi</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {accountPanel}
          
          {/* User Name */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Họ & Tên Học Viên</span>
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Minh Tuấn"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          {/* Target Score & Exam Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Mục Tiêu Điểm Số</span>
              </label>
              <input
                type="number"
                min="10"
                max="990"
                step="5"
                value={formData.targetScore}
                onChange={e => setFormData({ ...formData, targetScore: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-500" />
                <span>Ngày Thi Thực Tế</span>
              </label>
              <input
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
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Học Tối Thiểu (Phút)</span>
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={formData.dailyMinGoalMinutes}
                onChange={e => setFormData({ ...formData, dailyMinGoalMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Khiên Cứu Chuỗi</span>
              </label>
              <input
                type="number"
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
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
              <span>Châm Ngôn Kỷ Luật Cá Nhân</span>
            </label>
            <textarea
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
                shieldDays: live(current.shieldDays).length
              };
              const labels: Record<string, string> = {
                sessions: 'Buổi học', mistakes: 'Lỗi sai', pacingRuns: 'Lượt Phòng Thi',
                checklist: 'Checklist', vocabLog: 'Ngày từ vựng', shieldDays: 'Ngày dùng khiên'
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
                    if (window.confirm('Bạn có muốn nạp dữ liệu mẫu Demo (bao gồm các lần làm bài thi mẫu và danh sách bẫy)?')) {
                      onLoadDemo();
                      onClose();
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
                  onClick={() => {
                    if (window.confirm('CẢNH BÁO: Toàn bộ lịch sử luyện thi, sổ bẫy và tiến độ sẽ bị xóa hoàn toàn để bắt đầu mới. Bạn có chắc chắn muốn xóa?')) {
                      onResetData();
                      onClose();
                    }
                  }}
                  className="text-rose-500 hover:text-rose-600 dark:text-rose-400 font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Xóa trắng dữ liệu</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm shadow-blue-600/25 cursor-pointer transition active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Lưu Cấu Hình</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
