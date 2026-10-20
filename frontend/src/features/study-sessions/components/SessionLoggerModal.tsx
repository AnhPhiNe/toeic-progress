import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, 
  CheckCircle2, 
  Headphones, 
  BookOpen, 
  Zap, 
  Plus, 
  Trash2,
  RotateCcw
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
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { resolveFullTestScore, scoreSourceForEditing, type ScoreSource } from '@/features/study-sessions/lib/fullTestScore';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PhoneFullTestBody, PhonePracticeBody, PhoneSavedResult } from './PhoneSessionBody';
import { DesktopFullTestBody } from './DesktopFullTestBody';
import { draftQuestions } from '@/features/mistakes/lib/mistakeDrafts';

interface SessionLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSession: (session: StudySession, newMistakes?: MistakeEntry[]) => void;
  onSaveVocab: (date: string, count: number) => void;
  sessions?: StudySession[];
  /** Giá trị điền sẵn khi form được mở từ Bộ đếm nhịp hoặc trang Phân tích (SPEC 4.3) */
  prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number };
  /**
   * Có giá trị = chế độ SỬA: form nạp sẵn buổi học này, lưu thì thay thế
   * bản ghi cũ (giữ nguyên id và createdAt) qua onUpdateSession.
   */
  editingSession?: StudySession | null;
  onUpdateSession?: (session: StudySession, original: StudySession, newMistakes?: MistakeEntry[]) => void;
  onAddMistakeForSession?: (session: StudySession) => void;
  /** After a test is logged by its wrong questions: open those draft cards. */
  onOpenSessionDrafts?: (session: StudySession) => void;
  /** Computers: the form closes after such a save and the app offers the detail flow in a note. */
  onSavedWrongTest?: (session: StudySession) => void;
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
  onOpenSessionDrafts,
  onSavedWrongTest
}) => {
  const isEditing = !!editingSession;
  // Phones get a shorter form built from the same state; tablet and desktop keep the full layout.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [sessionType, setSessionType] = useState<'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'>('FULL_TEST');
  const [testName, setTestName] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [vocabCount, setVocabCount] = useState(1);

  const [notes, setNotes] = useState('');
  const [scoreSource, setScoreSource] = useState<ScoreSource>('ESTIMATED');
  const [manualMode, setManualMode] = useState<'MANUAL_SECTIONS' | 'MANUAL_TOTAL'>('MANUAL_SECTIONS');
  const [manualListening, setManualListening] = useState('');
  const [manualReading, setManualReading] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [includePartDetails, setIncludePartDetails] = useState(true);
  // A Full Test is logged by its wrong questions; per-Part counts and official scores stay as alternatives.
  const [entry, setEntry] = useState<'wrong' | 'counts'>('wrong');
  const [wrongQuestions, setWrongQuestions] = useState<number[]>([]);
  const [savedResult, setSavedResult] = useState<StudySession | null>(null);
  const suggestedName = useRef('');
  const [scoreError, setScoreError] = useState('');
  const draftOwner = useRef(getActiveAccountId());
  const savedSession = useRef(false);

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

  const practiceTotals = practiceRows.reduce(
    (acc, r) => ({ correct: acc.correct + (r.correct || 0), total: acc.total + (r.total || 0) }),
    { correct: 0, total: 0 }
  );
  const practiceAccuracy = practiceTotals.total > 0
    ? Math.round((practiceTotals.correct / practiceTotals.total) * 100)
    : 0;

  const updatePracticeRow = (index: number, patch: Partial<PracticePartResult>) => {
    setPracticeRows(prev => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      // Số câu đúng không bao giờ vượt quá số câu đã làm
      if (next.correct > next.total) next.correct = next.total;
      return next;
    }));
  };

  const addPracticeRow = () => {
    const used = new Set(practiceRows.map(r => r.part));
    const nextPart = ([1, 2, 3, 4, 5, 6, 7] as const).find(p => !used.has(p)) || 5;
    setPracticeRows(prev => [...prev, { part: nextPart, correct: 0, total: PART_MAX_QUESTIONS[`part${nextPart}` as keyof typeof PART_MAX_QUESTIONS] }]);
  };

  const removePracticeRow = (index: number) => {
    setPracticeRows(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  /**
   * Nạp lại form MỖI LẦN mở. Component không bị gỡ khi đóng (chỉ trả null),
   * nên trước đây lần mở sau còn nguyên số của lần nhập trước - và với chế
   * độ sửa, sửa xong rồi bấm "Nhập điểm" sẽ thấy dữ liệu của buổi vừa sửa.
   */
  useEffect(() => {
    if (!isOpen) return;
    draftOwner.current = getActiveAccountId();
    savedSession.current = false;
    const e = editingSession;
    setSessionType(e?.sessionType ?? prefill?.sessionType ?? 'FULL_TEST');
    // A new Full Test on a phone starts with the next numbered test after the latest one (Test 3 -> Test 4).
    const phone = typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
    suggestedName.current = !e && phone && (prefill?.sessionType ?? 'FULL_TEST') === 'FULL_TEST' ? suggestNextTestName(loadStudySessions()) : '';
    setTestName(e?.testName ?? suggestedName.current);
    setEntry(e?.partScores && !e.wrongQuestions ? 'counts' : 'wrong');
    setWrongQuestions(e?.wrongQuestions ? [...e.wrongQuestions] : []);
    setSavedResult(null);
    setDate(e?.date ?? getTodayDateString());
    // Bộ đếm nhịp truyền sang thời gian THẬT đã dùng - ghi đè mặc định 120 phút
    setDurationMinutes(e?.durationMinutes ?? prefill?.durationMinutes ?? (prefill?.sessionType === 'PART_PRACTICE' ? 30 : 120));
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
    const requestedPart = prefill?.partNumber;
    const part = typeof requestedPart === 'number' && Number.isInteger(requestedPart) && requestedPart >= 1 && requestedPart <= 7 ? requestedPart as PracticePartResult['part'] : 5;
    setPracticeRows(parts.length > 0 ? parts.map(p => ({ ...p })) : [{ part, correct: 0, total: PART_MAX_QUESTIONS[`part${part}`] }]);
  }, [isOpen, editingSession, prefill?.durationMinutes, prefill?.sessionType, prefill?.partNumber]);

  // Switching tabs swaps the untouched default duration (Full Test 120, Part practice 30); a typed value stays.
  useEffect(() => {
    if (sessionType === 'PART_PRACTICE') setDurationMinutes(current => current === 120 ? 30 : current);
    if (sessionType !== 'FULL_TEST') setTestName(current => current && current === suggestedName.current ? '' : current);
    if (sessionType === 'FULL_TEST') setDurationMinutes(current => current === 30 ? 120 : current);
  }, [sessionType]);

  const modalRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const wrongEntry = sessionType === 'FULL_TEST' && scoreSource === 'ESTIMATED' && entry === 'wrong';
  const effectiveParts = wrongEntry ? partScoresFromWrong(wrongQuestions) : partScores;
  // Tính điểm trực tiếp từ partScores
  const calculated = calculateFromPartScores(effectiveParts);
  const resolveScores = () => resolveFullTestScore({
    previous: editingSession,
    source: scoreSource,
    partScores: scoreSource === 'ESTIMATED' || includePartDetails ? effectiveParts : undefined,
    listening: manualListening.trim() ? Number(manualListening) : undefined,
    reading: manualReading.trim() ? Number(manualReading) : undefined,
    total: manualTotal.trim() ? Number(manualTotal) : undefined
  });
  let scorePreview: ReturnType<typeof resolveFullTestScore> | null = null;
  try { scorePreview = resolveScores(); } catch { /* Incomplete manual fields stay empty in the preview. */ }

  const changeEntry = (mode: 'wrong' | 'counts') => {
    if (mode === 'counts') setPartScores(wrongQuestions.length ? partScoresFromWrong(wrongQuestions) : { ...EMPTY_PART_SCORES });
    setEntry(mode);
  };
  // Official scores keep the marked questions as per-Part detail.
  const switchManual = (on: boolean) => {
    setScoreSource(on ? manualMode : 'ESTIMATED');
    if (on && entry === 'wrong') { setPartScores(wrongQuestions.length ? effectiveParts : { ...EMPTY_PART_SCORES }); setIncludePartDetails(wrongQuestions.length > 0); }
    else if (on) setIncludePartDetails(Object.values(partScores).some(count => count > 0));
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
        onClose();
        return;
      }

      const sessionId = editingSession?.id ?? `session-${Date.now()}`;
      const createdAt = editingSession?.createdAt ?? new Date().toISOString();
      let newSession: StudySession;

      if (sessionType === 'FULL_TEST') {
        if (wrongEntry && !wrongQuestions.length && !window.confirm('Bạn không sai câu nào? Đề sẽ được lưu 990 điểm.')) return;
        let resolved: ReturnType<typeof resolveFullTestScore>;
        try { resolved = resolveScores(); setScoreError(''); }
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
          durationMinutes: Number(durationMinutes) || 120,
          ...resolved,
          ...(wrongEntry ? { wrongQuestions: normalizeQuestionList(wrongQuestions) } : {}),
          notes,
          createdAt
        };
      } else {
        const cleanRows = practiceRows.filter(r => r.total > 0);
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
      // Only Reading questions become notebook cards, so a test with no Reading mistakes has nothing to fill in.
      if (!isEditing && draftQuestions(newSession).length) {
        if (isPhone || !onSavedWrongTest) { setSavedResult(newSession); return; }
        onClose();
        onSavedWrongTest(newSession);
        return;
      }
      onClose();
      if (addMistakeAfterSave) onAddMistakeForSession?.(newSession);
    } catch (reason) {
      setScoreError(reason instanceof Error ? reason.message : 'Chưa lưu được buổi học. Nội dung đang nhập vẫn được giữ.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto max-md:items-stretch max-md:p-0 max-md:overflow-hidden">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-logger-title"
        tabIndex={-1}
        className={`relative w-full ${wrongEntry && !isPhone && !savedResult ? 'max-w-[1080px]' : 'max-w-3xl'} my-8 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] max-md:my-0 max-md:h-[100dvh] max-md:max-h-none max-md:rounded-none max-md:border-0 max-md:shadow-none`}>
        
        {/* Header Modal */}
        <div className="flex items-center justify-between p-5 max-md:px-4 max-md:py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="max-md:hidden p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 id="session-logger-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{isPhone
                ? (savedResult ? 'Đã lưu' : sessionType === 'VOCAB' ? 'Ghi từ vựng' : isEditing ? 'Sửa kết quả' : 'Ghi điểm')
                : (sessionType === 'VOCAB' ? 'Ghi Số Từ Vựng Đã Học' : isEditing ? 'Sửa Buổi Học' : 'Ghi Nhận Kết Quả Buổi Học')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-md:hidden">
                {sessionType === 'VOCAB' ? 'Theo dõi riêng theo ngày và giữ chuỗi học' : isEditing ? 'Giữ điểm đã nhập hoặc đổi cách ghi điểm · không ảnh hưởng Streak' : 'Ước tính tham khảo hoặc nhập điểm từ kết quả đề'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng form ghi nhận buổi học"
            className="p-1.5 max-md:p-2.5 max-md:-mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Content */}
        {savedResult ? <PhoneSavedResult session={savedResult} onClose={onClose} onDetails={() => { onClose(); onOpenSessionDrafts?.(savedResult); }} />
        : <form onSubmit={handleSubmit} onKeyDown={event => {
          if (event.key !== 'Enter' || event.defaultPrevented || !(event.target instanceof HTMLInputElement)) return;
          event.preventDefault();
          const primary = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"][value="close"]');
          if (primary) event.currentTarget.requestSubmit(primary);
        }} className="flex min-h-0 flex-1 flex-col">
          <div className={`min-h-0 flex-1 ${wrongEntry && !isPhone ? 'space-y-4 p-5' : 'space-y-5 p-5 sm:p-6'} overflow-y-auto max-md:p-4`}>
          
          {/* Mode Switcher */}
          <div className={`grid ${isEditing ? 'grid-cols-2' : 'grid-cols-3'} gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800`}>
            <button
              type="button"
              onClick={() => setSessionType('FULL_TEST')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center space-x-2 cursor-pointer ${
                sessionType === 'FULL_TEST'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="md:hidden">Full Test</span><span className="hidden md:inline">Full Test (200 Câu chuẩn ETS)</span>
            </button>
            <button
              type="button"
              onClick={() => setSessionType('PART_PRACTICE')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center space-x-2 cursor-pointer ${
                sessionType === 'PART_PRACTICE'
                  ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="md:hidden">Luyện Part</span><span className="hidden md:inline">Luyện Từng Part Lẻ (Mini Practice)</span>
            </button>
            {!isEditing && (
              <button type="button" onClick={() => setSessionType('VOCAB')}
                className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${sessionType === 'VOCAB' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                Từ vựng
              </button>
            )}
          </div>

          {isPhone && sessionType === 'FULL_TEST' && (
            <PhoneFullTestBody testName={testName} setTestName={setTestName} suggestions={uniqueTestNameSuggestions}
              retest={isExistingTest ? { attempt: nextAttemptNumber, best: bestPreviousScore } : undefined}
              partScores={effectiveParts} onPart={handlePartScoreChange} preview={scorePreview}
              entry={entry} onEntry={changeEntry}
              wrongQuestions={wrongQuestions} onWrong={setWrongQuestions}
              scoreSource={scoreSource} manualMode={manualMode}
              useManual={switchManual}
              setManualMode={mode => { setScoreSource(mode); setManualMode(mode); setScoreError(''); }}
              manualListening={manualListening} setManualListening={setManualListening}
              manualReading={manualReading} setManualReading={setManualReading}
              manualTotal={manualTotal} setManualTotal={setManualTotal}
              includePartDetails={includePartDetails} setIncludePartDetails={setIncludePartDetails}
              date={date} setDate={setDate} duration={durationMinutes} setDuration={setDurationMinutes} notes={notes} setNotes={setNotes} />
          )}
          {isPhone && sessionType === 'PART_PRACTICE' && (
            <PhonePracticeBody testName={testName} setTestName={setTestName} suggestions={uniqueTestNameSuggestions}
              rows={practiceRows} setRows={setPracticeRows} sessions={sessions ?? []} editingId={editingSession?.id}
              date={date} setDate={setDate} duration={durationMinutes} setDuration={setDurationMinutes} notes={notes} setNotes={setNotes} />
          )}

          {sessionType !== 'VOCAB' && !isPhone && (<>
          {/* General Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="session-test-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên Đề Thi / Nguồn
                {sessionType === 'PART_PRACTICE' && (
                  <span className="font-normal text-slate-400 dark:text-slate-500"> (không bắt buộc)</span>
                )}
              </label>
              <TestNamePicker id="session-test-name" label="Tên Đề Thi / Nguồn" required={sessionType === 'FULL_TEST'}
                value={testName} onChange={setTestName} suggestions={uniqueTestNameSuggestions} />
            </div>
            <div>
              <label htmlFor="session-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày Luyện Đề</label>
              <input
                id="session-date"
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
            <div>
              <label htmlFor="session-duration" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời Gian Làm (Phút)</label>
              <input
                id="session-duration"
                type="number"
                min="5"
                max="240"
                required
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
          </div>

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
            <DesktopFullTestBody wrong={wrongQuestions} onWrong={setWrongQuestions} preview={scorePreview}
              onCounts={() => changeEntry('counts')} onOfficial={() => switchManual(true)} notes={notes} setNotes={setNotes} />
          )}

          {/* FULL TEST MODE */}
          {sessionType === 'FULL_TEST' && !wrongEntry && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={scoreSource !== 'ESTIMATED'} onChange={event => switchManual(event.target.checked)} />
                  Nhập điểm từ kết quả đề (tùy chọn)
                </label>
                {scoreSource === 'ESTIMATED' && <button type="button" onClick={() => changeEntry('wrong')}
                  className="cursor-pointer text-sm font-bold text-blue-700 dark:text-blue-300">Đánh dấu câu sai</button>}
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

          {/* PART PRACTICE MODE */}
          {sessionType === 'PART_PRACTICE' && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Các Part Đã Luyện
                </span>
                {practiceTotals.total > 0 && (
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap shrink-0">
                    {practiceTotals.correct}/{practiceTotals.total} câu · {practiceAccuracy}%
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {practiceRows.map((row, index) => {
                  const rowAccuracy = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
                  return (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[140px]">
                        {index === 0 && (
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Part</label>
                        )}
                        <select
                          value={row.part}
                          onChange={e => updatePracticeRow(index, { part: Number(e.target.value) as PracticePartResult['part'] })}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                        >
                          {([1, 2, 3, 4, 5, 6, 7] as const).map(p => (
                            <option key={p} value={p}>Part {p}</option>
                          ))}
                        </select>
                      </div>

                      <div className="w-[88px] shrink-0">
                        {index === 0 && (
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Số câu làm</label>
                        )}
                        <input
                          type="number"
                          min="1"
                          value={row.total}
                          onChange={e => updatePracticeRow(index, { total: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white tabular-nums"
                        />
                      </div>

                      <div className="w-[88px] shrink-0">
                        {index === 0 && (
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Số câu đúng</label>
                        )}
                        <input
                          type="number"
                          min="0"
                          max={row.total}
                          value={row.correct}
                          onChange={e => updatePracticeRow(index, { correct: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white tabular-nums"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pb-1.5">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums w-10 text-right">
                          {rowAccuracy}%
                        </span>
                        <button
                          type="button"
                          onClick={() => removePracticeRow(index)}
                          disabled={practiceRows.length <= 1}
                          aria-label={`Xóa dòng Part ${row.part}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:hover:text-slate-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {practiceRows.length < 7 && (
                <button
                  type="button"
                  onClick={addPracticeRow}
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm Part khác
                </button>
              )}
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

          {sessionType === 'VOCAB' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Ngày học
                <input type="date" required max={getTodayDateString()} value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Số từ đã học
                <input type="number" min="1" step="1" required value={vocabCount} onChange={e => setVocabCount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <p className="sm:col-span-2 text-xs text-slate-500 dark:text-slate-400">Ghi riêng theo ngày; không tạo buổi thi hay cộng điểm TOEIC.</p>
            </div>
          )}

          </div>
          <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#121A2B] sm:px-6 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Submit Button */}
          {scoreError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{scoreError}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 max-md:flex-nowrap">
            {/* Điện thoại: đã có nút X ở đầu form, nên bỏ "Hủy" để hai nút lưu đủ rộng */}
            <button
              type="button"
              onClick={onClose}
              className="max-md:hidden mr-auto min-h-11 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Hủy
            </button>
            {sessionType !== 'VOCAB' && !wrongEntry && onAddMistakeForSession && <button type="submit" name="afterSave" value="mistake"
              className="min-h-11 max-md:min-h-12 max-md:flex-1 max-md:text-sm rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              Lưu & thêm câu sai
            </button>}
            <button
              type="submit"
              name="afterSave" value="close"
              className="min-h-11 max-md:min-h-12 max-md:flex-1 max-md:text-sm max-md:justify-center px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm shadow-blue-600/25 flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{sessionType === 'VOCAB' ? 'Lưu từ vựng' : isEditing ? 'Lưu thay đổi' : wrongEntry ? 'Lưu điểm' : 'Lưu kết quả'}</span>
            </button>
          </div>
          </div>

        </form>}

      </div>
    </div>
  );
};
