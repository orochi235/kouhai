// Jira's REST v3 takes rich text only as Atlassian Document Format. This covers what notes use:
// paragraphs, headings, lists, tables, quotes, fenced code, and inline code, bold, italics and links.

type Mark = { type: 'code' | 'strong' | 'em' } | { type: 'link'; attrs: { href: string } };
type Inline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
type Paragraph = { type: 'paragraph'; content: Inline[] };
type ListItem = { type: 'listItem'; content: Paragraph[] };
type Cell = { type: 'tableHeader' | 'tableCell'; attrs: object; content: Paragraph[] };
type Block =
  | Paragraph
  | { type: 'heading'; attrs: { level: number }; content: Inline[] }
  | { type: 'codeBlock'; attrs: { language?: string }; content: Inline[] }
  | { type: 'bulletList' | 'orderedList'; content: ListItem[] }
  | { type: 'blockquote'; content: Paragraph[] }
  | { type: 'table'; attrs: object; content: { type: 'tableRow'; content: Cell[] }[] };
export type Adf = { type: 'doc'; version: 1; content: Block[] };

const INLINE =
  /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])[*_]([^*_\s](?:[^*_]*[^*_\s])?)[*_](?![\w*])/g;
const FENCE = /^```(\w*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^\s*(?:([-*+])|\d+[.)])\s+(.*)$/;
const ROW = /^\s*\|.*\|\s*$/;
const RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;

function inlines(line: string): Inline[] {
  const out: Inline[] = [];
  const text = (t: string, marks?: Mark[]) => {
    if (t) out.push(marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
  };
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    text(line.slice(last, m.index));
    if (m[1]) text(m[1], [{ type: 'code' }]);
    else if (m[2]) text(m[2], [{ type: 'strong' }]);
    else if (m[3]) text(m[3], [{ type: 'link', attrs: { href: m[4] as string } }]);
    else text(m[5] as string, [{ type: 'em' }]);
    last = m.index + m[0].length;
  }
  text(line.slice(last));
  return out;
}

function paragraph(lines: string[]): Paragraph {
  const content = lines.flatMap((l, i): Inline[] => [
    ...(i ? [{ type: 'hardBreak' } as const] : []),
    ...inlines(l.trim()),
  ]);
  return { type: 'paragraph', content };
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Markdown as ADF, a block per paragraph, heading, list, table, quote, or fenced code. */
export function adfOf(markdown: string): Adf {
  const lines = markdown.split('\n');
  const content: Block[] = [];
  let i = 0;
  const take = (test: (l: string) => boolean) => {
    const run: string[] = [];
    while (i < lines.length && test(lines[i] as string)) run.push(lines[i++] as string);
    return run;
  };
  while (i < lines.length) {
    const line = lines[i] as string;
    const fence = FENCE.exec(line);
    if (!line.trim()) {
      i++;
    } else if (fence) {
      i++;
      const code = take((l) => !/^```\s*$/.test(l));
      i++;
      content.push({
        type: 'codeBlock',
        attrs: fence[1] ? { language: fence[1] } : {},
        content: code.length ? [{ type: 'text', text: code.join('\n') }] : [],
      });
    } else if (HEADING.test(line)) {
      const [, hashes, text] = HEADING.exec(line) as RegExpExecArray;
      i++;
      content.push({
        type: 'heading',
        attrs: { level: (hashes as string).length },
        content: inlines(text as string),
      });
    } else if (ROW.test(line) && RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      i += 2;
      const body = take((l) => ROW.test(l)).map(cells);
      const row = (r: string[], type: Cell['type']) => ({
        type: 'tableRow' as const,
        content: head.map((_, n) => ({ type, attrs: {}, content: [paragraph([r[n] ?? ''])] })),
      });
      content.push({
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: [row(head, 'tableHeader'), ...body.map((r) => row(r, 'tableCell'))],
      });
    } else if (ITEM.test(line)) {
      const bullet = !!(ITEM.exec(line) as RegExpExecArray)[1];
      const items: string[][] = [];
      // An indented line that isn't an item continues the one before it.
      for (const l of take((l) => ITEM.test(l) || /^\s+\S/.test(l))) {
        const m = ITEM.exec(l);
        if (m) items.push([m[2] as string]);
        else items.at(-1)?.push(l);
      }
      content.push({
        type: bullet ? 'bulletList' : 'orderedList',
        content: items.map((it) => ({ type: 'listItem', content: [paragraph(it)] })),
      });
    } else if (QUOTE.test(line)) {
      const quoted = take((l) => QUOTE.test(l)).map((l) => (QUOTE.exec(l) as RegExpExecArray)[1]);
      content.push({ type: 'blockquote', content: [paragraph(quoted as string[])] });
    } else {
      const starts = (l: string) =>
        !l.trim() || FENCE.test(l) || HEADING.test(l) || ITEM.test(l) || QUOTE.test(l);
      i++;
      content.push(paragraph([line, ...take((l) => !starts(l))]));
    }
  }
  return { type: 'doc', version: 1, content };
}

/** Markdown as one line of plain text, for fields that take no formatting (an issue's summary). */
export function plainOf(markdown: string): string {
  return inlines(markdown.replace(/\s+/g, ' ').trim())
    .map((n) => (n.type === 'text' ? n.text : ' '))
    .join('');
}
