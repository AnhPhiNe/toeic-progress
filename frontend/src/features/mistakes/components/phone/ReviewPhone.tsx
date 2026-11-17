import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MistakeEntry } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { readQuestion } from '@/features/mistakes/lib/questionText';
import type { ReviewAnswer } from '@/features/mistakes/lib/spacedRepetition';
import { getUserChoice } from '@/features/mistakes/lib/userChoice';
import { findFocus, groupLabel, groupNumbers, splitFocus } from '@/features/mistakes/lib/passageFocus';
import { loadMistakes } from '@/shared/data/storage';
import { sourceImageUrls } from '@/features/mistakes/services/sourceImages';
import { Soc } from '@/shared/ui/soc/Soc';
import { PhoneSheet } from '@/app/components/phone';
import { PhoneImageViewer } from './PhoneImageViewer';
import { categoryChip, PART_COLORS } from './partStyle';
import './phone-notebook.css';

interface Props {
  cards: MistakeEntry[];
  onClose: () => void;
  onGrade: (snapshot: MistakeEntry, answer: ReviewAnswer) => { before: MistakeEntry; after: MistakeEntry };
  /** Passed by App for the old review; this one grades from the snapshot it was given, so it is unused. */
  onReload?: (id: string) => MistakeEntry | undefined;
}

/** Signed links for the photos attached to a manual card; empty until loaded, `failed` when they cannot be opened. */
function usePhotos(ids: string[] | undefined) {
  const key = ids?.join(',') ?? '';
  const [state, setState] = useState<{ key: string; images: Array<{ id: string; url: string }>; failed: boolean }>({ key: '', images: [], failed: false });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    sourceImageUrls(key.split(',')).then(images => { if (!cancelled) setState({ key, images, failed: false }); })
      .catch(() => { if (!cancelled) setState({ key, images: [], failed: true }); });
    return () => { cancelled = true; };
  }, [key]);
  const mine = state.key === key;
  return { images: mine ? state.images : [], failed: mine && state.failed, loading: Boolean(key) && !mine };
}

/**
 * Reviewing due mistakes on phones (design/previews/mock-phone-notebook.html): one question full screen, four big options,
 * Sóc's explanation, then "Vẫn chưa chắc" or "Hiểu rồi" with the grading of the computer ReviewSession.
 */
