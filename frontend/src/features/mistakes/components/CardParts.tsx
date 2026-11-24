import { Fragment, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EvidenceNote, KeyWord } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { markPassage, quotedParts, type MarkedBlock, type OptionRow } from '@/features/mistakes/lib/cardDetail';
import './card-detail.css';

/** Pieces of the card detail (design/previews/card-v2) shared by the desktop columns and the phone tabs. */

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className={open ? 'is-open' : undefined}>
    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * A–D rows. The chosen and correct options show their one-line reason; the others keep it behind an explicit
 * "Vì sao" button. `reasonOnly` (reading questions) shows the reason alone when there is one, the meaning otherwise.
 */
export function OptionRows({ rows, reasonOnly = false, showPos = false }: { rows: OptionRow[]; reasonOnly?: boolean; showPos?: boolean }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const id = useId();
  const line = (row: OptionRow) => reasonOnly && row.reason
    ? <>{row.reason}</>
    : <>{row.meaning && <b>{row.meaning}</b>}{row.meaning && row.reason ? ' — ' : ''}{row.reason}</>;
  return (
    <ol className="cd-opts">
      {rows.map(row => {
        const has = Boolean(row.meaning || row.reason);
        const toggle = row.role === '' && has;
        const shown = has && (row.role !== '' || open.has(row.letter));
        const whyId = `${id}-${row.letter}`;
        return (
          <li key={row.letter || row.text} className={'cd-opt' + (row.role ? ` is-${row.role}` : '')}>
            <div className="cd-ot">
              <span className="cd-lt" aria-hidden="true">{row.letter}</span>
              <span className="cd-tx"><span className="sr-only">{row.letter}. </span>{row.text}{showPos && row.pos ? <em className="cd-pos">{row.pos}</em> : null}</span>
              {row.role === 'pick' && <small className="cd-tag">bạn chọn</small>}
              {row.role === 'ans' && <small className="cd-tag">đáp án</small>}
              {toggle && (
                <button type="button" className="cd-ask" aria-expanded={open.has(row.letter)} aria-controls={whyId}
                  aria-label={`Vì sao ${row.letter}`}
                  onClick={() => setOpen(current => { const next = new Set(current); if (next.has(row.letter)) next.delete(row.letter); else next.add(row.letter); return next; })}>
                  Vì sao <Chevron open={open.has(row.letter)} />
                </button>
              )}
            </div>
            {shown && <p className="cd-why" id={whyId}>{line(row)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function TipBlock({ tip, size = 54 }: { tip: string; size?: number }) {
  return <div className="cd-tip"><Soc state="idle" size={size} /><p><b>Mẹo nhanh:</b> <span>{tip}</span></p></div>;
}

export function SignalBlock({ text }: { text: string }) {
  return (
    <div className="cd-sign">
      <small>Dấu hiệu</small>
      <p>{quotedParts(text).map((part, index) => part.quoted ? <b key={index}>{part.text}</b> : <Fragment key={index}>{part.text}</Fragment>)}</p>
    </div>
  );
}

/** "Từ cần nhớ" rows; "+ Ôn" keeps the word on the card and turns into "Đã lưu" (tap again to unsave). */
export function WordRows({ words, isSaved, onSave, onToggle, all = false }: { words: KeyWord[]; isSaved: (word: string) => boolean; onSave: (words: string[]) => void; onToggle?: (word: string) => void; all?: boolean }) {
  const unsaved = words.filter(item => !isSaved(item.word));
  return (
    <div className="cd-wd">
      <ul className="cd-words" aria-label="Từ cần nhớ">
        {words.map(item => {
          const saved = isSaved(item.word);
          const canUntoggle = Boolean(onToggle);
          return (
            <li key={item.word}>
              <span className="cd-wm"><b lang="en">{item.word}</b><em>{item.meaning}</em></span>
              <button type="button" className={saved ? 'is-saved' : undefined} disabled={saved && !canUntoggle}
                aria-pressed={saved}
                aria-label={saved ? (canUntoggle ? `Bỏ lưu ${item.word}` : `Đã lưu ${item.word}`) : `Ôn từ ${item.word}`}
                title={saved && canUntoggle ? 'Bấm để bỏ lưu' : undefined}
                onClick={() => (onToggle ? onToggle(item.word) : onSave([item.word]))}>{saved ? 'Đã lưu' : '+ Ôn'}</button>
            </li>
          );
        })}
      </ul>
      {all && unsaved.length > 1 && <button type="button" className="cd-allw" onClick={() => onSave(unsaved.map(item => item.word))}>+ Ôn cả {unsaved.length} từ</button>}
    </div>
  );
}

/**
 * The passage with every evidence sentence highlighted where it is (any passage of a double/triple set) and its
 * Vietnamese translation right under it. The scroll box starts at the first evidence; with two or more,
 * "Bằng chứng 1/2 ›" steps through them.
 */
export function useEvidenceJump(count: number, key: string) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = useCallback((index: number, onlyIfHidden = false) => {
    const container = box.current;
    const mark = container?.querySelector<HTMLElement>(`[data-ev="${index}"]`);
    setAt(index);
    if (!container || !mark) return;
    const outer = container.getBoundingClientRect(), inner = mark.getBoundingClientRect();
    // Opening the card keeps the passage at its start (labels in view) when the first evidence is already on screen.
    if (onlyIfHidden && inner.top >= outer.top && inner.bottom <= outer.bottom - 40) return;
    container.scrollTop = Math.max(0, inner.top - outer.top + container.scrollTop - 56);
  }, []);
  useLayoutEffect(() => { if (count > 0) go(0, true); }, [count, key, go]);
  return { box, at, next: () => go(count ? (at + 1) % count : 0) };
}

export function EvidenceJumper({ at, count, onNext }: { at: number; count: number; onNext: () => void }) {
  if (count < 2) return null;
  return <button type="button" className="cd-jump" onClick={onNext} aria-label={`Bằng chứng ${at + 1} trên ${count}, sang bằng chứng tiếp theo`}>
    Bằng chứng {at + 1}/{count} <span aria-hidden="true">›</span>
  </button>;
}

export function EvidencePassage({ context, evidences, at, marked }: { context: string; evidences: readonly EvidenceNote[]; at: number; marked?: { blocks: MarkedBlock[]; count: number } }) {
  const computed = useMemo(() => marked ?? markPassage(context, evidences), [marked, context, evidences]);
  const { blocks } = computed;
  return (
    <div className="psg cd-psg" lang="en">
      {blocks.map((block, index) => block.kind === 'label'
        ? <p key={index} className="psg-label" lang="vi">{block.text}</p>
        : block.kind === 'table'
          ? <div key={index} className="psg-tw"><table className="psg-table">
              <thead>
                <tr className={block.headerOrder !== undefined ? 'cd-ev-row' + (block.headerOrder === at ? ' is-at' : '') : undefined} data-ev={block.headerOrder}>
                  {block.header.map((cell, column) => <th key={column} scope="col">{cell}</th>)}
                </tr>
                {block.headerTranslation ? <tr className="cd-ev-tr"><td colSpan={block.header.length} lang="vi">{block.headerTranslation}</td></tr> : null}
              </thead>
              <tbody>{block.rows.map((row, line) => (
                <Fragment key={line}>
                  <tr className={row.order !== undefined ? 'cd-ev-row' + (row.order === at ? ' is-at' : '') : undefined} data-ev={row.order}>
                    {block.header.map((_, column) => <td key={column}>{row.cells[column] ?? ''}</td>)}
                  </tr>
                  {row.translation ? <tr className="cd-ev-tr"><td colSpan={block.header.length} lang="vi">{row.translation}</td></tr> : null}
                </Fragment>
              ))}</tbody>
            </table></div>
          : <p key={index} className="psg-text">{block.segments.map((segment, part) => segment.kind === 'text'
              ? <Fragment key={part}>{segment.text}</Fragment>
              : <Fragment key={part}>
                  <mark className={'cd-ev' + (segment.order === at ? ' is-at' : '')} data-ev={segment.order}>{segment.text}</mark>
                  {segment.translation && <span className="cd-ev-vi" lang="vi">{segment.translation}</span>}
                </Fragment>)}
            </p>)}
    </div>
  );
}
