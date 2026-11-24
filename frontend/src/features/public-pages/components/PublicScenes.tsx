/**
 * Illustrations of the public pages (Giới thiệu, legal pages): the hero road to the trophy, the three step scenes and
 * the meadow under the footer. Built from the shared kit (shared/illustrations) so they match Hôm nay and Hành trình.
 * Purely decorative: every SVG is aria-hidden next to its own text.
 */
import { useId } from 'react';
import { Balloon, Birds, Bush, Cloud, FlowerDots, House, Pine, Sun, Tree, Windmill } from '@/shared/illustrations/Scenery';
import { Coin, FlowerArch, MiniTrophy, Podium, SocSprite, Stone } from '@/shared/illustrations/Landmarks';
import { smoothPath, type Pt } from '@/shared/illustrations/geometry';

function Defs({ uid, top = "#ffe7cf" }: { uid: string; top?: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset=".55" stopColor="#fff4e4" /><stop offset="1" stopColor="#eaf6ff" /></linearGradient>
      <linearGradient id={`${uid}mead`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9e5bd" /><stop offset="1" stopColor="#8fd197" /></linearGradient>
      <radialGradient id={`${uid}glow`}><stop offset="0" stopColor="#b8f0c2" stopOpacity=".9" /><stop offset="1" stopColor="#b8f0c2" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${uid}sun`}><stop offset="0" stopColor="#fff3b0" stopOpacity=".9" /><stop offset="1" stopColor="#fff3b0" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${uid}spot`}><stop offset="0" stopColor="#fff3b0" stopOpacity=".95" /><stop offset=".6" stopColor="#ffe58a" stopOpacity=".35" /><stop offset="1" stopColor="#ffe58a" stopOpacity="0" /></radialGradient>
    </defs>
  );
}

/** Sandy road with a dashed centre line through the points. */
function Road({ pts, w }: { pts: Pt[]; w: number }) {
  const d = smoothPath(pts);
  return (
    <g>
      <path d={d} fill="none" stroke="#e2c287" strokeWidth={w + 4} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 4)" />
      <path d={d} fill="none" stroke="#f8e6bf" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path className="pub-roadline" d={d} fill="none" stroke="#fff" strokeWidth={Math.max(2.5, w * .08)} strokeLinecap="round" strokeDasharray={`${w * .3} ${w * .45}`} opacity=".9" />
    </g>
  );
}

/** Hero of Giới thiệu, computer: the road winds from the left to the trophy, Sóc waves from the green coin. */
export function HeroSceneDesk() {
  const uid = useId().replace(/:/g, '');
  const road: Pt[] = [[-40, 600], [250, 548], [530, 566], [800, 506], [960, 438], [1090, 404], [1215, 392]];
  return (
    <svg className="pub-hero__art pub-hero__art--desk" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <Defs uid={uid} />
      <rect width="1440" height="600" fill={`url(#${uid}sky)`} />
      <Sun x={1010} y={128} r={50} rays glowId={`${uid}sun`} />
      <Cloud x={770} y={96} s={1.05} shadow />
      <Cloud x={1290} y={74} s={.85} className="il-drift2" />
      <Cloud x={1380} y={250} s={.55} />
      <Birds x={860} y={200} s={.9} />
      <Balloon x={1150} y={230} s={.85} />

      <path d="M0 410 C180 372 400 392 640 380 S1010 336 1210 346 S1440 332 1440 332 V600 H0Z" fill="#cdeccb" />
      <Pine x={690} y={384} s={.9} /><Pine x={722} y={388} s={.65} />
      <Windmill x={1370} y={370} s={.95} />
      <House x={1010} y={362} s={.75} roof="#6fb7ff" />
      <Pine x={1290} y={352} s={.8} />
      <path d="M0 452 C300 418 700 440 1000 408 S1300 388 1440 396 V600 H0Z" fill={`url(#${uid}mead)`} />
      <House x={470} y={468} s={.9} roof="#ff8fb0" />
      <Tree x={110} y={492} s={.95} /><Tree x={160} y={500} s={.65} color="#5cbf6b" />
      <Tree x={1395} y={560} s={1.05} />
      <Bush x={680} y={596} s={1} /><Bush x={1100} y={560} s={.9} /><Bush x={36} y={590} s={.8} />
      <FlowerDots x={420} y={605} n={14} spread={220} seed={3} />
      <FlowerDots x={980} y={540} n={12} spread={200} seed={7} />
      <FlowerDots x={1290} y={470} n={10} spread={160} seed={11} />

      <Road pts={road} w={46} />
      <ellipse cx={1250} cy={340} rx={130} ry={130} fill={`url(#${uid}spot)`} />
      <FlowerArch x={1115} y={404} s={.78} font={15} />
      <Podium id={`${uid}t`} x={1255} y={400} s={1} label="850" />
      <Coin x={250} y={548} r={30} text="450" />
      <Coin x={530} y={566} r={30} text="550" />
      <Coin x={800} y={506} r={33} text="650" today glowId={`${uid}glow`} />
      <Stone x={960} y={438} r={27} f={20} text="750" next glowId={`${uid}glow`} />
      <g className="pub-hero__soc"><SocSprite x={800} y={500} w={124} mood="hi" className="il-bob" /></g>
    </svg>
  );
}

