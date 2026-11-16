/** How a prompt cites items so the prompt hook brings them in: `[q-17] [t-4]`. */
export const citation = (refs: readonly string[]) => refs.map((r) => `[${r}]`).join(' ');
