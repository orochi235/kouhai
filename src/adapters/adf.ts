// Jira's REST v3 takes rich text only as Atlassian Document Format. This covers what notes use:
// paragraphs, fenced code, inline code, bold and links; anything else arrives as its plain text.

type Mark = { type: 'code' | 'strong' } | { type: 'link'; attrs: { href: string } };
type Inline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'codeBlock'; attrs: { language?: string }; content: Inline[] };
export type Adf = { type: 'doc'; version: 1; content: Block[] };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inlines(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: line.slice(last, m.index) });
    if (m[1]) out.push({ type: 'text', text: m[1], marks: [{ type: 'code' }] });
    else if (m[2]) out.push({ type: 'text', text: m[2], marks: [{ type: 'strong' }] });
    else
      out.push({
        type: 'text',
        text: m[3] as string,
        marks: [{ type: 'link', attrs: { href: m[4] as string } }],
      });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ type: 'text', text: line.slice(last) });
  return out;
}

function paragraph(text: string): Block {
  const content = text
    .split('\n')
    .flatMap((l, i): Inline[] => [...(i ? [{ type: 'hardBreak' } as const] : []), ...inlines(l)]);
  return { type: 'paragraph', content };
}

export function adfOf(markdown: string): Adf {
  const content: Block[] = [];
  const parts = markdown.split(/^```(\w*)\n([\s\S]*?)^```\s*$/m);
  for (let i = 0; i < parts.length; i += 3) {
    for (const para of (parts[i] as string).split(/\n\s*\n/)) {
      if (para.trim()) content.push(paragraph(para.trim()));
    }
    const code = parts[i + 2];
    if (code != null) {
      const language = parts[i + 1] || undefined;
      content.push({
        type: 'codeBlock',
        attrs: language ? { language } : {},
        content: [{ type: 'text', text: code.replace(/\n$/, '') }],
      });
    }
  }
  return { type: 'doc', version: 1, content };
}
