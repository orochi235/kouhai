# dixeram — agent pointers

- What it is and how it works: `README.md`. Open work: `docs/TODO.md`.
- **Layers, and which way they may import:** `src/engine` (the ledger: store, types, context;
  imports nothing else here) ← `src/capture` (Claude Code hooks and MCP server) and `src/server`
  (the HTTP API and event stream) ← `outlets/*` (ways of showing it). An outlet reads the ledger
  only through the API or the read-only `Ledger` it is handed, and owns its own wording and look;
  nothing in `src/` decides how anything is shown. `src/cli.ts` is where outlets are plugged in.
- The filing rule Claude follows is written once, `RULE` in `src/capture/hooks.ts`; the prompt hook and the
  MCP server's instructions both use it. Change the rule there.
- **Deployed from this checkout.** The plugin is only a shell: its hooks and MCP server run
  `dixeram` from `~/.local/bin`, a link to `bin/dixeram` here, so a change to `src/` reaches
  hooks and new sessions at once. The daemon needs a restart:
  `launchctl kickstart -k gui/$(id -u)/dev.dixeram`. The page needs `npm run build`.
- **The page builds against the weasel checkout at `../weasel`** (`WEASEL=<checkout>`, `outlets/web/weasel.ts`,
  and `@weasel-js/*` in `outlets/web/tsconfig.json`), because its shortcut sheet is in no weasel release yet
  (2026-11-15). The pins stay on the published version. Once a release carries `ShortcutSheet`, drop the
  plugin, the tsconfig paths, and the `WEASEL=` in the `dev` and `build` scripts.
- Claude Code runs a cached copy of `plugin/` (the hooks and the manifest), keyed on its version.
  A change there lands only after bumping the version in `plugin/.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`, then `claude plugin update dixeram@dixeram` in each config
  directory (`~/.claude`, `~/.claude-msb`, `~/.claude-pw`). Keep the plugin in its own
  directory: pointed at the repo root, every cached version copies `node_modules`.
- Capture never depends on the daemon: hooks and the MCP server write SQLite directly with
  `node:sqlite`, so they carry no runtime dependencies. Keep it that way.
- Node strips types rather than compiling them, so no parameter properties, enums, or
  namespaces outside `outlets/web/`.
- After changing `outlets/menubar/menubar.yaml`, run `npm run menubar:install` with `PERCH` set to a perch built
  from `~/src/perch` (`go build -o <path> ./cmd/perch`); the released perch lacks `gutter`.
- Point a test run at a scratch store with `DIXERAM_HOME=<dir>` (and `DIXERAM_PORT` for a second
  daemon); never seed the real inbox.
