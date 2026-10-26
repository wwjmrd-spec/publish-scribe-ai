// Table extraction / normalisation shared by the formatter (Deno) and browser tests.
//
// Manuscript tables (from Mammoth HTML) can contain merged boxes (rowspan /
// colspan) and empty boxes. Dropping the span information shifts every later
// box in the row to the left, which mixes up the content. This module keeps
// each box exactly where the manuscript put it and pads short rows so the
// table is always a full rectangle.

export interface TableCell {
  /** Sanitised inline HTML (b/i/u/sub/sup/span/br only). Empty string for blank boxes. */
  html: string;
  /** Plain text, one entry per paragraph inside the box. */
  lines: string[];
  text: string;
  colspan: number;
  rowspan: number;
  header: boolean;
}

export interface TableGrid {
  rows: TableCell[][];
  columnCount: number;
  /** Number of leading rows rendered as the table header (repeated on page breaks). */
  headerRows: number;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, "&");

const plain = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

function sanitizeInline(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<\/?(?!strong\b|b\b|em\b|i\b|u\b|sub\b|sup\b|span\b|br\b)[a-z][^>]*>/gi, "")
    .replace(/<(strong|b|em|i|u|sub|sup|span)(?:\s[^>]*)?>/gi, "<$1>")
    .replace(/<br(?:\s[^>]*)?\/?\s*>/gi, "<br>");
}

/** Find top-level <table>…</table> ranges, respecting nested tables. */
export function findTopLevelTables(html: string): Array<{ start: number; end: number }> {
  const re = /<\/?table\b[^>]*>/gi;
  const out: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const closing = m[0][1] === "/";
    if (!closing) {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ start, end: m.index + m[0].length });
        start = -1;
      }
    }
  }
  return out;
}

/** Replace nested tables inside a cell by their text, one line per row. */
function flattenNestedTables(inner: string): string {
  const ranges = findTopLevelTables(inner);
  if (!ranges.length) return inner;
  let out = "";
  let last = 0;
  for (const r of ranges) {
    out += inner.slice(last, r.start);
    const grid = parseTableHtml(inner.slice(r.start, r.end));
    out += grid.rows
      .map((row) => row.map((c) => c.text).filter(Boolean).join(" | "))
      .filter(Boolean)
      .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
      .join("");
    last = r.end;
  }
  return out + inner.slice(last);
}

function cellContent(raw: string): { html: string; lines: string[] } {
  // Each paragraph / list item inside the box becomes its own line.
  const withBreaks = raw
    .replace(/<\/(p|li|h[1-6]|div)>\s*/gi, "<br>")
    .replace(/<(p|li|h[1-6]|div)\b[^>]*>/gi, "");
  let html = sanitizeInline(withBreaks).replace(/\s+/g, " ");
  html = html.replace(/(\s*<br>\s*)+/g, "<br>").replace(/^(\s*<br>\s*)+|(\s*<br>\s*)+$/g, "").trim();
  const lines = html.split("<br>").map(plain).filter(Boolean);
  if (!lines.length) html = "";
  return { html, lines };
}

const spanAttr = (attrs: string, name: string) => {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, "i"));
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 1;
};

/** Parse one <table> element into a rectangular grid that keeps every box in place. */
export function parseTableHtml(tableHtml: string): TableGrid {
  const open = tableHtml.match(/^<table\b[^>]*>/i);
  let inner = open ? tableHtml.slice(open[0].length) : tableHtml;
  inner = inner.replace(/<\/table>\s*$/i, "");
  inner = flattenNestedTables(inner);

  // Ranges of <thead> so header rows marked in Word are recognised.
  const theadRanges: Array<[number, number]> = [];
  const theadRe = /<thead\b[^>]*>([\s\S]*?)<\/thead>/gi;
  let th: RegExpExecArray | null;
  while ((th = theadRe.exec(inner)) !== null) theadRanges.push([th.index, th.index + th[0].length]);

  type RawRow = { cells: TableCell[]; inThead: boolean };
  const rawRows: RawRow[] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(inner)) !== null) {
    const inThead = theadRanges.some(([a, b]) => tr!.index >= a && tr!.index < b);
    const cells: TableCell[] = [];
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(tr[1])) !== null) {
      const { html, lines } = cellContent(c[3]);
      cells.push({
        html,
        lines,
        text: lines.join(" "),
        colspan: spanAttr(c[2], "colspan"),
        rowspan: spanAttr(c[2], "rowspan"),
        header: c[1].toLowerCase() === "th" || inThead,
      });
    }
    rawRows.push({ cells, inThead });
  }

  const rowCount = rawRows.length;
  // occupancy[r][c] = true when a box (or a merged box from above) covers it.
  const occupancy: boolean[][] = Array.from({ length: rowCount }, () => []);
  let columnCount = 0;

  rawRows.forEach((row, r) => {
    let col = 0;
    for (const cell of row.cells) {
      while (occupancy[r][col]) col++;
      cell.rowspan = Math.min(cell.rowspan, rowCount - r);
      for (let dr = 0; dr < cell.rowspan; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) occupancy[r + dr][col + dc] = true;
      }
      col += cell.colspan;
      columnCount = Math.max(columnCount, col);
    }
    columnCount = Math.max(columnCount, occupancy[r].length);
  });

  // Pad every row with blank boxes so the table is a full rectangle.
  rawRows.forEach((row, r) => {
    for (let col = 0; col < columnCount; col++) {
      if (!occupancy[r][col]) {
        occupancy[r][col] = true;
        row.cells.push({ html: "", lines: [], text: "", colspan: 1, rowspan: 1, header: row.inThead });
      }
    }
  });

  let headerRows = 0;
  while (headerRows < rowCount && rawRows[headerRows].inThead) headerRows++;
  if (headerRows === 0 && rowCount > 1) {
    const first = rawRows[0].cells;
    const allTh = first.length > 0 && first.every((c) => c.header);
    // Journal style: the first row is the column header unless it spans rows.
    if (allTh || first.every((c) => c.rowspan === 1)) headerRows = 1;
  }
  rawRows.slice(0, headerRows).forEach((row) => row.cells.forEach((c) => (c.header = true)));

  return { rows: rawRows.map((r) => r.cells), columnCount, headerRows };
}

/** Render a grid as journal table HTML. Every box keeps its position and spans. */
export function renderTableGridHtml(grid: TableGrid, className = "ww-data-table"): string {
  if (!grid.rows.length || grid.columnCount === 0) return "";
  const colgroup = `<colgroup>${'<col>'.repeat(grid.columnCount)}</colgroup>`;
  const renderRow = (row: TableCell[]) =>
    `<tr>${row
      .map((c) => {
        const tag = c.header ? "th" : "td";
        const attrs = `${c.colspan > 1 ? ` colspan="${c.colspan}"` : ""}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}`;
        return `<${tag}${attrs}>${c.html || "&nbsp;"}</${tag}>`;
      })
      .join("")}</tr>`;
  const head = grid.rows.slice(0, grid.headerRows).map(renderRow).join("");
  const body = grid.rows.slice(grid.headerRows).map(renderRow).join("");
  return `<table class="${className}">${colgroup}${head ? `<thead>${head}</thead>` : ""}<tbody>${body}</tbody></table>`;
}
