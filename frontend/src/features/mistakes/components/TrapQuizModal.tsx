import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  RotateCcw, 
  Brain, 
  Lightbulb, 
  Check, 
  ShieldCheck,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MistakeEntry, ERROR_CATEGORY_LABELS } from '@/shared/types';

interface TrapQuizModalProps {
  mistake: MistakeEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleStatus?: (mistakeId: string) => void;
}

export interface ParsedOption {
  letter: string;
  text: string;
  isCorrect: boolean;
}

/**
 * Trích xuất và chuẩn hóa 4 phương án trắc nghiệm + đáp án đúng
 */
export function resolveQuizOptions(mistake: MistakeEntry): {
  questionTitle: string;
  options: ParsedOption[];
  correctIndex: number;
} {
  const letters = ['A', 'B', 'C', 'D'];
  const fullContext = mistake.questionContext.trim();

  // Tìm chữ cái đáp án đúng (A, B, C hoặc D) từ correctAnswer
  const letterMatch = mistake.correctAnswer.match(/\(?([A-D])\)?/i);
  const targetLetter = letterMatch ? letterMatch[1].toUpperCase() : null;

  // Trường hợp 1: Có mảng options sẵn trong mistake (từ demoData hoặc AI parser)
  if (mistake.options && mistake.options.length >= 2) {
    let resolvedCorrectIdx = -1;

    const parsed = mistake.options.map((opt, idx) => {
      const letter = letters[idx] || String.fromCharCode(65 + idx);
      // Tách bỏ (A), (B)... nếu đã có trong text
      const cleanText = opt.replace(/^\(?([A-D])\)?[:.\s-]*/i, '').trim();

      // Kiểm tra có phải đáp án đúng không
      const matchesLetter = targetLetter === letter;
      const matchesText = mistake.correctAnswer.toLowerCase().includes(cleanText.toLowerCase()) && cleanText.length > 2;
      const isMatch = matchesLetter || (targetLetter === null && matchesText);

      if (isMatch && resolvedCorrectIdx === -1) {
        resolvedCorrectIdx = idx;
      }

      return {
        letter,
        text: cleanText || opt,
        isCorrect: false
      };
    });

    if (resolvedCorrectIdx === -1) {
      resolvedCorrectIdx = targetLetter ? letters.indexOf(targetLetter) : 0;
      if (resolvedCorrectIdx === -1 || resolvedCorrectIdx >= parsed.length) {
        resolvedCorrectIdx = 0;
      }
    }

    parsed[resolvedCorrectIdx].isCorrect = true;

    return {
      questionTitle: fullContext,
      options: parsed,
      correctIndex: resolvedCorrectIdx
    };
  }

  // Trường hợp 2: Trích xuất options từ questionContext dạng "(A) text (B) text (C) text (D) text"
  const optionRegex = /\(([A-D])\)\s*([^()\n\r]+)/gi;
  const matches = Array.from(fullContext.matchAll(optionRegex));

  if (matches.length >= 2) {
    const firstMatchIdx = matches[0].index ?? fullContext.length;
    const questionTitle = fullContext.slice(0, firstMatchIdx).trim() || fullContext;

    let resolvedCorrectIdx = -1;
    const parsed = matches.map((m, idx) => {
      const letter = m[1].toUpperCase();
      const text = m[2].trim();
      const matchesLetter = targetLetter === letter;
      const matchesText = mistake.correctAnswer.toLowerCase().includes(text.toLowerCase()) && text.length > 2;
      const isMatch = matchesLetter || (targetLetter === null && matchesText);

      if (isMatch && resolvedCorrectIdx === -1) {
        resolvedCorrectIdx = idx;
      }

      return {
        letter,
        text,
        isCorrect: false
      };
    });

    if (resolvedCorrectIdx === -1) {
      resolvedCorrectIdx = targetLetter ? letters.indexOf(targetLetter) : 0;
      if (resolvedCorrectIdx === -1 || resolvedCorrectIdx >= parsed.length) {
        resolvedCorrectIdx = 0;
      }
    }

    parsed[resolvedCorrectIdx].isCorrect = true;

    return {
      questionTitle,
      options: parsed,
      correctIndex: resolvedCorrectIdx
    };
  }

function extractChoice(rawText: string, fallback: string): { letter?: string; text: string } {
  if (!rawText) return { text: fallback };

  // 1. Tìm tiền tố dạng "(B) be" hoặc "(D) significantly"
  const prefixMatch = rawText.match(/^\(?([A-D])\)[:.\s-]*([^()\n\r]+)/i);
  if (prefixMatch && prefixMatch[2].trim()) {
    const clean = prefixMatch[2].trim().split(/\s+(?:do|vì|theo|nghĩ|bỏ qua)\b/i)[0].trim();
    if (clean) return { letter: prefixMatch[1].toUpperCase(), text: clean };
  }

  // 2. Tìm chữ cái đứng độc lập hoặc trong ngoặc: "(A)", "(B)" hoặc "chọn A"
  const standaloneLetterMatch = rawText.match(/\(([A-D])\)|\b([A-D])\b/i);
  const letter = standaloneLetterMatch ? (standaloneLetterMatch[1] || standaloneLetterMatch[2]).toUpperCase() : undefined;

  // 3. Tìm từ/cụm từ trong ngoặc kép: 'will be' hoặc "he had signed"
  const quoteMatch = rawText.match(/['"]([^'"]+)['"]/);
  if (quoteMatch && quoteMatch[1].trim().length < 50) {
    return { letter, text: quoteMatch[1].trim() };
  }

  // 4. Tìm sau từ "chọn", "đã chọn": ví dụ "chọn 14:00", "chọn are"
  const selectMatch = rawText.match(/(?:chọn|chọn nhầm|đã chọn)\s*(?:\(?([A-D])\)?)?[:\s]*([a-zA-Z0-9_:\s/-]+)/i);
  if (selectMatch && selectMatch[2].trim().length < 40) {
    const clean = selectMatch[2].split(/\s+(?:vì|do|theo|nghĩ|nhầm)\b/i)[0].trim();
    if (clean) return { letter: selectMatch[1]?.toUpperCase() || letter, text: clean };
  }

  // 5. Làm sạch tiền tố câu trả lời thông thường
  const cleanAnswer = rawText
    .replace(/^(đáp án đúng:?|đáp án là:?|câu trả lời là:?)\s*/i, '')
    .split(/\s+(?:do|vì|theo|nghĩ|bỏ qua)\b/i)[0]
    .replace(/^(người học|tôi|bạn)?\s*(chọn|đã chọn|khoanh)?\s*(\([A-D]\)|[A-D])?[:\s]*/i, '')
    .trim();

  if (cleanAnswer && cleanAnswer.length < 80) {
    return { letter, text: cleanAnswer };
  }

  return { letter, text: fallback };
}

  // Trường hợp 3: Fallback luôn tạo đủ 4 lựa chọn chuẩn TOEIC (3 lựa chọn cho Part 2)
  if (fullContext.toLowerCase().includes('watson') || fullContext.toLowerCase().includes('expense reports')) {
    return {
      questionTitle: fullContext,
      options: [
        { letter: 'A', text: 'are', isCorrect: false },
        { letter: 'B', text: 'be', isCorrect: true },
        { letter: 'C', text: 'were', isCorrect: false },
        { letter: 'D', text: 'will be', isCorrect: false }
      ],
      correctIndex: 1
    };
  }

  if (fullContext.toLowerCase().includes('hardly') && fullContext.toLowerCase().includes('contract')) {
    return {
      questionTitle: fullContext,
      options: [
        { letter: 'A', text: 'he signed', isCorrect: false },
        { letter: 'B', text: 'he had signed', isCorrect: false },
        { letter: 'C', text: 'had he signed', isCorrect: true },
        { letter: 'D', text: 'did he signed', isCorrect: false }
      ],
      correctIndex: 2
    };
  }

  const correctChoice = extractChoice(mistake.correctAnswer, 'Đáp án chính xác');
  const wrongChoice = extractChoice(mistake.userMistake, 'Phương án gây nhiễu');

  // Part 2: 3 phương án A, B, C
  if (mistake.part === 2) {
    const correctLetter = (correctChoice.letter && ['A', 'B', 'C'].includes(correctChoice.letter)) ? correctChoice.letter : 'C';
    const correctIdx = ['A', 'B', 'C'].indexOf(correctLetter);

    const wrongLetter = (wrongChoice.letter && ['A', 'B', 'C'].includes(wrongChoice.letter) && wrongChoice.letter !== correctLetter)
      ? wrongChoice.letter
      : ['A', 'B', 'C'].find(l => l !== correctLetter) || 'A';
    const wrongIdx = ['A', 'B', 'C'].indexOf(wrongLetter);

    const p2Options: ParsedOption[] = ['A', 'B', 'C'].map(letter => ({ letter, text: '', isCorrect: false }));
    p2Options[correctIdx] = { letter: ['A', 'B', 'C'][correctIdx], text: correctChoice.text, isCorrect: true };
    p2Options[wrongIdx] = { letter: ['A', 'B', 'C'][wrongIdx], text: wrongChoice.text, isCorrect: false };

    const remainingIdx = [0, 1, 2].find(i => i !== correctIdx && i !== wrongIdx) ?? 0;
    p2Options[remainingIdx] = { letter: ['A', 'B', 'C'][remainingIdx], text: 'Phương án loại trừ thông thường', isCorrect: false };

    return {
      questionTitle: fullContext,
      options: p2Options,
      correctIndex: correctIdx
    };
  }

  // Các Part khác: Luôn luôn đủ 4 phương án A, B, C, D
  const targetLetters = ['A', 'B', 'C', 'D'];
  const correctLetter = (correctChoice.letter && targetLetters.includes(correctChoice.letter)) ? correctChoice.letter : 'B';
  const correctIdx = targetLetters.indexOf(correctLetter);

  const wrongLetter = (wrongChoice.letter && targetLetters.includes(wrongChoice.letter) && wrongChoice.letter !== correctLetter)
    ? wrongChoice.letter
    : targetLetters.find(l => l !== correctLetter) || 'A';
  const wrongIdx = targetLetters.indexOf(wrongLetter);

  const fourOptions: ParsedOption[] = targetLetters.map(letter => ({
    letter,
    text: '',
    isCorrect: false
  }));

  fourOptions[correctIdx] = { letter: targetLetters[correctIdx], text: correctChoice.text, isCorrect: true };
  fourOptions[wrongIdx] = { letter: targetLetters[wrongIdx], text: wrongChoice.text, isCorrect: false };

  const remainingIndices = [0, 1, 2, 3].filter(i => i !== correctIdx && i !== wrongIdx);
  const genericDistractors = [
    'Phương án gây nhiễu thường gặp',
    'Phương án suy đoán khác'
  ];

  remainingIndices.forEach((slotIdx, i) => {
    fourOptions[slotIdx] = {
      letter: targetLetters[slotIdx],
      text: genericDistractors[i] || 'Phương án lựa chọn khác',
      isCorrect: false
    };
  });

  return {
    questionTitle: fullContext,
    options: fourOptions,
    correctIndex: correctIdx
  };
}