export function ReviewPhone({ cards, onClose, onGrade }: Props) {
  const ref = useModalA11y(true, onClose);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ got: 0, again: 0 });
  const [error, setError] = useState('');
  const [fullOpen, setFullOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const done = index >= cards.length;
  const card = cards[Math.min(index, cards.length - 1)];
  const quiz = useMemo(() => card ? resolveQuizOptions(card) : null, [card]);
  const quizMode = Boolean(quiz && quiz.correctIndex >= 0 && quiz.options.length >= 2);
  const { question, context } = card ? readQuestion(card) : { question: '', context: '' };
  const answer = quiz && quiz.correctIndex >= 0 ? quiz.options[quiz.correctIndex].letter : '';
  const before = card ? getUserChoice(card) : '';
  const right = picked !== null && picked === answer;
  const photos = usePhotos(card?.sourceImageIds);
  // Text first: only a card with an attached photo and no reading text shows the photo in the passage box.
  const showPhoto = Boolean(card?.sourceImageIds?.length) && !context && card.part >= 6;
  const showPassage = card ? card.part >= 6 && (Boolean(context) || showPhoto) : false;

  const pick = (letter: string) => { if (!revealed) { setPicked(letter); setRevealed(true); } };
  const grade = (understood: boolean) => {
    if (!card) return;
    try {
      onGrade(card, understood ? (right || picked === null ? 'GOOD' : 'HARD') : 'AGAIN');
      setTally(t => understood ? { ...t, got: t.got + 1 } : { ...t, again: t.again + 1 });
      setIndex(i => i + 1); setPicked(null); setRevealed(false); setError(''); setFullOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được lịch ôn.'); }
  };

  if (done) {
    return createPortal(
      <div ref={ref} className="rd pr" role="dialog" aria-modal="true" aria-label="Ôn xong" tabIndex={-1}>
        <div className="pr-done">
          <Soc state="cheerC" size={150} />
          <h2>Xong {cards.length} câu!</h2>
          <p>Hiểu rồi <b>{tally.got}</b> · Ôn lại ngày mai <b>{tally.again}</b>. Hôm nay đã tính vào chuỗi ngày.</p>
        </div>
        <div className="pr-bot"><button type="button" className="pr-btn pr-btn--go" onClick={onClose}>Về Sổ tay</button></div>
      </div>, document.body);
  }

  const ex = card.explanation;
  const why = ex?.analysis || card.trapTip || '';
  const chip = categoryChip(card.category);
  const partColor = PART_COLORS[card.part] ?? '#7c5ce0';
  const meta = (
    <>
      <span className="pr-chip" style={{ background: partColor, color: '#fff' }}>Part {card.part}{card.questionNumber ? ` · câu ${card.questionNumber}` : ''}</span>
      {chip && <span className="pr-chip" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>}
    </>
  );

  return createPortal(
    <div ref={ref} className="rd pr" role="dialog" aria-modal="true" aria-label="Ôn câu sai" tabIndex={-1}>
      <div className="pr-top">
        <button type="button" className="pr-x" aria-label="Thoát ôn tập" onClick={onClose}>×</button>
        <span className="pr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={index}><i style={{ width: `${(index + (revealed ? 0.5 : 0)) / cards.length * 100}%` }} /></span>
        <small>{index + 1}/{cards.length}</small>
      </div>

      <div className="pr-main">
        {showPassage ? (
          <PassageBox key={card.id} card={card} context={context} short={revealed} photo={showPhoto ? photos : null} meta={meta}
            onFull={() => setFullOpen(true)} onZoom={() => setZoom(true)} />
        ) : (
          <div className="pr-meta">{meta}</div>
        )}
        {!showPassage && context && <p className="pr-ctx">{context}</p>}
        {question && <h3 className={'pr-q' + (showPassage ? ' is-sm' : '')}>{question}</h3>}

        {quizMode && quiz ? (
          <div className="pr-opts" role="group" aria-label="Chọn đáp án">
            {quiz.options.map(o => {
              const isAns = o.letter === answer, isPick = o.letter === picked;
              const cls = !revealed ? '' : isAns ? ' is-ok' : isPick ? ' is-bad' : ' is-dim';
              return (
                <button key={o.letter} type="button" className={'pr-opt' + cls} disabled={revealed} onClick={() => pick(o.letter)}>
                  <em>{o.letter}</em><span>{o.text}</span>
                  {revealed && isAns && <small>{isPick ? 'đúng rồi' : 'đáp án'}</small>}
                  {revealed && isPick && !isAns && <small>bạn chọn</small>}
                </button>
              );
            })}
          </div>
        ) : revealed ? (
          <div className="pr-plain"><b>Đáp án:</b> {card.correctAnswer}</div>
        ) : (
          <button type="button" className="pr-btn pr-btn--white" onClick={() => setRevealed(true)}>Xem đáp án</button>
        )}

        {revealed ? (
          <div className="pr-why">
            <Soc state={right ? 'cheerC' : 'idle'} size={56} />
            <div>
              <p>{right ? <><b>Lần này đúng rồi!</b>{before && before !== answer ? ` Lần trước bạn chọn (${before}).` : ''} </> : null}{why || (right ? '' : `Đáp án là (${answer || card.correctAnswer}).`)}</p>
              {showPassage && ex?.evidence?.trim() && <span className="pr-quote">“{ex.evidence.trim().replace(/^["“”]|["“”]$/g, '')}”</span>}
            </div>
          </div>
        ) : (
          <div className="pr-hint"><Soc state="focus" size={52} /><span>{before ? `Lần trước bạn chọn (${before}). Thử lại nhé!` : 'Thử chọn lại, Sóc đợi nhé!'}</span></div>
        )}
        {error && <p role="alert" className="pr-err">{error}</p>}
      </div>

      {revealed && (
        <div className="pr-bot">
          <button type="button" className="pr-btn pr-btn--white" onClick={() => grade(false)}>Vẫn chưa chắc</button>
          <button type="button" className="pr-btn pr-btn--go" onClick={() => grade(true)}>Hiểu rồi</button>
        </div>
      )}

      {fullOpen && showPassage && !showPhoto && (
        <FullPassage card={card} context={context} onClose={() => setFullOpen(false)} />
      )}
      {zoom && photos.images.length > 0 && <PhoneImageViewer images={photos.images} onClose={() => setZoom(false)} />}
    </div>, document.body);
}

/** Fixed-height box: the reading text scrolled to the highlighted sentence, or the attached photo. It shrinks after the answer. */
function PassageBox({ card, context, short, photo, meta, onFull, onZoom }: {
  card: MistakeEntry; context: string; short: boolean; photo: ReturnType<typeof usePhotos> | null; meta: React.ReactNode; onFull: () => void; onZoom: () => void;
}) {
  const range = useMemo(() => findFocus(context, { part: card.part, number: card.questionNumber, evidence: card.explanation?.evidence }), [card, context]);
  const parts = splitFocus(context, range);
  const box = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLElement>(null);
  const siblings = useMemo(() => groupLabel(groupNumbers(card, loadMistakes())), [card]);
  const center = () => {
    const el = box.current, hl = mark.current;
    if (!el || !hl) return;
    el.scrollTop = Math.max(0, hl.offsetTop - (el.clientHeight - hl.offsetHeight) / 2);
  };
  useLayoutEffect(center, [short, parts.focus]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(center);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={'pr-psg' + (short ? ' is-short' : '')} aria-label="Đoạn văn">
      <div className="pr-phd">{meta}{photo ? <span className="pr-src">Ảnh bạn đính kèm</span> : siblings && <span className="pr-grp">{siblings}</span>}</div>
      {photo ? (
        <div className="pr-shot">
          {photo.images[0] ? <img src={photo.images[0].url} alt="Ảnh bạn đính kèm" /> : <p>{photo.failed ? 'Chưa mở được ảnh. Hãy đăng nhập đồng bộ rồi thử lại.' : 'Đang tải ảnh…'}</p>}
          {photo.images.length > 0 && <button type="button" className="pr-zoom" onClick={onZoom}>⤢ Phóng to</button>}
        </div>
      ) : (
        <>
          <div className="pr-ptx" ref={box} tabIndex={0} aria-label="Đoạn văn của câu này">
            <p>{parts.before}{parts.focus && <mark ref={mark}>{parts.focus}</mark>}{parts.after}</p>
          </div>
          <button type="button" className="pr-more" onClick={onFull}>Xem cả đoạn ⌄</button>
        </>
      )}
    </section>
  );
}

/** Sheet with the whole passage, the highlight kept, and the numbers of the questions that share it. */
function FullPassage({ card, context, onClose }: { card: MistakeEntry; context: string; onClose: () => void }) {
  const range = useMemo(() => findFocus(context, { part: card.part, number: card.questionNumber, evidence: card.explanation?.evidence }), [card, context]);
  const parts = splitFocus(context, range);
  const numbers = useMemo(() => groupNumbers(card, loadMistakes()), [card]);
  const mark = useRef<HTMLElement>(null);
  useEffect(() => { mark.current?.scrollIntoView({ block: 'center' }); }, []);
  return (
    <PhoneSheet title={`Đoạn văn · câu ${groupLabel(numbers) || card.questionNumber || ''}`.trim()} onClose={onClose}>
      <p className="pr-full">{parts.before}{parts.focus && <mark ref={mark}>{parts.focus}</mark>}{parts.after}</p>
      {numbers.length > 0 && (
        <div className="pr-nums">Câu trong nhóm:
          {numbers.map(n => <span key={n} className={n === card.questionNumber ? 'is-me' : ''}>{n}</span>)}
        </div>
      )}
    </PhoneSheet>
  );
}
