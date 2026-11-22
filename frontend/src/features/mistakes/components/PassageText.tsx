import type { ReactNode } from 'react';
import { parsePassage } from '@/features/mistakes/lib/passageText';
import './passage.css';

/** A passage as the learner saw it: "Đoạn 1 — Email" labels, paragraphs and simple tables. */
export function PassageText({ text, className = '', renderText }: {
  text: string;
  className?: string;
  /** Wraps each paragraph, e.g. to highlight the evidence. */
  renderText?: (text: string) => ReactNode;
}) {
  return <div className={`psg ${className}`.trim()}>
    {parsePassage(text).map((block, index) => block.kind === 'label'
      ? <p key={index} className="psg-label">{block.text}</p>
      : block.kind === 'table'
        ? <div key={index} className="psg-tw"><table className="psg-table">
            <thead><tr>{block.header.map((cell, column) => <th key={column} scope="col">{cell}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, line) => <tr key={line}>{block.header.map((_, column) => <td key={column}>{row[column] ?? ''}</td>)}</tr>)}</tbody>
          </table></div>
        : <p key={index} className="psg-text">{renderText ? renderText(block.text) : block.text}</p>)}
  </div>;
}
