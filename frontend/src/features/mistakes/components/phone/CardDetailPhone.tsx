import { useEffect, useId, useRef, useState } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { canReview } from '@/features/mistakes/lib/spacedRepetition';
import { AnswerDoubtNote } from '../AnswerDoubtNote';
import { canExplain } from '../MistakeCard';
import { EvidenceJumper, EvidencePassage, OptionRows, QuestionHeading, useEvidenceJump } from '../CardParts';
import { ExplainBody, Words, cardTitle, categoryShort, useCardView, type CardNavProps, type CardView, type MistakeDetailActions } from '../MistakeDetail';

type Tab = 'passage' | 'question' | 'words';
const LABELS: Record<Tab, string> = { passage: 'Đoạn văn', question: 'Câu hỏi & Mẹo', words: 'Từ vựng' };

function QuestionChip({ m, view }: { m: MistakeEntry; view: CardView }) {
  const text = view.question || view.rows.find(row => row.role === 'ans')?.text || '';
  if (!text) return null;
  return <p className="cdp-qchip">{m.questionNumber ? <b>Câu {m.questionNumber}</b> : null}<span>{text}</span></p>;
}

function PassageTab({ m, view, hiddenMode }: { m: MistakeEntry; view: CardView; hiddenMode: boolean }) {
  const jump = useEvidenceJump(!hiddenMode ? view.marked.count : 0, `${m.id}:${view.context.length}`);
  return <>
    <div className="cdp-sticky"><QuestionChip m={m} view={view} />
      {!hiddenMode && view.marked.count > 1 && <EvidenceJumper at={jump.at} count={view.marked.count} onNext={jump.next} />}</div>
    <div className="cdp-pcard" ref={jump.box} tabIndex={0} aria-label="Nội dung đoạn văn">
      <EvidencePassage context={view.context} evidences={view.evidences} marked={view.marked} at={view.marked.count > 1 ? jump.at : -1} hideHighlights={hiddenMode} part={m.part} />
    </div>
  </>;
}

/**
 * One mistake card on phones (design/previews/card-v2/3-phone-part5.html, 4-phone-part7.html): segmented tabs under
 * the header (a reading card adds "Đoạn văn" first) and a thumb-zone bar in place of the app's tab bar, with
 * "Ôn câu này" first and "Đã thuộc" as text; Sửa/Xoá wait in the ⋯ menu.
 */
