/**
 * How "Từng Part" dresses an island and its panel from the numbers (sketch: design/previews/journey-v3/parts-islands-v3.html):
 * colour of the % by the Vững/Ổn thresholds, weather by strength, whether the storm has cleared.
 */
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { OK_FROM, STRONG_FROM, islandState, partAccuracy, type IslandState } from './islands';
import { partSize } from './journeyData';

export interface PctColour {
  /** Text colour of the % and the tag. */
  ink: string;
  /** Soft background of the tag. */
  bg: string;
  /** Fill of the % bar and of the legend dot. */
  fill: string;
}

export const PCT_COLOUR: Record<IslandState, PctColour> = {
  strong: { ink: '#2f8a42', bg: '#e3f6e6', fill: '#46b35a' },
  ok: { ink: '#b97c00', bg: '#fff1c9', fill: '#ffc83d' },
  weak: { ink: '#d6416a', bg: '#ffe3ea', fill: '#ff7a9c' }
};

/** Legend under the map: "% đúng · ≥85 · 75–84 · dưới 75", always read from the thresholds. */
export const PCT_LEGEND: Array<{ state: IslandState; label: string }> = [
  { state: 'strong', label: `≥${STRONG_FROM}` },
  { state: 'ok', label: `${OK_FROM}–${STRONG_FROM - 1}` },
  { state: 'weak', label: `dưới ${OK_FROM}` }
];

/** Sky over an island: sunny (strong), fair (a little cloud, ok), storm (rain cloud), heavy (the weakest: dark cloud, rough water). */
export type Sky = 'sunny' | 'fair' | 'storm' | 'heavy';

export interface Weather {
  sky: Sky;
  /** Choppy water around the island. */
  chop: boolean;
  /** The palm is broken (only the single weakest Part, while its chest is still closed). */
  brokenPalm: boolean;
  /** Vegetation: lush trees and flowers, a few trees, or dry and sparse. */
  green: 'lush' | 'some' | 'sparse';
}

export interface PartWeatherInput {
  part: PartNumber;
  accuracy: number;
  state: IslandState;
  /** Every wrong card of this Part has been reviewed (the chest is open). */
  cleared: boolean;
}

/** The single weakest Part that is still below the "Ổn" line and not cleared; null when there is none. */
export function weakestPart(items: PartWeatherInput[]): PartNumber | null {
  let worst: PartWeatherInput | null = null;
  for (const it of items) {
    if (it.state !== 'weak' || it.cleared) continue;
    if (!worst || it.accuracy < worst.accuracy || (it.accuracy === worst.accuracy && it.part > worst.part)) worst = it;
  }
  return worst ? worst.part : null;
}

/** Weather of one island. A cleared Part keeps its thin trees but the storm is gone and the palm stands again. */
export function islandWeather(it: PartWeatherInput, weakest: PartNumber | null): Weather {
  const green = it.state === 'strong' ? 'lush' : it.state === 'ok' ? 'some' : 'sparse';
  if (it.state === 'strong') return { sky: 'sunny', chop: false, brokenPalm: false, green };
  if (it.state === 'ok') return { sky: 'fair', chop: false, brokenPalm: false, green };
  if (it.cleared) return { sky: 'fair', chop: false, brokenPalm: false, green };
  const heavy = it.part === weakest;
  return { sky: heavy ? 'heavy' : 'storm', chop: heavy, brokenPalm: heavy, green };
}

/** Weather of every Part at once, from accuracy, state and cleared flags. */
export function weatherByPart(items: PartWeatherInput[]): Record<PartNumber, Weather> {
  const weakest = weakestPart(items);
  const out = {} as Record<PartNumber, Weather>;
  for (const p of PART_NUMBERS) {
    const it = items.find(i => i.part === p);
    if (it) out[p] = islandWeather(it, weakest);
  }
  return out;
}

/** Everything the map needs to draw one island. */
export interface MapPart {
  pct: number;
  state: IslandState;
  weather: Weather;
  wrong: number;
  /** Every wrong card was reviewed: the chest is open. */
  open: boolean;
  /** Wrong answers still to win back. */
  remaining: number;
  /** Index of this Part's chest in the plan (0 = ①), -1 when it has no numbered chest. */
  rank: number;
}

/** Island data of every Part from the test's wrong counts, the chests (reviewed progress) and the numbered plan. */
export function buildMapParts(wrongByPart: Record<PartNumber, number>, chests: Record<PartNumber, { open: boolean; remaining: number }>, numbered: PartNumber[]): Record<PartNumber, MapPart> {
  const base = PART_NUMBERS.map(p => {
    const pct = partAccuracy(partSize(p), wrongByPart[p]);
    return { part: p, accuracy: pct, state: islandState(pct), cleared: chests[p].open } satisfies PartWeatherInput;
  });
  const weather = weatherByPart(base);
  return Object.fromEntries(base.map(b => [b.part, {
    pct: b.accuracy, state: b.state, weather: weather[b.part], wrong: wrongByPart[b.part], open: chests[b.part].open, remaining: chests[b.part].remaining, rank: numbered.indexOf(b.part)
  } satisfies MapPart])) as Record<PartNumber, MapPart>;
}

/** Icon of the tag in the panel: sun, sun behind a cloud or rain cloud. */
export function weatherIconKind(state: IslandState, cleared = false): 'sun' | 'partly' | 'rain' {
  if (state === 'strong') return 'sun';
  if (state === 'ok' || cleared) return 'partly';
  return 'rain';
}

/** The art is drawn a little smaller than the layout radius so foam and lagoon stay inside the hit area. */
export const ART_RADIUS = 0.92;
