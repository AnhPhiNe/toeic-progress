import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { mergeSessionEdit } from './sessionUpdates';

const original: StudySession = { id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date: '2026-10-09',
  durationMinutes: 120, totalScore: 800, scoreSource: 'MANUAL_TOTAL', createdAt: '2026-10-09T09:00:00Z', updatedAt: '2026-10-09T09:00:00Z' };

describe('session edit conflicts', () => {
  it('rejects a newer score, notes or a deletion instead of replacing it with the opened snapshot', () => {
    const edited = { ...original, testName: 'Renamed' };
    expect(() => mergeSessionEdit({ ...original, totalScore: 900 }, original, edited)).toThrow(/được sửa/);
    expect(() => mergeSessionEdit({ ...original, notes: 'Newer notes' }, original, edited)).toThrow(/được sửa/);
    expect(() => mergeSessionEdit({ ...original, updatedAt: '2026-10-10T09:00:00Z' }, original, edited)).toThrow(/được sửa/);
    expect(() => mergeSessionEdit(undefined, original, edited)).toThrow(/bị xóa/);
    expect(() => mergeSessionEdit({ ...original, deletedAt: '2026-10-10T09:00:00Z' }, original, edited)).toThrow(/bị xóa/);
  });

  it('guards Part practice contents and the identity of the record', () => {
    const practice: StudySession = { ...original, sessionType: 'PART_PRACTICE', scoreSource: undefined, totalScore: 0,
      practiceParts: [{ part: 5, correct: 20, total: 30 }] };
    expect(() => mergeSessionEdit({ ...practice, practiceParts: [{ part: 5, correct: 25, total: 30 }] }, practice, practice)).toThrow(/được sửa/);
    expect(() => mergeSessionEdit(original, original, { ...original, id: 'other' })).toThrow(/được sửa/);
  });

  it('accepts equivalent stored objects, retains metadata and removes stale score fields on total-only changes', () => {
    const sections: StudySession = { ...original, scoreSource: 'MANUAL_SECTIONS', scaledListening: 450, scaledReading: 350 };
    const withExtra = { ...sections, importedExtra: 'Retain me' };
    const edited = { ...original, testName: 'Renamed', totalScore: 805 };
    const latest = JSON.parse(JSON.stringify(withExtra));
    const merged = mergeSessionEdit(latest, withExtra, edited);
    expect(merged).toMatchObject({ id: 's1', createdAt: original.createdAt, testName: 'Renamed', totalScore: 805, importedExtra: 'Retain me' });
    expect(merged).not.toHaveProperty('scaledListening');
    expect(merged).not.toHaveProperty('scaledReading');
    expect(merged).not.toHaveProperty('scoreConversionVersion');
  });
});
