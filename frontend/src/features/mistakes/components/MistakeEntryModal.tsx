import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration, AIUsage, AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { CHOICE_LETTERS, inputText, learnerMistake, parsePastedQuestion, type ChoiceLetter, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { PartBadge } from '@/features/mistakes/components/MistakeCard';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import { normalizeTestName, testNameKey } from '@/features/mistakes/lib/sourceTests';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { ScrollableModalBody } from '@/shared/components/ScrollableModalBody';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { QuestionContext } from '@/features/mistakes/components/QuestionContext';
import { MistakeImages, ImageComparison } from '@/features/mistakes/components/MistakeImages';
import { prepareImage, MAX_CONTEXT_IMAGES, type PreparedImage } from '@/features/mistakes/lib/imageInput';
import { mistakeInstructions } from '@/features/mistakes/lib/mistakeInstructions';
import { SourceImageViewer } from '@/features/mistakes/components/SourceImageViewer';
import { sourceImageAccount, uploadSourceImages } from '@/features/mistakes/services/sourceImages';
import { MistakeContextInput } from '@/features/mistakes/components/MistakeContextInput';

interface Props {
  original: MistakeEntry | null;
  sourceSuggestions?: string[];
  initialSourceName?: string;
  initialReading?: string;
  initialSourceImageIds?: string[];
  onAdd: (entry: MistakeEntry) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  onClose: () => void;
  onReload: () => void;
  onSaved?: (message: string) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-sans text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const linkClass = 'cursor-pointer text-[13px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300';
const primaryClass = 'cursor-pointer rounded-xl border-2 border-slate-900 px-4 py-2.5 text-sm font-extrabold shadow-[3px_3px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40';
const categoryChoices: Record<ErrorCategory, string> = {
  VOCABULARY_TRAP: 'Từ vựng / Paraphrase', ADVANCED_GRAMMAR: 'Ngữ pháp',
  LISTENING_SPEED: 'Nghe / Nối âm', TIME_PRESSURE: 'Thiếu thời gian',
  CARELESS_DISTRACTION: 'Mất tập trung / Đọc ẩu', OTHER: 'Khác',
};

function storedDraft(entry: MistakeEntry): AIMistakeParseResult {
  return { part: entry.part, questionContext: entry.questionContext, category: entry.category,
    question: entry.question, context: entry.context,
    userMistake: entry.userMistake, correctAnswer: entry.correctAnswer,
    answerSource: entry.answerSource ?? (entry.correctAnswer ? 'PROVIDED' : 'MISSING'),
    options: entry.options ?? [], tags: entry.tags, trapTip: entry.trapTip ?? '', optionNotes: entry.optionNotes ?? [],
    explanation: entry.explanation ?? null, userChoice: getUserChoice(entry), userChoiceState: entry.userChoiceState,
    userReason: entry.userReason, missingInformation: [] };
}

const letterOf = (option: string, index: number): ChoiceLetter => optionLetter(option) || CHOICE_LETTERS[index];

function originalQuestion(entry: MistakeEntry, separateReading = false): string {
  if (separateReading && typeof entry.question === 'string') return entry.question;
  return entry.question !== undefined ? [entry.question, entry.context].filter(Boolean).join('\n\n') : entry.questionContext;
}

export function MistakeEntryModal({ original, sourceSuggestions = [], initialSourceName = '', initialReading = '', initialSourceImageIds = [], onAdd, onUpdate, onClose, onReload, onSaved }: Props) {
  const initialImages = original?.sourceImageIds ?? initialSourceImageIds;
  const initialContext = initialImages.length ? '' : typeof original?.question === 'string' ? original.context ?? '' : initialReading;
  const hasInitialReading = (original?.part ?? 7) === 7 && (Boolean(initialContext.trim()) || Boolean(initialImages.length));
  const [contextText, setContextText] = useState(initialContext);
  const [contextMode, setContextMode] = useState<'text' | 'image'>(original?.part === 1 || initialImages.length ? 'image' : 'text');
  const [reading, setReading] = useState<{ text: string; images: PreparedImage[] } | null>(hasInitialReading ? { text: initialContext, images: [] } : null);
  const [imageIdsDraft, setSourceImageIds] = useState<string[]>(initialImages);
  const sourceImageIds = contextMode === 'image' ? imageIdsDraft : [];
  const uploadedImageKey = useRef('');
  const [persisting, setPersisting] = useState(false);
  const [step, setStep] = useState<'input' | 'preview' | 'saved'>('input');
  const [saveMoreReceipt, setSaveMoreReceipt] = useState(false);
  const [raw, setRaw] = useState(original ? [originalQuestion(original, Boolean(initialContext.trim()) || Boolean(initialImages.length)), ...(original.options ?? [])].join('\n') : '');
  const [part, setPart] = useState<MistakeEntry['part'] | null>(original?.part ?? (hasInitialReading ? 7 : null));
  const [choice, setChoice] = useState<ChoiceLetter | 'UNKNOWN' | 'BLANK' | ''>(original ? (original.userChoiceState === 'BLANK' ? 'BLANK' : getUserChoice(original) || 'UNKNOWN') : '');
  const [reason, setReason] = useState(original?.userReason ?? '');
  const [sourceTest, setSourceTest] = useState(original?.sourceTestName ?? initialSourceName);
  const [keyOpen, setKeyOpen] = useState(false);
  const sourceTestName = sourceSuggestions.find(name => testNameKey(name) === testNameKey(sourceTest)) ?? normalizeTestName(sourceTest);
  const [source, setSource] = useState<ChoiceLetter | ''>(original?.answerSource === 'PROVIDED' ? optionLetter(original.correctAnswer) : '');
  const initialSource = useRef(source);
  const [corrected, setCorrected] = useState<{ question: string; options: string[] } | null>(original ? { question: originalQuestion(original, Boolean(initialContext.trim()) || Boolean(initialImages.length)),
    options: (original.options ?? []).map((option, index) => /^\([A-D]\)/i.test(option) ? option : `(${CHOICE_LETTERS[index]}) ${option}`) } : null);
  const [draft, setDraft] = useState<AIMistakeParseResult | null>(original ? storedDraft(original) : null);
  const [manual, setManual] = useState(false);
  const [answerProvidedBy, setAnswerProvidedBy] = useState(original?.answerProvidedBy);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [aiAccess, setAIAccess] = useState<AIUsage | null>(null);
  const [configBusy, setConfigBusy] = useState(true);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imageDrafts, setImages] = useState<PreparedImage[]>([]);
  const images = contextMode === 'image' ? imageDrafts : [];
  const [imageBusy, setImageBusy] = useState(false);
  const draftImages = useRef('');
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (!saveMoreReceipt) return;
    if (changed) { setSaveMoreReceipt(false); return; }
    const timeout = window.setTimeout(() => setSaveMoreReceipt(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [saveMoreReceipt, changed]);
  const [category, setCategory] = useState<ErrorCategory>(original?.category ?? 'OTHER');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | ''>(original?.category ?? '');
  const [tags, setTags] = useState(original?.tags.join(', ') ?? '');
  const requestEpoch = useRef(0);
  const saving = useRef(false);
  const entryId = useRef(crypto.randomUUID());
  const draftInput = useRef('');
  const saved = useRef(false);
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const parsed = useMemo(() => parsePastedQuestion(raw, part), [raw, part]);
  const question = corrected?.question ?? parsed.question;
  const options = corrected?.options.filter(Boolean) ?? parsed.options;
  const context = contextMode === 'text' ? contextText : config?.persistentImages && (images.length || sourceImageIds.length) ? '' : reading?.text ?? '';
  const effectivePart = part;
  const instructions = mistakeInstructions(effectivePart);
  const choiceLetters = CHOICE_LETTERS.slice(0, effectivePart === 2 ? 3 : 4);
  const freeformReady = Boolean(config?.freeformInput && raw.trim());
  const choicesReady = freeformReady || options.length > 0 && (corrected !== null || !parsed.error);
  const input: MistakeInput = { question, options, context, part: effectivePart,
    userChoiceState: CHOICE_LETTERS.includes(choice as ChoiceLetter) ? 'CHOSEN' : choice === 'BLANK' ? 'BLANK' : 'UNKNOWN',
    userChoice: CHOICE_LETTERS.includes(choice as ChoiceLetter) ? choice as ChoiceLetter : '', userReason: reason, sourceAnswer: source,
    ...(selectedCategory ? { errorCategory: selectedCategory } : {}) };
  const currentInput = inputText(input);
  const imageKey = images.length ? images.map(image => image.id).join(',') : sourceImageIds.join(',');
  const imageOnlySource = sourceImageIds.length > 0 || Boolean(config?.persistentImages && images.length);
  const initialInput = useRef(currentInput);
  if (original && !draftInput.current) draftInput.current = initialInput.current;

  useEffect(() => {
    let cancelled = false;
    setConfigBusy(true);
    void aiService.getAIConfiguration().then(async value => {
      const access = value.managedAccess ? await aiService.getAIUsage() ?? { remaining: 0, limit: 0, guest: true, enabled: false,
        accessStatus: 'login_required' as const, accessMessage: 'Đăng nhập Google để đăng ký dùng AI. Tài khoản cần được duyệt trước khi phân tích.' } : null;
      if (!cancelled) { setConfig(value); setAIAccess(access); setError(''); }
    })
      .catch(value => { if (!cancelled) setError(value instanceof Error ? value.message : 'Chưa kết nối được AI.'); })
      .finally(() => { if (!cancelled) setConfigBusy(false); });
    return () => { cancelled = true; };
  }, [configAttempt]);
  useEffect(() => () => { requestEpoch.current++; }, []);
  const close = useCallback(() => {
    if (saving.current) return;
    if (changed && !saved.current && !window.confirm('Bỏ nội dung chưa lưu?')) return;
    requestEpoch.current++; removeCaptcha(); onClose();
  }, [changed, onClose, removeCaptcha]);
  const ref = useModalA11y(true, close);

  const validate = (ai = false) => {
    if (part === null) {
      ref.current?.querySelector<HTMLSelectElement>('select[aria-label="Part"]')?.focus();
      return 'Chọn Part trước khi phân tích hoặc lưu.';
    }
    if (!sourceTestName) {
      ref.current?.querySelector<HTMLButtonElement>('button[aria-label="Chọn đề"]')?.focus();
      return 'Chọn hoặc thêm tên đề trước khi phân tích hoặc lưu.';
    }
    const imageMode = images.length > 0 || sourceImageIds.length > 0;
    if (imageMode && effectivePart !== 1 && effectivePart !== 7) return 'Ảnh chỉ hỗ trợ Part 1 và Part 7. Bỏ ảnh hoặc chọn đúng Part.';
    if (ai && effectivePart === 1 && (images.length || sourceImageIds.length) !== 1) return 'Thêm một ảnh tranh để phân tích Part 1.';
    if (ai && config?.freeformInput) {
      if (!raw.trim()) return 'Dán nội dung câu cần phân tích; ảnh chỉ cung cấp ngữ cảnh.';
      if (sourceTestName.length > 300) return 'Tên đề tối đa 300 ký tự.';
      if (inputText({ ...input, question: '', options: [], rawText: raw }).length > 8000) return 'Tổng nội dung, ngữ cảnh và lý do tối đa 8.000 ký tự.';
      return '';
    }
    if (effectivePart === 1 && options.length !== 4) return 'Part 1 cần đủ bốn phương án nghe A–D bằng văn bản.';
    if (!question.trim()) return 'Dán câu hỏi và phương án trước khi tiếp tục; ảnh chỉ cung cấp ngữ cảnh.';
    if (sourceTestName.length > 300) return 'Tên đề tối đa 300 ký tự.';
    if (!corrected && parsed.error) return config?.freeformInput ? 'Bấm “Phân tích với AI” để tách nội dung trước khi lưu. Bản nháp của bạn vẫn được giữ.' : parsed.error;
    if (input.userChoice && options.length && !options.some(option => option.startsWith(`(${input.userChoice})`))) return 'Lựa chọn chưa khớp phương án. Kiểm tra lại nội dung đã dán.';
    if (source && options.length && !options.some(option => option.startsWith(`(${source})`))) return 'Đáp án từ đề chưa khớp phương án.';
    if (effectivePart === 2 && options.length > 3) return 'Part 2 chỉ có A–C. Kiểm tra lại phương án.';
    if (ai && options.length < 2) return 'Cần ít nhất hai phương án có nội dung để phân tích.';
    if (imageMode && options.length !== 4) return 'Dán đủ bốn phương án A–D; ảnh chỉ cung cấp ngữ cảnh.';
    if (ai && options.some((option, index) => letterOf(option, index) !== CHOICE_LETTERS[index])) return 'Bổ sung phương án còn thiếu ở giữa trước khi phân tích, hoặc lưu thủ công.';
    if (ai && currentInput.length > 8000) return 'Tổng câu hỏi, phương án, ngữ cảnh và lý do tối đa 8.000 ký tự.';
    return '';
  };

  const persistImages = async () => {
    if (!images.length) return sourceImageIds;
    if (uploadedImageKey.current === imageKey && sourceImageIds.length) return sourceImageIds;
    const epoch = requestEpoch.current;
    const ids = await uploadSourceImages(images);
    if (epoch !== requestEpoch.current) throw new Error('Bản nháp đã đóng. Chưa lưu thẻ.');
    uploadedImageKey.current = imageKey; setSourceImageIds(ids);
    return ids;
  };

  const addImages = async (files: File[]) => {
    if (!files.length || busy || imageBusy || persisting) return;
    if (reading?.images.length || sourceImageIds.length && reading) { setError('Bấm “Đổi bài đọc” trước khi thêm ảnh của bài khác.'); return; }
    if (effectivePart !== 1 && effectivePart !== 7) { setError('Chọn Part 1 (tranh) hoặc Part 7 (đoạn đọc) trước khi thêm ảnh.'); return; }
    const maximum = effectivePart === 1 ? 1 : MAX_CONTEXT_IMAGES;
    if (imageDrafts.length + files.length > maximum) { setError(effectivePart === 1 ? 'Mỗi câu Part 1 dùng một ảnh tranh.' : 'Mỗi lần phân tích tối đa 3 ảnh Part 7.'); return; }
    const epoch = requestEpoch.current;
    setImageBusy(true); setError(''); setChanged(true);
    try {
      const prepared: PreparedImage[] = [];
      for (const file of files) prepared.push(await prepareImage(file));
      if (epoch !== requestEpoch.current) return;
      setContextMode('image'); setImages([...imageDrafts, ...prepared]); uploadedImageKey.current = ''; setSourceImageIds([]); setReading(null);
      setDraft(null); draftInput.current = ''; setTags(''); setCategory(selectedCategory || 'OTHER');
    } catch (value) {
      if (epoch === requestEpoch.current) setError(value instanceof Error ? value.message : 'Không đọc được ảnh.');
    } finally { if (epoch === requestEpoch.current) setImageBusy(false); }
  };

  const manualDraft = (): AIMistakeParseResult => {
    if (!draft || draftInput.current !== currentInput) {
      const previous = draftInput.current ? JSON.parse(draftInput.current) as MistakeInput : null;
      const sameQuestion = previous && JSON.stringify([question, options, context, source]) === JSON.stringify([previous.question, previous.options, previous.context, previous.sourceAnswer]);
      const correctAnswer = source ? options.find(option => option.startsWith(`(${source})`)) ?? '' : sameQuestion ? draft?.correctAnswer ?? '' : '';
      const preserveText = draft?.trapTip ?? '';
      const changedLearner = sameQuestion && previous && JSON.stringify([input.userChoiceState, input.userChoice, reason]) !== JSON.stringify([previous.userChoiceState, previous.userChoice, previous.userReason]);
      return { part: effectivePart, questionContext: [question, imageOnlySource ? '' : context].filter(Boolean).join('\n\n'), options,
        ...(imageOnlySource ? { question, context: '' } : contextText.trim() || reading ? { question, context } : sameQuestion && typeof draft?.question === 'string'
          ? { question: draft.question, context: draft.context ?? '' }
          : {}),
        category: selectedCategory || category, tags: tags.split(',').map(value => value.trim()).filter(Boolean), userChoice: input.userChoice,
        userChoiceState: input.userChoiceState, userReason: reason, userMistake: learnerMistake(input),
        correctAnswer, answerSource: correctAnswer ? source ? 'PROVIDED' : draft?.answerSource ?? 'PROVIDED' : 'MISSING', trapTip: preserveText,
        explanation: sameQuestion ? draft?.explanation ?? null : null,
        optionNotes: sameQuestion ? draft?.optionNotes ?? [] : [], missingInformation: previous && preserveText && !sameQuestion ? ['Nội dung đã thay đổi. Kiểm tra lại giải thích đang giữ.']
          : changedLearner && preserveText ? ['Lựa chọn/lý do đã thay đổi. Kiểm tra giải thích đang giữ trước khi lưu.'] : [] };
    }
    return { ...draft, category: selectedCategory || draft.category };
  };

  const analyze = async () => {
    if (imageBusy || busy || persisting) return;
    const problem = validate(true);
    if (problem) { setError(problem); return; }
    if (aiAccess?.enabled === false) { setError(aiAccess.accessMessage || 'Tài khoản chưa được duyệt sử dụng AI.'); return; }
    if (!config?.structuredInput) { setError(config ? 'Backend chưa hỗ trợ form mới. Bạn vẫn có thể lưu thủ công.' : 'AI chưa sẵn sàng. Bạn vẫn có thể lưu thủ công.'); return; }
    if (sourceImageIds.length && !config.persistentImages) { setError('Backend chưa hỗ trợ ảnh nguồn đã lưu. Chưa gửi yêu cầu AI.'); return; }
    if (images.length && !(effectivePart === 1 ? config.part1Images : config.part7Images)) {
      setError(`Backend chưa hỗ trợ ảnh Part ${effectivePart}. Nội dung được giữ; cập nhật backend trước khi phân tích ảnh.`); return;
    }
    const epoch = ++requestEpoch.current;
    setBusy(true); setError('');
    try {
      const { errorCategory: _errorCategory, ...baseInput } = input;
      const selectedInput = config.learnerCategory ? input : baseInput;
      const sentInput = config.freeformInput ? { ...selectedInput, question: '', options: [], rawText: raw } : selectedInput;
      const persistent = Boolean(config.persistentImages && (images.length || sourceImageIds.length));
      if (persistent) await sourceImageAccount();
      const storedIds = persistent ? await persistImages() : [];
      const result = await aiService.extractMistakeWithAI(inputText(sentInput), getToken, sentInput, persistent ? [] : images, storedIds);
      if (epoch !== requestEpoch.current) return;
      const extractedQuestion = result.draft.question ?? readQuestion(result.draft).question;
      const resolvedInput = { ...input, ...(config.freeformInput ? { question: extractedQuestion, options: result.draft.options } : {}),
        part: (effectivePart ?? result.draft.part) as MistakeEntry['part'] | null };
      if (config.freeformInput) setCorrected({ question: extractedQuestion, options: result.draft.options });
      draftInput.current = inputText(resolvedInput); draftImages.current = imageKey;
      const reusedSource = persistent ? { question: result.draft.question ?? readQuestion(result.draft).question, context: '',
        questionContext: result.draft.question ?? readQuestion(result.draft).question } : reading && effectivePart === 7 ? {
        question: result.draft.question ?? readQuestion(result.draft).question, context,
        questionContext: [result.draft.question ?? readQuestion(result.draft).question, context].filter(Boolean).join('\n\n'),
      } : {};
      setDraft({ ...result.draft, ...reusedSource, category: selectedCategory || result.draft.category, userChoice: input.userChoice, userChoiceState: input.userChoiceState,
        userReason: reason, userMistake: learnerMistake(resolvedInput) });
      setPart((effectivePart ?? result.draft.part) as MistakeEntry['part'] | null);
      setCategory(selectedCategory || result.draft.category); setTags(result.draft.tags.join(', '));
      setManual(false); setAnswerProvidedBy(source ? 'SOURCE' : undefined);
      removeCaptcha(); setStep('preview');
    } catch (value) {
      if (epoch !== requestEpoch.current) return;
      setError(value instanceof Error ? value.message : 'Chưa phân tích được. Nội dung được giữ để lưu thủ công.');
    } finally { if (epoch === requestEpoch.current) setBusy(false); }
  };

  const resetEntry = (reuse = false, value = draft) => {
    const text = reuse && value?.part === 7 ? context || value.context || '' : '';
    const retainedIds = reuse && value?.part === 7 ? sourceImageIds : [];
    const retainedImages = reuse && value?.part === 7 && contextMode === 'image' ? images.length ? images : reading?.images ?? [] : [];
    const hasReading = Boolean(text.trim()) || retainedIds.length > 0;
    setReading(hasReading ? { text: retainedIds.length ? '' : text, images: retainedIds.length ? [] : retainedImages } : null);
    setContextText(retainedIds.length ? '' : text); setContextMode(retainedIds.length || retainedImages.length ? 'image' : 'text');
    setSourceImageIds(retainedIds); uploadedImageKey.current = '';
    setRaw(''); setPart(hasReading ? 7 : null); setChoice(''); setReason(''); setSource(''); setCorrected(null);
    setImages([]); draftImages.current = '';
    setDraft(null); setStep('input'); setChanged(false); setAnswerProvidedBy(undefined);
    setCategory('OTHER'); setSelectedCategory(''); setTags(''); setError(''); setKeyOpen(false);
    entryId.current = crypto.randomUUID(); draftInput.current = ''; saved.current = false;
  };

  const clearReading = () => {
    setReading(null); setContextText(''); setImages([]); draftImages.current = '';
    setSourceImageIds([]); uploadedImageKey.current = '';
    setDraft(null); draftInput.current = ''; setManual(false); setTags(''); setCategory(selectedCategory || 'OTHER');
    setError(''); setChanged(true);
  };

  const invalidateContext = () => {
    setDraft(null); draftInput.current = ''; setManual(false); setTags(''); setCategory(selectedCategory || 'OTHER');
    setError(''); setChanged(true);
  };

  const save = async (addAnother = false, value = draft, quick = false, reuse = false) => {
    if (!value || saving.current || saved.current) return;
    if (!sourceTestName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); setStep('input'); return; }
    if (value.part === null) { setError('Chọn Part trước khi lưu.'); setStep('input'); return; }
    if (value.part === 2 && value.options.length > 3) { setError('Part 2 chỉ có A–C. Chỉnh nội dung đã dán để loại phương án D.'); return; }
    saving.current = true; setPersisting(true); setError('');
    const epoch = requestEpoch.current;
    try {
      const storedIds = config?.persistentImages && images.length ? await persistImages() : sourceImageIds;
      if (epoch !== requestEpoch.current) return;
      const entry: MistakeEntry = { ...(original ?? {}), id: original?.id ?? entryId.current,
        createdAt: original?.createdAt ?? new Date().toISOString(), status: original?.status ?? 'NEEDS_REVIEW',
        sourceTestName,
        part: value.part as MistakeEntry['part'], questionContext: storedIds.length ? value.question ?? readQuestion(value).question : value.questionContext, options: value.options.length ? value.options : undefined,
        question: value.question ?? undefined, context: storedIds.length ? '' : value.context ?? undefined,
        sourceImageIds: storedIds.length ? storedIds : undefined,
        userChoice: input.userChoice || undefined, userChoiceState: input.userChoiceState,
        userReason: original && original.userReason === undefined && !reason.trim() ? undefined : reason,
        userMistake: original && original.userReason === undefined && !reason.trim() ? original.userMistake : learnerMistake(input), correctAnswer: value.correctAnswer,
        answerSource: value.correctAnswer.trim() ? value.answerSource : 'MISSING', answerProvidedBy: source ? (source !== initialSource.current ? 'SOURCE' : answerProvidedBy ?? 'SOURCE') : value.answerSource === 'PROVIDED' ? answerProvidedBy : undefined,
        category: selectedCategory || category, tags: tags.split(',').map(value => value.trim()).filter(Boolean).slice(0, 20), trapTip: value.trapTip || undefined,
        optionNotes: value.optionNotes.length ? value.optionNotes : undefined, explanation: value.explanation ?? undefined };
      if (entry.tags.some(tag => tag.length > 80)) throw new Error('Mỗi tag tối đa 80 ký tự. Kiểm tra lại nội dung đã nhập.');
      if (entry.questionContext.length > 16000 || (entry.question?.length ?? 0) > 16000 || (entry.context?.length ?? 0) > 16000 || (entry.options ?? []).some(option => option.length > 2000) || entry.correctAnswer.length > 2000) {
        throw new Error('Câu hỏi tối đa 16.000 ký tự; mỗi phương án/đáp án tối đa 2.000 ký tự. Kiểm tra lại nội dung đã nhập.');
      }
      if (new TextEncoder().encode(JSON.stringify({ ...entry, updatedAt: new Date().toISOString(), deletedAt: null })).byteLength > 32768) {
        throw new Error('Thẻ vượt giới hạn 32 KiB. Rút gọn câu hỏi/đoạn trích trước khi lưu; bản nháp được giữ.');
      }
      if (original) onUpdate(entry, original); else onAdd(entry);
      saved.current = true;
      if (addAnother && !original) {
        resetEntry(reuse, value);
        setSaveMoreReceipt(true);
      } else if (quick && !original) { setDraft(value); setStep('saved'); } else { onSaved?.(original ? 'Đã lưu thay đổi' : 'Đã lưu ghi chú'); onClose(); }
    } catch (value) { setError(value instanceof Error ? value.message : 'Chưa lưu được. Nội dung đang nhập được giữ.'); }
    finally { saving.current = false; setPersisting(false); }
  };

  const quickSave = () => {
    if (busy || imageBusy || persisting || saved.current) return;
    if (images.length && !config?.persistentImages && (draftInput.current !== currentInput || draftImages.current !== imageKey)) {
      setError('Phân tích ảnh trước khi lưu để giữ đủ câu hỏi, phương án và ngữ cảnh.'); return;
    }
    const problem = validate();
    if (problem) { setError(problem); return; }
    const value = manualDraft();
    // Existing explanation changes still need a review before saving stale prose.
    if (value.missingInformation.length) {
      const needsManualReview = !draft || draftInput.current !== currentInput;
      setDraft(value); draftInput.current = currentInput; setManual(needsManualReview); setStep('preview'); setError(''); return;
    }
    save(false, value, true);
  };

  const draftQuestion = draft ? readQuestion(draft) : { question: '', context: '' };
  const previewImages = contextMode === 'image' ? images.length ? images : reading?.images ?? [] : [];
  const canReuseReading = draft?.part === 7 && (sourceImageIds.length > 0 || Boolean((reading?.text || draft.context)?.trim()));
  const quiz = resolveQuizOptions({ questionContext: draft?.questionContext ?? '', options: draft?.options,
    correctAnswer: draft?.correctAnswer ?? '', optionNotes: draft?.optionNotes });
  const choiceButton = (letter: ChoiceLetter) => {
    const option = options.find(value => value.startsWith(`(${letter})`));
    return <button type="button" key={letter} disabled={!choicesReady || (!freeformReady && !option)} aria-pressed={choice === letter} aria-label={`Bạn chọn ${letter}`} title={option?.replace(/^\([A-D]\)\s*/, '')}
      onClick={() => { setChoice(value => value === letter ? '' : letter); setChanged(true); }} className={`min-h-11 min-w-11 rounded-lg border px-3 py-2 text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${choice === letter ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900/50'}`}>{letter}</button>;
  };

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 sm:items-center sm:p-4" onClick={event => { if (event.target === event.currentTarget && event.detail <= 1) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="mistake-entry-title" className="flex max-h-[100dvh] w-full flex-col border-2 border-slate-900 bg-white text-slate-900 dark:border-slate-200 dark:bg-[#111A2C] dark:text-slate-100 sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-2xl sm:shadow-[6px_6px_0px_#0f172a] dark:sm:shadow-[6px_6px_0px_#cbd5e1]">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-slate-700 sm:px-6">
        <h2 id="mistake-entry-title" className="text-xl font-extrabold">{saveMoreReceipt ? <span role="status" className="entry-more-receipt inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><SuccessMark />Đã lưu ghi chú</span>
          : <span className="shadow-[inset_0_-7px_0_#fef08a] dark:shadow-[inset_0_-7px_0_#57431c]">{step === 'preview' ? 'Kiểm tra và lưu' : original ? 'Sửa lỗi sai' : 'Thêm lỗi sai'}</span>}</h2>
        <button type="button" onClick={close} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
      </header>
      <ScrollableModalBody resetKey={step} compact>
        {step === 'input' ? <fieldset disabled={busy || imageBusy || persisting} className="space-y-3 border-0 p-0">
          <div className="grid w-full max-w-[640px] grid-cols-[144px_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[144px_minmax(0,230px)_minmax(0,230px)]">
          <label className="block text-sm font-bold">Part <span className="text-rose-600" aria-hidden="true">*</span>
            <span className="relative mt-1.5 block"><select aria-label="Part" required className="min-h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-base font-semibold dark:border-slate-700 dark:bg-slate-900"
              value={effectivePart ?? ''} onChange={event => { const nextPart = Number(event.target.value) as MistakeEntry['part'] || null; if ((reading && nextPart !== 7) || (imageIdsDraft.length && nextPart !== part)) clearReading(); setContextMode(nextPart === 1 || nextPart === 7 && (imageDrafts.length > 0 || imageIdsDraft.length > 0) ? 'image' : 'text'); setPart(nextPart); setChanged(true); }}>
              <option value="" disabled>Chọn Part</option>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>Part {value}</option>)}
            </select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" /></span>
          </label>
          <div className="min-w-0"><span className="mb-1.5 block text-sm font-bold">Đề <span className="text-rose-600" aria-hidden="true">*</span></span>
          <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
            onChange={name => { if ((reading || imageIdsDraft.length) && testNameKey(name) !== testNameKey(sourceTestName)) clearReading(); setSourceTest(name); setChanged(true); }} />
          </div>
          <label className="col-span-2 min-w-0 text-sm font-bold sm:col-span-1">Lỗi sai <span className="text-xs font-normal text-slate-500">(tùy chọn)</span>
            <select aria-label="Lỗi sai" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
              value={selectedCategory} onChange={event => { setSelectedCategory(event.target.value as ErrorCategory | ''); setChanged(true); }}>
              <option value="">Chưa chọn</option>{Object.entries(categoryChoices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          </div>
          <div><div className="mb-2"><label htmlFor="mistake-paste" className="text-sm font-bold text-blue-600 dark:text-blue-400">{instructions.label} <span className="text-rose-600">*</span></label></div>
            <p id="mistake-input-hint" className="mb-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{reading ? sourceImageIds.length ? 'Dán câu mới kèm phương án. Dùng lại ảnh bài đọc, không cần thêm lại.' : 'Dán câu mới kèm phương án; bài đọc được dùng lại.' : instructions.hint}</p>
            <textarea id="mistake-paste" aria-describedby="mistake-input-hint" maxLength={8000} spellCheck={false} value={raw} onChange={event => { setRaw(event.target.value); setCorrected(null); setChanged(true); }} rows={5}
              onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addImages(files); } }}
              placeholder={effectivePart === 1 ? 'Dán bốn mô tả nghe A–D…' : effectivePart === 2 ? 'Dán câu hỏi và ba phản hồi A–C…' : 'Dán một câu hỏi và các phương án…'}
              className={twMerge(inputClass, 'min-h-[144px] resize-y border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-[#102139]')} />
            {!config?.freeformInput && !corrected && raw && parsed.error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          </div>
          <MistakeContextInput part={effectivePart} mode={contextMode} text={contextText} busy={busy || imageBusy || persisting}
            onMode={mode => { if (mode !== contextMode) { setContextMode(mode); invalidateContext(); } }}
            onText={value => { setContextText(value); setReading(current => current ? { ...current, text: value } : null); invalidateContext(); }}
            reuseLabel={reading ? original ? 'Đang dùng bài đọc đã lưu' : 'Đang dùng bài đọc trước' : undefined} onReset={clearReading}
            images={sourceImageIds.length && !images.length ? <>
                {!reading && <button type="button" onClick={clearReading} className={`${linkClass} min-h-10`}>{effectivePart === 1 ? 'Đổi tranh' : 'Đổi ảnh'}</button>}
                <SourceImageViewer ids={sourceImageIds} part={effectivePart} /></>
              : reading?.images.length ? <ImageComparison images={reading.images} part={effectivePart} />
              : <MistakeImages images={images} embedded busy={busy || imageBusy || persisting} part={effectivePart} persistent={config?.persistentImages}
                onAdd={files => void addImages(files)} onRemove={id => { setImages(value => value.filter(image => image.id !== id)); setSourceImageIds([]); uploadedImageKey.current = ''; invalidateContext(); }} />} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><fieldset><legend className="mb-2 text-sm font-bold">Bạn đã chọn <span className="text-xs font-normal text-slate-500">(nếu nhớ)</span></legend><div className="flex flex-wrap gap-2">{choiceLetters.map(choiceButton)}</div><p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{choicesReady ? 'Không chọn nếu chưa nhớ. Bấm lại để bỏ chọn.' : 'Dán câu hỏi để chọn phương án.'}</p></fieldset>
            <details open={keyOpen} onToggle={event => setKeyOpen(event.currentTarget.open)} className="text-sm text-slate-600 dark:text-slate-300"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{source ? `Đáp án từ đề: ${source}` : <>Đáp án đúng từ đề <span className="text-xs font-normal text-slate-500">(tùy chọn)</span></>}</summary><fieldset className="mt-1"><legend className="sr-only">Đáp án từ đề</legend><div className="flex flex-wrap gap-2">{choiceLetters.map(letter => { const option = options.find(value => value.startsWith(`(${letter})`)); return <button type="button" key={letter} disabled={!choicesReady || (!freeformReady && !option)} aria-label={`Đáp án từ đề: ${letter}`} aria-pressed={source === letter} onClick={() => { setSource(value => value === letter ? '' : letter); setChanged(true); }} className={`min-h-11 min-w-11 rounded-lg border text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${source === letter ? 'border-slate-900 bg-slate-200 ring-1 ring-slate-900 dark:border-slate-200 dark:bg-slate-700' : 'border-slate-300 dark:border-slate-700'}`}>{letter}</button>; })}</div></fieldset>{!choicesReady && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Dán câu hỏi để chọn đáp án từ đề.</p>}{source && <button type="button" className="mt-1 py-1 text-xs text-slate-500 dark:text-slate-400" onClick={() => { setSource(''); setChanged(true); }}>Bỏ chọn</button>}</details>
          </div>
          <div><label htmlFor="mistake-reason" className="mb-2 block text-sm font-bold text-amber-800 dark:text-amber-300">Lý do chọn <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(nếu muốn)</span></label><textarea id="mistake-reason" maxLength={2000} rows={1} value={reason} onChange={event => { setReason(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.max(48, Math.min(120, event.currentTarget.scrollHeight))}px`; setChanged(true); }} placeholder="Mình chọn vì…" className={twMerge(inputClass, 'min-h-12 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-[#292319]')} /></div>
          {original && original.userReason === undefined && original.userMistake && <details className="text-sm"><summary className="cursor-pointer font-semibold">Ghi chú cũ</summary><p className="mt-2 whitespace-pre-line text-base leading-relaxed">{original.userMistake}</p></details>}
        </fieldset> : step === 'saved' ? <div role="status" className="flex flex-col items-center gap-3 py-5 text-center"><SuccessMark /><p className="text-lg font-bold">Đã lưu lỗi sai</p>{sourceTestName && <p className="text-sm text-slate-500 dark:text-slate-400">{sourceTestName}</p>}<p className="text-sm text-slate-500 dark:text-slate-400">{draft?.correctAnswer ? `${draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã lưu'}: ${draft.correctAnswer}` : 'Chưa có đáp án · bổ sung trước khi ôn'}</p></div> : draft && <>
          <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{draft.part !== null ? <PartBadge part={draft.part} /> : <span className="text-sm text-rose-600">Chọn Part trước khi lưu</span>}{sourceTestName && <span className="truncate text-xs text-slate-500 dark:text-slate-400" title={sourceTestName}>{sourceTestName}</span>}</div><button type="button" className={linkClass} onClick={() => { setStep('input'); setError(''); requestAnimationFrame(() => ref.current?.querySelector<HTMLTextAreaElement>('#mistake-paste')?.focus()); }}>Chỉnh nội dung</button></div>
          <p className="whitespace-pre-line text-base font-bold leading-relaxed">{draftQuestion.question || 'Chưa trích được câu hỏi'}</p>
          {sourceImageIds.length ? <SourceImageViewer ids={sourceImageIds} part={draft.part} /> : <>
            {!previewImages.length && <QuestionContext context={draftQuestion.context} part={draft.part} />}
            <ImageComparison images={previewImages} part={draft.part} />
          </>}
          <OptionList options={quiz.options} large chosen={input.userChoice} showMeanings={draft.part !== 7} correctLabel={draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : answerProvidedBy === 'LEARNER' ? 'Đáp án đã nhập' : 'Đáp án từ đề'} />
          {!quiz.options.length && draft.correctAnswer && <p className="text-base"><b>{draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã nhập'}:</b> {draft.correctAnswer}</p>}
          <ExplanationView explanation={draft.explanation} trapTip={draft.trapTip} optionMeanings={draft.part === 7 ? quiz.options : undefined} extra={[[ reason ? 'Lý do bạn đã chọn' : 'Ghi chú cũ', reason || (original?.userReason === undefined ? original?.userMistake ?? '' : '') ]]} />
          {manual && <details className="text-sm"><summary className="cursor-pointer py-1 font-semibold text-slate-600 dark:text-slate-300">Chỉnh đáp án / lời giải</summary><div className="mt-2 space-y-3"><fieldset><legend className="text-sm font-semibold">Đáp án đúng (nếu có)</legend><div className="mt-2 flex gap-2">{draft.options.map((option, index) => <button key={option} type="button" aria-label={`Đáp án đã nhập: ${letterOf(option, index)}`} aria-pressed={draft.correctAnswer === option} onClick={() => { setDraft({ ...draft, correctAnswer: draft.correctAnswer === option ? '' : option, answerSource: draft.correctAnswer === option ? 'MISSING' : 'PROVIDED', explanation: null }); setAnswerProvidedBy('LEARNER'); setChanged(true); }} className={`min-h-10 min-w-10 rounded-lg border font-bold ${draft.correctAnswer === option ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}>{letterOf(option, index)}</button>)}</div></fieldset>
            {!draft.options.length && <label className="block text-sm font-semibold">Đáp án đã nhập<input className={`${inputClass} mt-1`} value={draft.correctAnswer} onChange={event => { setDraft({ ...draft, correctAnswer: event.target.value, answerSource: event.target.value.trim() ? 'PROVIDED' : 'MISSING' }); setAnswerProvidedBy('LEARNER'); setChanged(true); }} /></label>}
            <label className="block text-sm font-semibold">Giải thích / mẹo ghi nhớ<textarea className={`${inputClass} mt-1`} rows={3} maxLength={4000} value={draft.trapTip} onChange={event => { setDraft({ ...draft, trapTip: event.target.value, explanation: null }); setChanged(true); }} /></label>
          </div></details>}
          {!draft.correctAnswer && <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có đáp án · bổ sung để ôn.</p>}
          {draft.missingInformation.length > 0 && <div className="text-sm text-amber-800 dark:text-amber-300" role="status">{draft.missingInformation.map((message, index) => <p key={index}>{message}</p>)}</div>}
          {draft.part === null && <label className="block text-sm font-semibold">Part<select aria-label="Part" className={`${inputClass} mt-1`} value="" onChange={event => { const value = Number(event.target.value) as MistakeEntry['part']; setDraft({ ...draft, part: value || null }); setPart(value || null); draftInput.current = inputText({ ...input, part: value || null }); setChanged(true); }}><option value="">Chọn Part</option>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>Part {value}</option>)}</select></label>}
        </>}
        {step === 'input' && aiAccess?.enabled === false && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p>{aiAccess.accessMessage}</p><button type="button" disabled={configBusy} onClick={() => setConfigAttempt(value => value + 1)} className="min-h-10 font-semibold underline">Kiểm tra quyền AI</button>
        </div>}
        {error && <div className="space-y-1 text-sm text-rose-600 dark:text-rose-300" role="alert"><p>{error}</p>{step === 'input' && !configBusy && !config && <button type="button" onClick={() => setConfigAttempt(value => value + 1)} className="font-bold underline">Thử kết nối lại</button>}
          {original && error.includes('nơi khác') && <button type="button" onClick={() => { if (window.confirm('Tải lại thẻ và bỏ các thay đổi chưa lưu?')) onReload(); }} className="font-bold underline">Tải lại thẻ</button>}</div>}
        {step === 'input' && <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />}
      </ScrollableModalBody>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-[#111A2C] sm:px-6">
        {step === 'input' ? <><button type="button" onClick={() => void analyze()} disabled={busy || imageBusy || persisting || configBusy || !config || aiAccess?.enabled === false || (!raw.trim() && !images.length)} className={`${linkClass} inline-flex min-h-11 items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}><Sparkles className="h-4 w-4" aria-hidden="true" />{busy ? 'Đang phân tích…' : 'Phân tích với AI'}</button><button type="button" onClick={quickSave} disabled={busy || imageBusy || persisting} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{original ? 'Lưu thay đổi' : 'Lưu nhanh'}</button></>
          : step === 'saved' ? <><button type="button" onClick={onClose} className={linkClass}>Đóng</button><div className="flex flex-wrap items-center justify-end gap-3">{canReuseReading && <button type="button" onClick={() => resetEntry()} className={linkClass}>Bài đọc mới</button>}<button type="button" onClick={() => resetEntry(canReuseReading)} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{canReuseReading ? 'Thêm câu cùng bài đọc' : 'Thêm lỗi tiếp'}</button></div></>
          : <><button type="button" disabled={persisting} onClick={() => { setStep('input'); setError(''); }} className={linkClass}>Quay lại</button><div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">{!original && <button type="button" disabled={persisting} onClick={() => void save(true, draft, false, canReuseReading)} className={`${primaryClass} min-h-11 bg-amber-200 text-slate-950 hover:bg-amber-100`}>{canReuseReading ? 'Lưu & thêm câu cùng bài' : 'Lưu & thêm tiếp'}</button>}<button type="button" disabled={persisting} onClick={() => void save()} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{persisting ? 'Đang lưu…' : original ? 'Lưu thay đổi' : 'Lưu lỗi sai'}</button></div></>}
      </footer>
    </div>
  </div>;
}
