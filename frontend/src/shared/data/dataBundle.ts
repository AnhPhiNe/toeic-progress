import type { MistakeEntry, PacingRun, StudySession, UserProfile } from '@/shared/types';
import { normalizeMistakeRecord } from '@/shared/data/mistakeFields';
import { normalizeTestName } from '@/shared/domain/testNames';

export interface SyncMeta {
  updatedAt: string;
  deletedAt: string | null;
}

export interface VocabLog extends SyncMeta {
  id: string;
  date: string;
  count: number;
  sourceName?: string;
  parts?: number[];
}

export interface ShieldDay extends SyncMeta {
  id: string;
  date: string;
}

export interface DataBundle {
  schemaVersion: 3;
  profile: UserProfile & SyncMeta;
  sessions: Array<StudySession & SyncMeta>;
  mistakes: Array<MistakeEntry & SyncMeta>;
  pacingRuns: Array<PacingRun & SyncMeta>;
  vocabLog: VocabLog[];
  shieldDays: ShieldDay[];
}

/** Weekly plans and the exam checklist were retired: no screen, no sync. Older stored bundles still carry them. */
type WithRetired = DataBundle & { checklist?: unknown; weeklyPlans?: unknown };
function withoutRetired(bundle: WithRetired): DataBundle {
  const { checklist: _checklist, weeklyPlans: _weeklyPlans, ...current } = bundle;
  void _checklist;
  void _weeklyPlans;
  return current;
}

const BUNDLE_KEY = 'toeic_progress_bundle_v3';
const OLD_BUNDLE_KEY = 'toeic_progress_bundle_v2';
const OLD_PLANS_KEY = 'toeic_smart_weekly_plans_v1';
const ACTIVE_ACCOUNT_KEY = 'toeic_active_account_v1';
const accountKey = (userId: string) => `toeic_progress_account_${userId}_v3`;
let accountWriteEnabled = false;

export function setAccountWriteEnabled(enabled: boolean): void {
  accountWriteEnabled = enabled;
}

export function canWriteAccount(): boolean {
  return accountWriteEnabled && navigator.onLine;
}

export function nextUpdatedAt(previous?: string): string {
  const prior = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), Number.isFinite(prior) ? prior + 1 : 0)).toISOString();
}
const LEGACY_KEYS = {
  profile: 'toeic_990_profile_v1',
  sessions: 'toeic_990_sessions_v1',
  mistakes: 'toeic_990_mistakes_v1',
  pacingRuns: 'toeic_990_pacing_v1',
  // Retired; listed so an explicit reset still clears the old key.
  checklist: 'toeic_exam_checklist_v1'
} as const;

export function defaultProfile(): UserProfile {
  return {
    name: 'Học viên',
    // Placeholder only (the field is required, 10-990): goalChosen says the learner has not picked a goal yet,
    // so screens show "Chưa chọn" via shownGoal()/goalLabel() in features/today/lib/goalSetup.
    targetScore: 990,
    goalChosen: false,
    examDate: '',
    currentStreak: 0,
    longestStreak: 0,
    streakFreezes: 2,
    shieldAllowance: 2,
    lastStudyDate: '',
    dailyMinGoalMinutes: 30,
    motto: '',
    selectedSkill: 'LR'
  };
}

export function emptyBundle(): DataBundle {
  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
    sessions: [], mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: []
  };
}

function readLegacy<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // The original key stays untouched, so it can still be recovered manually.
    return fallback;
  }
}

function stamp<T extends object>(record: T, fallbackTime: string): T & SyncMeta {
  const value = record as T & Partial<SyncMeta>;
  return {
    ...record,
    updatedAt: value.updatedAt || fallbackTime,
    deletedAt: value.deletedAt || null
  };
}

