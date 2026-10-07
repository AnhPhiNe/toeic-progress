import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Search, 
  Trash2,
  Pencil,
  BookOpen,
  Brain,
  X,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Tag,
  Sparkles,
  Loader2,
  RotateCcw,
  Target,
  Lightbulb,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { MistakeEntry, ErrorCategory, ERROR_CATEGORY_LABELS } from '@/shared/types';

const SHORT_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  VOCABULARY_TRAP: 'Từ vựng',
  ADVANCED_GRAMMAR: 'Ngữ pháp',
  LISTENING_SPEED: 'Tốc độ nghe',
  TIME_PRESSURE: 'Áp lực giờ',
  CARELESS_DISTRACTION: 'Đọc ẩu',
  OTHER: 'Khác'
};
import { 
  extractMistakeWithAI, 
  getDemoSampleInput,
  getAIUsage
} from '@/features/mistakes/services/aiMistakeExtractor';
import { TrapQuizModal } from '@/features/mistakes/components/TrapQuizModal';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import type { AIUsage, AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';

interface MistakeNotebookViewProps {
  mistakes: MistakeEntry[];
  /** Số thẻ tới hạn ôn hôm nay (SPEC mục 4.6) */
  dueCount: number;
  onStartReview: () => void;
  onAddMistake: (mistake: MistakeEntry) => void;
  onToggleStatus: (mistakeId: string) => void;
  onDeleteMistake: (mistakeId: string) => void;
  /** Thay thế nội dung một thẻ, giữ nguyên trạng thái và lịch ôn giãn cách */
  onUpdateMistake: (mistake: MistakeEntry) => void;
}

export function parseOptionsTextToSlots(optionsText: string) {
  const lines = optionsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const extract = (letter: string) => {
    // Look for lines starting with (A) or A. or A) or A: or A [space]
    const found = lines.find(l => 
      new RegExp(`^\\(${letter}\\)`, 'i').test(l) ||
      new RegExp(`^${letter}[\\.:\\)\\-\\s]`, 'i').test(l)
    );
    if (found) {
      return found
        .replace(new RegExp(`^\\(${letter}\\)\\s*`, 'i'), '')
        .replace(new RegExp(`^${letter}[\\.:\\)\\-\\s]\\s*`, 'i'), '')
        .trim();
    }
    // If no letter prefix was found on any line, check line order fallback
    const hasAnyPrefix = lines.some(l => /^\([A-D]\)|^([A-D][.:)\s-])/i.test(l));
    if (!hasAnyPrefix) {
      const idx = ['A', 'B', 'C', 'D'].indexOf(letter.toUpperCase());
      if (idx !== -1 && lines[idx]) {
        return lines[idx].trim();
      }
    }
    return '';
  };

  return {
    optA: extract('A'),
    optB: extract('B'),
    optC: extract('C'),
    optD: extract('D')
  };
}

export function formatOptionSlot(letter: string, text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  const cleaned = trimmed
    .replace(new RegExp(`^\\(${letter}\\)\\s*`, 'i'), '')
    .replace(new RegExp(`^${letter}[\\.:\\)\\-\\s]\\s*`, 'i'), '')
    .trim();
  return `(${letter.toUpperCase()}) ${cleaned || trimmed}`;
}

const EMPTY_FORM = {
  part: 5 as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  questionContext: '',
  userMistake: '',
  correctAnswer: '',
  trapTip: '',
  optionsText: '',
  optA: '',
  optB: '',
  optC: '',
  optD: '',
  correctLetter: '' as '' | 'A' | 'B' | 'C' | 'D',
  wrongLetter: '' as '' | 'A' | 'B' | 'C' | 'D',
  wrongReason: '',
  category: 'VOCABULARY_TRAP' as ErrorCategory,
  tags: ''
};

