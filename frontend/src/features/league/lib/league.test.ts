import { describe, expect, it } from 'vitest';
import type { LeagueState } from '../services/leagueApi';
import { chipLabel, gapAbove, nicknameProblem, rowZone, sidebarLabel, weekRange } from './league';
import { leagueSocSvg, rowCoat } from './leagueSoc';

const rows = Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, nickname: `Bạn ${i + 1}`, coat: 'nau-cam', stars: 200 - i * 10, me: i === 4 }));
const table: LeagueState = {
  week: { start: '2026-11-16', endsAt: '2026-11-23T00:00:00+07:00', daysLeft: 3 }, dailyCap: 60, starTable: {},
  member: { nickname: 'Bạn 5', coat: 'nau-cam', tier: 'bac' }, mode: 'table',
  me: { stars: 160, today: 12, rank: 5, lastWeekStars: 100 },
  group: { tier: 'bac', size: 20, promote: 5, demote: 5, rows }, lastWeek: null
};

describe('league helpers', () => {
  it('labels the sidebar and the phone chip', () => {
    expect(sidebarLabel(null)).toBe('');
    expect(sidebarLabel(table)).toBe('Hạng 5 · còn 3 ngày');
    expect(sidebarLabel({ ...table, mode: 'fallback' })).toBe('160★ · còn 3 ngày');
    expect(chipLabel(table).text).toBe('Hạng 5');
    expect(chipLabel({ ...table, member: null }).text).toBe('Xếp hạng');
    expect(sidebarLabel({ ...table, rank: { name: 'Vàng II' } })).toBe('Vàng II · hạng 5');
  });

  it('marks the promotion and demotion zones', () => {
    const group = table.group!;
    expect([1, 5, 6, 15, 16, 20].map(rank => rowZone({ rank }, group))).toEqual(['up', 'up', null, null, 'down', 'down']);
    expect(rowZone({ rank: 20 }, { ...group, demote: 0 })).toBeNull();
  });

  it('shows the stars needed to pass the learner above', () => {
    expect(gapAbove(table)).toEqual({ stars: 11, nickname: 'Bạn 4' });
    expect(gapAbove({ ...table, group: { ...table.group!, rows: rows.map(row => ({ ...row, me: row.rank === 1 })) } })).toBeNull();
  });

  it('checks nickname shape like the server', () => {
    expect(nicknameProblem('Sóc Nâu')).toBe('');
    expect(nicknameProblem('Đại  Lớn 2')).toBe('');
    expect(nicknameProblem('a')).not.toBe('');
    expect(nicknameProblem('Sóc!')).not.toBe('');
  });

  it('formats the week range', () => {
    expect(weekRange('2026-11-30')).toBe('30/11 – 06/12');
  });

  it('draws each member in their own coat, or a coat picked from the nickname', () => {
    expect(rowCoat('xam', 'Mây Bay')).toBe('xam');
    expect(rowCoat('nau-cam', 'Mây Bay')).toBe(rowCoat('nau-cam', 'Mây Bay'));
    const picked = new Set(['Mây Bay', 'Tí Hon', 'Kem Dâu', 'Bắp Rang', 'Trà Sữa', 'Mèo Mun', 'Gấu Bông', 'Su Su'].map(n => rowCoat('nau-cam', n)));
    expect(picked.size).toBeGreaterThan(2);
    expect(leagueSocSvg('dau')).toContain('#f3a7b6');
    expect(leagueSocSvg('nau', '', ['vuong-mien.m1'])).toContain('#c09cff');
  });
});
