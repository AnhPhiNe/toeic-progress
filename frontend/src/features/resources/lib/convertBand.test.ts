import { describe, expect, it } from 'vitest';
import { buildJourney } from './convert';
import { buildBandBar } from './convertBand';

describe('buildBandBar', () => {
  it('B2 to C1 with points to go', () => {
    const bar = buildBandBar(880, buildJourney('B2'));
    expect(bar.from).toBe('B2 · 785');
    expect(bar.to).toBe('C1 · 945');
    expect(bar.mid).toBe('còn 65 điểm');
    expect(bar.ratio).toBeCloseTo(95 / 160);
  });
  it('below A1 aims at A1', () => {
    const bar = buildBandBar(60, buildJourney(null));
    expect(bar.from).toBe('Bắt đầu · 0');
    expect(bar.to).toBe('A1 · 120');
    expect(bar.mid).toBe('còn 60 điểm');
    expect(bar.ratio).toBeCloseTo(0.5);
  });
  it('C1 has no next band', () => {
    const bar = buildBandBar(980, buildJourney('C1'));
    expect(bar.to).toBe('990');
    expect(bar.mid).toBe('cao nhất TOEIC đối chiếu');
    expect(bar.ratio).toBeCloseTo(35 / 45);
  });
  it('total passes the next minimum but a skill misses', () => {
    const bar = buildBandBar(950, buildJourney('B2'));
    expect(bar.mid).toBe('cần đủ ngưỡng Nghe & Đọc');
    expect(bar.ratio).toBeLessThanOrEqual(0.96);
  });
});