/** Hero of Giới thiệu, phone: the same world, the road climbing to the trophy in a short band. */
export function HeroScenePhone() {
  const uid = useId().replace(/:/g, '');
  const road: Pt[] = [[-30, 300], [78, 270], [196, 266], [318, 236], [340, 196], [292, 170], [228, 162]];
  return (
    <svg className="pub-hero__art pub-hero__art--phone" viewBox="0 0 390 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <Defs uid={uid} top="#fff8ee" />
      <rect width="390" height="300" fill={`url(#${uid}sky)`} />
      <Sun x={56} y={58} r={24} rays glowId={`${uid}sun`} />
      <Cloud x={322} y={48} s={.5} shadow />
      <Cloud x={150} y={88} s={.38} className="il-drift2" />
      <path d="M0 150 C100 128 250 140 390 118 V300 H0Z" fill="#cdeccb" />
      <Windmill x={44} y={158} s={.55} />
      <Pine x={360} y={128} s={.55} /><Pine x={378} y={134} s={.42} />
      <House x={120} y={160} s={.5} roof="#ff8fb0" />
      <path d="M0 178 C120 160 260 176 390 158 V300 H0Z" fill={`url(#${uid}mead)`} />
      <Tree x={372} y={296} s={.7} /><Bush x={22} y={292} s={.6} /><Bush x={262} y={296} s={.5} />
      <FlowerDots x={130} y={222} n={8} spread={120} seed={5} />
      <FlowerDots x={330} y={284} n={6} spread={90} seed={8} />
      <Road pts={road} w={30} />
      <ellipse cx={212} cy={128} rx={70} ry={70} fill={`url(#${uid}spot)`} />
      <Podium id={`${uid}t`} x={212} y={168} s={.58} label="850" />
      <Coin x={78} y={270} r={19} text="450" />
      <Coin x={196} y={266} r={21} text="650" today glowId={`${uid}glow`} />
      <Stone x={318} y={236} r={17} f={13} text="750" next glowId={`${uid}glow`} />
      <SocSprite x={196} y={262} w={78} mood="hi" className="il-bob" />
    </svg>
  );
}

/** Step 1 · Ghi điểm & chụp trang chữa bài: the corrected answer sheet framed by a phone camera. */
export function StepCaptureArt() {
  return (
    <svg className="pub-step__art" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
      <ellipse cx="170" cy="168" rx="150" ry="14" fill="#cfeed5" />
      <g transform="translate(132 30) rotate(-6)">
        <rect x="0" y="4" width="112" height="132" rx="10" fill="#d5ecd9" />
        <rect x="0" y="0" width="112" height="132" rx="10" fill="#fff" />
        <rect x="12" y="12" width="56" height="8" rx="4" fill="#46b35a" opacity=".85" />
        {[32, 50, 68, 86, 104].map((y, i) => (
          <g key={y}>
            <rect x="12" y={y} width={i === 2 ? 60 : 84} height="7" rx="3.5" fill={i === 2 ? '#ffe1e9' : '#eef1ee'} />
            <circle cx="98" cy={y + 3.5} r="5" fill="none" stroke={i === 2 ? '#ff7a9c' : '#dfe4df'} strokeWidth="2" />
          </g>
        ))}
        <ellipse cx="84" cy="71.5" rx="24" ry="11" fill="none" stroke="#ff7a9c" strokeWidth="3" />
      </g>
      <g transform="translate(212 58) rotate(9)">
        <rect x="0" y="0" width="74" height="112" rx="15" fill="#2f3a33" />
        <rect x="5" y="9" width="64" height="94" rx="10" fill="#eaf6ff" opacity=".35" />
        <path d="M13 22 V15 H20 M54 15 H61 V22 M61 88 V95 H54 M20 95 H13 V88" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="37" cy="56" r="9" fill="none" stroke="#ffd766" strokeWidth="2.5" />
        <circle cx="37" cy="56" r="3" fill="#ffd766" />
      </g>
      <Coin x={44} y={42} r={22} text="785" />
      <SocSprite x={70} y={170} w={96} mood="focus" />
    </svg>
  );
}

