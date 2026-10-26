import { describe, it, expect } from 'vitest';
import { parseTableHtml, renderTableGridHtml } from '../../supabase/functions/_shared/tableGrid';
import { splitTableAtHeight } from './formattedArticlePagination';

// Real Mammoth output for a Word table with a merged (2-row) box, a merged
// (2-column) box and empty boxes.
const MAMMOTH_TABLE =
  '<table><tr><td><p>Group</p></td><td><p>Param</p></td><td><p>Value A</p></td><td><p>Value B</p></td></tr>' +
  '<tr><td rowspan="2"><p>G1</p></td><td><p>Age</p></td><td></td><td><p>12</p></td></tr>' +
  '<tr><td><p>Weight</p></td><td><p>50</p></td><td></td></tr>' +
  '<tr><td colspan="2"><p>Total</p></td><td><p>x</p></td><td><p>y</p></td></tr>' +
  '<tr><td></td><td></td><td></td><td></td></tr></table>';

/** Column index of every box, as a browser would lay the table out. */
function layout(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const rows = Array.from(host.querySelectorAll('tr'));
  const occ: boolean[][] = rows.map(() => []);
  return rows.map((row, r) => {
    let c = 0;
    return Array.from(row.children).map((cell) => {
      while (occ[r][c]) c++;
      const td = cell as HTMLTableCellElement;
      for (let dr = 0; dr < (td.rowSpan || 1); dr++) for (let dc = 0; dc < (td.colSpan || 1); dc++) occ[r + dr][c + dc] = true;
      const out = { col: c, text: (cell.textContent || '').replace(/\u00a0/g, '').trim() };
      c += td.colSpan || 1;
      return out;
    });
  });
}

describe('table extraction keeps every box in place', () => {
  const grid = parseTableHtml(MAMMOTH_TABLE);
  const html = renderTableGridHtml(grid);
  const boxes = layout(html);

  it('keeps 4 columns and all 5 rows, including the fully empty row', () => {
    expect(grid.columnCount).toBe(4);
    expect(boxes.length).toBe(5);
  });

  it('keeps an empty box empty instead of pulling the next value into it', () => {
    // Row "Age": Value A is blank, 12 stays under Value B (column 3).
    expect(boxes[1].find((b) => b.text === '12')?.col).toBe(3);
    expect(boxes[1].find((b) => b.col === 2)?.text).toBe('');
  });

  it('keeps values under the right column next to a merged (rowspan) box', () => {
    // "Weight" row sits beside the merged G1 box: Weight in column 1, 50 in column 2.
    expect(boxes[2].find((b) => b.text === 'Weight')?.col).toBe(1);
    expect(boxes[2].find((b) => b.text === '50')?.col).toBe(2);
    expect(html).toContain('rowspan="2"');
  });

  it('keeps values in place after a merged (colspan) box', () => {
    expect(boxes[3].find((b) => b.text === 'x')?.col).toBe(2);
    expect(boxes[3].find((b) => b.text === 'y')?.col).toBe(3);
    expect(html).toContain('colspan="2"');
  });

  it('pads short rows so the table is a full rectangle', () => {
    const g = parseTableHtml('<table><tr><td>A</td><td>B</td><td>C</td></tr><tr><td>1</td></tr></table>');
    const b = layout(renderTableGridHtml(g));
    const width = (row: { col: number }[]) => row.length && row[row.length - 1].col + 1;
    expect(width(b[1])).toBe(3);
  });
});

describe('a long table breaks only where the page ends', () => {
  // Fake measuring box: every row is 20px tall.
  const fakeMeasure = () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { get: () => el.querySelectorAll('tr').length * 20 });
    return el;
  };
  const rowsHtml = Array.from({ length: 10 }, (_, i) => `<tr><td>R${i + 1}</td><td>v</td></tr>`).join('');
  const table = () => {
    const host = document.createElement('div');
    host.innerHTML = `<table class="ww-data-table"><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    return host.firstElementChild as HTMLElement;
  };

  it('fills the page, then carries all remaining rows as ONE table', () => {
    // 100px left on the page = header + 4 rows.
    const { first, rest } = splitTableAtHeight(table(), fakeMeasure(), 100);
    const count = (h: string | null) => (h?.match(/<td>R/g) || []).length;
    expect(count(first)).toBe(4);
    expect(count(rest)).toBe(6);
    expect((rest?.match(/<table/g) || []).length).toBe(1);
    expect(rest).toContain('<th>H1</th>'); // header repeated on the next page
  });

  it('never cuts through a merged (rowspan) box', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
      '<tr><td>1</td><td>x</td></tr>' +
      '<tr><td rowspan="3">M</td><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td></tr>' +
      '</tbody></table>';
    // Room for header + 3 rows: the merged box needs 3 rows, so only row 1 fits.
    const { first, rest } = splitTableAtHeight(host.firstElementChild as HTMLElement, fakeMeasure(), 80);
    expect(first).toContain('<td>1</td>');
    expect(first).not.toContain('rowspan');
    expect(rest).toContain('rowspan="3"');
    expect(rest).toContain('<td>c</td>');
  });
});
