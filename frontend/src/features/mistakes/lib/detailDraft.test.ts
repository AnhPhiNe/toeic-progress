import { describe, expect, it } from 'vitest';
import { buildDetailDraft, detailDraftScope, restoreDetailDraft, validateDetailDraft } from './detailDraft';
import { createDraftMistake } from './mistakeDrafts';
import { editDetailForm, savedDetailForm } from './detailForm';

const card = (session = 'attempt', question = 104) => createDraftMistake({ id: session, testName: 'ETS' }, question, '2026-10-20T10:00:00.000Z');
describe('detail list durable draft', () => {
  it('restores only unsaved rows of the same unchanged cards', () => {
    const a = card(), b = card('attempt', 105);
    const form = editDetailForm(savedDetailForm(a), { choice: 'B', answer: 'A', category: 'TIME_PRESSURE' });
    const payload = buildDetailDraft([a, b], { [a.id]: form, [b.id]: savedDetailForm(b) }, new Set([a.id]));
    expect(validateDetailDraft(JSON.parse(JSON.stringify(payload)))).not.toBeNull();
    expect(restoreDetailDraft(payload, [a, b])).toEqual({ [a.id]: form });
    expect(payload.rows).toHaveLength(1);
  });
  it('never overlays a newer saved row, deleted card, or retake', () => {
    const a = card();
    const payload = buildDetailDraft([a], { [a.id]: editDetailForm(savedDetailForm(a), { answer: 'C' }) }, new Set([a.id]));
    expect(restoreDetailDraft(payload, [{ ...a, category: 'ADVANCED_GRAMMAR' }])).toEqual({});
    expect(restoreDetailDraft(payload, [{ ...a, deletedAt: '2026-10-23T10:00:00Z' }])).toEqual({});
    expect(restoreDetailDraft(payload, [card('retake')])).toEqual({});
    expect(detailDraftScope([a])).not.toBe(detailDraftScope([card('retake')]));
  });
  it('rejects malformed AI fields and invalid choices before restoration', () => {
    expect(validateDetailDraft({ rows: [{ id: 'a', base: '{}', form: { raw: '', choice: 'E', answer: '', category: '' } }] })).toBeNull();
    expect(validateDetailDraft({ rows: [{ id: 'a', base: '{}', form: { raw: '', choice: '', answer: '', category: '', ai: { options: 'wrong type' } } }] })).toBeNull();
  });
});
