import { useEffect, useId, useRef, useState } from 'react';
import type { MistakeEntry } from '@/shared/types';
import { canReview } from '@/features/mistakes/lib/spacedRepetition';
import { AnswerDoubtNote } from '../AnswerDoubtNote';
import { EvidenceJumper, EvidencePassage, OptionRows, useEvidenceJump } from '../CardParts';
import { ExplainBody, Words, cardTitle, categoryShort, useCardView, type CardView, type MistakeDetailActions } from '../MistakeDetail';

type Tab = 'passage' | 'question' | 'explain' | 'words';
const LABELS: Record<Tab, string> = { passage: 'Đoạn văn', question: 'Câu hỏi', explain: 'Giải thích', words: 'Từ vựng' };

function QuestionChip({ m, view }: { m: MistakeEntry; view: CardView }) {
  const text = view.question || view.rows.find(row => row.role === 'ans')?.text || '';
  if (!text) return null;
  return <p className="cdp-qchip">{m.questionNumber ? <b>Câu {m.questionNumber}</b> : null}<span>{text}</span></p>;
}

function PassageTab({ m, view }: { m: MistakeEntry; view: CardView }) {
  const jump = useEvidenceJump(view.evidences.length, m.id);
  return <>
    <div className="cdp-sticky"><QuestionChip m={m} view={view} />
      {view.evidences.length > 1 && <EvidenceJumper at={jump.at} count={view.evidences.length} onNext={jump.next} />}</div>
    <div className="cdp-pcard" ref={jump.box} tabIndex={0} aria-label="Nội dung đoạn văn">
      <EvidencePassage context={view.context} evidences={view.evidences} at={jump.at} />
    </div>
  </>;
}

/**
 * One mistake card on phones (design/previews/card-v2/3-phone-part5.html, 4-phone-part7.html): segmented tabs under
 * the header (a reading card adds "Đoạn văn" first) and a thumb-zone bar in place of the app's tab bar, with
 * "Ôn câu này" first and "Đã thuộc" as text; Sửa/Xoá wait in the ⋯ menu.
 */
export function CardDetailPhone({ mistake: m, testName, actions, onBack }: { mistake: MistakeEntry; testName?: string; actions: MistakeDetailActions; onBack: () => void }) {
  const view = useCardView(m);
  const reading = Boolean(view.context);
  const hasWords = view.words.length > 0 || Boolean(view.ex?.keyVocabulary?.trim());
  const tabs: Tab[] = [...(reading ? ['passage' as const] : []), 'question', 'explain', ...(hasWords ? ['words' as const] : [])];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [menu, setMenu] = useState(false);
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

  return (
    <div className="rd cdp">
      <header className="cdp-head">
        <button type="button" className="cdp-ib" onClick={onBack} aria-label="Về Sổ tay">
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

      <div className="cdp-seg" role="tablist" aria-label="Phần của thẻ">
        {tabs.map(id => (
          <button key={id} type="button" role="tab" id={`${tabId}-${id}`} aria-selected={current === id} aria-controls={`${tabId}-panel`} onClick={() => setTab(id)}>{LABELS[id]}</button>
        ))}
      </div>

      <div className={'cdp-body' + (current === 'passage' ? ' is-passage' : '')} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${current}`}>
        {m.answerDoubt && view.answer !== m.answerDoubt && <div className="cd-doubt"><AnswerDoubtNote doubt={m.answerDoubt} current={view.answer} onSwitch={() => actions.onResolveDoubt(true)} onKeep={() => actions.onResolveDoubt(false)} /></div>}
        {current === 'passage' && <PassageTab m={m} view={view} />}
        {current === 'question' && <>
          {view.question && <h3 className="cd-q">{view.question}</h3>}
          {view.rows.length
            ? <OptionRows rows={view.rows} reasonOnly={reading} showPos={view.showPos} />
            : <div className="cd-plain"><p><b>Bạn chọn:</b> {m.userMistake || '—'}</p><p><b>Đáp án:</b> {m.correctAnswer || '—'}</p></div>}
        </>}
        {current === 'explain' && <><QuestionChip m={m} view={view} /><ExplainBody m={m} view={view} actions={actions} words={false} /></>}
        {current === 'words' && <><QuestionChip m={m} view={view} /><Words m={m} view={view} actions={actions} all /></>}
      </div>

      <footer className="cdp-foot">
        {canReview(m) && <button type="button" className="rd-btn rd-btn--pink" onClick={actions.onReview}>Ôn câu này</button>}
        {m.status === 'MASTERED'
          ? <button type="button" className="cd-link" onClick={actions.onReopen}>Ôn lại từ đầu</button>
          : <button type="button" className="cd-link" onClick={actions.onMarkMastered}>Đã thuộc</button>}
      </footer>
    </div>
  );
}
