import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateUUID } from '@/shared/domain/uuid';
import { RdSidebar } from '@/app/components/RdSidebar';
import { TodayPage } from '@/features/today/components/TodayPage';
import { JourneyPage } from '@/features/journey/components/JourneyPage';
import { PracticePage } from '@/features/pacing/components/PracticePage';
import { ReviewSession } from '@/features/mistakes/components/ReviewSession';
import { AwardsPage, unseenBadges } from '@/features/awards/components/AwardsPage';
import { computeBadges } from '@/features/awards/lib/badges';
import { socLook } from '@/features/awards/lib/outfit';
import type { TodayTask } from '@/features/today/lib/todayTasks';
import { extraStudyDates } from '@/features/today/lib/habits';
import { deriveStreakWithExtras } from '@/shared/domain/streakWeek';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Topbar } from '@/app/components/Topbar';
import { PhoneNav, PhoneShellContext } from '@/app/components/phone';
import { TodayPhone } from '@/features/today/components/TodayPhone';
import { JourneyPhone } from '@/features/journey/components/JourneyPhone';
import { PracticePhone } from '@/features/pacing/components/PracticePhone';
import { NotebookPhone } from '@/features/mistakes/components/NotebookPhone';
import { ConvertPhone } from '@/features/resources/components/ConvertPhone';
import { profileInitials } from '@/app/components/profileInitials';
import { StreakCelebration, StreakChip } from '@/app/components/StreakChip';
import { actualStudyDates } from '@/shared/domain/streak';
import { Dashboard } from '@/features/dashboard/components/Dashboard';
import { AnalyticsView } from '@/features/analytics/components/AnalyticsView';
import { ExamHistoryView } from '@/features/study-sessions/components/ExamHistoryView';
import { MistakeNotebookView } from '@/features/mistakes/components/MistakeNotebookView';
import { PlanView } from '@/features/plans/components/PlanView';
import { ResourcesView } from '@/features/resources/components/ResourcesView';
import { ConvertPage } from '@/features/resources/components/ConvertPage';
import { VocabularyView } from '@/features/vocabulary/components/VocabularyView';
import { SessionLoggerModal } from '@/features/study-sessions/components/SessionLoggerModal';
import { SessionResultScreen } from '@/features/study-sessions/components/SessionResultScreen';
import { SettingsModal } from '@/features/account/components/SettingsModal';
import { TransferChoiceDialog } from '@/features/account/components/TransferChoiceDialog';
import { ReviewModal } from '@/features/mistakes/components/ReviewModal';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { AccountSyncIndicator, describeSync } from '@/features/account/components/AccountSyncIndicator';
import { AccountAvatarButton } from '@/features/account/components/AccountAvatarButton';
import { OnboardingCard } from '@/app/components/OnboardingCard';
import { clearTimer, readTimer } from '@/features/pacing/services/pacingStorage';
import { PRESETS, supportedMode } from '@/features/pacing/lib/pacingModel';
import { PacingResultEditor } from '@/features/pacing/components/PacingResultEditor';
import { useCloudAccount } from '@/features/account/hooks/useCloudAccount';
import { useRouteTab } from '@/app/routing/useRouteTab';
import { getActiveAccountId, readDataBundle, StorageWriteError } from '@/shared/data/dataBundle';
import { ConnectionBanner } from '@/app/components/ConnectionBanner';
import { hasPersonalData } from '@/shared/data/syncMerge';
import { PageScrollCue } from '@/shared/components/ScrollCue';

