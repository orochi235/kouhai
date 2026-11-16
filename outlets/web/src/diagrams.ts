import type { Mermaid } from 'mermaid';

// Mermaid is large, so it loads only for a note that has a diagram.
let mermaid: Promise<Mermaid> | null = null;
let drawn = 0;

/** Replaces each ```mermaid block under `root` with the diagram it describes; a block that fails to parse stays as source. */
export async function drawDiagrams(root: HTMLElement) {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')];
  if (!blocks.length) return;
  mermaid ??= import('mermaid').then((m) => m.default);
  const m = await mermaid;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' });
  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre?.isConnected) continue;
    try {
      const { svg } = await m.render(`diagram-${++drawn}`, code.textContent ?? '');
      const figure = document.createElement('figure');
      figure.className = 'diagram';
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch (err) {
      pre.classList.add('diagram-error');
      pre.title = `Mermaid could not draw this: ${(err as Error).message}`;
    }
  }
}