export const MistakeNotebookView: React.FC<MistakeNotebookViewProps> = ({
  mistakes,
  dueCount,
  onStartReview,
  onAddMistake,
  onToggleStatus,
  onDeleteMistake,
  onUpdateMistake
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'NEEDS_REVIEW' | 'MASTERED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');

  // Quản lý các dòng đang mở rộng chi tiết (Mặc định thu gọn gọn gàng)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  // Modal thêm mới / sửa
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMistake, setEditingMistake] = useState<MistakeEntry | null>(null);
  const [newMistake, setNewMistake] = useState({ ...EMPTY_FORM });

  // Modal Thử Thách Vượt Bẫy (Trap Quiz Modal)
  const [quizMistake, setQuizMistake] = useState<MistakeEntry | null>(null);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [manualNotice, setManualNotice] = useState('');

  const openQuiz = (m: MistakeEntry) => {
    if ((m.options?.length ?? 0) < (m.part === 2 ? 3 : 4) || !m.correctAnswer.trim()) {
      openEdit(m);
      setManualNotice('Bổ sung đầy đủ phương án và đáp án chuẩn trước khi làm thử thách.');
      return;
    }
    setQuizMistake(m);
    setIsQuizOpen(true);
  };

  // AI Extract States
  const [modalMode, setModalMode] = useState<'AI_PARSE' | 'MANUAL'>('AI_PARSE');
  const [aiStep, setAiStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
  const [rawAIText, setRawAIText] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUsage, setAIUsage] = useState<AIUsage | null>(null);
  const [aiMissingInformation, setAIMissingInformation] = useState<string[]>([]);
  const [aiConsent, setAIConsent] = useState(false);
  const [aiReviewed, setAIReviewed] = useState(false);
  const [aiIsDemo, setAIIsDemo] = useState(false);
  const aiGeneration = useRef(0);
  const { containerRef: captchaRef, getToken: getCaptcha, remove: removeCaptcha } = useTurnstile();

  useEffect(() => {
    if (!isAddModalOpen || modalMode !== 'AI_PARSE') return;
    let cancelled = false;
    setAIUsage(null);
    void getAIUsage().then(usage => {
      if (!cancelled) setAIUsage(usage);
    }).catch(() => { /* Quota lookup failure leaves manual entry and the AI request available. */ });
    return () => { cancelled = true; };
  }, [isAddModalOpen, modalMode]);

  // Lọc tag thông minh cho AI Preview: Bỏ tag trùng lặp với Part và Category
  const previewTags = useMemo(() => {
    if (!newMistake.tags) return [];
    const rawList = newMistake.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    const partPattern = new RegExp(`^part\\s*${newMistake.part}$`, 'i');
    return rawList.filter(t => {
      if (partPattern.test(t)) return false;
      const catLabel = ERROR_CATEGORY_LABELS[newMistake.category]?.label || '';
      if (t.toLowerCase() === newMistake.category.toLowerCase() || t.toLowerCase() === catLabel.toLowerCase()) return false;
      if (['vocabulary', 'grammar', 'reading', 'listening'].includes(t.toLowerCase()) && catLabel.toLowerCase().includes(t.toLowerCase())) return false;
      return true;
    });
  }, [newMistake.tags, newMistake.part, newMistake.category]);

  const openCreate = () => {
    setManualNotice('');
    setEditingMistake(null);
    setNewMistake({ ...EMPTY_FORM });
    setModalMode('AI_PARSE');
    setAiStep('INPUT');
    setRawAIText('');
    setAiError(null);
    setAIConsent(false);
    setAIReviewed(false);
    setAIMissingInformation([]);
    setAIIsDemo(false);
    setIsAddModalOpen(true);
  };

  const openEdit = (m: MistakeEntry) => {
    setManualNotice('');
    setEditingMistake(m);
    const slots = parseOptionsTextToSlots((m.options || []).join('\n'));

    const correctMatch = m.correctAnswer.match(/^\(?([A-D])\)?/i);
    const correctLetter = (correctMatch?.[1]?.toUpperCase() || '') as '' | 'A' | 'B' | 'C' | 'D';

    const wrongMatch = m.userMistake.match(/^\(?([A-D])\)?/i) || m.userMistake.match(/(?:chọn|chọn nhầm|nghĩ là)\s*\(?([A-D])\)?/i);
    const wrongLetter = (wrongMatch?.[1]?.toUpperCase() || '') as '' | 'A' | 'B' | 'C' | 'D';

    let wrongReason = m.userMistake;
    if (wrongLetter) {
      wrongReason = wrongReason.replace(new RegExp(`^\\(?${wrongLetter}\\)?[\\.:\\s-]*`, 'i'), '').trim();
      wrongReason = wrongReason.replace(new RegExp(`^(?:chọn|chọn nhầm)\\s*\\(?${wrongLetter}\\)?[\\s:-]*(?:do|vì)?\\s*`, 'i'), '').trim();
    }

    setNewMistake({
      part: m.part,
      questionContext: m.questionContext,
      userMistake: m.userMistake,
      correctAnswer: m.correctAnswer,
      trapTip: m.trapTip || '',
      optionsText: (m.options || []).join('\n'),
      optA: slots.optA,
      optB: slots.optB,
      optC: slots.optC,
      optD: slots.optD,
      correctLetter,
      wrongLetter,
      wrongReason,
      category: m.category,
      tags: m.tags.join(', ')
    });
    setModalMode('MANUAL');
    setAiStep('INPUT');
    setIsAddModalOpen(true);
  };

  const handleSwitchToManual = () => {
    aiGeneration.current++;
    removeCaptcha();
    setIsAILoading(false);
    const slots = parseOptionsTextToSlots(newMistake.optionsText);
    const correctMatch = newMistake.correctAnswer.match(/^\(?([A-D])\)?/i);
    const correctLetter = (correctMatch?.[1]?.toUpperCase() || newMistake.correctLetter || '') as '' | 'A' | 'B' | 'C' | 'D';
    const wrongMatch = newMistake.userMistake.match(/^\(?([A-D])\)?/i) || newMistake.userMistake.match(/(?:chọn|chọn nhầm|nghĩ là)\s*\(?([A-D])\)?/i);
    const wrongLetter = (wrongMatch?.[1]?.toUpperCase() || newMistake.wrongLetter || '') as '' | 'A' | 'B' | 'C' | 'D';

    let wrongReason = newMistake.wrongReason || newMistake.userMistake;
    if (wrongLetter && !newMistake.wrongReason) {
      wrongReason = wrongReason.replace(new RegExp(`^\\(?${wrongLetter}\\)?[\\.:\\s-]*`, 'i'), '').trim();
      wrongReason = wrongReason.replace(new RegExp(`^(?:chọn|chọn nhầm)\\s*\\(?${wrongLetter}\\)?[\\s:-]*(?:do|vì)?\\s*`, 'i'), '').trim();
    }

    setNewMistake(prev => ({
      ...prev,
      optA: prev.optA || slots.optA,
      optB: prev.optB || slots.optB,
      optC: prev.optC || slots.optC,
      optD: prev.optD || slots.optD,
      correctLetter: prev.correctLetter || correctLetter,
      wrongLetter: prev.wrongLetter || wrongLetter,
      wrongReason: prev.wrongReason || wrongReason
    }));
    setModalMode('MANUAL');
  };

  const closeModal = useCallback(() => {
    aiGeneration.current++;
    removeCaptcha();
    setIsAILoading(false);
    setIsAddModalOpen(false);
    setEditingMistake(null);
    setAiError(null);
    setAiStep('INPUT');
  }, [removeCaptcha]);
  const modalRef = useModalA11y(isAddModalOpen, closeModal);

  const showDraft = (draft: AIMistakeParseResult, demo = false) => {
    const slots = parseOptionsTextToSlots(draft.options.join('\n'));
    const correctLetter = (draft.correctAnswer.match(/^\(?([A-D])\)?/i)?.[1]?.toUpperCase() || '') as '' | 'A' | 'B' | 'C' | 'D';
    setNewMistake({
      ...EMPTY_FORM, ...slots, part: (draft.part ?? 5) as 1 | 2 | 3 | 4 | 5 | 6 | 7, category: draft.category,
      questionContext: draft.questionContext, userMistake: draft.userMistake,
      correctAnswer: draft.correctAnswer, trapTip: draft.trapTip, correctLetter,
      optionsText: draft.options.join('\n'), tags: draft.tags.join(', ')
    });
    setAIMissingInformation([...draft.missingInformation, ...(draft.part === null ? ['Chưa xác định được Part; hãy chọn lại khi chỉnh sửa.'] : [])]);
    setAIReviewed(false);
    setAIIsDemo(demo);
    setAiStep('PREVIEW');
  };

  const handleLoadDemo = () => {
    aiGeneration.current++;
    removeCaptcha();
    setIsAILoading(false);
    const demo = getDemoSampleInput();
    setRawAIText(demo.input);
    setAiError(null);
    showDraft(demo.result, true);
  };

  const handleRunAIExtract = async () => {
    if (!aiConsent) { setAiError('Xác nhận gửi nội dung tới AI trước khi phân tích.'); return; }
    const run = ++aiGeneration.current;
    try {
      setIsAILoading(true);
      setAiError(null);
      const { draft, usage } = await extractMistakeWithAI(rawAIText, getCaptcha);
      if (run !== aiGeneration.current) return;
      setAIUsage(usage);
      showDraft(draft);
    } catch (reason) {
      if (run === aiGeneration.current) setAiError(reason instanceof Error ? reason.message : 'Chưa phân tích được nội dung.');
    } finally {
      if (run === aiGeneration.current) setIsAILoading(false);
    }
  };

  const handleSaveFromAIPreview = () => {
    if (!newMistake.questionContext.trim() || !aiReviewed) return;

    const tags = newMistake.tags.split(',').map(t => t.trim()).filter(Boolean);
    const parsedOptions = newMistake.optionsText
      .split(/\r?\n/)
      .map(o => o.trim())
      .filter(Boolean);

    const entry: MistakeEntry = {
      id: `mistake-${Date.now()}`,
      part: newMistake.part,
      questionContext: newMistake.questionContext,
      userMistake: newMistake.userMistake,
      correctAnswer: newMistake.correctAnswer,
      trapTip: newMistake.trapTip,
      options: parsedOptions.length > 0 ? parsedOptions : undefined,
      category: newMistake.category,
      tags,
      status: 'NEEDS_REVIEW',
      createdAt: new Date().toISOString()
    };

    onAddMistake(entry);
    closeModal();
  };

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = mistakes.length;
    const mastered = mistakes.filter(m => m.status === 'MASTERED').length;
    const needsReview = total - mastered;
    const masteryRate = total > 0 ? Math.round((mastered / total) * 100) : 0;

    return {
      total,
      mastered,
      needsReview,
      masteryRate
    };
  }, [mistakes]);

  // Danh sách sau khi lọc
  const filteredMistakes = useMemo(() => {
    return mistakes.filter(m => {
      const matchSearch = m.questionContext.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.userMistake.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.correctAnswer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.trapTip && m.trapTip.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          m.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchPart = selectedPart === 'ALL' || m.part === selectedPart;
      const matchStatus = selectedStatus === 'ALL' || m.status === selectedStatus;
      const matchCategory = selectedCategory === 'ALL' || m.category === selectedCategory;

      return matchSearch && matchPart && matchStatus && matchCategory;
    });
  }, [mistakes, searchTerm, selectedPart, selectedStatus, selectedCategory]);

  const toggleRow = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allExpanded = filteredMistakes.length > 0 && filteredMistakes.every(m => expandedIds.has(m.id));

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filteredMistakes.map(m => m.id)));
    }
  };

  const handleCreateMistake = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMistake.questionContext.trim()) return;

    const tags = newMistake.tags.split(',').map(t => t.trim()).filter(Boolean);

    // Ghép các phương án từ 4 ô A, B, C, D (loại bỏ D nếu Part 2)
    const slots = [
      formatOptionSlot('A', newMistake.optA),
      formatOptionSlot('B', newMistake.optB),
      formatOptionSlot('C', newMistake.optC),
      newMistake.part === 2 ? '' : formatOptionSlot('D', newMistake.optD),
    ].filter(Boolean);

    const parsedOptions = slots.length > 0
      ? slots
      : newMistake.optionsText
          .split(/\r?\n/)
          .map(o => o.trim())
          .filter(Boolean);

    // 1. Xác định đáp án đúng (từ nút Đúng hoặc từ ô nhập)
    let finalCorrectAnswer = newMistake.correctAnswer.trim();
    if (newMistake.correctLetter) {
      const slotVal = (newMistake as any)[`opt${newMistake.correctLetter}`]?.trim() || '';
      finalCorrectAnswer = formatOptionSlot(newMistake.correctLetter, slotVal) || `(${newMistake.correctLetter})`;
    }

    // 2. Xác định lỗi đã chọn (từ nút Chọn sai + lý do)
    let finalUserMistake = newMistake.userMistake.trim();
    if (newMistake.wrongLetter) {
      const slotVal = (newMistake as any)[`opt${newMistake.wrongLetter}`]?.trim() || '';
      const slotFormatted = formatOptionSlot(newMistake.wrongLetter, slotVal) || `(${newMistake.wrongLetter})`;
      if (newMistake.wrongReason.trim()) {
        finalUserMistake = `${slotFormatted} - ${newMistake.wrongReason.trim()}`;
      } else {
        finalUserMistake = slotFormatted;
      }
    }

    if (!finalCorrectAnswer) {
      alert('Vui lòng chọn đáp án đúng (A, B, C hoặc D) trên phiếu tô.');
      return;
    }

    if (!finalUserMistake) {
      finalUserMistake = '(Không ghi nhận đáp án nhầm)';
    }

    if (editingMistake) {
      onUpdateMistake({
        ...editingMistake,
        part: newMistake.part,
        questionContext: newMistake.questionContext,
        userMistake: finalUserMistake,
        correctAnswer: finalCorrectAnswer,
        trapTip: newMistake.trapTip,
        options: parsedOptions.length > 0 ? parsedOptions : editingMistake.options,
        category: newMistake.category,
        tags
      });
      closeModal();
      return;
    }

    const entry: MistakeEntry = {
      id: `mistake-${Date.now()}`,
      part: newMistake.part,
      questionContext: newMistake.questionContext,
      userMistake: finalUserMistake,
      correctAnswer: finalCorrectAnswer,
      trapTip: newMistake.trapTip,
      options: parsedOptions.length > 0 ? parsedOptions : undefined,
      category: newMistake.category,
      tags,
      status: 'NEEDS_REVIEW',
      createdAt: new Date().toISOString()
    };

    onAddMistake(entry);
    closeModal();
  };

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      
      {/* 1. Header Tinh Gọn (Không lặp lại số liệu) */}
      {/* 1. Header Tinh Gọn (Không lặp lại số liệu) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          Sổ Tay Bắt Bẫy & Lỗi Sai
        </h2>

        {/* Nút hành động */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onStartReview}
            disabled={dueCount === 0}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 transition-all ${
              dueCount > 0
                ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-2 border-slate-900 shadow-[2.5px_2.5px_0px_#0f172a] cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border-2 border-slate-300 dark:border-slate-700'
            }`}
          >
            <Brain className="w-4 h-4 shrink-0" />
            <span>{dueCount > 0 ? `Ôn ${dueCount} thẻ đến hạn` : 'Chưa có thẻ đến hạn'}</span>
          </button>

          <button
            onClick={openCreate}
            className="px-3.5 py-2 rounded-xl bg-yellow-300 hover:bg-yellow-200 text-slate-950 font-black text-xs sm:text-sm border-2 border-slate-900 shadow-[2.5px_2.5px_0px_#0f172a] flex items-center gap-1.5 transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus className="w-4 h-4 shrink-0 stroke-[2.5]" />
            <span>Ghi Chú Bẫy</span>
          </button>
        </div>
      </div>

      {/* 2. Thanh Công Cụ Lọc Nhanh (Chuẩn Neo, không emoji thừa) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 sm:p-2.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-[#121A2B] shadow-[2.5px_2.5px_0px_#0f172a]">
        
        {/* Tìm kiếm */}
        <div className="relative flex-1 min-w-[180px] max-w-xs sm:max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold" />
          <input
            type="text"
            placeholder="Tìm kiếm bẫy, từ khóa..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 dark:bg-slate-900 border-2 border-slate-900/60 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Bộ lọc 1 chạm (Segmented Buttons) - Bỏ emoji thừa */}
        <div className="flex items-center gap-1.5 text-xs font-black">
          <button
            onClick={() => setSelectedStatus('ALL')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap border-2 ${
              selectedStatus === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Tất cả ({stats.total})
          </button>
          <button
            onClick={() => setSelectedStatus('NEEDS_REVIEW')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap border-2 ${
              selectedStatus === 'NEEDS_REVIEW'
                ? 'bg-amber-300 text-slate-950 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]'
                : 'border-transparent text-amber-700 dark:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40'
            }`}
          >
            Cần ôn ({stats.needsReview})
          </button>
          <button
            onClick={() => setSelectedStatus('MASTERED')}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap border-2 ${
              selectedStatus === 'MASTERED'
                ? 'bg-emerald-300 text-slate-950 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]'
                : 'border-transparent text-emerald-700 dark:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            Thông suốt ({stats.mastered})
          </button>
        </div>

        {/* Dropdown Filters & Mở rộng tất cả */}
        <div className="flex items-center gap-1.5 ml-auto">
          <select
            value={selectedPart}
            onChange={e => setSelectedPart(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-50 dark:bg-slate-900 border-2 border-slate-900/60 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
          >
            <option value="ALL">Mọi Part</option>
            {[1, 2, 3, 4, 5, 6, 7].map(p => (
              <option key={p} value={p}>Part {p}</option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value as any)}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-50 dark:bg-slate-900 border-2 border-slate-900/60 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none cursor-pointer max-w-[140px] truncate"
          >
            <option value="ALL">Mọi nguyên nhân</option>
            {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => (
              <option key={cat} value={cat}>{val.label}</option>
            ))}
          </select>

          {filteredMistakes.length > 0 && (
            <button
              onClick={toggleExpandAll}
              title={allExpanded ? 'Thu gọn tất cả' : 'Mở rộng tất cả'}
              className="px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 border-2 border-slate-900/40 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{allExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
            </button>
          )}
        </div>

      </div>

      {/* 3. BẢNG GỌN DẠNG COMPACT FEED (CHUẨN NEO-BRUTALISM) */}
      <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-[#121A2B] overflow-hidden divide-y-2 divide-slate-900/10 dark:divide-slate-800 shadow-[3.5px_3.5px_0px_#0f172a]">
        {filteredMistakes.map(mistake => {
          const categoryInfo = ERROR_CATEGORY_LABELS[mistake.category] || ERROR_CATEGORY_LABELS.OTHER;
          const shortCatLabel = SHORT_CATEGORY_LABELS[mistake.category] || 'Khác';
          const isMastered = mistake.status === 'MASTERED';
          const isListening = mistake.part <= 4;
          const isExpanded = expandedIds.has(mistake.id);

          return (
            <div 
              key={mistake.id}
              className={`transition-colors duration-150 ${
                isExpanded 
                  ? 'bg-slate-50/70 dark:bg-slate-800/30' 
                  : 'hover:bg-amber-50/30 dark:hover:bg-slate-800/40'
              }`}
            >
              {/* Tiêu đề dòng (Bấm vào để mở Thử Thách Vượt Bẫy) */}
              <div 
                onClick={() => openQuiz(mistake)}
                className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
                title="Bấm vào câu này để bắt đầu Thử Thách Vượt Bẫy"
              >
                {/* Vế trái: Nút mở rộng + Part badge + Category badge + Câu hỏi */}
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRow(mistake.id);
                    }}
                    title={isExpanded ? 'Thu gọn chi tiết ghi chú' : 'Xem ghi chú chi tiết'}
                    aria-label={isExpanded ? 'Thu gọn chi tiết' : 'Mở rộng chi tiết'}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition cursor-pointer shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-900 dark:text-white stroke-[2.5]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500 stroke-[2.5]" />
                    )}
                  </button>

                  {/* Part Badge chuẩn Neo */}
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-black shrink-0 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] ${
                    isListening
                      ? 'bg-indigo-200 text-slate-950'
                      : 'bg-cyan-200 text-slate-950'
                  }`}>
                    P{mistake.part}
                  </span>

                  {/* Category Pill gọn nhẹ */}
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shrink-0">
                    {shortCatLabel}
                  </span>

                  {/* Câu hỏi */}
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {mistake.questionContext}
                  </span>
                </div>

                {/* Vế phải: Nút trạng thái 1-chạm (NO EMOJI) + Sửa / Xóa */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {/* Nút trạng thái 1 chạm (Chuẩn Neo, không có emoji thừa) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStatus(mistake.id);
                    }}
                    title={isMastered ? 'Bấm để chuyển về Cần ôn lại' : 'Bấm để đánh dấu Đã thông suốt'}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition cursor-pointer ${
                      isMastered
                        ? 'bg-emerald-300 hover:bg-emerald-200 text-slate-950'
                        : 'bg-amber-300 hover:bg-amber-200 text-slate-950'
                    }`}
                  >
                    {isMastered ? 'Thông suốt' : 'Cần ôn'}
                  </button>

                  {/* Sửa / Xóa */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(mistake);
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Sửa lỗi này"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Xóa lỗi này khỏi sổ tay?')) {
                          onDeleteMistake(mistake.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Xóa lỗi này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Chi tiết mở rộng (giữ nguyên đầy đủ tính năng nhưng chuẩn Neo) */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 sm:pl-11 space-y-3 animate-fade-in text-xs border-t-2 border-slate-900/10 dark:border-slate-800">
                  {/* Khối Bí kíp 10s né bẫy (Nếu có) */}
                  {mistake.trapTip && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-100 dark:bg-amber-950/40 border-2 border-slate-900 shadow-[2px_2px_0px_#0f172a] text-slate-900 dark:text-white">
                      <Lightbulb className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider block">
                          Bí kíp 10s né bẫy
                        </span>
                        <p className="text-xs leading-relaxed text-slate-900 dark:text-slate-200 font-bold">
                          {mistake.trapTip}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Danh sách 4 lựa chọn trắc nghiệm (nếu có) */}
                  {mistake.options && mistake.options.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        Phương án trắc nghiệm:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {mistake.options.map((opt, idx) => {
                          const optLetter = opt.match(/^\(([A-D])\)/i)?.[1]?.toUpperCase();
                          const correctLetter = mistake.correctAnswer.match(/^\(([A-D])\)/i)?.[1]?.toUpperCase();
                          const isCorrect = Boolean(
                            (optLetter && correctLetter && optLetter === correctLetter) ||
                            opt.trim().toLowerCase() === mistake.correctAnswer.trim().toLowerCase() ||
                            (opt.toLowerCase().includes(mistake.correctAnswer.toLowerCase().replace(/^\([A-D]\)\s*/i, '').trim()) && mistake.correctAnswer.replace(/^\([A-D]\)\s*/i, '').trim().length > 2)
                          );

                          return (
                            <div
                              key={idx}
                              className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between border-2 transition-colors ${
                                isCorrect
                                  ? 'bg-emerald-100 dark:bg-emerald-950/40 border-slate-900 text-slate-950 dark:text-emerald-200 font-bold shadow-[1.5px_1.5px_0px_#0f172a]'
                                  : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium'
                              }`}
                            >
                              <span className="font-mono">{opt}</span>
                              {isCorrect && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 dark:text-emerald-300 font-black ml-2 shrink-0">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Đáp án đúng</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Khối Phân tích đối chiếu: Đáp án đúng & Lỗi đã chọn */}
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900/70 border-2 border-slate-900/40 dark:border-slate-700 space-y-2.5">
                    {/* Đáp án chuẩn */}
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-black text-[11px] bg-emerald-200 text-emerald-950 border border-emerald-400 shrink-0 w-fit">
                        <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                        Đáp án đúng
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {mistake.correctAnswer}
                      </span>
                    </div>

                    {/* Lỗi đã chọn */}
                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-black text-[11px] bg-rose-200 text-rose-950 border border-rose-400 shrink-0 w-fit">
                        <XCircle className="w-3 h-3 text-rose-700" />
                        Lỗi đã chọn
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {mistake.userMistake || 'Chưa ghi chú lỗi sai cụ thể.'}
                      </p>
                    </div>
                  </div>

                  {/* Dòng chân thẻ chi tiết: Phân loại, Tags, Ngày tạo, Nút Luyện bẫy */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-0.5 rounded-md">
                        {categoryInfo.label}
                      </span>
                      {mistake.tags.map(tag => (
                        <span 
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          <span>{tag}</span>
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px]">
                        {mistake.createdAt ? new Date(mistake.createdAt).toLocaleDateString('vi-VN') : ''}
                      </span>
                      <button
                        onClick={() => openQuiz(mistake)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-500 text-white border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition cursor-pointer"
                        title="Bắt đầu kiểm tra lại câu này"
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>Luyện bẫy</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Trạng thái trống */}
        {filteredMistakes.length === 0 && (
          <div className="text-center py-12 px-4 space-y-2 text-slate-400 text-xs">
            <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-slate-600 dark:text-slate-400 font-medium">Không tìm thấy bẫy nào theo bộ lọc.</p>
            <button 
              onClick={() => {
                setSearchTerm('');
                setSelectedPart('ALL');
                setSelectedStatus('ALL');
                setSelectedCategory('ALL');
              }} 
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Đặt lại tất cả bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Gợi ý tương tác nhanh ở chân danh sách */}
      <div className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
        Bấm trực tiếp vào từng câu để mở Thử Thách Vượt Bẫy • Bấm nút Cần ôn / Thông suốt để đổi trạng thái
      </div>

      {/* 4. MODAL: GHI CHÚ BẪY (CHUẨN PHONG CÁCH NEO-BRUTALISM) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="mistake-modal-title" className="w-full max-w-2xl sm:max-w-3xl rounded-2xl bg-white dark:bg-[#111A2C] border-2 border-slate-900 dark:border-slate-200 shadow-[6px_6px_0px_0px_#0f172a] dark:shadow-[6px_6px_0px_0px_#cbd5e1] p-4 sm:p-6 space-y-3.5 sm:space-y-4 max-h-[92vh] overflow-y-auto">
            
            {/* Header Modal Neo */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-slate-700 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-300 dark:bg-amber-400 text-slate-950 border-2 border-slate-900 flex items-center justify-center font-black shadow-[2px_2px_0px_0px_#0f172a] shrink-0">
                  {modalMode === 'AI_PARSE' ? <Sparkles className="w-5 h-5 text-slate-950" /> : <BookOpen className="w-5 h-5 text-slate-950" />}
                </div>
                <div>
                  <h3 id="mistake-modal-title" className="text-base sm:text-lg font-black text-slate-950 dark:text-white tracking-tight">
                    {editingMistake 
                      ? 'Sửa Ghi Chú Bẫy' 
                      : modalMode === 'AI_PARSE' && aiStep === 'PREVIEW'
                      ? (aiIsDemo ? 'Mẫu minh họa có sẵn' : 'Bản nháp phân tích lỗi') 
                      : 'Ghi Chú Bẫy & Lỗi Sai Mới'}
                  </h3>
                  {!(modalMode === 'AI_PARSE' && aiStep === 'PREVIEW') && (
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {modalMode === 'AI_PARSE' ? 'Dán đề bài để AI tự động trích xuất cấu trúc bẫy & mẹo 10s' : 'Điền thủ công các trường nội dung'}
                    </p>
                  )}
                </div>
              </div>
              <button 
                onClick={closeModal} 
                className="p-1.5 rounded-xl border-2 border-slate-900 dark:border-slate-200 bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                title="Đóng (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher Tabs Neo */}
            {!editingMistake && aiStep !== 'PREVIEW' && (
              <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalMode('AI_PARSE')}
                  className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-black transition-all cursor-pointer ${
                    modalMode === 'AI_PARSE'
                      ? 'bg-blue-600 text-white border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] -translate-y-0.5'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border-2 border-transparent'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Dán Nhanh (AI Phân Tích)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSwitchToManual}
                  className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-xs font-black transition-all cursor-pointer ${
                    modalMode === 'MANUAL'
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 border-2 border-slate-900 dark:border-slate-100 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] -translate-y-0.5'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border-2 border-transparent'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Nhập Thủ Công</span>
                </button>
              </div>
            )}

            {/* TH 1: CHẾ ĐỘ DÁN NHANH AI */}
            {modalMode === 'AI_PARSE' && !editingMistake && (
              aiStep === 'PREVIEW' ? (
                /* GIAO DIỆN PREVIEW NEO-BRUTALISM */
                <div className="space-y-4 text-xs animate-fade-in">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] space-y-3.5">
                    
                    {/* Header Thẻ: Part & Category & Tags */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-950 dark:bg-blue-900/60 dark:text-blue-200 border-2 border-slate-900 dark:border-slate-700 font-black text-xs shadow-[1.5px_1.5px_0px_0px_#0f172a] shrink-0">
                          Part {newMistake.part}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-200 text-amber-950 dark:bg-amber-900/50 dark:text-amber-200 border-2 border-slate-900 dark:border-slate-700 font-bold text-xs shadow-[1.5px_1.5px_0px_0px_#0f172a] shrink-0">
                          {ERROR_CATEGORY_LABELS[newMistake.category]?.label || newMistake.category}
                        </span>
                        {previewTags.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-400 dark:border-slate-600 text-[11px] font-mono font-bold shrink-0">
                            #{t}
                          </span>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleSwitchToManual}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 font-bold text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-[1.5px_1.5px_0px_0px_#0f172a] hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1 cursor-pointer transition-all shrink-0"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Sửa chi tiết</span>
                      </button>
                    </div>

                    {/* Ngữ cảnh / Câu hỏi */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 leading-relaxed font-mono shadow-[2px_2px_0px_0px_#0f172a]">
                      {newMistake.questionContext}
                    </div>

                    {/* Nội dung bóc tách */}
                    <div className="space-y-3 text-xs">
                      {/* 4 Phương án trắc nghiệm A, B, C, D (nếu có) */}
                      {newMistake.optionsText && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {newMistake.optionsText.split(/\r?\n/).filter(Boolean).map((opt, idx) => {
                            const optLetter = opt.match(/^\(([A-D])\)/i)?.[1]?.toUpperCase();
                            const correctLetter = newMistake.correctAnswer.match(/^\(([A-D])\)/i)?.[1]?.toUpperCase();
                            const isCorrect = Boolean(
                              (optLetter && correctLetter && optLetter === correctLetter) ||
                              opt.trim().toLowerCase() === newMistake.correctAnswer.trim().toLowerCase() ||
                              (opt.toLowerCase().includes(newMistake.correctAnswer.toLowerCase().replace(/^\([A-D]\)\s*/i, '').trim()) && newMistake.correctAnswer.replace(/^\([A-D]\)\s*/i, '').trim().length > 2)
                            );

                            return (
                              <div 
                                key={idx} 
                                className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between border-2 transition-all ${
                                  isCorrect
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-bold border-slate-900 dark:border-emerald-600 shadow-[2px_2px_0px_0px_#0f172a]'
                                    : 'bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0px_0px_#0f172a]'
                                }`}
                              >
                                <span className="font-mono">{opt}</span>
                                {isCorrect && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 dark:text-emerald-300 font-black ml-2 shrink-0">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Đáp án đúng</span>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Chỉ hiển thị Đáp án đúng khi KHÔNG CÓ danh sách trắc nghiệm phía trên */}
                      {!newMistake.optionsText && newMistake.correctAnswer && (
                        <div className="p-3 sm:p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black text-[11px] bg-emerald-200 text-emerald-950 border border-slate-900 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            Đáp án đúng:
                          </span>
                          <span className="font-bold text-slate-950 dark:text-white font-mono">
                            {newMistake.correctAnswer}
                          </span>
                        </div>
                      )}

                      {/* Thẻ 1: Điểm dễ nhầm (Lý do bẫy) */}
                      {newMistake.userMistake && newMistake.userMistake !== 'Chưa ghi chú lỗi' && (
                        <div className="p-3 sm:p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] flex items-start gap-2.5 text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-100 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200 border border-slate-900 shrink-0">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            Điểm dễ nhầm
                          </span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium leading-relaxed pt-0.5">
                            {newMistake.userMistake}
                          </p>
                        </div>
                      )}

                      {/* Thẻ 2: Mẹo 10s né bẫy */}
                      {newMistake.trapTip && (
                        <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] flex items-start gap-2.5 text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black text-[11px] bg-amber-200 text-amber-950 dark:bg-amber-900/80 dark:text-amber-200 border border-slate-900 shrink-0">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 fill-amber-400/40" />
                            Mẹo 10s
                          </span>
                          <p className="text-slate-900 dark:text-slate-100 font-medium leading-relaxed pt-0.5">
                            {newMistake.trapTip}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {aiIsDemo && <p className="font-semibold">Đây là ví dụ có sẵn, không phải kết quả phân tích nội dung bạn nhập.</p>}
                    {aiMissingInformation.map((item, index) => <p key={index}>{item}</p>)}
                    <label className="mt-2 flex items-start gap-2">
                      <input type="checkbox" checked={aiReviewed} onChange={event => setAIReviewed(event.target.checked)} />
                      <span>Tôi đã kiểm tra nội dung và đáp án trước khi lưu.</span>
                    </label>
                  </div>
                  {/* Thanh hành động dưới thẻ preview Neo */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setAiStep('INPUT')}
                      className="px-3 py-1.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_0px_#0f172a] hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Dán câu khác</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={closeModal}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-slate-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveFromAIPreview}
                        disabled={!aiReviewed}
                        aria-disabled={!aiReviewed}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs border-2 border-slate-900 dark:border-slate-200 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Lưu Vào Sổ Tay</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* BƯỚC 1: DÁN CÂU HỎI VÀO */
                <div className="space-y-3.5 text-xs">
                  
                  <div className="rounded-xl bg-slate-50 p-3 text-slate-600 dark:bg-slate-900 dark:text-slate-300" role="status">
                    {aiUsage?.unlimited
                      ? 'Tài khoản của bạn được miễn hạn mức lượt AI. Tốc độ sử dụng vẫn phụ thuộc giới hạn của Gemini.'
                      : aiUsage ? `Còn ${aiUsage.remaining}/${aiUsage.limit} lượt AI${aiUsage.guest ? ' dùng thử cho khách' : ' trong tháng'}.`
                        : 'Khách được thử 3 lượt AI; tài khoản có 10 lượt/tháng. Tổng hạn mức beta có giới hạn.'}
                    <p className="mt-1">Kết quả là bản nháp để bạn kiểm tra và chỉnh sửa trước khi lưu.</p>
                  </div>

                  {/* Ô Dán Nội Dung Đề Bài Neo */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-slate-950 dark:text-white font-black text-xs">
                      <label htmlFor="ai-mistake-input">Dán câu hỏi + đáp án đã chọn + đáp án chuẩn nếu có:</label>
                      <button
                        type="button"
                        onClick={handleLoadDemo}
                        className="px-2.5 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-slate-950 dark:text-amber-100 border-2 border-slate-900 font-black text-[11px] flex items-center gap-1 shadow-[1.5px_1.5px_0px_0px_#0f172a] hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                      >
                        <span>Xem mẫu minh họa</span>
                      </button>
                    </div>

                    <textarea
                      id="ai-mistake-input"
                      maxLength={8000}
                      rows={8}
                      value={rawAIText}
                      onChange={e => setRawAIText(e.target.value)}
                      placeholder={`Ví dụ bạn chỉ cần dán đoạn sau:

Câu 142 Part 5:
Ms. Watson requested that all expense reports ______ submitted to the accounting department.
(A) are  (B) be  (C) were  (D) will be
Tôi chọn A vì nghĩ reports là số nhiều.
Đáp án chuẩn: B.`}
                      className="w-full min-h-[200px] sm:min-h-[220px] p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:shadow-[3px_3px_0px_0px_#0f172a] dark:focus:shadow-[3px_3px_0px_0px_#cbd5e1] font-mono text-xs sm:text-sm leading-relaxed transition-all resize-y"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={aiConsent} onChange={event => setAIConsent(event.target.checked)} className="mt-0.5" />
                    <span>Tôi đồng ý gửi nội dung này tới Google để phân tích. Gemini Free có thể dùng nội dung để cải thiện sản phẩm.</span>
                  </label>
                  <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />

                  {/* Thông báo lỗi nếu có */}
                  {aiError && (
                    <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/60 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] text-rose-950 dark:text-rose-200 flex items-start gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
                      <span>{aiError}</span>
                    </div>
                  )}

                  {/* Nút Phân Tích Neo */}
                  <div className="pt-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t-2 border-slate-900 dark:border-slate-700">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      ⚡ Tự động trích xuất Part, Bẫy đề thi, Lý do sai & Bí kíp 10s
                    </span>

                    <button
                      type="button"
                      onClick={handleRunAIExtract}
                      disabled={isAILoading || !aiConsent}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs border-2 border-slate-900 dark:border-slate-200 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      {isAILoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>AI Đang Phân Tích...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>AI Phân Tích Bẫy</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )
            )}

            {/* TH 2: FORM NHẬP / SỬA THỦ CÔNG NEO */}
            {(modalMode === 'MANUAL' || editingMistake) && (
              <form onSubmit={handleCreateMistake} className="space-y-3 text-xs font-medium">
                {manualNotice && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{manualNotice}</p>}
                
                {/* Nút quay lại Preview nếu chuyển từ AI sang */}
                {!editingMistake && aiStep === 'PREVIEW' && (
                  <button
                    type="button"
                    onClick={() => setModalMode('AI_PARSE')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                  >
                    ← Quay lại thẻ xem trước
                  </button>
                )}

                {/* Hàng 1: Part & Phân loại lỗi */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-900 dark:text-white font-black mb-1">Part</label>
                    <select
                      value={newMistake.part}
                      onChange={e => setNewMistake({ ...newMistake, part: Number(e.target.value) as any })}
                      className="w-full py-2 px-3 font-bold rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:shadow-[2px_2px_0px_0px_#0f172a] text-xs"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map(p => (
                        <option key={p} value={p}>Part {p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-900 dark:text-white font-black mb-1">Phân loại lỗi</label>
                    <select
                      value={newMistake.category}
                      onChange={e => setNewMistake({ ...newMistake, category: e.target.value as any })}
                      className="w-full py-2 px-3 font-bold rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:shadow-[2px_2px_0px_0px_#0f172a] text-xs"
                    >
                      {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => (
                        <option key={cat} value={cat}>{val.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Hàng 2: Câu hỏi / Ngữ cảnh */}
                <div>
                  <label className="block text-slate-900 dark:text-white font-black mb-1">
                    Câu hỏi / Ngữ cảnh <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="vd: Ms. Watson requested that all expense reports ______ submitted to the accounting department."
                    value={newMistake.questionContext}
                    onChange={e => setNewMistake({ ...newMistake, questionContext: e.target.value })}
                    className="w-full py-2 px-3 font-mono text-xs rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:shadow-[2px_2px_0px_0px_#0f172a] resize-y leading-relaxed"
                  />
                </div>

                {/* Hàng 3: 4 Phương án trắc nghiệm A, B, C, D */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-900 dark:text-white font-black text-xs">
                      4 Phương án trắc nghiệm
                    </label>
                    {newMistake.part === 2 && (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500">
                        Part 2 chỉ gồm 3 lựa chọn A, B, C
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {([
                      { letter: 'A', value: newMistake.optA, key: 'optA' as const, badgeBg: 'bg-amber-300 text-slate-950' },
                      { letter: 'B', value: newMistake.optB, key: 'optB' as const, badgeBg: 'bg-emerald-300 text-slate-950' },
                      { letter: 'C', value: newMistake.optC, key: 'optC' as const, badgeBg: 'bg-sky-300 text-slate-950' },
                      ...(newMistake.part === 2 ? [] : [{ letter: 'D', value: newMistake.optD, key: 'optD' as const, badgeBg: 'bg-purple-300 text-slate-950' }])
                    ]).map(({ letter, value, key, badgeBg }) => (
                      <div
                        key={letter}
                        className="flex items-center rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-[2px_2px_0px_0px_#0f172a] focus-within:border-blue-600 transition-all"
                      >
                        <span className={`w-9 h-9 font-black font-mono text-xs border-r-2 border-slate-900 dark:border-slate-700 flex items-center justify-center select-none shrink-0 ${badgeBg}`}>
                          {letter}
                        </span>

                        <input
                          type="text"
                          placeholder={`Nội dung phương án (${letter})...`}
                          value={value}
                          onChange={e => {
                            const val = e.target.value;
                            setNewMistake(prev => ({
                              ...prev,
                              [key]: val,
                              ...(prev.correctLetter === letter ? { correctAnswer: formatOptionSlot(letter, val) } : {})
                            }));
                          }}
                          className="w-full px-3 py-1.5 font-mono text-xs bg-transparent text-slate-900 dark:text-white focus:outline-none"
                        />
                      </div>
                    ))}

                    {newMistake.part === 2 && (
                      <div className="h-9 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-[11px] font-bold text-slate-400 italic">
                        (Part 2 không có lựa chọn D)
                      </div>
                    )}
                  </div>
                </div>

                {/* Hàng 4: Phiếu Tô Trắc Nghiệm Thông Minh */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* Cột 1: Chọn Đáp Án Đúng */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      ✅ Đáp án đúng:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(['A', 'B', 'C', ...(newMistake.part === 2 ? [] : ['D'])] as const).map(letter => {
                        const isSelected = newMistake.correctLetter === letter;
                        const slotVal = (newMistake as any)[`opt${letter}`] || '';
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => {
                              setNewMistake(prev => {
                                const nextCorrect = (prev.correctLetter === letter ? '' : letter) as '' | 'A' | 'B' | 'C' | 'D';
                                const nextWrong = (prev.wrongLetter === letter ? '' : prev.wrongLetter) as '' | 'A' | 'B' | 'C' | 'D';
                                return {
                                  ...prev,
                                  correctLetter: nextCorrect,
                                  wrongLetter: nextWrong,
                                  correctAnswer: nextCorrect ? formatOptionSlot(letter, slotVal) : ''
                                };
                              });
                            }}
                            className={`w-8 h-8 rounded-full border-2 border-slate-900 font-mono font-black text-xs transition-all cursor-pointer flex items-center justify-center ${
                              isSelected
                                ? 'bg-emerald-500 text-white shadow-[2px_2px_0px_0px_#0f172a] -translate-y-0.5 ring-2 ring-emerald-300 dark:ring-emerald-600'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-[1px_1px_0px_0px_#0f172a]'
                            }`}
                            title={`Chọn (${letter}) làm đáp án đúng`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                      {newMistake.correctLetter && (
                        <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 font-mono ml-1 truncate max-w-[140px]">
                          ({newMistake.correctLetter}) {(newMistake as any)[`opt${newMistake.correctLetter}`] || ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cột 2: Chọn Phương Án Đã Nhầm */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      ❌ Bạn đã chọn nhầm (tùy chọn):
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(['A', 'B', 'C', ...(newMistake.part === 2 ? [] : ['D'])] as const).map(letter => {
                        const isSelected = newMistake.wrongLetter === letter;
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => {
                              setNewMistake(prev => {
                                const nextWrong = (prev.wrongLetter === letter ? '' : letter) as '' | 'A' | 'B' | 'C' | 'D';
                                const nextCorrect = (prev.correctLetter === letter ? '' : prev.correctLetter) as '' | 'A' | 'B' | 'C' | 'D';
                                return {
                                  ...prev,
                                  wrongLetter: nextWrong,
                                  correctLetter: nextCorrect
                                };
                              });
                            }}
                            className={`w-8 h-8 rounded-full border-2 border-slate-900 font-mono font-black text-xs transition-all cursor-pointer flex items-center justify-center ${
                              isSelected
                                ? 'bg-rose-500 text-white shadow-[2px_2px_0px_0px_#0f172a] -translate-y-0.5 ring-2 ring-rose-300 dark:ring-rose-600'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-[1px_1px_0px_0px_#0f172a]'
                            }`}
                            title={`Đánh dấu bạn đã chọn nhầm (${letter})`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                      {newMistake.wrongLetter && (
                        <span className="text-[11px] font-bold text-rose-800 dark:text-rose-400 font-mono ml-1 truncate max-w-[140px]">
                          ({newMistake.wrongLetter}) {(newMistake as any)[`opt${newMistake.wrongLetter}`] || ''}
                        </span>
                      )}
                    </div>
                  </div>

                </div>

                {/* Hàng 5: Nút hành động */}
                <div className="pt-3 flex items-center justify-between border-t-2 border-slate-900 dark:border-slate-700">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hidden sm:inline">
                    ⚡ Tô tròn đáp án đúng và đáp án bạn đã chọn nhầm
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 rounded-xl font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-slate-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs border-2 border-slate-900 dark:border-slate-200 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                    >
                      {editingMistake ? 'Lưu Thay Đổi' : 'Lưu Vào Sổ Tay'}
                    </button>
                  </div>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* 4. MODAL THỬ THÁCH VƯỢT BẪY (TRAP QUIZ MODAL) */}
      <TrapQuizModal
        mistake={quizMistake}
        isOpen={isQuizOpen}
        onClose={() => {
          setIsQuizOpen(false);
          setQuizMistake(null);
        }}
        onToggleStatus={onToggleStatus}
      />

    </div>
  );
};