import { 
  loadUserProfile, 
  saveUserProfile, 
  loadStudySessions,
  loadPacingRuns,
  updateStudySessions,
  triggerCelebrationConfetti,
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
import type { ReviewAnswer } from '@/features/mistakes/lib/spacedRepetition';
import { commitMistakeBatch } from '@/features/mistakes/lib/persistMistakeBatch';
import { applyDraftSync } from '@/features/mistakes/lib/mistakeDrafts';
import { MISTAKES_CHANGED_EVENT } from '@/features/mistakes/services/explanationQueue';
import { gradeLatestMistake, mergeMistakeEdit } from '@/features/mistakes/lib/mistakeUpdates';
import { collectTestNames } from '@/shared/domain/testNames';
import type { VocabDetails } from '@/features/vocabulary/lib/vocabularyModel';
import { persistSessionResult } from '@/features/study-sessions/lib/persistSessionResult';
import { undoMistakeDeletion, undoMistakeGrade } from '@/features/mistakes/lib/persistMistakeUndo';
import { AISignInPrompt } from '@/features/account/components/AISignInPrompt';
import { AI_SIGN_IN_EVENT } from '@/shared/lib/aiSignIn';
import { GuidePage } from '@/features/guide/GuidePage';
import { GuideContext } from '@/features/guide/GuideContext';

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
  // Guests who reach for AI get one sign-in prompt; it only appears when signing in is possible.
  const isGuest = account.available && !account.hasAccountSession;
  const [aiSignInOpen, setAISignInOpen] = useState(false);
  useEffect(() => {
    if (!isGuest) { setAISignInOpen(false); return; }
    const open = () => setAISignInOpen(true);
    window.addEventListener(AI_SIGN_IN_EVENT, open);
    return () => window.removeEventListener(AI_SIGN_IN_EVENT, open);
  }, [isGuest]);

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
  const [notebookSourceFilter, setNotebookSourceFilter] = useState<{ owner: string | null; names?: string[]; part?: number } | null>(null);
  const [sessionMistakeRequest, setSessionMistakeRequest] = useState<{ id: string; owner: string | null; sourceName?: string; sessionId?: string; detailSessionId?: string } | null>(null);
  useEffect(() => { if (activeTab !== 'mistakes') { setNotebookSourceFilter(null); setSessionMistakeRequest(null); } }, [activeTab]);

  // POMODORO opens the bakery on Mẻ tự do (the old Pomodoro); the old /phong-thi link lands there too.
  const [pacingInitialPart, setPacingInitialPart] = useState<ReadingPartType>(() => window.location.pathname.replace(/\/+$/, '') === '/phong-thi' ? 'POMODORO' : 'PART_5');
  const [practiceFocus, setPracticeFocus] = useState(false);
  useEffect(() => { if (activeTab !== 'exam-mode') setPacingInitialPart(part => part === 'POMODORO' ? 'PART_5' : part); }, [activeTab]);
  const navigateToPacing = (part: ReadingPartType) => {
    const owner = getActiveAccountId(), draft = readTimer(owner), target = supportedMode(part);
    if (draft && (draft.mode !== target || target === 'POMODORO' && draft.phase !== 'WORK')) {
      const currentName = PRESETS[draft.mode]?.name ?? 'Luyện tập';
      const targetName = PRESETS[target]?.name ?? 'Luyện tập';
      if (draft.status !== 'ready' && !window.confirm(`Phiên ${currentName} đang được giữ trên máy. Làm mới để luyện ${targetName}?`)) return;
      clearTimer(owner, draft.id);
    }
    setPacingInitialPart(supportedMode(part)); setActiveTab('exam-mode');
  };
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  // Giá trị điền sẵn khi form Nhập Điểm được mở từ Bộ đếm nhịp hoặc trang Phân tích (SPEC 4.3)
  const [sessionPrefill, setSessionPrefill] = useState<{ durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number; markWrong?: boolean; initialFiles?: File[] } | undefined>(undefined);
  // Có giá trị = form Nhập Điểm đang ở chế độ sửa bản ghi này
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);
  const [editingPacing, setEditingPacing] = useState<{ run: PacingRun; owner: string | null } | null>(null);
  const closePacingEditor = useCallback(() => setEditingPacing(null), []);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [reviewCards, setReviewCards] = useState<MistakeEntry[] | null>(null);
  const [savedTest, setSavedTest] = useState<StudySession | null>(null);
  const closeSavedTest = useCallback(() => setSavedTest(null), []);
  const activeOwner = getActiveAccountId();
  useEffect(() => { setSavedTest(null); setReviewCards(null); setNotebookSourceFilter(null); setSessionMistakeRequest(null); setEditingPacing(null); setIsSettingsModalOpen(false); setIsSessionModalOpen(false); setEditingSession(null); setSessionPrefill(undefined); }, [activeOwner]);

  // Light only for now: the redesigned pages have no dark styles yet. Clear any dark class or saved choice from older versions.
  const theme = 'light' as const;
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try { localStorage.removeItem('toeic_theme_v1'); } catch { /* ignore */ }
  }, []);

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
  const openSessionLogger = (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number; initialFiles?: File[] }) => {
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
    setSessionMistakeRequest({ id: generateUUID(), owner, sourceName: session.testName, sessionId: session.id });
    setActiveTab('mistakes');
  };

  // Sau khi ghi đề bằng câu sai: mở Sổ tay đúng đề đó để ghi chi tiết các thẻ vừa tạo.
  // Màn kết quả: đề chưa có danh sách câu sai thì mở lại đúng đề đó ở lưới số câu.
  const markSessionWrong = (session: StudySession) => {
    setSavedTest(null);
    setSessionPrefill({ markWrong: true });
    // The stored copy carries the save's updatedAt, which the editor checks before overwriting.
    setEditingSession(loadStudySessions().find(stored => stored.id === session.id && !stored.deletedAt) ?? session);
    setIsSessionModalOpen(true);
  };

  const openSessionDrafts = (session: StudySession) => {
    const owner = getActiveAccountId();
    setNotebookSourceFilter({ owner, names: [session.testName] });
    setSessionMistakeRequest({ id: generateUUID(), owner, detailSessionId: session.id });
    setActiveTab('mistakes');
  };

  // Nút + trên điện thoại: mở form thêm lỗi trống ở Sổ tay, không lọc theo đề nào.
  const openNewMistake = () => {
    const owner = getActiveAccountId();
    setNotebookSourceFilter(null);
    setSessionMistakeRequest({ id: generateUUID(), owner });
    setActiveTab('mistakes');
  };

  // Lưu và cập nhật session
  const handleSaveSession = (session: StudySession, newMistakes?: MistakeEntry[]) => {
    const result = persistSessionResult(session, { newMistakes, expectedOwner: activeOwner });
    setSessions(result.sessions);
    setProfile(result.profile);
    setMistakes(result.mistakes);
    // Cosmetic follow-ups must not turn an already committed result into a failed save.
    setShowOnboarding(false);
    try { localStorage.setItem('toeic_onboarding_done_v1', 'true'); } catch { /* The result is already saved. */ }
    if (result.isRecord) { try { triggerCelebrationConfetti(); } catch { /* Optional animation. */ } }
  };

  // Phòng Thi tự ghi buổi học vào bộ nhớ; đọc lại để state không bị cũ
  // Explanations written in the background update stored cards; show them.
  useEffect(() => {
    const reload = () => setMistakes(loadMistakes());
    window.addEventListener(MISTAKES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(MISTAKES_CHANGED_EVENT, reload);
  }, []);

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
    const result = persistSessionResult(session, { original, newMistakes, expectedOwner: activeOwner });
    setSessions(result.sessions);
    setProfile(result.profile);
    setMistakes(result.mistakes);
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

  const handleAddMistakes = (entries: MistakeEntry[]) => {
    setMistakes(commitMistakeBatch(entries, activeOwner));
  };

  // Chuyển đổi trạng thái lỗi sai
  // Người học tự đánh dấu đã thuộc (menu ⋯), bỏ qua phần lịch ôn còn lại
  const handleMarkMastered = (mistakeId: string) => {
    setMistakes(updateMistakes(current => current.map(m =>
      m.id === mistakeId && canReview(m) ? { ...m, status: 'MASTERED' as const, lastReviewedAt: new Date().toISOString() } : m
    )));
  };

  // Lưu thẻ đã được chấm trong phiên ôn (SPEC mục 4.6)
  const handleGradeMistake = (snapshot: MistakeEntry, answer: ReviewAnswer) => {
    const owner = activeOwner;
    if (getActiveAccountId() !== owner) throw new Error('Tài khoản đã thay đổi. Hãy mở lại phiên ôn.');
    let before: MistakeEntry | undefined;
    let after: MistakeEntry | undefined;
    const next = updateMistakes(current => {
      before = current.find(m => m.id === snapshot.id);
      after = gradeLatestMistake(before, snapshot, answer);
      return current.map(m => m.id === snapshot.id ? after! : m);
    });
    setMistakes(next);
    const persisted = next.find(card => card.id === snapshot.id)!;
    return { before: before!, after: persisted, undo: () => setMistakes(undoMistakeGrade(before!, persisted, owner)) };
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
    const owner = activeOwner;
    if (getActiveAccountId() !== owner) throw new Error('Tài khoản đã thay đổi. Hãy mở lại Sổ tay.');
    let before: MistakeEntry | undefined;
    const next = updateMistakes(current => {
      before = current.find(card => card.id === mistakeId);
      if (!before) throw new Error('Thẻ không còn trong Sổ tay.');
      return current.filter(card => card.id !== mistakeId);
    });
    setMistakes(next);
    const deletionVersion = readDataBundle().mistakes.find(card => card.id === mistakeId)!.updatedAt;
    return () => setMistakes(undoMistakeDeletion(before!, deletionVersion, owner));
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
  // Hôm nay (desktop) reads the whole bundle; the state above is what changes it.
  const isPhone = useMediaQuery('(max-width: 767px)');
  const bundle = useMemo(() => readDataBundle(), [profile, sessions, mistakes, vocabLog, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const streakNow = useMemo(() => deriveStreakWithExtras(bundle, today, extraStudyDates(bundle.profile, bundle.mistakes)).currentStreak, [bundle, today]);
  const showToday = activeTab === 'dashboard' && !isPhone;
  // Hành trình điểm replaces Lịch sử thi + Phân tích on computers.
  const showJourney = (activeTab === 'history' || activeTab === 'analytics') && !isPhone;
  const showPractice = activeTab === 'exam-mode' && !isPhone;
  const showNotebook = activeTab === 'mistakes' && !isPhone;
  const showAwards = activeTab === 'awards';
  const showConvert = activeTab === 'resources' && !isPhone;
  const showGuide = activeTab === 'guide' && !isPhone;
  // Phones: each tab with a redesigned phone page owns the whole screen (no Topbar); plan and vocabulary keep the old layout.
  const phonePageTab = isPhone && ['dashboard', 'history', 'analytics', 'exam-mode', 'mistakes', 'resources', 'guide'].includes(activeTab);
  const fullPage = showToday || showJourney || showPractice || showNotebook || showAwards || showConvert || showGuide || phonePageTab;
  const soc = useMemo(() => socLook(bundle, today), [bundle, today]);
  const newBadges = useMemo(() => activeTab === 'awards' ? 0 : unseenBadges(computeBadges(bundle, today), activeOwner ?? null).length, [bundle, today, activeOwner, activeTab]);
  const startTodayTask = (task: TodayTask) => {
    if (task.kind === 'REVIEW_MISTAKES') openReview();
    else if (task.kind === 'PART_TIMER' && task.part) navigateToPacing(`PART_${task.part}` as ReadingPartType);
    else if (task.kind === 'FULL_TEST') openSessionLogger();
    else if (task.kind === 'WORD_CARDS') setActiveTab('vocabulary');
  };
  // First-visit page tips wait while anything else holds the screen.
  const tipsHeld = isSessionModalOpen || savedTest !== null || reviewCards !== null || practiceFocus || isSettingsModalOpen || editingPacing !== null || aiSignInOpen || Boolean(account.pendingTransfer);
  const guidePage = <GuidePage onBack={() => (window.history.length > 1 ? window.history.back() : setActiveTab('dashboard'))} onOpenSessionLogger={() => openSessionLogger()} onNavigate={setActiveTab} />;
  const updateProfile = (update: (current: UserProfile) => UserProfile) => {
    saveUserProfile(update(loadUserProfile()));
    setProfile(loadUserProfile());
  };

  return (
    <PhoneShellContext.Provider value={{ soc, newBadges, goTab: setActiveTab, openSettings: () => setIsSettingsModalOpen(true) }}>
    <GuideContext.Provider value={{ tipsHeld }}>
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-[#070C16] text-slate-900 dark:text-slate-100 flex transition-colors">
      
      {/* 1. Sidebar (Desktop Persistent & Mobile Overlay Drawer Unified) */}
      {!(practiceFocus && activeTab === 'exam-mode') && <RdSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dueMistakesCount={dueMistakesCount}
        streak={streakNow}
        newBadges={newBadges}
        soc={soc}
        onOpenSessionLogger={() => openSessionLogger()}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        syncLabel={describeSync(account.available, account.status).label}
      />}

      {/* 2. Main Content View Area (Right) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Topbar Header */}
        {!fullPage && <Topbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profile={profile}
          hasStudiedToday={hasStudiedToday}
          theme={theme}
          onOpenSessionLogger={() => openSessionLogger()}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          syncIndicator={<AccountSyncIndicator available={account.available} status={account.status}
            onOpenSettings={() => setIsSettingsModalOpen(true)} onRetry={account.retry} />}
          accountButton={<AccountAvatarButton initials={profileInitials(profile.name)} available={account.available} status={account.status}
            onOpenSettings={() => setIsSettingsModalOpen(true)} />}
          streakButton={<StreakChip streak={profile.currentStreak} longestStreak={profile.longestStreak || 0} studiedDates={studiedDates} today={today} />}
        />}

        <ConnectionBanner
          accountActive={Boolean(getActiveAccountId() || account.hasAccountSession)}
          status={account.status}
          error={account.error}
          writeNotice={writeNotice}
          onDismissNotice={() => setWriteNotice('')}
          onRetry={() => void account.retry()}
          onUseGuest={() => void account.signOut()}
        />

        {phonePageTab ? (
          <div className="ph-page" key={activeTab === 'mistakes' || activeTab === 'resources' || activeTab === 'history' || activeTab === 'analytics' ? `${activeTab}:${activeOwner ?? 'guest'}` : activeTab}>
            {activeTab === 'dashboard' && (
              <TodayPhone
                bundle={bundle}
                today={today}
                onStartTask={startTodayTask}
                onPracticeMore={() => setActiveTab('exam-mode')}
                onOpenSessionLogger={() => openSessionLogger()}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onUpdateProfile={updateProfile}
                streak={streakNow}
                dueMistakesCount={dueMistakesCount}
                soc={soc}
                onNavigate={setActiveTab}
              />
            )}
            {(activeTab === 'history' || activeTab === 'analytics') && (
              <JourneyPhone
                sessions={sessions}
                mistakes={mistakes}
                profile={profile}
                today={today}
                initialTab={activeTab === 'analytics' ? 'parts' : 'score'}
                onOpenNotebook={(name, part) => { setNotebookSourceFilter({ owner: activeOwner, names: [name], part }); setActiveTab('mistakes'); }}
                onPractice={part => navigateToPacing(`PART_${part}` as ReadingPartType)}
                onEditSession={openSessionEditor}
                onDeleteSession={handleDeleteSession}
                onOpenSessionLogger={() => openSessionLogger()}
                bundle={bundle}
                activeTab={activeTab}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'exam-mode' && (
              <PracticePhone
                sessions={sessions}
                initialPart={pacingInitialPart}
                resultDialogBlocked={savedTest !== null || isSessionModalOpen || isSettingsModalOpen || editingPacing !== null || reviewCards !== null || Boolean(account.pendingTransfer)}
                onOpenSessionLogger={openSessionLogger}
                onEditSession={openSessionEditor}
                onSessionsChanged={handleSessionsChangedElsewhere}
                onFocusChange={setPracticeFocus}
              />
            )}
            {activeTab === 'mistakes' && (
              <NotebookPhone
                key={sessionMistakeRequest?.owner === activeOwner ? sessionMistakeRequest.id : 'notebook'}
                createRequest={sessionMistakeRequest?.owner === activeOwner ? sessionMistakeRequest : undefined}
                initialSourceNames={notebookSourceFilter?.owner === activeOwner ? notebookSourceFilter.names : undefined}
                initialPart={notebookSourceFilter?.owner === activeOwner ? notebookSourceFilter.part : undefined}
                sessions={sessions}
                dueCount={dueMistakesCount}
                onStartReview={openReview}
                mistakes={mistakes}
                onAddMistake={handleAddMistake}
                onAddMistakes={handleAddMistakes}
                onMarkMastered={handleMarkMastered}
                onReopenCards={handleReopenCards}
                onDeleteMistake={handleDeleteMistake}
                onUpdateMistake={handleUpdateMistake}
                onOpenSessionLogger={() => openSessionLogger()}
                onNavigateTab={setActiveTab}
              />
            )}
            {activeTab === 'resources' && (
              <ConvertPhone sessions={sessions} targetScore={profile.targetScore} gear={soc.worn} />
            )}
            {activeTab === 'guide' && guidePage}
          </div>
        ) : showToday ? (
          <TodayPage
            bundle={bundle}
            today={today}
            onStartTask={startTodayTask}
            onPracticeMore={() => setActiveTab('exam-mode')}
            onOpenSessionLogger={() => openSessionLogger()}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onUpdateProfile={updateProfile}
          />
        ) : showGuide ? guidePage : showConvert ? (
          <ConvertPage key={activeOwner ?? 'guest'} sessions={sessions} targetScore={profile.targetScore} gear={soc.worn} />
        ) : showAwards ? (
          <AwardsPage bundle={bundle} today={today} owner={activeOwner ?? null} onUpdateProfile={updateProfile} />
        ) : showPractice ? (
          <PracticePage
            sessions={sessions}
            initialPart={pacingInitialPart}
            resultDialogBlocked={savedTest !== null || isSessionModalOpen || isSettingsModalOpen || editingPacing !== null || reviewCards !== null || Boolean(account.pendingTransfer)}
            onOpenSessionLogger={openSessionLogger}
            onEditSession={openSessionEditor}
            onSessionsChanged={handleSessionsChangedElsewhere}
            onFocusChange={setPracticeFocus}
          />
        ) : showJourney ? (
          <JourneyPage
            key={activeOwner ?? 'guest'}
            sessions={sessions}
            mistakes={mistakes}
            profile={profile}
            today={today}
            initialTab={activeTab === 'analytics' ? 'parts' : 'score'}
            onOpenNotebook={(name, part) => { setNotebookSourceFilter({ owner: activeOwner, names: [name], part }); setActiveTab('mistakes'); }}
            onPractice={part => navigateToPacing(`PART_${part}` as ReadingPartType)}
            onEditSession={openSessionEditor}
            onDeleteSession={handleDeleteSession}
            onOpenSessionLogger={() => openSessionLogger()}
          />
        ) : (
        /* Body Container */
        <main key={activeTab === 'mistakes' || activeTab === 'resources' ? `${activeTab}:${activeOwner ?? 'guest'}` : dataVersion} className={showNotebook ? 'flex-1 w-full flex flex-col min-h-0' : "flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 lg:pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-5 lg:pb-6 flex flex-col min-h-0"}>
          {activeTab === 'dashboard' && (
            <div className="w-full space-y-3 sm:space-y-4">
              {showOnboarding && <OnboardingCard onSetGoal={() => setIsSettingsModalOpen(true)} onRecord={() => openSessionLogger()} onDismiss={dismissOnboarding} />}
              <Dashboard
                profile={profile}
                sessions={sessions}
                vocabLog={vocabLog}
                pacingRuns={loadPacingRuns()}
                theme={theme}
                onOpenSessionLogger={openSessionLogger}
                onNavigateToAnalytics={() => setActiveTab('analytics')}
                dueMistakesCount={dueMistakesCount}
                onStartReview={openReview}
                onNavigateToPacing={navigateToPacing}
                mistakes={mistakes}
                onNavigateToPlan={() => setActiveTab('plan')}
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
              onAddMistakeForSession={openSessionMistake}
              onEditSession={openSessionEditor}
              onNavigateToTimer={(part = 'POMODORO') => navigateToPacing(part)}
              onNavigateToPlan={() => setActiveTab('plan')}
            />
          )}

          {activeTab === 'mistakes' && (
            <MistakeNotebookView
              key={sessionMistakeRequest?.owner === activeOwner ? sessionMistakeRequest.id : 'notebook'}
              createRequest={sessionMistakeRequest?.owner === activeOwner ? sessionMistakeRequest : undefined}
              initialSourceNames={notebookSourceFilter?.owner === activeOwner ? notebookSourceFilter.names : undefined}
              initialPart={notebookSourceFilter?.owner === activeOwner ? notebookSourceFilter.part : undefined}
              sessions={sessions}
              dueCount={dueMistakesCount}
              onStartReview={openReview}
              mistakes={mistakes}
              onAddMistake={handleAddMistake}
              onAddMistakes={handleAddMistakes}
              onMarkMastered={handleMarkMastered}
              onReopenCards={handleReopenCards}
              onDeleteMistake={handleDeleteMistake}
              onUpdateMistake={handleUpdateMistake}
              onOpenSessionLogger={() => openSessionLogger()}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'vocabulary' && (
            <VocabularyView
              key={activeOwner ?? 'guest'}
              vocabLog={vocabLog}
              theme={theme}
              dueMistakesCount={dueMistakesCount}
              totalMistakesCount={mistakes.length}
              onNavigateTab={setActiveTab}
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
        )}

      </div>

      <StreakCelebration streak={profile.currentStreak} studiedToday={hasStudiedToday} today={today} held={savedTest !== null || isSessionModalOpen || reviewCards !== null} />
      {/* Redesigned phone pages (and Thành tích) have their own bottom nav; the old floating cue would cover it. */}
      {!(isPhone && (phonePageTab || activeTab === 'awards')) && <PageScrollCue activeTab={activeTab} />}

      {isPhone && !(practiceFocus && activeTab === 'exam-mode') && (
        <PhoneNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          dueMistakesCount={dueMistakesCount}
          onRecordSession={() => openSessionLogger({ sessionType: 'FULL_TEST' })}
          onRecordPractice={() => openSessionLogger({ sessionType: 'PART_PRACTICE' })}
          onRecordMistake={openNewMistake}
          onRecordVocab={() => openSessionLogger({ sessionType: 'VOCAB' })}
        />
      )}

      {/* Modals */}
      {editingPacing && editingPacing.owner === activeOwner && <PacingResultEditor run={editingPacing.run} owner={editingPacing.owner} onClose={closePacingEditor} onSaved={handleSessionsChangedElsewhere} />}
      <SessionLoggerModal
        key={activeOwner ?? 'guest'}
        isOpen={isSessionModalOpen}
        onClose={closeSessionLogger}
        onSaveSession={handleSaveSession}
        onSaveVocab={handleSaveVocab}
        sessions={sessions}
        prefill={sessionPrefill}
        editingSession={editingSession}
        onUpdateSession={handleUpdateSession}
        onAddMistakeForSession={openSessionMistake}
        onSavedFullTest={setSavedTest}
        onOpenExistingSession={openSessionEditor}
      />
      {savedTest && <SessionResultScreen session={savedTest} sessions={sessions} mistakes={mistakes} targetScore={profile.targetScore}
        onSignIn={isGuest ? () => void account.signInGoogle() : undefined}
        onClose={closeSavedTest} onMarkWrong={() => markSessionWrong(savedTest)}
        onDetails={() => { setSavedTest(null); openSessionDrafts(savedTest); }}
        onReview={ids => { setSavedTest(null); openReview(ids); }} />}

      {aiSignInOpen && <AISignInPrompt onClose={() => setAISignInOpen(false)}
        onSignIn={() => { setAISignInOpen(false); void account.signInGoogle(); }} />}

      {reviewCards && (
        isPhone ? <ReviewModal cards={reviewCards} onClose={() => setReviewCards(null)} onGrade={handleGradeMistake}
          onReload={id => loadMistakes().find(m => m.id === id && canReview(m))} />
          : <ReviewSession cards={reviewCards} onClose={() => setReviewCards(null)} onGrade={handleGradeMistake} />
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
        accountAvailable={account.available}
        accountStatus={account.status}
        onSignOut={account.email ? account.signOut : undefined}
        accountPanel={<AccountPanel available={account.available} status={account.status} email={account.email} error={account.error}
          onGoogle={account.signInGoogle} onSendOtp={account.sendOtp} onVerifyOtp={account.verifyOtp}
          onRetry={() => void account.retry()} onSignOut={account.signOut} onDelete={account.deleteAccount} showSignOut={false} />}
      />

      {account.pendingTransfer && <TransferChoiceDialog error={account.error} onChoose={account.chooseTransfer} onSkip={account.signOut} />}


    </div>
    </GuideContext.Provider>
    </PhoneShellContext.Provider>
  );
};

export default App;
