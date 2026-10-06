import { describe, expect, it } from 'vitest';
import { TAB_PATHS, tabFromPath } from '@/app/routing/routes';

describe('tab routes', () => {
  it('maps every tab to a direct URL that survives refresh', () => {
    for (const [tab, path] of Object.entries(TAB_PATHS)) expect(tabFromPath(path)).toBe(tab);
  });
  it('handles trailing slashes and unknown paths', () => {
    expect(tabFromPath('/phan-tich/')).toBe('analytics');
    expect(tabFromPath('/tu-vung/')).toBe('vocabulary');
    expect(tabFromPath('/tai-lieu')).toBe('resources');
    expect(tabFromPath('/khong-co')).toBe('dashboard');
  });
});