export function CardDetailPhone({
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
  const reading = Boolean(view.context);
  const noteOnly = !reading && !view.rows.length;
  const reviewable = canReview(m);
  const hasWords = view.words.length > 0 || Boolean(view.ex?.keyVocabulary?.trim());
  const tabs: Tab[] = [...(reading ? ['passage' as const] : []), 'question', ...(hasWords ? ['words' as const] : [])];
  // Without an explanation nothing is marked in the passage yet: open on the question, where "Giải thích với AI" is.
  const [tab, setTab] = useState<Tab>(reading && canExplain(m) ? 'question' : tabs[0]);
  const [menu, setMenu] = useState(false);
  const [selfPick, setSelfPick] = useState<string | null>(null);
  const [localBlind, setLocalBlind] = useState(false);
  const isBlind = onToggleBlind ? blind : localBlind;
  const toggleBlind = onToggleBlind ?? (() => setLocalBlind(v => !v));
  useEffect(() => { setSelfPick(null); }, [m.id]);

  const hiddenMode = Boolean(isBlind && view.rows.length > 0 && !selfPick);
  const menuId = useId();
  const tabId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const current = tabs.includes(tab) ? tab : tabs[0];

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => { if (!(event.target instanceof Node && menuRef.current?.contains(event.target))) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menu]);

  const pick = m.userMistake?.trim();
  const ans = m.correctAnswer?.trim();
  const showFooter = reviewable || m.status === 'MASTERED';

  return (
    <div className="rd cdp">
      <header className="cdp-head">
        <button type="button" className="cdp-ib" onClick={onBack} aria-label="Quay lại Sổ tay">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div>
          <h2>{cardTitle(m, ' · ')}</h2>
          <p>{testName ? `${testName} · ` : ''}{categoryShort(m.category)} · <b className={view.due.due ? 'is-due' : undefined}>{view.due.text}</b></p>
        </div>
        <div className="cdp-more" ref={menuRef}>
          <button type="button" className="cdp-ib is-bg" aria-label="Thêm thao tác" aria-haspopup="menu" aria-expanded={menu} aria-controls={menuId} onClick={() => setMenu(value => !value)}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" fill="currentColor" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" fill="currentColor" /></svg>
          </button>
          {menu && <div className="cdp-menu" role="menu" id={menuId}>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); actions.onEdit(); }}>Sửa câu này</button>
            <button type="button" role="menuitem" className="is-del" onClick={() => { setMenu(false); actions.onDelete(); }}>Xoá câu này</button>
          </div>}
        </div>
      </header>

      {(view.rows.length > 0 || (nav && nav.total > 1)) && (
        <div className="cdp-subtools">
          {view.rows.length > 0 ? (
            <button type="button" className="cd-blind-btn" aria-pressed={isBlind} onClick={toggleBlind}>
              <span aria-hidden="true">{isBlind ? '👁' : '🙈'}</span>
              {isBlind ? 'Hiện đáp án' : 'Tự làm lại'}
            </button>
          ) : <span />}
          {nav && nav.total > 1 && (
            <div className="cd-nav" role="group" aria-label="Chuyển câu hỏi">
              <button type="button" onClick={nav.onPrev} disabled={!nav.onPrev} aria-label="Câu trước">‹</button>
              <span>{nav.index + 1}/{nav.total}</span>
              <button type="button" onClick={nav.onNext} disabled={!nav.onNext} aria-label="Câu sau">›</button>
            </div>
          )}
        </div>
      )}

      {tabs.length > 1 && (
        <div className="cdp-seg" role="tablist" aria-label="Phần của thẻ">
          {tabs.map(id => (
            <button key={id} type="button" role="tab" id={`${tabId}-${id}`} aria-selected={current === id} aria-controls={`${tabId}-panel`} onClick={() => setTab(id)}>{LABELS[id]}</button>
          ))}
        </div>
      )}

      <div className={'cdp-body' + (current === 'passage' ? ' is-passage' : '')} role={tabs.length > 1 ? 'tabpanel' : undefined} id={`${tabId}-panel`} aria-labelledby={tabs.length > 1 ? `${tabId}-${current}` : undefined}>
        {!hiddenMode && m.answerDoubt && view.answer !== m.answerDoubt && <div className="cd-doubt"><AnswerDoubtNote doubt={m.answerDoubt} current={view.answer} onSwitch={() => actions.onResolveDoubt(true)} onKeep={() => actions.onResolveDoubt(false)} /></div>}
        {current === 'passage' && <PassageTab m={m} view={view} hiddenMode={hiddenMode} />}
        {current === 'question' && (noteOnly ? (
          <>
            <div className="cd-note-banner">
              <Soc state="idle" size={54} />
              <div>
                <span className={'nb-part p' + m.part}>Part {m.part} · {m.part <= 4 ? 'Nghe hiểu' : 'Đọc hiểu'}</span>
                <span className={'nb-cat c-' + m.category}>{categoryShort(m.category)}</span>
                <p>{m.part <= 4 ? 'Thẻ ghi nhanh lý do sai phần Nghe. Chạm ⋯ → Sửa nếu muốn thêm ghi chú.' : 'Thẻ chưa có câu hỏi A–D. Chạm ⋯ → Sửa để bổ sung.'}</p>
              </div>
            </div>
            {view.question && <h3 className="cd-q">{view.question}</h3>}
            {(pick || ans) && <div className="cd-plain">{pick && <p><b>Bạn chọn:</b> {pick}</p>}{ans && <p><b>Đáp án:</b> {ans}</p>}</div>}
            <ExplainBody m={m} view={view} actions={actions} words={!hasWords} />
          </>
        ) : (
          <>
            <QuestionHeading part={m.part} question={view.question} context={view.context} questionNumber={m.questionNumber} signal={view.signal} showClues={!hiddenMode} />
            {isBlind && selfPick && (
              <div className={'cd-blind-res ' + (selfPick === view.answer ? 'is-ok' : 'is-err')} role="status">
                <span>{selfPick === view.answer ? `Chính xác! Đáp án là ${view.answer}.` : `Bạn chọn ${selfPick} — Đáp án đúng là ${view.answer}.`}</span>
                <button type="button" onClick={() => setSelfPick(null)}>Làm lại</button>
              </div>
            )}
            {view.rows.length
              ? <OptionRows rows={view.rows} reasonOnly={reading} showPos={view.showPos} blind={isBlind} selfPick={selfPick} onSelfPick={setSelfPick} />
              : (pick || ans) && <div className="cd-plain">{pick && <p><b>Bạn chọn:</b> {pick}</p>}{ans && <p><b>Đáp án:</b> {ans}</p>}</div>}
            {hiddenMode
              ? <p className="cd-blind-note">Đáp án đang tạm ẩn. Chọn A–D ở trên để tự kiểm tra trước khi xem lời giải.</p>
              : <ExplainBody m={m} view={view} actions={actions} words={false} />}
          </>
        ))}
        {current === 'words' && <><QuestionChip m={m} view={view} /><Words m={m} view={view} actions={actions} all /></>}
      </div>

      {showFooter && (
        <footer className="cdp-foot">
          {reviewable && <button type="button" className="rd-btn rd-btn--pink" onClick={actions.onReview}>Ôn câu này</button>}
          {m.status === 'MASTERED'
            ? <button type="button" className="cd-link" onClick={actions.onReopen}>Ôn lại từ đầu</button>
            : reviewable && <button type="button" className="cd-link" onClick={actions.onMarkMastered}>Đã thuộc</button>}
        </footer>
      )}
    </div>
  );
}
