import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import { getAIConfiguration, extractMistakeWithAI, type AIConfiguration, type AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { CHOICE_LETTERS, inputText, learnerMistake, parsePastedQuestion, formatOptionSlot, type ChoiceLetter, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { OptionList } from '@/features/mistakes/components/OptionList';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { PartBadge, splitQuestion } from '@/features/mistakes/components/MistakeCard';
import { normalizeTestName, testNameKey } from '@/features/mistakes/lib/sourceTests';
import { TestNamePicker } from '@/shared/components/TestNamePicker';
import { ScrollableModalBody } from '@/shared/components/ScrollableModalBody';
import { SuccessMark } from '@/shared/ui/SuccessMark';

interface Props {
  original: MistakeEntry | null;
  sourceSuggestions?: string[];
  initialSourceName?: string;
  onAdd: (entry: MistakeEntry) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  onClose: () => void;
  onReload: () => void;
  onSaved?: (message: string) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-sans text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const linkClass = 'cursor-pointer text-[13px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300';
const primaryClass = 'cursor-pointer rounded-xl border-2 border-slate-900 px-4 py-2.5 text-sm font-extrabold shadow-[3px_3px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40';

function storedDraft(entry: MistakeEntry): AIMistakeParseResult {
  return { part: entry.part, questionContext: entry.questionContext, category: entry.category,
    userMistake: entry.userMistake, correctAnswer: entry.correctAnswer,
    answerSource: entry.answerSource ?? (entry.correctAnswer ? 'PROVIDED' : 'MISSING'),
    options: entry.options ?? [], tags: entry.tags, trapTip: entry.trapTip ?? '', optionNotes: entry.optionNotes ?? [],
    explanation: entry.explanation ?? null, userChoice: getUserChoice(entry), userChoiceState: entry.userChoiceState,
    userReason: entry.userReason, missingInformation: [] };
}

const letterOf = (option: string, index: number): ChoiceLetter => optionLetter(option) || CHOICE_LETTERS[index];

export function MistakeEntryModal({ original, sourceSuggestions = [], initialSourceName = '', onAdd, onUpdate, onClose, onReload, onSaved }: Props) {
  const [step, setStep] = useState<'input' | 'preview' | 'saved'>('input');
  const [saveMoreReceipt, setSaveMoreReceipt] = useState(false);
  const [raw, setRaw] = useState(original ? [original.questionContext, ...(original.options ?? [])].join('\n') : '');
  const [context, setContext] = useState('');
  const [part, setPart] = useState<MistakeEntry['part'] | null>(original?.part ?? null);
  const [choice, setChoice] = useState<ChoiceLetter | 'UNKNOWN' | 'BLANK' | ''>(original ? (original.userChoiceState === 'BLANK' ? 'BLANK' : getUserChoice(original) || 'UNKNOWN') : '');
  const [reason, setReason] = useState(original?.userReason ?? '');
  const [sourceTest, setSourceTest] = useState(original?.sourceTestName ?? initialSourceName);
  const [keyOpen, setKeyOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const sourceTestName = sourceSuggestions.find(name => testNameKey(name) === testNameKey(sourceTest)) ?? normalizeTestName(sourceTest);
  const [source, setSource] = useState<ChoiceLetter | ''>(original?.answerSource === 'PROVIDED' ? optionLetter(original.correctAnswer) : '');
  const initialSource = useRef(source);
  const [corrected, setCorrected] = useState<{ question: string; options: string[] } | null>(original ? { question: original.questionContext,
    options: (original.options ?? []).map((option, index) => /^\([A-D]\)/i.test(option) ? option : `(${CHOICE_LETTERS[index]}) ${option}`) } : null);
  const [editor, setEditor] = useState(false);
  const [draft, setDraft] = useState<AIMistakeParseResult | null>(original ? storedDraft(original) : null);
  const [manual, setManual] = useState(false);
  const [answerProvidedBy, setAnswerProvidedBy] = useState(original?.answerProvidedBy);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
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
  const effectivePart = part ?? parsed.part;
  const input: MistakeInput = { question, options, context, part: effectivePart,
    userChoiceState: CHOICE_LETTERS.includes(choice as ChoiceLetter) ? 'CHOSEN' : choice === 'BLANK' ? 'BLANK' : 'UNKNOWN',
    userChoice: CHOICE_LETTERS.includes(choice as ChoiceLetter) ? choice as ChoiceLetter : '', userReason: reason, sourceAnswer: source };
  const currentInput = inputText(input);
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
    if (!question.trim()) return 'Nhập câu hỏi trước khi tiếp tục.';
    if (sourceTestName.length > 300) return 'Tên đề tối đa 300 ký tự.';
    if (!corrected && parsed.error) return parsed.error;
    if (!choice) return 'Chọn phương án của bạn, Không nhớ hoặc Bỏ trống.';
    if (input.userChoice && !options.some(option => option.startsWith(`(${input.userChoice})`))) return 'Lựa chọn chưa khớp phương án. Kiểm tra lại phần Sửa.';
    if (source && !options.some(option => option.startsWith(`(${source})`))) return 'Đáp án từ đề chưa khớp phương án.';
    if (effectivePart === 2 && options.length > 3) return 'Part 2 chỉ có A–C. Kiểm tra lại phương án.';
    if (ai && options.length < 2) return 'Cần ít nhất hai phương án có nội dung để phân tích.';
    if (ai && options.some((option, index) => letterOf(option, index) !== CHOICE_LETTERS[index])) return 'Bổ sung phương án còn thiếu ở giữa trước khi phân tích, hoặc lưu thủ công.';
    if (ai && currentInput.length > 8000) return 'Tổng câu hỏi, phương án, ngữ cảnh và lý do tối đa 8.000 ký tự.';
    return '';
  };

  const manualDraft = (): AIMistakeParseResult => {
    if (!draft || draftInput.current !== currentInput) {
      const previous = draftInput.current ? JSON.parse(draftInput.current) as MistakeInput : null;
      const sameQuestion = previous && JSON.stringify([question, options, context, source]) === JSON.stringify([previous.question, previous.options, previous.context, previous.sourceAnswer]);
      const correctAnswer = source ? options.find(option => option.startsWith(`(${source})`)) ?? '' : sameQuestion ? draft?.correctAnswer ?? '' : '';
      const preserveText = draft?.trapTip ?? '';
      const changedLearner = sameQuestion && previous && JSON.stringify([input.userChoiceState, input.userChoice, reason]) !== JSON.stringify([previous.userChoiceState, previous.userChoice, previous.userReason]);
      return { part: effectivePart, questionContext: [question, context].filter(Boolean).join('\n'), options,
        category, tags: tags.split(',').map(value => value.trim()).filter(Boolean), userChoice: input.userChoice,
        userChoiceState: input.userChoiceState, userReason: reason, userMistake: learnerMistake(input),
        correctAnswer, answerSource: correctAnswer ? source ? 'PROVIDED' : draft?.answerSource ?? 'PROVIDED' : 'MISSING', trapTip: preserveText,
        explanation: sameQuestion ? draft?.explanation ?? null : null,
        optionNotes: sameQuestion ? draft?.optionNotes ?? [] : [], missingInformation: previous && preserveText && !sameQuestion ? ['Nội dung đã thay đổi. Kiểm tra lại giải thích đang giữ.']
          : changedLearner && preserveText ? ['Lựa chọn/lý do đã thay đổi. Kiểm tra giải thích đang giữ trước khi lưu.'] : [] };
    }
    return draft;
  };

  const analyze = async () => {
    const problem = validate(true);
    if (problem) { setError(problem); return; }
    if (!config?.structuredInput) { setError(config ? 'Backend chưa hỗ trợ form mới. Bạn vẫn có thể lưu thủ công.' : 'AI chưa sẵn sàng. Bạn vẫn có thể lưu thủ công.'); return; }
    const epoch = ++requestEpoch.current;
    setBusy(true); setError('');
    try {
      const result = await extractMistakeWithAI(currentInput, getToken, config.provider, input);
      if (epoch !== requestEpoch.current) return;
      draftInput.current = inputText({ ...input, part: (effectivePart ?? result.draft.part) as MistakeEntry['part'] | null });
      setDraft({ ...result.draft, userChoice: input.userChoice, userChoiceState: input.userChoiceState,
        userReason: reason, userMistake: learnerMistake(input) });
      setPart((effectivePart ?? result.draft.part) as MistakeEntry['part'] | null);
      setCategory(result.draft.category); setTags(result.draft.tags.join(', '));
      setManual(false); setAnswerProvidedBy(source ? 'SOURCE' : undefined);
      removeCaptcha(); setStep('preview');
    } catch (value) {
      if (epoch !== requestEpoch.current) return;
      setError(value instanceof Error ? value.message : 'Chưa phân tích được. Nội dung được giữ để lưu thủ công.');
      if (value instanceof Error && value.message.includes('Nhà cung cấp')) { setConfig(null); setConfigAttempt(value => value + 1); }
    } finally { if (epoch === requestEpoch.current) setBusy(false); }
  };

  const resetEntry = () => {
    setRaw(''); setContext(''); setPart(null); setChoice(''); setReason(''); setSource(''); setCorrected(null);
    setDraft(null); setStep('input'); setChanged(false); setEditor(false); setAnswerProvidedBy(undefined);
    setCategory('OTHER'); setTags(''); setError(''); setKeyOpen(false); setContextOpen(false);
    entryId.current = crypto.randomUUID(); draftInput.current = ''; saved.current = false;
  };

  const save = (addAnother = false, value = draft, quick = false) => {
    if (!value || saving.current || saved.current) return;
    if (value.part === null) { setError('Chọn Part trước khi lưu.'); setEditor(true); return; }
    if (value.part === 2 && value.options.length > 3) { setError('Part 2 chỉ có A–C. Bấm Sửa để loại phương án D.'); return; }
    saving.current = true; setError('');
    try {
      const entry: MistakeEntry = { ...(original ?? {}), id: original?.id ?? entryId.current,
        createdAt: original?.createdAt ?? new Date().toISOString(), status: original?.status ?? 'NEEDS_REVIEW',
        sourceTestName,
        part: value.part as MistakeEntry['part'], questionContext: value.questionContext, options: value.options.length ? value.options : undefined,
        userChoice: input.userChoice || undefined, userChoiceState: input.userChoiceState,
        userReason: original && original.userReason === undefined && !reason.trim() ? undefined : reason,
        userMistake: original && original.userReason === undefined && !reason.trim() ? original.userMistake : learnerMistake(input), correctAnswer: value.correctAnswer,
        answerSource: value.correctAnswer.trim() ? value.answerSource : 'MISSING', answerProvidedBy: source ? (source !== initialSource.current ? 'SOURCE' : answerProvidedBy ?? 'SOURCE') : value.answerSource === 'PROVIDED' ? answerProvidedBy : undefined,
        category, tags: tags.split(',').map(value => value.trim()).filter(Boolean).slice(0, 20), trapTip: value.trapTip || undefined,
        optionNotes: value.optionNotes.length ? value.optionNotes : undefined, explanation: value.explanation ?? undefined };
      if (entry.tags.some(tag => tag.length > 80)) throw new Error('Mỗi tag tối đa 80 ký tự. Bấm Sửa để chỉnh lại.');
      if (entry.questionContext.length > 16000 || (entry.options ?? []).some(option => option.length > 2000) || entry.correctAnswer.length > 2000) {
        throw new Error('Câu hỏi tối đa 16.000 ký tự; mỗi phương án/đáp án tối đa 2.000 ký tự. Bấm Sửa để chỉnh lại.');
      }
      if (new TextEncoder().encode(JSON.stringify({ ...entry, updatedAt: new Date().toISOString(), deletedAt: null })).byteLength > 32768) {
        throw new Error('Thẻ vượt giới hạn 32 KiB. Rút gọn câu hỏi/đoạn trích trước khi lưu; bản nháp được giữ.');
      }
      if (original) onUpdate(entry, original); else onAdd(entry);
      saved.current = true;
      if (addAnother && !original) {
        resetEntry();
        setSaveMoreReceipt(true);
      } else if (quick && !original) { setDraft(value); setStep('saved'); } else { onSaved?.(original ? 'Đã lưu thay đổi' : 'Đã lưu ghi chú'); onClose(); }
    } catch (value) { setError(value instanceof Error ? value.message : 'Chưa lưu được. Nội dung đang nhập được giữ.'); }
    finally { saving.current = false; }
  };

  const quickSave = () => {
    if (busy || saved.current) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    const value = manualDraft();
    // Existing explanation changes still need a review before saving stale prose.
    if (value.missingInformation.length) {
      setDraft(value); draftInput.current = currentInput; setManual(true); setStep('preview'); setError(''); return;
    }
    save(false, value, true);
  };

  const draftQuestion = splitQuestion(draft?.questionContext ?? '');
  const quiz = resolveQuizOptions({ questionContext: draft?.questionContext ?? '', options: draft?.options,
    correctAnswer: draft?.correctAnswer ?? '', optionNotes: draft?.optionNotes });
  const choiceButton = (letter: ChoiceLetter, option: string) => <button type="button" key={letter} aria-pressed={choice === letter} aria-label={`Bạn chọn ${letter}`} title={option.replace(/^\([A-D]\)\s*/, '')}
    onClick={() => { setChoice(letter); setChanged(true); }} className={`min-h-11 min-w-11 rounded-lg border px-3 py-2 text-base font-extrabold ${choice === letter ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900/50'}`}>{letter}</button>;

  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 sm:items-center sm:p-4" onClick={event => { if (event.target === event.currentTarget && event.detail <= 1) close(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="mistake-entry-title" className="flex max-h-[100dvh] w-full flex-col border-2 border-slate-900 bg-white text-slate-900 dark:border-slate-200 dark:bg-[#111A2C] dark:text-slate-100 sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-2xl sm:shadow-[6px_6px_0px_#0f172a] dark:sm:shadow-[6px_6px_0px_#cbd5e1]">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-slate-700 sm:px-6">
        <h2 id="mistake-entry-title" className="text-xl font-extrabold">{saveMoreReceipt ? <span role="status" className="entry-more-receipt inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><SuccessMark />Đã lưu ghi chú</span>
          : <span className="shadow-[inset_0_-7px_0_#fef08a] dark:shadow-[inset_0_-7px_0_#57431c]">{step === 'preview' ? 'Kiểm tra và lưu' : original ? 'Sửa lỗi sai' : 'Thêm lỗi sai'}</span>}</h2>
        <button type="button" onClick={close} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
      </header>
      <ScrollableModalBody resetKey={step}>
        {step === 'input' ? <fieldset disabled={busy} className="space-y-4 border-0 p-0">
          <TestNamePicker compact value={sourceTestName} suggestions={sourceSuggestions} disabled={busy}
            onChange={name => { setSourceTest(name); setChanged(true); }} />
          <div><div className="mb-2 flex items-center justify-between"><label htmlFor="mistake-paste" className="text-sm font-bold text-blue-600 dark:text-blue-400">Câu hỏi + phương án <span className="text-rose-600">*</span></label>
            <button type="button" onClick={() => { setEditor(value => !value); if (!corrected) setCorrected({ question: parsed.question, options: parsed.options }); }} className={linkClass}>Sửa</button></div>
            <textarea id="mistake-paste" maxLength={8000} spellCheck={false} value={raw} onChange={event => { setRaw(event.target.value); setCorrected(null); setChanged(true); }} rows={8}
              placeholder={'Dán một câu và các phương án…\nKhông có nhãn A–D: mỗi phương án một dòng.'}
              className={twMerge(inputClass, 'min-h-[210px] resize-y border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-[#102139]')} />
            {!corrected && raw && parsed.error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          </div>
          {editor && <div className="space-y-3 border-l-2 border-slate-200 pl-3 dark:border-slate-700"><label className="block text-sm font-semibold">Câu hỏi<textarea className={`${inputClass} mt-1`} rows={3} value={corrected?.question ?? question} onChange={event => { setCorrected({ question: event.target.value, options }); setChanged(true); }} /></label>
            {CHOICE_LETTERS.slice(0, effectivePart === 2 && options.length <= 3 ? 3 : 4).map((letter, index) => <label key={letter} className="block text-sm font-semibold">Phương án {letter}<input className={`${inputClass} mt-1`} value={(options.find(option => option.startsWith(`(${letter})`)) ?? '').replace(/^\([A-D]\)\s*/, '')} onChange={event => { const next = CHOICE_LETTERS.map(label => options.find(option => option.startsWith(`(${label})`)) ?? ''); next[index] = formatOptionSlot(letter, event.target.value); setCorrected({ question, options: next }); setChanged(true); }} /></label>)}
            <label className="block text-sm font-semibold">Part<select aria-label="Part" className={`${inputClass} mt-1`} value={effectivePart ?? ''} onChange={event => { setPart(Number(event.target.value) as MistakeEntry['part'] || null); setChanged(true); }}><option value="">Chọn Part</option>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>Part {value}</option>)}</select></label>
            <label className="block text-sm font-semibold">Nhóm lỗi<select className={`${inputClass} mt-1`} value={category} onChange={event => { setCategory(event.target.value as ErrorCategory); setChanged(true); }}>{Object.entries(ERROR_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label.label}</option>)}</select></label>
            <label className="block text-sm font-semibold">Tag<input className={`${inputClass} mt-1`} value={tags} onChange={event => { setTags(event.target.value); setChanged(true); }} /></label>
            <label className="block text-sm font-semibold">Giải thích / mẹo ghi nhớ<textarea className={`${inputClass} mt-1`} rows={2} maxLength={4000} value={draft?.trapTip ?? ''} onChange={event => { const value = draft ?? manualDraft(); setDraft({ ...value, trapTip: event.target.value, explanation: null }); setChanged(true); }} /></label>
          </div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><fieldset><legend className="mb-2 text-sm font-bold">Bạn đã chọn <span className="text-rose-600">*</span></legend><div className="flex flex-wrap gap-2">{options.map((option, index) => choiceButton(letterOf(option, index), option))}</div>
            <div className="mt-1 flex gap-4">{(['UNKNOWN', 'BLANK'] as const).map(value => <button key={value} type="button" aria-pressed={choice === value} onClick={() => { setChoice(value); setChanged(true); }} className={`py-1 text-xs ${choice === value ? 'font-bold text-blue-600 underline dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>{value === 'UNKNOWN' ? 'Không nhớ' : 'Bỏ trống'}</button>)}</div></fieldset>
            <details open={keyOpen} onToggle={event => setKeyOpen(event.currentTarget.open)} className="text-[13px] text-slate-600 dark:text-slate-300"><summary className="cursor-pointer py-1 font-semibold">{source ? `Đáp án từ đề: ${source}` : 'Có đáp án từ đề'}</summary><fieldset className="mt-2"><legend className="sr-only">Đáp án từ đề</legend><div className="flex flex-wrap gap-2">{options.map((option, index) => { const letter = letterOf(option, index); return <button type="button" key={letter} aria-label={`Đáp án từ đề: ${letter}`} aria-pressed={source === letter} onClick={() => { setSource(value => value === letter ? '' : letter); setChanged(true); }} className={`min-h-11 min-w-11 rounded-lg border text-base font-extrabold ${source === letter ? 'border-slate-900 bg-slate-200 ring-1 ring-slate-900 dark:border-slate-200 dark:bg-slate-700' : 'border-slate-300 dark:border-slate-700'}`}>{letter}</button>; })}</div></fieldset>{source && <button type="button" className="mt-1 py-1 text-xs text-slate-500 dark:text-slate-400" onClick={() => { setSource(''); setChanged(true); }}>Bỏ chọn</button>}</details>
          </div>
          <div><label htmlFor="mistake-reason" className="mb-2 block text-sm font-bold text-amber-800 dark:text-amber-300">Lý do chọn <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(nếu muốn)</span></label><textarea id="mistake-reason" maxLength={2000} rows={1} value={reason} onChange={event => { setReason(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.max(48, Math.min(120, event.currentTarget.scrollHeight))}px`; setChanged(true); }} placeholder="Mình chọn vì…" className={twMerge(inputClass, 'min-h-12 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-[#292319]')} /></div>
          {original && original.userReason === undefined && original.userMistake && <details className="text-sm"><summary className="cursor-pointer font-semibold">Ghi chú cũ</summary><p className="mt-2 whitespace-pre-line text-base leading-relaxed">{original.userMistake}</p></details>}
          <details open={contextOpen} onToggle={event => setContextOpen(event.currentTarget.open)} className="text-[13px] text-slate-600 dark:text-slate-300"><summary className="cursor-pointer py-1 font-semibold">Thêm đoạn đọc · Part 6/7</summary><label className="mt-2 block text-sm font-semibold">Đoạn đọc bổ sung<textarea spellCheck={false} className={`${inputClass} mt-1`} rows={3} maxLength={4000} value={context} placeholder="Chỉ thêm nếu câu đã dán chưa đủ ngữ cảnh." onChange={event => { setContext(event.target.value); setChanged(true); }} /></label></details>
        </fieldset> : step === 'saved' ? <div role="status" className="flex flex-col items-center gap-3 py-5 text-center"><SuccessMark /><p className="text-lg font-bold">Đã lưu lỗi sai</p>{sourceTestName && <p className="text-sm text-slate-500 dark:text-slate-400">{sourceTestName}</p>}<p className="text-sm text-slate-500 dark:text-slate-400">{draft?.correctAnswer ? `${draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã lưu'}: ${draft.correctAnswer}` : 'Chưa có đáp án · bổ sung trước khi ôn'}</p></div> : draft && <>
          <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{draft.part !== null ? <PartBadge part={draft.part} /> : <span className="text-sm text-rose-600">Chọn Part trước khi lưu</span>}{sourceTestName && <span className="truncate text-xs text-slate-500 dark:text-slate-400" title={sourceTestName}>{sourceTestName}</span>}</div><button type="button" className={linkClass} onClick={() => { setStep('input'); setEditor(true); setError(''); }}>Sửa</button></div>
          <p className="whitespace-pre-line text-base font-bold leading-relaxed">{draftQuestion.question}</p>{draftQuestion.context && <p className="whitespace-pre-line border-l-2 border-slate-300 pl-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">{draftQuestion.context}</p>}
          <OptionList options={quiz.options} large chosen={input.userChoice} correctLabel={draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : answerProvidedBy === 'LEARNER' ? 'Đáp án đã nhập' : 'Đáp án từ đề'} />
          {!quiz.options.length && draft.correctAnswer && <p className="text-base"><b>{draft.answerSource === 'AI_PROPOSED' ? 'AI đề xuất' : 'Đáp án đã nhập'}:</b> {draft.correctAnswer}</p>}
          <ExplanationView explanation={draft.explanation} trapTip={draft.trapTip} extra={[[ reason ? 'Lý do bạn đã chọn' : 'Ghi chú cũ', reason || (original?.userReason === undefined ? original?.userMistake ?? '' : '') ]]} />
          {manual && <div className="space-y-3"><fieldset><legend className="text-sm font-semibold">Đáp án đúng (nếu có)</legend><div className="mt-2 flex gap-2">{draft.options.map((option, index) => <button key={option} type="button" aria-label={`Đáp án đã nhập: ${letterOf(option, index)}`} aria-pressed={draft.correctAnswer === option} onClick={() => { setDraft({ ...draft, correctAnswer: draft.correctAnswer === option ? '' : option, answerSource: draft.correctAnswer === option ? 'MISSING' : 'PROVIDED', explanation: null }); setAnswerProvidedBy('LEARNER'); setChanged(true); }} className={`min-h-10 min-w-10 rounded-lg border font-bold ${draft.correctAnswer === option ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-700'}`}>{letterOf(option, index)}</button>)}</div></fieldset>
            {!draft.options.length && <label className="block text-sm font-semibold">Đáp án đã nhập<input className={`${inputClass} mt-1`} value={draft.correctAnswer} onChange={event => { setDraft({ ...draft, correctAnswer: event.target.value, answerSource: event.target.value.trim() ? 'PROVIDED' : 'MISSING' }); setAnswerProvidedBy('LEARNER'); setChanged(true); }} /></label>}
            <label className="block text-sm font-semibold">Giải thích / mẹo ghi nhớ<textarea className={`${inputClass} mt-1`} rows={3} maxLength={4000} value={draft.trapTip} onChange={event => { setDraft({ ...draft, trapTip: event.target.value, explanation: null }); setChanged(true); }} /></label>
          </div>}
          {!draft.correctAnswer && <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có đáp án · bổ sung để ôn.</p>}
          {draft.missingInformation.length > 0 && <div className="text-sm text-amber-800 dark:text-amber-300" role="status">{draft.missingInformation.map((message, index) => <p key={index}>{message}</p>)}</div>}
          {draft.part === null && <label className="block text-sm font-semibold">Part<select aria-label="Part" className={`${inputClass} mt-1`} value="" onChange={event => { const value = Number(event.target.value) as MistakeEntry['part']; setDraft({ ...draft, part: value || null }); setPart(value || null); draftInput.current = inputText({ ...input, part: value || null }); setChanged(true); }}><option value="">Chọn Part</option>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>Part {value}</option>)}</select></label>}
        </>}
        {error && <div className="space-y-1 text-sm text-rose-600 dark:text-rose-300" role="alert"><p>{error}</p>{step === 'input' && !configBusy && !config && <button type="button" onClick={() => setConfigAttempt(value => value + 1)} className="font-bold underline">Thử kết nối lại</button>}
          {original && error.includes('nơi khác') && <button type="button" onClick={() => { if (window.confirm('Tải lại thẻ và bỏ các thay đổi chưa lưu?')) onReload(); }} className="font-bold underline">Tải lại thẻ</button>}</div>}
        {step === 'input' && <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />}
      </ScrollableModalBody>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-[#111A2C] sm:px-6">
        {step === 'input' ? <><button type="button" onClick={() => void analyze()} disabled={busy || configBusy || !config || !raw.trim()} className={`${linkClass} inline-flex min-h-11 items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}><Sparkles className="h-4 w-4" aria-hidden="true" />{busy ? 'Đang phân tích…' : 'Phân tích với AI'}</button><button type="button" onClick={quickSave} disabled={busy} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{original ? 'Lưu thay đổi' : 'Lưu nhanh'}</button></>
          : step === 'saved' ? <><button type="button" onClick={onClose} className={linkClass}>Đóng</button><button type="button" onClick={resetEntry} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>Thêm lỗi tiếp</button></>
          : <><button type="button" onClick={() => { setStep('input'); setError(''); }} className={linkClass}>Quay lại</button><div className="flex items-center gap-3">{!original && <button type="button" onClick={() => save(true)} className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Lưu &amp; thêm tiếp</button>}<button type="button" onClick={() => save()} className={`${primaryClass} bg-emerald-400 text-slate-950 hover:bg-emerald-300`}>{original ? 'Lưu thay đổi' : 'Lưu lỗi sai'}</button></div></>}
      </footer>
    </div>
  </div>;
}
