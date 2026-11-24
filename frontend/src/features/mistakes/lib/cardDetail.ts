import type { EvidenceNote, KeyWord, MistakeEntry, OptionNote } from '@/shared/types';
import { parsePassage } from './passageText';
import { findFocus } from './passageFocus';
import { analysisLines } from './analysisLines';
import { getUserChoice, optionLetter } from './userChoice';

/**
 * Data for the card detail (design/previews/card-v2): option rows with their one-line reasons, the evidence
 * sentences placed in the passage (any passage of a double/triple set), the "Dấu hiệu" line and the word rows.
 */

export interface OptionRow {
  letter: string;
  text: string;
  pos: OptionNote['pos'];
  meaning: string;
  reason: string;
  role: 'ans' | 'pick' | '';
}

export function optionRows(m: MistakeEntry): OptionRow[] {
  const answer = optionLetter(m.correctAnswer);
  const chosen = getUserChoice(m);
  return (m.options ?? []).map(option => {
    const letter = optionLetter(option);
    const note = m.optionNotes?.find(value => value.label === letter);
    const role = letter && letter === answer ? 'ans' : letter && letter === chosen ? 'pick' : '';
    return { letter, text: option.replace(/^\s*\([A-D]\)\s*/i, ''), pos: note?.pos ?? '', meaning: note?.meaning?.trim() ?? '', reason: note?.reason?.trim() ?? '', role };
  });
}

