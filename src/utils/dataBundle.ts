import type { MistakeEntry, PacingRun, StudySession, UserProfile } from '../types';

export interface SyncMeta {
  updatedAt: string;
  deletedAt: string | null;
}

export interface VocabLog extends SyncMeta {
  id: string;
  date: string;
  count: number;
}

export interface ShieldDay extends SyncMeta {
  id: string;
  date: string;
}

export interface ChecklistItem extends SyncMeta {
  id: string;
  checked: boolean;
}

export interface DataBundle {
  schemaVersion: 2;
  profile: UserProfile & SyncMeta;
  sessions: Array<StudySession & SyncMeta>;
  mistakes: Array<MistakeEntry & SyncMeta>;
  pacingRuns: Array<PacingRun & SyncMeta>;
  checklist: ChecklistItem[];
  vocabLog: VocabLog[];
  shieldDays: ShieldDay[];
}

const BUNDLE_KEY = 'toeic_progress_bundle_v2';
const ACTIVE_ACCOUNT_KEY = 'toeic_active_account_v1';
const accountKey = (userId: string) => `toeic_progress_account_${userId}_v2`;
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
  checklist: 'toeic_exam_checklist_v1'
} as const;

export const DEFAULT_CHECKLIST: Record<string, boolean> = {
  id_original: true,
  exam_slip: true,
  pencils_2b: false,
  eraser: false,
  dress_code: false,
  arrive_early: false,
  sleep_well: false,
  no_smartwatch: false
};

export function defaultProfile(): UserProfile {
  return {
    name: 'Học viên',
    targetScore: 990,
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
    schemaVersion: 2,
    profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
    sessions: [], mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: [],
    checklist: Object.entries(DEFAULT_CHECKLIST).map(([id, checked]) => ({ id, checked, updatedAt: now, deletedAt: null }))
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
  const legacyChecklist = readLegacy<Record<string, boolean>>(LEGACY_KEYS.checklist, DEFAULT_CHECKLIST);
  const sessions = readLegacy<StudySession[]>(LEGACY_KEYS.sessions, []);
  const mistakes = readLegacy<MistakeEntry[]>(LEGACY_KEYS.mistakes, []);
  const pacingRuns = readLegacy<PacingRun[]>(LEGACY_KEYS.pacingRuns, []);
  return {
    schemaVersion: 2,
    profile: stamp((() => {
      const old = readLegacy<UserProfile>(LEGACY_KEYS.profile, defaultProfile());
      return { ...defaultProfile(), ...old, shieldAllowance: old.shieldAllowance ?? old.streakFreezes };
    })(), now),
    sessions: Array.isArray(sessions) ? sessions.map(item => stamp(item, item.createdAt || now)) : [],
    mistakes: Array.isArray(mistakes) ? mistakes.map(item => stamp(item, item.createdAt || now)) : [],
    pacingRuns: Array.isArray(pacingRuns) ? pacingRuns.map(item => stamp(item, item.createdAt || now)) : [],
    checklist: Object.entries({ ...DEFAULT_CHECKLIST, ...legacyChecklist }).map(([id, checked]) => ({ id, checked: Boolean(checked), updatedAt: now, deletedAt: null })),
    vocabLog: [],
    shieldDays: []
  };
}

export function getActiveAccountId(): string | null {
  return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export function activateAccount(userId: string): void {
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
}

export function deactivateAccount(): void {
  accountWriteEnabled = false;
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

export function readGuestBundle(): DataBundle {
  const raw = localStorage.getItem(BUNDLE_KEY);
  if (raw) return parseStoredBundle(raw);
  const migrated = migrateLegacy();
  localStorage.setItem(BUNDLE_KEY, JSON.stringify(migrated));
  return migrated;
}

export function readAccountBundle(userId: string): DataBundle | null {
  const raw = localStorage.getItem(accountKey(userId));
  return raw ? parseStoredBundle(raw) : null;
}

export function writeAccountBundle(userId: string, bundle: DataBundle): void {
  localStorage.setItem(accountKey(userId), JSON.stringify(bundle));
}

function parseStoredBundle(raw: string): DataBundle {
  const parsed = JSON.parse(raw) as DataBundle;
  if (parsed.schemaVersion !== 2) throw new Error('Phiên bản dữ liệu trên máy không được hỗ trợ.');
  return parsed;
}

/** One localStorage write is the commit point. Legacy keys are never deleted. */
export function readDataBundle(): DataBundle {
  const accountId = getActiveAccountId();
  if (accountId) return readAccountBundle(accountId) || emptyBundle();
  return readGuestBundle();
}

export function writeDataBundle(bundle: DataBundle): void {
  const accountId = getActiveAccountId();
  if (accountId && !canWriteAccount()) throw new Error('Chưa kết nối. Vui lòng kết nối mạng trước khi ghi dữ liệu tài khoản.');
  const key = accountId ? accountKey(accountId) : BUNDLE_KEY;
  const previous = localStorage.getItem(key);
  try {
    localStorage.setItem(key, JSON.stringify(bundle));
  } catch (error) {
    // setItem replaces one key atomically; restore defensively for unusual browsers.
    if (localStorage.getItem(key) !== previous) {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }
    throw error;
  }
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
