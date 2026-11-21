import { type RefFormat, RefScheme } from '@core/refs.ts';

let scheme = new RefScheme();

/** How the ledger writes refs, from its `refs` setting once the page has loaded it. */
export const refScheme = () => scheme;

/** Takes the ledger's format; call before anything renders. */
export function setRefFormat(format: RefFormat) {
  scheme = new RefScheme(format);
}
