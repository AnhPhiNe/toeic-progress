import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { Balloon, Birds, Bush, Cloud, Field, Hedge, House, MeadowFlowers, Rock, RoundTree, Sun, TallPine, Tufts, Twinkle, Windmill } from '@/shared/illustrations/Scenery';
import { MiniTrophy, SocSprite } from '@/shared/illustrations/Landmarks';
import { linePath, polyline, ribbon, sampleSmooth, slicePts, type Pt } from '@/shared/illustrations/geometry';
import { useScenePopover } from '@/shared/illustrations/ScenePopover';
import type { SocMood } from '@/shared/ui/soc/socSvg';
import { reduceMotion } from '@/features/today/lib/useStairTween';
import { MTN_H, MTN_W, PEAK, place, stakeAt, stakeCount, trailGeometry, type Placement } from '../lib/summitTrail';
import type { JourneyPoint } from '../lib/scoreJourney';
import { ddmm } from '../lib/journeyData';
import './summit.css';

export interface SummitSceneProps {
  variant: 'desk' | 'phone';
  /** Scene size in its own units (desktop: SceneStage width × MTN_H; phone: the box in px). */
  W: number;
  H: number;
  /** Shown tests, oldest first (the last DEFAULT_LIMIT); tests before them are `hidden`. */
  points: JourneyPoint[];
  hidden: number;
  target: number;
  /** Index of the latest counted test (gold flag, Sóc beside it); -1 when none. */
  latestIdx: number;
  /** Fewer than two counted tests: the projection dots are faint. */
  ghost: boolean;
  /** Phone: the card's bottom edge (px); the summit flag stays below it. */
  cardBottom?: number;
  onOpenTest: (id: string) => void;
  /** "Vẫn tính đề này" for a test left out of the trend. */
  onForce?: (id: string) => void;
  /** Sóc's line beside the latest flag (desktop only). */
  bubble?: ReactNode;
  gear?: readonly string[];
}

interface Sizes { f: number; pole: number; trail: number; stepGap: number; dot: number; socW: number }
const DESK_SIZES: Sizes = { f: 16, pole: 40, trail: 9, stepGap: 9, dot: 2.7, socW: 56 };
const PHONE_SIZES: Sizes = { f: 12, pole: 22, trail: 6, stepGap: 7, dot: 2, socW: 38 };
/** Phone template: 390 wide, PH tall, the mountain at 0.58 with the summit at (282, 258). */
const PW = 390;
const PH = 612;
const PHONE_MT: Placement = { tx: 282 - 935 * .58, ty: 258 - 148 * .58, s: .58 };

