import { categoryShort } from '../MistakeDetail';

/** Part colours of the phone sketch (design/previews/mock-phone-notebook.html). */
export const PART_COLORS: Record<number, string> = { 1: '#46b35a', 2: '#e2871a', 3: '#d99a00', 4: '#0f9fa8', 5: '#7c5ce0', 6: '#1c8fe3', 7: '#e0557f' };

const CHIPS: Record<string, [string, string]> = {
  VOCABULARY_TRAP: ['#fff4d1', '#a06a00'], ADVANCED_GRAMMAR: ['#e6f1ff', '#1c6fc0'], LISTENING_SPEED: ['#e3f6f7', '#0c7f87'],
  TIME_PRESSURE: ['#f1ebff', '#6a4fd0'], CARELESS_DISTRACTION: ['#ffe9ee', '#d3456b']
};

/** The little coloured trap chip of a row; none for a card without a reason yet. */
export function categoryChip(category: string): { label: string; bg: string; fg: string } | null {
  const colors = CHIPS[category];
  return colors ? { label: categoryShort(category), bg: colors[0], fg: colors[1] } : null;
}
