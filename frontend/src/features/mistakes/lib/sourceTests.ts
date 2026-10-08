import type { MistakeEntry } from '@/shared/types';
import { normalizeTestName } from '@/shared/domain/testNames';
export { normalizeTestName, testNameKey, uniqueTestNames } from '@/shared/domain/testNames';

/** An explicit empty name means the learner removed the source, even on a linked old card. */
export function mistakeTestName(mistake: MistakeEntry, sessionNames: ReadonlyMap<string, string>): string {
  return normalizeTestName(typeof mistake.sourceTestName === 'string' ? mistake.sourceTestName : sessionNames.get(mistake.sessionId ?? '') ?? '');
}