/** The snowy mountain (mountain units, 1112 × 764 reference): silhouette, shade, snow cap, rocks, shoulders, pines. */
function MountainArt({ id }: { id: string }) {
  const SIL = 'M540 764 C590 720 640 680 668 640 C700 590 735 540 760 490 C780 450 790 420 806 392 C822 362 838 330 852 300 C866 270 880 240 893 218 L905 206 L914 188 C922 172 928 158 935 148 C942 156 950 168 958 178 L968 186 L976 182 C990 200 1004 222 1018 246 C1040 284 1060 318 1080 350 C1095 372 1104 386 1112 396 C1160 440 1220 470 1320 500 V764Z';
  const SHADE = 'M935 148 C942 156 950 168 958 178 L968 186 L976 182 C990 200 1004 222 1018 246 C1040 284 1060 318 1080 350 C1095 372 1104 386 1112 396 C1160 440 1220 470 1320 500 V764 H990 C976 600 950 530 956 470 C962 420 944 380 938 330 C932 290 946 240 942 196Z';
  return (
    <g>
      <path d="M960 764 C990 520 1040 330 1080 262 C1094 240 1108 246 1124 268 C1170 330 1240 380 1320 420 V764Z" fill={`url(#${id}far)`} />
      <path d="M1080 262 C1094 240 1108 246 1124 268 L1116 278 L1108 270 L1098 282 L1090 272Z" fill="#fff" opacity=".85" />
      <path d="M560 764 C620 560 660 430 700 368 C716 344 736 350 752 378 C790 450 830 560 860 764Z" fill={`url(#${id}far)`} />
      <path d="M700 368 C716 344 736 350 752 378 L742 388 L732 376 L722 390 L712 378Z" fill="#fff" opacity=".85" />
      <path d={SIL} fill={`url(#${id}lit)`} />
      <path d="M893 218 C880 270 858 320 850 380 C842 440 818 500 812 560 C808 600 790 650 770 700 L806 700 C820 650 834 600 840 556 C850 500 872 440 878 380 C884 320 898 270 893 218Z" fill="#8ea3d1" opacity=".55" />
      <path d="M752 520 C770 480 790 450 806 392 C800 440 786 480 772 530Z" fill="#fff" opacity=".22" />
      <path d="M668 640 C700 590 735 540 760 490 C750 530 720 580 690 630Z" fill="#fff" opacity=".2" />
      <path d={SHADE} fill={`url(#${id}shade)`} />
      <path d="M976 182 C1000 240 1010 300 1020 360 C1030 430 1060 500 1090 580 L1060 590 C1036 520 1012 440 1004 370 C996 300 990 240 976 182Z" fill="#8a9fcf" opacity=".45" />
      <path d="M1112 396 C1120 460 1140 520 1170 590 L1150 596 C1124 530 1110 470 1112 396Z" fill="#8a9fcf" opacity=".35" />
      <path d="M884 236 L893 218 L905 206 L914 188 C922 172 928 158 935 148 L942 196 L945 230 Q940 240 934 236 L926 252 Q920 254 916 244 L906 262 Q900 262 898 250 L888 256 Q884 248 884 236Z" fill="#fff" />
      <path d="M935 148 C942 156 950 168 958 178 L968 186 L976 182 L988 200 Q984 210 976 206 L970 222 Q962 224 958 214 L948 236 Q944 238 945 230 L942 196Z" fill="#d9e3f5" />
      <path d="M912 196 L922 176 L926 188Z M900 224 L910 210 L912 222Z" fill="#eef3fb" />
      <path d="M906 262 C898 290 890 312 878 336 L884 336 C894 314 902 292 906 262Z M926 252 C924 286 918 316 916 344 L921 342 C924 314 928 286 926 252Z M970 222 C978 254 990 280 1000 300 L994 302 C984 282 974 256 970 222Z" fill="#eef3fb" opacity=".8" />
      <Rock x={812} y={404} /><Rock x={868} y={330} s={.7} /><Rock x={776} y={536} s={.9} /><Rock x={1016} y={318} s={.8} dark /><Rock x={1046} y={470} s={.9} dark /><Rock x={980} y={560} s={.7} dark />
      <path d={SIL} fill={`url(#${id}haze)`} />
      <g fill="none" stroke="#8ea3d1" strokeWidth="2.2" strokeLinecap="round" opacity=".55"><path d="M832 432 q-10 30 -6 62" /><path d="M792 474 q-8 24 -4 52" /><path d="M872 468 q-6 30 0 70" /><path d="M904 392 q-6 40 2 84" /><path d="M846 560 q-6 24 -2 46" /></g>
      <g fill="none" stroke="#5f739f" strokeWidth="2.2" strokeLinecap="round" opacity=".45"><path d="M1000 330 q8 30 6 60" /><path d="M1060 400 q10 26 8 56" /><path d="M1100 470 q10 26 12 50" /></g>
      <TallPine x={800} y={680} s={.62} /><TallPine x={820} y={676} s={.5} />
      <path d="M600 764 C640 700 680 660 730 640 C780 620 820 606 870 600 C930 592 980 560 1040 552 C1100 546 1180 556 1320 548 V764Z" fill={`url(#${id}shoulder)`} opacity=".75" />
      <path d="M730 640 C780 620 820 606 870 600 C930 592 980 560 1040 552 C1100 546 1180 556 1320 548" fill="none" stroke="#c4ecc4" strokeWidth="3" opacity=".7" />
      <TallPine x={990} y={566} s={.62} /><TallPine x={1016} y={560} s={.74} /><TallPine x={1120} y={556} s={.66} /><TallPine x={1146} y={560} s={.8} /><TallPine x={890} y={604} s={.6} />
      <path d="M520 764 C580 706 640 684 700 676 C760 668 800 680 860 672 C930 664 990 634 1050 626 C1100 620 1160 628 1320 618 V764Z" fill={`url(#${id}shoulder)`} />
      <path d="M700 676 C760 668 800 680 860 672 C930 664 990 634 1050 626" fill="none" stroke="#b6e6b8" strokeWidth="3" opacity=".7" />
      <TallPine x={880} y={694} s={.8} /><TallPine x={912} y={686} s={.66} /><TallPine x={1150} y={664} s={.9} /><TallPine x={1060} y={640} s={.7} />
      <TallPine x={880} y={700} s={.8} /><TallPine x={912} y={692} s={.66} /><TallPine x={1150} y={676} s={.9} />
    </g>
  );
}