/** Step 2 · Sóc đọc câu sai, giải thích: Sóc thinking beside the explained question card. */
export function StepExplainArt() {
  return (
    <svg className="pub-step__art" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
      <ellipse cx="160" cy="168" rx="150" ry="14" fill="#e4dcff" />
      <circle cx="116" cy="66" r="5" fill="#c9b4ff" /><circle cx="128" cy="50" r="7" fill="#c9b4ff" />
      <g transform="translate(140 18)">
        <rect x="0" y="5" width="164" height="140" rx="16" fill="#e1d8ff" />
        <rect x="0" y="0" width="164" height="140" rx="16" fill="#fff" />
        <text x="16" y="28" fontWeight="900" fontSize="14" fill="#2f3a33">Câu 132</text>
        {['A', 'B', 'C', 'D'].map((l, i) => {
          const x = 30 + i * 34, right = l === 'C', wrong = l === 'B';
          return (
            <g key={l}>
              <circle cx={x} cy="54" r="13" fill={right ? '#46b35a' : '#fff'} stroke={right ? '#2f8a42' : wrong ? '#ff7a9c' : '#e2e6e2'} strokeWidth={wrong ? 2.5 : 2} strokeDasharray={wrong ? '4 3' : undefined} />
              <text x={x} y="59" textAnchor="middle" fontWeight="900" fontSize="13" fill={right ? '#fff' : wrong ? '#d6416a' : '#8a958e'}>{l}</text>
            </g>
          );
        })}
        <rect x="16" y="80" width="132" height="8" rx="4" fill="#ece6ff" />
        <rect x="16" y="96" width="112" height="8" rx="4" fill="#ece6ff" />
        <rect x="16" y="114" width="66" height="16" rx="8" fill="#fff3d1" />
        <text x="49" y="126" textAnchor="middle" fontWeight="800" fontSize="10" fill="#b07a00">từ mới</text>
      </g>
      <SocSprite x={66} y={170} w={100} mood="think" />
    </svg>
  );
}

/** Step 3 · Ôn đúng hạn, leo lên cúp: a little hill of coins up to the cup, today's due cards pinned on top. */
export function StepClimbArt() {
  return (
    <svg className="pub-step__art" viewBox="0 0 320 180" aria-hidden="true" focusable="false">
      <path d="M0 180 C70 150 150 150 200 118 S290 82 320 80 V180Z" fill="#ffe6a6" />
      <path d="M0 180 C80 166 170 160 230 134 S300 110 320 108 V180Z" fill="#ffd97a" opacity=".55" />
      <path d="M40 164 C90 150 130 140 160 126 S220 100 250 92" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 8" opacity=".9" />
      <Coin x={58} y={150} r={16} text="650" />
      <Coin x={114} y={136} r={16} text="700" />
      <Coin x={170} y={122} r={17} text="750" today />
      <Podium id="pp-climb" x={262} y={98} s={.52} label="850" />
      <g transform="translate(26 22) rotate(-5)">
        <rect x="0" y="3" width="86" height="58" rx="11" fill="#f1d9a0" />
        <rect x="0" y="0" width="86" height="58" rx="11" fill="#fff" />
        <path d="M0 11 a11 11 0 0 1 11 -11 h64 a11 11 0 0 1 11 11 v7 h-86Z" fill="#ff7a9c" />
        <text x="43" y="14" textAnchor="middle" fontWeight="900" fontSize="10" fill="#fff">Hôm nay</text>
        <text x="43" y="44" textAnchor="middle" fontWeight="900" fontSize="17" fill="#2f3a33">3 thẻ</text>
      </g>
      <SocSprite x={170} y={116} w={66} mood="proud" />
    </svg>
  );
}

/** Xếp hạng extra: a blue podium with stars. */
export function RankArt() {
  return (
    <svg className="pub-extra__art" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <rect x="6" y="40" width="28" height="28" rx="5" fill="#8db8f0" />
      <rect x="34" y="26" width="28" height="42" rx="5" fill="#3b7ddd" />
      <rect x="62" y="48" width="28" height="20" rx="5" fill="#b7d2f6" />
      <text x="48" y="54" textAnchor="middle" fontWeight="900" fontSize="16" fill="#fff">1</text>
      {[[48, 12, 9], [20, 28, 6.5], [76, 36, 6]].map(([x, y, r]) => (
        <path key={x} d={`M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3}Z`} fill="#ffc83d" />
      ))}
    </svg>
  );
}

/** Meadow strip above the footer of every public page. */
export function MeadowStrip() {
  return (
    <svg className="pub-meadow" viewBox="0 0 1440 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path d="M0 70 C240 40 480 66 760 52 S1200 30 1440 46 V120 H0Z" fill="#cdeccb" />
      <Pine x={210} y={58} s={.7} /><Pine x={236} y={62} s={.5} />
      <House x={980} y={50} s={.6} roof="#6fb7ff" />
      <Windmill x={1260} y={46} s={.55} />
      <MiniTrophy x={1360} y={48} k={1.1} />
      <path d="M0 96 C300 76 700 92 1000 80 S1300 74 1440 80 V120 H0Z" fill="#a9dcae" />
      <Tree x={90} y={104} s={.7} /><Bush x={560} y={100} s={.7} /><Tree x={1400} y={110} s={.6} color="#5cbf6b" />
      <FlowerDots x={760} y={102} n={10} spread={260} seed={13} />
    </svg>
  );
}
