import type { MistakeEntry } from '@/shared/types';
import type { MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { fitsSyncPayload, matchesExplanationCard, mergeExplanation } from '@/features/mistakes/lib/explanationMerge';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { loadMistakes, updateMistakes } from '@/shared/data/storage';
import { ApiRequestError } from '@/shared/api/api';
// A namespace import: tests replace this module with a smaller one, and a missing named export must not break the app.
import * as aiService from './aiMistakeExtractor';
import type { AIMistakeParseResult } from './aiMistakeExtractor';

/**
 * Writes the explanations for questions read from a screenshot, after the reading has returned.
 * One batch runs at a time; later ones wait. Each card's ticket is kept on this device for 24 hours so an
 * explanation that never arrived (app closed, network lost) can be asked for again without a new AI use.
 */
export interface ExplainItem { cardId: string; number: number; input: MistakeInput }
interface StoredTicket { ticket: string; number: number; input: MistakeInput; expires: number; owner: string | null }

const STORAGE_KEY = 'toeic_explain_tickets_v1';
export const MISTAKES_CHANGED_EVENT = 'toeic:mistakes-changed';
const pending = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let chain: Promise<void> = Promise.resolve();
/** While the detail flow is open, it takes explanations for cards it has not saved yet. */
let interceptor: ((cardId: string, draft: AIMistakeParseResult, originalInput: MistakeInput) => boolean) | null = null;

const notify = () => { version += 1; listeners.forEach(listener => listener()); };
export const subscribeExplanations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const explanationsVersion = () => version;
export const isExplaining = (cardId: string) => pending.has(cardId);
export function setExplanationInterceptor(value: typeof interceptor) { interceptor = value; }

function readTickets(): Record<string, StoredTicket> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, StoredTicket>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && entry.expires > now));
  } catch { return {}; }
}
function writeTickets(value: Record<string, StoredTicket>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* retries then cost a new use */ }
}
function ticketExpiry(ticket: string): number {
  try {
    const body = ticket.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(body + '='.repeat((4 - body.length % 4) % 4))).e) * 1000 || 0;
  } catch { return 0; }
}

/** A free retry is possible for this card (its ticket is still valid on this device). */
export function canRetryFree(cardId: string): boolean {
  const entry = readTickets()[cardId];
  const card = loadMistakes().find(value => value.id === cardId);
  return Boolean(entry && entry.owner === getActiveAccountId() && card && !card.explanation && !card.trapTip?.trim() && matchesExplanationCard(card, entry.input));
}

function applyToStorage(item: ExplainItem, draft: AIMistakeParseResult): boolean {
  let stored = false;
  updateMistakes(current => current.map(card => {
    if (card.id !== item.cardId || card.explanation || card.trapTip?.trim() || !matchesExplanationCard(card, item.input)) return card;
    const merged = mergeExplanation(card as MistakeEntry, draft);
    // The sync API validates the entire UTF-8 payload, including metadata added by storage.
    if (!fitsSyncPayload(merged)) return card;
    stored = true;
    return merged;
  }));
  if (stored) window.dispatchEvent(new Event(MISTAKES_CHANGED_EVENT));
  return stored;
}

function run(ticket: string, items: ExplainItem[], owner: string | null) {
  items.forEach(item => pending.set(item.cardId, (pending.get(item.cardId) ?? 0) + 1)); notify();
  chain = chain.then(async () => {
    try {
      // A batch may have waited behind another account's request. Never dispatch it under a new session.
      if (getActiveAccountId() !== owner) return;
      const result = await aiService.explainBatchWithAI(ticket, items.map(({ number, input }) => ({ number, input })), owner);
      // An explanation that arrives after switching accounts belongs to the other account's cards; drop it.
      if (getActiveAccountId() !== owner) return;
      const tickets = readTickets();
      for (const { number, draft } of result.items) {
        const item = items.find(entry => entry.number === number);
        if (!item) continue;
        // Empty/invalid drafts cannot consume the only path to a free retry.
        if (!draft.explanation?.quickTip?.trim()) continue;
        const accepted = interceptor?.(item.cardId, draft, item.input) || applyToStorage(item, draft);
        if (accepted && tickets[item.cardId]?.ticket === ticket) delete tickets[item.cardId];
      }
      for (const retry of result.retry ?? []) {
        if (retry.status !== 'exhausted') continue;
        const item = items.find(entry => entry.number === retry.number);
        if (item && tickets[item.cardId]?.ticket === ticket) delete tickets[item.cardId];
      }
      writeTickets(tickets);
    } catch (error) {
      if (getActiveAccountId() !== owner) return;
      // Permission changes and transport errors can recover; an invalid ticket cannot.
      if (error instanceof ApiRequestError && error.code?.startsWith('EXPLAIN_TICKET_')) {
        const tickets = readTickets();
        for (const item of items) if (tickets[item.cardId]?.ticket === ticket) delete tickets[item.cardId];
        writeTickets(tickets);
      }
    }
    finally {
      items.forEach(item => {
        const remaining = (pending.get(item.cardId) ?? 1) - 1;
        if (remaining) pending.set(item.cardId, remaining); else pending.delete(item.cardId);
      });
      notify();
    }
  });
}

/** Queue explanations for cards just read from a screenshot. */
export function enqueueExplanations(ticket: string, items: ExplainItem[]) {
  if (!items.length) return;
  const owner = getActiveAccountId(), expires = ticketExpiry(ticket);
  // Callers edit their form state independently while this batch waits/runs.
  const snapshot = items.map(item => ({ ...item, input: { ...item.input, options: [...item.input.options] } }));
  const tickets = readTickets();
  for (const item of snapshot) tickets[item.cardId] = { ticket, number: item.number, input: item.input, expires, owner };
  writeTickets(tickets);
  run(ticket, snapshot, owner);
}

/** Ask again for a card whose explanation never arrived; false when its ticket is gone (a new AI use is needed). */
export function retryExplanation(cardId: string): boolean {
  const entry = readTickets()[cardId];
  if (!entry || !canRetryFree(cardId) || pending.has(cardId)) return false;
  run(entry.ticket, [{ cardId, number: entry.number, input: entry.input }], entry.owner);
  return true;
}