interface Land {
  sun: [number, number, number];
  sky: ReactNode;
  range: [string, string];
  h1: string; village: ReactNode;
  h2: string; h2deco: ReactNode;
  h3: string; h3deco: ReactNode;
  stream: Pt[]; streamW: [number, number];
  front: string; frontDeco: ReactNode;
  lead: Pt[];
  fore: ReactNode;
}

/** Desktop landscape (1112 × 764 reference); `x0` is the scene's left edge (≤ 0 when the scene is wider). */
function deskLand(x0: number): Land {
  const H = MTN_H;
  return {
    sun: [612, 150, 44],
    sky: <><Cloud x={470} y={118} s={.62} shadow /><Cloud x={745} y={252} s={.5} className="il-drift2" shadow /><Cloud x={1050} y={120} s={.42} shadow /><Cloud x={560} y={330} s={.38} className="il-drift2" shadow />
      <Birds x={660} y={92} s={.9} /><Birds x={420} y={262} s={.7} /><Balloon x={460} y={236} s={.62} /></>,
    range: [`M${x0} 452 L0 452 C36 430 70 400 110 380 C140 366 160 372 190 392 C226 416 256 402 296 372 C326 350 350 352 380 374 C420 404 460 418 510 412 C560 408 610 420 660 440 V${H} H${x0}Z`,
      `M${x0} 488 L0 488 C60 460 120 444 170 452 C220 460 250 436 300 426 C350 418 380 444 430 460 C480 474 540 462 600 470 L680 490 V${H} H${x0}Z`],
    h1: `M${x0} 512 L0 512 C120 484 240 500 360 490 C470 480 560 494 660 514 C720 526 760 536 820 548 V${H} H${x0}Z`,
    village: <><Field x={70} y={522} w={86} h={12} skew={3} color="#cfe9b6" line="#b8dc9c" /><Field x={440} y={514} w={74} h={11} skew={-2} color="#e8ecb4" line="#d4da98" /><Field x={640} y={532} w={60} h={10} skew={-3} color="#d9edbb" line="#c2e0a2" />
      <Hedge x={60} y={532} w={110} s={.6} /><TallPine x={180} y={504} s={.42} /><TallPine x={196} y={500} s={.36} /><House x={250} y={500} s={.46} roof="#ff9ab4" /><House x={284} y={503} s={.4} roof="#7fb6e8" />
      <House x={318} y={497} s={.44} roof="#ffc83d" /><Windmill x={384} y={494} s={.58} /><TallPine x={452} y={494} s={.4} /><TallPine x={470} y={497} s={.34} /><TallPine x={560} y={502} s={.42} /><House x={610} y={512} s={.36} roof="#c9b4ff" /></>,
    h2: `M${x0} 566 L0 566 C110 538 230 556 340 562 C450 568 540 552 640 566 C700 574 740 592 790 614 V${H} H${x0}Z`,
    h2deco: <><Field x={150} y={588} w={120} h={22} skew={8} color="#c6e6a6" line="#addb8e" /><Field x={300} y={598} w={70} h={18} skew={3} color="#ecefb5" line="#d8dc98" /><Field x={470} y={592} w={96} h={20} skew={-5} color="#d2ecb2" line="#b9df98" />
      <Hedge x={140} y={614} w={150} s={.8} /><Hedge x={466} y={616} w={110} s={.8} /><RoundTree x={536} y={566} s={.55} /><RoundTree x={566} y={572} s={.45} /><Bush x={130} y={568} s={.6} /><Bush x={640} y={578} s={.55} />
      <MeadowFlowers x={220} y={572} n={18} wx={150} wy={14} seed={3} s={.8} /><MeadowFlowers x={560} y={588} n={12} wx={120} wy={12} seed={9} s={.8} /><Tufts x={300} y={576} n={6} wx={140} seed={5} color="#7cbf80" s={.8} /></>,
    h3: `M${x0} 628 L0 628 C130 606 250 630 380 636 C500 640 580 646 660 668 C690 676 700 690 710 700 V${H} H${x0}Z`,
    h3deco: <><RoundTree x={250} y={668} s={.72} /><RoundTree x={282} y={676} s={.55} /><TallPine x={470} y={664} s={.7} /><TallPine x={492} y={670} s={.55} /><Bush x={432} y={548} s={.5} /><Bush x={404} y={546} s={.4} />
      <MeadowFlowers x={120} y={642} n={26} wx={200} wy={18} seed={5} /><MeadowFlowers x={520} y={656} n={22} wx={180} wy={16} seed={11} /><Tufts x={230} y={648} n={8} wx={180} seed={7} color="#5fae68" /><Bush x={60} y={640} s={.7} /></>,
    stream: [[420, 536], [396, 568], [440, 604], [404, 642], [340, 690], [300, 764]], streamW: [5, 54],
    front: `M${x0} 708 L0 708 C160 692 320 716 480 712 C640 708 760 718 900 716 C1000 714 1060 706 1112 708 V${H} H${x0}Z`,
    frontDeco: <><MeadowFlowers x={170} y={736} n={30} wx={220} wy={34} seed={21} s={1.1} /><MeadowFlowers x={560} y={738} n={26} wx={220} wy={30} seed={27} s={1.1} /><MeadowFlowers x={860} y={740} n={22} wx={200} wy={30} seed={31} s={1.1} />
      <Tufts x={470} y={726} n={10} wx={200} seed={13} color="#4c9e5a" /><Tufts x={760} y={730} n={8} wx={160} seed={17} color="#4c9e5a" /></>,
    lead: [[540, 764], [580, 726], [610, 700]],
    fore: <><RoundTree x={38} y={772} s={1.5} /><RoundTree x={104} y={760} /><Bush x={170} y={750} s={.9} /><TallPine x={1050} y={776} s={1.4} light="#3f9a54" dark="#2d7a44" /><TallPine x={1088} y={770} s={1.1} light="#3f9a54" dark="#2d7a44" /><TallPine x={1016} y={768} s={.9} /><Bush x={980} y={752} s={.8} /></>
  };
}

