import React, { useState, useMemo, useEffect } from 'react';
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
  ErrorCategory, 
  ERROR_CATEGORY_LABELS,
  PracticePartResult
} from '../types';
import {
  calculateFromPartScores,
  PART_MAX_QUESTIONS,
  getPracticeParts
} from '../utils/etsScoring';
import { getTodayDateString } from '../utils/storage';
import { useModalA11y } from '../hooks/useModalA11y';

interface SessionLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSession: (session: StudySession, newMistakes?: MistakeEntry[]) => void;
  sessions?: StudySession[];
  /** Giá trị điền sẵn khi form được mở từ Bộ đếm nhịp (SPEC 4.3) */
  prefill?: { durationMinutes?: number };
  /**
   * Có giá trị = chế độ SỬA: form nạp sẵn buổi học này, lưu thì thay thế
   * bản ghi cũ (giữ nguyên id và createdAt) qua onUpdateSession.
   */
  editingSession?: StudySession | null;
  onUpdateSession?: (session: StudySession, newMistakes?: MistakeEntry[]) => void;
}

const EMPTY_PART_SCORES: LRPartScore = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, part6: 0, part7: 0 };

export const SessionLoggerModal: React.FC<SessionLoggerModalProps> = ({
  isOpen,
  onClose,
  onSaveSession,
  sessions,
  prefill,
  editingSession,
  onUpdateSession
}) => {
  const isEditing = !!editingSession;
  const [sessionType, setSessionType] = useState<'FULL_TEST' | 'PART_PRACTICE'>('FULL_TEST');
  const [testName, setTestName] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [durationMinutes, setDurationMinutes] = useState(120);

  const [notes, setNotes] = useState('');

  // Tìm kiếm xem đề thi này đã từng làm chưa
  const previousAttemptsForTest = useMemo(() => {
    if (!sessions || !testName.trim()) return [];
    const normalized = testName.trim().toLowerCase();
    // Khi sửa, không tính chính bản ghi đang sửa là "lần làm trước"
    return sessions.filter(s =>
      s.testName.trim().toLowerCase() === normalized &&
      s.sessionType === 'FULL_TEST' &&
      s.id !== editingSession?.id
    );
  }, [sessions, testName, editingSession?.id]);

  const isExistingTest = sessionType === 'FULL_TEST' && previousAttemptsForTest.length > 0;
  const nextAttemptNumber = previousAttemptsForTest.length + 1;
  const bestPreviousScore = isExistingTest 
    ? Math.max(...previousAttemptsForTest.map(s => s.totalScore || 0)) 
    : 0;

  // Lấy danh sách tên các đề thi Full Test đã có để gợi ý nhanh
  const uniqueTestNameSuggestions = useMemo(() => {
    if (!sessions) return [];
    const names = new Set<string>();
    sessions.forEach(s => {
      if (s.sessionType === 'FULL_TEST' && s.testName.trim()) {
        names.add(s.testName.trim());
      }
    });
    return Array.from(names);
  }, [sessions]);

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

  // Quick Mistakes to add alongside session
  const [quickMistakes, setQuickMistakes] = useState<Array<{
    part: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    questionContext: string;
    userMistake: string;
    correctAnswer: string;
    category: ErrorCategory;
    tags: string;
  }>>([]);

  const [showAddMistake, setShowAddMistake] = useState(false);
  const [tempMistake, setTempMistake] = useState({
    part: 5 as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    questionContext: '',
    userMistake: '',
    correctAnswer: '',
    category: 'VOCABULARY_TRAP' as ErrorCategory,
    tags: ''
  });

  /**
   * Nạp lại form MỖI LẦN mở. Component không bị gỡ khi đóng (chỉ trả null),
   * nên trước đây lần mở sau còn nguyên số của lần nhập trước - và với chế
   * độ sửa, sửa xong rồi bấm "Nhập điểm" sẽ thấy dữ liệu của buổi vừa sửa.
   */
  useEffect(() => {
    if (!isOpen) return;
    const e = editingSession;
    setSessionType(e?.sessionType ?? 'FULL_TEST');
    setTestName(e?.testName ?? '');
    setDate(e?.date ?? getTodayDateString());
    // Bộ đếm nhịp truyền sang thời gian THẬT đã dùng - ghi đè mặc định 120 phút
    setDurationMinutes(e?.durationMinutes ?? prefill?.durationMinutes ?? 120);
    setNotes(e?.notes ?? '');
    setPartScores(e?.partScores ? { ...e.partScores } : { ...EMPTY_PART_SCORES });
    const parts = e && e.sessionType === 'PART_PRACTICE' ? getPracticeParts(e) : [];
    setPracticeRows(parts.length > 0 ? parts.map(p => ({ ...p })) : [{ part: 5, correct: 0, total: 30 }]);
    setQuickMistakes([]);
    setShowAddMistake(false);
  }, [isOpen, editingSession, prefill?.durationMinutes]);

  const modalRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  // Tính điểm trực tiếp từ partScores
  const calculated = calculateFromPartScores(partScores);

  const handlePartScoreChange = (partKey: keyof LRPartScore, value: number) => {
    const maxVal = PART_MAX_QUESTIONS[partKey];
    const clamped = Math.max(0, Math.min(maxVal, isNaN(value) ? 0 : value));
    setPartScores(prev => ({ ...prev, [partKey]: clamped }));
  };

  const handleAddTempMistake = () => {
    if (!tempMistake.questionContext.trim()) {
      alert('Vui lòng nhập câu hỏi hoặc vị trí câu sai!');
      return;
    }
    setQuickMistakes(prev => [...prev, { ...tempMistake }]);
    setTempMistake({
      part: 5,
      questionContext: '',
      userMistake: '',
      correctAnswer: '',
      category: 'VOCABULARY_TRAP',
      tags: ''
    });
    setShowAddMistake(false);
  };

  const handleRemoveQuickMistake = (index: number) => {
    setQuickMistakes(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const sessionId = editingSession?.id ?? `session-${Date.now()}`;
    const createdAt = editingSession?.createdAt ?? new Date().toISOString();
    let newSession: StudySession;

    if (sessionType === 'FULL_TEST') {
      newSession = {
        id: sessionId,
        skillType: 'LR',
        sessionType: 'FULL_TEST',
        testName: testName.trim() || 'ETS Test',
        attemptNumber: isEditing && editingSession?.attemptNumber
          ? editingSession.attemptNumber
          : isExistingTest ? nextAttemptNumber : 1,
        date,
        durationMinutes: Number(durationMinutes) || 120,
        rawListening: calculated.rawListening,
        rawReading: calculated.rawReading,
        scaledListening: calculated.scaledListening,
        scaledReading: calculated.scaledReading,
        totalScore: calculated.totalScore,
        partScores,
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
        testName: testName.trim() || partLabel,
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

    // Chuyển đổi quick mistakes
    const formattedMistakes: MistakeEntry[] = quickMistakes.map((m, idx) => ({
      id: `mistake-${Date.now()}-${idx}`,
      sessionId,
      part: m.part,
      questionContext: m.questionContext,
      userMistake: m.userMistake,
      correctAnswer: m.correctAnswer,
      category: m.category,
      tags: m.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: 'NEEDS_REVIEW',
      createdAt: new Date().toISOString()
    }));

    if (isEditing && onUpdateSession) {
      onUpdateSession(newSession, formattedMistakes);
    } else {
      onSaveSession(newSession, formattedMistakes);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-logger-title"
        tabIndex={-1}
        className="relative w-full max-w-3xl my-8 rounded-2xl bg-white dark:bg-[#121A2B] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 id="session-logger-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{isEditing ? 'Sửa Buổi Học' : 'Ghi Nhận Kết Quả Buổi Học'}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing ? 'Điểm được quy đổi lại theo số câu mới · không ảnh hưởng Streak' : 'Tự động quy đổi điểm chuẩn ETS và bảo toàn Streak'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSessionType('FULL_TEST')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center space-x-2 cursor-pointer ${
                sessionType === 'FULL_TEST'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Full Test (200 Câu chuẩn ETS)</span>
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
              <span>Luyện Từng Part Lẻ (Mini Practice)</span>
            </button>
          </div>

          {/* General Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên Đề Thi / Nguồn
                {sessionType === 'PART_PRACTICE' && (
                  <span className="font-normal text-slate-400 dark:text-slate-500"> (không bắt buộc)</span>
                )}
              </label>
              <input
                type="text"
                // Full Test cần tên để nhận diện lần làm lại cùng một đề.
                // Buổi luyện lẻ thì không, đã có nhãn thay thế sẵn khi lưu.
                required={sessionType === 'FULL_TEST'}
                list="existing-test-names"
                value={testName}
                onChange={e => setTestName(e.target.value)}
                placeholder={sessionType === 'FULL_TEST' ? 'vd: ETS 2024 Test 05' : 'vd: Cày Part 5 buổi tối'}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
              />
              <datalist id="existing-test-names">
                {uniqueTestNameSuggestions.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ngày Luyện Đề</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời Gian Làm (Phút)</label>
              <input
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

          {/* FULL TEST MODE */}
          {sessionType === 'FULL_TEST' && (
            <div className="space-y-4">
              
              {/* Live ETS Score Conversion Banner */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                    Điểm Dự Kiến Chuẩn ETS
                  </span>
                  <div className="flex items-baseline space-x-2 mt-0.5">
                    <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
                      {calculated.totalScore}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">/ 990 điểm</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xs font-semibold">
                  <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-cyan-600 dark:text-cyan-400 block font-bold">Listening: {calculated.scaledListening}</span>
                    <span className="text-[10px] text-slate-400">({calculated.rawListening}/100 câu)</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                    <span className="text-emerald-600 dark:text-emerald-400 block font-bold">Reading: {calculated.scaledReading}</span>
                    <span className="text-[10px] text-slate-400">({calculated.rawReading}/100 câu)</span>
                  </div>
                </div>
              </div>

              {/* Part 1-7 Inputs Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
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
                          value={partScores.part7}
                          onChange={e => handlePartScoreChange('part7', parseInt(e.target.value))}
                          className="w-14 px-2 py-1 text-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[11px] font-bold text-slate-400">/{PART_MAX_QUESTIONS.part7}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

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

          {/* Optional: Add Quick Mistakes */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Ghi Nhanh Lỗi Sai Vào Sổ Tay ({quickMistakes.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddMistake(!showAddMistake)}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm câu sai</span>
              </button>
            </div>

            {showAddMistake && (
              <div className="p-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Part</label>
                    <select
                      value={tempMistake.part}
                      onChange={e => setTempMistake({ ...tempMistake, part: Number(e.target.value) as any })}
                      className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map(p => (
                        <option key={p} value={p}>Part {p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Nhóm nguyên nhân</label>
                    <select
                      value={tempMistake.category}
                      onChange={e => setTempMistake({ ...tempMistake, category: e.target.value as ErrorCategory })}
                      className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    >
                      {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => (
                        <option key={cat} value={cat}>{val.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Vị trí / Ngữ cảnh câu</label>
                  <input
                    type="text"
                    placeholder="vd: Câu 124 Part 5..."
                    value={tempMistake.questionContext}
                    onChange={e => setTempMistake({ ...tempMistake, questionContext: e.target.value })}
                    className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Lỗi đã chọn</label>
                    <input
                      type="text"
                      placeholder="vd: Chọn nhầm B"
                      value={tempMistake.userMistake}
                      onChange={e => setTempMistake({ ...tempMistake, userMistake: e.target.value })}
                      className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Đáp án đúng & Bài học</label>
                    <input
                      type="text"
                      placeholder="vd: Đáp án C"
                      value={tempMistake.correctAnswer}
                      onChange={e => setTempMistake({ ...tempMistake, correctAnswer: e.target.value })}
                      className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddMistake(false)}
                    className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTempMistake}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer transition active:scale-95"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            )}

            {/* List of pending quick mistakes */}
            {quickMistakes.length > 0 && (
              <div className="space-y-1">
                {quickMistakes.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="space-x-1.5">
                      <span className="font-bold text-blue-600 dark:text-blue-400">P{m.part}:</span>
                      <span className="text-slate-700 dark:text-slate-300">{m.questionContext}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuickMistake(idx)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi Chú Buổi Học
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="vd: Part 7 bài đọc đôi quản lý thời gian tốt hơn..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm shadow-blue-600/25 flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isEditing ? 'Lưu thay đổi' : 'Lưu & Giữ Streak'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