export const TrapQuizModal: React.FC<TrapQuizModalProps> = ({
  mistake,
  isOpen,
  onClose,
  onToggleStatus
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [canScrollMore, setCanScrollMore] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  // Kiểm tra xem nội dung bên dưới có bị khuất/cần cuộn hay không
  const checkScroll = useCallback(() => {
    if (bodyRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
      setCanScrollMore(scrollHeight - scrollTop - clientHeight > 24);
    }
  }, []);

  // Reset lựa chọn khi đổi câu hỏi hoặc mở lại modal
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(null);
      setIsShaking(false);
      setCanScrollMore(false);
      if (bodyRef.current) {
        bodyRef.current.scrollTop = 0;
      }
    }
  }, [isOpen, mistake?.id]);

  // Lắng nghe sự kiện cuộn & thay đổi kích thước cửa sổ
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  // Phân tích câu hỏi và phương án
  const quizData = useMemo(() => {
    if (!mistake) return null;
    return resolveQuizOptions(mistake);
  }, [mistake]);

  // Đóng modal khi ấn Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
      // Hỗ trợ phím tắt A, B, C, D hoặc 1, 2, 3, 4 khi chưa chọn
      if (selectedIndex === null && quizData) {
        const key = e.key.toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(key)) {
          const idx = ['A', 'B', 'C', 'D'].indexOf(key);
          if (idx < quizData.options.length) {
            handleSelectOption(idx);
          }
        } else if (['1', '2', '3', '4'].includes(key)) {
          const idx = parseInt(key, 10) - 1;
          if (idx < quizData.options.length) {
            handleSelectOption(idx);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, quizData, onClose]);

  const isAnswered = selectedIndex !== null;

  // Khi người dùng trả lời, kích hoạt hiệu ứng cuộn mượt và phát hiện nội dung khuất
  useEffect(() => {
    if (isAnswered && isOpen) {
      const timer = setTimeout(() => {
        checkScroll();
        // Cuộn mượt để đưa khối giải mã bẫy vào tầm mắt người dùng
        explanationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setCanScrollMore(false);
    }
  }, [isAnswered, isOpen, checkScroll]);

  if (!isOpen || !mistake || !quizData) return null;

  const categoryInfo = ERROR_CATEGORY_LABELS[mistake.category] || ERROR_CATEGORY_LABELS.OTHER;
  const isCorrect = isAnswered && selectedIndex === quizData.correctIndex;
  const isMastered = mistake.status === 'MASTERED';

  const triggerCelebration = () => {
    try {
      // Pháo hoa trung tâm
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      // 2 chùm pháo hoa 2 bên
      setTimeout(() => {
        confetti({
          particleCount: 45,
          angle: 60,
          spread: 60,
          origin: { x: 0.15, y: 0.65 }
        });
        confetti({
          particleCount: 45,
          angle: 120,
          spread: 60,
          origin: { x: 0.85, y: 0.65 }
        });
      }, 180);
    } catch {
      // Bỏ qua nếu môi trường không hỗ trợ canvas
    }
  };

  const handleSelectOption = (index: number) => {
    if (isAnswered) return;

    setSelectedIndex(index);

    if (index === quizData.correctIndex) {
      triggerCelebration();
    } else {
      // Kích hoạt hiệu ứng rung lỗi (shake animation)
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  const handleRetry = () => {
    setSelectedIndex(null);
    setIsShaking(false);
    setCanScrollMore(false);
    if (bodyRef.current) {
      bodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div 
        className={`relative w-full max-w-2xl bg-white dark:bg-[#121A2B] rounded-2xl border-2 border-slate-900 dark:border-slate-300 shadow-[6px_6px_0px_0px_#0f172a] dark:shadow-[6px_6px_0px_0px_#cbd5e1] overflow-hidden transition-transform duration-200 flex flex-col max-h-[92vh] ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* 1. MODAL HEADER */}
        <div className="px-5 py-4 border-b-2 border-slate-900 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`px-2 py-0.5 rounded-md text-xs font-black shrink-0 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] ${
              mistake.part <= 4
                ? 'bg-indigo-200 text-slate-950'
                : 'bg-cyan-200 text-slate-950'
            }`}>
              Part {mistake.part}
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-200 text-slate-950 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] truncate">
              {categoryInfo.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Đóng (Esc)"
              aria-label="Đóng"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* 2. MODAL BODY (Scrollable) */}
        <div ref={bodyRef} className="p-5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-slate-900 dark:text-slate-100">
          
          {/* Hộp hiển thị câu hỏi */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_#0f172a] space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400 stroke-[2.5]" />
              <span>Thử Thách Vượt Bẫy (Active Recall)</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
              {quizData.questionTitle}
            </p>
          </div>

          {/* Hướng dẫn khi chưa chọn */}
          {!isAnswered && (
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center font-bold">
              Chọn phương án bạn cho là chính xác nhất để mở khóa giải mã bẫy.
            </p>
          )}

          {/* 4 Phương án lựa chọn (A, B, C, D) */}
          <div className="space-y-2.5">
            {quizData.options.map((option, idx) => {
              const isSelected = selectedIndex === idx;
              const isThisCorrect = idx === quizData.correctIndex;

              // Xác định style động theo trạng thái sau khi bấm
              let buttonStyle = 'bg-white dark:bg-[#121A2B] border-2 border-slate-900/60 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-[2px_2px_0px_#0f172a] font-semibold';
              let badgeStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-2 border-slate-900 dark:border-slate-700';

              if (isAnswered) {
                if (isThisCorrect) {
                  // Đáp án đúng luôn sáng xanh lá
                  buttonStyle = 'bg-emerald-200 dark:bg-emerald-950/60 border-2 border-slate-900 text-slate-950 dark:text-emerald-100 shadow-[2px_2px_0px_#0f172a] font-bold';
                  badgeStyle = 'bg-emerald-500 text-white border-2 border-slate-900';
                } else if (isSelected) {
                  // Đáp án người dùng chọn sai sáng đỏ
                  buttonStyle = 'bg-rose-200 dark:bg-rose-950/60 border-2 border-slate-900 text-slate-950 dark:text-rose-100 shadow-[2px_2px_0px_#0f172a] font-bold';
                  badgeStyle = 'bg-rose-500 text-white border-2 border-slate-900';
                } else {
                  // Các phương án khác mờ đi
                  buttonStyle = 'bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-50';
                  badgeStyle = 'bg-slate-100/70 dark:bg-slate-800/50 text-slate-400 border-transparent';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  disabled={isAnswered}
                  className={`w-full p-3 sm:p-3.5 rounded-xl text-left flex items-center justify-between gap-3.5 transition-all duration-150 ${buttonStyle} ${
                    !isAnswered ? 'cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 transition-colors ${badgeStyle}`}>
                      {option.letter}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold leading-relaxed break-words">
                      {option.text}
                    </span>
                  </div>

                  {/* Icon phản hồi sau khi chọn */}
                  {isAnswered && (
                    <div className="shrink-0">
                      {isThisCorrect && (
                        <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 text-xs font-black animate-fade-in">
                          <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                          <span className="hidden sm:inline">Chính xác</span>
                        </div>
                      )}
                      {isSelected && !isThisCorrect && (
                        <div className="flex items-center gap-1.5 text-rose-800 dark:text-rose-300 text-xs font-black animate-fade-in">
                          <AlertCircle className="w-5 h-5 stroke-[2.5]" />
                          <span className="hidden sm:inline">Dính bẫy</span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 3. KHU VỰC GIẢI MÃ BẪY (CHỈ HIỂN THỊ SAU KHI NGƯỜI DÙNG ĐÃ CHỌN) */}
          {isAnswered && (
            <div ref={explanationRef} className="space-y-3.5 pt-2 animate-fade-in">
              
              {/* Banner kết quả chuẩn Neo */}
              {isCorrect ? (
                <div className="p-4 rounded-2xl bg-emerald-300 dark:bg-emerald-950/70 border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a] text-slate-950 dark:text-emerald-100 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-slate-900 text-white shrink-0 mt-0.5 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]">
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-black tracking-tight text-slate-950 dark:text-emerald-300">
                      XUẤT SẮC! BẠN ĐÃ BẮT TRÚNG BẪY!
                    </h4>
                    <p className="text-xs text-slate-800 dark:text-emerald-200 font-semibold">
                      Phản xạ tuyệt vời! Bạn đã nhận diện chuẩn xác thủ thuật đánh lừa của đề thi TOEIC.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-200 dark:bg-rose-950/70 border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a] text-slate-950 dark:text-rose-100 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0 mt-0.5 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-black tracking-tight text-slate-950 dark:text-rose-300">
                      RẤT TIẾC, BẠN VỪA DÍNH BẪY ETS!
                    </h4>
                    <p className="text-xs text-slate-800 dark:text-rose-200 font-semibold">
                      Đừng nản lòng! Đây chính là khoảnh khắc vàng để bạn khắc sâu bí kíp né bẫy lần sau.
                    </p>
                  </div>
                </div>
              )}

              {/* Chi tiết lỗi sai & đáp án chuẩn Neo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Cột 1: Lỗi sai thường gặp */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 shadow-[2px_2px_0px_#0f172a] space-y-1.5">
                  <span className="font-black text-rose-700 dark:text-rose-400 flex items-center gap-1.5 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Cái bẫy bạn đã / hay gặp:</span>
                  </span>
                  <p className="text-xs text-slate-800 dark:text-slate-300 font-medium leading-relaxed">
                    {mistake.userMistake || 'Đọc lướt hoặc dịch nhầm theo thói quen.'}
                  </p>
                </div>

                {/* Cột 2: Đáp án chính xác */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 shadow-[2px_2px_0px_#0f172a] space-y-1.5">
                  <span className="font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{mistake.answerSource === 'AI_PROPOSED' ? 'Đáp án AI đề xuất:' : 'Đáp án chuẩn xác:'}</span>
                  </span>
                  <p className="text-xs text-slate-950 dark:text-emerald-100 font-black leading-relaxed font-mono">
                    {mistake.correctAnswer}
                  </p>
                  {mistake.answerSource === 'AI_PROPOSED' && <p className="text-xs text-amber-800 dark:text-amber-200">Chưa đối chiếu đáp án nguồn; kết quả bài ôn dựa trên đề xuất này.</p>}
                </div>
              </div>

              {/* Cột 3: Bí kíp 10s */}
              {mistake.trapTip && (
                <div className="p-3.5 rounded-xl bg-amber-100 dark:bg-amber-950/40 border-2 border-slate-900 shadow-[2px_2px_0px_#0f172a] space-y-1.5">
                  <span className="font-black text-amber-900 dark:text-amber-300 flex items-center gap-1.5 text-xs">
                    <Lightbulb className="w-4 h-4 text-amber-600 fill-amber-500" />
                    <span>Bí kíp 10 giây né bẫy cốt lõi:</span>
                  </span>
                  <p className="text-xs text-slate-900 dark:text-slate-200 font-bold leading-relaxed">
                    {mistake.trapTip}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Gradient bóng mờ báo hiệu nội dung bên dưới */}
        {canScrollMore && isAnswered && (
          <div className="pointer-events-none absolute bottom-[58px] left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-[#121A2B] via-white/80 dark:via-[#121A2B]/80 to-transparent z-10" />
        )}

        {/* Nút Floating Bouncing báo hiệu còn nội dung bên dưới */}
        {canScrollMore && isAnswered && (
          <div className="absolute bottom-[68px] left-0 right-0 flex justify-center pointer-events-none z-20 animate-fade-in">
            <button
              type="button"
              onClick={() => {
                if (bodyRef.current) {
                  bodyRef.current.scrollTo({
                    top: bodyRef.current.scrollHeight,
                    behavior: 'smooth'
                  });
                }
              }}
              className="pointer-events-auto px-4 py-1.5 rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950 font-black text-xs shadow-[3px_3px_0px_#0f172a] dark:shadow-[3px_3px_0px_#94a3b8] border-2 border-slate-900 dark:border-white flex items-center gap-1.5 animate-bounce transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              title="Bấm để cuộn xuống xem giải mã bẫy và mẹo 10s"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300 dark:text-amber-500 fill-yellow-300 dark:fill-amber-500" />
              <span>Xem giải mã bẫy & mẹo 10s</span>
              <ChevronDown className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* 4. MODAL FOOTER */}
        <div className="px-5 py-3.5 border-t-2 border-slate-900 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-900/60 shrink-0">
          
          {/* Trạng thái Thông suốt */}
          {onToggleStatus && (
            <button
              onClick={() => onToggleStatus(mistake.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 border-slate-900 transition-all flex items-center gap-1.5 cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                isMastered
                  ? 'bg-emerald-300 text-slate-950 shadow-[1.5px_1.5px_0px_#0f172a]'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-[1.5px_1.5px_0px_#0f172a] hover:bg-slate-100'
              }`}
            >
              {isMastered ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-800 stroke-[2.5]" />
                  <span>Đã thông suốt</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-slate-500 stroke-[2.5]" />
                  <span>Đánh dấu thông suốt</span>
                </>
              )}
            </button>
          )}

          {/* Các nút hành động chính */}
          <div className="flex items-center gap-2 ml-auto">
            {isAnswered && (
              <button
                onClick={handleRetry}
                className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Thử lại</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
