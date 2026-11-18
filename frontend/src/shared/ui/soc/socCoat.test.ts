import { describe, expect, it } from 'vitest';
import { DEFAULT_COAT, SOC_COATS, applyCoat, isSocCoat, socCoat } from './socCoat';
import { SOC_STATES, socMoodSvg } from './socSvg';
import { DEFAULT_SOC_NAME, cleanSocName, socIdentity, withSocCoat, withSocName } from './socIdentity';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const EYE = '#3a2a1e';

/** Well-formed markup without a DOM (tests run in Node): balanced tags, quoted attributes, one <svg> root. */
function wellFormed(svg: string): boolean {
  const body = svg.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!body.startsWith('<svg') || !body.endsWith('</svg>')) return false;
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g)) {
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[4]) stack.push(m[2]);
  }
  const tags = body.match(/<[^>]*>/g)?.length ?? 0;
  const matched = [...body.matchAll(/<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g)].length;
  return stack.length === 0 && tags === matched;
}
const BASE_FUR = ['#f4a261', '#e58a45', '#d9773a', '#fff1dc', '#ffe3c2', '#ffb5a7'];

describe('Sóc coats', () => {
  it('has the five coats from the sketch, Nâu cam first and default', () => {
    expect(SOC_COATS.map(c => c.label)).toEqual(['Nâu cam', 'Xám tro', 'Kem sữa', 'Sô-cô-la', 'Hồng dâu']);
    expect(DEFAULT_COAT).toBe('nau');
    expect(socCoat(undefined).id).toBe('nau');
    expect(socCoat('tím').id).toBe('nau');
    expect(isSocCoat('soco')).toBe(true);
    expect(isSocCoat('blue')).toBe(false);
  });

  it('draws every mood in every coat as valid SVG with that coat\'s fills', () => {
    for (const coat of SOC_COATS) {
      for (const mood of [...SOC_STATES, 'cheerB', 'cheerC', 'cheerCplus', 'cheerD'] as const) {
        const svg = socMoodSvg(mood, ['scarf', 'helmet'], coat.id);
        expect(wellFormed(svg), `${coat.id} ${mood}`).toBe(true);
        expect(svg).toContain(`fill="${coat.fur}"`);
        expect(svg).toContain(`fill="${coat.dark}"`);
        expect(svg).toContain(`fill="${coat.cream}"`);
        expect(svg).toContain(`fill="${coat.ear}"`);
        expect(svg).toContain(`stroke="${coat.stripe}"`);
        if (coat.id !== 'nau') for (const old of BASE_FUR) expect(svg, `${coat.id} ${mood} still has ${old}`).not.toContain(old);
        // Eyes and gear keep their colours.
        expect(svg).toContain(EYE);
        expect(svg).toContain('#ff5c7a');
      }
    }
  });

  it('keeps the face readable: dark eyes on the cream face patch of every coat', () => {
    for (const coat of SOC_COATS) {
      expect(contrast(EYE, coat.cream), coat.id).toBeGreaterThan(7);
      expect(contrast(EYE, coat.fur), coat.id).toBeGreaterThan(2.5);
    }
  });

  it('leaves non-Sóc markup alone and is a no-op for Nâu cam', () => {
    expect(applyCoat('<rect fill="#46b35a"/>', 'xam')).toBe('<rect fill="#46b35a"/>');
    const svg = socMoodSvg('idle');
    expect(applyCoat(svg, 'nau')).toBe(svg);
  });

  it('never raises an arm: every mood has only the two belly paws', () => {
    for (const mood of [...SOC_STATES, 'cheerB', 'cheerC', 'cheerCplus', 'cheerD'] as const) {
      const svg = socMoodSvg(mood);
      expect(svg).toContain('rotate(-38 88 202)');
      expect(svg).toContain('rotate(38 132 202)');
      expect(svg).not.toMatch(/rotate\(-?42 /);
    }
  });

  it('Tập trung wears reading glasses, so the Kính tròn accessory is not drawn twice', () => {
    expect(socMoodSvg('focus', ['glasses'])).not.toContain('stroke="#2f3a33" stroke-width="5"');
    expect(socMoodSvg('idle', ['glasses'])).toContain('stroke="#2f3a33" stroke-width="5"');
  });
});

describe('Sóc của bạn on the profile', () => {
  it('fills missing or unknown fields with Nâu cam and the default name', () => {
    expect(socIdentity({})).toEqual({ coat: 'nau', name: DEFAULT_SOC_NAME });
    expect(socIdentity({ socCoat: 'rainbow', socName: '   ' })).toEqual({ coat: 'nau', name: DEFAULT_SOC_NAME });
    expect(socIdentity({ socCoat: 'dau', socName: 'Mây  Bay ' })).toEqual({ coat: 'dau', name: 'Mây Bay' });
  });

  it('tidies names and does not store the default', () => {
    expect(cleanSocName('  a   b ')).toBe('a b');
    expect(cleanSocName('x'.repeat(40))).toHaveLength(20);
    expect(withSocName({ socName: 'Bắp' }, '')).toEqual({});
    expect(withSocName({}, DEFAULT_SOC_NAME)).toEqual({});
    expect(withSocName({}, ' Kem Dâu ')).toEqual({ socName: 'Kem Dâu' });
    expect(withSocCoat({}, 'xam')).toEqual({ socCoat: 'xam' });
    expect(withSocCoat({ socCoat: 'kem' }, 'nope' as never)).toEqual({ socCoat: 'kem' });
  });
});
