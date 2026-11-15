import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ErrorCategory, MistakeEntry, StudySession } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { requestAISignIn } from '@/shared/lib/aiSignIn';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import type { AIConfiguration, AIUsage } from '@/features/mistakes/services/aiMistakeExtractor';
import { CHOICE_LETTERS, inferPart, parsePastedQuestion, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';
import { normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { buildManualEntry, latestTestName, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { draftFromBlock, splitPastedQuestions } from '@/features/mistakes/lib/multiQuestion';
import { isUnreadable, type CaptureItem } from '@/features/mistakes/lib/captureBatch';
import { parseManualDraft, type ManualDraft } from '@/features/mistakes/lib/manualDraft';
import { saveCaptureItems } from '@/features/mistakes/services/saveCapture';
import { ReviewList } from '@/features/mistakes/components/CaptureReview';
import { TestSelect } from '@/features/mistakes/components/TestSelect';
import './capture-rd.css';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  sourceSuggestions: string[];
  initialTestName?: string;
  onClose: () => void;
  onAdd: (entry: MistakeEntry) => void;
  onAddBatch?: (entries: MistakeEntry[]) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  /** Asks Sóc for the explanation of a card just saved (one AI use). */
  onExplain: (entry: MistakeEntry) => void;
  onSaved: (message: string) => void;
}

type Letter = ChoiceLetter | '';
const PARTS = [5, 6, 7] as const;

/** "Tự gõ một câu": paste a question from the test, tick what you chose and the key. Several numbered questions become a review list. */
export function ManualQuestionModal({ sessions, mistakes, sourceSuggestions, initialTestName = '', onClose, onAdd, onAddBatch, onUpdate, onExplain, onSaved }: Props) {
  const [raw, setRaw] = useState('');
  const [part, setPart] = useState<MistakeEntry['part']>(5);
  const [partTouched, setPartTouched] = useState(false);
  const [testName, setTestName] = useState(() => normalizeTestName(initialTestName) || latestTestName(sessions) || sourceSuggestions[0] || '');
  const [choice, setChoice] = useState<Letter>('');
  const [answer, setAnswer] = useState<Letter>('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<ErrorCategory | ''>('');
  const [more, setMore] = useState(false);
  const [rawSeen, setRawSeen] = useState(false);
  const [items, setItems] = useState<CaptureItem[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [access, setAccess] = useState<AIUsage | null>(null);
  const [owner] = useState(getActiveAccountId);

  const blocks = useMemo(() => splitPastedQuestions(raw), [raw]);
  const multi = blocks.length >= 2;
  const detected = inferPart(raw);
  const effectivePart = (partTouched ? part : detected && detected >= 5 ? detected : part) as MistakeEntry['part'];
  const parsed = useMemo(() => raw.trim() ? parsePastedQuestion(raw, effectivePart) : null, [raw, effectivePart]);
  const letters = CHOICE_LETTERS.filter(letter => !parsed || parsed.error || parsed.options.some(option => option.startsWith(`(${letter})`)));
  const aiReady = Boolean(config?.structuredInput) && access?.enabled !== false;

  const draftValue: ManualDraft = { raw, part, partTouched, testName, choice, answer, reason, category, more };
  const draft = useFormDraft({
    scope: 'manual-question', value: draftValue, meaningful: Boolean(raw.trim()), validate: parseManualDraft,
    restore: value => {
      setRaw(value.raw); setPart(value.part as MistakeEntry['part']); setPartTouched(value.partTouched); setTestName(value.testName || testName);
      setChoice(value.choice); setAnswer(value.answer); setReason(value.reason); setCategory(value.category); setMore(value.more);
    }
  });
  const close = useCallback(() => { draft.persist(); onClose(); }, [draft, onClose]);
  const ref = useModalA11y(true, close);

  useEffect(() => {
    let cancelled = false;
    void aiService.getAIConfiguration().then(async value => {
      const usage = value.managedAccess ? await aiService.getAIUsage() ?? { remaining: 0, limit: 0, guest: true, enabled: false,
        accessStatus: 'login_required' as const, accessMessage: 'Đăng nhập Google để Sóc giải thích. Bạn vẫn lưu được câu này.' } : null;
      if (!cancelled) { setConfig(value); setAccess(usage); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const finish = (message: string, entries?: MistakeEntry) => {
    draft.clear();
    onSaved(message);
    onClose();
    if (entries && aiReady) onExplain(entries);
  };

  const review = () => {
    if (!testName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); return; }
    const rows = blocks.map(block => {
      const read = draftFromBlock(block);
      // A block that could not be read keeps its pasted text, so the learner can fix it or drop it.
      const itemDraft: CaptureItem['draft'] = read.draft ?? { part: read.part, category: 'OTHER', questionContext: `Câu ${block.number}`, userMistake: '',
        question: block.raw, context: '', correctAnswer: '', trapTip: '', options: [], tags: [], missingInformation: [], answerSource: 'MISSING',
        userChoice: '', userChoiceState: 'UNKNOWN', userReason: '', optionNotes: [], explanation: null };
      return { id: generateUUID(), number: block.number, part: read.part, draft: itemDraft, category: (category || 'OTHER') as ErrorCategory, ticket: null,
        checked: !isUnreadable(itemDraft) } satisfies CaptureItem;
    });
    setError(''); setItems(rows);
  };

  const saveOne = () => {
    setRawSeen(true);
    if (!raw.trim()) { setError('Dán câu hỏi và các phương án.'); return; }
    if (!testName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); return; }
    if (!parsed || parsed.error) { setError(parsed?.error || 'Dán câu hỏi và các phương án.'); return; }
    if (choice && !parsed.options.some(option => option.startsWith(`(${choice})`))) { setError('Lựa chọn chưa khớp phương án. Kiểm tra lại nội dung đã dán.'); return; }
    if (answer && !parsed.options.some(option => option.startsWith(`(${answer})`))) { setError('Đáp án đúng chưa khớp phương án. Kiểm tra lại nội dung đã dán.'); return; }
    if (choice && choice === answer) { setError('Đáp án bạn chọn trùng đáp án đúng.'); return; }
    if (getActiveAccountId() !== owner) { setError('Tài khoản đã thay đổi. Chưa lưu câu sai.'); return; }
    setSaving(true); setError('');
    try {
      const entry = buildManualEntry({ part: effectivePart, testName, question: parsed.question, options: parsed.options, choice, answer, reason, category, tags: '' });
      if (new TextEncoder().encode(JSON.stringify(entry)).byteLength > 32768) throw new Error('Thẻ vượt giới hạn 32 KiB. Rút gọn câu hỏi/đoạn trích trước khi lưu; bản nháp được giữ.');
      onAdd(entry);
      finish(aiReady ? 'Đã lưu, Sóc đang viết lời giải…' : 'Đã lưu ghi chú. Mở thẻ để nhờ Sóc giải thích khi AI sẵn sàng.', entry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được. Nội dung đang nhập được giữ.');
    } finally { setSaving(false); }
  };

  const saveMany = () => {
    if (!items || saving) return;
    if (getActiveAccountId() !== owner) { setError('Tài khoản đã thay đổi. Chưa lưu câu sai.'); return; }
    setSaving(true); setError('');
    try {
      const result = saveCaptureItems(items, { testName, sessionId: questionsToFind(sessions, testName).sessionId, existing: mistakes, onAddBatch, onUpdate });
      finish(`Đã lưu ${result.saved} câu sai. Mở từng thẻ để nhờ Sóc giải thích.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được các câu sai. Bản nháp vẫn được giữ; hãy thử lại.');
    } finally { setSaving(false); }
  };

  const chips = (label: string, kind: 'me' | 'ok', value: Letter, set: (letter: Letter) => void) => (
    <div className="cap-abcd" role="group" aria-label={label}>
      <b>{label}</b>
      {CHOICE_LETTERS.map(letter => (
        <button key={letter} type="button" className={'is-' + kind} aria-pressed={value === letter} aria-label={`${label}: ${letter}`}
          disabled={!raw.trim() || !letters.includes(letter)} onClick={() => set(value === letter ? '' : letter)}>{letter}</button>
      ))}
    </div>
  );

  const checked = items?.filter(item => item.checked).length ?? 0;

  return (
    <div className="cap-dim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="man-title" className={'cap-mod is-manual' + (items ? ' is-wide' : '')}>
        <div className="cap-head">
          <h2 id="man-title">{items ? `Soát ${items.length} câu sai` : 'Tự gõ một câu sai'}</h2>
          <button type="button" className="cap-x" aria-label="Đóng" onClick={close}>×</button>
        </div>

        {items ? <>
          <div className="cap-body">
            <ReviewList items={items} unsureLabel="Chưa chọn đáp án" onToggle={id => setItems(list => list!.map(item => item.id === id ? { ...item, checked: !item.checked } : item))}
              onPatch={(id, patch) => setItems(list => list!.map(item => item.id === id ? { ...item, ...patch } : item))}
              onRemove={id => setItems(list => list!.filter(item => item.id !== id))} />
            {error && <p role="alert" className="cap-error">{error}</p>}
          </div>
          <div className="cap-foot">
            <button type="button" className="cap-link" onClick={() => { setItems(null); setError(''); }}>‹ Quay lại</button>
            <button type="button" className="rd-btn rd-btn--pink" disabled={!checked || saving} onClick={saveMany}>Lưu {checked} câu vào Sổ tay</button>
          </div>
        </> : <>
          <div className="cap-body">
            <div className="cap-two">
              <div>
                <div className="cap-lbl" id="man-part">Part</div>
                <div className="cap-pchips" role="group" aria-labelledby="man-part">
                  {PARTS.map(value => <button key={value} type="button" aria-pressed={effectivePart === value} aria-label={`Part ${value}`}
                    onClick={() => { setPart(value); setPartTouched(true); }}>{value}</button>)}
                </div>
              </div>
              <div className="cap-grow">
                <div className="cap-lbl">Đề</div>
                <TestSelect variant="bare" value={testName} names={sourceSuggestions} onChange={setTestName} />
              </div>
            </div>
            <div className="cap-lbl"><label htmlFor="man-raw">Câu hỏi và các phương án</label><small>dán từ đề là nhanh nhất</small></div>
            <textarea id="man-raw" className="cap-ta" value={raw} rows={5} maxLength={8000} spellCheck={false} autoFocus
              placeholder="Dán một câu hỏi và các phương án…" aria-describedby={rawSeen && parsed?.error && !multi ? 'man-raw-error' : undefined}
              onChange={event => { setRaw(event.target.value); setError(''); }} onBlur={() => setRawSeen(true)} />
            {multi
              ? <p className="cap-note" role="status">Sóc thấy {blocks.length} câu trong đoạn dán (câu {blocks.map(block => block.number).join(', ')}). Bấm “Soát {blocks.length} câu” để kiểm tra từng câu.</p>
              : rawSeen && parsed?.error && <p id="man-raw-error" className="cap-note is-warn" role="status">{parsed.error}</p>}
            {!multi && <>
              {chips('Mình chọn', 'me', choice, setChoice)}
              {chips('Đáp án đúng', 'ok', answer, setAnswer)}
              <button type="button" className="cap-more" aria-expanded={more} onClick={() => setMore(value => !value)}>
                <span aria-hidden="true">{more ? '▾' : '▸'}</span> Thêm lý do và loại lỗi <small>(không bắt buộc, Sóc có thể đoán giúp)</small>
              </button>
              {more && (
                <div className="cap-edit-two cap-more-body">
                  <label>Lý do bạn chọn
                    <input value={reason} maxLength={2000} placeholder="Mình chọn vì…" onChange={event => setReason(event.target.value)} />
                  </label>
                  <label>Loại lỗi
                    <select value={category} onChange={event => setCategory(event.target.value as ErrorCategory | '')}>
                      <option value="">Chưa chọn</option>
                      {Object.entries(CATEGORY_CHOICES).filter(([value]) => value !== 'LISTENING_SPEED' && value !== 'OTHER').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </>}
            {access?.enabled === false && !multi && (
              <p className="cap-note" role="status">{access.accessMessage} {access.accessStatus === 'login_required' && <button type="button" className="cap-link is-quiet" onClick={requestAISignIn}>Đăng nhập Google</button>}</p>
            )}
            {error && <p role="alert" className="cap-error">{error}</p>}
          </div>
          <div className="cap-foot">
            <span className="cap-foot-note is-dim" role="status">{draft.state === 'unavailable' ? 'Chưa tự lưu được nháp. Giữ cửa sổ này mở để tránh mất nội dung.' : 'Nháp tự lưu trên máy này'}</span>
            {multi
              ? <button type="button" className="rd-btn rd-btn--pink" onClick={review}>Soát {blocks.length} câu</button>
              : <button type="button" className="rd-btn rd-btn--pink" disabled={saving} onClick={saveOne}>Lưu, Sóc giải thích giúp</button>}
          </div>
        </>}
      </div>
    </div>
  );
}
