import type { ReactNode } from 'react';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { BrokenPalm, Bush, Crate, Flowers, IslandGround, IslandPalm, Lighthouse, Pier, Pine, Hut, Rock, RoundTree, Stump, Tuft, type GroundTone } from '@/shared/illustrations/Islands';
import type { Weather } from '../lib/islandLook';

/** One thing standing on an island, placed in units of the island radius (dx, dy), scale s. */
type Spec =
  | ['tree' | 'pine' | 'bush' | 'rock' | 'crate' | 'stump' | 'lighthouse' | 'palm', number, number, number, (1 | -1)?]
  | ['hut', number, number, number, string]
  | ['flowers', number, number, number, number, number, number];

interface Recipe {
  seed: number;
  gdx?: number;
  gdy?: number;
  hill?: readonly [number, number, number];
  /** Always there (landmarks, rocks, palms). */
  fixed: Spec[];
  /** Ổn and Vững islands. */
  green: Spec[];
  /** Only Vững islands. */
  lush: Spec[];
  /** Pier from the shore: [dx, dy, ex, ey] in units of r. */
  pier?: readonly [number, number, number, number];
}

const RECIPES: Record<PartNumber, Recipe> = {
  1: { seed: 11, fixed: [], green: [['tree', -.42, -.06, .62], ['tree', .38, .02, .7]], lush: [['bush', .05, .26, .55], ['flowers', -.1, .3, 1, 4, 7, 40]] },
  2: { seed: 23, gdx: -.15, fixed: [['palm', .42, .06, .78, -1], ['rock', -.52, .18, .9], ['rock', -.26, .34, .6], ['crate', .72, .28, .7]], green: [['tree', -.05, -.1, .55]], lush: [['bush', .12, .26, .55], ['flowers', -.2, .28, 1, 5, 6, 34]] },
  3: { seed: 37, hill: [-.15, -.1, .55], pier: [-.78, .36, -.4, .34], fixed: [['hut', -.36, -.06, .78, '#e39a4c'], ['palm', .55, .04, .85], ['rock', .72, .3, .6]], green: [['tree', .12, -.2, .62], ['bush', -.62, .2, .6]], lush: [['flowers', -.12, .22, 1, 9, 5, 34]] },
  4: { seed: 41, fixed: [['rock', -.18, .3, .6]], green: [['tree', -.48, 0, .7], ['pine', .42, -.08, .72]], lush: [['tree', .02, -.2, .55], ['bush', .5, .26, .55], ['flowers', .1, .2, 1, 13, 5, 36]] },
  5: { seed: 53, fixed: [['lighthouse', .84, -.02, .8], ['rock', -.7, .28, .6]], green: [['tree', -.45, -.02, .72], ['tree', -.06, -.18, .6]], lush: [['bush', .02, .24, .6], ['bush', -.66, .22, .5], ['flowers', -.2, .26, 1, 17, 8, 50]] },
  6: { seed: 67, gdx: .1, fixed: [['palm', -.38, .02, .7], ['rock', .56, .26, .8], ['rock', -.62, .24, .7], ['rock', .06, .32, .55]], green: [['tree', .36, -.04, .6]], lush: [['bush', .12, .22, .55]] },
  7: { seed: 79, hill: [.16, -.1, .58], pier: [.9, .28, .5, .26], fixed: [['hut', .18, -.2, .82, '#e5527a'], ['hut', .52, -.02, .7, '#e39a4c'], ['palm', .74, .14, .8, -1], ['rock', -.74, .26, .6]], green: [['tree', -.56, -.02, .78], ['tree', -.2, -.24, .66]], lush: [['pine', -.02, -.32, .58], ['bush', .3, .28, .55], ['flowers', .02, .14, 1, 21, 6, 40]] }
};

const TONE = { lush: 'hi', some: 'mid', sparse: 'lo' } as const satisfies Record<Weather['green'], GroundTone>;

interface Props {
  part: PartNumber;
  x: number;
  y: number;
  /** Radius of the landmass. */
  r: number;
  /** Prop scale (1 = the approved desktop sketch). */
  k: number;
  weather: Weather;
}

/** One island of the map: ground, then what grows on it by strength, with a broken palm on the weakest. */
export function IslandArt({ part, x, y, r, k, weather }: Props) {
  const rc = RECIPES[part];
  const sparse = weather.green === 'sparse';
  const specs: Spec[] = [...rc.fixed];
  if (weather.green !== 'sparse') specs.push(...rc.green);
  if (weather.green === 'lush') specs.push(...rc.lush);
  if (sparse) specs.push(['stump', -.1, .22, .7], ['bush', .0, -.02, .5]);
  const hasPalm = specs.some(s => s[0] === 'palm');
  if (weather.brokenPalm && !hasPalm) specs.push(['palm', .4, .05, .8]);
  const sorted = [...specs].sort((a, b) => a[2] - b[2]);
  const place = (spec: Spec, i: number): ReactNode => {
    const [kind, dx, dy, s] = spec;
    const px = x + dx * r, py = y + dy * r, key = `${kind}${i}`;
    switch (kind) {
      case 'tree': return <RoundTree key={key} x={px} y={py} s={s * k} />;
      case 'pine': return <Pine key={key} x={px} y={py} s={s * k} />;
      case 'bush': return <Bush key={key} x={px} y={py} s={s * k} dry={sparse} />;
      case 'rock': return <Rock key={key} x={px} y={py} s={s * k} />;
      case 'crate': return <Crate key={key} x={px} y={py} s={s * k} />;
      case 'stump': return <Stump key={key} x={px} y={py} s={s * k} />;
      case 'lighthouse': return <Lighthouse key={key} x={px} y={py} s={s * k} />;
      case 'hut': return <Hut key={key} x={px} y={py} s={s * k} roof={spec[4] as string} />;
      case 'palm': {
        const flip = (spec[4] as 1 | -1 | undefined) ?? 1;
        return weather.brokenPalm ? <BrokenPalm key={key} x={px} y={py} s={s * k} flip={flip} /> : <IslandPalm key={key} x={px} y={py} s={s * k} flip={flip} sparse={sparse} />;
      }
      case 'flowers': return <Flowers key={key} x={px} y={py} s={k} seed={spec[4] as number} n={spec[5] as number} w={spec[6] as number} />;
    }
  };
  return (
    <g>
      <IslandGround x={x} y={y} r={r} tone={TONE[weather.green]} seed={rc.seed} k={k} gdx={rc.gdx} gdy={rc.gdy} hill={rc.hill} />
      {rc.pier && <Pier x={x + rc.pier[0] * r} y={y + rc.pier[1] * r} dx={rc.pier[2] * r} dy={rc.pier[3] * r} w={10 * k} />}
      {sparse && <Tuft x={x + r * .1} y={y + r * .34} s={.8 * k} c="#8fa257" />}
      {sorted.map(place)}
    </g>
  );
}
