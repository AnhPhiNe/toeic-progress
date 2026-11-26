import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateUUID } from '@/shared/domain/uuid';
import { ChevronDown, ClipboardPaste, Sparkles, X } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { requestAISignIn } from '@/shared/lib/aiSignIn';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { askConfirm } from '@/shared/components/ConfirmDialog';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration, AIUsage, AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { CHOICE_LETTERS, inputText, learnerMistake, parsePastedQuestion, type ChoiceLetter, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { fitsSyncPayload } from '@/features/mistakes/lib/explanationMerge';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { PartBadge } from '@/features/mistakes/components/MistakeCard';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import { normalizeTestName, testNameKey } from '@/features/mistakes/lib/sourceTests';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import './entry-rd.css';
import { ScrollableModalBody } from '@/shared/components/ScrollableModalBody';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { QuestionContext } from '@/features/mistakes/components/QuestionContext';
import { mistakeInstructions } from '@/features/mistakes/lib/mistakeInstructions';
import { MistakeContextInput } from '@/features/mistakes/components/MistakeContextInput';
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';
import { getActiveAccountId, runAsOwner } from '@/shared/data/dataBundle';
import { loadStudySessions } from '@/shared/data/storage';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { parseMistakeFormDraft, type MistakeFormDraft } from '@/shared/data/studyFormDrafts';

function latestSessionTestName(): string {
  const active = loadStudySessions().filter(s => !s.deletedAt && normalizeTestName(s.testName));
  if (active.length === 0) return '';
  const latest = [...active].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  return latest ? normalizeTestName(latest.testName) : '';
}

interface Props {
  original: MistakeEntry | null;
  sourceSuggestions?: string[];
  initialSourceName?: string;
  initialSessionId?: string;
  initialReading?: string;
  /** Explicit creation actions keep their unfinished work separate from the general new-note draft. */
  draftScope?: string;
  onAdd: (entry: MistakeEntry) => void;
  onAddBatch?: (entries: MistakeEntry[]) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  onClose: () => void;
  onReload: () => void;
  onSaved?: (message: string) => void;
}

const inputClass = 'rdm-in w-full';
const linkClass = 'rdm-link cursor-pointer';
const primaryClass = 'rd-btn rdm-btn disabled:cursor-not-allowed disabled:opacity-40';

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

export function MistakeEntryModal({ original, sourceSuggestions = [], initialSourceName = '', initialSessionId, initialReading = '', draftScope, onAdd, onUpdate, onClose, onReload, onSaved }: Props) {
  const initialContext = typeof original?.question === 'string' ? original.context ?? '' : initialReading;
  const hasInitialReading = (original?.part ?? 7) === 7 && Boolean(initialContext.trim());
  const [contextText, setContextText] = useState(initialContext);
  const [readingText, setReadingText] = useState<string | null>(hasInitialReading ? initialContext : null);
  const [persisting, setPersisting] = useState(false);
  const [step, setStep] = useState<'input' | 'preview' | 'saved'>('input');
  const owner = useRef(getActiveAccountId());
  const [saveMoreReceipt, setSaveMoreReceipt] = useState(false);
  const [raw, setRaw] = useState(original ? [originalQuestion(original, Boolean(initialContext.trim())), ...(original.options ?? [])].join('\n') : '');
  const [part, setPart] = useState<MistakeEntry['part'] | null>(original?.part ?? (hasInitialReading ? 7 : null));
  const [choice, setChoice] = useState<ChoiceLetter | 'UNKNOWN' | 'BLANK' | ''>(original ? (original.userChoiceState === 'BLANK' ? 'BLANK' : getUserChoice(original) || 'UNKNOWN') : '');
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [reason, setReason] = useState(original?.userReason ?? '');
  const [sourceTest, setSourceTest] = useState(() => original ? (original.sourceTestName ?? initialSourceName) : (initialSourceName || latestSessionTestName()));
  const [keyOpen, setKeyOpen] = useState(false);
  const sourceTestName = sourceSuggestions.find(name => testNameKey(name) === testNameKey(sourceTest)) ?? normalizeTestName(sourceTest);
  const [source, setSource] = useState<ChoiceLetter | ''>(original?.answerSource === 'PROVIDED' ? optionLetter(original.correctAnswer) : '');
  const initialSource = useRef(source);
  const [corrected, setCorrected] = useState<{ question: string; options: string[] } | null>(original ? { question: originalQuestion(original, Boolean(initialContext.trim())),
    options: (original.options ?? []).map((option, index) => /^\([A-D]\)/i.test(option) ? option : `(${CHOICE_LETTERS[index]}) ${option}`) } : null);
  const [draft, setDraft] = useState<AIMistakeParseResult | null>(original ? storedDraft(original) : null);
  const [manual, setManual] = useState(false);
  const [answerProvidedBy, setAnswerProvidedBy] = useState(original?.answerProvidedBy);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [aiAccess, setAIAccess] = useState<AIUsage | null>(null);
  const [configBusy, setConfigBusy] = useState(true);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
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
  const entryId = useRef<string>(generateUUID());
  const draftInput = useRef('');
  const saved = useRef(false);
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const parsed = useMemo(() => parsePastedQuestion(raw, part), [raw, part]);
  const question = corrected?.question ?? parsed.question;
  const options = corrected?.options.filter(Boolean) ?? parsed.options;
  const context = contextText;
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
    ...(selectedCategory ? { errorCategory: selectedCategory } : {}),
    ...(original ? { savedCard: true } : {}) };
  const currentInput = inputText(input);
  const initialInput = useRef(currentInput);
  if (original && !draftInput.current) draftInput.current = initialInput.current;
  const formDraft: MistakeFormDraft = {
    raw, part, choice, reason, sourceTest, source, contextMode: 'text', contextText, imageIds: [],
    readingText, hadUnsavedImages: false,
    corrected, draft, manual, answerProvidedBy, category, selectedCategory, tags,
    step: step === 'preview' ? 'preview' : 'input', entryMode: 'single', batchNumbersText: '',
    batchItems: [], batchSummary: null,
    entryId: entryId.current, draftInput: draftInput.current, draftImageKey: '', changed,
    originalUpdatedAt: original?.updatedAt
  };
  const persistentDraft = useFormDraft({
    scope: `mistake:${original?.id ?? draftScope ?? initialSessionId ?? 'new'}`, enabled: !saved.current,
    value: formDraft, meaningful: changed || Boolean(raw.trim() && !original),
    validate: value => {
      const parsedDraft = parseMistakeFormDraft(value);
      return parsedDraft && parsedDraft.originalUpdatedAt === original?.updatedAt ? parsedDraft : null;
    },
    restore: value => {
      setRaw(value.raw); setPart(value.part as MistakeEntry['part'] | null); setChoice(value.choice); setReason(value.reason);
      setSourceTest(value.sourceTest); setSource(value.source); setContextText(value.contextText);
      setReadingText(value.readingText);
      setCorrected(value.corrected); setDraft(value.draft); setManual(value.manual); setAnswerProvidedBy(value.answerProvidedBy);
      setCategory(value.category); setSelectedCategory(value.selectedCategory); setTags(value.tags);
      entryId.current = value.entryId; draftInput.current = value.draftInput;
      setChanged(value.changed); setStep(value.step);
    }
  });

  useEffect(() => {
    let cancelled = false;
    setConfigBusy(true);
    void aiService.getAIConfiguration().then(async value => {
      const access = value.managedAccess ? await aiService.getAIUsage() ?? { remaining: 0, limit: 0, guest: true, enabled: false,
        accessStatus: 'login_required' as const, accessMessage: 'Đăng nhập Google để dùng AI. Bạn vẫn có thể nhập và lưu thủ công.' } : null;
      if (!cancelled) { setConfig(value); setAIAccess(access); setError(''); }
    })
      .catch(value => { if (!cancelled) setError(value instanceof Error ? value.message : 'Chưa kết nối được AI.'); })
      .finally(() => { if (!cancelled) setConfigBusy(false); });
    return () => { cancelled = true; };
  }, [configAttempt]);
  useEffect(() => () => { requestEpoch.current++; }, []);

  const closeAsync = useCallback(async () => {
    if (saving.current) return;
    if (!persistentDraft.persist() && changed && !saved.current) {
      const ok = await askConfirm({
        title: 'Chưa tự lưu được nháp',
        message: 'Đóng form bây giờ sẽ mất nội dung đang nhập. Vẫn đóng?',
        confirmLabel: 'Vẫn đóng',
        cancelLabel: 'Ở lại',
        destructive: true
      });
      if (!ok) return;
    }
    requestEpoch.current++; removeCaptcha(); onClose();
  }, [changed, onClose, removeCaptcha, persistentDraft]);
  const close = useCallback(() => { void closeAsync(); }, [closeAsync]);
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
    const maxLen = original ? 12000 : 8000;
    if (ai && config?.freeformInput) {
      if (!raw.trim()) return 'Dán nội dung câu cần phân tích.';
      if (sourceTestName.length > 300) return 'Tên đề tối đa 300 ký tự.';
      if (inputText({ ...input, question: '', options: [], rawText: raw }).length > maxLen) return `Tổng nội dung, ngữ cảnh và lý do tối đa ${maxLen.toLocaleString('vi-VN')} ký tự.`;
      return '';
    }
    if (effectivePart === 1 && options.length !== 4) return 'Part 1 cần đủ bốn phương án nghe A–D bằng văn bản.';
    if (effectivePart !== 1 && !question.trim()) return 'Dán câu hỏi và phương án trước khi tiếp tục.';
    if (sourceTestName.length > 300) return 'Tên đề tối đa 300 ký tự.';
    if (!corrected && parsed.error) return config?.freeformInput ? 'Bấm “Phân tích với AI” để tách nội dung trước khi lưu. Bản nháp của bạn vẫn được giữ.' : parsed.error;
    if (input.userChoice && options.length && !options.some(option => option.startsWith(`(${input.userChoice})`))) return 'Lựa chọn chưa khớp phương án. Kiểm tra lại nội dung đã dán.';
    if (source && options.length && !options.some(option => option.startsWith(`(${source})`))) return 'Đáp án từ đề chưa khớp phương án.';
    if (effectivePart === 2 && options.length > 3) return 'Part 2 chỉ có A–C. Kiểm tra lại phương án.';
    if (ai && options.length < 2) return 'Cần ít nhất hai phương án có nội dung để phân tích.';
    if (ai && options.some((option, index) => letterOf(option, index) !== CHOICE_LETTERS[index])) return 'Bổ sung phương án còn thiếu ở giữa trước khi phân tích, hoặc lưu thủ công.';
    if (ai && currentInput.length > maxLen) return `Tổng câu hỏi, phương án, ngữ cảnh và lý do tối đa ${maxLen.toLocaleString('vi-VN')} ký tự.`;
    return '';
  };

  const manualDraft = (): AIMistakeParseResult => {
    if (!draft || draftInput.current !== currentInput) {
      const previous = draftInput.current ? JSON.parse(draftInput.current) as MistakeInput : null;
      const sameQuestion = previous && JSON.stringify([question, options, context, source]) === JSON.stringify([previous.question, previous.options, previous.context, previous.sourceAnswer]);
      const correctAnswer = source ? options.find(option => option.startsWith(`(${source})`)) ?? '' : sameQuestion ? draft?.correctAnswer ?? '' : '';
      const preserveText = draft?.trapTip ?? '';
      const changedLearner = sameQuestion && previous && JSON.stringify([input.userChoiceState, input.userChoice, reason]) !== JSON.stringify([previous.userChoiceState, previous.userChoice, previous.userReason]);
      return { part: effectivePart, questionContext: [question, context].filter(Boolean).join('\n\n'), options,
        ...(contextText.trim() || readingText ? { question, context } : sameQuestion && typeof draft?.question === 'string'
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
    if (busy || persisting) return;
    const problem = validate(true);
    if (problem) { setError(problem); return; }
    if (aiAccess?.enabled === false) { setError(aiAccess.accessMessage || 'Tài khoản chưa được duyệt sử dụng AI.'); return; }
    if (!config?.structuredInput) { setError(config ? 'Backend chưa hỗ trợ form mới. Bạn vẫn có thể lưu thủ công.' : 'AI chưa sẵn sàng. Bạn vẫn có thể lưu thủ công.'); return; }
    const epoch = ++requestEpoch.current;
    const current = () => epoch === requestEpoch.current && getActiveAccountId() === owner.current;
    setBusy(true); setError('');
    try {
      const { errorCategory: _errorCategory, ...baseInput } = input;
      const selectedInput = config.learnerCategory ? input : baseInput;
      const sentInput = config.freeformInput ? { ...selectedInput, question: '', options: [], rawText: raw } : selectedInput;
      const result = await aiService.extractMistakeWithAI(inputText(sentInput), getToken, sentInput, [], owner.current, current);
      if (!current()) return;
      const extractedQuestion = result.draft.question ?? readQuestion(result.draft).question;
      const resolvedInput = { ...input, ...(config.freeformInput ? { question: extractedQuestion, options: result.draft.options } : {}),
        part: (effectivePart ?? result.draft.part) as MistakeEntry['part'] | null };
      if (config.freeformInput) setCorrected({ question: extractedQuestion, options: result.draft.options });
      draftInput.current = inputText(resolvedInput);
      const reusedSource = readingText && effectivePart === 7 ? {
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
    setReadingText(text.trim() ? text : null);
    setContextText(text);
    setRaw(''); setPart(nextPart); setChoice(''); setReason(''); setSource(''); setCorrected(null);
    setDraft(null); setStep('input'); setChanged(false); setAnswerProvidedBy(undefined);
    setCategory('OTHER'); setSelectedCategory(''); setTags(''); setError(''); setKeyOpen(false);
    entryId.current = generateUUID(); draftInput.current = ''; saved.current = false;
    requestAnimationFrame(() => ref.current?.querySelector<HTMLTextAreaElement>('#mistake-paste')?.focus());
  };

  const clearReading = () => {
    setReadingText(null); setContextText('');
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
      if (epoch !== requestEpoch.current) return;
      const entry: MistakeEntry = { ...(original ?? {}), id: original?.id ?? entryId.current,
        createdAt: original?.createdAt ?? new Date().toISOString(), status: original?.status ?? 'NEEDS_REVIEW',
        sourceTestName,
        sessionId: original?.sessionId ?? (testNameKey(sourceTestName) === testNameKey(initialSourceName) ? initialSessionId : undefined),
        part: value.part as MistakeEntry['part'], questionContext: value.questionContext, options: value.options.length ? value.options : undefined,
        question: value.question ?? undefined, context: value.context ?? undefined,
        userChoice: input.userChoice || undefined, userChoiceState: input.userChoiceState,
        userReason: original && original.userReason === undefined && !reason.trim() ? undefined : reason,
        userMistake: original && original.userReason === undefined && !reason.trim() ? original.userMistake : learnerMistake(input), correctAnswer: value.correctAnswer,
        answerSource: value.correctAnswer.trim() ? value.answerSource : 'MISSING', answerProvidedBy: source ? (source !== initialSource.current ? 'SOURCE' : answerProvidedBy ?? 'SOURCE') : value.answerSource === 'PROVIDED' ? answerProvidedBy : undefined,
        category: selectedCategory || category, tags: tags.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20), trapTip: value.trapTip || undefined,
        optionNotes: value.optionNotes.length ? value.optionNotes : undefined, explanation: value.explanation ?? undefined };
      if (entry.tags.some(tag => tag.length > 80)) throw new Error('Mỗi tag tối đa 80 ký tự. Kiểm tra lại nội dung đã nhập.');
      if (entry.questionContext.length > 16000 || (entry.question?.length ?? 0) > 16000 || (entry.context?.length ?? 0) > 16000 || (entry.options ?? []).some(option => option.length > 2000) || entry.correctAnswer.length > 2000) {
        throw new Error('Câu hỏi tối đa 16.000 ký tự; mỗi phương án/đáp án tối đa 2.000 ký tự. Kiểm tra lại nội dung đã nhập.');
      }
      if (!fitsSyncPayload(entry)) {
        throw new Error('Thẻ vượt giới hạn 64 KiB. Rút gọn câu hỏi/đoạn trích trước khi lưu; bản nháp được giữ.');
      }
      runAsOwner(owner.current, () => {
        if (original) onUpdate(entry, original);
        else onAdd(entry);
      });
      saved.current = true;
      persistentDraft.clear();
      if (addAnother && !original) {
        resetEntry(reuse, value);
        setSaveMoreReceipt(true);
      } else if (quick && !original) { setDraft(value); setStep('saved'); } else { onSaved?.(original ? 'Đã lưu thay đổi' : 'Đã lưu ghi chú'); onClose(); }
    } catch (value) { setError(value instanceof Error ? value.message : 'Chưa lưu được. Nội dung đang nhập được giữ.'); }
    finally { saving.current = false; setPersisting(false); }
  };

  const quickSave = () => {
    if (busy || persisting || saved.current) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    const value = manualDraft();
    // Existing explanation changes still need a review before saving stale prose.
    if (value.missingInformation.length) {
      const needsManualReview = !draft || draftInput.current !== currentInput;
      setDraft(value); draftInput.current = currentInput; setManual(needsManualReview); setStep('preview'); setError(''); return;
    }
    void save(false, value, true);
  };

  const discardDraft = async () => {
    const ok = await askConfirm({
      title: 'Xóa bản nháp?',
      message: 'Xóa bản nháp đang nhập và đóng form? Câu sai đã lưu không bị ảnh hưởng.',
      confirmLabel: 'Bỏ nháp',
      cancelLabel: 'Giữ lại',
      destructive: true
    });
    if (ok && persistentDraft.clear()) { requestEpoch.current++; removeCaptcha(); onClose(); }
  };

  const reloadCard = async () => {
    const ok = await askConfirm({
      title: 'Tải lại thẻ?',
      message: 'Tải lại thẻ từ dữ liệu mới nhất và bỏ các thay đổi chưa lưu?',
      confirmLabel: 'Tải lại',
      cancelLabel: 'Ở lại',
      destructive: true
    });
    if (ok) onReload();
  };

  const draftQuestion = draft ? readQuestion(draft) : { question: '', context: '' };
  const aiAvailable = !configBusy && Boolean(config?.structuredInput) && aiAccess?.enabled !== false;
  const canReuseReading = draft?.part === 7 && Boolean((readingText || draft.context)?.trim());
  const quiz = resolveQuizOptions({ questionContext: draft?.questionContext ?? '', options: draft?.options,
    correctAnswer: draft?.correctAnswer ?? '', optionNotes: draft?.optionNotes });
  const choosePart = (nextPart: MistakeEntry['part'] | null) => {
    if (readingText && nextPart !== 7) clearReading();
    if (nextPart !== null && nextPart >= 5 && selectedCategory === 'LISTENING_SPEED') setSelectedCategory('');
    setPart(nextPart); setChanged(true);
  };
  const partButtons = (
    <div className="flex gap-1.5" role="group" aria-label="Part">
      {partChoices.map(value => <button key={value} type="button" aria-pressed={effectivePart === value} aria-label={`Part ${value}`}
        onClick={() => choosePart(value)}
        className="rdm-pchip max-md:flex-1">{value}</button>)}
    </div>
  );
  const optional = null;
  const canReadClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  const choiceButton = (letter: ChoiceLetter) => {
    const option = options.find(value => value.startsWith(`(${letter})`));
    return <button type="button" key={letter} disabled={!choicesReady || (!freeformReady && !option)} aria-pressed={choice === letter} aria-label={`Bạn chọn ${letter}`} title={option?.replace(/^\([A-D]\)\s*/, '')}
      onClick={() => { setChoice(value => value === letter ? '' : letter); setChanged(true); }} className="rdm-abcd is-me max-md:flex-1">{letter}</button>;
  };

  const contextField = (
    <MistakeContextInput part={effectivePart} text={contextText} busy={busy || persisting}
      onText={value => { setContextText(value); setReadingText(current => current !== null ? value : null); invalidateContext(); }}
      reuseLabel={readingText ? original ? 'Đang dùng bài đọc đã lưu' : 'Đang dùng bài đọc trước' : undefined} onReset={clearReading} />
  );
  const contextBlock = readingText
    ? <details className="rdm-key"><summary>Đoạn đọc đã có (bấm để xem hoặc sửa)</summary>{contextField}</details>
    : contextField;
  const answerDetails = (
    <details open={isPhone || keyOpen} onToggle={event => { if (!isPhone) setKeyOpen(event.currentTarget.open); }} className="rdm-key">
      <summary>{source ? `Đáp án từ đề: ${source}` : <>Đáp án đúng từ đề{optional}</>}</summary>
      <fieldset className="mt-1">
        <legend className="sr-only">Đáp án từ đề</legend>
        <div className="flex flex-wrap gap-2">{choiceLetters.map(letter => { const option = options.find(value => value.startsWith(`(${letter})`)); return <button type="button" key={letter} disabled={!choicesReady || (!freeformReady && !option)} aria-label={`Đáp án từ đề: ${letter}`} aria-pressed={source === letter} onClick={() => { setSource(value => value === letter ? '' : letter); setChanged(true); }} className="rdm-abcd is-ok">{letter}</button>; })}</div>
      </fieldset>
      {!choicesReady && <p className="rdm-hint">Dán câu hỏi để chọn đáp án từ đề.</p>}
      {source && <button type="button" className="rdm-link is-quiet mt-1" onClick={() => { setSource(''); setChanged(true); }}>Bỏ chọn</button>}
    </details>
  );
  const visibleCategories = Object.entries(CATEGORY_CHOICES).filter(([value]) => (effectivePart === null || effectivePart <= 4) || value !== 'LISTENING_SPEED');
  const categorySelect = (
    <label className="rdm-lab w-[200px] shrink-0 max-md:col-span-2 max-md:w-full">Lỗi sai{optional}
      <select aria-label="Lỗi sai" className="rdm-in rdm-select mt-1.5"
        value={selectedCategory} onChange={event => { setSelectedCategory(event.target.value as ErrorCategory | ''); setChanged(true); }}>
        <option value="">Chưa chọn</option>{visibleCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );

  const showDraftBar = step !== 'saved' && (persistentDraft.state === 'restored' || persistentDraft.state === 'unavailable');

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(47,58,51,.45)] sm:items-center sm:p-4" onClick={event => { if (event.target === event.currentTarget && event.detail <= 1) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="mistake-entry-title" className="rd rdm flex max-h-[100dvh] w-full flex-col bg-white max-md:h-[100dvh] sm:max-h-[92dvh] sm:max-w-3xl">
      <header className="rdm-head flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 id="mistake-entry-title" className="rdm-title shrink-0">{saveMoreReceipt ? <span role="status" className="entry-more-receipt inline-flex items-center gap-2 text-emerald-700"><SuccessMark />Đã lưu ghi chú</span>
            : <span>{step === 'preview' ? 'Kiểm tra và lưu' : original ? 'Sửa câu sai' : 'Thêm câu sai'}</span>}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Đóng" className="rdm-x"><X className="h-5 w-5" /></button>
      </header>
      {showDraftBar && <div className="rdm-draft flex shrink-0 items-center justify-between gap-3">
        <span role="status">{persistentDraft.state === 'unavailable' ? 'Chưa tự lưu được nháp trên trình duyệt. Giữ form mở để tránh mất nội dung.' : 'Đã khôi phục bản nháp trên thiết bị này.'}</span>
        {persistentDraft.state === 'restored' && (
          <button type="button" disabled={busy || persisting} className="rdm-link is-quiet shrink-0 disabled:opacity-50" onClick={() => void discardDraft()}>Bỏ nháp</button>
        )}
      </div>}
      <ScrollableModalBody resetKey={step} compact>
        {step === 'input' ? (
          <fieldset disabled={busy || persisting} className="space-y-3 border-0 p-0">
            {isPhone ? <>
              <div><p className="rdm-lab mb-2">Part</p>{partButtons}</div>
              <div><span className="rdm-lab mb-2 block">Đề</span>
                <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
                  onChange={name => { if (readingText && testNameKey(name) !== testNameKey(sourceTestName)) clearReading(); setSourceTest(name); setChanged(true); }} />
              </div>
              {contextBlock}
            </> : <>
              <div className="flex w-full items-end gap-4">
                <div><span className="rdm-lab mb-1.5 block">Part</span>{partButtons}</div>
                <div className="min-w-0 flex-1"><span className="rdm-lab mb-1.5 block">Đề</span>
                  <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
                    onChange={name => { if (readingText && testNameKey(name) !== testNameKey(sourceTestName)) clearReading(); setSourceTest(name); setChanged(true); }} />
                </div>
                {categorySelect}
              </div>
            </>}
            <div>
              <div className="mb-1"><label htmlFor="mistake-paste" className="rdm-lab">{instructions.label}</label></div>
              <p id="mistake-input-hint" className="rdm-hint mb-1.5 max-md:sr-only">{readingText ? 'Dán câu mới kèm phương án; bài đọc được dùng lại.' : isPhone ? instructions.hint.replace('bên dưới', 'bên trên') : instructions.hint}</p>
              <div className="relative">
                <textarea id="mistake-paste" aria-describedby="mistake-input-hint" maxLength={8000} spellCheck={false} value={raw} onChange={event => { setRaw(event.target.value); setCorrected(null); setChanged(true); }} rows={3}
                  placeholder={effectivePart === 1 ? 'Dán bốn phương án A–D…' : effectivePart === 2 ? 'Dán câu hỏi và ba phản hồi A–C…' : 'Dán một câu hỏi và các phương án…'}
                  className="rdm-in rdm-ta min-h-[148px] w-full resize-y max-md:min-h-[128px] max-md:pb-12" />
                {isPhone && canReadClipboard && !raw && <button type="button" onClick={() => void navigator.clipboard.readText().then(text => { if (text) { setRaw(text); setCorrected(null); setChanged(true); } }).catch(() => undefined)}
                  className="rdm-paste absolute bottom-2.5 right-2.5">
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" />Dán</button>}
              </div>
              {!config?.freeformInput && !corrected && raw && parsed.error && <p role="alert" className="rdm-err mt-2">{parsed.error}</p>}
            </div>
            {!isPhone && contextBlock}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <fieldset>
                <legend className="rdm-lab mb-1.5">Bạn đã chọn{optional}</legend>
                <div className="flex flex-wrap gap-2 max-md:flex-nowrap">{choiceLetters.map(choiceButton)}</div>
                <p className="rdm-hint mt-1.5">{choicesReady ? 'Không chọn nếu chưa nhớ. Bấm lại để bỏ chọn.' : 'Dán câu hỏi để chọn phương án.'}</p>
              </fieldset>
              {!isPhone && answerDetails}
            </div>
            {(!isPhone || choice || reason) && (
              <div><label htmlFor="mistake-reason" className="rdm-lab mb-1.5 block">Lý do chọn{optional}</label><textarea id="mistake-reason" maxLength={2000} rows={1} value={reason} onChange={event => { setReason(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.max(36, Math.min(120, event.currentTarget.scrollHeight))}px`; setChanged(true); }} placeholder="Mình chọn vì…" className="rdm-in min-h-11 w-full" /></div>
            )}
            {isPhone && <details className="rdm-more group">
              <summary>Đáp án, loại lỗi<span>{source ? `Đáp án ${source}` : 'Tùy chọn'}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span></summary>
              <div className="space-y-3 pb-3">{answerDetails}{categorySelect}</div>
            </details>}
            {original && original.userReason === undefined && original.userMistake && <details className="rdm-key"><summary>Ghi chú cũ</summary><p className="mt-2 whitespace-pre-line text-base leading-relaxed">{original.userMistake}</p></details>}
          </fieldset>
        ) : step === 'saved' ? (
          <div role="status" className="flex flex-col items-center gap-3 py-5 text-center">
            <SuccessMark />
            <p className="text-lg font-black text-[var(--rd-ink)]">Đã lưu lỗi sai</p>
            {sourceTestName && <p className="text-sm font-bold text-[var(--rd-mut)]">{sourceTestName}</p>}
            <p className="text-sm font-bold text-[var(--rd-mut)]">{draft?.correctAnswer ? `${draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã lưu'}: ${draft.correctAnswer}` : 'Chưa có đáp án · bổ sung trước khi ôn'}</p>
          </div>
        ) : draft && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {draft.part !== null ? <PartBadge part={draft.part} /> : <span className="text-sm font-bold text-[var(--rd-pink-d)]">Chọn Part trước khi lưu</span>}
                {sourceTestName && <span className="truncate text-xs font-bold text-[var(--rd-mut)]" title={sourceTestName}>{sourceTestName}</span>}
              </div>
              <button type="button" className={linkClass} onClick={() => { setStep('input'); setError(''); requestAnimationFrame(() => ref.current?.querySelector<HTMLTextAreaElement>('#mistake-paste')?.focus()); }}>Chỉnh nội dung</button>
            </div>
            <p className="whitespace-pre-line text-base font-black leading-relaxed text-[var(--rd-ink)]">{draftQuestion.question || 'Chưa trích được câu hỏi'}</p>
            <QuestionContext context={draftQuestion.context} part={draft.part} />
            <OptionList options={quiz.options} large chosen={input.userChoice} showMeanings={draft.part !== 7} correctLabel={draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : answerProvidedBy === 'LEARNER' ? 'Đáp án đã nhập' : 'Đáp án từ đề'} />
            {!quiz.options.length && draft.correctAnswer && <p className="text-base"><b>{draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã nhập'}:</b> {draft.correctAnswer}</p>}
            <ExplanationView explanation={draft.explanation} trapTip={draft.trapTip} optionMeanings={draft.part === 7 ? quiz.options : undefined} extra={[[reason ? 'Lý do bạn đã chọn' : 'Ghi chú cũ', reason || (original?.userReason === undefined ? original?.userMistake ?? '' : '')]]} />
            {manual && <details className="rdm-key"><summary>Chỉnh đáp án / lời giải</summary>
              <div className="mt-2 space-y-3">
                <fieldset>
                  <legend className="rdm-lab mb-1.5">Đáp án đúng (nếu có)</legend>
                  <div className="flex flex-wrap gap-2">{draft.options.map((option, index) => <button key={option} type="button" aria-label={`Đáp án đã nhập: ${letterOf(option, index)}`} aria-pressed={draft.correctAnswer === option} onClick={() => { setDraft({ ...draft, correctAnswer: draft.correctAnswer === option ? '' : option, answerSource: draft.correctAnswer === option ? 'MISSING' : 'PROVIDED', explanation: null }); setAnswerProvidedBy('LEARNER'); setChanged(true); }} className="rdm-abcd is-ok">{letterOf(option, index)}</button>)}</div>
                </fieldset>
                {!draft.options.length && <label className="rdm-lab">Đáp án đã nhập<input className={`${inputClass} mt-1.5`} value={draft.correctAnswer} onChange={event => { setDraft({ ...draft, correctAnswer: event.target.value, answerSource: event.target.value.trim() ? 'PROVIDED' : 'MISSING' }); setAnswerProvidedBy('LEARNER'); setChanged(true); }} /></label>}
                <label className="rdm-lab">Giải thích / mẹo ghi nhớ<textarea className={`${inputClass} mt-1.5`} rows={3} maxLength={4000} value={draft.trapTip} onChange={event => { setDraft({ ...draft, trapTip: event.target.value, explanation: null }); setChanged(true); }} /></label>
              </div>
            </details>}
            {!draft.correctAnswer && <p className="rdm-hint">Chưa có đáp án · bổ sung để ôn.</p>}
            {draft.missingInformation.length > 0 && <div className="rdm-warn" role="status">{draft.missingInformation.map((message, index) => <p key={index}>{message}</p>)}</div>}
            {draft.part === null && <label className="rdm-lab">Part<select aria-label="Part" className={`${inputClass} rdm-select mt-1.5`} value="" onChange={event => { const value = Number(event.target.value) as MistakeEntry['part']; setDraft({ ...draft, part: value || null }); setPart(value || null); draftInput.current = inputText({ ...input, part: value || null }); setChanged(true); }}><option value="">Chọn Part</option>{partChoices.map(value => <option key={value} value={value}>Part {value}</option>)}</select></label>}
          </div>
        )}
        {step === 'input' && aiAccess?.enabled === false && <div role="status" className="rdm-warn">
          <p>{aiAccess.accessMessage}</p>{aiAccess.accessStatus === 'login_required'
            ? <button type="button" onClick={requestAISignIn} className="min-h-10 font-semibold underline">Đăng nhập Google</button>
            : <button type="button" disabled={configBusy} onClick={() => setConfigAttempt(value => value + 1)} className="min-h-10 font-semibold underline">Kiểm tra quyền AI</button>}
        </div>}
        {error && <div className="rdm-err space-y-1" role="alert"><p>{error}</p>{step === 'input' && !configBusy && !config && <button type="button" onClick={() => setConfigAttempt(value => value + 1)} className="font-bold underline">Thử kết nối lại</button>}
          {original && error.includes('nơi khác') && <button type="button" onClick={() => void reloadCard()} className="font-bold underline">Tải lại thẻ</button>}</div>}
        {step === 'input' && <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />}
      </ScrollableModalBody>
      <footer className="rdm-foot flex shrink-0 items-center justify-between gap-2.5 sm:gap-3">
        {step === 'input' ? (
          <>
            <div className="flex w-full sm:w-auto items-center gap-2 sm:gap-3 order-1 sm:order-2">
              <button
                type="button"
                onClick={quickSave}
                disabled={busy || persisting}
                aria-label={original ? undefined : 'Lưu thủ công'}
                className={`${primaryClass} ${original ? 'rd-btn--pink' : 'rd-btn--white'} min-w-0 flex-1 sm:flex-initial`}
              >
                {original ? 'Lưu thay đổi' : 'Lưu thủ công'}
              </button>
              <button
                type="button"
                onClick={() => void analyze()}
                disabled={!aiAvailable || busy || persisting || !raw.trim()}
                className={`${primaryClass} ${original ? 'rd-btn--white' : 'rd-btn--pink'} min-w-0 flex-[1.4] whitespace-nowrap sm:flex-initial`}
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{busy ? 'Đang phân tích…' : 'Phân tích với AI'}</span>
              </button>
            </div>
            <div className="hidden sm:flex w-auto items-center justify-start order-2 sm:order-1">
              <button type="button" onClick={close} className="rdm-link is-quiet">Hủy</button>
            </div>
          </>
        ) : step === 'saved' ? (
          <>
            <button type="button" onClick={onClose} className={linkClass}>Đóng</button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {canReuseReading && <button type="button" onClick={() => resetEntry()} className={linkClass}>Bài đọc mới</button>}
              <button type="button" onClick={() => resetEntry(canReuseReading)} className={`${primaryClass} rd-btn--pink`}>{canReuseReading ? 'Thêm câu cùng bài đọc' : 'Thêm câu tiếp'}</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" disabled={persisting} onClick={() => { setStep('input'); setError(''); }} className={linkClass}>Quay lại</button>
            <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
              {!original && <button type="button" disabled={persisting} onClick={() => void save(true, draft, false, canReuseReading)} className={`${primaryClass} rd-btn--white`}>{canReuseReading ? 'Lưu & thêm câu cùng bài' : 'Lưu & thêm tiếp'}</button>}
              <button type="button" disabled={persisting} onClick={() => void save()} className={`${primaryClass} rd-btn--pink`}>{persisting ? 'Đang lưu…' : original ? 'Lưu thay đổi' : 'Lưu câu sai'}</button>
            </div>
          </>
        )}
      </footer>
    </div>
  </div>;
}
