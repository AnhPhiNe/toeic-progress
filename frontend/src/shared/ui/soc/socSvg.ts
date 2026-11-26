/* Port of design/previews/_soc.js (approved 2D Sóc). Keep in sync with the sketches.
 * Expressions from design/previews/mock-soc-variety.html change only eyes, mouth, brows, cheeks and small extras:
 * Sóc never raises or extends an arm, every pose keeps the two short paws at the belly. */
import { GEAR_MARK, applyGear } from './socGear';
import { applyCoat } from './socCoat';
/**
 * idle = Vui (default) · proud = Tự hào · surprised = Ngạc nhiên · focus = Tập trung (reading glasses) ·
 * sad = Buồn nhẹ · zzz = Ngủ gật · think = đang đọc (dots) · hi = chào · mix = khuấy bột · focusMix = khuấy bột, tập trung · yay = nhảy.
 */
export type SocState = 'idle' | 'think' | 'yay' | 'sad' | 'zzz' | 'hi' | 'mix' | 'proud' | 'surprised' | 'focus' | 'focusMix';
/** Every base state, for tests and previews. */
export const SOC_STATES: readonly SocState[] = ['idle', 'think', 'yay', 'sad', 'zzz', 'hi', 'mix', 'proud', 'surprised', 'focus', 'focusMix'];

const D = '#3a2a1e', F = '#f4a261', F2 = '#e58a45', C = '#fff1dc';
const ST = `fill="none" stroke="${D}" stroke-linecap="round"`;
const dotEye = (x: number, look: boolean) => `<g class="lid"><ellipse cx="${x}" cy="112" rx="11.5" ry="13.5" fill="${D}"/><g class="${look ? 'look' : ''}"><circle cx="${x + 4}" cy="106.5" r="4.8" fill="#fff"/><circle cx="${x - 4}" cy="118" r="2.2" fill="#fff"/></g></g>`;

function eye(x: number, s: SocState): string {
  if (s === 'yay') return `<path d="M${x - 12} 116 Q${x} 99 ${x + 12} 116" ${ST} stroke-width="6"/>`;
  if (s === 'proud') return `<path d="M${x - 11} 116 Q${x} 104 ${x + 11} 116" ${ST} stroke-width="4.5"/>`;
  if (s === 'zzz') return `<path d="M${x - 11} 114 Q${x} 122 ${x + 11} 114" ${ST} stroke-width="4.5"/>`;
  if (s === 'think') return `<ellipse cx="${x}" cy="112" rx="11.5" ry="13.5" fill="${D}"/><circle cx="${x + 5}" cy="104" r="5" fill="#fff"/><circle cx="${x - 2}" cy="115" r="2" fill="#fff"/>`;
  if (s === 'surprised') return `<g class="lid"><ellipse cx="${x}" cy="112" rx="13" ry="15.5" fill="${D}"/><circle cx="${x + 5}" cy="106" r="5.5" fill="#fff"/><circle cx="${x - 4}" cy="119" r="2.2" fill="#fff"/></g>`;
  if (s === 'sad') return `<g class="lid"><ellipse cx="${x}" cy="116" rx="10" ry="11" fill="${D}"/><circle cx="${x + 3}" cy="112" r="3.6" fill="#fff"/></g>`;
  return dotEye(x, s !== 'focus' && s !== 'focusMix');
}
const FLAT = `<path d="M102 136 H118" ${ST} stroke-width="3.2"/>`;
const MOUTH: Partial<Record<SocState, string>> = {
  yay: `<path d="M100 130 Q110 150 120 130Z" fill="#8e3b2f"/><ellipse cx="110" cy="140" rx="5" ry="3.5" fill="#ff8f80"/><rect x="106" y="130" width="8" height="5" rx="1.5" fill="#fff"/>`,
  proud: `<path d="M98 132 Q110 148 122 132Z" fill="#7a3a2b"/><ellipse cx="110" cy="140.5" rx="5" ry="3" fill="#ff8f80"/>`,
  surprised: `<ellipse cx="110" cy="138" rx="6" ry="7.5" fill="#7a3a2b"/>`,
  sad: `<path d="M101 140 Q110 132 119 140" ${ST} stroke-width="3.2"/>`,
  zzz: `<ellipse cx="110" cy="137" rx="4" ry="3" fill="#7a3a2b"/>`,
  think: `<ellipse cx="110" cy="137" rx="3.5" ry="4.5" fill="#8e3b2f"/>`,
  focus: FLAT,
  focusMix: FLAT
};
const SMILE = `<path d="M99 133 Q104.5 141 110 133 Q115.5 141 121 133" ${ST} stroke-width="3.2" stroke-linejoin="round"/>`;
/** Reading glasses of Tập trung: thinner than the Kính tròn accessory, drawn with the face. */
const READING = `<g ${ST} stroke-width="3.5"><circle cx="82" cy="112" r="20"/><circle cx="138" cy="112" r="20"/><path d="M102 110 Q110 104 118 110"/></g>`;
const cheeks = (s: SocState) => s === 'proud'
  ? `<ellipse cx="62" cy="134" rx="15" ry="9.5" fill="#ff8a8a" opacity=".85"/><ellipse cx="158" cy="134" rx="15" ry="9.5" fill="#ff8a8a" opacity=".85"/>`
  : `<ellipse cx="64" cy="136" rx="13" ry="8" fill="#ff9e8f" opacity=".7"/><ellipse cx="156" cy="136" rx="13" ry="8" fill="#ff9e8f" opacity=".7"/>`;
