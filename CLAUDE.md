# dixeram — agent pointers

- What it is and how it works: `README.md`. Open work: `docs/TODO.md`.
- The filing rule Claude follows is written once, `RULE` in `src/hooks.ts`; the prompt hook and the
  MCP server's instructions both use it. Change the rule there.
- **Deployed from this checkout.** The plugin is only a shell: its hooks and MCP server run
  `dixeram` from `~/.local/bin`, a link to `bin/dixeram` here, so a change to `src/` reaches
  hooks and new sessions at once. The daemon needs a restart:
  `launchctl kickstart -k gui/$(id -u)/dev.dixeram`. The page needs `npm run build`.
- Claude Code runs a cached copy of `plugin/` (the hooks and the manifest), keyed on its version.
  A change there lands only after bumping the version in `plugin/.claude-plugin/plugin.json` and
  `.claude-plugin/marketplace.json`, then `claude plugin update dixeram@dixeram` in each config
  directory (`~/.claude`, `~/.claude-msb`, `~/.claude-pw`). Keep the plugin in its own
  directory: pointed at the repo root, every cached version copies `node_modules`.
- Capture never depends on the daemon: hooks and the MCP server write SQLite directly with
  `node:sqlite`, so they carry no runtime dependencies. Keep it that way.
- Node strips types rather than compiling them, so no parameter properties, enums, or
  namespaces outside `ui/`.
- After changing `menubar.yaml`, run `npm run menubar:install` with `PERCH` set to a perch built
  from `~/src/perch` (`go build -o <path> ./cmd/perch`); the released perch lacks `gutter`.
- Point a test run at a scratch store with `DIXERAM_HOME=<dir>` (and `DIXERAM_PORT` for a second
  daemon); never seed the real inbox.
