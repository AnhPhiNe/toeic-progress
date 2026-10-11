import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import { getAIConfiguration, extractMistakeWithAI, type AIConfiguration, type AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
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

interface Props {
  original: MistakeEntry | null;
  sourceSuggestions?: string[];
  initialSourceName?: string;
  initialReading?: string;
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

export function MistakeEntryModal({ original, sourceSuggestions = [], initialSourceName = '', initialReading = '', onAdd, onUpdate, onClose, onReload, onSaved }: Props) {
  const initialContext = original?.part === 7 && typeof original.question === 'string' ? original.context ?? '' : initialReading;
  const [reading, setReading] = useState<{ text: string; images: PreparedImage[] } | null>(initialContext.trim() ? { text: initialContext, images: [] } : null);
  const [step, setStep] = useState<'input' | 'preview' | 'saved'>('input');
  const [saveMoreReceipt, setSaveMoreReceipt] = useState(false);
  const [raw, setRaw] = useState(original ? [originalQuestion(original, Boolean(initialContext.trim())), ...(original.options ?? [])].join('\n') : '');
  const context = reading?.text ?? '';
  const [part, setPart] = useState<MistakeEntry['part'] | null>(original?.part ?? (initialContext.trim() ? 7 : null));
  const [choice, setChoice] = useState<ChoiceLetter | 'UNKNOWN' | 'BLANK' | ''>(original ? (original.userChoiceState === 'BLANK' ? 'BLANK' : getUserChoice(original) || 'UNKNOWN') : '');
  const [reason, setReason] = useState(original?.userReason ?? '');
  const [sourceTest, setSourceTest] = useState(original?.sourceTestName ?? initialSourceName);
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
  const [configBusy, setConfigBusy] = useState(true);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<PreparedImage[]>([]);
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
  const effectivePart = part;
  const transcriptPart = effectivePart !== null && effectivePart >= 2 && effectivePart <= 4;
  const instructions = mistakeInstructions(effectivePart);
  const choiceLetters = CHOICE_LETTERS.slice(0, effectivePart === 2 ? 3 : 4);
  const choicesReady = options.length > 0 && (corrected !== null || !parsed.error);
  const input: MistakeInput = { question, options, context, part: effectivePart,
    userChoiceState: CHOICE_LETTERS.includes(choice as ChoiceLetter) ? 'CHOSEN' : choice === 'BLANK' ? 'BLANK' : 'UNKNOWN',
    userChoice: CHOICE_LETTERS.includes(choice as ChoiceLetter) ? choice as ChoiceLetter : '', userReason: reason, sourceAnswer: source,
    ...(selectedCategory ? { errorCategory: selectedCategory } : {}) };
  const currentInput = inputText(input);
  const imageKey = images.map(image => image.id).join(',');
  const initialInput = useRef(currentInput);
  if (original && !draftInput.current) draftInput.current = initialInput.current;

  useEffect(() => {
    let cancelled = false;
    setConfigBusy(true);
    void getAIConfiguration().then(value => { if (!cancelled) { setConfig(value); setError(''); } })
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
    const imageMode = images.length > 0;
    if (imageMode && effectivePart !== 1 && effectivePart !== 7) return 'Ảnh chỉ hỗ trợ Part 1 và Part 7. Bỏ ảnh hoặc chọn đúng Part.';
    if (ai && effectivePart === 1 && images.length !== 1) return 'Thêm một ảnh tranh để phân tích Part 1.';
    if (effectivePart === 1 && options.length !== 4) return 'Part 1 cần đủ bốn phương án nghe A–D bằng văn bản.';
    if (!question.trim()) return 'Dán câu hỏi và phương án trước khi tiếp tục; ảnh chỉ cung cấp ngữ cảnh.';
    if (sourceTestName.length > 300) return 'Tên đề tối đa 300 ký tự.';
    if (!corrected && parsed.error) return parsed.error;
    if (input.userChoice && options.length && !options.some(option => option.startsWith(`(${input.userChoice})`))) return 'Lựa chọn chưa khớp phương án. Kiểm tra lại nội dung đã dán.';
    if (source && options.length && !options.some(option => option.startsWith(`(${source})`))) return 'Đáp án từ đề chưa khớp phương án.';
    if (effectivePart === 2 && options.length > 3) return 'Part 2 chỉ có A–C. Kiểm tra lại phương án.';
    if (ai && options.length < 2) return 'Cần ít nhất hai phương án có nội dung để phân tích.';
    if (imageMode && options.length !== 4) return 'Dán đủ bốn phương án A–D; ảnh chỉ cung cấp ngữ cảnh.';
    if (ai && options.some((option, index) => letterOf(option, index) !== CHOICE_LETTERS[index])) return 'Bổ sung phương án còn thiếu ở giữa trước khi phân tích, hoặc lưu thủ công.';
    if (ai && currentInput.length > 8000) return 'Tổng câu hỏi, phương án, ngữ cảnh và lý do tối đa 8.000 ký tự.';
    return '';
  };

  const addImages = async (files: File[]) => {
    if (!files.length || busy || imageBusy) return;
    if (reading) { setError('Bấm “Đổi bài đọc” trước khi thêm ảnh của bài khác.'); return; }
    if (effectivePart !== 1 && effectivePart !== 7) { setError('Chọn Part 1 (tranh) hoặc Part 7 (đoạn đọc) trước khi thêm ảnh.'); return; }
    const maximum = effectivePart === 1 ? 1 : MAX_CONTEXT_IMAGES;
    if (images.length + files.length > maximum) { setError(effectivePart === 1 ? 'Mỗi câu Part 1 dùng một ảnh tranh.' : 'Mỗi lần phân tích tối đa 3 ảnh Part 7.'); return; }
    const epoch = requestEpoch.current;
    setImageBusy(true); setError(''); setChanged(true);
    try {
      const prepared: PreparedImage[] = [];
      for (const file of files) prepared.push(await prepareImage(file));
      if (epoch !== requestEpoch.current) return;
      setImages([...images, ...prepared]);
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
      return { part: effectivePart, questionContext: [question, context].filter(Boolean).join('\n\n'), options,
        ...(reading ? { question, context } : sameQuestion && typeof draft?.question === 'string'
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
    if (imageBusy || busy) return;
    const problem = validate(true);
    if (problem) { setError(problem); return; }
    if (!config?.structuredInput) { setError(config ? 'Backend chưa hỗ trợ form mới. Bạn vẫn có thể lưu thủ công.' : 'AI chưa sẵn sàng. Bạn vẫn có thể lưu thủ công.'); return; }
    if (images.length && !(effectivePart === 1 ? config.part1Images : config.part7Images)) {
      setError(`Backend chưa hỗ trợ ảnh Part ${effectivePart}. Nội dung được giữ; cập nhật backend trước khi phân tích ảnh.`); return;
    }
    const epoch = ++requestEpoch.current;
    setBusy(true); setError('');
    try {
      const { errorCategory: _errorCategory, ...baseInput } = input;
      const sentInput = config.learnerCategory ? input : baseInput;
      const result = await extractMistakeWithAI(currentInput, getToken, sentInput, images);
      if (epoch !== requestEpoch.current) return;
      const resolvedInput = { ...input, part: (effectivePart ?? result.draft.part) as MistakeEntry['part'] | null };
      draftInput.current = inputText(resolvedInput); draftImages.current = imageKey;
      const reusedSource = reading && effectivePart === 7 ? {
        question: result.draft.question ?? readQuestion(result.draft).question, context: reading.text,
        questionContext: [result.draft.question ?? readQuestion(result.draft).question, reading.text].filter(Boolean).join('\n\n'),
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
    const text = reuse && value?.part === 7 ? reading?.text || value.context || '' : '';
    setReading(text.trim() ? { text, images: images.length ? images : reading?.images ?? [] } : null);
    setRaw(''); setPart(text.trim() ? 7 : null); setChoice(''); setReason(''); setSource(''); setCorrected(null);
    setImages([]); draftImages.current = '';
    setDraft(null); setStep('input'); setChanged(false); setAnswerProvidedBy(undefined);
    setCategory('OTHER'); setSelectedCategory(''); setTags(''); setError(''); setKeyOpen(false);
    entryId.current = crypto.randomUUID(); draftInput.current = ''; saved.current = false;
  };

  const clearReading = () => {
    setReading(null); setImages([]); draftImages.current = '';
    setDraft(null); draftInput.current = ''; setManual(false); setTags(''); setCategory(selectedCategory || 'OTHER');
    setError(''); setChanged(true);
  };

  const save = (addAnother = false, value = draft, quick = false, reuse = false) => {
    if (!value || saving.current || saved.current) return;
    if (!sourceTestName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); setStep('input'); return; }
    if (value.part === null) { setError('Chọn Part trước khi lưu.'); setStep('input'); return; }
    if (value.part === 2 && value.options.length > 3) { setError('Part 2 chỉ có A–C. Chỉnh nội dung đã dán để loại phương án D.'); return; }
    saving.current = true; setError('');
    try {
      const entry: MistakeEntry = { ...(original ?? {}), id: original?.id ?? entryId.current,
        createdAt: original?.createdAt ?? new Date().toISOString(), status: original?.status ?? 'NEEDS_REVIEW',
        sourceTestName,
        part: value.part as MistakeEntry['part'], questionContext: value.questionContext, options: value.options.length ? value.options : undefined,
        question: value.question ?? undefined, context: value.context ?? undefined,
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
    finally { saving.current = false; }
  };

  const quickSave = () => {
    if (busy || imageBusy || saved.current) return;
    if (images.length && (draftInput.current !== currentInput || draftImages.current !== imageKey)) {
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
  const canReuseReading = draft?.part === 7 && Boolean((reading?.text || draft.context)?.trim());
  const quiz = resolveQuizOptions({ questionContext: draft?.questionContext ?? '', options: draft?.options,
    correctAnswer: draft?.correctAnswer ?? '', optionNotes: draft?.optionNotes });
  const choiceButton = (letter: ChoiceLetter) => {
    const option = options.find(value => value.startsWith(`(${letter})`));
    return <button type="button" key={letter} disabled={!choicesReady || !option} aria-pressed={choice === letter} aria-label={`Bạn chọn ${letter}`} title={option?.replace(/^\([A-D]\)\s*/, '')}
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
        {step === 'input' ? <fieldset disabled={busy || imageBusy} className="space-y-3 border-0 p-0">
          <div className="grid w-full max-w-[640px] grid-cols-[144px_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[144px_minmax(0,230px)_minmax(0,230px)]">
          <label className="block text-sm font-bold">Part <span className="text-rose-600" aria-hidden="true">*</span>
            <span className="relative mt-1.5 block"><select aria-label="Part" required className="min-h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-base font-semibold dark:border-slate-700 dark:bg-slate-900"
              value={effectivePart ?? ''} onChange={event => { const nextPart = Number(event.target.value) as MistakeEntry['part'] || null; if (reading && nextPart !== 7) clearReading(); setPart(nextPart); setChanged(true); }}>
              <option value="" disabled>Chọn Part</option>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>Part {value}</option>)}
            </select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" /></span>
          </label>
          <div className="min-w-0"><span className="mb-1.5 block text-sm font-bold">Đề <span className="text-rose-600" aria-hidden="true">*</span></span>
          <TestNamePicker compact field required value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
            onChange={name => { if (reading && testNameKey(name) !== testNameKey(sourceTestName)) clearReading(); setSourceTest(name); setChanged(true); }} />
          </div>
          <label className="col-span-2 min-w-0 text-sm font-bold sm:col-span-1">Lỗi sai <span className="text-xs font-normal text-slate-500">(tùy chọn)</span>
            <select aria-label="Lỗi sai" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
              value={selectedCategory} onChange={event => { setSelectedCategory(event.target.value as ErrorCategory | ''); setChanged(true); }}>
              <option value="">Chưa chọn</option>{Object.entries(categoryChoices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          </div>
          {reading && <section aria-label="Bài đọc đang dùng" className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{original ? 'Đang dùng bài đọc đã lưu' : 'Đang dùng bài đọc trước'}</p>
              <button type="button" onClick={clearReading} className={`${linkClass} min-h-11 shrink-0`}>Đổi bài đọc</button></div>
            <details className="text-sm text-slate-600 dark:text-slate-300"><summary className="w-fit cursor-pointer py-1 font-semibold">Xem bài đọc</summary>
              <p className="my-2 whitespace-pre-line [overflow-wrap:anywhere] leading-relaxed">{reading.text}</p>
              <ImageComparison images={reading.images} part={7} />
            </details>
          </section>}
          <div><div className="mb-2"><label htmlFor="mistake-paste" className="text-sm font-bold text-blue-600 dark:text-blue-400">{instructions.label} <span className="text-rose-600">*</span></label></div>
            <p id="mistake-input-hint" className="mb-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{reading ? 'Chỉ dán câu hỏi và A–D. Bài đọc đang dùng được gửi kèm khi phân tích.' : instructions.hint}</p>
            <textarea id="mistake-paste" aria-describedby="mistake-input-hint" maxLength={8000} spellCheck={false} value={raw} onChange={event => { setRaw(event.target.value); setCorrected(null); setChanged(true); }} rows={5}
              onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addImages(files); } }}
              placeholder={reading ? 'Dán câu hỏi mới và A–D…\nKhông cần dán lại bài đọc.' : effectivePart === 1 ? 'Dán bốn mô tả nghe A–D…\nKhông có nhãn: mỗi phương án một dòng.'
                : effectivePart === 2 ? 'Dán transcript câu hỏi và ba phản hồi A–C…\nKhông có nhãn: mỗi phương án một dòng.'
                : transcriptPart ? 'Dán transcript, câu hỏi đang xét và phương án A–D…\nAI sẽ tách câu hỏi khỏi transcript.'
                : 'Dán một câu và các phương án, kèm transcript/đoạn đọc nếu có…\nAI sẽ tách câu hỏi khi phân tích.'}
              className={twMerge(inputClass, 'min-h-[144px] resize-y border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-[#102139]')} />
            {!corrected && raw && parsed.error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          </div>
          {!reading && (effectivePart === 1 || effectivePart === 7 || images.length > 0) && <MistakeImages images={images} busy={busy || imageBusy} part={effectivePart}
            onAdd={files => void addImages(files)} onRemove={id => { setImages(value => value.filter(image => image.id !== id)); setChanged(true); }} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><fieldset><legend className="mb-2 text-sm font-bold">Bạn đã chọn <span className="text-xs font-normal text-slate-500">(nếu nhớ)</span></legend><div className="flex flex-wrap gap-2">{choiceLetters.map(choiceButton)}</div><p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{choicesReady ? 'Không chọn nếu chưa nhớ. Bấm lại để bỏ chọn.' : 'Dán câu hỏi để chọn phương án.'}</p></fieldset>
            <details open={keyOpen} onToggle={event => setKeyOpen(event.currentTarget.open)} className="text-sm text-slate-600 dark:text-slate-300"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{source ? `Đáp án từ đề: ${source}` : <>Đáp án đúng từ đề <span className="text-xs font-normal text-slate-500">(tùy chọn)</span></>}</summary><fieldset className="mt-1"><legend className="sr-only">Đáp án từ đề</legend><div className="flex flex-wrap gap-2">{choiceLetters.map(letter => { const option = options.find(value => value.startsWith(`(${letter})`)); return <button type="button" key={letter} disabled={!choicesReady || !option} aria-label={`Đáp án từ đề: ${letter}`} aria-pressed={source === letter} onClick={() => { setSource(value => value === letter ? '' : letter); setChanged(true); }} className={`min-h-11 min-w-11 rounded-lg border text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-40 ${source === letter ? 'border-slate-900 bg-slate-200 ring-1 ring-slate-900 dark:border-slate-200 dark:bg-slate-700' : 'border-slate-300 dark:border-slate-700'}`}>{letter}</button>; })}</div></fieldset>{!choicesReady && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Dán câu hỏi để chọn đáp án từ đề.</p>}{source && <button type="button" className="mt-1 py-1 text-xs text-slate-500 dark:text-slate-400" onClick={() => { setSource(''); setChanged(true); }}>Bỏ chọn</button>}</details>
          </div>
          <div><label htmlFor="mistake-reason" className="mb-2 block text-sm font-bold text-amber-800 dark:text-amber-300">Lý do chọn <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(nếu muốn)</span></label><textarea id="mistake-reason" maxLength={2000} rows={1} value={reason} onChange={event => { setReason(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.max(48, Math.min(120, event.currentTarget.scrollHeight))}px`; setChanged(true); }} placeholder="Mình chọn vì…" className={twMerge(inputClass, 'min-h-12 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-[#292319]')} /></div>
          {original && original.userReason === undefined && original.userMistake && <details className="text-sm"><summary className="cursor-pointer font-semibold">Ghi chú cũ</summary><p className="mt-2 whitespace-pre-line text-base leading-relaxed">{original.userMistake}</p></details>}
        </fieldset> : step === 'saved' ? <div role="status" className="flex flex-col items-center gap-3 py-5 text-center"><SuccessMark /><p className="text-lg font-bold">Đã lưu lỗi sai</p>{sourceTestName && <p className="text-sm text-slate-500 dark:text-slate-400">{sourceTestName}</p>}<p className="text-sm text-slate-500 dark:text-slate-400">{draft?.correctAnswer ? `${draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã lưu'}: ${draft.correctAnswer}` : 'Chưa có đáp án · bổ sung trước khi ôn'}</p></div> : draft && <>
          <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{draft.part !== null ? <PartBadge part={draft.part} /> : <span className="text-sm text-rose-600">Chọn Part trước khi lưu</span>}{sourceTestName && <span className="truncate text-xs text-slate-500 dark:text-slate-400" title={sourceTestName}>{sourceTestName}</span>}</div><button type="button" className={linkClass} onClick={() => { setStep('input'); setError(''); requestAnimationFrame(() => ref.current?.querySelector<HTMLTextAreaElement>('#mistake-paste')?.focus()); }}>Chỉnh nội dung</button></div>
          <p className="whitespace-pre-line text-base font-bold leading-relaxed">{draftQuestion.question || 'Chưa trích được câu hỏi'}</p>
          <QuestionContext context={draftQuestion.context} part={draft.part} />
          <ImageComparison images={images.length ? images : reading?.images ?? []} part={draft.part} />
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
        {error && <div className="space-y-1 text-sm text-rose-600 dark:text-rose-300" role="alert"><p>{error}</p>{step === 'input' && !configBusy && !config && <button type="button" onClick={() => setConfigAttempt(value => value + 1)} className="font-bold underline">Thử kết nối lại</button>}
          {original && error.includes('nơi khác') && <button type="button" onClick={() => { if (window.confirm('Tải lại thẻ và bỏ các thay đổi chưa lưu?')) onReload(); }} className="font-bold underline">Tải lại thẻ</button>}</div>}
        {step === 'input' && <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />}
      </ScrollableModalBody>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-[#111A2C] sm:px-6">
        {step === 'input' ? <><button type="button" onClick={() => void analyze()} disabled={busy || imageBusy || configBusy || !config || (!raw.trim() && !images.length)} className={`${linkClass} inline-flex min-h-11 items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}><Sparkles className="h-4 w-4" aria-hidden="true" />{busy ? 'Đang phân tích…' : 'Phân tích với AI'}</button><button type="button" onClick={quickSave} disabled={busy || imageBusy} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{original ? 'Lưu thay đổi' : 'Lưu nhanh'}</button></>
          : step === 'saved' ? <><button type="button" onClick={onClose} className={linkClass}>Đóng</button><div className="flex flex-wrap items-center justify-end gap-3">{canReuseReading && <button type="button" onClick={() => resetEntry()} className={linkClass}>Bài đọc mới</button>}<button type="button" onClick={() => resetEntry(canReuseReading)} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{canReuseReading ? 'Thêm câu cùng bài đọc' : 'Thêm lỗi tiếp'}</button></div></>
          : <><button type="button" onClick={() => { setStep('input'); setError(''); }} className={linkClass}>Quay lại</button><div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">{!original && <button type="button" onClick={() => save(true, draft, false, canReuseReading)} className={`${primaryClass} min-h-11 bg-amber-200 text-slate-950 hover:bg-amber-100`}>{canReuseReading ? 'Lưu & thêm câu cùng bài' : 'Lưu & thêm tiếp'}</button>}<button type="button" onClick={() => save()} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{original ? 'Lưu thay đổi' : 'Lưu lỗi sai'}</button></div></>}
      </footer>
    </div>
  </div>;
}
