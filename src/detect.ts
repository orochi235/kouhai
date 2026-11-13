/**
 * A cheap first pass over a prompt: could it hold a direct question? It is deliberately loose,
 * because a miss loses an answer while a false alarm costs one line of context and Claude decides.
 */
export type Detection = { forced: boolean; candidate: boolean };

const WH =
  /(^|[.!;:\n]\s*|\b(?:and|but|so|also|btw|oh|ok|okay)[, ]\s*)(what|why|how|when|where|which|who|whom|whose)\b/i;

/** Text the user pasted or quoted is material, not their own question. */
export function ownWords(prompt: string): string {
  return prompt
    .replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
    .replace(/<([a-z_-]+)>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*>.*$/gm, ' ');
}

export function detect(prompt: string): Detection {
  const forced = /^\s*\?\?/.test(prompt);
  if (forced) return { forced, candidate: true };
  const own = ownWords(prompt);
  return { forced, candidate: own.includes('?') || WH.test(own) };
}
