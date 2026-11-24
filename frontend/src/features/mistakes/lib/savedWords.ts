import type { KeyWord, MistakeEntry } from '@/shared/types';

/**
 * Words the learner kept with "+ Ôn" from a card's "Từ cần nhớ". There is no per-word store yet (the vocabulary log
 * only counts words per day), so each card keeps the words saved from it in `savedWords`: it syncs and backs up with
 * the card, and the list of saved words is read back from all cards. No spaced repetition for words yet.
 */
export const MAX_SAVED_WORDS = 20;

export const wordKey = (word: string) => word.replace(/\s+/g, ' ').trim().toLowerCase();

export function isWordSaved(m: Pick<MistakeEntry, 'savedWords'>, word: string): boolean {
  const key = wordKey(word);
  return Boolean(key) && (m.savedWords ?? []).includes(key);
}

/** The card with these words added (each once, lower-case, at most MAX_SAVED_WORDS); the same card when nothing is new. */
export function withSavedWords<T extends MistakeEntry>(m: T, words: readonly string[]): T {
  const saved = [...(m.savedWords ?? [])];
  for (const word of words) {
    const key = wordKey(word).slice(0, 80);
    if (key && !saved.includes(key) && saved.length < MAX_SAVED_WORDS) saved.push(key);
  }
  return saved.length === (m.savedWords?.length ?? 0) ? m : { ...m, savedWords: saved };
}

/** The card with one word removed; returns the same card when that word was not saved on it. */
export function withoutSavedWord<T extends MistakeEntry>(m: T, word: string): T {
  const key = wordKey(word).slice(0, 80);
  if (!key || !(m.savedWords ?? []).includes(key)) return m;
  const saved = (m.savedWords ?? []).filter(item => item !== key);
  return { ...m, savedWords: saved.length ? saved : undefined };
}

/** Toggles one word on the card (adds when missing, removes when already saved). */
export function toggleSavedWord<T extends MistakeEntry>(m: T, word: string): T {
  return isWordSaved(m, word) ? withoutSavedWord(m, word) : withSavedWords(m, [word]);
}

export interface SavedWord extends KeyWord { cardId: string; part: MistakeEntry['part']; questionNumber?: number }

/** Every saved word across live cards, newest card first, each word once, with the meaning its card gives. */
export function savedVocabulary(mistakes: readonly MistakeEntry[]): SavedWord[] {
  const seen = new Set<string>();
  const list: SavedWord[] = [];
  for (const m of [...mistakes].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))) {
    if (m.deletedAt) continue;
    for (const key of m.savedWords ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      const row = m.explanation?.words?.find(item => wordKey(item.word) === key);
      list.push({ word: row?.word.trim() ?? key, meaning: row?.meaning.trim() ?? '', cardId: m.id, part: m.part, questionNumber: m.questionNumber });
    }
  }
  return list;
}
