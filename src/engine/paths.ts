import { homedir } from 'node:os';
import { join } from 'node:path';

export const home = () => process.env.DIXERAM_HOME ?? join(homedir(), '.dixeram');
export const dbPath = () => join(home(), 'inbox.db');
export const port = () => Number(process.env.DIXERAM_PORT ?? 8771);
export const apiBase = () => `http://127.0.0.1:${port()}`;

/** An archived answer is deleted this long after it was archived. */
export const ARCHIVE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
/** A turn record exists only to carry context to `ask`; one nobody asked from is dropped after this. */
export const TURN_TTL_MS = 2 * 24 * 60 * 60 * 1000;
/** A session with no turn for this long has ended, whether or not its end was seen. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
