# Contributing to Bugbook

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Project Structure

```
bugbook/
├── src/
│   ├── index.ts              # CLI entry point + command dispatcher
│   ├── electron-main.ts      # Electron main process (desktop app)
│   ├── commands/
│   │   ├── serve.ts          # HTTP server + embedded web GUI frontend
│   │   ├── app.ts            # `bugbook app` — launches Electron window
│   │   ├── add.ts
│   │   ├── list.ts
│   │   ├── github.ts         # GitHub Issues integration
│   │   └── ...
│   └── utils/
│       ├── storage.ts        # Bug/Tag CRUD, types, helpers
│       ├── config.ts         # Global user config
│       └── github.ts         # GitHub API helpers
├── tests/                    # Vitest test suite
├── .github/workflows/        # CI & release pipelines
└── dist/                     # Compiled output (git-ignored)
```

## Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/bugbook.git
cd bugbook

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Run tests
npm test

# 5. Link globally for local testing
npm link
bugbook init    # in any project directory
bugbook serve   # open the web GUI
bugbook app     # open the desktop window
```

## Development Workflow

```bash
# Compile TypeScript on every change (watch mode)
npx tsc -p tsconfig.build.json --watch

# Run the test suite
npm test

# Run a single test file
npx vitest run tests/storage.test.ts

# Use a local build directly
node dist/index.js <command>
```

## Architecture Notes

### CLI vs Web GUI vs Desktop App
- The **CLI** (`src/index.ts`) dispatches commands, all writing data through `src/utils/storage.ts`.
- The **web GUI** lives entirely inside `src/commands/serve.ts` as a large embedded HTML/CSS/JS template string. There is no separate `src/web/` directory — the compiled `dist/commands/serve.js` is self-contained.
- The **desktop app** (`src/electron-main.ts`) finds a free port, calls `startServer()` (exported from `serve.ts`), and opens a `BrowserWindow` pointing at `http://localhost:<port>`. It does **not** duplicate any server logic.
- All three interfaces read and write the same `.bugbook/` files.

### Adding a New Command
1. Create `src/commands/mycommand.ts` and export `handleMyCommand(args: string[]): Promise<void>`
2. Import and register it in `src/index.ts` (`executeCommand` switch + `printHelp`)
3. Add tests in `tests/mycommand.test.ts`

### Adding a Web GUI Feature
Edit the `HTML` template literal in `src/commands/serve.ts`:
- All JS inside the template uses `\`` and `\${` for template literals (to avoid breaking the outer TS string)
- Use `addEventListener` / event delegation instead of inline `onclick` attributes (required for Electron compatibility)
- Replace `window.confirm()` with the existing `customConfirm()` helper
- Wrap new JS in the existing IIFE; mutate `state` and call `renderBugList()` / `renderDetail()` to update the UI

## Commit Message Convention

| Prefix | Use for |
| :--- | :--- |
| `Add:` | New feature or file |
| `Fix:` | Bug fix |
| `Update:` | Change to an existing feature |
| `Remove:` | Deleted code or feature |
| `Docs:` | Documentation only |
| `Test:` | Tests only |
| `Refactor:` | Internal restructuring, no behaviour change |

Example: `Add: priority filter dropdown to web GUI`

## Pull Request Checklist

- [ ] `npm run build` passes with no TypeScript errors
- [ ] `npm test` — all tests pass (201+ currently)
- [ ] New features have tests in `tests/`
- [ ] The CHANGELOG (`CHANGELOG.md`) has an entry under `[Unreleased]`
- [ ] The README is updated if new commands or flags were added

The CI pipeline runs the full build + test matrix automatically on your PR (Node 18, 20, 22).

## Reporting Issues

When reporting a bug, please include:
- Your Node.js version: `node -v`
- Your OS
- Whether you are using the CLI, web GUI (`bugbook serve`), or desktop app (`bugbook app`)
- Steps to reproduce
- Expected vs actual behaviour

Open an issue at [github.com/Brend-VanDenEynde/bugbook/issues](https://github.com/Brend-VanDenEynde/bugbook/issues).
