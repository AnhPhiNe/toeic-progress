import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './components/Dashboard';
import { AnalyticsView } from './components/AnalyticsView';
import { MistakeNotebookView } from './components/MistakeNotebookView';
import { SpeakingWritingRoadmap } from './components/SpeakingWritingRoadmap';
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
import { StudySession, MistakeEntry, UserProfile } from './types';
import { X } from 'lucide-react';

export const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>(loadUserProfile());
  const [sessions, setSessions] = useState<StudySession[]>(loadStudySessions());
  const [mistakes, setMistakes] = useState<MistakeEntry[]>(loadMistakes());

  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap'>('dashboard');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Theme Management (Light by default, saved in localStorage)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('toeic_theme_v1');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('toeic_theme_v1', theme);
  }, [theme]);

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
    <div className="min-h-screen bg-[#EBF0F7] dark:bg-[#0B111E] text-slate-800 dark:text-slate-100 flex transition-colors">
      
      {/* 1. Desktop Sidebar (Left) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        profile={profile}
        pendingMistakesCount={pendingMistakesCount}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenSessionLogger={() => setIsSessionModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onResetData={handleResetData}
        onLoadDemo={handleLoadDemo}
        onImportSuccess={handleImportSuccess}
      />

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />
          <div className="relative w-72 max-w-[80vw] bg-white dark:bg-[#0E1524] h-full shadow-2xl z-10 flex flex-col justify-between p-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-base text-slate-900 dark:text-white">Menu Điều Hướng</span>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-1">
              <button
                onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold ${
                  activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Bảng Chỉ Huy (Dashboard)
              </button>
              <button
                onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold ${
                  activeTab === 'analytics' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Phân Tích Chuyên Sâu (Analytics)
              </button>
              <button
                onClick={() => { setActiveTab('mistakes'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold ${
                  activeTab === 'mistakes' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sổ Tay Bắt Bẫy ({pendingMistakesCount})
              </button>
              <button
                onClick={() => { setActiveTab('sw-roadmap'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold ${
                  activeTab === 'sw-roadmap' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Lộ Trình S&W (400)
              </button>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <button
                onClick={() => { toggleTheme(); setIsMobileMenuOpen(false); }}
                className="w-full text-left py-2 text-slate-600 dark:text-slate-400 font-medium"
              >
                Đổi giao diện: {theme === 'dark' ? 'Chuyển sang Sáng' : 'Chuyển sang Tối'}
              </button>
              <button
                onClick={() => { handleLoadDemo(); setIsMobileMenuOpen(false); }}
                className="w-full text-left py-2 text-indigo-600 font-medium"
              >
                Nạp lại dữ liệu mẫu Demo
              </button>
              <button
                onClick={() => { handleResetData(); setIsMobileMenuOpen(false); }}
                className="w-full text-left py-2 text-rose-500 font-medium"
              >
                Xóa trắng để học thật
              </button>
            </div>
          </div>
        </div>
      )}

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
          onOpenSessionLogger={() => setIsSessionModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        {/* Body Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          {activeTab === 'dashboard' && (
            <Dashboard
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              theme={theme}
              onOpenSessionLogger={() => setIsSessionModalOpen(true)}
              onNavigateToAnalytics={() => setActiveTab('analytics')}
              onNavigateToMistakes={() => setActiveTab('mistakes')}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              sessions={sessions}
              mistakes={mistakes}
              theme={theme}
              onDeleteSession={handleDeleteSession}
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

          {activeTab === 'sw-roadmap' && (
            <SpeakingWritingRoadmap />
          )}
        </main>

        {/* Modern 2-sided Sleek Footer */}
        <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-5 text-xs text-slate-500 dark:text-slate-400 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">TOEIC Progress v2.4</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>Trạm Luyện Thi Cá Nhân 990</span>
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
        onClose={() => setIsSessionModalOpen(false)}
        onSaveSession={handleSaveSession}
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
