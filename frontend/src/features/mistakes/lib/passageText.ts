/**
 * Part 6/7 passages are kept as labelled text (no stored images): a line "Đoạn 1 — Email" opens each
 * passage and tables are Markdown rows ("| Item | Qty |" then "|---|---|"). Plain text passes through.
 */
export type PassageBlock =
  | { kind: 'label'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] };

const LABEL = /^Đoạn\s+\d+\s*[—–-]\s*\S.*$/u;
const ROW = /^\s*\|.*\|\s*$/;
const DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

export function parsePassage(text: string): PassageBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: PassageBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const value = buffer.join('\n').trim();
    if (value) blocks.push({ kind: 'text', text: value });
    buffer = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (LABEL.test(line.trim())) { flush(); blocks.push({ kind: 'label', text: line.trim() }); continue; }
    if (ROW.test(line) && index + 1 < lines.length && DIVIDER.test(lines[index + 1])) {
      flush();
      const header = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && ROW.test(lines[index])) rows.push(cells(lines[index++]));
      index--;
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}