function sparkStar(x: number, y: number, r: number): string {
  let p = '';
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
    p += (i ? 'L' : 'M') + (x + rr * Math.cos(a)).toFixed(1) + ' ' + (y + rr * Math.sin(a)).toFixed(1);
  }
  return `<path class="spark" d="${p}Z" fill="#ffc83d"/>`;
}
function extraOf(s: SocState): string {
  if (s === 'think') return `<g fill="#8fa3b8"><circle class="d1" cx="176" cy="34" r="5.5"/><circle class="d2" cx="192" cy="34" r="5.5"/><circle class="d3" cx="208" cy="34" r="5.5"/></g>`;
  if (s === 'zzz') return `<g font-family="Nunito" font-weight="900" fill="#8a7aa0"><text class="z1" x="176" y="66" font-size="22">z</text><text class="z2" x="194" y="44" font-size="17">z</text></g>`;
  if (s === 'surprised') return sparkStar(194, 60, 10) + sparkStar(34, 66, 7);
  if (s === 'proud') return `<path class="spark" d="M188 64 l2.6 6 6.4 2.6 -6.4 2.6 -2.6 6 -2.6 -6 -6.4 -2.6 6.4 -2.6Z" fill="#ffd766"/>`;
  return '';
}
const BROWS: Partial<Record<SocState, string>> = {
  sad: `<path d="M68 101 Q80 94 92 92M152 101 Q140 94 128 92" ${ST} stroke-width="3.5"/>`,
  surprised: `<path d="M70 88 Q82 82 94 87M150 88 Q138 82 126 87" ${ST} stroke-width="3.5"/>`
};
/** The two short paws at the belly: the only arms Sóc ever has. */
const PAWS = `<ellipse cx="88" cy="202" rx="10" ry="16" transform="rotate(-38 88 202)" fill="${F2}"/><ellipse cx="132" cy="202" rx="10" ry="16" transform="rotate(38 132 202)" fill="${F2}"/>`;