function migrateLegacy(): DataBundle {
  const now = new Date().toISOString();
  const sessions = readLegacy<StudySession[]>(LEGACY_KEYS.sessions, []);
  const mistakes = readLegacy<MistakeEntry[]>(LEGACY_KEYS.mistakes, []);
  const pacingRuns = readLegacy<PacingRun[]>(LEGACY_KEYS.pacingRuns, []);
  return {
    schemaVersion: 3,
    profile: stamp((() => {
      const old = readLegacy<UserProfile>(LEGACY_KEYS.profile, defaultProfile());
      return { ...defaultProfile(), ...old, shieldAllowance: old.shieldAllowance ?? old.streakFreezes };
    })(), now),
    sessions: Array.isArray(sessions) ? sessions.map(item => stamp(item, item.createdAt || now)) : [],
    mistakes: Array.isArray(mistakes) ? mistakes.map(item => normalizeMistakeRecord(stamp(item, item.createdAt || now))) : [],
    pacingRuns: Array.isArray(pacingRuns) ? pacingRuns.map(item => stamp(item, item.createdAt || now)) : [],
    vocabLog: [],
    shieldDays: []
  };
}

export const ACCOUNT_CHANGED_EVENT = 'toeic:account-changed';

function notifyAccountChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
  }
}

