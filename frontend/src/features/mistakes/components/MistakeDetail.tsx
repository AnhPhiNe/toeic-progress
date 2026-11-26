import { useEffect, useMemo, useState } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { canReview, isDueForReview } from '@/features/mistakes/lib/spacedRepetition';
import { cardEvidences, cardWords, markPassage, optionRows, signalLine } from '@/features/mistakes/lib/cardDetail';
import { isWordSaved } from '@/features/mistakes/lib/savedWords';
import { AnswerDoubtNote } from './AnswerDoubtNote';
import { canExplain } from './MistakeCard';
import { isNumberLabel } from '@/features/mistakes/lib/questionSnippet';
import { EvidenceJumper, EvidencePassage, OptionRows, QuestionHeading, SignalBlock, TipBlock, WordRows, useEvidenceJump } from './CardParts';

export interface CardNavProps {
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

export interface MistakeDetailActions {
  onEdit: () => void;
  onDelete: () => void;
  onMarkMastered: () => void;
  onReopen: () => void;
  onReview: () => void;
  onExplain: () => void;
  explainLabel: string;
  explaining: boolean;
  onResolveDoubt: (switchToAI: boolean) => void;
  /** Keeps words from "Từ cần nhớ" on the card for review. */
  onSaveWords: (words: string[]) => void;
  /** Toggles a single word on/off from "Từ cần nhớ". */
  onToggleWord?: (word: string) => void;
}

const CATEGORY_SHORT: Record<string, string> = {
  VOCABULARY_TRAP: 'Từ vựng', ADVANCED_GRAMMAR: 'Ngữ pháp', LISTENING_SPEED: 'Nghe', TIME_PRESSURE: 'Thời gian', CARELESS_DISTRACTION: 'Đọc ẩu', OTHER: 'Khác'
};
export const categoryShort = (category: string) => CATEGORY_SHORT[category] ?? ERROR_CATEGORY_LABELS[category as keyof typeof ERROR_CATEGORY_LABELS]?.label ?? 'Khác';
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export function reviewLabel(m: MistakeEntry): { text: string; due: boolean } {
  if (m.status === 'MASTERED') return { text: 'đã thuộc', due: false };
  if (isDueForReview(m)) return { text: 'ôn hôm nay', due: true };
  return { text: m.nextReviewDate ? `ôn ${ddmm(m.nextReviewDate)}` : 'chưa ôn', due: false };
}
/** List rows: a new card waiting for its first review needs no red "ôn hôm nay"; only a set date that has come does. */
export function rowReviewLabel(m: MistakeEntry): { text: string; due: boolean } {
  const label = reviewLabel(m);
  return label.due && !m.nextReviewDate ? { text: '', due: false } : label;
}

/** Everything both layouts read from a card, worked out once. */
export function useCardView(m: MistakeEntry) {
  return useMemo(() => {
    const ex = m.explanation;
    const context = (m.context ?? '').trim();
    const question = (m.question ?? m.questionContext ?? '').trim();
    const rows = optionRows(m);
    const evidences = cardEvidences(m);
    const marked = context ? markPassage(context, evidences) : { blocks: [], count: 0 };
    const signal = signalLine(ex?.analysis);
    const analysisFallback = !signal ? (ex?.analysis?.trim() ?? '') : '';
    const evidenceFallback = context && marked.count === 0
      ? ((ex?.evidences ?? []).map(item => item.text?.trim()).filter(Boolean).join('\n') || ex?.evidence?.trim() || '')
      : '';
    // Part 5/6 sentence translation; on a reading card it sits under the marked sentence unless no mark was placed.
    const translation = (!context || marked.count === 0) ? (ex?.translation?.trim() ?? '') : '';
    const tip = (ex?.quickTip || m.trapTip || '').trim();
    const mine = m.userReason?.trim() ?? '';
    const words = cardWords(m);
    const hasExplain = Boolean(tip || signal || analysisFallback || evidenceFallback || translation || mine);
    return {
      ex, context, rows, evidences, marked,
      question: question && !isNumberLabel(question) ? question : '',
      words, signal, analysisFallback, evidenceFallback, tip, mine, translation, hasExplain,
      showPos: new Set(rows.map(row => row.pos).filter(Boolean)).size > 1,
      due: reviewLabel(m),
      answer: optionLetter(m.correctAnswer)
    };
  }, [m]);
}
export type CardView = ReturnType<typeof useCardView>;

export const cardTitle = (m: MistakeEntry, joiner: string) => `${m.questionNumber ? `Câu ${m.questionNumber}${joiner}` : ''}Part ${m.part}`;

/** The explanation side: tip, signal, fallback analysis/evidence, translation, learner note, words; or the "Giải thích với AI" button. */
export function ExplainBody({ m, view, actions, words = true }: { m: MistakeEntry; view: CardView; actions: MistakeDetailActions; words?: boolean }) {
  const { tip, signal, analysisFallback, evidenceFallback, translation, mine, ex } = view;
  const empty = !tip && !signal && !analysisFallback && !evidenceFallback && !translation && !(words && (view.words.length || ex?.keyVocabulary?.trim()));
  return <>
    {tip && <TipBlock tip={tip} />}
    {signal && <SignalBlock text={signal} />}
    {analysisFallback && <div className="cd-sign is-plain"><small>Phân tích</small><p>{analysisFallback}</p></div>}
    {evidenceFallback && <div className="cd-sign is-plain"><small>Bằng chứng</small><p>{evidenceFallback}</p></div>}
    {translation && <div className="cd-sign is-plain"><small>Dịch câu</small><p>{translation}</p></div>}
    {mine && <p className="cd-mine"><b>Bạn ghi:</b> {mine}</p>}
    {words && <Words m={m} view={view} actions={actions} />}
    {empty && canExplain(m) && (
      <button type="button" className="cd-explain" onClick={actions.onExplain} disabled={actions.explaining}>
        {actions.explaining ? 'Sóc đang viết lời giải…' : `${actions.explainLabel} ✨`}
      </button>
    )}
  </>;
}

export function Words({ m, view, actions, all = false }: { m: MistakeEntry; view: CardView; actions: MistakeDetailActions; all?: boolean }) {
  if (view.words.length) return <div className="cd-block"><small className="cd-cap">Từ cần nhớ</small>
    <WordRows words={view.words} isSaved={word => isWordSaved(m, word)} onSave={actions.onSaveWords} onToggle={actions.onToggleWord} all={all} /></div>;
  const text = view.ex?.keyVocabulary?.trim();
  return text ? <div className="cd-sign is-plain"><small>Từ cần nhớ</small><p>{text}</p></div> : null;
}

function Actions({ m, actions }: { m: MistakeEntry; actions: MistakeDetailActions }) {
  const reviewable = canReview(m);
  return (
    <div className="cd-acts">
      {reviewable && <button type="button" className="rd-btn rd-btn--pink" onClick={actions.onReview}>Ôn câu này</button>}
      {m.status === 'MASTERED'
        ? <button type="button" className="rd-btn rd-btn--white" onClick={actions.onReopen}>Ôn lại từ đầu</button>
        : reviewable && <button type="button" className="rd-btn rd-btn--white" onClick={actions.onMarkMastered}>Đã thuộc</button>}
      <span className="cd-sp" />
      <button type="button" className="cd-link" onClick={actions.onEdit}>Sửa</button>
      <button type="button" className="cd-link is-del" onClick={actions.onDelete} aria-label="Xoá câu này">Xoá</button>
    </div>
  );
}

function Plain({ m }: { m: MistakeEntry }) {
  const pick = m.userMistake?.trim();
  const ans = m.correctAnswer?.trim();
  if (!pick && !ans) return null;
  return <div className="cd-plain">{pick && <p><b>Bạn chọn:</b> {pick}</p>}{ans && <p><b>Đáp án:</b> {ans}</p>}</div>;
}

/**
 * One mistake card on computers (design/previews/card-v2/1-desktop-part5.html, 2-desktop-part7.html): two columns
 * that fit the screen. A single question has the question and options on the left and a sticky panel with the tip,
 * signal, words and actions on the right; a reading card keeps the passage in its own scroll box on the left, opened
 * at the evidence, and the question with everything else on the right; a reason-only Listening card centers cleanly
 * in one column without an empty placeholder grid.
 */
export function MistakeDetail({
  mistake: m, testName, actions, onBack, nav, blind = false, onToggleBlind
}: {
  mistake: MistakeEntry;
  testName?: string;
  actions: MistakeDetailActions;
  onBack: () => void;
  nav?: CardNavProps;
  blind?: boolean;
  onToggleBlind?: () => void;
}) {
  const view = useCardView(m);
  const { context, question, rows, evidences, marked, due } = view;
  const reading = Boolean(context);
  const noteOnly = !reading && !rows.length;
  const [selfPick, setSelfPick] = useState<string | null>(null);
  const [localBlind, setLocalBlind] = useState(false);
  const isBlind = onToggleBlind ? blind : localBlind;
  const toggleBlind = onToggleBlind ?? (() => setLocalBlind(v => !v));
  useEffect(() => { setSelfPick(null); }, [m.id]);

  useEffect(() => {
    if (!nav || nav.total < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && nav.onPrev) { e.preventDefault(); nav.onPrev(); }
      else if (e.key === 'ArrowRight' && nav.onNext) { e.preventDefault(); nav.onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  const hiddenMode = Boolean(isBlind && rows.length > 0 && !selfPick);
  const jump = useEvidenceJump(reading && !hiddenMode ? marked.count : 0, `${m.id}:${context.length}`);
  const options = rows.length
    ? <OptionRows rows={rows} reasonOnly={reading} showPos={view.showPos} blind={isBlind} selfPick={selfPick} onSelfPick={setSelfPick} />
    : <Plain m={m} />;
  const hint = !hiddenMode && rows.some(row => row.role === '' && (row.meaning || row.reason));
  const partClass = m.part === 5 ? ' is-p5' : m.part === 6 ? ' is-p6' : m.part === 7 ? ' is-p7' : '';

  const blindBanner = isBlind && selfPick && (
    <div className={'cd-blind-res ' + (selfPick === view.answer ? 'is-ok' : 'is-err')} role="status">
      <span>{selfPick === view.answer ? `Chính xác! Đáp án là ${view.answer}.` : `Bạn chọn ${selfPick} — Đáp án đúng là ${view.answer}.`}</span>
      <button type="button" onClick={() => setSelfPick(null)}>Làm lại</button>
    </div>
  );

  return (
    <div className={'cd' + (reading ? ' is-reading' : noteOnly ? ' is-note' : '') + partClass}>
      <header className="cd-crumb">
        <button type="button" className="cd-back" onClick={onBack}><span aria-hidden="true">←</span> Sổ tay</button>
        <div>
          <h2>{cardTitle(m, ', ')}</h2>
          <p>{testName ? `${testName} · ` : ''}{categoryShort(m.category)} · <b className={due.due ? 'is-due' : undefined}>{due.text}</b></p>
        </div>
        <div className="cd-crumb-tools">
          {rows.length > 0 && (
            <button type="button" className="cd-blind-btn" aria-pressed={isBlind} onClick={toggleBlind}>
              <span aria-hidden="true">{isBlind ? '👁' : '🙈'}</span>
              {isBlind ? 'Hiện đáp án' : 'Tự làm lại'}
            </button>
          )}
          {nav && nav.total > 1 && (
            <div className="cd-nav" role="group" aria-label="Chuyển câu hỏi">
              <button type="button" onClick={nav.onPrev} disabled={!nav.onPrev} aria-label="Câu trước" title="Câu trước (←)">‹</button>
              <span>{nav.index + 1}/{nav.total}</span>
              <button type="button" onClick={nav.onNext} disabled={!nav.onNext} aria-label="Câu sau" title="Câu sau (→)">›</button>
            </div>
          )}
        </div>
      </header>
      {!hiddenMode && m.answerDoubt && view.answer !== m.answerDoubt && <div className="cd-doubt"><AnswerDoubtNote doubt={m.answerDoubt} current={view.answer} onSwitch={() => actions.onResolveDoubt(true)} onKeep={() => actions.onResolveDoubt(false)} /></div>}

      {reading ? (
        <div className="cd-cols">
          <section className="cd-pcard" aria-label="Đoạn văn">
            <div className="cd-phd"><span>Đoạn văn</span>
              {!hiddenMode && (marked.count > 1 ? <EvidenceJumper at={jump.at} count={marked.count} onNext={jump.next} />
                : marked.count === 1 ? <span className="cd-phd-count">1 câu bằng chứng</span> : null)}
            </div>
            <div className="cd-pscroll" ref={jump.box} tabIndex={0} aria-label="Nội dung đoạn văn">
              <EvidencePassage context={context} evidences={evidences} marked={marked} at={marked.count > 1 ? jump.at : -1} hideHighlights={hiddenMode} part={m.part} />
            </div>
          </section>
          <aside className="cd-panel">
            <div className="cd-pbody">
              <QuestionHeading part={m.part} question={question} context={context} questionNumber={m.questionNumber} small />
              {blindBanner}
              {options}
              {hiddenMode
                ? <p className="cd-blind-note">Đáp án và câu bằng chứng đang tạm ẩn. Chọn A–D ở trên để tự kiểm tra trước khi xem lời giải.</p>
                : <ExplainBody m={m} view={view} actions={actions} />}
            </div>
            <Actions m={m} actions={actions} />
          </aside>
        </div>
      ) : noteOnly ? (
        <section className="cd-note-card" aria-label="Ghi chú câu sai">
          <div className="cd-note-banner">
            <Soc state="idle" size={62} />
            <div>
              <span className={'nb-part p' + m.part}>Part {m.part} · {m.part <= 4 ? 'Nghe hiểu' : 'Đọc hiểu'}</span>
              <span className={'nb-cat c-' + m.category}>{categoryShort(m.category)}</span>
              <p>
                {m.part <= 4
                  ? 'Thẻ ghi nhanh lý do sai phần Nghe — không cần chép câu hỏi. Bấm Sửa nếu bạn muốn thêm ghi chú chi tiết.'
                  : 'Thẻ chưa có đủ nội dung câu hỏi và phương án A–D. Bấm Sửa để bổ sung rồi ôn lại.'}
              </p>
            </div>
          </div>
          {question && <h3 className="cd-q is-sm">{question}</h3>}
          {options}
          <ExplainBody m={m} view={view} actions={actions} />
          <Actions m={m} actions={actions} />
        </section>
      ) : (
        <div className="cd-cols">
          <section className="cd-qcard" aria-label="Câu hỏi">
            <QuestionHeading part={m.part} question={question} context={context} questionNumber={m.questionNumber} signal={view.signal} showClues={!hiddenMode} />
            {blindBanner}
            {options}
            {hint && <p className="cd-hint">Bấm “Vì sao” để xem lý do của từng đáp án.</p>}
          </section>
          <aside className="cd-panel">
            <div className="cd-pbody">
              {hiddenMode
                ? <p className="cd-blind-note">Đáp án và mẹo giải đang tạm ẩn. Hãy chọn A–D bên trái để tự kiểm tra trí nhớ trước khi xem lời giải.</p>
                : <ExplainBody m={m} view={view} actions={actions} />}
            </div>
            <Actions m={m} actions={actions} />
          </aside>
        </div>
      )}
    </div>
  );
}