const BOWL=`<g transform="translate(110 210)"><path d="M-36 -6 H36 C34 18 20 28 0 28 C-20 28 -34 18 -36 -6Z" fill="#fff" stroke="#e6e0f5" stroke-width="3"/><path d="M-33 2 H33" stroke="#ffd1dc" stroke-width="4"/><ellipse cx="0" cy="-6" rx="36" ry="8" fill="#fff6e0" stroke="#e6e0f5" stroke-width="3"/><ellipse cx="0" cy="-5" rx="28" ry="5" fill="#ffe2a8"/></g>`;
/** SVG markup for Sóc in one state (Nâu cam, no gear); layered groups animate via soc.css. */
export function socSvg(s: SocState): string {
  const ear = s === 'zzz' ? 30 : s === 'sad' ? 18 : 0;
  const nut = `<g class="${s === 'idle' ? 'nut' : ''}"><ellipse cx="0" cy="5" rx="12" ry="14" fill="#e9b872"/><ellipse cx="-4" cy="2" rx="3" ry="6" fill="#fff" opacity=".35"/><path d="M-14 0 Q0 -18 14 0 Q0 6 -14 0Z" fill="#8e5a35"/><rect x="-2" y="-16" width="4" height="7" rx="2" fill="#8e5a35"/></g>`;
  const mouth = MOUTH[s] ?? SMILE;
  const glasses = s === 'focus' || s === 'focusMix' ? READING : '';
  const nutAt = s === 'mix' || s === 'focusMix' ? BOWL : s === 'yay' ? `<g transform="translate(110,22)"><g class="toss">${nut}</g></g>` : `<g transform="translate(110,202)">${nut}</g>`;
  const cf = s === 'yay' ? ([[30, 70, '#ff7a9c'], [196, 60, '#ffc83d'], [20, 150, '#46b35a'], [214, 140, '#a78bfa'], [60, 30, '#1c8fe3']] as Array<[number, number, string]>).map((c, i) => `<rect class="cf" style="animation-delay:${i * .08}s" x="${c[0]}" y="${c[1]}" width="9" height="14" rx="2.5" fill="${c[2]}" transform="rotate(${i * 37} ${c[0]} ${c[1]})"/>`).join('') : '';
  const cls = s === 'hi' ? 's-hi s-greet' : s === 'focusMix' ? 's-focus s-mix' : `s-${s}`;
  return `<svg viewBox="0 0 240 260" class="${cls}"><ellipse class="shadow" cx="112" cy="246" rx="62" ry="8" fill="#2f3a33" opacity=".1"/>${cf}
  <g class="all">${GEAR_MARK.back}
  <g class="tail"><path d="M146 232 C208 240 236 186 216 134 C203 100 164 98 156 128 C151 148 170 158 179 146 C181 170 168 196 140 206Z" fill="${F2}"/><path d="M160 219 C197 214 214 180 201 143 C195 126 177 122 170 133" fill="none" stroke="#ffe3c2" stroke-width="12" stroke-linecap="round"/></g>
  <g class="body">
    <ellipse cx="90" cy="238" rx="17" ry="9" fill="#d9773a"/><ellipse cx="130" cy="238" rx="17" ry="9" fill="#d9773a"/>
    <ellipse cx="110" cy="200" rx="40" ry="38" fill="${F}"/><ellipse cx="110" cy="206" rx="25" ry="28" fill="${C}"/>
    <g class="head">
      <g transform="rotate(${-ear} 74 60)"><g class="earL"><path d="M56 64 C44 22 70 12 90 48Z" fill="${F}"/><path d="M63 55 C57 33 70 27 81 47Z" fill="#ffb5a7"/></g></g>
      <g transform="rotate(${ear} 146 60)"><g class="earR"><path d="M164 64 C176 22 150 12 130 48Z" fill="${F}"/><path d="M157 55 C163 33 150 27 139 47Z" fill="#ffb5a7"/></g></g>
      <path d="M110 38 C160 38 186 74 186 110 C186 148 152 162 110 162 C68 162 34 148 34 110 C34 74 60 38 110 38Z" fill="${F}"/>
      <path d="M98 44 C102 28 112 28 110 42 C117 30 126 35 119 47Z" fill="${F2}"/>
      <path d="M48 118 C48 88 84 92 110 106 C136 92 172 88 172 118 C172 148 142 160 110 160 C78 160 48 148 48 118Z" fill="${C}"/>
      ${cheeks(s)}
      ${BROWS[s] ?? ''}${eye(82, s)}${eye(138, s)}${glasses}
      <ellipse cx="110" cy="127" rx="5.5" ry="4" fill="#7a4a2b"/>${mouth}${extraOf(s)}${GEAR_MARK.head}
    </g>
    ${GEAR_MARK.front}${nutAt}${PAWS}
  </g></g></svg>`;
}


/* ---- Celebrations from design/previews/mock-soc-cheer.html (approved B, C, D; no raised arms) ---- */
/** cheerCplus = the stronger bounce with a confetti burst, for a new step. */
export type SocCheer = 'cheerB' | 'cheerC' | 'cheerCplus' | 'cheerD';
export type SocMood = SocState | SocCheer;