export function getActiveAccountId(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export function activateAccount(userId: string): void {
  const previous = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
  if (previous !== userId) notifyAccountChanged();
}

export function deactivateAccount(): void {
  const previous = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  accountWriteEnabled = false;
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  if (previous !== null) notifyAccountChanged();
}

export function readGuestBundle(): DataBundle {
  const raw = localStorage.getItem(BUNDLE_KEY);
  if (raw) return parseStoredBundle(raw);
  const old = localStorage.getItem(OLD_BUNDLE_KEY);
  const migrated = old ? migrateV2(old, null) : migrateLegacy();
  localStorage.setItem(BUNDLE_KEY, JSON.stringify(migrated));
  return migrated;
}

export function readAccountBundle(userId: string): DataBundle | null {
  const raw = localStorage.getItem(accountKey(userId));
  if (raw) return parseStoredBundle(raw);
  const old = localStorage.getItem(`toeic_progress_account_${userId}_v2`);
  if (!old) return null;
  // Old plans were shared across accounts: migrate only to the active identity.
  const migrated = migrateV2(old, userId);
  writeAccountBundle(userId, migrated);
  return migrated;
}

function migrateV2(raw: string, ownerId: string | null): DataBundle {
  const parsed = JSON.parse(raw);
  if (parsed.schemaVersion !== 2) throw new Error('Phiên bản dữ liệu trên máy không được hỗ trợ.');
  void ownerId;
  return withoutRetired({ ...parsed, schemaVersion: 3, mistakes: parsed.mistakes.map(normalizeMistakeRecord) });
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
}

function writeJsonWithRollback(key: string, serialized: string): void {
  const previous = localStorage.getItem(key);
  try {
    localStorage.setItem(key, serialized);
  } catch (error) {
    // setItem replaces one key atomically; restore defensively for unusual browsers.
    if (localStorage.getItem(key) !== previous) {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }
    if (isQuotaError(error)) {
      throw new StorageWriteError('Bộ nhớ trình duyệt đã đầy nên thay đổi chưa được lưu. Hãy xuất bản sao lưu trong Cài đặt rồi xóa bớt dữ liệu cũ.', 'quota');
    }
    throw error;
  }
}

export function writeAccountBundle(userId: string, bundle: DataBundle): void {
  writeJsonWithRollback(accountKey(userId), JSON.stringify(compactDeletedRecords(bundle)));
}

/** Clear the browser's guest bundle once its data has been moved into a signed-in account. */
export function consumeTransferredGuestBundle(): void {
  clearRetiredCopies(null);
  try {
    localStorage.setItem(BUNDLE_KEY, JSON.stringify(emptyBundle()));
  } catch {
    localStorage.removeItem(BUNDLE_KEY);
  }
}

function parseStoredBundle(raw: string): DataBundle {
  const parsed = JSON.parse(raw) as WithRetired;
  if (parsed.schemaVersion !== 3) throw new Error('Phiên bản dữ liệu trên máy không được hỗ trợ.');
  return withoutRetired({ ...parsed, mistakes: parsed.mistakes.map(normalizeMistakeRecord) });
}

/** One localStorage write is the commit point. Retired keys are cleared only by explicit reset. */
export function readDataBundle(): DataBundle {
  const accountId = getActiveAccountId();
  if (accountId) return readAccountBundle(accountId) || emptyBundle();
  return readGuestBundle();
}

/** A save the learner should be told about: the account is not connected or browser storage is full. */
export class StorageWriteError extends Error {
  constructor(message: string, readonly reason: 'disconnected' | 'quota') {
    super(message);
    this.name = 'StorageWriteError';
  }
}

export function writeDataBundle(bundle: DataBundle): void {
  const accountId = getActiveAccountId();
  if (accountId && !canWriteAccount()) {
    throw new StorageWriteError('Tài khoản chưa kết nối xong nên lần lưu này chưa được ghi. Dữ liệu cũ vẫn an toàn trên máy; hãy lưu lại khi trạng thái báo đã đồng bộ.', 'disconnected');
  }
  const key = accountId ? accountKey(accountId) : BUNDLE_KEY;
  writeJsonWithRollback(key, JSON.stringify(compactDeletedRecords(bundle)));
  if (accountId) window.dispatchEvent(new CustomEvent('toeic:account-data-changed', { detail: accountId }));
}

export function updateDataBundle(update: (current: DataBundle) => DataBundle): DataBundle {
  const next = update(readDataBundle());
  writeDataBundle(next);
  return next;
}

export function live<T extends SyncMeta>(records: T[]): T[] {
  return records.filter(record => !record.deletedAt);
}
/** A note's source survives deletion of the study record it inherited that source from. */
export function retainedSessionSources(current: DataBundle, removed: ReadonlySet<string>): DataBundle['mistakes'] {
  const names = new Map(current.sessions.filter(session => !session.deletedAt && removed.has(session.id)).map(session => [session.id, normalizeTestName(session.testName ?? '')]));
  return current.mistakes.map(mistake => {
    const name = names.get(mistake.sessionId ?? '');
    if (mistake.deletedAt || typeof mistake.sourceTestName === 'string' || !name || name.length > 300) return mistake;
    return { ...mistake, sourceTestName: name, updatedAt: nextUpdatedAt(mistake.updatedAt) };
  });
}

/** Deleted records only need identity/version to prevent stale devices reviving them. */
export function compactDeletedRecords(bundle: DataBundle): DataBundle {
  const next = { ...bundle };
  for (const key of ['sessions','mistakes','pacingRuns','vocabLog','shieldDays'] as const) {
    (next as unknown as Record<string, unknown[]>)[key] = bundle[key].map(record => record.deletedAt
      ? { id: record.id, updatedAt: record.updatedAt, deletedAt: record.deletedAt } : record);
  }
  return next;
}

/** Clear retired copies only for the scope the user explicitly reset. */
export function clearRetiredCopies(userId: string | null): void {
  // Explicit reset must also forget local unsaved work and derived AI reports for this scope.
  const draftPrefix = `toeic_form_draft_v1:${encodeURIComponent(userId ?? 'guest')}:`;
  const draftKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(draftPrefix)) draftKeys.push(key);
  }
  for (const key of draftKeys) localStorage.removeItem(key);
  if (userId) {
    localStorage.removeItem(`toeic_attempt_advice_${userId}_v1`);
    localStorage.removeItem(`toeic_attempt_advice_${userId}_v2`);
  }
  const rawTickets = localStorage.getItem('toeic_explain_tickets_v1');
  if (rawTickets) {
    try {
      const parsed = JSON.parse(rawTickets) as Record<string, { owner?: string | null }>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const kept = Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry?.owner !== userId));
        if (Object.keys(kept).length === 0) localStorage.removeItem('toeic_explain_tickets_v1');
        else localStorage.setItem('toeic_explain_tickets_v1', JSON.stringify(kept));
      } else {
        localStorage.removeItem('toeic_explain_tickets_v1');
      }
    } catch {
      localStorage.removeItem('toeic_explain_tickets_v1');
    }
  }
  localStorage.removeItem(`toeic_pacing_draft_v1_${userId ?? 'guest'}`);
  if (userId) localStorage.removeItem(`toeic_progress_account_${userId}_v2`);
  else {
    localStorage.removeItem(OLD_BUNDLE_KEY);
    for (const key of Object.values(LEGACY_KEYS)) localStorage.removeItem(key);
  }
  const owner = localStorage.getItem('toeic_weekly_plans_v1_owner');
  if (owner === (userId ?? 'guest')) localStorage.removeItem(OLD_PLANS_KEY);
  const rawSkipListening = localStorage.getItem('toeic_wrong_detail_skip_listening_v1');
  if (rawSkipListening) {
    try {
      const parsed = JSON.parse(rawSkipListening) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        delete parsed[userId ?? 'guest'];
        if (Object.keys(parsed).length === 0) localStorage.removeItem('toeic_wrong_detail_skip_listening_v1');
        else localStorage.setItem('toeic_wrong_detail_skip_listening_v1', JSON.stringify(parsed));
      } else {
        localStorage.removeItem('toeic_wrong_detail_skip_listening_v1');
      }
    } catch {
      localStorage.removeItem('toeic_wrong_detail_skip_listening_v1');
    }
  }
}

