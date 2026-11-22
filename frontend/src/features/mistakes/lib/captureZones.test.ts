import { describe, expect, it } from 'vitest';
import { addToZone, FIRST_ZONE, importZone, removeFromZones, reorderInZone, switchZone, zoneForKey, type Zoned } from './captureZones';

const item = (id: string) => ({ id });
const empty = (): Zoned<{ id: string }> => ({ passage: [], questions: [] });

describe('capture zones', () => {
  it('sends paste, watcher and camera imports to the active zone in arrival order', () => {
    let zones = empty();
    let active = FIRST_ZONE;
    expect(active).toBe('passage');
    // Paste 3 into ①, then the learner switches to ② and the watcher and camera add more.
    zones = addToZone(zones, importZone(true, active), [item('p1'), item('p2')]);
    zones = addToZone(zones, importZone(true, active), [item('p3')]);
    active = 'questions';
    zones = addToZone(zones, importZone(true, active), [item('q1')]);
    zones = addToZone(zones, importZone(true, active), [item('q2'), item('q3')]);
    expect(zones.passage.map(entry => entry.id)).toEqual(['p1', 'p2', 'p3']);
    expect(zones.questions.map(entry => entry.id)).toEqual(['q1', 'q2', 'q3']);
  });
  it('uses the zone an image was dropped on, and one zone for single-question Parts', () => {
    expect(importZone(true, 'questions', 'passage')).toBe('passage');
    expect(importZone(true, null)).toBe('passage');
    expect(importZone(false, 'passage', 'passage')).toBe('questions');
  });
  it('never moves an image between zones except by "Chuyển sang"', () => {
    let zones: Zoned<{ id: string }> = { passage: [item('a'), item('b')], questions: [item('c')] };
    zones = reorderInZone(zones, 'passage', 'b', -1);
    expect(zones.passage.map(entry => entry.id)).toEqual(['b', 'a']);
    expect(reorderInZone(zones, 'passage', 'b', -1)).toBe(zones);
    // An id that is not in the named zone is left alone (no fallback to the other zone).
    expect(removeFromZones(zones, 'questions', 'a')).toEqual(zones);
    expect(reorderInZone(zones, 'questions', 'a', 1)).toBe(zones);
    zones = switchZone(zones, 'passage', 'a');
    expect(zones).toEqual({ passage: [item('b')], questions: [item('c'), item('a')] });
    zones = switchZone(zones, 'questions', 'c');
    expect(zones).toEqual({ passage: [item('b'), item('c')], questions: [item('a')] });
  });
  it('maps keys 1/2 to ① and ②', () => {
    expect(zoneForKey('1')).toBe('passage');
    expect(zoneForKey('2')).toBe('questions');
    expect(zoneForKey('3')).toBeNull();
  });
});
