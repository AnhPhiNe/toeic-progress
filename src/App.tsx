import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './components/Dashboard';
import { AnalyticsView } from './components/AnalyticsView';
import { MistakeNotebookView } from './components/MistakeNotebookView';
import { SpeakingWritingRoadmap } from './components/SpeakingWritingRoadmap';
import { ExamTimerView } from './components/ExamTimerView';
import { ResourcesView } from './components/ResourcesView';
import { SessionLoggerModal } from './components/SessionLoggerModal';
import { SettingsModal } from './components/SettingsModal';

import { 
  loadUserProfile, 
  saveUserProfile, 
  loadStudySessions, 
  saveStudySessions, 
  addStudySession, 
  loadMistakes, 
  saveMistakes, 
  loadDemoData, 
  resetToCleanSlate,
  getTodayDateString 
} from './utils/storage';
import { StudySession, MistakeEntry, UserProfile, NavTabId } from './types';

export const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>(loadUserProfile());
  const [sessions, setSessions] = useState<StudySession[]>(loadStudySessions());
  const [mistakes, setMistakes] = useState<MistakeEntry[]>(loadMistakes());

  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  // Giá trị điền sẵn khi form Nhập Điểm được mở từ Bộ đếm nhịp (SPEC 4.3)
  const [sessionPrefill, setSessionPrefill] = useState<{ durationMinutes?: number } | undefined>(undefined);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Theme Management: script chặn trong index.html đã gắn class 'dark' trước khi paint.
  // Đọc lại từ chính class đó để React luôn khớp với những gì người dùng đã nhìn thấy.
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('toeic_theme_v1', theme);
  }, [theme]);

  // Phím tắt toàn cục: Nhấn phím 'n' để mở nhanh Ghi nhận kết quả thi
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (isSessionModalOpen || isSettingsModalOpen) return;

      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openSessionLogger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionModalOpen, isSettingsModalOpen]);

  // Mở form Nhập Điểm, kèm giá trị điền sẵn nếu nơi gọi có cung cấp
  const openSessionLogger = (prefill?: { durationMinutes?: number }) => {
    setSessionPrefill(prefill);
    setIsSessionModalOpen(true);
  };

  const closeSessionLogger = () => {
    setIsSessionModalOpen(false);
    setSessionPrefill(undefined);
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Lưu và cập nhật session
  const handleSaveSession = (session: StudySession, newMistakes?: MistakeEntry[]) => {
    const result = addStudySession(session);
    setSessions(result.sessions);
    setProfile(result.profile);

    if (newMistakes && newMistakes.length > 0) {
      const updatedMistakes = [...newMistakes, ...mistakes];
      saveMistakes(updatedMistakes);
      setMistakes(updatedMistakes);
    }
  };

  // Xóa session
  const handleDeleteSession = (sessionId: string) => {
    const updated = sessions.filter(s => s.id !== sessionId);
    saveStudySessions(updated);
    setSessions(updated);
  };

  // Thêm lỗi sai vào Sổ tay
  const handleAddMistake = (entry: MistakeEntry) => {
    const updated = [entry, ...mistakes];
    saveMistakes(updated);
    setMistakes(updated);
  };

  // Chuyển đổi trạng thái lỗi sai
  const handleToggleMistakeStatus = (mistakeId: string) => {
    const updated = mistakes.map(m => {
      if (m.id === mistakeId) {
        const nextStatus: 'NEEDS_REVIEW' | 'MASTERED' = m.status === 'MASTERED' ? 'NEEDS_REVIEW' : 'MASTERED';
        return { ...m, status: nextStatus };
      }
      return m;
    });
    saveMistakes(updated);
    setMistakes(updated);
  };

  // Xóa lỗi sai
  const handleDeleteMistake = (mistakeId: string) => {
    const updated = mistakes.filter(m => m.id !== mistakeId);
    saveMistakes(updated);
    setMistakes(updated);
  };

  // Lưu cấu hình
  const handleSaveProfile = (newProfile: UserProfile) => {
    saveUserProfile(newProfile);
    setProfile(newProfile);
  };

  // Nạp lại demo data
  const handleLoadDemo = () => {
    if (confirm('Nạp lại dữ liệu mẫu Demo? (Dữ liệu sẽ được cập nhật bộ đề mẫu)')) {
      const demo = loadDemoData();
      setProfile(demo.profile);
      setSessions(demo.sessions);
      setMistakes(demo.mistakes);
    }
  };

  // Xóa trắng
  const handleResetData = () => {
    if (confirm('Bạn có chắc muốn XÓA TOÀN BỘ dữ liệu để bắt đầu học thật từ đầu?')) {
      const clean = resetToCleanSlate();
      setProfile(clean.profile);
      setSessions(clean.sessions);
      setMistakes(clean.mistakes);
    }
  };

  // Khôi phục sau khi import JSON
  const handleImportSuccess = () => {
    setProfile(loadUserProfile());
    setSessions(loadStudySessions());
    setMistakes(loadMistakes());
  };

  const pendingMistakesCount = mistakes.filter(m => m.status === 'NEEDS_REVIEW').length;
  const today = getTodayDateString();
  const hasStudiedToday = sessions.some(s => s.date === today) || profile.lastStudyDate === today;

  return (
    <div className="min-h-screen bg-[#F1F5F9] dark:bg-[#0B111E] text-slate-800 dark:text-slate-100 flex transition-colors">
      
      {/* 1. Sidebar (Desktop Persistent & Mobile Overlay Drawer Unified) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        profile={profile}
        pendingMistakesCount={pendingMistakesCount}
        sessions={sessions}
        hasStudiedToday={hasStudiedToday}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenSessionLogger={() => openSessionLogger()}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onResetData={handleResetData}
        onLoadDemo={handleLoadDemo}
        onImportSuccess={handleImportSuccess}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Main Content View Area (Right) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Topbar Header */}
        <Topbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profile={profile}
          hasStudiedToday={hasStudiedToday}
          theme={theme}
          toggleTheme={toggleTheme}
          onOpenSessionLogger={() => openSessionLogger()}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        {/* Body Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-4">
          {activeTab === 'dashboard' && (
            <Dashboard
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              theme={theme}
              onOpenSessionLogger={() => openSessionLogger()}
              onNavigateToAnalytics={() => setActiveTab('analytics')}
              onNavigateToMistakes={() => setActiveTab('mistakes')}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              theme={theme}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {activeTab === 'exam-mode' && (
            <ExamTimerView
              onOpenSessionLogger={openSessionLogger}
              theme={theme}
            />
          )}

          {activeTab === 'mistakes' && (
            <MistakeNotebookView
              mistakes={mistakes}
              onAddMistake={handleAddMistake}
              onToggleStatus={handleToggleMistakeStatus}
              onDeleteMistake={handleDeleteMistake}
            />
          )}

          {activeTab === 'resources' && (
            <ResourcesView sessions={sessions} targetScore={profile.targetScore} />
          )}

          {activeTab === 'sw-roadmap' && (
            <SpeakingWritingRoadmap />
          )}
        </main>

        {/* Modern 2-sided Sleek Footer */}
        <footer className="bg-white/80 dark:bg-[#0E1526]/80 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 py-3.5 sm:py-4 text-xs text-slate-500 dark:text-slate-400 transition-colors shadow-[0_-1px_3px_0_rgba(0,0,0,0.02)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">TOEIC Progress v2.4</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>Trạm Luyện Thi Cá Nhân</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <span>🔒 100% Offline-First</span>
              <span>•</span>
              <span>Dữ liệu lưu an toàn trên trình duyệt</span>
            </div>
          </div>
        </footer>

      </div>

      {/* Modals */}
      <SessionLoggerModal
        isOpen={isSessionModalOpen}
        onClose={closeSessionLogger}
        onSaveSession={handleSaveSession}
        sessions={sessions}
        prefill={sessionPrefill}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        profile={profile}
        onSaveProfile={handleSaveProfile}
        onResetData={handleResetData}
        onLoadDemo={handleLoadDemo}
        onImportSuccess={handleImportSuccess}
      />

    </div>
  );
};

export default App;