/** Phone landscape (390 × 612 template). */
function phoneLand(): Land {
  const H = PH + 400;
  return {
    sun: [70, 268, 22],
    sky: <><Cloud x={170} y={300} s={.3} className="il-drift2" shadow /><Cloud x={370} y={246} s={.26} shadow /><Birds x={130} y={236} s={.55} /><Balloon x={150} y={356} s={.34} /></>,
    range: [`M-40 404 L0 404 C24 386 46 372 70 374 C94 376 110 394 136 388 C160 382 176 370 200 380 C220 388 236 400 250 410 V${H} H-40Z`,
      `M-40 428 L0 428 C40 414 80 408 120 416 C160 424 190 418 230 430 L260 440 V${H} H-40Z`],
    h1: `M-40 446 L0 446 C60 432 120 440 180 448 C220 454 250 464 280 476 V${H} H-40Z`,
    village: <><Field x={150} y={458} w={50} h={8} skew={2} color="#e8ecb4" line="#d4da98" /><House x={34} y={446} s={.3} roof="#ff9ab4" /><House x={58} y={449} s={.27} roof="#ffc83d" /><Windmill x={104} y={444} s={.36} /><TallPine x={146} y={450} s={.3} /></>,
    h2: `M-40 488 L0 488 C60 474 120 482 180 494 C220 502 250 516 276 532 V${H} H-40Z`,
    h2deco: <><Field x={120} y={500} w={60} h={12} skew={3} color="#c6e6a6" line="#addb8e" /><Hedge x={118} y={516} w={66} s={.5} /><MeadowFlowers x={70} y={494} n={8} wx={90} wy={10} seed={3} s={.6} /><Bush x={150} y={500} s={.4} /></>,
    h3: `M-40 530 L0 530 C60 520 120 532 180 546 C200 552 214 560 224 570 V${H} H-40Z`,
    h3deco: <><RoundTree x={30} y={548} s={.5} /><Bush x={92} y={466} s={.3} /><MeadowFlowers x={120} y={548} n={12} wx={120} wy={10} seed={5} s={.7} /></>,
    stream: [[86, 462], [70, 492], [96, 524], [64, 566], [40, PH + 40]], streamW: [3, 30],
    front: `M-40 594 L0 594 C100 586 200 602 300 598 C340 596 370 594 ${PW + 40} 596 V${H} H-40Z`,
    frontDeco: <><MeadowFlowers x={200} y={604} n={14} wx={160} wy={10} seed={21} s={.8} /><MeadowFlowers x={320} y={600} n={8} wx={80} wy={12} seed={25} s={.8} /></>,
    lead: [[96, PH + 40], [112, 598]],
    fore: <><RoundTree x={14} y={PH + 8} s={.8} /><TallPine x={376} y={PH + 6} s={.8} light="#3f9a54" dark="#2d7a44" /><TallPine x={352} y={PH + 2} s={.6} /></>
  };
}

