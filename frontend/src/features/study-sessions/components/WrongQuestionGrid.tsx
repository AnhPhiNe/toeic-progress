import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { prepareImage, MAX_RESULT_IMAGES, RESULT_IMAGE_OPTIONS } from '@/features/mistakes/lib/imageInput';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { formatQuestionList, normalizeQuestionList, parseQuestionList, PART_NUMBERS, questionsOfPart, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';

const listening = (part: PartNumber) => part <= 4;

/** Tap the questions answered wrong, one Part at a time; or type the numbers ("3 15 101-104"). */
export function WrongQuestionGrid({ wrong, onChange }: { wrong: number[]; onChange: (wrong: number[]) => void }) {
  const [part, setPart] = useState<PartNumber>(1);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const byPart = wrongQuestionsByPart(wrong);
  const marked = new Set(wrong);
  const toggle = (question: number) => onChange(marked.has(question) ? wrong.filter(item => item !== question) : [...wrong, question].sort((a, b) => a - b));
  const applyTyped = () => {
    const parsed = parseQuestionList(text);
    setInvalid(parsed.invalid);
    if (!parsed.invalid.length) { onChange(parsed.questions); setTyping(false); }
  };

  return (
    <div className="space-y-3">
      <ResultImageButton onRead={numbers => {
        // Marks from the screenshot are added to any taps; the grid opens on the first marked Part.
        const merged = normalizeQuestionList([...wrong, ...numbers]);
        onChange(merged);
        if (numbers.length) setPart(PART_NUMBERS.find(item => questionsOfPart(item).includes(Math.min(...numbers))) ?? 1);
      }} />
      <p className="text-[14.5px] font-black text-slate-900 dark:text-white">Chạm vào câu bạn làm sai</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Part">
        {PART_NUMBERS.map(item => {
          const on = item === part, count = byPart[item].length;
          return (
            <button key={item} type="button" aria-pressed={on} aria-label={`Part ${item}${count ? `, ${count} câu sai` : ''}`} onClick={() => setPart(item)}
              className="flex cursor-pointer flex-col items-center gap-0.5">
              <span className={'flex h-9 w-full items-center justify-center rounded-[10px] border-2 text-[13px] font-black ' + (on
                ? (listening(item) ? 'border-slate-900 bg-indigo-600 text-white' : 'border-slate-900 bg-teal-600 text-white') + ' dark:border-slate-200'
                : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>P{item}</span>
              <span className="h-4 text-[11px] font-black tabular-nums text-rose-600 dark:text-rose-400" aria-hidden="true">{count ? `${count} sai` : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={`Câu sai Part ${part}`}>
        {questionsOfPart(part).map(question => {
          const on = marked.has(question);
          return (
            <button key={question} type="button" aria-pressed={on} aria-label={`Câu ${question}`} onClick={() => toggle(question)}
              className={'h-11 cursor-pointer rounded-[10px] border-2 text-[14px] font-black tabular-nums ' + (on
                ? 'border-slate-900 bg-rose-600 text-white dark:border-slate-200'
                : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{question}</button>
          );
        })}
      </div>
      {typing
        ? <div className="space-y-2">
            <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">Số câu sai
              <input autoFocus type="text" value={text} onChange={event => { setText(event.target.value); setInvalid([]); }} placeholder="3 15 22 101-104"
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                className="mt-1 h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 font-bold tabular-nums text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
            </label>
            {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">Không đọc được: {invalid.join(', ')}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={applyTyped} className="min-h-11 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[14px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">Áp dụng</button>
              <button type="button" onClick={() => { setTyping(false); setInvalid([]); }} className="min-h-11 cursor-pointer px-3 text-[14px] font-bold text-slate-500 dark:text-slate-400">Hủy</button>
            </div>
          </div>
        : <button type="button" onClick={() => { setText(formatQuestionList(wrong)); setTyping(true); }} className="min-h-10 cursor-pointer text-[13.5px] font-bold text-blue-700 dark:text-blue-300">Gõ số câu thay vì chạm</button>}
    </div>
  );
}

/**
 * Optional: a screenshot of the test's result page lets AI mark the wrong and skipped questions on the grid.
 * Shown only when the backend offers it; the learner checks the marks before saving.
 */
function ResultImageButton({ onRead }: { onRead: (numbers: number[]) => void }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { containerRef, getToken, remove } = useTurnstile();
  useEffect(() => {
    let cancelled = false;
    void aiService.getAIConfiguration().then(config => { if (!cancelled) setAvailable(Boolean(config.resultImages)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!available) return null;
  const read = async (files: File[]) => {
    if (busy || !files.length) return;
    if (files.length > MAX_RESULT_IMAGES) { setError(`Mỗi lần chọn tối đa ${MAX_RESULT_IMAGES} ảnh.`); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const images = [];
      for (const file of files) images.push(await prepareImage(file, RESULT_IMAGE_OPTIONS));
      const result = await aiService.readResultsWithAI(images, getToken);
      const count = result.wrong.length + result.skipped.length;
      onRead([...result.wrong, ...result.skipped]);
      setNote(count ? `AI đã tô ${count} câu${result.skipped.length ? ` (${result.skipped.length} câu bỏ trống)` : ''}. Kiểm tra lại trên lưới.`
        : 'Không thấy câu sai nào trong ảnh. Chạm vào các câu sai bên dưới.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Chạm vào các câu sai bên dưới.');
    } finally { setBusy(false); remove(); }
  };
  return (
    <div onPaste={event => { const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void read(files); } }}>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-violet-100 text-[14.5px] font-black text-violet-950 disabled:cursor-wait disabled:opacity-60 dark:border-violet-300 dark:bg-violet-950 dark:text-white">
        <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />{busy ? 'AI đang đọc ảnh…' : 'Dán ảnh kết quả'}<span className="text-[12px] font-bold text-violet-700 dark:text-violet-300">(không bắt buộc)</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Ảnh kết quả"
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void read(files); }} />
      {note && <p role="status" className="mt-1.5 text-[13px] font-bold text-violet-700 dark:text-violet-300">{note}</p>}
      {error && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
      <div ref={containerRef} aria-label="Xác minh yêu cầu AI" />
    </div>
  );
}
