import { describe, expect, it } from 'vitest';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { createDraftMistake } from './mistakeDrafts';
import { flowCards, heroPart, partProgress, planGroupRequests, planSingleRequests, suggestGroups, topReason, waitingTests } from './wrongDetail';

const session: StudySession = { id: 's1', testName: 'ETS 2024 Test 03', date: '2026-11-10', createdAt: '2026-11-10T08:00:00.000Z',
  skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, wrongQuestions: [4, 35, 103, 133, 186, 189, 190] };
const draft = (number: number, sessionId = 's1') => createDraftMistake({ id: sessionId, testName: 'ETS 2024 Test 03' }, number, '2026-11-10T08:00:00.000Z');
const filled = (number: number, changes: Partial<MistakeEntry> = {}): MistakeEntry => ({ ...draft(number), question: 'Q?', questionContext: 'Q?', correctAnswer: '(A) a',
  answerSource: 'PROVIDED', category: 'VOCABULARY_TRAP', ...changes });
const image = (bytes: number) => ({ dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4) });

describe('passage group suggestions', () => {
  it('uses the fixed Part 6 sets and only lists sets with a wrong question', () => {
    expect(suggestGroups(6, [133, 134, 141, 146]).map(group => [group.from, group.to, group.wrong])).toEqual([
      [131, 134, [133, 134]], [139, 142, [141]], [143, 146, [146]]]);
  });
  it('follows the official Part 7 layout: single, double and triple passages', () => {
    const groups = suggestGroups(7, [149, 153, 158, 176, 186, 189, 200]);
    expect(groups.map(group => `${group.from}–${group.to}`)).toEqual(['149–150', '153–154', '158–160', '176–180', '186–190', '196–200']);
    expect(groups.map(group => group.passages)).toEqual([1, 1, 1, 2, 3, 3]);
    expect(groups[4]).toMatchObject({ kind: 'Đoạn ba', wrong: [186, 189] });
  });
});

describe('progress', () => {
  it('counts a Listening question without a card as not recorded and keeps draft ids stable', () => {
    const { cards, unsaved } = flowCards(session, [draft(103), filled(133), draft(186), draft(189), draft(190), draft(150, 'other')]);
    expect(cards.map(card => card.questionNumber)).toEqual([4, 35, 103, 133, 186, 189, 190]);
    expect([...unsaved]).toEqual(['draft:s1:4', 'draft:s1:35']);
    expect(flowCards(session, []).cards[0].createdAt).toBe(session.createdAt);
    const progress = partProgress(cards, unsaved);
    expect(progress.map(entry => [entry.part, entry.numbers.length, entry.done])).toEqual([[1, 1, 0], [3, 1, 0], [5, 1, 0], [6, 1, 1], [7, 3, 0]]);
    expect(heroPart(progress)?.part).toBe(7);
  });
  it('moves the hero to the Part with the most left, and to none when everything is recorded', () => {
    const cards = [filled(186), filled(189), filled(190), draft(103), draft(104)];
    expect(heroPart(partProgress(cards))?.part).toBe(5);
    expect(heroPart(partProgress([filled(103)]))).toBeNull();
  });
  it('names the most common reason', () => {
    expect(topReason([filled(101), filled(102), filled(103, { category: 'ADVANCED_GRAMMAR' }), filled(104, { category: 'OTHER' })]))
      .toEqual({ category: 'VOCABULARY_TRAP', count: 2 });
    expect(topReason([draft(101)])).toBeNull();
  });
});

describe('draft filtering in Sổ tay', () => {
  it('counts only number-only Reading drafts as waiting, per test', () => {
    const titles = (id: string) => ({ title: id === 's1' ? 'ETS 2024 Test 03' : 'Test 2', attempt: '' });
    const mistakes = [draft(103), draft(104), filled(105), draft(4), { ...draft(106), deletedAt: '2026-11-11T00:00:00Z' }, draft(150, 's2'), filled(151, { sessionId: 's3' })];
    expect(waitingTests(mistakes, titles)).toEqual([
      { sessionId: 's1', title: 'ETS 2024 Test 03', attempt: '', waiting: 2, done: 1, total: 3 },
      { sessionId: 's2', title: 'Test 2', attempt: '', waiting: 1, done: 0, total: 1 }]);
  });
});

describe('request planning', () => {
  it('sends a passage and its questions together in one request', () => {
    const plan = planGroupRequests([image(300_000), image(300_000), image(300_000)], [image(200_000)], [186, 187, 188, 189, 190]);
    expect(plan.split).toBe(false);
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0].contextImages).toHaveLength(3);
    expect(plan.requests[0].images).toHaveLength(1);
  });
  it('reuses the passage when there are more than three question images', () => {
    const plan = planGroupRequests([image(100_000)], [1, 2, 3, 4].map(() => image(100_000)), [176, 177]);
    expect(plan.requests.map(request => [request.contextImages.length, request.images.length])).toEqual([[1, 3], [1, 1]]);
  });
  it('reads a question printed on the passage page from the passage images alone', () => {
    const plan = planGroupRequests([image(100_000)], [], [147]);
    expect(plan.requests).toEqual([{ contextImages: [], images: [expect.anything()], questions: [147] }]);
  });
  it('splits only when the group cannot fit one request, and says so', () => {
    const plan = planGroupRequests([image(900_000), image(900_000)], [image(900_000)], [131, 132]);
    expect(plan.split).toBe(true);
    expect(plan.requests.length).toBeGreaterThan(1);
    expect(planGroupRequests([1, 2, 3, 4].map(() => image(10)), [image(10)], [131]).error).toMatch(/tối đa 3 ảnh đoạn văn/);
  });
  it('puts passage and questions in one plain request when the server cannot tell them apart', () => {
    const plan = planGroupRequests([image(100), image(100)], [image(100)], [131], { contextSupported: false });
    expect(plan).toMatchObject({ split: false, requests: [{ contextImages: [], images: [expect.anything(), expect.anything(), expect.anything()] }] });
  });
  it('reads Part 5 images one by one, grouping many wanted numbers while the capture allows', () => {
    const numbers = [101, 102, 103, 104, 105, 106, 107];
    expect(planSingleRequests([image(10), image(10)], numbers).requests.map(request => [request.images.length, request.questions.length])).toEqual([[1, 6], [1, 1], [1, 6], [1, 1]]);
    expect(planSingleRequests([image(10), image(10), image(10)], numbers).requests.map(request => request.questions.length)).toEqual([7, 7, 7]);
    expect(planSingleRequests([1, 2, 3, 4, 5].map(() => image(10)), numbers).error).toMatch(/tối đa 4 ảnh/);
  });
});
