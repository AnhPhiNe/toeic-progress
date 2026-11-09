import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, 
  CheckCircle2, 
  Headphones, 
  BookOpen, 
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
import { computeSessionAttemptMap, getTodayDateString, loadMistakes, loadStudySessions } from '@/shared/data/storage';
import { collectTestNames, normalizeTestName, suggestNextTestName, testNameKey } from '@/shared/domain/testNames';
import { normalizeQuestionList, partScoresFromWrong } from '@/shared/domain/questionNumbers';
import { DesktopPracticeBody } from './DesktopPracticeBody';
import { DesktopVocabBody } from './DesktopVocabBody';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { resolveFullTestScore, scoreSourceForEditing, type ScoreSource } from '@/features/study-sessions/lib/fullTestScore';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneFullTestBody, PhonePracticeBody } from './PhoneSessionBody';
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

interface SessionLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSession: (session: StudySession, newMistakes?: MistakeEntry[]) => void;
  onSaveVocab: (date: string, count: number) => void;
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
}

const EMPTY_PART_SCORES: LRPartScore = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, part6: 0, part7: 0 };

export const SessionLoggerModal: React.FC<SessionLoggerModalProps> = ({
  isOpen,
  onClose,
  onSaveSession,
  onSaveVocab,
  sessions,
  prefill,
  editingSession,
  onUpdateSession,
  onAddMistakeForSession,
  onSavedFullTest
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
  const [vocabCount, setVocabCount] = useState(1);
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
  const [sourceScorePending, setSourceScorePending] = useState(false);
  const sourceScoreStore = useRef<ResultScoreDraft | null>(null);
  const draftOwner = useRef(getActiveAccountId());
  const savedSession = useRef(false);
  const [restoredVersion, setRestoredVersion] = useState(0);
  // Computer: "Bỏ nháp" clears the form at once and offers 8 seconds to undo instead of a confirm dialog.
  const [resetNonce, setResetNonce] = useState(0);
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
  useEffect(() => {
    if (!isOpen) { sourceScoreStore.current = null; setPendingInitialFiles(undefined); return; }
    draftOwner.current = getActiveAccountId();
    savedSession.current = false;
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
    setVocabCount(1);
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
    setPracticeRows(parts.length > 0 ? parts.map(p => ({ ...p })) : [{ part, correct: 0, total: PART_MAX_QUESTIONS[`part${part}`] }]);
  }, [isOpen, editingSession, prefill?.durationMinutes, prefill?.sessionType, prefill?.partNumber, prefill?.markWrong, prefill?.initialFiles, resetNonce]);

  // Switching tabs swaps the untouched default duration (Full Test 120, Part practice 30); a typed value stays.
  useEffect(() => {
    if (restoredType.current === sessionType) { restoredType.current = null; return; }
    restoredType.current = null;
    setSourceScorePending(false); sourceScoreStore.current = null;
    if (!durationEditedRef.current && sessionType === 'PART_PRACTICE') setDurationMinutes(current => current === 120 ? 30 : current);
    if (sessionType !== 'FULL_TEST') setTestName(current => current && current === suggestedName.current ? '' : current);
    if (sessionType === 'FULL_TEST') { if (!durationEditedRef.current) setDurationMinutes(current => current === 30 ? 120 : current); setManualViewOverride(false); }
  }, [sessionType]);

  const formDraft: SessionFormDraft = { sessionType, testName, date, durationMinutes, durationEdited, vocabCount, notes,
    scoreSource, manualMode, manualListening, manualReading, manualTotal, includePartDetails, entry, wrongQuestions,
    partScores, practiceRows, sourceScorePending, sourceScoreDraft: sourceScoreStore.current, originalUpdatedAt: editingSession?.updatedAt, wrongNumberDraft, partDurations, resultTiming, timingCandidate };
  const restoreFormDraft = (value: SessionFormDraft) => {
      restoredType.current = value.sessionType;
      setSessionType(value.sessionType); setTestName(value.testName); setDate(value.date); setDurationMinutes(value.durationMinutes);
      markDurationEdited(value.durationEdited || value.resultTiming?.totalSeconds != null);
      setVocabCount(value.vocabCount); setNotes(value.notes); setScoreSource(value.scoreSource); setManualMode(value.manualMode);
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
      || practiceRows.length > 1 || sourceScorePending || wrongNumberDraft.typing || Boolean(partDurations) || Boolean(timingCandidate || resultTiming) || vocabCount !== 1 || date !== getTodayDateString()
      || durationMinutes !== (prefill?.durationMinutes ?? (sessionType === 'PART_PRACTICE' ? 30 : 120)) || sessionType !== (prefill?.sessionType ?? 'FULL_TEST')),
    validate: input => {
      const value = parseSessionFormDraft(input);
      return value && value.originalUpdatedAt === editingSession?.updatedAt ? value : null;
    },
    restore: value => restoreFormDraft(value)
  });
  const discardDraft = () => {
    const snapshot = { ...formDraft, sourceScoreDraft: sourceScoreStore.current };
    if (!persistentDraft.clear()) return;
    setResetNonce(value => value + 1);
    setRestoredVersion(value => value + 1);
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
  const closeWithDraft = () => {
    if (!persistentDraft.persist() && !window.confirm('Chưa tự lưu được nháp. Đóng form sẽ mất nội dung đang nhập. Vẫn đóng?')) return;
    onClose();
  };
  const modalRef = useModalA11y(isOpen, closeWithDraft);
  const formBodyRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const wrongEntry = sessionType === 'FULL_TEST' && !manualViewOverride && entry === 'wrong';
  // Computer Full Test: hide date/duration until asked; show the duration empty ("Chưa ghi") until the learner types or an image sets it.
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (savedSession.current) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const addMistakeAfterSave = submitter instanceof HTMLButtonElement && submitter.value === 'mistake';
    try {
      if (draftOwner.current !== getActiveAccountId()) throw new Error('Tài khoản đã thay đổi. Nội dung đang nhập được giữ để bạn sao chép; hãy mở lại form trước khi lưu.');
      setScoreError('');

      if (sessionType === 'VOCAB') {
        onSaveVocab(date, vocabCount);
        savedSession.current = true;
        persistentDraft.clear();
        onClose();
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
        if (wrongEntry && scoreSource === 'ESTIMATED' && !finalWrong.length && !window.confirm('Bạn không sai câu nào? Đề sẽ được lưu 990 điểm.')) return;
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
          ...(entry === 'wrong' && (wrongEntry || finalWrong.length > 0) ? { wrongQuestions: normalizeQuestionList(finalWrong) } : {}),
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

      if (editingSession && onUpdateSession) {
        onUpdateSession(newSession, editingSession);
      } else {
        onSaveSession(newSession);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto max-md:items-stretch max-md:p-0 max-md:overflow-hidden animate-backdrop">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-logger-title"
        tabIndex={-1}
        className={`relative w-full ${wrongEntry && !isPhone ? (fullTestManual ? 'max-w-[1100px]' : 'max-w-[600px]') : 'max-w-3xl'} my-4 rounded-3xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-200 shadow-[6px_6px_0_0_#0f172a] dark:shadow-[6px_6px_0_0_#cbd5e1] overflow-hidden flex flex-col max-h-[92vh] max-md:my-0 max-md:h-[100dvh] max-md:max-h-none max-md:rounded-none max-md:border-0 max-md:shadow-none animate-sheet-up sm:animate-modal-pop`}>
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-3.5 max-md:px-4 max-md:py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121A2B]">
          <div className="flex items-center space-x-3">
            <div>
              <h2 id="session-logger-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{sessionType === 'VOCAB' ? 'Ghi từ vựng' : isEditing ? 'Sửa kết quả' : 'Ghi điểm'}</h2>
            </div>
          </div>
          <button
            onClick={closeWithDraft}
            aria-label="Đóng form ghi nhận buổi học"
            className="p-1.5 max-md:p-2.5 max-md:-mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {persistentDraft.state === 'restored' && isPhone && (
          <div className="flex shrink-0 items-center justify-end px-4 py-1.5 sm:px-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-100/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-2xs dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-300">
              <span role="status">📝 Đã khôi phục bản nháp trên thiết bị này</span>
              <button
                type="button"
                className="font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 pl-2 border-l border-slate-300 dark:border-slate-700 cursor-pointer"
                onClick={() => {
                  if (window.confirm('Xóa bản nháp đang nhập và đóng form? Kết quả đã lưu không bị ảnh hưởng.') && persistentDraft.clear()) onClose();
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
          const primary = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"][value="close"]');
          if (primary) event.currentTarget.requestSubmit(primary);
        }} className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 flex flex-col">
            <div ref={formBodyRef} className={`min-h-0 flex-1 ${wrongEntry && !isPhone ? 'space-y-3 p-4 sm:px-5 sm:py-3.5' : 'space-y-4 p-5'} overflow-y-auto max-md:p-4`}>
          
          {/* Mode Switcher: computers use the Neo segmented bar (2px ink frame, selected cell tinted); phones keep the soft tabs */}
          <div className={isPhone
            ? `grid ${isEditing ? 'grid-cols-2' : 'grid-cols-3'} gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800`
            : `grid ${isEditing ? 'grid-cols-2' : 'grid-cols-3'} overflow-hidden rounded-xl border-2 border-slate-900 dark:border-slate-300`}>
            {([['FULL_TEST', 'Full Test'], ['PART_PRACTICE', 'Luyện Part'], ['VOCAB', 'Từ vựng']] as const)
              .filter(([type]) => !(isEditing && type === 'VOCAB'))
              .map(([type, label], index) => {
                const on = sessionType === type;
                const phoneOn = type === 'PART_PRACTICE' ? 'text-amber-600 dark:text-amber-300' : 'text-blue-600 dark:text-blue-300';
                return (
                  <button key={type} type="button" onClick={() => setSessionType(type)} aria-pressed={on}
                    className={isPhone
                      ? `py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center cursor-pointer ${on ? `bg-white dark:bg-slate-800 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold ${phoneOn}` : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`
                      : `py-2 text-[13px] font-extrabold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${index > 0 ? 'border-l-2 border-slate-900 dark:border-slate-300' : ''} ${on ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100' : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-[#121A2B] dark:text-slate-300 dark:hover:bg-slate-800'}`}>
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
          {sessionType === 'FULL_TEST' && resultTiming && !timingCandidate && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
            Thời gian đã xác nhận từ ảnh{resultTiming.totalSeconds !== null ? `: ${formatElapsed(resultTiming.totalSeconds)}` : ' · chỉ có từng phần'}.
            <button type="button" onClick={() => setTimingCandidate(createTimingCandidate(resultTiming))} className="ml-2 min-h-9 font-bold underline">Kiểm tra / sửa thời gian</button>
            <button type="button" onClick={discardImageTiming} className="ml-2 min-h-9 font-bold text-slate-600 underline dark:text-slate-300">Bỏ qua thời gian</button>
          </div>}
          {sessionType === 'FULL_TEST' && !isPhone && (<>
          {/* General Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            <div className={compactTop ? 'sm:col-span-12' : 'sm:col-span-6'}>
              <label htmlFor="session-test-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên đề
              </label>
              <TestNamePicker id="session-test-name" label="Tên đề" required={sessionType === 'FULL_TEST'}
                value={testName} onChange={setTestName} suggestions={uniqueTestNameSuggestions} />
            </div>
            <div className={compactTop ? 'hidden' : 'sm:col-span-3'}>
              <label htmlFor="session-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày làm</label>
              <input
                id="session-date"
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border-2 border-slate-900 dark:border-slate-300 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-[3px] focus:ring-blue-300 dark:focus:ring-blue-700"
              />
            </div>
            <div className={compactTop ? 'hidden' : 'sm:col-span-3'}>
              <label htmlFor="session-duration" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời gian làm (phút)</label>
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
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border-2 border-slate-900 dark:border-slate-300 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-[3px] focus:ring-blue-300 dark:focus:ring-blue-700"
              />
            </div>
          </div>

          {sessionType === 'FULL_TEST' && !isPhone && !fullTestManual && detailsOpen && (
            <div className="space-y-1">
              <label htmlFor="session-notes-details" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Ghi chú bài thi (tùy chọn)</label>
              <textarea id="session-notes-details" rows={2} value={notes} onChange={event => setNotes(event.target.value)}
                placeholder="VD: Làm lúc mệt, mất tập trung Part 7..."
                className="w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-blue-300 dark:border-slate-300 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-700" />
            </div>
          )}
          {sessionType === 'FULL_TEST' && !isPhone && !fullTestManual && (
            <button type="button" onClick={() => setDetailsOpen(open => !open)} aria-expanded={detailsOpen}
              title="Đổi ngày, thêm thời lượng và ghi chú"
              className="-mt-1 w-fit cursor-pointer rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-[13px] font-black text-slate-800 hover:bg-slate-50 active:translate-x-px active:translate-y-px dark:border-slate-300 dark:bg-slate-900 dark:text-slate-100">
              {detailsOpen ? 'Ẩn chi tiết ▴' : `Ngày: ${date === getTodayDateString() ? 'Hôm nay' : date.split('-').reverse().join('/')} · giờ, ghi chú ▾`}
            </button>
          )}

          {/* Smart Retest Detection Alert */}
          {isExistingTest && (
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/60 text-xs text-purple-950 dark:text-purple-200 flex items-start gap-2.5 shadow-2xs animate-fade-in">
              <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-purple-900 dark:text-purple-100">
                  Phát hiện đề thi làm lại (Retest):{' '}
                </span>
                Bạn đã làm đề này <strong>{previousAttemptsForTest.length} lần</strong> (Điểm cao nhất: <strong>{bestPreviousScore}đ</strong>). Buổi thi này sẽ tự động ghi nhận là{' '}
                <span className="px-1.5 py-0.5 rounded font-black bg-purple-200/80 dark:bg-purple-900/80 text-purple-800 dark:text-purple-200">
                  Lần {nextAttemptNumber}
                </span>{' '}
                để đo lường mức độ bứt phá!
              </div>
            </div>
          )}

          {wrongEntry && (
            <DesktopFullTestBody key={restoredVersion} manualOpen={fullTestManual} onManualOpenChange={setFullTestManual}
              minimalOpen={manualMinimal} onMinimalOpenChange={setManualMinimal} onSections={changeSectionScores}
              knownMinutes={durationBlank ? undefined : durationMinutes} onOpenDetails={() => setDetailsOpen(true)}
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

          {/* FULL TEST MODE */}
          {sessionType === 'FULL_TEST' && !wrongEntry && (
            <div className="space-y-4">
              {/* Header thanh điều hướng: Nút Quay về Lưới 200 câu & Chuyển đổi chế độ */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] p-3 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C]">
                <button
                  type="button"
                  onClick={() => {
                    setManualViewOverride(false);
                    changeEntry('wrong');
                  }}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-900 bg-white px-3.5 py-2 text-xs font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] hover:bg-slate-100 active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-400 dark:bg-slate-900 dark:text-white transition-all"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Đánh dấu câu sai</span>
                </button>

                <div className="flex items-center gap-1.5" role="group" aria-label="Chế độ nhập">
                  <button
                    type="button"
                    onClick={() => {
                      setScoreSource('ESTIMATED');
                      setEntry('counts');
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition-all cursor-pointer ${
                      scoreSource === 'ESTIMATED'
                        ? 'border-2 border-slate-900 bg-amber-400 text-slate-950 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300'
                        : 'border border-slate-300 bg-white text-slate-600 hover:text-slate-950 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Số câu đúng mỗi Part
                  </button>
                  <button
                    type="button"
                    onClick={() => switchManual(true)}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition-all cursor-pointer ${
                      scoreSource !== 'ESTIMATED'
                        ? 'border-2 border-slate-900 bg-amber-400 text-slate-950 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300'
                        : 'border border-slate-300 bg-white text-slate-600 hover:text-slate-950 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Điểm chính thức
                  </button>
                </div>

              </div>

              {scoreSource !== 'ESTIMATED' && <div className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-700">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Cách nhập điểm trực tiếp">
                  {(['MANUAL_SECTIONS','MANUAL_TOTAL'] as const).map(mode => <button key={mode} type="button" aria-pressed={scoreSource === mode}
                    onClick={() => { setScoreSource(mode); setManualMode(mode); setScoreError(''); }}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${scoreSource === mode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {mode === 'MANUAL_SECTIONS' ? 'Listening + Reading' : 'Chỉ tổng điểm'}
                  </button>)}
                </div>
                {scoreSource === 'MANUAL_SECTIONS' ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Điểm Listening /495
                    <input type="number" min="5" max="495" step="5" required value={manualListening} onChange={event => setManualListening(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </label>
                  <label className="text-xs font-semibold text-teal-700 dark:text-teal-300">Điểm Reading /495
                    <input type="number" min="5" max="495" step="5" required value={manualReading} onChange={event => setManualReading(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </label>
                </div> : <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Tổng điểm TOEIC /990
                  <input type="number" min="10" max="990" step="5" required value={manualTotal} onChange={event => setManualTotal(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                </label>}
                <p className="text-xs text-slate-500 dark:text-slate-400">L/R: 5–495, tổng: 10–990; theo bước 5 điểm. Điểm nhập được dùng cho lịch sử và biểu đồ. Chỉ nhập tổng thì không suy ra điểm từng kỹ năng.</p>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={includePartDetails} onChange={event => setIncludePartDetails(event.target.checked)} />
                  Ghi thêm số câu đúng từng Part để phân tích
                </label>
              </div>}
              
              {/* Live ETS Score Conversion Banner */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                    {scoreSource === 'ESTIMATED' ? 'Ước tính tham khảo' : 'Điểm nhập từ kết quả đề'}
                  </span>
                  <div className="flex items-baseline space-x-2 mt-0.5">
                    <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
                      {scorePreview?.totalScore ?? '—'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">/ 990 điểm</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xs font-semibold">
                  <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-cyan-600 dark:text-cyan-400 block font-bold">Listening: {scorePreview?.scaledListening ?? '—'}</span>
                    <span className="text-[10px] text-slate-400">{scorePreview?.rawListening === undefined ? 'Chưa ghi số câu' : `(${scorePreview.rawListening}/100 câu)`}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-emerald-600 dark:text-emerald-400 block font-bold">Reading: {scorePreview?.scaledReading ?? '—'}</span>
                    <span className="text-[10px] text-slate-400">{scorePreview?.rawReading === undefined ? 'Chưa ghi số câu' : `(${scorePreview.rawReading}/100 câu)`}</span>
                  </div>
                </div>
              </div>
              {scoreSource === 'ESTIMATED' && <p className="text-xs text-slate-500 dark:text-slate-400">Ước tính mới dùng cận dưới khoảng tham khảo IIBC 2023; đúng 100/100 quy ước 495đ mỗi kỹ năng. Chưa hiệu chuẩn cho đề của bạn. Bản ghi cũ giữ điểm khi số câu không đổi. Nếu đề có bảng điểm hoặc kết quả sẵn, hãy nhập trực tiếp.</p>}

              {/* Part 1-7 Inputs Grid */}
              {(scoreSource === 'ESTIMATED' || includePartDetails) && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Listening Column */}
                <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
                    <div className="flex items-center space-x-1.5 text-cyan-600 dark:text-cyan-400 font-bold text-xs">
                      <Headphones className="w-4 h-4" />
                      <span>LISTENING (100 CÂU)</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Đúng: {calculated.rawListening}/100
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {/* Part 1 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 1: Mô tả tranh</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part1 / PART_MAX_QUESTIONS.part1) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part1}
                          aria-label="Số câu đúng Part 1"
                          step="1"
                          value={partScores.part1}
                          onChange={e => handlePartScoreChange('part1', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part1}</span>
                      </div>
                    </div>

                    {/* Part 2 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 2: Hỏi & Đáp</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part2 / PART_MAX_QUESTIONS.part2) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part2}
                          aria-label="Số câu đúng Part 2"
                          step="1"
                          value={partScores.part2}
                          onChange={e => handlePartScoreChange('part2', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part2}</span>
                      </div>
                    </div>

                    {/* Part 3 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 3: Hội thoại</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part3 / PART_MAX_QUESTIONS.part3) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part3}
                          aria-label="Số câu đúng Part 3"
                          step="1"
                          value={partScores.part3}
                          onChange={e => handlePartScoreChange('part3', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part3}</span>
                      </div>
                    </div>

                    {/* Part 4 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 4: Bài nói</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part4 / PART_MAX_QUESTIONS.part4) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part4}
                          aria-label="Số câu đúng Part 4"
                          step="1"
                          value={partScores.part4}
                          onChange={e => handlePartScoreChange('part4', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part4}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reading Column */}
                <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
                    <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <BookOpen className="w-4 h-4" />
                      <span>READING (100 CÂU)</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Đúng: {calculated.rawReading}/100
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {/* Part 5 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 5: Điền câu</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part5 / PART_MAX_QUESTIONS.part5) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part5}
                          aria-label="Số câu đúng Part 5"
                          step="1"
                          value={partScores.part5}
                          onChange={e => handlePartScoreChange('part5', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part5}</span>
                      </div>
                    </div>

                    {/* Part 6 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 6: Điền đoạn văn</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part6 / PART_MAX_QUESTIONS.part6) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part6}
                          aria-label="Số câu đúng Part 6"
                          step="1"
                          value={partScores.part6}
                          onChange={e => handlePartScoreChange('part6', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part6}</span>
                      </div>
                    </div>

                    {/* Part 7 */}
                    <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">Part 7: Đọc hiểu</span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {Math.round((partScores.part7 / PART_MAX_QUESTIONS.part7) * 100)}% chính xác
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="0"
                          max={PART_MAX_QUESTIONS.part7}
                          aria-label="Số câu đúng Part 7"
                          step="1"
                          value={partScores.part7}
                          onChange={e => handlePartScoreChange('part7', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part7}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>}

            </div>
          )}

          {/* Session Notes (the wrong-question layout keeps its own, folded) */}
          {!wrongEntry && <div>
            <label htmlFor="session-notes" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi Chú Buổi Học
            </label>
            <textarea
              id="session-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="vd: Part 7 bài đọc đôi quản lý thời gian tốt hơn..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
            />
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
            <DesktopVocabBody count={vocabCount} setCount={setVocabCount} date={date} setDate={setDate} today={getTodayDateString()} />
          )}

          {sessionType === 'VOCAB' && isPhone && (
            <div className="space-y-3.5 rounded-2xl border-[1.5px] border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Ngày học
                  <input type="date" required max={getTodayDateString()} value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Số từ đã học
                  <input type="number" min="1" step="1" required value={vocabCount} onChange={e => setVocabCount(Number(e.target.value))} className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-black text-blue-600 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400" />
                </label>
              </div>
              <div className="space-y-1.5">
                <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">Chọn nhanh số từ hôm nay:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 20, 30, 50].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVocabCount(preset)}
                      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs tabular-nums transition ${
                        vocabCount === preset
                          ? 'border-2 border-slate-900 bg-blue-600 font-black text-white shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-200'
                          : 'border border-slate-300 bg-white font-bold text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                      }`}
                    >
                      +{preset} từ
                    </button>
                  ))}
                </div>
              </div>
              <p className="border-t border-slate-200/80 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">Ghi riêng theo ngày; không tạo buổi thi hay cộng điểm TOEIC.</p>
            </div>
          )}

            </div>
            <ContainerScrollCue containerRef={formBodyRef} resetKey={`${sessionType}-${wrongEntry}`} />
          </div>
          <div className="shrink-0 space-y-2 border-t-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-[#121A2B] px-4 py-2.5 sm:px-6 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Submit Button */}
          {scoreError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{scoreError}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 max-md:flex-nowrap">
            {/* Điện thoại: đã có nút X ở đầu form, nên bỏ "Hủy" để hai nút lưu đủ rộng */}
            <button
              type="button"
              onClick={closeWithDraft}
              className="max-md:hidden mr-auto min-h-10 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Hủy
            </button>
            {sessionType !== 'VOCAB' && !wrongEntry && onAddMistakeForSession && (sessionType === 'FULL_TEST' || practiceRows.some(r => r.part >= 5)) && (
              <button
                type="submit"
                name="afterSave"
                value="mistake"
                className="min-h-10 max-md:min-h-12 max-md:flex-1 max-md:text-sm rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                Lưu & thêm câu sai
              </button>
            )}
            <button
              type="submit"
              name="afterSave" value="close"
              className="min-h-10 max-md:min-h-12 max-md:flex-1 max-md:text-sm max-md:justify-center px-4 py-2 rounded-xl border-2 border-slate-900 dark:border-slate-200 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-[3px_3px_0_0_#0f172a] dark:shadow-none flex items-center space-x-1.5 transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{sessionType === 'VOCAB' ? 'Lưu từ vựng' : isEditing ? 'Lưu thay đổi' : wrongEntry ? 'Lưu điểm' : 'Lưu kết quả'}</span>
            </button>
          </div>
          </div>

        </form>

      </div>
    </div>
  );
};
