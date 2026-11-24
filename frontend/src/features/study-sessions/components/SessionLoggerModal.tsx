import React, { useState, useMemo, useEffect, useRef } from 'react';
import './logger-rd.css';
import './edit-rd.css';
import { 
  X, 
  CheckCircle2, 
  RotateCcw,
  ArrowLeft
} from 'lucide-react';
import { 
  StudySession, 
  LRPartScore, 
  MistakeEntry, 
  PracticePartResult
} from '@/shared/types';
import {
  calculateFromPartScores,
  PART_MAX_QUESTIONS,
  getPracticeParts
} from '@/shared/domain/etsScoring';
import { computeSessionAttemptMap, getTodayDateString, loadMistakes, loadStudySessions, loadVocabLog } from '@/shared/data/storage';
import { VOCAB_DEFAULT, dayMonth, vocabDayTotal, type VocabEditApi } from './phone/phoneLogLib';
import { collectTestNames, normalizeTestName, suggestNextTestName, testNameKey } from '@/shared/domain/testNames';
import { normalizeQuestionList, partScoresFromWrong } from '@/shared/domain/questionNumbers';
import { DesktopPracticeBody } from './DesktopPracticeBody';
import { DesktopVocabBody } from './DesktopVocabBody';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { DateField } from '@/shared/components/DateField';
import { askConfirm } from '@/shared/components/ConfirmDialog';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { resolveFullTestScore, scoreSourceForEditing, type ScoreSource } from '@/features/study-sessions/lib/fullTestScore';
import { assertWriteOwner, getActiveAccountId, runAsOwner } from '@/shared/data/dataBundle';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneFullTestBody, PhonePracticeBody } from './PhoneSessionBody';
import { PhoneLogger, type PhoneStep } from './phone/PhoneLogger';
import { EMPTY_WRONG_NUMBER_DRAFT, type WrongNumberDraft } from '../lib/wrongNumberDraft';
import { parseQuestionList } from '@/shared/domain/questionNumbers';
import { hasResultTiming, formatElapsed, parseElapsed } from '@/shared/domain/resultTiming';
import type { ResultImageTiming, ConfirmedResultTiming } from '@/shared/types';
import { ResultTimingReview, timingCandidate as createTimingCandidate, type TimingCandidate } from './ResultTimingReview';
import { DesktopFullTestBody } from './DesktopFullTestBody';
import { draftQuestions } from '@/features/mistakes/lib/mistakeDrafts';
import { ContainerScrollCue } from '@/shared/components/ScrollCue';
import type { AppliedResultScore, ResultScoreDraft } from './ResultScoreReview';
import type { PartTimingDurations } from '@/shared/types';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { parseSessionFormDraft, type SessionFormDraft } from '@/shared/data/studyFormDrafts';
import { findDuplicateFullTest } from '../lib/duplicateTest';
import { DuplicateTestNotice } from './DuplicateTestNotice';

interface SessionLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSession: (session: StudySession, newMistakes?: MistakeEntry[]) => void;
  onSaveVocab: (date: string, count: number) => void;
  onDeleteVocab?: (date: string) => void;
  sessions?: StudySession[];
  /** Giá trị điền sẵn khi form được mở từ Bộ đếm nhịp hoặc trang Phân tích (SPEC 4.3) */
  /** `markWrong` reopens a saved Full Test straight on its wrong-question grid. */
  prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number; markWrong?: boolean; initialFiles?: File[] };
  /**
   * Có giá trị = chế độ SỬA: form nạp sẵn buổi học này, lưu thì thay thế
   * bản ghi cũ (giữ nguyên id và createdAt) qua onUpdateSession.
   */
  editingSession?: StudySession | null;
  onUpdateSession?: (session: StudySession, original: StudySession, newMistakes?: MistakeEntry[]) => void;
  onAddMistakeForSession?: (session: StudySession) => void;
  /** A new Full Test was saved: the form closes and the app shows its result screen. */
  onSavedFullTest?: (session: StudySession) => void;
  /** "Mở đề cũ" on the duplicate warning: open that saved test in this form instead. */
  onOpenExistingSession?: (session: StudySession) => void;
}

const PART_LABELS: Record<number, string> = { 1: 'Mô tả tranh', 2: 'Hỏi – đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn văn', 7: 'Đọc hiểu' };
const EMPTY_PART_SCORES: LRPartScore = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, part6: 0, part7: 0 };

