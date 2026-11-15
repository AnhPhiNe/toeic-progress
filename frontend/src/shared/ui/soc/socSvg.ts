/* Port of design/previews/_soc.js (approved 2D Sóc). Keep in sync with the sketches. */
export type SocState = 'idle' | 'think' | 'yay' | 'sad' | 'zzz' | 'hi';

const D = '#3a2a1e', F = '#f4a261', F2 = '#e58a45', C = '#fff1dc';

function eye(x: number, s: SocState): string {
  if(s==='yay')return `<path d="M${x-12} 116 Q${x} 99 ${x+12} 116" fill="none" stroke="${D}" stroke-width="6" stroke-linecap="round"/>`;
  if(s==='zzz')return `<path d="M${x-11} 113 Q${x} 122 ${x+11} 113" fill="none" stroke="${D}" stroke-width="5.5" stroke-linecap="round"/>`;
  if(s==='think')return `<ellipse cx="${x}" cy="112" rx="11.5" ry="13.5" fill="${D}"/><circle cx="${x+5}" cy="104" r="5" fill="#fff"/><circle cx="${x-2}" cy="115" r="2" fill="#fff"/>`;
  return `<g class="lid"><ellipse cx="${x}" cy="112" rx="11.5" ry="13.5" fill="${D}"/><g class="${s==='sad'?'':'look'}"><circle cx="${x+4}" cy="${s==='sad'?110:106.5}" r="4.8" fill="#fff"/><circle cx="${x-4}" cy="118" r="2.2" fill="#fff"/></g></g>`}
