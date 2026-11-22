import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parsePassage } from './passageText';
import { PassageText } from '@/features/mistakes/components/PassageText';

const passage = [
  'Đoạn 1 — Email',
  'To: Ana Ruiz',
  'Date: 4 May',
  'Your order has shipped.',
  'Ken Ito, Sales',
  '',
  'Đoạn 2 — Phiếu giao hàng',
  '| Item | Qty | Price |',
  '|---|---|---|',
  '| Desk lamp | 2 | $40 |',
  '| Chair | 1 |',
  'Signed: K. Ito',
].join('\n');

describe('labelled passages', () => {
  it('splits labels, paragraphs and Markdown tables', () => {
    expect(parsePassage(passage)).toEqual([
      { kind: 'label', text: 'Đoạn 1 — Email' },
      { kind: 'text', text: 'To: Ana Ruiz\nDate: 4 May\nYour order has shipped.\nKen Ito, Sales' },
      { kind: 'label', text: 'Đoạn 2 — Phiếu giao hàng' },
      { kind: 'table', header: ['Item', 'Qty', 'Price'], rows: [['Desk lamp', '2', '$40'], ['Chair', '1']] },
      { kind: 'text', text: 'Signed: K. Ito' },
    ]);
  });

  it('keeps older plain passages as one text block', () => {
    const plain = 'Library Reopens\n(14 March) The library welcomed residents back.\nA | B is not a table';
    expect(parsePassage(plain)).toEqual([{ kind: 'text', text: plain }]);
  });

  it('renders labels and a real table with every column filled', () => {
    const html = renderToStaticMarkup(createElement(PassageText, { text: passage }));
    expect(html).toContain('<p class="psg-label">Đoạn 1 — Email</p>');
    expect(html).toContain('<p class="psg-label">Đoạn 2 — Phiếu giao hàng</p>');
    expect(html).toContain('<th scope="col">Price</th>');
    expect(html).toContain('<td>Desk lamp</td><td>2</td><td>$40</td>');
    expect(html).toContain('<td>Chair</td><td>1</td><td></td>');
    expect(html).not.toContain('|---|');
  });
});
