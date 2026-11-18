import { defaultProfile, type DataBundle, type SyncMeta } from '@/shared/data/dataBundle';

export type TransferChoice = 'merge' | 'account' | 'device';
type RecordWithId = { id: string } & SyncMeta;
type CollectionName = 'sessions' | 'mistakes' | 'pacingRuns' | 'vocabLog' | 'shieldDays';

const COLLECTIONS: CollectionName[] = ['sessions', 'mistakes', 'pacingRuns', 'vocabLog', 'shieldDays'];

function newer<T extends SyncMeta>(local: T, remote: T): T {
  const comparison = Date.parse(local.updatedAt) - Date.parse(remote.updatedAt);
  if (comparison > 0) return local;
  if (comparison < 0) return remote;
  if (!!local.deletedAt !== !!remote.deletedAt) return local.deletedAt ? local : remote;
  return remote;
}

export function mergeRecords<T extends RecordWithId>(local: T[], remote: T[]): T[] {
  const result = new Map(remote.map(item => [item.id, item]));
  for (const item of local) {
    const previous = result.get(item.id);
    result.set(item.id, previous ? newer(item, previous) : item);
  }
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function replaceWithDevice<T extends RecordWithId>(device: T[], account: T[], now: string): T[] {
  const deviceIds = new Set(device.map(item => item.id));
  const tombstones = account.filter(item => !deviceIds.has(item.id)).map(item => ({ ...item, updatedAt: now, deletedAt: now }));
  return [...device.map(item => ({ ...item, updatedAt: now })), ...tombstones].sort((a, b) => a.id.localeCompare(b.id));
}

export function reconcileBundles(device: DataBundle, account: DataBundle, choice: TransferChoice, now = new Date().toISOString()): DataBundle {
  if (choice === 'account') return account;
  if (choice === 'device') return {
    schemaVersion: 3,
    profile: { ...device.profile, updatedAt: now },
    sessions: replaceWithDevice(device.sessions, account.sessions, now),
    mistakes: replaceWithDevice(device.mistakes, account.mistakes, now),
    pacingRuns: replaceWithDevice(device.pacingRuns, account.pacingRuns, now),
    vocabLog: replaceWithDevice(device.vocabLog, account.vocabLog, now),
    shieldDays: replaceWithDevice(device.shieldDays, account.shieldDays, now)
  };
  const result = { ...account, profile: newer(device.profile, account.profile) };
  for (const key of COLLECTIONS) {
    // Each collection is homogeneous at runtime; the cast keeps the mapped assignment typed.
    (result as unknown as Record<CollectionName, RecordWithId[]>)[key] = mergeRecords(
      device[key] as RecordWithId[], account[key] as RecordWithId[]
    );
  }
  return result;
}

export function hasPersonalData(bundle: DataBundle): boolean {
  const defaults = defaultProfile();
  return bundle.sessions.some(item => !item.deletedAt)
    || bundle.mistakes.some(item => !item.deletedAt)
    || bundle.pacingRuns.some(item => !item.deletedAt)
    || bundle.vocabLog.some(item => !item.deletedAt)
    || bundle.shieldDays.some(item => !item.deletedAt)
    || bundle.profile.name !== defaults.name
    || bundle.profile.targetScore !== defaults.targetScore
    || bundle.profile.examDate !== defaults.examDate
    || bundle.profile.dailyMinGoalMinutes !== defaults.dailyMinGoalMinutes
    || bundle.profile.motto !== defaults.motto;
}

export function hasCustomizedProfile(bundle: DataBundle): boolean {
  const defaults = defaultProfile();
  return bundle.profile.name !== defaults.name || bundle.profile.targetScore !== defaults.targetScore
    || bundle.profile.examDate !== defaults.examDate || bundle.profile.dailyMinGoalMinutes !== defaults.dailyMinGoalMinutes
    || bundle.profile.motto !== defaults.motto || bundle.profile.selectedSkill !== defaults.selectedSkill;
}