/** SVG markup for Sóc in one state; layered groups animate via soc.css. */
export function socSvg(s: SocState): string {
  const ear=s==='sad'||s==='zzz'?30:0;
  const nut=`<g class="${s==='idle'?'nut':''}"><ellipse cx="0" cy="5" rx="12" ry="14" fill="#e9b872"/><ellipse cx="-4" cy="2" rx="3" ry="6" fill="#fff" opacity=".35"/><path d="M-14 0 Q0 -18 14 0 Q0 6 -14 0Z" fill="#8e5a35"/><rect x="-2" y="-16" width="4" height="7" rx="2" fill="#8e5a35"/></g>`;
  const mouth=s==='yay'?`<path d="M100 130 Q110 150 120 130Z" fill="#8e3b2f"/><ellipse cx="110" cy="140" rx="5" ry="3.5" fill="#ff8f80"/><rect x="106" y="130" width="8" height="5" rx="1.5" fill="#fff"/>`:s==='sad'?`<path d="M103 139 Q110 132 117 139" fill="none" stroke="${D}" stroke-width="3.2" stroke-linecap="round"/>`:(s==='zzz'||s==='think')?`<ellipse cx="110" cy="137" rx="3.5" ry="4.5" fill="#8e3b2f"/>`:`<path d="M99 133 Q104.5 141 110 133 Q115.5 141 121 133" fill="none" stroke="${D}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const brows=s==='sad'?`<path d="M70 96 L88 90M150 96 L132 90" stroke="${D}" stroke-width="4" stroke-linecap="round"/>`:'';
  const arms=s==='yay'?`<ellipse cx="68" cy="170" rx="10" ry="18" transform="rotate(42 68 170)" fill="${F2}"/><ellipse cx="152" cy="170" rx="10" ry="18" transform="rotate(-42 152 170)" fill="${F2}"/>`
    :s==='hi'?`<ellipse cx="132" cy="202" rx="10" ry="16" transform="rotate(38 132 202)" fill="${F2}"/><g transform="translate(60 166) rotate(-22)"><g class="wave"><ellipse cx="0" cy="18" rx="11" ry="22" fill="${F2}" stroke="#d9773a" stroke-width="2"/><circle cx="0" cy="-4" r="14" fill="${F}" stroke="#d9773a" stroke-width="2.5"/><ellipse cx="0" cy="-2" rx="7" ry="6" fill="#ffe3c2"/><circle cx="-7" cy="-13" r="3" fill="#ffe3c2"/><circle cx="0" cy="-15.5" r="3" fill="#ffe3c2"/><circle cx="7" cy="-13" r="3" fill="#ffe3c2"/></g></g><g class="wv-lines" fill="none" stroke="#ffb35c" stroke-width="4" stroke-linecap="round"><path d="M36 140 q-8 -10 -4 -22"/><path d="M24 146 q-12 -14 -6 -32"/></g>`
    :`<ellipse cx="88" cy="202" rx="10" ry="16" transform="rotate(-38 88 202)" fill="${F2}"/><ellipse cx="132" cy="202" rx="10" ry="16" transform="rotate(38 132 202)" fill="${F2}"/>`;
  const nutAt=s==='yay'?`<g transform="translate(110,22)"><g class="toss">${nut}</g></g>`:`<g transform="translate(110,202)">${nut}</g>`;
  const cf=s==='yay'?([[30,70,'#ff7a9c'],[196,60,'#ffc83d'],[20,150,'#46b35a'],[214,140,'#a78bfa'],[60,30,'#1c8fe3']] as Array<[number, number, string]>).map((c: [number, number, string], i: number) =>`<rect class="cf" style="animation-delay:${i*.08}s" x="${c[0]}" y="${c[1]}" width="9" height="14" rx="2.5" fill="${c[2]}" transform="rotate(${i*37} ${c[0]} ${c[1]})"/>`).join(''):'';
  const extra=s==='sad'?`<path class="tear" d="M154 128 q6 10 0 15 q-6 -5 0 -15Z" fill="#7dd3fc"/>`:s==='think'?`<g fill="#8fa3b8"><circle class="d1" cx="176" cy="34" r="5.5"/><circle class="d2" cx="192" cy="34" r="5.5"/><circle class="d3" cx="208" cy="34" r="5.5"/></g>`:s==='zzz'?`<g font-family="Nunito" font-weight="900" fill="#8fa3b8"><text class="z1" x="176" y="70" font-size="22">z</text><text class="z2" x="186" y="60" font-size="28">z</text></g>`:'';
  return `<svg viewBox="0 0 240 260" class="s-${s}"><ellipse class="shadow" cx="112" cy="246" rx="62" ry="8" fill="#2f3a33" opacity=".1"/>${cf}
  <g class="all">
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
      <ellipse cx="64" cy="136" rx="13" ry="8" fill="#ff9e8f" opacity=".7"/><ellipse cx="156" cy="136" rx="13" ry="8" fill="#ff9e8f" opacity=".7"/>
      ${brows}${eye(82,s)}${eye(138,s)}
      <ellipse cx="110" cy="127" rx="5.5" ry="4" fill="#7a4a2b"/>${mouth}${extra}
    </g>
    ${nutAt}${arms}
  </g></g></svg>`}


/* ---- Celebrations from design/previews/mock-soc-cheer.html (approved B, C, D; no raised arms) ---- */
/** cheerCplus = the stronger bounce with a confetti burst, for a new step. */
export type SocCheer = 'cheerB' | 'cheerC' | 'cheerCplus' | 'cheerD';
export type SocMood = SocState | SocCheer;

const IDLE_ARMS = `<ellipse cx="88" cy="202" rx="10" ry="16" transform="rotate(-38 88 202)" fill="#e58a45"/><ellipse cx="132" cy="202" rx="10" ry="16" transform="rotate(38 132 202)" fill="#e58a45"/>`;
const YAY_ARMS = /<ellipse cx="68" cy="170"[^>]*\/><ellipse cx="152" cy="170"[^>]*\/>/;
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
    .replace(YAY_ARMS, IDLE_ARMS).replace('<g transform="translate(110,22)">', '<g transform="translate(110,202)">');
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

/** Any mood: the five base states or a celebration (B toss acorn, C bounce, D star eyes). */
export function socMoodSvg(m: SocMood): string {
  if (m === 'cheerCplus') {
    return cheerSvg('C').replace('class="s-cC"', 'class="s-cC s-cCplus"')
      .replace('<g class="all">', burst(112, 150, 14, 120, ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa']) + '<g class="all">');
  }
  return m === 'cheerB' ? cheerSvg('B') : m === 'cheerC' ? cheerSvg('C') : m === 'cheerD' ? cheerSvg('D') : socSvg(m);
}
