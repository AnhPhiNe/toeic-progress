import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/app/components/Sidebar';
import { Topbar } from '@/app/components/Topbar';
import { Dashboard } from '@/features/dashboard/components/Dashboard';
import { AnalyticsView } from '@/features/analytics/components/AnalyticsView';
import { ExamHistoryView } from '@/features/study-sessions/components/ExamHistoryView';
import { MistakeNotebookView } from '@/features/mistakes/components/MistakeNotebookView';
import { ReadingPacingView } from '@/features/pacing/components/ReadingPacingView';
import { PlanView } from '@/features/plans/components/PlanView';
import { ResourcesView } from '@/features/resources/components/ResourcesView';
import { VocabularyView } from '@/features/vocabulary/components/VocabularyView';
import { SessionLoggerModal } from '@/features/study-sessions/components/SessionLoggerModal';
import { SettingsModal } from '@/features/account/components/SettingsModal';
import { ReviewSessionModal } from '@/features/mistakes/components/ReviewSessionModal';
import { RelapseAlert } from '@/features/dashboard/components/RelapseAlert';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { OnboardingCard } from '@/app/components/OnboardingCard';
import { CARD } from '@/shared/ui/surfaces';
import { useCloudAccount } from '@/features/account/hooks/useCloudAccount';
import { useRouteTab } from '@/app/routing/useRouteTab';
import { getActiveAccountId, readDataBundle } from '@/shared/data/dataBundle';
import { hasPersonalData } from '@/shared/data/syncMerge';

import { 
  loadUserProfile, 
  saveUserProfile, 
  loadStudySessions, 
  updateStudySessions,
  addStudySession,
  loadMistakes,
  updateMistakes,
  loadDemoData, 
  resetToCleanSlate,
  loadVocabLog,
  upsertVocabLog,
  deleteVocabLog,
  recordDailyActivity,
  getTodayDateString 
} from '@/shared/data/storage';
import { StudySession, MistakeEntry, UserProfile, ReadingPartType } from '@/shared/types';
import { applyReviewResult, getDueMistakes } from '@/features/mistakes/lib/spacedRepetition';

