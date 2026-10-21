import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ClipboardPaste, ImagePlus, PenLine, ScanLine, Sparkles, Trash2, X } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
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
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';
import { partOfQuestion, parseQuestionList } from '@/shared/domain/questionNumbers';
import { enqueueExplanations } from '@/features/mistakes/services/explanationQueue';
import { canExplainRead, explainInput } from '@/features/mistakes/lib/detailForm';

interface BatchExtractedItem {
  id: string;
  number: number;
  part: MistakeEntry['part'];
  draft: aiService.AIMistakeParseResult;
  category: ErrorCategory;
  ticket?: string | null;
}

interface Props {
  original: MistakeEntry | null;
  sourceSuggestions?: string[];
  initialSourceName?: string;
  initialSessionId?: string;
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
const categoryChoices = CATEGORY_CHOICES;

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

export function MistakeEntryModal({ original, sourceSuggestions = [], initialSourceName = '', initialSessionId, initialReading = '', initialSourceImageIds = [], onAdd, onUpdate, onClose, onReload, onSaved }: Props) {
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
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');
  const [batchNumbersText, setBatchNumbersText] = useState('');
  const [batchItems, setBatchItems] = useState<BatchExtractedItem[]>([]);
  const batchItemsRef = useRef(batchItems);
  batchItemsRef.current = batchItems;
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const batchFileInput = useRef<HTMLInputElement>(null);
  const [saveMoreReceipt, setSaveMoreReceipt] = useState(false);
  const [raw, setRaw] = useState(original ? [originalQuestion(original, Boolean(initialContext.trim()) || Boolean(initialImages.length)), ...(original.options ?? [])].join('\n') : '');
  const [part, setPart] = useState<MistakeEntry['part'] | null>(original?.part ?? (hasInitialReading ? 7 : null));
  const [choice, setChoice] = useState<ChoiceLetter | 'UNKNOWN' | 'BLANK' | ''>(original ? (original.userChoiceState === 'BLANK' ? 'BLANK' : getUserChoice(original) || 'UNKNOWN') : '');
  // Phones: Part buttons, context above the question, optional fields folded into one row.
  const isPhone = useMediaQuery(PHONE_QUERY);
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
  // New notes are Reading only (Part 5–7), matching the Full Test flow; an older Listening card keeps its own Part when edited.
  const partChoices = (original && original.part <= 4 ? [original.part, 5, 6, 7] : [5, 6, 7]) as MistakeEntry['part'][];
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
    if ((changed || (entryMode === 'batch' && batchItems.length > 0)) && !saved.current && !window.confirm('Bỏ nội dung chưa lưu?')) return;
    requestEpoch.current++; removeCaptcha(); onClose();
  }, [changed, entryMode, batchItems.length, onClose, removeCaptcha]);
  const ref = useModalA11y(true, close);

  const validate = (ai = false) => {
    if (part === null) {
      ref.current?.querySelector<HTMLButtonElement>('[role="group"][aria-label="Part"] button')?.focus();
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

  const handleBatchFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    if (batchProgress) return;

    let targetQuestions: { number: number; part: MistakeEntry['part'] }[] = [];
    if (batchNumbersText.trim()) {
      const { questions, invalid } = parseQuestionList(batchNumbersText);
      if (invalid.length) {
        setError(`Không đọc được số câu: ${invalid.join(', ')}`);
        return;
      }
      if (!questions.length) {
        setError('Không có số câu hợp lệ (1–200).');
        return;
      }
      if (questions.some(q => q < 101)) {
        setError('Chỉ hỗ trợ quét câu sai Reading Part 5–7 (câu 101–200), không chụp Part 1–4.');
        return;
      }
      targetQuestions = questions.map(number => ({
        number,
        part: (partOfQuestion(number) ?? 5) as MistakeEntry['part']
      }));
    }

    setError('');
    const chunks: File[][] = [];
    for (let i = 0; i < imageFiles.length; i += MAX_CONTEXT_IMAGES) {
      chunks.push(imageFiles.slice(i, i + MAX_CONTEXT_IMAGES));
    }

    let doneCount = 0;
    try {
      for (const chunk of chunks) {
        setBatchProgress({ done: doneCount, total: imageFiles.length });
        const existingNumbers = new Set(batchItemsRef.current.map(it => it.number));
        const questionsToSend = targetQuestions.length
          ? targetQuestions.filter(q => !existingNumbers.has(q.number))
          : Array.from({ length: 100 }, (_, i) => 101 + i)
              .filter(num => !existingNumbers.has(num))
              .map(number => ({
                number,
                part: (partOfQuestion(number) ?? 5) as MistakeEntry['part']
              }));

        if (!questionsToSend.length) break;

        const prepared: PreparedImage[] = [];
        for (const file of chunk) {
          prepared.push(await prepareImage(file));
        }

        const result = await aiService.extractPageWithAI(questionsToSend, prepared, getToken);
        if (result.items.length) {
          const updated = [...batchItemsRef.current];
          for (const item of result.items) {
            const itemPart = (partOfQuestion(item.number) ?? item.draft.part ?? 5) as MistakeEntry['part'];
            const category: ErrorCategory = selectedCategory || (item.draft.category !== 'OTHER' ? item.draft.category : 'OTHER');
            const idx = updated.findIndex(it => it.number === item.number);
            const entry: BatchExtractedItem = {
              id: idx >= 0 ? updated[idx].id : crypto.randomUUID(),
              number: item.number,
              part: itemPart,
              draft: item.draft,
              category,
              ticket: result.explainTicket ?? null
            };
            if (idx >= 0) {
              updated[idx] = entry;
            } else {
              updated.push(entry);
            }
          }
          updated.sort((a, b) => a.number - b.number);
          batchItemsRef.current = updated;
          setBatchItems(updated);
        }
        doneCount += chunk.length;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại hoặc chọn ảnh khác.');
    } finally {
      removeCaptcha();
      setBatchProgress(null);
    }
  }, [batchProgress, batchNumbersText, selectedCategory, getToken, removeCaptcha]);

  const handleBatchFilesRef = useRef(handleBatchFiles);
  handleBatchFilesRef.current = handleBatchFiles;

  useEffect(() => {
    if (step !== 'input' || entryMode !== 'batch') return;
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) {
        event.preventDefault();
        void handleBatchFilesRef.current(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [step, entryMode]);

  const saveBatch = () => {
    if (!batchItems.length || batchProgress) return;
    if (!sourceTestName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); return; }
    setError('');

    const explainBatches = new Map<string, { cardId: string; number: number; input: MistakeInput }[]>();

    for (const item of batchItems) {
      const cardId = item.id;
      const effectivePart = item.part;
      const itemDraft = item.draft;
      const choice = itemDraft.userChoice || '';
      const userChoiceState = itemDraft.userChoiceState ?? (choice ? 'CHOSEN' : 'UNKNOWN');

      const mistakeInput: MistakeInput = {
        question: itemDraft.question ?? '',
        options: itemDraft.options ?? [],
        context: itemDraft.context ?? '',
        part: effectivePart,
        userChoiceState,
        userChoice: choice,
        userReason: itemDraft.userReason ?? '',
        sourceAnswer: itemDraft.answerSource === 'PROVIDED' ? optionLetter(itemDraft.correctAnswer) : ''
      };

      const entry: MistakeEntry = {
        id: cardId,
        createdAt: new Date().toISOString(),
        status: 'NEEDS_REVIEW',
        sourceTestName,
        sessionId: testNameKey(sourceTestName) === testNameKey(initialSourceName) ? initialSessionId : undefined,
        questionNumber: item.number,
        part: effectivePart,
        question: itemDraft.question ?? undefined,
        context: itemDraft.context ?? undefined,
        questionContext: itemDraft.questionContext ?? (itemDraft.question || `Câu ${item.number}`),
        options: itemDraft.options?.length ? itemDraft.options : undefined,
        userChoice: choice || undefined,
        userChoiceState,
        userReason: itemDraft.userReason || undefined,
        userMistake: itemDraft.userMistake || learnerMistake(mistakeInput),
        correctAnswer: itemDraft.correctAnswer,
        answerSource: itemDraft.correctAnswer ? itemDraft.answerSource ?? 'PROVIDED' : 'MISSING',
        category: item.category,
        tags: itemDraft.tags ?? [],
        trapTip: itemDraft.trapTip || undefined,
        optionNotes: itemDraft.optionNotes?.length ? itemDraft.optionNotes : undefined,
        explanation: itemDraft.explanation ?? undefined
      };

      onAdd(entry);

      if (item.ticket && canExplainRead(itemDraft, effectivePart)) {
        const explainItem = {
          cardId,
          number: item.number,
          input: explainInput(itemDraft, effectivePart)
        };
        const list = explainBatches.get(item.ticket) ?? [];
        list.push(explainItem);
        explainBatches.set(item.ticket, list);
      }
    }

    for (const [ticket, list] of explainBatches) {
      enqueueExplanations(ticket, list);
    }

    onSaved?.(`Đã lưu ${batchItems.length} câu sai`);
    onClose();
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
    const nextPart = part;
    const text = reuse && value?.part === 7 ? context || value.context || '' : '';
    const retainedIds = reuse && value?.part === 7 ? sourceImageIds : [];
    const retainedImages = reuse && value?.part === 7 && contextMode === 'image' ? images.length ? images : reading?.images ?? [] : [];
    const hasReading = Boolean(text.trim()) || retainedIds.length > 0;
    setReading(hasReading ? { text: retainedIds.length ? '' : text, images: retainedIds.length ? [] : retainedImages } : null);
    setContextText(retainedIds.length ? '' : text); setContextMode(retainedIds.length || retainedImages.length || nextPart === 1 ? 'image' : 'text');
    setSourceImageIds(retainedIds); uploadedImageKey.current = '';
    setRaw(''); setPart(nextPart); setChoice(''); setReason(''); setSource(''); setCorrected(null);
    setImages([]); draftImages.current = '';
    setDraft(null); setStep('input'); setChanged(false); setAnswerProvidedBy(undefined);
    setCategory('OTHER'); setSelectedCategory(''); setTags(''); setError(''); setKeyOpen(false);
    setBatchItems([]); setBatchNumbersText(''); setBatchProgress(null);
    entryId.current = crypto.randomUUID(); draftInput.current = ''; saved.current = false;
    requestAnimationFrame(() => ref.current?.querySelector<HTMLTextAreaElement>('#mistake-paste')?.focus());
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
        sessionId: original?.sessionId ?? (testNameKey(sourceTestName) === testNameKey(initialSourceName) ? initialSessionId : undefined),
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
  const aiAvailable = !configBusy && Boolean(config?.structuredInput) && aiAccess?.enabled !== false;
  const previewImages = contextMode === 'image' ? images.length ? images : reading?.images ?? [] : [];
  const canReuseReading = draft?.part === 7 && (sourceImageIds.length > 0 || Boolean((reading?.text || draft.context)?.trim()));
  const quiz = resolveQuizOptions({ questionContext: draft?.questionContext ?? '', options: draft?.options,
    correctAnswer: draft?.correctAnswer ?? '', optionNotes: draft?.optionNotes });
  const choosePart = (nextPart: MistakeEntry['part'] | null) => {
    if ((reading && nextPart !== 7) || (imageIdsDraft.length && nextPart !== part)) clearReading();
    setContextMode(nextPart === 1 || nextPart === 7 && (imageDrafts.length > 0 || imageIdsDraft.length > 0) ? 'image' : 'text');
    setPart(nextPart); setChanged(true);
  };
  const partButtons = (
            <div className="flex gap-1.5" role="group" aria-label="Part">
              {partChoices.map(value => <button key={value} type="button" aria-pressed={effectivePart === value} aria-label={`Part ${value}`}
                onClick={() => choosePart(value)}
                className={'h-11 min-w-11 cursor-pointer rounded-xl border-2 px-3 text-[15px] font-black max-md:flex-1 ' + (effectivePart === value
                  ? (value <= 4 ? 'border-slate-900 bg-indigo-600 text-white' : 'border-slate-900 bg-teal-600 text-white') + ' shadow-[2px_2px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none'
                  : (value <= 4 ? 'border-indigo-200 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300' : 'border-teal-200 text-teal-700 dark:border-teal-800 dark:text-teal-300') + ' bg-white dark:bg-slate-900')}>{value}</button>)}
            </div>
  );
  const optional = <span className="ml-1 text-xs font-semibold text-slate-400 dark:text-slate-500">không bắt buộc</span>;
  const canReadClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  const choiceButton = (letter: ChoiceLetter) => {
    const option = options.find(value => value.startsWith(`(${letter})`));
    return <button type="button" key={letter} disabled={!choicesReady || (!freeformReady && !option)} aria-pressed={choice === letter} aria-label={`Bạn chọn ${letter}`} title={option?.replace(/^\([A-D]\)\s*/, '')}
      onClick={() => { setChoice(value => value === letter ? '' : letter); setChanged(true); }} className={`h-9 w-9 cursor-pointer rounded-full border-2 text-sm font-extrabold max-md:h-[50px] max-md:w-auto max-md:flex-1 max-md:rounded-xl max-md:text-lg disabled:cursor-not-allowed disabled:opacity-40 ${choice === letter ? 'border-slate-900 bg-rose-500 text-white dark:border-slate-200' : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300'}`}>{letter}</button>;
  };

  const contextBlock = (
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
  );
  const answerDetails = (
<details open={isPhone || keyOpen} onToggle={event => { if (!isPhone) setKeyOpen(event.currentTarget.open); }} className="text-sm text-slate-600 dark:text-slate-300"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{source ? `Đáp án từ đề: ${source}` : <>Đáp án đúng từ đề{optional}</>}</summary><fieldset className="mt-1"><legend className="sr-only">Đáp án từ đề</legend><div className="flex flex-wrap gap-2">{choiceLetters.map(letter => { const option = options.find(value => value.startsWith(`(${letter})`)); return <button type="button" key={letter} disabled={!choicesReady || (!freeformReady && !option)} aria-label={`Đáp án từ đề: ${letter}`} aria-pressed={source === letter} onClick={() => { setSource(value => value === letter ? '' : letter); setChanged(true); }} className={`min-h-11 min-w-11 rounded-lg border text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${source === letter ? 'border-slate-900 bg-slate-200 ring-1 ring-slate-900 dark:border-slate-200 dark:bg-slate-700' : 'border-slate-300 dark:border-slate-700'}`}>{letter}</button>; })}</div></fieldset>{!choicesReady && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Dán câu hỏi để chọn đáp án từ đề.</p>}{source && <button type="button" className="mt-1 py-1 text-xs text-slate-500 dark:text-slate-400" onClick={() => { setSource(''); setChanged(true); }}>Bỏ chọn</button>}</details>
  );
  const categorySelect = (
          <label className="w-[200px] shrink-0 text-sm font-bold max-md:col-span-2 max-md:w-full">Lỗi sai{optional}
            <select aria-label="Lỗi sai" className="mt-1.5 min-h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
              value={selectedCategory} onChange={event => { setSelectedCategory(event.target.value as ErrorCategory | ''); setChanged(true); }}>
              <option value="">Chưa chọn</option>{Object.entries(categoryChoices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
  );

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 sm:items-center sm:p-4" onClick={event => { if (event.target === event.currentTarget && event.detail <= 1) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="mistake-entry-title" className="flex max-h-[100dvh] w-full flex-col max-md:h-[100dvh] max-md:border-0 border-2 border-slate-900 bg-white text-slate-900 dark:border-slate-200 dark:bg-[#111A2C] dark:text-slate-100 sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-2xl sm:shadow-[6px_6px_0px_#0f172a] dark:sm:shadow-[6px_6px_0px_#cbd5e1]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 id="mistake-entry-title" className="shrink-0 text-lg font-extrabold sm:text-xl">{saveMoreReceipt ? <span role="status" className="entry-more-receipt inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><SuccessMark />Đã lưu ghi chú</span>
            : <span>{step === 'preview' ? 'Kiểm tra và lưu' : original ? 'Sửa câu sai' : 'Thêm câu sai'}</span>}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
      </header>
      {!original && step === 'input' && (
        <div className="shrink-0 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700 sm:px-6">
          <div role="tablist" aria-label="Chế độ thêm câu sai" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:max-w-sm">
            {([['single', 'Nhập tay', PenLine], ['batch', 'Quét ảnh AI', ScanLine]] as const).map(([mode, label, Icon]) => {
              const active = entryMode === mode;
              return <button key={mode} type="button" role="tab" aria-selected={active} onClick={() => { setEntryMode(mode); setError(''); }}
                className={'flex min-h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-[1.5px] text-sm font-bold transition-colors ' + (active
                  ? 'border-slate-900 bg-white text-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-none'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>;
            })}
          </div>
        </div>
      )}
      <ScrollableModalBody resetKey={step} compact>
        {step === 'input' ? (
          entryMode === 'batch' ? (
            <div className="space-y-3">
              {/* Hàng 1: Chọn Đề & Số câu tùy chọn */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <span className="mb-1.5 block text-sm font-bold">Đề <span className="text-rose-600" aria-hidden="true">*</span></span>
                  <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={Boolean(batchProgress)}
                    onChange={name => { setSourceTest(name); setChanged(true); }} />
                </div>
                <div className="w-full sm:w-[260px]">
                  <label htmlFor="batch-numbers-input" className="mb-1.5 block text-sm font-bold">
                    Số câu sai <span className="text-xs font-semibold text-slate-400">không bắt buộc</span>
                  </label>
                  <input
                    id="batch-numbers-input"
                    type="text"
                    value={batchNumbersText}
                    disabled={Boolean(batchProgress)}
                    onChange={event => { setBatchNumbersText(event.target.value); setError(''); }}
                    placeholder="VD: 107 131-134"
                    className={twMerge(inputClass, 'min-h-11 py-2 text-sm border-2 border-slate-300 dark:border-slate-700')}
                  />
                  <p className="mt-1 text-[11.5px] font-semibold text-slate-400 dark:text-slate-500">Để trống để AI tự dò mọi câu 101–200 trong ảnh</p>
                </div>
              </div>

              {/* Hàng 2: Khung Kéo thả / Chọn nhiều ảnh */}
              <div
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  const files = [...event.dataTransfer.files].filter(f => f.type.startsWith('image/'));
                  if (files.length) void handleBatchFiles(files);
                }}
                className="flex flex-col items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 px-4 py-3.5 text-center dark:border-violet-800 dark:bg-violet-950/20 sm:flex-row sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                    <ImagePlus className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Thả hoặc dán nhiều ảnh màn hình đề <kbd className="ml-1 rounded border border-b-2 border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Ctrl+V</kbd>
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Chỉ quét Reading Part 5–7 (câu 101–200) · Không chụp Listening Part 1–4
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {batchProgress ? (
                    <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300" role="status">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" aria-hidden="true" />
                      Đang quét ảnh {Math.min(batchProgress.done + 1, batchProgress.total)}/{batchProgress.total}…
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => batchFileInput.current?.click()}
                      className="min-h-10 cursor-pointer rounded-xl border-2 border-slate-900 bg-white px-4 text-sm font-black text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-200 dark:bg-slate-900 dark:text-white dark:shadow-none">
                      Chọn nhiều ảnh…
                    </button>
                  )}
                  <input
                    ref={batchFileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    hidden
                    aria-label="Ảnh màn hình câu sai"
                    onChange={event => {
                      const files = [...(event.target.files ?? [])];
                      event.target.value = '';
                      if (files.length) void handleBatchFiles(files);
                    }}
                  />
                </div>
              </div>

              {/* Hàng 3: Danh sách câu đã bóc tách */}
              {batchItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span>Đã quét được {batchItems.length} câu:</span>
                    <button
                      type="button"
                      onClick={() => setBatchItems([])}
                      className="text-rose-600 hover:underline dark:text-rose-400">
                      Xóa tất cả
                    </button>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
                    {batchItems.map(item => {
                      const choiceLetter = item.draft.userChoice || '—';
                      const answerLetter = optionLetter(item.draft.correctAnswer) || (item.draft.correctAnswer ? item.draft.correctAnswer : '—');
                      const questionText = item.draft.question || item.draft.questionContext || `Câu ${item.number}`;
                      return (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 text-sm sm:flex-nowrap">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <PartBadge part={item.part} />
                            <span className="shrink-0 font-extrabold text-slate-900 dark:text-slate-100">Câu {item.number}</span>
                            <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-400" title={questionText}>
                              {questionText}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              Bạn chọn {choiceLetter}
                            </span>
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              Đáp án {answerLetter}
                            </span>
                            <select
                              aria-label={`Lỗi sai câu ${item.number}`}
                              value={item.category}
                              onChange={event => {
                                const cat = event.target.value as ErrorCategory;
                                setBatchItems(items => items.map(it => it.id === item.id ? { ...it, category: cat } : it));
                              }}
                              className="h-8 rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">
                              {Object.entries(CATEGORY_CHOICES).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label={`Xóa câu ${item.number}`}
                              onClick={() => setBatchItems(items => items.filter(it => it.id !== item.id))}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <fieldset disabled={busy || imageBusy || persisting} className="space-y-2 border-0 p-0">
          {isPhone ? <>
          <div><p className="mb-2 text-[13.5px] font-black text-slate-700 dark:text-slate-200">Part <span className="text-rose-600" aria-hidden="true">*</span></p>
            {partButtons}
          </div>
          <div><span className="mb-2 block text-[13.5px] font-black text-slate-700 dark:text-slate-200">Đề <span className="text-rose-600" aria-hidden="true">*</span></span>
            <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
            onChange={name => { if ((reading || imageIdsDraft.length) && testNameKey(name) !== testNameKey(sourceTestName)) clearReading(); setSourceTest(name); setChanged(true); }} />
          </div>
          {contextBlock}
          </> : <>
          <div className="flex w-full items-end gap-4">
          <div><span className="mb-1.5 block text-sm font-bold">Part <span className="ml-1 text-xs font-semibold text-slate-400 dark:text-slate-500">(Reading)</span></span>{partButtons}</div>
          <div className="min-w-0 flex-1"><span className="mb-1.5 block text-sm font-bold">Đề</span>
          <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
            onChange={name => { if ((reading || imageIdsDraft.length) && testNameKey(name) !== testNameKey(sourceTestName)) clearReading(); setSourceTest(name); setChanged(true); }} />
          </div>
          {categorySelect}
          </div>
          </>}
          <div><div className="mb-1"><label htmlFor="mistake-paste" className="text-sm font-bold">{instructions.label}</label></div>
            <p id="mistake-input-hint" className="mb-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300 max-md:sr-only">{reading ? sourceImageIds.length ? 'Dán câu mới kèm phương án. Dùng lại ảnh bài đọc, không cần thêm lại.' : 'Dán câu mới kèm phương án; bài đọc được dùng lại.' : isPhone ? instructions.hint.replace('bên dưới', 'bên trên') : instructions.hint}</p>
            <div className="relative"><textarea id="mistake-paste" aria-describedby="mistake-input-hint" maxLength={8000} spellCheck={false} value={raw} onChange={event => { setRaw(event.target.value); setCorrected(null); setChanged(true); }} rows={3}
              onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addImages(files); } }}
              placeholder={effectivePart === 1 ? 'Dán bốn mô tả nghe A–D…' : effectivePart === 2 ? 'Dán câu hỏi và ba phản hồi A–C…' : 'Dán một câu hỏi và các phương án…'}
              className={twMerge(inputClass, 'min-h-[148px] resize-y border-2 border-slate-900 bg-[#FFFDF7] dark:border-slate-300 dark:bg-slate-900 max-md:min-h-[128px] max-md:pb-12')} />
            {isPhone && canReadClipboard && !raw && <button type="button" onClick={() => void navigator.clipboard.readText().then(text => { if (text) { setRaw(text); setCorrected(null); setChanged(true); } }).catch(() => undefined)}
              className="absolute bottom-2.5 right-2.5 flex h-9 items-center gap-1.5 rounded-xl border-[1.5px] border-blue-200 bg-white px-3 text-[13px] font-black text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />Dán</button>}</div>
            {!config?.freeformInput && !corrected && raw && parsed.error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          </div>
          {!isPhone && contextBlock}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><fieldset><legend className="mb-1 text-sm font-bold">Bạn đã chọn{optional}</legend><div className="flex flex-wrap gap-2 max-md:flex-nowrap">{choiceLetters.map(choiceButton)}</div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{choicesReady ? 'Không chọn nếu chưa nhớ. Bấm lại để bỏ chọn.' : 'Dán câu hỏi để chọn phương án.'}</p></fieldset>
            {!isPhone && answerDetails}
          </div>
          {(!isPhone || choice || reason) && <>
          <div><label htmlFor="mistake-reason" className="mb-1 block text-sm font-bold">Lý do chọn{optional}</label><textarea id="mistake-reason" maxLength={2000} rows={1} value={reason} onChange={event => { setReason(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.max(36, Math.min(120, event.currentTarget.scrollHeight))}px`; setChanged(true); }} placeholder="Mình chọn vì…" className={twMerge(inputClass, 'min-h-9 border-2 border-slate-300 bg-white py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900')} /></div>
          </>}
          {isPhone && <details className="group rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="flex min-h-[50px] cursor-pointer list-none items-center justify-between text-[14px] font-bold [&::-webkit-details-marker]:hidden">Đáp án, loại lỗi<span className="flex items-center gap-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{source ? `Đáp án ${source}` : 'Tùy chọn'}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span></summary>
            <div className="space-y-3 border-t border-stone-200 py-3 dark:border-slate-700">{answerDetails}{categorySelect}</div>
          </details>}
          {original && original.userReason === undefined && original.userMistake && <details className="text-sm"><summary className="cursor-pointer font-semibold">Ghi chú cũ</summary><p className="mt-2 whitespace-pre-line text-base leading-relaxed">{original.userMistake}</p></details>}
        </fieldset>)) : step === 'saved' ? <div role="status" className="flex flex-col items-center gap-3 py-5 text-center"><SuccessMark /><p className="text-lg font-bold">Đã lưu lỗi sai</p>{sourceTestName && <p className="text-sm text-slate-500 dark:text-slate-400">{sourceTestName}</p>}<p className="text-sm text-slate-500 dark:text-slate-400">{draft?.correctAnswer ? `${draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã lưu'}: ${draft.correctAnswer}` : 'Chưa có đáp án · bổ sung trước khi ôn'}</p></div> : draft && <>
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
          {draft.part === null && <label className="block text-sm font-semibold">Part<select aria-label="Part" className={`${inputClass} mt-1`} value="" onChange={event => { const value = Number(event.target.value) as MistakeEntry['part']; setDraft({ ...draft, part: value || null }); setPart(value || null); draftInput.current = inputText({ ...input, part: value || null }); setChanged(true); }}><option value="">Chọn Part</option>{partChoices.map(value => <option key={value} value={value}>Part {value}</option>)}</select></label>}
        </>}
        {step === 'input' && aiAccess?.enabled === false && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p>{aiAccess.accessMessage}</p><button type="button" disabled={configBusy} onClick={() => setConfigAttempt(value => value + 1)} className="min-h-10 font-semibold underline">Kiểm tra quyền AI</button>
        </div>}
        {error && <div className="space-y-1 text-sm text-rose-600 dark:text-rose-300" role="alert"><p>{error}</p>{step === 'input' && !configBusy && !config && <button type="button" onClick={() => setConfigAttempt(value => value + 1)} className="font-bold underline">Thử kết nối lại</button>}
          {original && error.includes('nơi khác') && <button type="button" onClick={() => { if (window.confirm('Tải lại thẻ và bỏ các thay đổi chưa lưu?')) onReload(); }} className="font-bold underline">Tải lại thẻ</button>}</div>}
        {step === 'input' && <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />}
      </ScrollableModalBody>
      <footer className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-[#111A2C] sm:px-6 max-md:pb-[calc(0.875rem+env(safe-area-inset-bottom))] ${step === 'input' ? 'max-md:flex-nowrap' : ''}`}>
        {step === 'input' ? (
          entryMode === 'batch' ? (
            <>
              <div className="max-w-[50%] truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                {batchItems.length ? `Đã quét ${batchItems.length} câu sai` : 'Chọn đề rồi tải ảnh các câu sai Reading'}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={close} className={linkClass}>
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={saveBatch}
                  disabled={!batchItems.length || Boolean(batchProgress)}
                  className={`${primaryClass} bg-blue-600 text-white hover:bg-blue-500 dark:border-slate-200`}>
                  {`Lưu ${batchItems.length ? `${batchItems.length} ` : ''}câu sai`}
                </button>
              </div>
            </>
          ) : (
            <><button type="button" onClick={() => void analyze()} disabled={busy || imageBusy || persisting || configBusy || !config || aiAccess?.enabled === false || (!raw.trim() && !images.length)} className={`${aiAvailable ? `${primaryClass} bg-blue-600 text-white hover:bg-blue-500 dark:border-slate-200 max-md:min-h-[52px] max-md:flex-[1.5] max-md:justify-center max-md:text-[15px]` : linkClass} max-md:order-2 inline-flex min-h-11 items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}><Sparkles className="h-4 w-4" aria-hidden="true" />{busy ? 'Đang phân tích…' : 'Phân tích với AI'}</button><button type="button" onClick={quickSave} disabled={busy || imageBusy || persisting} aria-label={original ? undefined : 'Lưu thủ công'} className={'max-md:order-1 max-md:min-h-[52px] max-md:flex-1 max-md:text-[15px] ' + (aiAvailable ? 'min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800' : `${primaryClass} bg-blue-600 text-white hover:bg-blue-500 dark:border-slate-200`)}>{original ? 'Lưu thay đổi' : isPhone ? 'Lưu' : 'Lưu thủ công'}</button></>
          )
        )
          : step === 'saved' ? <><button type="button" onClick={onClose} className={linkClass}>Đóng</button><div className="flex flex-wrap items-center justify-end gap-3">{canReuseReading && <button type="button" onClick={() => resetEntry()} className={linkClass}>Bài đọc mới</button>}<button type="button" onClick={() => resetEntry(canReuseReading)} className={`${primaryClass} bg-blue-600 text-white hover:bg-blue-500 dark:border-slate-200`}>{canReuseReading ? 'Thêm câu cùng bài đọc' : 'Thêm câu tiếp'}</button></div></>
          : <><button type="button" disabled={persisting} onClick={() => { setStep('input'); setError(''); }} className={linkClass}>Quay lại</button><div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">{!original && <button type="button" disabled={persisting} onClick={() => void save(true, draft, false, canReuseReading)} className={`${primaryClass} min-h-11 bg-white text-slate-950 hover:bg-slate-50 dark:border-slate-300 dark:bg-slate-900 dark:text-white`}>{canReuseReading ? 'Lưu & thêm câu cùng bài' : 'Lưu & thêm tiếp'}</button>}<button type="button" disabled={persisting} onClick={() => void save()} className={`${primaryClass} bg-blue-600 text-white hover:bg-blue-500 dark:border-slate-200`}>{persisting ? 'Đang lưu…' : original ? 'Lưu thay đổi' : 'Lưu câu sai'}</button></div></>}
      </footer>
    </div>
  </div>;
}