const CHAR_CLASS: Record<string, string> = {
  '"': '["“”]', '“': '["“”]', '”': '["“”]',
  "'": "['‘’]", '‘': "['‘’]", '’': "['‘’]",
  '-': '[-–—−]', '–': '[-–—−]', '—': '[-–—−]', '−': '[-–—−]',
  '|': '\\s*\\|\\s*'
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where `needle` sits in `text`, ignoring case, spacing, dashes, table pipes and curly/straight quotes; null when it is not there. */
export function looseFind(text: string, needle: string): { start: number; end: number } | null {
  const cleaned = needle.trim().replace(/^["“”']+|["“”']+$/g, '').replace(/^\s*\||\|\s*$/g, '').replace(/\s*\|\s*/g, '|').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length || words.join(' ').length < 6) return null;
  const pattern = words.map(word => [...word].map(char => CHAR_CLASS[char] ?? escape(char)).join('')).join('\\s+');
  const match = new RegExp(pattern, 'i').exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * The evidence to mark for a card: the AI's evidence sentences when they are in the passage; for older cards the
 * Part 6 blank's sentence (with the sentence translation) or the single quoted evidence. Never a guess.
 */
export function cardEvidences(m: Pick<MistakeEntry, 'part' | 'context' | 'questionNumber' | 'explanation'>): EvidenceNote[] {
  const context = m.context?.trim() ?? '';
  if (!context) return [];
  const ex = m.explanation;
  const listed = (ex?.evidences ?? []).filter(item => item.text?.trim() && looseFind(context, item.text));
  if (listed.length) return listed;
  if (m.part === 6) {
    const range = findFocus(context, { part: 6, number: m.questionNumber });
    if (range) return [{ text: context.slice(range.start, range.end), translation: ex?.translation?.trim() || undefined }];
  }
  if (ex?.evidence?.trim()) {
    const range = findFocus(context, { part: m.part, evidence: ex.evidence });
    if (range) return [{ text: context.slice(range.start, range.end) }];
  }
  return [];
}

export type PassageSegment = { kind: 'text'; text: string } | { kind: 'mark'; text: string; order: number; translation: string };
export interface PassageRow { cells: string[]; order?: number; translation?: string }
export type MarkedBlock =
  | { kind: 'label'; text: string }
  | { kind: 'text'; segments: PassageSegment[] }
  | { kind: 'table'; header: string[]; headerOrder?: number; headerTranslation?: string; rows: PassageRow[] };

const normLabel = (value: string) => value.trim().toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ');
function matchesSection(blockLabel: string, wanted?: string): boolean {
  const a = normLabel(blockLabel);
  const b = normLabel(wanted ?? '');
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * The passage cut into blocks with each evidence marked where it is found, numbered in reading order (0, 1, …), so
 * the first one can be scrolled to and "Bằng chứng 1/2 ›" can step through them. Honors `passageLabel` first before
 * falling back across passages; searches table headers as well as rows. An evidence found nowhere is left out.
 */
export function markPassage(context: string, evidences: readonly EvidenceNote[]): { blocks: MarkedBlock[]; count: number } {
  const parsed = parsePassage(context);
  const blockLabels: string[] = [];
  let activeLabel = '';
  for (const block of parsed) {
    if (block.kind === 'label') activeLabel = block.text;
    blockLabels.push(activeLabel);
  }

  const placed = new Set<number>();
  const textMatches = new Map<number, Array<{ start: number; end: number; index: number }>>();
  const tableHeaderMatch = new Map<number, number>();
  const tableRowMatch = new Map<string, number>();

  const tryPlace = (evidenceIndex: number, item: EvidenceNote, strictLabel: boolean) => {
    for (let b = 0; b < parsed.length; b += 1) {
      const block = parsed[b];
      if (block.kind === 'label') continue;
      if (strictLabel && !matchesSection(blockLabels[b], item.passageLabel)) continue;
      if (block.kind === 'table') {
        const headerLine = block.header.join(' | ');
        if (!tableHeaderMatch.has(b) && (looseFind(headerLine, item.text) || block.header.some(cell => looseFind(cell, item.text)))) {
          tableHeaderMatch.set(b, evidenceIndex);
          placed.add(evidenceIndex);
          return;
        }
        for (let r = 0; r < block.rows.length; r += 1) {
          const key = `${b}:${r}`;
          if (tableRowMatch.has(key)) continue;
          const cells = block.rows[r];
          const line = cells.join(' | ');
          if (looseFind(line, item.text) || cells.some(cell => looseFind(cell, item.text))) {
            tableRowMatch.set(key, evidenceIndex);
            placed.add(evidenceIndex);
            return;
          }
        }
      } else {
        const range = looseFind(block.text, item.text);
        const existing = textMatches.get(b) ?? [];
        if (range && !existing.some(other => range.start < other.end && other.start < range.end)) {
          existing.push({ ...range, index: evidenceIndex });
          textMatches.set(b, existing);
          placed.add(evidenceIndex);
          return;
        }
      }
    }
  };

  evidences.forEach((item, i) => { if (item.passageLabel?.trim()) tryPlace(i, item, true); });
  evidences.forEach((item, i) => { if (!placed.has(i)) tryPlace(i, item, false); });

  let order = 0;
  const blocks = parsed.map((block, b): MarkedBlock => {
    if (block.kind === 'label') return block;
    if (block.kind === 'table') {
      const hIndex = tableHeaderMatch.get(b);
      const headerOrder = hIndex !== undefined ? order++ : undefined;
      const headerTranslation = hIndex !== undefined ? (evidences[hIndex].translation?.trim() ?? '') : undefined;
      const rows = block.rows.map((cells, r): PassageRow => {
        const rIndex = tableRowMatch.get(`${b}:${r}`);
        if (rIndex === undefined) return { cells };
        return { cells, order: order++, translation: evidences[rIndex].translation?.trim() ?? '' };
      });
      return { kind: 'table', header: block.header, ...(headerOrder !== undefined ? { headerOrder, headerTranslation } : {}), rows };
    }
    const found = (textMatches.get(b) ?? []).sort((a, bRange) => a.start - bRange.start);
    const segments: PassageSegment[] = [];
    let cursor = 0;
    for (const range of found) {
      if (range.start > cursor) segments.push({ kind: 'text', text: block.text.slice(cursor, range.start) });
      segments.push({ kind: 'mark', text: block.text.slice(range.start, range.end), order: order++, translation: evidences[range.index].translation?.trim() ?? '' });
      cursor = range.end;
    }
    if (cursor < block.text.length) segments.push({ kind: 'text', text: block.text.slice(cursor) });
    return { kind: 'text', segments };
  });
  return { blocks, count: order };
}

/** The "Dấu hiệu: …" line the explanation starts with (a format the AI is asked for), without its label. */
export function signalLine(analysis?: string): string {
  const line = analysisLines(analysis ?? '').find(value => /^dấu hiệu\s*:/i.test(value));
  return line ? line.replace(/^dấu hiệu\s*:\s*/i, '').trim() : '';
}

/** A signal line cut so that quoted words ('still', “ask about a refund”) can be shown highlighted, quotes removed. */
export function quotedParts(text: string): Array<{ text: string; quoted: boolean }> {
  const parts: Array<{ text: string; quoted: boolean }> = [];
  const pattern = /(^|[\s(])['‘“"]([^'‘’“”"\n]{1,48})['’”"](?=[\s,.:;)!?=]|$)/g;
  let cursor = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index + match[1].length;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), quoted: false });
    parts.push({ text: match[2], quoted: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), quoted: false });
  return parts;
}

export function cardWords(m: Pick<MistakeEntry, 'explanation'>): KeyWord[] {
  return (m.explanation?.words ?? []).filter(item => item.word?.trim() && item.meaning?.trim());
}
