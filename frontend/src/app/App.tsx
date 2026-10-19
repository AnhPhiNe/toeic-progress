import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '@/app/components/Sidebar';
import { Topbar } from '@/app/components/Topbar';
import { MobileNav } from '@/app/components/MobileNav';
import { profileInitials } from '@/app/components/profileInitials';
import { StreakCelebration, StreakChip } from '@/app/components/StreakChip';
import { actualStudyDates } from '@/shared/domain/streak';
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
import { ReviewModal } from '@/features/mistakes/components/ReviewModal';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { AccountSyncIndicator, describeSync } from '@/features/account/components/AccountSyncIndicator';
import { AccountAvatarButton } from '@/features/account/components/AccountAvatarButton';
import { OnboardingCard } from '@/app/components/OnboardingCard';
import { CARD } from '@/shared/ui/surfaces';
import { clearTimer, readTimer } from '@/features/pacing/services/pacingStorage';
import { PRESETS, supportedMode } from '@/features/pacing/lib/pacingModel';
import { PacingResultEditor } from '@/features/pacing/components/PacingResultEditor';
import { useCloudAccount } from '@/features/account/hooks/useCloudAccount';
import { useRouteTab } from '@/app/routing/useRouteTab';
import { getActiveAccountId, readDataBundle, StorageWriteError } from '@/shared/data/dataBundle';
import { ConnectionBanner } from '@/app/components/ConnectionBanner';
import { hasPersonalData } from '@/shared/data/syncMerge';

