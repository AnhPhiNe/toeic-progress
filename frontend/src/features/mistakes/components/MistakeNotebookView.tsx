import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { AlertTriangle, Brain, Pencil, Plus, Search, SlidersHorizontal, Sparkles, Loader2, X, BookOpen } from 'lucide-react';
import { MistakeEntry, ErrorCategory, ERROR_CATEGORY_LABELS } from '@/shared/types';
import { 
  extractMistakeWithAI, 
  getDemoSampleInput,
  getAIUsage,
  getAIConfiguration
} from '@/features/mistakes/services/aiMistakeExtractor';
import { MistakeCard, PartBadge, splitQuestion } from '@/features/mistakes/components/MistakeCard';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { carryStructured, type StructuredSource } from '@/features/mistakes/lib/structuredFields';
import { isDueForReview } from '@/features/mistakes/lib/spacedRepetition';
import { getUserChoice, optionLetter, reasonAfterChoice } from '@/features/mistakes/lib/userChoice';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import type { AIUsage, AIMistakeParseResult, AIConfiguration } from '@/features/mistakes/services/aiMistakeExtractor';

interface MistakeNotebookViewProps {
  mistakes: MistakeEntry[];
  /** Số thẻ tới hạn ôn hôm nay (SPEC mục 4.6) */
  dueCount: number;
  /** Mở phiên ôn cho các thẻ được chọn; không truyền thì ôn mọi thẻ đến hạn */
  onStartReview: (mistakeIds?: string[]) => void;
  onAddMistake: (mistake: MistakeEntry) => void;
  onMarkMastered: (mistakeId: string) => void;
  /** Đưa thẻ đã thông suốt về đầu lịch ôn */
  onReopenCards: (mistakeIds: string[]) => void;
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
  answerSource: undefined as MistakeEntry['answerSource'],
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
  onMarkMastered,
  onReopenCards,
  onDeleteMistake,
  onUpdateMistake
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'DUE' | 'MASTERED'>('ALL');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');