export const SessionLoggerModal: React.FC<SessionLoggerModalProps> = ({
  isOpen,
  onClose,
  onSaveSession,
  onSaveVocab,
  onDeleteVocab,
  sessions,
  prefill,
  editingSession,
  onUpdateSession,
  onAddMistakeForSession,
  onSavedFullTest,
  onOpenExistingSession
}) => {
  const isEditing = !!editingSession;
  // Phones get a shorter form built from the same state; tablet and desktop keep the full layout.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [sessionType, setSessionType] = useState<'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'>('FULL_TEST');
  const [testName, setTestName] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [durationEdited, setDurationEdited] = useState(false);
  const durationEditedRef = useRef(false);
  const markDurationEdited = (value: boolean) => { durationEditedRef.current = value; setDurationEdited(value); };
  // Giờ làm để trống (đề cũ lưu 0 hoặc learner xoá ô): lưu 0 chứ không bịa 120.
  const [durationEmpty, setDurationEmpty] = useState(false);
  const durationEmptyRef = useRef(false);
  const markDurationEmpty = (value: boolean) => { durationEmptyRef.current = value; setDurationEmpty(value); };
  const [vocabCount, setVocabCount] = useState(VOCAB_DEFAULT);
  // A past day (or a logged today) picked from the "7 ngày qua" strip; false = the plain "log today" form.
  const [vocabPicked, setVocabPicked] = useState(false);
  const [, setVocabTick] = useState(0);
  // Phone logger: 'pick' chooses the test and how to log, 'manual' types the score, 'wrong' is the wrong-question screen.
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('pick');
  const [pendingInitialFiles, setPendingInitialFiles] = useState<File[] | undefined>(undefined);

  const [notes, setNotes] = useState('');
  const [scoreSource, setScoreSource] = useState<ScoreSource>('ESTIMATED');
  const [manualMode, setManualMode] = useState<'MANUAL_SECTIONS' | 'MANUAL_TOTAL'>('MANUAL_SECTIONS');
  const [manualListening, setManualListening] = useState('');
  const [manualReading, setManualReading] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [includePartDetails, setIncludePartDetails] = useState(true);
  const [manualViewOverride, setManualViewOverride] = useState(false);
  // Computer Full Test opens on the paste-an-image view; editing an existing test or restoring typed marks opens the manual tools.
  const [fullTestManual, setFullTestManual] = useState(() => Boolean(editingSession));
  // Between the paste view and the 200-question grid: official L/R plus a typed wrong list.
  const [manualMinimal, setManualMinimal] = useState(false);
  // Computer Full Test: date and duration stay folded away until asked for, so the form opens on the name and the paste area.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Computer AI-first view keeps name/date/time inside the review card; this opens their fields.
  const [metaOpen, setMetaOpen] = useState(false);
  const [partDurations, setPartDurations] = useState<PartTimingDurations | undefined>(() => editingSession?.partDurations);
  const [resultTiming, setResultTiming] = useState<ConfirmedResultTiming | null>(null);
  const [timingCandidate, setTimingCandidate] = useState<TimingCandidate | null>(null);
  const changeDurationMinutes = (value: number) => {
    markDurationEdited(true);
    if (value > 0) markDurationEmpty(false);
    setDurationMinutes(value);
    setResultTiming(current => {
      if (!current || current.totalSeconds === null || Math.abs(current.totalSeconds / 60 - value) < 0.01) return current;
      const next = { ...current, totalSeconds: null };
      return hasResultTiming(next) ? next : null;
    });
  };
  const changePartDurations = (value: PartTimingDurations | undefined) => {
    setPartDurations(value);
    setResultTiming(current => {
      if (!current) return null;
      const next = { ...current, parts: { ...current.parts } };
      for (const key of ['part5', 'part6', 'part7'] as const) {
        if (current.parts[key] !== null && (value?.[key] === undefined || Math.abs(current.parts[key]! / 60 - value[key]!) >= 0.01)) next.parts[key] = null;
      }
      return hasResultTiming(next) ? next : null;
    });
  };
  const applyImageTiming = (value: ConfirmedResultTiming) => {
    setResultTiming(value); setTimingCandidate(null); setScoreError('');
    if (value.totalSeconds !== null) { setDurationMinutes(Math.round(value.totalSeconds / 60 * 100) / 100); markDurationEdited(true); markDurationEmpty(false); }
    const parts = { ...partDurations };
    for (const key of ['part5', 'part6', 'part7'] as const) {
      if (value.parts[key] !== null) parts[key] = Math.round(value.parts[key]! / 60 * 100) / 100;
      else if (resultTiming?.parts[key] != null && parts[key] != null && Math.abs(parts[key]! - resultTiming.parts[key]! / 60) < 0.01) delete parts[key];
    }
    setPartDurations(Object.keys(parts).length ? parts : undefined);
  };
  const discardImageTiming = () => {
    if (resultTiming) {
      if (resultTiming.totalSeconds !== null && Math.abs(durationMinutes - Math.round(resultTiming.totalSeconds / 60 * 100) / 100) < 0.01) {
        setDurationMinutes(editingSession?.durationMinutes ?? prefill?.durationMinutes ?? 120);
        markDurationEmpty(Boolean(editingSession) && !(Number(editingSession?.durationMinutes) > 0));
        markDurationEdited(Boolean(editingSession || prefill?.durationMinutes !== undefined));
      }
      const parts = { ...partDurations };
      for (const key of ['part5', 'part6', 'part7'] as const) {
        if (resultTiming.parts[key] != null && parts[key] != null && Math.abs(parts[key]! - Math.round(resultTiming.parts[key]! / 60 * 100) / 100) < 0.01) {
          delete parts[key];
        }
      }
      setPartDurations(Object.keys(parts).length ? parts : undefined);
    }
    setResultTiming(null);
    setTimingCandidate(null);
    setScoreError('');
  };
  const readImageTiming = (value: ResultImageTiming) => {
    if (!hasResultTiming(value)) return;
    const previous = timingCandidate?.timing ?? resultTiming;
    const merged: ResultImageTiming = {
      totalSeconds: (value.totalSeconds && value.totalSeconds > 0 ? value.totalSeconds : null) ?? previous?.totalSeconds ?? null,
      listeningSeconds: value.listeningSeconds ?? previous?.listeningSeconds ?? null,
      readingSeconds: value.readingSeconds ?? previous?.readingSeconds ?? null,
      parts: Object.fromEntries(Object.entries(value.parts).map(([key, seconds]) =>
        [key, seconds ?? previous?.parts[key as keyof ResultImageTiming['parts']] ?? null])) as ResultImageTiming['parts'],
    };
    if (timingCandidate?.edited) {
      setTimingCandidate(current => {
        if (!current) return null;
        const next = createTimingCandidate(merged);
        const original = createTimingCandidate(current.timing).fields;
        for (const key of Object.keys(current.fields) as (keyof TimingCandidate['fields'])[]) {
          if (current.fields[key] !== original[key]) next.fields[key] = current.fields[key];
        }
        next.edited = true;
        return next;
      });
      return;
    }
    if (hasResultTiming(merged)) {
      applyImageTiming({ ...merged, source: 'IMAGE_CONFIRMED' });
    }
  };
  // A Full Test is logged by its wrong questions; per-Part counts and official scores stay as alternatives.
  const [entry, setEntry] = useState<'wrong' | 'counts'>('wrong');
  const [wrongQuestions, setWrongQuestionsState] = useState<number[]>([]);
  const latestWrongQuestions = useRef<number[]>([]);
  latestWrongQuestions.current = wrongQuestions;
  const setWrongQuestions = (next: number[]) => {
    latestWrongQuestions.current = next;
    setWrongQuestionsState(next);
    if (entry === 'wrong') {
      setPartScores(partScoresFromWrong(next));
      if (next.length > 0) setIncludePartDetails(true);
    }
  };
  const [wrongNumberDraft, setWrongNumberDraft] = useState<WrongNumberDraft>(EMPTY_WRONG_NUMBER_DRAFT);
  const suggestedName = useRef('');
  const [scoreError, setScoreError] = useState('');
  // A new Full Test with the same name and date as one already logged: asked once, just above the save button.
  const [duplicate, setDuplicate] = useState<{ session: StudySession; addMistake: boolean } | null>(null);
  useEffect(() => { setDuplicate(null); }, [testName, date, sessionType]);
  const [sourceScorePending, setSourceScorePending] = useState(false);
  const sourceScoreStore = useRef<ResultScoreDraft | null>(null);
  const draftOwner = useRef(getActiveAccountId());
  const savedSession = useRef(false);
  const [restoredVersion, setRestoredVersion] = useState(0);
  // Computer: "Bỏ nháp" clears the form at once and offers 8 seconds to undo instead of a confirm dialog.
  const [discarded, setDiscarded] = useState<SessionFormDraft | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const restoredType = useRef<string | null>(null);

  // Tìm kiếm xem đề thi này đã từng làm chưa
  const previousAttemptsForTest = useMemo(() => {
    if (!sessions || !testName.trim()) return [];
    const normalized = testNameKey(testName);
    // Khi sửa, không tính chính bản ghi đang sửa là "lần làm trước"
    return sessions.filter(s =>
      !s.deletedAt && testNameKey(s.testName) === normalized &&
      s.skillType === 'LR' &&
      s.sessionType === 'FULL_TEST' &&
      s.id !== editingSession?.id
    );
  }, [sessions, testName, editingSession?.id]);

  const isExistingTest = sessionType === 'FULL_TEST' && previousAttemptsForTest.length > 0;
  const nextAttemptNumber = Math.max(0, ...Object.values(computeSessionAttemptMap(previousAttemptsForTest)).map(meta => meta.attemptNumber)) + 1;
  const bestPreviousScore = isExistingTest 
    ? Math.max(...previousAttemptsForTest.map(s => s.totalScore || 0)) 
    : 0;

  // Notes can name a test before the learner has a total score.
  const uniqueTestNameSuggestions = useMemo(() => isOpen ? collectTestNames(sessions ?? loadStudySessions(), loadMistakes()) : [], [sessions, isOpen]);
  const canonicalTestName = uniqueTestNameSuggestions.find(name => testNameKey(name) === testNameKey(testName)) ?? normalizeTestName(testName);

  // Part scores for Full Test
  // Bắt đầu từ 0 - người dùng tự nhập kết quả thật. Điền sẵn điểm cao
  // dễ khiến một cú bấm nhầm ghi nhận kỷ lục không có thật.
  const [partScores, setPartScores] = useState<LRPartScore>({
    part1: 0,
    part2: 0,
    part3: 0,
    part4: 0,
    part5: 0,
    part6: 0,
    part7: 0
  });

  // Part Practice mode state
  /**
   * Một buổi luyện lẻ có thể gồm NHIỀU Part, mỗi Part có số câu riêng.
   * Lưu thành dữ liệu có cấu trúc thay vì nhét vào chuỗi notes (SPEC 4.4).
   */
  const [practiceRows, setPracticeRows] = useState<PracticePartResult[]>([
    { part: 5, correct: 0, total: 30 }
  ]);

  /**
   * Nạp lại form MỖI LẦN mở. Component không bị gỡ khi đóng (chỉ trả null),
   * nên trước đây lần mở sau còn nguyên số của lần nhập trước - và với chế
   * độ sửa, sửa xong rồi bấm "Nhập điểm" sẽ thấy dữ liệu của buổi vừa sửa.
   */
  // Called from the open effect and, synchronously, from "Bỏ nháp": the reset must land in the same render that
  // remounts the bodies and before the draft hook persists again, or that persist re-writes the discarded draft.
  const resetForm = () => {
    setDuplicate(null);
    const e = editingSession;
    setSessionType(e?.sessionType ?? prefill?.sessionType ?? 'FULL_TEST');
    // A new Full Test starts with the next numbered test after the latest one (Test 3 -> Test 4) on both Desktop and Mobile.
    suggestedName.current = !e && (prefill?.sessionType ?? 'FULL_TEST') === 'FULL_TEST' ? suggestNextTestName(loadStudySessions()) : '';
    setTestName(e?.testName ?? suggestedName.current);
    const markWrong = Boolean(e && prefill?.markWrong);
    setEntry(e?.partScores && !e.wrongQuestions && !markWrong ? 'counts' : 'wrong');
    setManualViewOverride(Boolean(e && !markWrong && !e.wrongQuestions && (e.scoreSource !== 'ESTIMATED' || e.partScores)));
    setWrongQuestions(e?.wrongQuestions ? [...e.wrongQuestions] : []);
    setFullTestManual(Boolean(e));
    setManualMinimal(false);
    setDetailsOpen(false);
    setWrongNumberDraft(EMPTY_WRONG_NUMBER_DRAFT);
    setPartDurations(e?.partDurations);
    setResultTiming(e?.resultTiming ?? null); setTimingCandidate(null);
    setDate(e?.date ?? getTodayDateString());
    // Bộ đếm nhịp truyền sang thời gian THẬT đã dùng - ghi đè mặc định 120 phút
    setDurationMinutes(e?.durationMinutes ?? prefill?.durationMinutes ?? (prefill?.sessionType === 'PART_PRACTICE' ? 30 : 120));
    markDurationEdited(Boolean(e || prefill?.durationMinutes !== undefined));
    markDurationEmpty(Boolean(e) && !(Number(e?.durationMinutes) > 0));
    setVocabCount(VOCAB_DEFAULT);
    setVocabPicked(false);
    setPhoneStep(markWrong || prefill?.initialFiles?.length ? 'wrong' : 'pick');
    setNotes(e?.notes ?? '');
    setPartScores(e?.partScores ? { ...e.partScores } : { ...EMPTY_PART_SCORES });
    const source = scoreSourceForEditing(e);
    setScoreSource(source);
    setManualMode(source === 'MANUAL_TOTAL' ? 'MANUAL_TOTAL' : 'MANUAL_SECTIONS');
    setManualListening(e?.scaledListening === undefined ? '' : String(e.scaledListening));
    setManualReading(e?.scaledReading === undefined ? '' : String(e.scaledReading));
    setManualTotal(e?.totalScore === undefined ? '' : String(e.totalScore));
    setIncludePartDetails(source === 'ESTIMATED' || Boolean(e?.partScores));
    setScoreError('');
    const parts = e && e.sessionType === 'PART_PRACTICE' ? getPracticeParts(e) : [];
    setSourceScorePending(false);
    sourceScoreStore.current = null;
    setPendingInitialFiles(prefill?.initialFiles?.length ? prefill.initialFiles : undefined);
    const requestedPart = prefill?.partNumber;
    const part = typeof requestedPart === 'number' && Number.isInteger(requestedPart) && requestedPart >= 1 && requestedPart <= 7 ? requestedPart as PracticePartResult['part'] : 5;
    setPracticeRows(parts.length > 0 ? parts.map(p => ({ ...p })) : [{ part, correct: isPhone ? 0 : PART_MAX_QUESTIONS[`part${part}`], total: PART_MAX_QUESTIONS[`part${part}`] }]);
  };
  useEffect(() => {
    if (!isOpen) { sourceScoreStore.current = null; setPendingInitialFiles(undefined); return; }
    draftOwner.current = getActiveAccountId();
    savedSession.current = false;
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the form opens or its target changes
  }, [isOpen, editingSession, prefill?.durationMinutes, prefill?.sessionType, prefill?.partNumber, prefill?.markWrong, prefill?.initialFiles]);

  // Switching tabs swaps the untouched default duration (Full Test 120, Part practice 30); a typed value stays.
  useEffect(() => {
    if (restoredType.current === sessionType) { restoredType.current = null; return; }
    restoredType.current = null;
    setSourceScorePending(false); sourceScoreStore.current = null;
    if (!durationEditedRef.current && sessionType === 'PART_PRACTICE') setDurationMinutes(current => current === 120 ? 30 : current);
    if (sessionType !== 'FULL_TEST') setTestName(current => current && current === suggestedName.current ? '' : current);
    if (sessionType === 'FULL_TEST') { if (!durationEditedRef.current) setDurationMinutes(current => current === 30 ? 120 : current); setManualViewOverride(false); }
  }, [sessionType]);

  const vocabToday = getTodayDateString();
  const vocabDefault = VOCAB_DEFAULT;
  const vocabExisting = sessionType === 'VOCAB' ? vocabDayTotal(loadVocabLog(), date) : 0;
  const vocabApi: VocabEditApi = {
    edit: vocabPicked || date !== vocabToday,
    existing: vocabExisting,
    onPick: day => {
      const total = vocabDayTotal(loadVocabLog(), day);
      setDate(day); setVocabCount(total > 0 ? total : vocabDefault); setVocabPicked(day !== vocabToday || total > 0); setScoreError('');
    },
    onBack: () => { setDate(vocabToday); setVocabCount(vocabDefault); setVocabPicked(false); setScoreError(''); },
    onDelete: () => {
      try { runAsOwner(draftOwner.current, () => onDeleteVocab?.(date)); } catch (error) { setScoreError(error instanceof Error ? error.message : 'Chưa xóa được ngày này.'); return; }
      setDate(vocabToday); setVocabCount(vocabDefault); setVocabPicked(false); setVocabTick(n => n + 1);
    }
  };
  const vocabDm = dayMonth(date);

  const formDraft: SessionFormDraft = { sessionType, testName, date, durationMinutes, durationEdited, vocabCount, notes,
    scoreSource, manualMode, manualListening, manualReading, manualTotal, includePartDetails, entry, wrongQuestions,
    partScores, practiceRows, sourceScorePending, sourceScoreDraft: sourceScoreStore.current, originalUpdatedAt: editingSession?.updatedAt, wrongNumberDraft, partDurations, resultTiming, timingCandidate };
  const restoreFormDraft = (value: SessionFormDraft) => {
      restoredType.current = value.sessionType;
      setSessionType(value.sessionType); setTestName(value.testName); setDate(value.date); setDurationMinutes(value.durationMinutes);
      markDurationEdited(value.durationEdited || value.resultTiming?.totalSeconds != null);
      setVocabCount(value.vocabCount); setNotes(value.notes);
      setPhoneStep(value.scoreSource !== 'ESTIMATED' || value.sourceScorePending ? 'manual' : value.wrongQuestions.length > 0 ? 'wrong' : 'pick'); setScoreSource(value.scoreSource); setManualMode(value.manualMode);
      setManualListening(value.manualListening); setManualReading(value.manualReading); setManualTotal(value.manualTotal);
      setIncludePartDetails(value.includePartDetails); setEntry(value.entry); setWrongQuestions(value.wrongQuestions); setPartScores(value.partScores);
      setWrongNumberDraft(value.wrongNumberDraft); setPartDurations(value.partDurations);
      setFullTestManual(false);
      setManualMinimal(value.wrongQuestions.length > 0 || value.wrongNumberDraft.typing);
      setResultTiming(value.resultTiming); setTimingCandidate(value.timingCandidate);
      setPracticeRows(value.practiceRows as PracticePartResult[]); sourceScoreStore.current = value.sourceScoreDraft; setSourceScorePending(value.sourceScorePending);
      setRestoredVersion(version => version + 1);
  };
  const persistentDraft = useFormDraft({
    scope: `session:${editingSession?.id ?? (prefill?.sessionType ? `prefill:${prefill.sessionType}:${prefill.partNumber ?? 'all'}` : 'new')}`,
    enabled: isOpen && !savedSession.current, value: formDraft,
    snapshot: () => ({ ...formDraft, sourceScoreDraft: sourceScoreStore.current }),
    meaningful: Boolean(testName.trim() && testName !== suggestedName.current || notes.trim() || wrongQuestions.length || manualListening || manualReading || manualTotal
      || Object.values(partScores).some(Boolean) || practiceRows.some(row => row.correct > 0 || row.total !== PART_MAX_QUESTIONS[`part${row.part}`])
      || practiceRows.length > 1 || sourceScorePending || wrongNumberDraft.typing || Boolean(partDurations) || Boolean(timingCandidate || resultTiming) || vocabCount !== VOCAB_DEFAULT || date !== getTodayDateString()
      || durationMinutes !== (prefill?.durationMinutes ?? (sessionType === 'PART_PRACTICE' ? 30 : 120)) || sessionType !== (prefill?.sessionType ?? 'FULL_TEST')),
    validate: input => {
      const value = parseSessionFormDraft(input);
      return value && value.originalUpdatedAt === editingSession?.updatedAt ? value : null;
    },
    restore: value => restoreFormDraft(value)
  });
  const discardDraft = () => {
    const snapshot = { ...formDraft, sourceScoreDraft: sourceScoreStore.current };
    // Reset first (state and the score-review ref), then remove the stored draft: the remounted bodies start empty
    // and the next persist sees an untouched form, so nothing is written back.
    resetForm();
    setRestoredVersion(value => value + 1);
    if (!persistentDraft.clear()) { restoreFormDraft(snapshot); return; }
    setDiscarded(snapshot);
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setDiscarded(null), 8000);
  };
  const undoDiscard = () => {
    if (!discarded) return;
    window.clearTimeout(undoTimer.current);
    restoreFormDraft(discarded);
    setDiscarded(null);
    persistentDraft.restart();
  };
  const confirmingSubmit = useRef(false);
  const closeWithDraft = () => {
    if (!persistentDraft.persist()) {
      void askConfirm({
        title: 'Đóng mà chưa lưu nháp?',
        message: 'Chưa tự lưu được nháp. Đóng form sẽ mất nội dung đang nhập. Vẫn đóng?',
        confirmLabel: 'Vẫn đóng',
        cancelLabel: 'Ở lại',
        destructive: true
      }).then(ok => { if (ok) onClose(); });
      return;
    }
    onClose();
  };
  const modalRef = useModalA11y(isOpen, closeWithDraft);
  const formBodyRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;
  // Phones: new logs and "mark wrong questions" use the full-screen flow; editing a saved result keeps the older form.
  const newPhone = isPhone && (!isEditing || Boolean(prefill?.markWrong));

  const wrongEntry = sessionType === 'FULL_TEST' && !manualViewOverride && entry === 'wrong';
  // Computer Full Test: hide date/duration until asked; show the duration empty ("Chưa ghi") until the learner types or an image sets it.
  const aiDesktop = sessionType === 'FULL_TEST' && !isPhone && wrongEntry && !fullTestManual && !manualMinimal;
  // Ghi điểm (capture-v3): "Lưu điểm" appears once Sóc has read a photo (or the learner chose a manual way).
  const awaitingRead = aiDesktop && !isEditing && scoreSource === 'ESTIMATED' && wrongQuestions.length === 0 && !sourceScorePending;
  const compactTop = sessionType === 'FULL_TEST' && !isPhone && !fullTestManual && !detailsOpen;
  const durationBlank = sessionType === 'FULL_TEST' && !isPhone && ((!isEditing && !durationEdited) || durationEmpty);
  const typedWrongParsed = wrongEntry && wrongNumberDraft.typing ? parseQuestionList(wrongNumberDraft.text) : null;
  const activeWrongQuestions = typedWrongParsed && !typedWrongParsed.invalid.length ? typedWrongParsed.questions : wrongQuestions;
  const effectiveParts = wrongEntry ? partScoresFromWrong(activeWrongQuestions) : partScores;
  // Tính điểm trực tiếp từ partScores
  const calculated = calculateFromPartScores(effectiveParts);
  const resolveScores = (overrideParts = effectiveParts, overrideIncludePartDetails = includePartDetails) => resolveFullTestScore({
    previous: editingSession,
    source: scoreSource,
    partScores: scoreSource === 'ESTIMATED' || overrideIncludePartDetails ? overrideParts : undefined,
    listening: manualListening.trim() ? Number(manualListening) : undefined,
    reading: manualReading.trim() ? Number(manualReading) : undefined,
    total: manualTotal.trim() ? Number(manualTotal) : undefined
  });
  let scorePreview: ReturnType<typeof resolveFullTestScore> | null = null;
  try { scorePreview = resolveScores(); } catch { /* Incomplete manual fields stay empty in the preview. */ }

  const changeEntry = (mode: 'wrong' | 'counts') => {
    setSourceScorePending(false);
    sourceScoreStore.current = null;
    if (mode === 'counts') {
      setPartScores(wrongQuestions.length ? partScoresFromWrong(wrongQuestions) : { ...EMPTY_PART_SCORES });
      setManualViewOverride(true);
    } else {
      setManualViewOverride(false);
    }
    setEntry(mode);
  };
  // Official scores keep the marked questions as per-Part detail.
  const switchManual = (on: boolean) => {
    setSourceScorePending(false);
    sourceScoreStore.current = null;
    setScoreSource(on ? manualMode : 'ESTIMATED');
    setManualViewOverride(on);
    if (on && entry === 'wrong') { setPartScores(wrongQuestions.length ? effectiveParts : { ...EMPTY_PART_SCORES }); setIncludePartDetails(wrongQuestions.length > 0); }
    else if (on) setIncludePartDetails(Object.values(partScores).some(count => count > 0));
    setScoreError('');
  };
  // Minimal manual view: both Listening and Reading filled = official sections score; otherwise back to the estimate from the wrong list.
  const changeSectionScores = (listeningValue: string, readingValue: string) => {
    setSourceScorePending(false);
    sourceScoreStore.current = null;
    setManualListening(listeningValue);
    setManualReading(readingValue);
    setScoreError('');
    if (listeningValue.trim() && readingValue.trim()) {
      setScoreSource('MANUAL_SECTIONS'); setManualMode('MANUAL_SECTIONS');
      setManualTotal(String(Number(listeningValue) + Number(readingValue)));
    } else if (scoreSource === 'MANUAL_SECTIONS') {
      setScoreSource('ESTIMATED'); setManualTotal('');
    }
  };
  const applySourceScore = (score: AppliedResultScore) => {
    const currentWrong = latestWrongQuestions.current;
    setScoreSource(score.source); setManualMode(score.source);
    setManualListening(score.source === 'MANUAL_SECTIONS' ? String(score.listening) : '');
    setManualReading(score.source === 'MANUAL_SECTIONS' ? String(score.reading) : '');
    setManualTotal(String(score.source === 'MANUAL_TOTAL' ? score.total : score.listening + score.reading));
    setPartScores(partScoresFromWrong(currentWrong));
    setIncludePartDetails(currentWrong.length > 0);
    if (score.partDurations) {
      changePartDurations(score.partDurations);
    }
    setManualViewOverride(false);
    setScoreError('');
  };

  const revertSourceScore = () => {
    setScoreSource('ESTIMATED');
    setManualListening('');
    setManualReading('');
    setManualTotal('');
    sourceScoreStore.current = null;
    setSourceScorePending(false);
    setScoreError('');
  };

  const handlePartScoreChange = (partKey: keyof LRPartScore, value: number) => {
    const maxVal = PART_MAX_QUESTIONS[partKey];
    const clamped = Math.max(0, Math.min(maxVal, isNaN(value) ? 0 : value));
    setPartScores(prev => ({ ...prev, [partKey]: clamped }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savedSession.current || confirmingSubmit.current) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const submitValue = submitter instanceof HTMLButtonElement ? submitter.value : '';
    // "Vẫn lưu" on the duplicate warning repeats the save the learner first asked for.
    const duplicateConfirmed = submitValue === 'duplicate' && duplicate !== null;
    const addMistakeAfterSave = duplicateConfirmed ? duplicate.addMistake : submitValue === 'mistake';
    try {
      // Opened for one owner: refuse (and tell the app) if another tab signed out or switched account since.
      assertWriteOwner(draftOwner.current);
      setScoreError('');

      if (sessionType === 'VOCAB') {
        runAsOwner(draftOwner.current, () => onSaveVocab(date, vocabCount));
        savedSession.current = true;
        persistentDraft.clear();
        onClose();
        return;
      }

      if (sessionType === 'FULL_TEST' && !testName.trim()) {
        setMetaOpen(true);
        setScoreError('Đặt tên đề trước khi lưu.');
        return;
      }

      const sessionId = editingSession?.id ?? `session-${Date.now()}`;
      const createdAt = editingSession?.createdAt ?? new Date().toISOString();
      let newSession: StudySession;

      if (sessionType === 'FULL_TEST') {
        let finalTiming = resultTiming;
        // A computer Full Test whose duration was never typed, read from an image or edited is saved as "not recorded" (0),
        // not as the 120-minute placeholder: that number was never the learner's real time and would count as study minutes.
        const durationUnknown = !isPhone && ((!isEditing && !durationEditedRef.current) || durationEmptyRef.current);
        let finalDuration = durationUnknown ? 0 : Number(durationMinutes) || 120;
        let finalPartDurations = partDurations;
        if (timingCandidate) {
          const parsedTiming: ResultImageTiming = {
            totalSeconds: null, listeningSeconds: null, readingSeconds: null,
            parts: { part1: null, part2: null, part3: null, part4: null, part5: null, part6: null, part7: null }
          };
          const timingKeys = ['totalSeconds', 'listeningSeconds', 'readingSeconds', 'part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'] as const;
          for (const key of timingKeys) {
            const val = parseElapsed(timingCandidate.fields[key] ?? '');
            if (val === 'invalid') {
              setScoreError('Kiểm tra và áp dụng thời gian từ ảnh, hoặc chọn “Bỏ qua thời gian” trước khi lưu.');
              return;
            }
            if (key.startsWith('part')) parsedTiming.parts[key as keyof ResultImageTiming['parts']] = val;
            else parsedTiming[key as 'totalSeconds'] = val;
          }
          if (parsedTiming.totalSeconds === 0 || !hasResultTiming(parsedTiming)) {
            setScoreError('Kiểm tra và áp dụng thời gian từ ảnh, hoặc chọn “Bỏ qua thời gian” trước khi lưu.');
            return;
          }
          finalTiming = { ...parsedTiming, source: 'IMAGE_CONFIRMED' };
          if (finalTiming.totalSeconds !== null) finalDuration = Math.round(finalTiming.totalSeconds / 60 * 100) / 100;
          const nextParts = { ...finalPartDurations };
          for (const key of ['part5', 'part6', 'part7'] as const) {
            if (finalTiming.parts[key] !== null) nextParts[key] = Math.round(finalTiming.parts[key]! / 60 * 100) / 100;
          }
          finalPartDurations = Object.keys(nextParts).length ? nextParts : undefined;
          applyImageTiming(finalTiming);
        }

        let finalWrong = wrongQuestions;
        if (entry === 'wrong' && wrongNumberDraft.typing) {
          const parsed = parseQuestionList(wrongNumberDraft.text);
          if (parsed.invalid.length) {
            setScoreError('Áp dụng danh sách số câu đang gõ, hoặc bấm Hủy tại ô số câu trước khi lưu. Nội dung đang gõ đã được giữ trong nháp.');
            return;
          }
          finalWrong = parsed.questions;
          setWrongQuestions(parsed.questions);
          setWrongNumberDraft(EMPTY_WRONG_NUMBER_DRAFT);
        }
        if (sourceScorePending) { setScoreError('Kiểm tra và áp dụng điểm từ đề, hoặc chọn “Dùng điểm ước tính” trước khi lưu.'); return; }
        if (wrongEntry && scoreSource === 'ESTIMATED' && !finalWrong.length) {
          confirmingSubmit.current = true;
          let ok = false;
          try {
            ok = await askConfirm({
              title: 'Lưu 990 điểm?',
              message: 'Bạn không sai câu nào? Đề sẽ được lưu 990 điểm.',
              confirmLabel: 'Lưu 990 điểm',
              cancelLabel: 'Chọn câu sai'
            });
          } finally {
            confirmingSubmit.current = false;
          }
          if (!ok || savedSession.current) return;
          assertWriteOwner(draftOwner.current);
        }
        const submitParts = wrongEntry ? partScoresFromWrong(finalWrong) : partScores;
        const submitIncludeParts = includePartDetails || (entry === 'wrong' && finalWrong.length > 0);
        let resolved: ReturnType<typeof resolveFullTestScore>;
        try { resolved = resolveScores(submitParts, submitIncludeParts); setScoreError(''); }
        catch (reason) { setScoreError(reason instanceof Error ? reason.message : 'Điểm chưa hợp lệ.'); return; }
        newSession = {
          id: sessionId,
          skillType: 'LR',
          sessionType: 'FULL_TEST',
          testName: canonicalTestName || 'ETS Test',
          attemptNumber: isEditing && editingSession
            ? computeSessionAttemptMap(sessions ?? loadStudySessions())[editingSession.id]?.attemptNumber ?? editingSession.attemptNumber ?? 1
            : isExistingTest ? nextAttemptNumber : 1,
          date,
          durationMinutes: finalDuration,
          partDurations: finalPartDurations && Object.values(finalPartDurations).some(value => value !== undefined) ? finalPartDurations : undefined,
          ...(finalTiming ? { resultTiming: finalTiming } : {}),
          ...resolved,
          // Phone: a typed score with no marked questions says nothing about wrong answers, so the result screen can still offer to mark them.
          ...(entry === 'wrong' && (wrongEntry || finalWrong.length > 0) && !(newPhone && scoreSource !== 'ESTIMATED' && finalWrong.length === 0) ? { wrongQuestions: normalizeQuestionList(finalWrong) } : {}),
          notes,
          createdAt
        };
      } else {
        const cleanRows = practiceRows.map(r => ({ ...r })).filter(r => r.total > 0);
        const partLabel = cleanRows.length === 1
          ? `Luyện Part ${cleanRows[0].part}`
          : `Luyện ${cleanRows.length} Part`;

        newSession = {
          id: sessionId,
          skillType: 'LR',
          sessionType: 'PART_PRACTICE',
          testName: canonicalTestName || partLabel,
          date,
          durationMinutes: Number(durationMinutes) || 30,
          // Buổi luyện lẻ KHÔNG có raw score của đề đầy đủ - để trống thay vì
          // nhét số câu Part lẻ vào ô vốn nghĩa là "đúng bao nhiêu trên 100 câu"
          totalScore: 0,
          practiceParts: cleanRows,
          notes,
          createdAt
        };
      }

      if (!editingSession && newSession.sessionType === 'FULL_TEST' && !duplicateConfirmed) {
        const existing = findDuplicateFullTest(sessions ?? loadStudySessions(), newSession.testName, newSession.date);
        if (existing) { setDuplicate({ session: existing, addMistake: addMistakeAfterSave }); return; }
      }
      setDuplicate(null);
      const saved = newSession;
      if (editingSession && onUpdateSession) {
        runAsOwner(draftOwner.current, () => onUpdateSession(saved, editingSession));
      } else {
        runAsOwner(draftOwner.current, () => onSaveSession(saved));
      }
      savedSession.current = true;
      persistentDraft.clear();
      // A new Full Test ends on its result screen, unless the learner asked to add a mistake right away.
      const addsMistake = addMistakeAfterSave && !draftQuestions(newSession).length;
      if (newSession.sessionType === 'FULL_TEST' && onSavedFullTest && (!isEditing || prefill?.markWrong) && !addsMistake) {
        onClose();
        onSavedFullTest(newSession);
        return;
      }
      onClose();
      if (addMistakeAfterSave) onAddMistakeForSession?.(newSession);
    } catch (reason) {
      setScoreError(reason instanceof Error ? reason.message : 'Chưa lưu được buổi học. Nội dung đang nhập vẫn được giữ.');
    }
  };

  const openExisting = duplicate && onOpenExistingSession ? () => {
    // Keep what was typed as a draft for next time, then switch the form to the saved test.
    persistentDraft.persist();
    const target = duplicate.session;
    setDuplicate(null);
    onOpenExistingSession(target);
  } : undefined;
  const duplicateNotice = duplicate ? <DuplicateTestNotice session={duplicate.session} onOpen={openExisting} /> : null;

  if (newPhone) {
    const timingNotice = sessionType === 'FULL_TEST' && (
      <>
        {timingCandidate && <ResultTimingReview candidate={timingCandidate} onChange={setTimingCandidate} onApply={applyImageTiming} onDiscard={discardImageTiming} />}
        {resultTiming && !timingCandidate && <div role="status" className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
          Thời gian đã xác nhận từ ảnh{resultTiming.totalSeconds !== null ? `: ${formatElapsed(resultTiming.totalSeconds)}` : ' · chỉ có từng phần'}.
          <button type="button" onClick={() => setTimingCandidate(createTimingCandidate(resultTiming))} className="ml-2 min-h-9 font-bold underline">Kiểm tra / sửa thời gian</button>
          <button type="button" onClick={discardImageTiming} className="ml-2 min-h-9 font-bold text-slate-600 underline dark:text-slate-300">Bỏ qua thời gian</button>
        </div>}
      </>
    );
    return (
      <div className="rd pl-root">
        <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="session-logger-title" tabIndex={-1} className="pl-dialog animate-sheet-up">
          <form onSubmit={handleSubmit} className="pl-form" onKeyDown={event => {
            // A numeric box on a phone keypad must not save the form by accident: Enter just closes the keypad.
            if (event.key === 'Enter' && !event.defaultPrevented && event.target instanceof HTMLInputElement && event.target.type !== 'file') { event.preventDefault(); event.target.blur(); }
          }}>
            <PhoneLogger key={restoredVersion} sessionType={sessionType} isEditing={isEditing} step={phoneStep} setStep={setPhoneStep} onClose={closeWithDraft}
              sessions={sessions ?? []} editingId={editingSession?.id}
              testName={testName} setTestName={setTestName} suggestions={uniqueTestNameSuggestions}
              date={date} setDate={setDate} duration={durationMinutes} setDuration={changeDurationMinutes}
              partDurations={partDurations} onPartDurationsChange={changePartDurations}
              scoreSource={scoreSource} manualListening={manualListening} manualReading={manualReading} manualTotal={manualTotal}
              changeSectionScores={changeSectionScores} totalPreview={scorePreview?.totalScore}
              wrongQuestions={wrongQuestions} onWrong={setWrongQuestions}
              numberDraft={wrongNumberDraft} onNumberDraft={setWrongNumberDraft}
              onTiming={readImageTiming} onScores={applySourceScore} onScoresPending={setSourceScorePending}
              scoreStore={sourceScoreStore} onRevertScore={revertSourceScore}
              initialFiles={pendingInitialFiles} setInitialFiles={setPendingInitialFiles}
              timingNotice={timingNotice} scoreError={scoreError} duplicateNotice={duplicateNotice}
              practiceRows={practiceRows} setPracticeRows={setPracticeRows}
              vocabCount={vocabCount} setVocabCount={setVocabCount} vocab={vocabApi} />
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto max-md:items-stretch max-md:p-0 max-md:overflow-hidden animate-backdrop">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-logger-title"
        tabIndex={-1}
        className={`rd rdl rdl-modal relative w-full ${wrongEntry && !isPhone ? (fullTestManual ? 'max-w-[1100px]' : 'max-w-[600px]') : !isPhone && sessionType === 'PART_PRACTICE' ? 'max-w-[600px]' : 'max-w-3xl'} my-4 bg-white overflow-hidden flex flex-col max-h-[92vh] max-md:my-0 max-md:h-[100dvh] max-md:max-h-none animate-sheet-up sm:animate-modal-pop`}>
        
        {/* Header Modal */}
        <div className="rdl-head flex items-center justify-between bg-white">
          <div className="flex items-center space-x-3">
            <div>
              <h2 id="session-logger-title" className="rdl-title">{sessionType === 'VOCAB' ? (vocabApi.edit ? `Sửa ngày ${vocabDm}` : 'Ghi từ vựng') : isEditing ? 'Sửa kết quả' : 'Ghi điểm'}</h2>
            </div>
          </div>
          <button
            onClick={closeWithDraft}
            aria-label="Đóng form ghi nhận buổi học"
            className="rdl-x cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {persistentDraft.state === 'restored' && isPhone && (
          <div className="flex shrink-0 items-center justify-end px-4 py-1.5 sm:px-6">
            <div className="rde-pill">
              <span role="status">Đã khôi phục bản nháp trên thiết bị này</span>
              <button
                type="button"
                className="rde-pill-x"
                onClick={() => {
                  void askConfirm({
                    title: 'Bỏ bản nháp đang nhập?',
                    message: 'Xóa bản nháp đang nhập và đóng form? Kết quả đã lưu không bị ảnh hưởng.',
                    confirmLabel: 'Bỏ nháp',
                    cancelLabel: 'Giữ lại',
                    destructive: true
                  }).then(ok => {
                    if (ok && persistentDraft.clear()) onClose();
                  });
                }}
              >
                Bỏ nháp
              </button>
            </div>
          </div>
        )}
        {persistentDraft.state === 'unavailable' && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:px-6">
            <span role="status">Chưa tự lưu được nháp trên trình duyệt. Giữ form mở để tránh mất nội dung.</span>
          </div>
        )}
        {/* Form Content */}
        <form onSubmit={handleSubmit} onKeyDown={event => {
          if (event.key !== 'Enter' || event.defaultPrevented || !(event.target instanceof HTMLInputElement)) return;
          event.preventDefault();
          const primary = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"][data-primary]');
          if (primary) event.currentTarget.requestSubmit(primary);
        }} className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 flex flex-col">
            <div ref={formBodyRef} className={`min-h-0 flex-1 ${wrongEntry && !isPhone ? 'space-y-3 p-4 sm:px-5 sm:py-3.5' : 'space-y-4 p-5'} overflow-y-auto max-md:p-4`}>
          
          {/* Mode switcher: one soft segmented bar on every screen */}
          <div className="rdl-seg">
            {(isPhone ? [['FULL_TEST', 'Full Test'], ['PART_PRACTICE', 'Luyện Part'], ['VOCAB', 'Từ vựng']] as const
              : [['FULL_TEST', 'Đề Full Test'], ['PART_PRACTICE', 'Bài luyện Part'], ['VOCAB', 'Từ vựng']] as const)
              .filter(([type]) => !(isEditing && type === 'VOCAB'))
              .map(([type, label]) => {
                const on = sessionType === type;
                return (
                  <button key={type} type="button" onClick={() => setSessionType(type)} aria-pressed={on}>
                    {label}
                  </button>
                );
              })}
          </div>

          {!isPhone && discarded && (
            <div role="status" className="flex items-center justify-between text-[12.5px] font-bold text-slate-500 dark:text-slate-400">
              <span>Đã bỏ bản nháp</span>
              <button type="button" onClick={undoDiscard} className="cursor-pointer font-extrabold text-blue-700 hover:underline dark:text-blue-300">Hoàn tác</button>
            </div>
          )}
          {!isPhone && !discarded && persistentDraft.state === 'restored' && (
            <div className="flex items-center justify-between text-[12.5px] font-bold text-slate-500 dark:text-slate-400">
              <span role="status">Đang tiếp tục bản nháp chưa lưu</span>
              <button type="button" onClick={discardDraft} className="cursor-pointer font-extrabold text-rose-700 hover:underline dark:text-rose-300">Bỏ nháp</button>
            </div>
          )}

          {isPhone && sessionType === 'FULL_TEST' && (
            <PhoneFullTestBody key={restoredVersion} testName={testName} setTestName={setTestName} suggestions={uniqueTestNameSuggestions}
              onTiming={readImageTiming}
              initialFiles={pendingInitialFiles}
              onInitialFilesHandled={() => setPendingInitialFiles(undefined)}
              onRevertScore={revertSourceScore}
              numberDraft={wrongNumberDraft} onNumberDraft={setWrongNumberDraft}
              retest={isExistingTest ? { attempt: nextAttemptNumber, best: bestPreviousScore } : undefined}
              partScores={effectiveParts} onPart={handlePartScoreChange} preview={scorePreview}
              entry={entry} onEntry={changeEntry}
              wrongQuestions={wrongQuestions} onWrong={setWrongQuestions}
              onScores={applySourceScore}
              onScoresPending={setSourceScorePending}
              scoreStore={sourceScoreStore}
              manualViewOverride={manualViewOverride}
              scoreSource={scoreSource} manualMode={manualMode}
              useManual={switchManual}
              setManualMode={mode => { setScoreSource(mode); setManualMode(mode); setScoreError(''); }}
              manualListening={manualListening} setManualListening={setManualListening}
              manualReading={manualReading} setManualReading={setManualReading}
              manualTotal={manualTotal} setManualTotal={setManualTotal}
              includePartDetails={includePartDetails} setIncludePartDetails={setIncludePartDetails}
              partDurations={partDurations} onPartDurationsChange={changePartDurations}
              date={date} setDate={setDate} duration={durationMinutes} setDuration={changeDurationMinutes} notes={notes} setNotes={setNotes} />
          )}
          {isPhone && sessionType === 'PART_PRACTICE' && (
            <PhonePracticeBody testName={testName} setTestName={setTestName} suggestions={uniqueTestNameSuggestions}
              rows={practiceRows} setRows={setPracticeRows} sessions={sessions ?? []} editingId={editingSession?.id}
              date={date} setDate={setDate} duration={durationMinutes} setDuration={changeDurationMinutes} notes={notes} setNotes={setNotes} />
          )}

          {sessionType === 'FULL_TEST' && timingCandidate && <ResultTimingReview candidate={timingCandidate} onChange={setTimingCandidate} onApply={applyImageTiming} onDiscard={discardImageTiming} />}
          {sessionType === 'FULL_TEST' && resultTiming && !timingCandidate && <div role="status" className="rde-note">
            Thời gian đã xác nhận từ ảnh{resultTiming.totalSeconds !== null ? `: ${formatElapsed(resultTiming.totalSeconds)}` : ' · chỉ có từng phần'}.
            <button type="button" onClick={() => setTimingCandidate(createTimingCandidate(resultTiming))} className="ml-2 min-h-9 font-bold underline">Kiểm tra / sửa thời gian</button>
            <button type="button" onClick={discardImageTiming} className="ml-2 min-h-9 font-bold text-slate-600 underline dark:text-slate-300">Bỏ qua thời gian</button>
          </div>}
          {sessionType === 'FULL_TEST' && !isPhone && (<>
          {/* General Info Row */}
          {(!aiDesktop || metaOpen) && <div className="rde grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            <div className={compactTop ? 'sm:col-span-12' : 'sm:col-span-6'}>
              <label htmlFor="session-test-name" className="rde-lab block">
                Tên đề
              </label>
              <TestNamePicker id="session-test-name" label="Tên đề" required={sessionType === 'FULL_TEST'}
                value={testName} onChange={setTestName} suggestions={uniqueTestNameSuggestions} />
            </div>
            <div className={compactTop ? 'hidden' : 'sm:col-span-3'}>
              <label htmlFor="session-date" className="rde-lab block">Ngày làm</label>
              <DateField
                id="session-date"
                required
                value={date}
                onChange={setDate}
                className="rde-in"
              />
            </div>
            <div className={compactTop ? 'hidden' : 'sm:col-span-3'}>
              <label htmlFor="session-duration" className="rde-lab block">Thời gian làm (phút)</label>
              <input
                id="session-duration"
                type="number"
                min="0.01"
                max="1440"
                step="any"
                required={!durationBlank}
                placeholder={durationBlank ? 'Chưa ghi' : undefined}
                value={durationBlank ? '' : durationMinutes}
                onChange={e => { changeDurationMinutes(Number(e.target.value)); if (e.target.value === '') markDurationEmpty(true); }}
                className="rde-in"
              />
            </div>
          </div>}

          {sessionType === 'FULL_TEST' && !isPhone && !fullTestManual && detailsOpen && (
            <div className="rde space-y-1">
              <label htmlFor="session-notes-details" className="rde-lab block">Ghi chú bài thi (tùy chọn)</label>
              <textarea id="session-notes-details" rows={2} value={notes} onChange={event => setNotes(event.target.value)}
                placeholder="VD: Làm lúc mệt, mất tập trung Part 7..."
                className="rde-in" />
            </div>
          )}
          {sessionType === 'FULL_TEST' && !isPhone && !fullTestManual && (!aiDesktop || metaOpen) && (
            <button type="button" onClick={() => { if (aiDesktop && detailsOpen) setMetaOpen(false); setDetailsOpen(open => !open); }} aria-expanded={detailsOpen}
              title="Đổi ngày, thêm thời lượng và ghi chú"
              className="rde-quiet -mt-1">
              {detailsOpen ? 'Ẩn chi tiết ▴' : `Ngày: ${date === getTodayDateString() ? 'Hôm nay' : date.split('-').reverse().join('/')} · giờ, ghi chú ▾`}
            </button>
          )}

          {isExistingTest && (
            <p className="rde-retest"><RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Làm lại · <b>Lần {nextAttemptNumber}</b> · cao nhất trước {bestPreviousScore}</span></p>
          )}

          {wrongEntry && (
            <DesktopFullTestBody key={restoredVersion} manualOpen={fullTestManual} onManualOpenChange={setFullTestManual}
              minimalOpen={manualMinimal} onMinimalOpenChange={setManualMinimal} onSections={changeSectionScores}
              knownMinutes={durationBlank ? undefined : durationMinutes} onOpenDetails={() => { setMetaOpen(true); setDetailsOpen(true); }}
              meta={{ name: testName, dateLabel: date === getTodayDateString() ? 'Hôm nay' : date.split('-').reverse().slice(0, 2).join('/'), onEdit: () => { setMetaOpen(true); setDetailsOpen(true); } }}
              wrong={wrongQuestions} onWrong={setWrongQuestions} preview={scorePreview}
              onTiming={readImageTiming}
              initialFiles={pendingInitialFiles}
              onInitialFilesHandled={() => setPendingInitialFiles(undefined)}
              numberDraft={wrongNumberDraft} onNumberDraft={setWrongNumberDraft}
              onScores={applySourceScore}
              onScoresPending={setSourceScorePending}
              scoreStore={sourceScoreStore}
              scoreSource={scoreSource}
              manualListening={manualListening}
              manualReading={manualReading}
              manualTotal={manualTotal}
              onRevertScore={revertSourceScore}
              onCounts={() => { setManualViewOverride(true); changeEntry('counts'); }}
              onOfficial={() => { setManualViewOverride(true); switchManual(true); }}
              notes={notes} setNotes={setNotes}
              partDurations={partDurations} onPartDurationsChange={changePartDurations} />
          )}

          {sessionType === 'FULL_TEST' && !wrongEntry && (
            <div className="rde space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => { setManualViewOverride(false); changeEntry('wrong'); }} className="rde-quiet">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Đánh dấu câu sai</span>
                </button>
                <div className="rde-seg" role="group" aria-label="Chế độ nhập">
                  <button type="button" aria-pressed={scoreSource === 'ESTIMATED'} onClick={() => { setScoreSource('ESTIMATED'); setEntry('counts'); }}>Số câu đúng mỗi Part</button>
                  <button type="button" aria-pressed={scoreSource !== 'ESTIMATED'} onClick={() => switchManual(true)}>Điểm chính thức</button>
                </div>
              </div>

              {scoreSource !== 'ESTIMATED' && <div className="rde-box space-y-3">
                <div className="rde-seg rde-seg--sm" role="group" aria-label="Cách nhập điểm trực tiếp">
                  {(['MANUAL_SECTIONS', 'MANUAL_TOTAL'] as const).map(mode => <button key={mode} type="button" aria-pressed={scoreSource === mode}
                    onClick={() => { setScoreSource(mode); setManualMode(mode); setScoreError(''); }}>
                    {mode === 'MANUAL_SECTIONS' ? 'Nghe + Đọc' : 'Chỉ tổng điểm'}
                  </button>)}
                </div>
                {scoreSource === 'MANUAL_SECTIONS' ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="rde-lab rde-lab--l">Điểm Nghe /495
                    <input type="number" min="5" max="495" step="5" required value={manualListening} onChange={event => setManualListening(event.target.value)} className="rde-in rde-in--big" />
                  </label>
                  <label className="rde-lab rde-lab--r">Điểm Đọc /495
                    <input type="number" min="5" max="495" step="5" required value={manualReading} onChange={event => setManualReading(event.target.value)} className="rde-in rde-in--big" />
                  </label>
                </div> : <label className="rde-lab">Tổng điểm /990
                  <input type="number" min="10" max="990" step="5" required value={manualTotal} onChange={event => setManualTotal(event.target.value)} className="rde-in rde-in--big" />
                </label>}
                <label className="rde-check">
                  <input type="checkbox" checked={includePartDetails} onChange={event => setIncludePartDetails(event.target.checked)} />
                  <span>Ghi thêm số câu đúng từng Part</span>
                </label>
              </div>}

              <div className="rde-score" aria-live="polite">
                <div>
                  <span className="rde-score-k">{scoreSource === 'ESTIMATED' ? 'Ước tính tham khảo' : 'Điểm từ đề'}</span>
                  <p className="rde-score-t"><b>{scorePreview?.totalScore ?? '—'}</b><small>/990</small></p>
                </div>
                <div className="rde-score-lr">
                  {([['Nghe', scorePreview?.scaledListening, scorePreview?.rawListening, 'l'], ['Đọc', scorePreview?.scaledReading, scorePreview?.rawReading, 'r']] as const).map(([label, scaled, raw, tone]) => (
                    <div key={label} className={'rde-bar rde-bar--' + tone}>
                      <span><b>{label}</b> {scaled ?? '—'}<small>{raw === undefined ? '' : ` · ${raw}/100 câu`}</small></span>
                      <i><em style={{ width: `${Math.min(100, ((scaled ?? 0) / 495) * 100)}%` }} /></i>
                    </div>
                  ))}
                </div>
              </div>

              {(scoreSource === 'ESTIMATED' || includePartDetails) && <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {([['Nghe', [1, 2, 3, 4], calculated.rawListening, 'l'], ['Đọc', [5, 6, 7], calculated.rawReading, 'r']] as const).map(([title, parts, raw, tone]) => (
                  <div key={title} className={'rde-parts rde-parts--' + tone}>
                    <p className="rde-parts-h"><span>{title}</span><span>{raw}/100 câu</span></p>
                    {parts.map(part => {
                      const key = `part${part}` as keyof LRPartScore;
                      return (
                        <div key={part} className="rde-part">
                          <b>P{part}</b>
                          <span>{PART_LABELS[part]}</span>
                          <input type="number" min="0" max={PART_MAX_QUESTIONS[key]} step="1" aria-label={`Số câu đúng Part ${part}`}
                            value={partScores[key]} onChange={event => handlePartScoreChange(key, parseInt(event.target.value))} className="rde-in rde-in--num" />
                          <small>/{PART_MAX_QUESTIONS[key]}</small>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>}
            </div>
          )}

          {/* Session Notes (the wrong-question layout keeps its own, folded) */}
          {!wrongEntry && <div className="rde">
            <label htmlFor="session-notes" className="rde-lab block">Ghi chú</label>
            <textarea id="session-notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)}
              placeholder="vd: Part 7 bài đọc đôi quản lý thời gian tốt hơn..." className="rde-in mt-1.5" />
          </div>}
          </>)}

          {sessionType === 'PART_PRACTICE' && !isPhone && (
            <DesktopPracticeBody key={restoredVersion} rows={practiceRows} setRows={setPracticeRows}
              testName={testName} setTestName={setTestName} suggestions={uniqueTestNameSuggestions}
              date={date} setDate={setDate} duration={durationMinutes} setDuration={changeDurationMinutes}
              notes={notes} setNotes={setNotes} today={getTodayDateString()}
              // Only details the learner actually wrote open the section; the Full Test name suggestion is cleared on switching tabs.
              initialDetailOpen={Boolean(editingSession?.testName || editingSession?.notes || notes.trim())} />
          )}

          {sessionType === 'VOCAB' && !isPhone && (
            <DesktopVocabBody count={vocabCount} setCount={setVocabCount} date={date} setDate={setDate} today={vocabToday} vocab={vocabApi} />
          )}

            </div>
            <ContainerScrollCue containerRef={formBodyRef} resetKey={`${sessionType}-${wrongEntry}`} />
          </div>
          <div className="rdl-foot shrink-0 space-y-2 bg-white">
          {/* Submit Button */}
          {scoreError && <p role="alert" className="rdl-err text-xs text-rose-600 dark:text-rose-400">{scoreError}</p>}
          {duplicateNotice}
          <div className="flex flex-wrap items-center justify-end gap-2 max-md:flex-nowrap">
            {/* Điện thoại: đã có nút X ở đầu form, nên bỏ "Hủy" để hai nút lưu đủ rộng */}
            <button
              type="button"
              onClick={closeWithDraft}
              className="rdl-cancel max-md:hidden mr-auto min-h-10 px-3 py-2 cursor-pointer"
            >
              Hủy
            </button>
            {!awaitingRead && sessionType !== 'VOCAB' && !wrongEntry && !duplicate && onAddMistakeForSession && (sessionType === 'FULL_TEST' || practiceRows.some(r => r.part >= 5)) && (
              <button
                type="submit"
                name="afterSave"
                value="mistake"
                className="rdl-second max-md:flex-1 cursor-pointer"
              >
                Lưu & thêm câu sai
              </button>
            )}
            {!awaitingRead && <button
              type="submit"
              name="afterSave" value={duplicate ? 'duplicate' : 'close'} data-primary
              className="rdl-save max-md:flex-1 max-md:justify-center flex items-center space-x-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{duplicate ? 'Vẫn lưu' : sessionType === 'VOCAB' ? (vocabApi.edit ? `Lưu ngày ${vocabDm}` : 'Lưu từ vựng') : isEditing ? 'Lưu thay đổi' : wrongEntry ? 'Lưu điểm' : 'Lưu kết quả'}</span>
            </button>}
          </div>
          </div>

        </form>

      </div>
    </div>
  );
};