import { 
  loadUserProfile, 
  saveUserProfile, 
  loadStudySessions,
  loadPacingRuns,
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
import { StudySession, MistakeEntry, PacingRun, UserProfile, ReadingPartType } from '@/shared/types';
import { getDueMistakes, canReview, compareReviewPriority } from '@/features/mistakes/lib/spacedRepetition';
import { applyDraftSync } from '@/features/mistakes/lib/mistakeDrafts';
import { gradeLatestMistake, mergeMistakeEdit } from '@/features/mistakes/lib/mistakeUpdates';
import { collectTestNames } from '@/shared/domain/testNames';
import type { VocabDetails } from '@/features/vocabulary/lib/vocabularyModel';
import { mergeSessionEdit } from '@/features/study-sessions/lib/sessionUpdates';

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

  // Saves throw StorageWriteError when the account is not connected or storage is full.
  // Handlers do not each catch it, so surface it here instead of failing silently.
  const [writeNotice, setWriteNotice] = useState('');
  useEffect(() => {
    const show = (event: ErrorEvent | PromiseRejectionEvent) => {
      const reason = event instanceof ErrorEvent ? event.error : event.reason;
      if (!(reason instanceof StorageWriteError)) return;
      event.preventDefault();
      setWriteNotice(reason.message);
    };
    window.addEventListener('error', show);
    window.addEventListener('unhandledrejection', show);
    return () => {
      window.removeEventListener('error', show);
      window.removeEventListener('unhandledrejection', show);
    };
  }, []);
  useEffect(() => { if (account.status === 'synced') setWriteNotice(''); }, [account.status]);

  const [activeTab, setActiveTab] = useRouteTab();
  const [notebookSourceFilter, setNotebookSourceFilter] = useState<{ owner: string | null; names?: string[] } | null>(null);
  const [sessionMistakeRequest, setSessionMistakeRequest] = useState<{ id: string; owner: string | null; sourceName?: string; sessionId?: string } | null>(null);
  useEffect(() => { if (activeTab !== 'mistakes') { setNotebookSourceFilter(null); setSessionMistakeRequest(null); } }, [activeTab]);
  const [pacingInitialPart, setPacingInitialPart] = useState<ReadingPartType>('PART_5');
  const navigateToPacing = (part: ReadingPartType) => {
    const owner = getActiveAccountId(), draft = readTimer(owner), target = supportedMode(part);
    if (draft && (draft.mode !== target || target === 'POMODORO' && draft.phase !== 'WORK')) {
      if (draft.status !== 'ready' && !window.confirm(`Phiên ${PRESETS[draft.mode].name} đang được giữ trên máy. Làm mới để luyện ${PRESETS[target].name}?`)) return;
      clearTimer(owner, draft.id);
    }
    setPacingInitialPart(part); setActiveTab('exam-mode');
  };
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  // Giá trị điền sẵn khi form Nhập Điểm được mở từ Bộ đếm nhịp hoặc trang Phân tích (SPEC 4.3)
  const [sessionPrefill, setSessionPrefill] = useState<{ durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number } | undefined>(undefined);
  // Có giá trị = form Nhập Điểm đang ở chế độ sửa bản ghi này
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);
  const [editingPacing, setEditingPacing] = useState<{ run: PacingRun; owner: string | null } | null>(null);
  const closePacingEditor = useCallback(() => setEditingPacing(null), []);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [reviewCards, setReviewCards] = useState<MistakeEntry[] | null>(null);
  const activeOwner = getActiveAccountId();
  useEffect(() => { setReviewCards(null); setNotebookSourceFilter(null); setSessionMistakeRequest(null); setEditingPacing(null); setIsSettingsModalOpen(false); }, [activeOwner]);

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
      if (isSessionModalOpen || isSettingsModalOpen || editingPacing || document.querySelector('[role="dialog"]')) return;

      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openSessionLogger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionModalOpen, isSettingsModalOpen, editingPacing]);

  // Mở form Nhập Điểm, kèm giá trị điền sẵn nếu nơi gọi có cung cấp
  const openSessionLogger = (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number }) => {
    setEditingSession(null);
    setSessionPrefill(prefill);
    setIsSessionModalOpen(true);
  };

  // Mở cùng form Nhập Điểm ở chế độ sửa một bản ghi có sẵn
  const openSessionEditor = (session: StudySession) => {
    const pair = session.id.startsWith('pacing-v2-') ? loadPacingRuns().find(run => run.id === session.id) : undefined;
    if (pair) { setEditingPacing({ run: pair, owner: getActiveAccountId() }); return; }
    setSessionPrefill(undefined);
    setEditingSession(session);
    setIsSessionModalOpen(true);
  };

  const closeSessionLogger = () => {
    setIsSessionModalOpen(false);
    setSessionPrefill(undefined);
    setEditingSession(null);
  };

  const openSessionMistake = (session: StudySession) => {
    const owner = getActiveAccountId();
    setNotebookSourceFilter({ owner, names: [session.testName] });
    setSessionMistakeRequest({ id: crypto.randomUUID(), owner, sourceName: session.testName, sessionId: session.id });
    setActiveTab('mistakes');
  };

  // Sau khi ghi đề bằng câu sai: mở Sổ tay đúng đề đó để ghi chi tiết các thẻ vừa tạo.
  const openSessionDrafts = (session: StudySession) => {
    setNotebookSourceFilter({ owner: getActiveAccountId(), names: [session.testName] });
    setActiveTab('mistakes');
  };

  // Nút + trên điện thoại: mở form thêm lỗi trống ở Sổ tay, không lọc theo đề nào.
  const openNewMistake = () => {
    const owner = getActiveAccountId();
    setNotebookSourceFilter(null);
    setSessionMistakeRequest({ id: crypto.randomUUID(), owner });
    setActiveTab('mistakes');
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
    // Each wrong question becomes a draft card in the notebook.
    if (session.wrongQuestions) setMistakes(updateMistakes(current => applyDraftSync(session, current)));
  };

  // Phòng Thi tự ghi buổi học vào bộ nhớ; đọc lại để state không bị cũ
  const handleSessionsChangedElsewhere = useCallback(() => {
    setSessions(loadStudySessions());
    setMistakes(loadMistakes());
    setProfile(loadUserProfile());
  }, []);

  const handleSaveVocab = (date: string, count: number, details?: VocabDetails) => {
    setVocabLog(upsertVocabLog(date, count, details));
    dismissOnboarding();
    setProfile(recordDailyActivity(profile, date));
  };

  const handleDeleteVocab = (id: string) => {
    setVocabLog(deleteVocabLog(id));
    setProfile(loadUserProfile());
  };

  /**
   * Thay thế một buổi học đã có. KHÔNG đi qua addStudySession: sửa số liệu
   * một buổi cũ không phải là hoạt động học hôm nay, nên streak và pháo giấy
   * kỷ lục không được kích hoạt.
   */
  const handleUpdateSession = (session: StudySession, original: StudySession, newMistakes?: MistakeEntry[]) => {
    setSessions(updateStudySessions(current => {
      const merged = mergeSessionEdit(current.find(s => s.id === original.id), original, session);
      return current.map(s => s.id === original.id ? merged : s);
    }));
    setProfile(loadUserProfile());

    if (newMistakes && newMistakes.length > 0) {
      setMistakes(updateMistakes(current => [...newMistakes, ...current]));
    }
    if (session.wrongQuestions) setMistakes(updateMistakes(current => applyDraftSync(session, current)));
  };

  // Thay nội dung một thẻ lỗi sai (trạng thái & lịch ôn đã được giữ ở form)
  const handleUpdateMistake = (entry: MistakeEntry, original: MistakeEntry) => {
    setMistakes(updateMistakes(current => {
      const updated = mergeMistakeEdit(current.find(m => m.id === entry.id), original, entry);
      return current.map(m => m.id === entry.id ? updated : m);
    }));
  };

  // Xóa session
  const handleDeleteSession = (sessionId: string) => {
    setSessions(updateStudySessions(current => current.filter(s => s.id !== sessionId)));
    // Drafts nobody has filled in go with their test; cards with content stay in the notebook.
    setMistakes(updateMistakes(current => applyDraftSync({ id: sessionId, testName: '', wrongQuestions: [] }, current)));
    setProfile(loadUserProfile());
  };

  // Thêm lỗi sai vào Sổ tay
  const handleAddMistake = (entry: MistakeEntry) => {
    setMistakes(updateMistakes(current => [entry, ...current]));
  };

  // Chuyển đổi trạng thái lỗi sai
  // Người học tự đánh dấu đã thuộc (menu ⋯), bỏ qua phần lịch ôn còn lại
  const handleMarkMastered = (mistakeId: string) => {
    setMistakes(updateMistakes(current => current.map(m =>
      m.id === mistakeId && canReview(m) ? { ...m, status: 'MASTERED' as const, lastReviewedAt: new Date().toISOString() } : m
    )));
  };

  // Lưu thẻ đã được chấm trong phiên ôn (SPEC mục 4.6)
  const handleGradeMistake = (snapshot: MistakeEntry, correct: boolean) => {
    let before: MistakeEntry | undefined;
    let after: MistakeEntry | undefined;
    const next = updateMistakes(current => {
      before = current.find(m => m.id === snapshot.id);
      after = gradeLatestMistake(before, snapshot, correct);
      return current.map(m => m.id === snapshot.id ? after! : m);
    });
    setMistakes(next);
    return { before: before!, after: after! };
  };

  // Mở phiên ôn: các thẻ được chọn, hoặc mọi thẻ đến hạn. Danh sách được chốt lúc mở.
  const openReview = (mistakeIds?: string[]) => {
    const ids = mistakeIds ? new Set(mistakeIds) : null;
    const latest = loadMistakes();
    const cards = ids ? latest.filter(m => ids.has(m.id) && canReview(m)).sort(compareReviewPriority) : getDueMistakes(latest);
    if (cards.length > 0) setReviewCards(cards);
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

  // Dữ liệu mẫu thay toàn bộ buổi học/lỗi sai (bản cũ bị đánh dấu xóa và đồng bộ đi),
  // nên chỉ cho nạp khi máy chưa có dữ liệu cá nhân và đang ở chế độ khách.
  const canLoadDemo = useMemo(
    () => !getActiveAccountId() && !hasPersonalData(readDataBundle()),
    // Đánh giá lại khi dữ liệu hoặc hộp Cài đặt thay đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, mistakes, vocabLog, profile, dataVersion, isSettingsModalOpen]
  );

  // Hộp Cài đặt đã hỏi xác nhận trước khi gọi
  const handleLoadDemo = () => {
    if (!canLoadDemo) return;
    const demo = loadDemoData();
    setProfile(loadUserProfile());
    setSessions(demo.sessions);
    setMistakes(demo.mistakes);
    setVocabLog(loadVocabLog());
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
  const studiedDates = actualStudyDates({ sessions, vocabLog, pacingRuns: loadPacingRuns() }, today);
  const hasStudiedToday = studiedDates.has(today) || sessions.some(s => s.date === today) || vocabLog.some(item => item.date === today) || profile.lastStudyDate === today;

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
        onOpenSettings={() => setIsSettingsModalOpen(true)}
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
          syncIndicator={<AccountSyncIndicator available={account.available} status={account.status}
            onOpenSettings={() => setIsSettingsModalOpen(true)} onRetry={account.retry} />}
          accountButton={<AccountAvatarButton initials={profileInitials(profile.name)} available={account.available} status={account.status}
            onOpenSettings={() => setIsSettingsModalOpen(true)} />}
          streakButton={<StreakChip streak={profile.currentStreak} longestStreak={profile.longestStreak || 0} studiedDates={studiedDates} today={today} />}
        />

        <ConnectionBanner
          accountActive={Boolean(getActiveAccountId() || account.hasAccountSession)}
          status={account.status}
          error={account.error}
          writeNotice={writeNotice}
          onDismissNotice={() => setWriteNotice('')}
          onRetry={() => void account.retry()}
          onUseGuest={() => void account.signOut()}
        />

        {/* Body Container */}
        <main key={activeTab === 'mistakes' || activeTab === 'resources' ? `${activeTab}:${activeOwner ?? 'guest'}` : dataVersion} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 lg:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-5 lg:pb-6 flex flex-col min-h-0">
          {activeTab === 'dashboard' && (
            <div className="w-full space-y-3 sm:space-y-4">
              {showOnboarding && <OnboardingCard onSetGoal={() => setIsSettingsModalOpen(true)} onRecord={() => openSessionLogger()} onDismiss={dismissOnboarding} />}
              <Dashboard
                profile={profile}
                sessions={sessions}
                vocabLog={vocabLog}
                pacingRuns={loadPacingRuns()}
                theme={theme}
                onOpenSessionLogger={() => openSessionLogger()}
                onNavigateToAnalytics={() => setActiveTab('analytics')}
              />
            </div>
          )}

          {activeTab === 'history' && (
            <ExamHistoryView
              sessions={sessions}
              pacingRuns={loadPacingRuns()}
              mistakes={mistakes}
              theme={theme}
              onDeleteSession={handleDeleteSession}
              onEditSession={openSessionEditor}
              onOpenSessionLogger={() => openSessionLogger()}
              onNavigateToMistakes={sourceNames => { setNotebookSourceFilter({ owner: activeOwner, names: sourceNames }); setActiveTab('mistakes'); }}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              key={activeOwner ?? 'guest'}
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              vocabLog={vocabLog}
              theme={theme}
              onOpenSessionLogger={openSessionLogger}
              onNavigateToMistakes={sourceNames => { setNotebookSourceFilter({ owner: activeOwner, names: sourceNames }); setActiveTab('mistakes'); }}
              onEditSession={openSessionEditor}
              onNavigateToTimer={(part = 'POMODORO') => navigateToPacing(part)}
            />
          )}

          {activeTab === 'exam-mode' && (
            <ReadingPacingView
              resultDialogBlocked={isSessionModalOpen || isSettingsModalOpen || editingPacing !== null || reviewCards !== null || Boolean(account.pendingTransfer)}
              onOpenSessionLogger={openSessionLogger}
              onSessionsChanged={handleSessionsChangedElsewhere}
              theme={theme}
              initialPart={pacingInitialPart}
            />
          )}

          {activeTab === 'mistakes' && (
            <MistakeNotebookView
              key={sessionMistakeRequest?.owner === activeOwner ? sessionMistakeRequest.id : 'notebook'}
              createRequest={sessionMistakeRequest?.owner === activeOwner ? sessionMistakeRequest : undefined}
              initialSourceNames={notebookSourceFilter?.owner === activeOwner ? notebookSourceFilter.names : undefined}
              sessions={sessions}
              dueCount={dueMistakesCount}
              onStartReview={openReview}
              mistakes={mistakes}
              onAddMistake={handleAddMistake}
              onMarkMastered={handleMarkMastered}
              onReopenCards={handleReopenCards}
              onDeleteMistake={handleDeleteMistake}
              onUpdateMistake={handleUpdateMistake}
            />
          )}

          {activeTab === 'vocabulary' && (
            <VocabularyView
              key={activeOwner ?? 'guest'}
              vocabLog={vocabLog}
              theme={theme}
              onSaveVocab={handleSaveVocab}
              onDeleteVocab={handleDeleteVocab}
              sourceNames={collectTestNames(sessions, mistakes)}
            />
          )}

          {activeTab === 'resources' && (
            <ResourcesView sessions={sessions} targetScore={profile.targetScore} />
          )}

          {activeTab === 'plan' && (
            <PlanView
              key={activeOwner ?? 'guest'}
              storageVersion={dataVersion}
              profile={profile}
              sessions={sessions}
              mistakes={mistakes}
              vocabLog={vocabLog}
              pacingRuns={loadPacingRuns()}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onOpenSessionLogger={openSessionLogger}
              onNavigateToMistakes={() => setActiveTab('mistakes')}
              onNavigateToTimer={() => navigateToPacing('POMODORO')}
            />
          )}
        </main>

      </div>

      <StreakCelebration streak={profile.currentStreak} studiedToday={hasStudiedToday} today={today} />

      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dueMistakesCount={dueMistakesCount}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onRecordSession={() => openSessionLogger()}
        onRecordMistake={openNewMistake}
        onRecordVocab={() => openSessionLogger({ sessionType: 'VOCAB' })}
      />

      {/* Modals */}
      {editingPacing && editingPacing.owner === activeOwner && <PacingResultEditor run={editingPacing.run} owner={editingPacing.owner} onClose={closePacingEditor} onSaved={handleSessionsChangedElsewhere} />}
      <SessionLoggerModal
        isOpen={isSessionModalOpen}
        onClose={closeSessionLogger}
        onSaveSession={handleSaveSession}
        onSaveVocab={handleSaveVocab}
        sessions={sessions}
        prefill={sessionPrefill}
        editingSession={editingSession}
        onUpdateSession={handleUpdateSession}
        onAddMistakeForSession={openSessionMistake}
        onOpenSessionDrafts={openSessionDrafts}
      />

      {reviewCards && (
        <ReviewModal cards={reviewCards} onClose={() => setReviewCards(null)} onGrade={handleGradeMistake}
          onReload={id => loadMistakes().find(m => m.id === id && canReview(m))} />
      )}

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        profile={profile}
        onSaveProfile={handleSaveProfile}
        onResetData={handleResetData}
        onLoadDemo={canLoadDemo ? handleLoadDemo : undefined}
        onImportSuccess={handleImportSuccess}
        syncLabel={describeSync(account.available, account.status).label}
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


    </div>
  );
};

export default App;
