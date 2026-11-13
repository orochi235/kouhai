import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Context } from './types.ts';

/** The nearest ancestor holding `.git` (a directory, or a file in a worktree), else null. */
export function findRepoRoot(cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** A worktree files its questions under the repo it belongs to. */
export function repoName(root: string): string {
  try {
    const m = readFileSync(join(root, '.git'), 'utf8').match(
      /^gitdir:\s*(.+)\/\.git\/worktrees\/[^/]+\s*$/m,
    );
    if (m?.[1]) return basename(m[1]);
  } catch {
    // a directory, the ordinary case
  }
  return basename(root);
}

/** `claude-pw` from `CLAUDE_CONFIG_DIR=~/.claude-pw`, or from a transcript under `~/.claude-pw/projects`. */
export function harnessOf(configDir: string | undefined, transcript: string | null): string {
  if (configDir) return basename(configDir).replace(/^\./, '');
  const m = transcript?.match(/\/\.(claude[^/]*)\/projects\//);
  return m?.[1] ?? 'claude';
}

export function contextOf(p: {
  session?: unknown;
  transcript?: unknown;
  cwd?: unknown;
  configDir?: string;
}): Context {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const cwd = str(p.cwd);
  const transcript = str(p.transcript);
  const root = cwd ? (findRepoRoot(cwd) ?? cwd) : null;
  return {
    session: str(p.session),
    harness: harnessOf(p.configDir, transcript),
    cwd,
    root,
    repo: root ? repoName(root) : null,
    transcript,
  };
}
