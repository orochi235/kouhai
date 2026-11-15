import type { MarkedOptions } from 'marked';

/** Where the daemon serves an item's local image: only ones it attached or its note links. */
export const imageUrl = (ref: string, path: string) =>
  `/api/image?id=${encodeURIComponent(ref)}&path=${encodeURIComponent(path.replace(/^file:\/\//, ''))}`;

export const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(path);

/** Points a note's local images at the daemon. */
export const localImages =
  (ref: string): MarkedOptions['walkTokens'] =>
  (t) => {
    if (t.type === 'image' && /^(\/|file:\/\/)/.test(t.href)) t.href = imageUrl(ref, t.href);
  };