/**
 * Scrub every persisted localStorage copy belonging to one signed-in account
 * (called on explicit sign-out and account deletion to protect shared browsers).
 */
export function purgeAccountLocalStorage(userId: string): void {
  clearRetiredCopies(userId);
  localStorage.removeItem(accountKey(userId));
  localStorage.removeItem(`toeic_sync_cursor_${userId}_v3`);
  localStorage.removeItem(`toeic_attempt_advice_consent_${userId}_v1`);
  localStorage.removeItem(`toeic_pomodoro_settings_v2_${userId}`);
  localStorage.removeItem(`toeic_pacing_sound_${userId}`);
  localStorage.removeItem(`toeic_source_image_cleanup_${userId}`);
  const suffix = `:${userId}`;
  const scopedKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key && (key.startsWith('rd_') || key.startsWith('toeic_')) && key.endsWith(suffix)) {
      scopedKeys.push(key);
    }
  }
  for (const key of scopedKeys) localStorage.removeItem(key);
}

export function replaceCollection<T extends { id: string } & Partial<SyncMeta>>(
  oldRecords: T[], incoming: T[]
): Array<T & SyncMeta> {
  const incomingIds = new Set(incoming.map(item => item.id));
  const oldById = new Map(oldRecords.map(item => [item.id, item]));
  const content = (record: T) => {
    const { updatedAt: _updatedAt, deletedAt: _deletedAt, ...value } = record;
    void _updatedAt;
    void _deletedAt;
    return JSON.stringify(value);
  };
  const next: Array<T & SyncMeta> = incoming.map(item => {
    const old = oldById.get(item.id);
    if (old && !old.deletedAt && content(old) === content(item)) return old as T & SyncMeta;
    return { ...item, updatedAt: nextUpdatedAt(old?.updatedAt), deletedAt: null };
  });
  for (const old of oldRecords) {
    if (!incomingIds.has(old.id)) {
      const updatedAt = old.deletedAt && old.updatedAt ? old.updatedAt : nextUpdatedAt(old.updatedAt);
      next.push({ ...old, updatedAt, deletedAt: old.deletedAt || updatedAt });
    }
  }
  return next;
}
