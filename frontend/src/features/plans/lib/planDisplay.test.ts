import { expect, it } from 'vitest';
import { formatPlanQuantity } from './planDisplay';

it('formats measured minutes without hiding tiny positive activity or changing counts', () => {
  const measured = 120.22985;
  expect(formatPlanQuantity(measured)).toBe('120,2');
  expect(measured).toBe(120.22985);
  expect(formatPlanQuantity(0.02)).toBe('<0,1');
  expect(formatPlanQuantity(0)).toBe('0');
  expect(formatPlanQuantity(210)).toBe('210');
});