  // Quản lý các dòng đang mở rộng chi tiết (Mặc định thu gọn gọn gàng)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  // Modal thêm mới / sửa
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMistake, setEditingMistake] = useState<MistakeEntry | null>(null);
  const [newMistake, setNewMistake] = useState({ ...EMPTY_FORM });

  // Trường có cấu trúc của bản nháp AI hoặc thẻ đang sửa, giữ lại khi lưu nếu nội dung không đổi
  const [structured, setStructured] = useState<StructuredSource | null>(null);
  const [manualNotice, setManualNotice] = useState('');

  // AI Extract States
  const [modalMode, setModalMode] = useState<'AI_PARSE' | 'MANUAL'>('AI_PARSE');
  const [aiStep, setAiStep] = useState<'INPUT' | 'PREVIEW'>('INPUT');
  const [rawAIText, setRawAIText] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUsage, setAIUsage] = useState<AIUsage | null>(null);
  const [aiConfiguration, setAIConfiguration] = useState<AIConfiguration | null>(null);
  const [aiConfigurationLoading, setAIConfigurationLoading] = useState(false);
  const [aiConfigurationRetry, setAIConfigurationRetry] = useState(0);
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
    setAIConfiguration(null);
    setAIConfigurationLoading(true);
    setAIConsent(false);
    setAiError(null);
    void getAIConfiguration().then(configuration => {
      if (!cancelled) setAIConfiguration(configuration);
    }).catch(reason => {
      if (!cancelled) setAiError(reason instanceof Error ? reason.message : 'Chưa kết nối được AI.');
    }).finally(() => {
      if (!cancelled) setAIConfigurationLoading(false);
    });
    void getAIUsage().then(usage => {
      if (!cancelled) setAIUsage(usage);
    }).catch(() => { /* Quota lookup failure leaves manual entry and the AI request available. */ });
    return () => { cancelled = true; };
  }, [isAddModalOpen, modalMode, aiConfigurationRetry]);

  const openCreate = () => {
    setManualNotice('');
    setEditingMistake(null);
    setNewMistake({ ...EMPTY_FORM });
    setModalMode('AI_PARSE');
    setAiStep('INPUT');
    setRawAIText('');
    setAiError(null);
    setAIConfiguration(null);
    setAIConfigurationLoading(true);
    setAIConsent(false);
    setAIReviewed(false);
    setAIMissingInformation([]);
    setAIIsDemo(false);
    setStructured(null);
    setIsAddModalOpen(true);
  };

  const openEdit = (m: MistakeEntry) => {
    setManualNotice('');
    setEditingMistake(m);
    setStructured({ options: m.options ?? [], trapTip: m.trapTip ?? '', optionNotes: m.optionNotes ?? [], explanation: m.explanation ?? null });
    const slots = parseOptionsTextToSlots((m.options || []).join('\n'));

    const correctLetter = optionLetter(m.correctAnswer);
    const wrongLetter = getUserChoice(m);
    // Only the "(A) text - " prefix the manual form wrote is removed; free text stays as written.
    const wrongReason = reasonAfterChoice(
      m.userMistake,
      wrongLetter ? (formatOptionSlot(wrongLetter, slots[`opt${wrongLetter}`]) || `(${wrongLetter})`) : ''
    );

    setNewMistake({
      part: m.part,
      questionContext: m.questionContext,
      userMistake: m.userMistake,
      correctAnswer: m.correctAnswer,
      answerSource: m.answerSource,
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
    const correctLetter = optionLetter(newMistake.correctAnswer) || newMistake.correctLetter;
    // The AI draft already carries the choice (userChoice); its narrated reason is kept as written.
    const wrongLetter = newMistake.wrongLetter;
    const wrongReason = newMistake.wrongReason || newMistake.userMistake;

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
    setAIConfigurationLoading(false);
    setIsAddModalOpen(false);
    setEditingMistake(null);
    setAiError(null);
    setAiStep('INPUT');
  }, [removeCaptcha]);
  const modalRef = useModalA11y(isAddModalOpen, closeModal);

  const showDraft = (draft: AIMistakeParseResult, demo = false) => {
    const slots = parseOptionsTextToSlots(draft.options.join('\n'));
    const correctLetter = optionLetter(draft.correctAnswer);
    setNewMistake({
      ...EMPTY_FORM, ...slots, part: (draft.part ?? 5) as 1 | 2 | 3 | 4 | 5 | 6 | 7, category: draft.category,
      questionContext: draft.questionContext, userMistake: draft.userMistake,
      correctAnswer: draft.correctAnswer, answerSource: draft.answerSource, trapTip: draft.trapTip, correctLetter,
      wrongLetter: draft.userChoice,
      optionsText: draft.options.join('\n'), tags: draft.tags.join(', ')
    });
    setStructured({ options: draft.options, trapTip: draft.trapTip, optionNotes: draft.optionNotes, explanation: draft.explanation });
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
    if (!aiConsent || !aiConfiguration) { setAiError('Xác nhận gửi nội dung tới AI trước khi phân tích.'); return; }
    const run = ++aiGeneration.current;
    try {
      setIsAILoading(true);
      setAiError(null);
      const { draft, usage } = await extractMistakeWithAI(rawAIText, getCaptcha,
        aiConfiguration.requireProviderConsent ? aiConfiguration.provider : undefined);
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
      answerSource: newMistake.answerSource,
      userChoice: newMistake.wrongLetter || undefined,
      ...carryStructured(structured, parsedOptions, newMistake.trapTip),
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

  const stats = useMemo(() => ({
    total: mistakes.length,
    due: mistakes.filter(m => isDueForReview(m)).length,
    mastered: mistakes.filter(m => m.status === 'MASTERED').length
  }), [mistakes]);

  const filteredMistakes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return mistakes.filter(m => {
      const matchSearch = !term || [m.questionContext, m.userMistake, m.correctAnswer, m.trapTip ?? '', ...m.tags]
        .some(value => value.toLowerCase().includes(term));
      const matchPart = selectedPart === 'ALL' || m.part === selectedPart;
      const matchStatus = selectedStatus === 'ALL'
        || (selectedStatus === 'DUE' ? isDueForReview(m) : m.status === 'MASTERED');
      const matchCategory = selectedCategory === 'ALL' || m.category === selectedCategory;
      return matchSearch && matchPart && matchStatus && matchCategory;
    });
  }, [mistakes, searchTerm, selectedPart, selectedStatus, selectedCategory]);

  const activeFilterCount = (selectedPart === 'ALL' ? 0 : 1) + (selectedCategory === 'ALL' ? 0 : 1) + (searchTerm.trim() ? 1 : 0);
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedPart('ALL');
    setSelectedStatus('ALL');
    setSelectedCategory('ALL');
  };

  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [filterOpen]);

  const toggleRow = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      const finalOptions = parsedOptions.length > 0 ? parsedOptions : editingMistake.options ?? [];
      onUpdateMistake({
        ...editingMistake,
        part: newMistake.part,
        questionContext: newMistake.questionContext,
        userMistake: finalUserMistake,
        correctAnswer: finalCorrectAnswer,
        answerSource: finalCorrectAnswer ? (newMistake.answerSource === 'AI_PROPOSED' ? 'AI_PROPOSED' : 'PROVIDED') : 'MISSING',
        userChoice: newMistake.wrongLetter || undefined,
        ...carryStructured(structured, finalOptions, newMistake.trapTip),
        trapTip: newMistake.trapTip,
        options: finalOptions.length > 0 ? finalOptions : undefined,
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
      answerSource: finalCorrectAnswer ? (newMistake.answerSource === 'AI_PROPOSED' ? 'AI_PROPOSED' : 'PROVIDED') : 'MISSING',
      userChoice: newMistake.wrongLetter || undefined,
      ...carryStructured(structured, parsedOptions, newMistake.trapTip),
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

  // Bản nháp AI dùng cùng cách hiển thị câu hỏi và phương án với thẻ trong sổ tay
  const draftQuestion = splitQuestion(newMistake.questionContext);
  const draftQuiz = resolveQuizOptions({
    questionContext: newMistake.questionContext,
    options: newMistake.optionsText.split(/\r?\n/).map(option => option.trim()).filter(Boolean),
    correctAnswer: newMistake.correctAnswer,
    optionNotes: structured?.optionNotes
  });

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[26px]">
          Sổ Tay Bắt Bẫy & Lỗi Sai
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => onStartReview()}
            disabled={dueCount === 0}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition-all ${
              dueCount > 0
                ? 'cursor-pointer border-2 border-slate-900 bg-emerald-400 text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] hover:bg-emerald-300 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                : 'cursor-not-allowed border-2 border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <Brain className="h-4 w-4 shrink-0" />
            {dueCount > 0
              ? <span>Ôn {dueCount} thẻ<span className="hidden sm:inline"> đến hạn</span></span>
              : <span>Chưa có thẻ<span className="hidden sm:inline"> đến hạn</span></span>}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-yellow-300 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] transition-all hover:bg-yellow-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" />
            <span>Ghi Chú Bẫy</span>
          </button>
        </div>
      </div>

      {mistakes.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[13px] font-semibold" role="group" aria-label="Lọc theo trạng thái">
            {([['ALL', 'Tất cả', stats.total], ['DUE', 'Đến hạn', stats.due], ['MASTERED', 'Thông suốt', stats.mastered]] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={selectedStatus === value}
                onClick={() => setSelectedStatus(value)}
                className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 ${
                  selectedStatus === value
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {label} {count}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm câu hỏi, mẹo…"
                aria-label="Tìm trong sổ tay"
                className="w-64 rounded-lg border-2 border-slate-300 bg-white py-1.5 pl-8 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div ref={filterRef} className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen(value => !value)}
                aria-expanded={filterOpen}
                aria-label="Bộ lọc"
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-[13px] font-semibold ${
                  activeFilterCount > 0
                    ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
                    : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Lọc</span>
                {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
              </button>
              {filterOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border-2 border-slate-900 bg-white p-3 shadow-[3px_3px_0px_#0f172a] dark:border-slate-600 dark:bg-[#121A2B]">
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Tìm câu hỏi, mẹo…"
                    aria-label="Tìm trong sổ tay"
                    className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:hidden"
                  />
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Part
                    <select
                      value={selectedPart}
                      onChange={e => setSelectedPart(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                      className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="ALL">Mọi Part</option>
                      {[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>Part {p}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nguyên nhân
                    <select
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value as ErrorCategory | 'ALL')}
                      className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="ALL">Mọi nguyên nhân</option>
                      {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => <option key={cat} value={cat}>{val.label}</option>)}
                    </select>
                  </label>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={resetFilters} className="cursor-pointer text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Đặt lại bộ lọc
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mistakes.length === 0 ? (
        <div className="space-y-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-12 text-center dark:border-slate-700">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">Chưa có lỗi sai nào</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Bấm “Ghi Chú Bẫy”, dán câu bạn làm sai và AI sẽ soạn ghi chú.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a] dark:divide-slate-800 dark:border-slate-700 dark:bg-[#121A2B]">
          {filteredMistakes.map(mistake => (
            <MistakeCard
              key={mistake.id}
              mistake={mistake}
              expanded={expandedIds.has(mistake.id)}
              onToggle={() => toggleRow(mistake.id)}
              onReview={() => onStartReview([mistake.id])}
              onEdit={() => openEdit(mistake)}
              onDelete={() => { if (window.confirm('Xóa lỗi này khỏi sổ tay?')) onDeleteMistake(mistake.id); }}
              onMarkMastered={() => onMarkMastered(mistake.id)}
              onReopen={() => onReopenCards([mistake.id])}
            />
          ))}
          {filteredMistakes.length === 0 && (
            <div className="space-y-2 px-4 py-10 text-center text-sm">
              <p className="text-slate-600 dark:text-slate-400">Không có thẻ nào khớp bộ lọc.</p>
              <button type="button" onClick={resetFilters} className="cursor-pointer font-semibold text-blue-600 dark:text-blue-400">Đặt lại bộ lọc</button>
            </div>
          )}
        </div>
      )}

      {/* 4. MODAL: GHI CHÚ BẪY (CHUẨN PHONG CÁCH NEO-BRUTALISM) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="mistake-modal-title" className="w-full max-w-2xl sm:max-w-3xl rounded-2xl bg-white dark:bg-[#111A2C] border-2 border-slate-900 dark:border-slate-200 shadow-[6px_6px_0px_0px_#0f172a] dark:shadow-[6px_6px_0px_0px_#cbd5e1] p-4 sm:p-6 space-y-3.5 sm:space-y-4 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between gap-3">
              <h3 id="mistake-modal-title" className="text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-white">
                {editingMistake
                  ? 'Sửa Ghi Chú Bẫy'
                  : modalMode === 'AI_PARSE' && aiStep === 'PREVIEW'
                  ? (aiIsDemo ? 'Mẫu minh họa có sẵn' : 'Bản nháp AI')
                  : 'Ghi Chú Bẫy & Lỗi Sai Mới'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Đóng"
                title="Đóng (Esc)"
                className="cursor-pointer rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
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
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                    <PartBadge part={newMistake.part} />
                    <span>{ERROR_CATEGORY_LABELS[newMistake.category]?.label}</span>
                    <button
                      type="button"
                      onClick={handleSwitchToManual}
                      className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-slate-300 px-3 py-1 text-[13px] font-semibold text-slate-700 hover:border-slate-500 dark:border-slate-600 dark:text-slate-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Sửa
                    </button>
                  </div>

                  <p className="text-[16px] font-semibold leading-relaxed text-slate-900 dark:text-white">{draftQuestion.question}</p>
                  {draftQuestion.context && (
                    <p className="whitespace-pre-line border-l-[3px] border-slate-300 pl-3 text-sm leading-relaxed text-slate-600 dark:border-slate-600 dark:text-slate-300">{draftQuestion.context}</p>
                  )}

                  {draftQuiz.options.length > 0 ? (
                    <OptionList
                      options={draftQuiz.options}
                      chosen={newMistake.wrongLetter}
                      correctLabel={newMistake.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án của đề'}
                    />
                  ) : newMistake.correctAnswer && (
                    <p className="text-sm text-slate-700 dark:text-slate-300"><span className="font-bold text-slate-900 dark:text-white">Đáp án:</span> {newMistake.correctAnswer}</p>
                  )}

                  <ExplanationView
                    explanation={structured?.explanation}
                    trapTip={newMistake.trapTip}
                    collapsible={false}
                    extra={[['Bạn đã nhầm', newMistake.userMistake]]}
                  />

                  {(aiIsDemo || aiMissingInformation.length > 0) && (
                    <div className="space-y-1 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      {aiIsDemo && <p className="font-semibold">Đây là ví dụ có sẵn, không phải kết quả phân tích nội dung bạn nhập.</p>}
                      {aiMissingInformation.map((item, index) => <p key={index}>{item}</p>)}
                    </div>
                  )}

                  <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t-2 border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#111A2C] sm:-mx-6 sm:-mb-6 sm:px-6">
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={aiReviewed} onChange={event => setAIReviewed(event.target.checked)} className="h-4 w-4 accent-slate-900" />
                      <span>Tôi đã kiểm tra nội dung và đáp án trước khi lưu.</span>
                    </label>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAiStep('INPUT')}
                        className="cursor-pointer px-3 py-2 text-[13px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                      >
                        Dán câu khác
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveFromAIPreview}
                        disabled={!aiReviewed}
                        className="cursor-pointer rounded-xl border-2 border-slate-900 bg-emerald-400 px-5 py-2 text-sm font-extrabold text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] transition-all hover:bg-emerald-300 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Lưu Vào Sổ Tay
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* BƯỚC 1: DÁN CÂU HỎI VÀO */
                <div className="space-y-3.5 text-xs">
                  
                  <div className="rounded-xl bg-slate-50 p-3 text-slate-600 dark:bg-slate-900 dark:text-slate-300" role="status">
                    {aiUsage?.unlimited
                      ? 'Tài khoản của bạn được miễn hạn mức AI của website. Vẫn áp dụng giới hạn của nhà cung cấp AI.'
                      : aiUsage ? `Còn ${aiUsage.remaining}/${aiUsage.limit} lượt AI${aiUsage.guest ? ' dùng thử cho khách' : ' trong tháng'}.`
                        : 'Khách được thử 3 lượt AI; tài khoản có 10 lượt/tháng. Tổng hạn mức beta có giới hạn.'}
                    <p className="mt-1">Kết quả là bản nháp để bạn kiểm tra và chỉnh sửa trước khi lưu.</p>
                    {aiConfiguration?.provider === 'openai' && <p className="mt-1">Đáp án nguồn là tùy chọn. Chưa có thì AI sẽ tự giải khi đủ dữ liệu và ghi rõ đáp án đề xuất.</p>}
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
                    <input type="checkbox" checked={aiConsent} disabled={!aiConfiguration} onChange={event => setAIConsent(event.target.checked)} className="mt-0.5" />
                    <span aria-live="polite">{!aiConfiguration
                      ? aiConfigurationLoading ? 'Đang kiểm tra kết nối AI…' : 'AI chưa sẵn sàng. Bạn có thể thử kết nối lại hoặc nhập thủ công.'
                      : aiConfiguration.provider === 'openai' ? 'Tôi đồng ý gửi nội dung này tới OpenAI để phân tích.'
                        : 'Tôi đồng ý gửi nội dung này tới Google để phân tích. Gemini Free có thể dùng nội dung để cải thiện sản phẩm.'}</span>
                  </label>
                  <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />

                  {/* Thông báo lỗi nếu có */}
                  {aiError && (
                    <div role="alert" className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/60 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] text-rose-950 dark:text-rose-200 flex flex-wrap items-start gap-2 font-bold">
                      <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
                      <span className="flex-1 min-w-0">{aiError}</span>
                      {!aiConfiguration && !aiConfigurationLoading && (
                        <button type="button" onClick={() => setAIConfigurationRetry(value => value + 1)}
                          className="px-3 py-2 rounded-lg border-2 border-slate-900 dark:border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                          Thử kết nối lại
                        </button>
                      )}
                    </div>
                  )}

                  {/* Nút Phân Tích Neo */}
                  <div className="pt-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t-2 border-slate-900 dark:border-slate-700">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      ⚡ Trích xuất câu hỏi, dịch nghĩa, phân tích bẫy & mẹo ghi nhớ
                    </span>

                    <button
                      type="button"
                      onClick={handleRunAIExtract}
                      disabled={isAILoading || !aiConsent || !aiConfiguration}
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
                              ...(prev.correctLetter === letter ? { correctAnswer: formatOptionSlot(letter, val), answerSource: 'PROVIDED' } : {})
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
                                  correctAnswer: nextCorrect ? formatOptionSlot(letter, slotVal) : '',
                                  answerSource: nextCorrect ? 'PROVIDED' : 'MISSING'
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

    </div>
  );
};