/** Điểm số: the illustrated mountain, stakes "Đề 1..N" on its trail, Sóc on the latest flag, the summit flag at the target. */
export function SummitScene({ variant, W, H, points, hidden, target, latestIdx, ghost, cardBottom = 0, onOpenTest, onForce, bubble, gear }: SummitSceneProps) {
  const id = useId().replace(/:/g, '');
  const phone = variant === 'phone';
  const S = phone ? PHONE_SIZES : DESK_SIZES;
  const n = points.length;
  const popover = useScenePopover();

  // Template → scene: the desktop art is right-aligned in a scene at least MTN_W wide; the phone art is scaled to the
  // width, sits on the bottom edge, and moves down if the summit flag would hide under the card.
  const k = phone ? W / PW : 1;
  const summitTop = (PHONE_MT.ty + PEAK[1] * PHONE_MT.s - S.pole * 1.7 - 6) * k;
  const oy = phone ? Math.max(H - PH * k, cardBottom + 10 - summitTop) : 0;
  const dx = phone ? 0 : Math.max(0, W - MTN_W);
  const P: Placement = phone ? PHONE_MT : { tx: 0, ty: 0, s: 1 };
  const land = useMemo(() => (phone ? phoneLand() : deskLand(-dx)), [phone, dx]);

  const geo = useMemo(() => trailGeometry(P, n, phone ? 1 : 0), [P.tx, P.ty, P.s, n, phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const stakes = stakeCount(n);
  const fLast = geo.latest;
  const walked = n > 0 ? slicePts(geo.dense, 0, fLast) : [];
  const proj = n > 0 ? slicePts(geo.dense, fLast, 1) : geo.dense;
  const pj = polyline(proj);
  const snowY = place(P, [0, 250])[1];
  const dots: Pt[] = [];
  for (let d = S.dot * 2.2; d < pj.L - S.dot * 2; d += S.dot * 4.4) dots.push(pj.at(d / pj.L));
  const steps: ReactNode[] = [];
  if (walked.length > 1) {
    const wl = polyline(walked);
    for (let d = S.stepGap; d < wl.L; d += S.stepGap) {
      const a = wl.atLen(d), b = wl.atLen(Math.min(wl.L, d + 1));
      let ux = b[0] - a[0], uy = b[1] - a[1];
      const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
      const hh = S.trail * .42;
      steps.push(<line key={d} x1={(a[0] - uy * hh).toFixed(1)} y1={(a[1] + ux * hh).toFixed(1)} x2={(a[0] + uy * hh).toFixed(1)} y2={(a[1] - ux * hh).toFixed(1)} stroke="#dcc293" strokeWidth="1.4" strokeLinecap="round" />);
    }
  }
  const lead = sampleSmooth([...land.lead, geo.dense[0]], 3).pts;
  const rb = ribbon(land.stream, land.streamW[0], land.streamW[1]);
  const rbIn = ribbon(land.stream, land.streamW[0] * .55, land.streamW[1] * .62);
  const [px, py] = place(P, PEAK);
  const f = S.f;

  // Sóc beside the latest flag: steps up from the previous one on arrival.
  const lk = latestIdx >= 0 ? latestIdx : n - 1;
  const socF = n > 0 ? Math.min(1, geo.latest + .035) : .0;
  const [sx, sy] = n > 0 ? geo.at(socF) : [geo.at(0)[0] - S.socW * .9, geo.at(0)[1] + 2];
  const socMood: SocMood = n <= 1 ? 'hi' : 'proud';
  const climbRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const el = climbRef.current;
    if (!el || n < 1 || !el.animate || reduceMotion()) return;
    const from = n > 1 ? stakeAt(n - 2, stakes) + .02 : Math.max(0, socF - .06);
    const frames: Keyframe[] = [0, .33, .66].flatMap((t, i) => {
      const [a, b] = geo.at(from + (socF - from) * t);
      const x = a - sx, y = b - sy;
      return [{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, offset: i / 3 }, { transform: `translate(${x.toFixed(1)}px, ${(y - 5).toFixed(1)}px)`, offset: i / 3 + 1 / 6 }];
    });
    frames.push({ transform: 'translate(0px, 0px)', offset: 1 });
    const anim = el.animate(frames, { duration: 1100, delay: 500, easing: 'cubic-bezier(.45, 0, .35, 1)', fill: 'backwards' });
    return () => anim.cancel();
  }, [n, stakes, socF, sx, sy]); // eslint-disable-line react-hooks/exhaustive-deps

  const flags = points.map((p, i) => {
    const [x0, y] = geo.stakes[i];
    const x = x0 - f * .7, top = y - S.pole, cw = f * 3.1, ch = f * 1.4;
    const latest = i === lk, out = p.excluded;
    const delta = i > 0 ? p.score - points[i - 1].score : null;
    const sub = <>{p.testName}{delta !== null && delta !== 0 && <> · {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} so với đề trước</>}</>;
    const fill = out ? '#fff' : latest ? '#ffc83d' : '#ff8fb0';
    return (
      <g key={p.id} className="sm-plant" style={{ '--dl': `${.15 + i * .12}s`, transformOrigin: `${x}px ${y}px` } as CSSProperties}>
        <g {...popover.tapProps({ key: p.id, title: `${p.score} điểm · ${ddmm(p.date)}`, sub, action: { label: 'Xem đề này', run: () => onOpenTest(p.id) } },
          `${ddmm(p.date)} · ${p.testName}: ${p.score}`)} data-guide={latest ? 'journey' : undefined} data-guide-avoid={latest ? undefined : 'journey'}>
          <rect className="il-ring" x={x - cw - 4} y={top - 4} width={cw + 8} height={S.pole + 8} rx="6" />
          <ellipse cx={x} cy={y + 1} rx={f * .45} ry={f * .16} fill="#2f3a33" opacity=".18" />
          <line x1={x} y1={y} x2={x} y2={top - 2} stroke="#6b5a48" strokeWidth={f * .16} strokeLinecap="round" />
          <path className={latest ? 'il-wave' : undefined} style={{ transformOrigin: `${x}px ${top}px` }}
            d={`M${x - 1} ${top} H${x - cw} L${x - cw + f * .45} ${top + ch / 2} L${x - cw} ${top + ch} H${x - 1}Z`}
            fill={fill} stroke={out ? '#a3aba5' : latest ? '#e0a417' : '#ec6f93'} strokeWidth="1.2" strokeDasharray={out ? '4 3' : undefined} />
          <text x={x - cw * .45} y={top + ch * .72} textAnchor="middle" fontWeight="900" fontSize={f * .82} fill={out ? '#8a948c' : latest ? '#5a3d00' : '#fff'}>{p.score}</text>
          <text x={x - f * .35} y={y + f * .15} textAnchor="end" fontWeight="800" fontSize={f * .66} fill="#5d6b5f" paintOrder="stroke" stroke="#fff8ee" strokeWidth="3">{ddmm(p.date)}</text>
        </g>
        {out && onForce && (
          <g className="il-tap" role="button" tabIndex={0} aria-label={`Vẫn tính đề ${ddmm(p.date)}`} onClick={() => onForce(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onForce(p.id); } }}>
            <rect x={x - 100} y={y + f * .5} width="96" height={f * 1.4} rx={f * .7} fill="#fff" stroke="#d5dcd6" strokeWidth="1.5" />
            <text x={x - 52} y={y + f * 1.45} textAnchor="middle" fontWeight="900" fontSize={f * .68} fill="#1c8fe3">Vẫn tính đề này</text>
          </g>
        )}
      </g>
    );
  });

  const empty: ReactNode[] = [];
  for (let k2 = n; k2 < stakes; k2++) {
    const [gx, gy] = geo.stakes[k2], x = gx - f * .7, bw = f * 3.1, bh = f * 1.35;
    empty.push(
      <g key={'e' + k2} transform={`translate(${x.toFixed(1)} ${gy.toFixed(1)})`} aria-hidden="true">
        <ellipse cx="0" cy="1" rx={f * .4} ry={f * .14} fill="#2f3a33" opacity=".12" />
        <line x1="0" y1="0" x2="0" y2={-S.pole} stroke="#a7aebd" strokeWidth={f * .14} strokeDasharray="3 3" strokeLinecap="round" />
        <rect x={-bw} y={-S.pole} width={bw} height={bh} rx={f * .35} fill="rgba(255,255,255,.72)" stroke="#a7aebd" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x={-bw / 2} y={-S.pole + bh * .7} textAnchor="middle" fontWeight="900" fontSize={f * .72} fill="#7d8597">Đề {hidden + k2 + 1}</text>
      </g>
    );
  }

  const fp = S.pole * 1.7;
  const sceneW = phone ? W / k : W;
  return (
    <div className={'sm' + (phone ? ' sm--phone' : '')} style={{ width: W, height: H }}>
      <svg className="sm-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Leo núi tới ${target}: ${n} đề đã cắm cờ${n ? `, mới nhất ${points[lk]?.score}` : ''}`}>
        <defs>
          <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffdcc2" /><stop offset=".45" stopColor="#fff0dd" /><stop offset="1" stopColor="#e8f3fb" /></linearGradient>
          <radialGradient id={`${id}glow`}><stop offset="0" stopColor="#fff1b8" stopOpacity=".9" /><stop offset=".5" stopColor="#ffe7a3" stopOpacity=".35" /><stop offset="1" stopColor="#ffe7a3" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${id}lit`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c7d5f1" /><stop offset=".55" stopColor="#a9bce3" /><stop offset="1" stopColor="#9bb2dc" /></linearGradient>
          <linearGradient id={`${id}shade`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8197c8" /><stop offset="1" stopColor="#6a7fb2" /></linearGradient>
          <linearGradient id={`${id}far`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d3dcf0" /><stop offset="1" stopColor="#e4eaf5" /></linearGradient>
          <linearGradient id={`${id}haze`} gradientUnits="userSpaceOnUse" x1="0" y1="430" x2="0" y2="700"><stop offset="0" stopColor="#fff6ea" stopOpacity="0" /><stop offset="1" stopColor="#f4f8f2" stopOpacity=".75" /></linearGradient>
          <linearGradient id={`${id}shoulder`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#96d69c" /><stop offset="1" stopColor="#6cc278" /></linearGradient>
          <linearGradient id={`${id}h1`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6ecc9" /><stop offset="1" stopColor="#c2e2b8" /></linearGradient>
          <linearGradient id={`${id}h2`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b6e0ae" /><stop offset="1" stopColor="#9bd49c" /></linearGradient>
          <linearGradient id={`${id}h3`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#93d297" /><stop offset="1" stopColor="#7cc887" /></linearGradient>
          <linearGradient id={`${id}front`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fc47a" /><stop offset="1" stopColor="#58b268" /></linearGradient>
          <linearGradient id={`${id}range`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9e0f1" /><stop offset="1" stopColor="#eef0f3" /></linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${id}sky)`} />
        <g transform={`translate(${dx} ${oy}) scale(${k})`}>
          <g aria-hidden="true">
            <Sun x={land.sun[0]} y={land.sun[1]} r={land.sun[2]} rays glowId={`${id}glow`} />
            {land.sky}
            <path d={land.range[0]} fill={`url(#${id}range)`} /><path d={land.range[1]} fill="#d2dcec" opacity=".85" />
            <path d={land.h1} fill={`url(#${id}h1)`} /><g className="il-decor">{land.village}</g>
            <path d={land.h2} fill={`url(#${id}h2)`} />{land.h2deco}
            <g transform={`translate(${P.tx} ${P.ty}) scale(${P.s})`}><MountainArt id={id} /></g>
            <path d={land.h3} fill={`url(#${id}h3)`} />{land.h3deco}
            <path d={land.front} fill={`url(#${id}front)`} />
            <path d={rb.poly} fill="#86c9ec" /><path d={rbIn.poly} fill="#b4e2f8" />
            <path className="il-shimmer" d={rb.mid} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="5 22" strokeLinecap="round" opacity=".85" />
            {land.frontDeco}
            <path d={linePath(lead)} fill="none" stroke="#d9c08c" strokeWidth={S.trail + 3} strokeLinecap="round" opacity=".55" />
            <path d={linePath(lead)} fill="none" stroke="#f3e3bf" strokeWidth={S.trail} strokeLinecap="round" opacity=".85" />
            {walked.length > 1 && <>
              <path d={linePath(walked)} fill="none" stroke="#dcc595" strokeWidth={S.trail + 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={linePath(walked)} fill="none" stroke="#f7e8c6" strokeWidth={S.trail} strokeLinecap="round" strokeLinejoin="round" />
              {steps}
            </>}
            {dots.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={S.dot} fill={y < snowY ? '#9fb2d6' : '#fff'} opacity={ghost ? .38 : .95} />)}
          </g>

          <g transform={`translate(${px} ${py})`} className="sm-summit">
            <line x1="0" y1="2" x2="0" y2={-fp} stroke="#3a463e" strokeWidth={f * .22} strokeLinecap="round" />
            <path className="il-wave" style={{ transformOrigin: `0px ${-fp}px` }}
              d={`M1 ${-fp} Q${f * 1.9} ${-fp - f * .3} ${f * 3.4} ${-fp + f * .6} Q${f * 1.9} ${-fp + f * 1.3} 1 ${-fp + f * 1.4}Z`} fill="#ff7a9c" />
            <text x={f * 1.55} y={-fp + f * .95} textAnchor="middle" fontWeight="900" fontSize={f * .82} fill="#fff">{target}</text>
            <MiniTrophy x={-f * 1.2} y={4} k={f / 16 * .95} />
            <Twinkle x={-f * 2.3} y={-f * 1.4} r={f * .42} delay={1.4} /><Twinkle x={-f * .2} y={-f * 2.2} r={f * .3} delay={1.7} /><Twinkle x={f * 2.6} y={f * .5} r={f * .26} delay={2} />
          </g>

          {empty}
          {flags}

          <g transform={`translate(${sx.toFixed(1)} ${sy.toFixed(1)})`} aria-hidden="true">
            <g ref={climbRef}><g className="il-bob"><SocSprite x={0} y={2} w={S.socW} mood={socMood} gear={gear} /></g></g>
          </g>
          <g aria-hidden="true">{land.fore}</g>
        </g>
      </svg>
      {bubble && !phone && n > 0 && <div className="sm-bub" style={{ right: sceneW - (sx + dx - S.socW * .7), top: sy + oy - S.socW * 1.1 - 26 }}>{bubble}</div>}
      {popover.node}
    </div>
  );
}