export const App: React.FC = () => {
  // Khởi tạo lazy: đọc bộ nhớ một lần khi mount, không phải ở mỗi lần render
  const [profile, setProfile] = useState<UserProfile>(loadUserProfile);
  const [sessions, setSessions] = useState<StudySession[]>(loadStudySessions);
  const [mistakes, setMistakes] = useState<MistakeEntry[]>(loadMistakes);
  const [vocabLog, setVocabLog] = useState(loadVocabLog);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('toeic_onboarding_done_v1') && !hasPersonalData(readDataBundle()));
  const [dataVersion, setDataVersion] = useState(0);

  const dismissOnboarding = () => {
    localStorage.setItem('toeic_onboarding_done_v1', 'true');
    setShowOnboarding(false);
  };

  const refreshFromStorage = useCallback(() => {
    setProfile(loadUserProfile());
    setSessions(loadStudySessions());
    setMistakes(loadMistakes());
    setVocabLog(loadVocabLog());
    setDataVersion(value => value + 1);
  }, []);
  const account = useCloudAccount(refreshFromStorage);

  const [activeTab, setActiveTab] = useRouteTab();
  const [pacingInitialPart, setPacingInitialPart] = useState<ReadingPartType>('PART_5');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  // Giá trị điền sẵn khi form Nhập Điểm được mở từ Bộ đếm nhịp hoặc trang Phân tích (SPEC 4.3)
  const [sessionPrefill, setSessionPrefill] = useState<{ durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' } | undefined>(undefined);
  // Có giá trị = form Nhập Điểm đang ở chế độ sửa bản ghi này
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
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
  const openSessionLogger = (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => {
    setEditingSession(null);
    setSessionPrefill(prefill);
    setIsSessionModalOpen(true);
  };

  // Mở cùng form Nhập Điểm ở chế độ sửa một bản ghi có sẵn
  const openSessionEditor = (session: StudySession) => {
    setSessionPrefill(undefined);
    setEditingSession(session);
    setIsSessionModalOpen(true);
  };

  const closeSessionLogger = () => {
    setIsSessionModalOpen(false);
    setSessionPrefill(undefined);
    setEditingSession(null);
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Lưu và cập nhật session
  const handleSaveSession = (session: StudySession, newMistakes?: MistakeEntry[]) => {
    const result = addStudySession(session);
    dismissOnboarding();
    setSessions(result.sessions);
    setProfile(result.profile);

    if (newMistakes && newMistakes.length > 0) {
      setMistakes(updateMistakes(current => [...newMistakes, ...current]));
    }
  };

  // Phòng Thi tự ghi buổi học vào bộ nhớ; đọc lại để state không bị cũ
  const handleSessionsChangedElsewhere = useCallback(() => {
    setSessions(loadStudySessions());
    setProfile(loadUserProfile());
  }, []);

  const handleSaveVocab = (date: string, count: number) => {
    setVocabLog(upsertVocabLog(date, count));
    dismissOnboarding();
    setProfile(recordDailyActivity(profile, date));
  };

  const handleDeleteVocab = (id: string) => {
    setVocabLog(deleteVocabLog(id));
  };

  /**
   * Thay thế một buổi học đã có. KHÔNG đi qua addStudySession: sửa số liệu
   * một buổi cũ không phải là hoạt động học hôm nay, nên streak và pháo giấy
   * kỷ lục không được kích hoạt.
   */
  const handleUpdateSession = (session: StudySession, newMistakes?: MistakeEntry[]) => {
    setSessions(updateStudySessions(current => current.map(s => (s.id === session.id ? session : s))));
    setProfile(loadUserProfile());

    if (newMistakes && newMistakes.length > 0) {
      setMistakes(updateMistakes(current => [...newMistakes, ...current]));
    }
  };

  // Thay nội dung một thẻ lỗi sai (trạng thái & lịch ôn đã được giữ ở form)
  const handleUpdateMistake = (entry: MistakeEntry) => {
    setMistakes(updateMistakes(current => current.map(m => (m.id === entry.id ? entry : m))));
  };

  // Xóa session
  const handleDeleteSession = (sessionId: string) => {
    setSessions(updateStudySessions(current => current.filter(s => s.id !== sessionId)));
    setProfile(loadUserProfile());
  };

  // Thêm lỗi sai vào Sổ tay
  const handleAddMistake = (entry: MistakeEntry) => {
    setMistakes(updateMistakes(current => [entry, ...current]));
  };

  // Chuyển đổi trạng thái lỗi sai
  const handleToggleMistakeStatus = (mistakeId: string) => {
    setMistakes(updateMistakes(current => current.map(m => {
      if (m.id === mistakeId) {
        const nextStatus: 'NEEDS_REVIEW' | 'MASTERED' = m.status === 'MASTERED' ? 'NEEDS_REVIEW' : 'MASTERED';
        return { ...m, status: nextStatus };
      }
      return m;
    })));
  };

  // Ghi kết quả tự chấm một thẻ trong phiên ôn (SPEC mục 4.6)
  const handleGradeMistake = (mistakeId: string, remembered: boolean) => {
    setMistakes(updateMistakes(current => current.map(m =>
      m.id === mistakeId ? applyReviewResult(m, remembered) : m
    )));
  };

  /**
   * Hạ các thẻ đã thông suốt về lại trạng thái cần ôn, hẹn ngay hôm nay.
   * Đây là hành động người dùng chủ động bấm chứ không tự chạy ngầm - hệ
   * thống phát hiện và đề nghị, còn quyết định vẫn là của người học.
   */
  const handleReopenCards = (mistakeIds: string[]) => {
    const ids = new Set(mistakeIds);
    const today = getTodayDateString();
    setMistakes(updateMistakes(current => current.map(m =>
      ids.has(m.id)
        ? { ...m, status: 'NEEDS_REVIEW' as const, reviewStage: 0, nextReviewDate: today }
        : m
    )));
  };

  // Xóa lỗi sai
  const handleDeleteMistake = (mistakeId: string) => {
    setMistakes(updateMistakes(current => current.filter(m => m.id !== mistakeId)));
  };

  // Lưu cấu hình
  const handleSaveProfile = (newProfile: UserProfile) => {
    saveUserProfile(newProfile);
    setProfile(loadUserProfile());
  };

  // Nạp lại demo data
  const handleLoadDemo = () => {
    if (confirm('Nạp lại dữ liệu mẫu Demo? (Dữ liệu sẽ được cập nhật bộ đề mẫu)')) {
      const demo = loadDemoData();
      setProfile(loadUserProfile());
      setSessions(demo.sessions);
      setMistakes(demo.mistakes);
      setVocabLog(loadVocabLog());
    }
  };

  // Xóa trắng
  const handleResetData = async () => {
    if (getActiveAccountId()) await account.resetLearningData();
    else {
      resetToCleanSlate();
      refreshFromStorage();
    }
  };

  // Khôi phục sau khi import JSON
  const handleImportSuccess = () => {
    // Reload every mounted view, including checklist and pacing data.
    window.location.reload();
  };

  // Badge điều hướng chỉ việc cần làm HÔM NAY, không phải toàn bộ tồn đọng
  const dueMistakesCount = getDueMistakes(mistakes).length;
  const today = getTodayDateString();
  const hasStudiedToday = sessions.some(s => s.date === today) || vocabLog.some(item => item.date === today) || profile.lastStudyDate === today;

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#070C16] text-slate-900 dark:text-slate-100 flex transition-colors">
      
      {/* 1. Sidebar (Desktop Persistent & Mobile Overlay Drawer Unified) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        profile={profile}
        pendingMistakesCount={dueMistakesCount}
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
        <main key={dataVersion} className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 flex flex-col min-h-0">
          {activeTab === 'dashboard' && (
            <div className="w-full space-y-3 sm:space-y-4 my-auto">
              {showOnboarding && <OnboardingCard onSetGoal={() => setIsSettingsModalOpen(true)} onRecord={() => openSessionLogger()} onDismiss={dismissOnboarding} />}
              <Dashboard
                relapseSlot={
                  <RelapseAlert
                    mistakes={mistakes}
                    onReopenCards={handleReopenCards}
                    onNavigateToMistakes={() => setActiveTab('mistakes')}
                  />
                }
                profile={profile}
                sessions={sessions}
                theme={theme}
                onOpenSessionLogger={() => openSessionLogger()}
                onNavigateToAnalytics={() => setActiveTab('analytics')}
              />
            </div>
          )}

          {activeTab === 'history' && (
            <ExamHistoryView
              sessions={sessions}
              mistakes={mistakes}
              theme={theme}
              onDeleteSession={handleDeleteSession}
              onEditSession={openSessionEditor}
              onOpenSessionLogger={() => openSessionLogger()}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              vocabLog={vocabLog}
              theme={theme}
              onOpenSessionLogger={openSessionLogger}
              onNavigateToMistakes={() => setActiveTab('mistakes')}
              onNavigateToTimer={(part = 'POMODORO') => {
                setPacingInitialPart(part);
                setActiveTab('exam-mode');
              }}
            />
          )}

          {activeTab === 'exam-mode' && (
            <ReadingPacingView
              onOpenSessionLogger={openSessionLogger}
              onSessionsChanged={handleSessionsChangedElsewhere}
              theme={theme}
              initialPart={pacingInitialPart}
            />
          )}

          {activeTab === 'mistakes' && (
            <MistakeNotebookView
              dueCount={dueMistakesCount}
              onStartReview={() => setIsReviewModalOpen(true)}
              mistakes={mistakes}
              onAddMistake={handleAddMistake}
              onToggleStatus={handleToggleMistakeStatus}
              onDeleteMistake={handleDeleteMistake}
              onUpdateMistake={handleUpdateMistake}
            />
          )}

          {activeTab === 'vocabulary' && (
            <VocabularyView
              vocabLog={vocabLog}
              theme={theme}
              onSaveVocab={handleSaveVocab}
              onDeleteVocab={handleDeleteVocab}
              onOpenSessionLogger={openSessionLogger}
            />
          )}

          {activeTab === 'resources' && (
            <ResourcesView sessions={sessions} targetScore={profile.targetScore} />
          )}

          {activeTab === 'plan' && (
            <PlanView
              storageVersion={dataVersion}
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              vocabLog={vocabLog}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onOpenSessionLogger={() => openSessionLogger()}
              onNavigateToMistakes={() => setActiveTab('mistakes')}
              onNavigateToTimer={() => {
                setPacingInitialPart('POMODORO');
                setActiveTab('exam-mode');
              }}
            />
          )}
        </main>

      </div>

      {/* Modals */}
      <SessionLoggerModal
        isOpen={isSessionModalOpen}
        onClose={closeSessionLogger}
        onSaveSession={handleSaveSession}
        onSaveVocab={handleSaveVocab}
        sessions={sessions}
        prefill={sessionPrefill}
        editingSession={editingSession}
        onUpdateSession={handleUpdateSession}
      />

      <ReviewSessionModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        mistakes={mistakes}
        onGrade={handleGradeMistake}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        profile={profile}
        onSaveProfile={handleSaveProfile}
        onResetData={handleResetData}
        onLoadDemo={handleLoadDemo}
        onImportSuccess={handleImportSuccess}
        accountPanel={<AccountPanel available={account.available} status={account.status} email={account.email} error={account.error}
          onGoogle={account.signInGoogle} onSendOtp={account.sendOtp} onVerifyOtp={account.verifyOtp}
          onRetry={() => void account.retry()} onSignOut={account.signOut} onDelete={account.deleteAccount} />}
      />

      {account.pendingTransfer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
          <div className={`${CARD} w-full max-w-lg space-y-4`}>
            <h2 id="transfer-title" className="text-lg font-bold">Chọn dữ liệu để đồng bộ</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Máy này và tài khoản đều có dữ liệu. Bản dữ liệu khách trên máy luôn được giữ riêng.</p>
            {account.error && <p role="alert" className="text-sm text-rose-600">{account.error}</p>}
            <div className="grid gap-2">
              <button type="button" autoFocus onClick={() => void account.chooseTransfer('merge')} className="rounded-xl border border-blue-400 bg-blue-50 px-4 py-3 text-left font-semibold text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">Gộp — khuyên dùng <span className="block text-xs font-normal">Bản cập nhật mới hơn của mỗi mục được giữ.</span></button>
              <button type="button" onClick={() => void account.chooseTransfer('account')} className="rounded-xl border border-slate-300 px-4 py-3 text-left font-semibold dark:border-slate-700">Dùng dữ liệu tài khoản <span className="block text-xs font-normal">Bỏ qua dữ liệu máy trong tài khoản; bản khách vẫn ở máy.</span></button>
              <button type="button" onClick={() => void account.chooseTransfer('device')} className="rounded-xl border border-slate-300 px-4 py-3 text-left font-semibold dark:border-slate-700">Dùng dữ liệu máy này <span className="block text-xs font-normal">Thay dữ liệu trên máy chủ bằng bản trên máy.</span></button>
              <button type="button" onClick={() => void account.signOut()} className="px-4 py-2 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">Để sau · tiếp tục chế độ khách</button>
            </div>
          </div>
        </div>
      )}

      {getActiveAccountId() && ['loading', 'disconnected', 'error'].includes(account.status) && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/65 p-4" role="alertdialog" aria-modal="true" aria-label="Trạng thái kết nối">
          <div className={`${CARD} w-full max-w-sm space-y-3 text-center`}>
            <h2 className="text-lg font-bold">{account.status === 'loading' ? 'Đang kết nối tài khoản' : 'Chưa kết nối'}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{account.error || 'Dữ liệu tài khoản tạm thời chỉ xem được. Kết nối lại để tiếp tục ghi và đồng bộ.'}</p>
            {account.status !== 'loading' && <div className="flex justify-center gap-2">
              <button type="button" onClick={() => void account.retry()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Thử lại</button>
              <button type="button" onClick={() => void account.signOut()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Dùng chế độ khách</button>
            </div>}
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