const heart = (x: number, y: number, c: string, d: number) => `<g transform="translate(${x} ${y})"><path class="ov" style="animation-delay:${d}s" d="M0 4 C-7 -5 -16 2 0 14 C16 2 7 -5 0 4Z" fill="${c}"/></g>`;
const noteG = (x: number, y: number, c: string, d: number, tx: number) => `<g transform="translate(${x} ${y})"><g class="ov" style="animation-delay:${d}s;--tx:${tx}px"><rect x="6" y="-18" width="3.5" height="20" rx="1.5" fill="${c}"/><path d="M9.5 -18 q10 2 10 10 q-3 -5 -10 -5Z" fill="${c}"/><ellipse cx="3" cy="3" rx="6" ry="4.6" fill="${c}"/></g></g>`;
function burst(cx: number, cy: number, n: number, R: number, cols: string[]): string {
  let h = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 - Math.PI / 2, r = R * (0.8 + (i % 3) * 0.15);
    h += `<g transform="translate(${cx} ${cy})"><rect class="pt" style="--tx:${(Math.cos(a) * r).toFixed(1)}px;--ty:${(Math.sin(a) * r).toFixed(1)}px;--r:${i * 47}deg" x="-4" y="-6" width="${i % 2 ? 8 : 9}" height="${i % 2 ? 8 : 13}" rx="2.5" fill="${cols[i % cols.length]}"/></g>`;
  }
  return h;
}
function starP(x: number, y: number, r: number, c: string): string {
  let p = '';
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
    p += (i ? 'L' : 'M') + (x + rr * Math.cos(a)).toFixed(1) + ' ' + (y + rr * Math.sin(a)).toFixed(1);
  }
  return `<path class="star-e" d="${p}Z" fill="${c}" stroke="#3a2a1e" stroke-width="2.5" stroke-linejoin="round"/>`;
}

function cheerSvg(k: 'B' | 'C' | 'D'): string {
  let s = socSvg('yay').replace('class="s-yay"', `class="s-c${k}"`)
    .replace('<g transform="translate(110,22)">', '<g transform="translate(110,202)">');
  if (k === 'B') s = s.replace('</svg>', heart(78, 58, '#ff7a9c', 0) + heart(150, 46, '#ff9eb8', 0.12) + heart(116, 30, '#ff7a9c', 0.24) + '</svg>');
  if (k === 'C') s = s.replace('</svg>', noteG(176, 96, '#a78bfa', 0, 18) + noteG(44, 110, '#1c8fe3', 0.8, -16) + noteG(190, 150, '#46b35a', 1.6, 22) + '</svg>');
  if (k === 'D') {
    s = s.replace(/<path d="M70 116 Q82 99 94 116"[^>]*\/>/, starP(82, 112, 15, '#ffd766')).replace(/<path d="M126 116 Q138 99 150 116"[^>]*\/>/, starP(138, 112, 15, '#ffd766'));
    let ring = '';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, x = 112 + Math.cos(a) * 112, y = 130 + Math.sin(a) * 100;
      ring += `<g transform="translate(${x} ${y})"><path class="ring" style="animation-delay:${i * 0.05}s" d="M0 -9 l2.6 6 6.4 3 -6.4 3 -2.6 6 -2.6 -6 -6.4 -3 6.4 -3Z" fill="${['#ffd766', '#ffffff', '#ffb35c'][i % 3]}"/></g>`;
    }
    s = s.replace('<g class="all">', ring + burst(112, 110, 12, 130, ['#ffd766', '#ff7a9c', '#ffb35c']) + '<g class="all">');
  }
  return s;
}

/**
 * Any mood (a base state or a celebration: B toss acorn, C bounce, D star eyes) in a coat, wearing `gear`.
 * The coat swaps fur colours before the accessories go on, so gear keeps its own colours.
 * Tập trung already wears reading glasses, so the Kính tròn accessory is left off for it.
 */
export function socMoodSvg(m: SocMood, gear?: readonly string[], coat?: string | null): string {
  const worn = m === 'focus' || m === 'focusMix' ? gear?.filter(id => id !== 'glasses') : gear;
  return applyGear(applyCoat(moodSvg(m), coat), worn);
}
function moodSvg(m: SocMood): string {
  if (m === 'cheerCplus') {
    return cheerSvg('C').replace('class="s-cC"', 'class="s-cC s-cCplus"')
      .replace('<g class="all">', burst(112, 150, 14, 120, ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa']) + '<g class="all">');
  }
  return m === 'cheerB' ? cheerSvg('B') : m === 'cheerC' ? cheerSvg('C') : m === 'cheerD' ? cheerSvg('D') : socSvg(m);
}
