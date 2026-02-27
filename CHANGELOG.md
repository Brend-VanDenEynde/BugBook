# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.6.0] - 2026-02-27

### Added
- **Web GUI** (`bugbook serve`) — full-featured local web interface with zero external dependencies
  - Split-panel layout: searchable/filterable bug list + full bug detail view
  - Create, edit, resolve, delete, and comment on bugs without leaving the browser
  - Filter by status (All / Open / Resolved) and priority (All / High / Medium / Low)
  - Sort by newest, priority, overdue-first, or oldest
  - Keyboard shortcuts: `N` new · `E` edit selected · `Del` delete selected · `R` refresh · `↑`/`↓` navigate list
  - Auto-refresh on window focus (picks up changes made via CLI instantly)
  - Custom confirm dialog (compatible with Electron's sandboxed environment)
  - `--port <N>` flag to override the default port (3000)
  - Opens the default browser automatically on start
- **Desktop App** (`bugbook app`) — native window powered by Electron
  - Uses the same web UI and HTTP server as `bugbook serve`
  - Reads and writes the identical `.bugbook/` files as the CLI (no duplication)
  - External/GitHub links open in the real browser via `shell.openExternal()`
  - `F12` toggles DevTools for debugging
  - Error dialog if the project is not initialised
- **View command** (`bugbook view [ID]`) — show full detail for a single bug directly in the terminal
- **`--format json`** output flag on `list`, `search`, and `stats` for scripting and pipe-friendly workflows
- **GitHub Phase 2** — extended GitHub Issues integration
  - `bugbook github pull [--dry-run] [--auto]` — import GitHub Issues as local bugs
  - `bugbook github sync [--dry-run] [--local-wins]` — two-way sync with conflict detection
  - `bugbook github link <bug-id> <issue-number>` — link an existing bug to an existing issue
  - Comment sync: local comments are pushed to GitHub; GitHub comments are imported with `source: 'github'` tag
  - Default conflict strategy: remote (GitHub) wins; use `--local-wins` to prefer local changes
- **CI/CD pipelines** (`.github/workflows/`)
  - `ci.yml` — build and test matrix on Node 18, 20, and 22 for every push/PR to `main`
  - `release.yml` — auto-publish to npm and create a GitHub Release when a `v*` tag is pushed

### Changed
- `startServer()` extracted as a shared export from `serve.ts` so both `serve` and the Electron main process reuse identical routing logic
- Overdue bugs now show a red left border in the web GUI bug list
- Bug ID in the web GUI bug list is clickable to copy to clipboard
- Web GUI header now shows a `↻` refresh button
- `electron` moved from `dependencies` to `optionalDependencies` — eliminates the ~100 MB Electron binary download for users who only use the CLI (`npm install -g bugbook`)
- `getGitHubIssues` and `getIssueComments` now paginate automatically (supports repos with >100 issues/comments)

### Fixed
- `saveBug()` now uses an atomic write (write to `.tmp` then rename) — prevents a corrupt bug file if the process crashes mid-write
- HTTP server `readBody()` now enforces a 100 KB request body limit, preventing memory exhaustion from oversized payloads
- API routes now validate bug ID format with a strict regex (`[A-Fa-f0-9]{1,8}`) before hitting storage — invalid paths return 404 immediately
- `exec()` for browser-open now has a 5-second timeout to prevent hung processes
- Port validation uses `<= 65535` (correct upper bound)
- `githubRequest()` now rejects with an error on unparseable API responses instead of silently resolving with a raw string

## [0.5.0] - 2026-02-16

### Added
- **Shell Auto-Completion** - Tab completion for commands and bug IDs
  - **Automatic setup offered during `bugbook init`** - One-click installation
  - Completion handler auto-initialized in main script (always responds to shell requests)
  - `bugbook completion install` - Interactive shell selection for installation
  - `bugbook completion setup` - Quick auto-detect and setup
  - `bugbook completion generate` - Generate script for manual installation
  - `bugbook completion uninstall` - Show uninstallation instructions
  - Supports bash, zsh, and fish shells
  - Dynamic bug ID completion for edit, delete, resolve, and comment commands
  - Flag completion for list and resolve commands
- **Bulk Resolve Command** - Resolve multiple bugs at once
  - Support for multiple bug IDs: `bugbook resolve ID1 ID2 ID3`
  - `--all-tagged <tag>` - Resolve all bugs with a specific tag
  - `--all-status <Open|Resolved>` - Filter by bug status
  - `-y` / `--no-confirm` - Skip confirmation prompt
  - Combined filters support (e.g., all Open bugs tagged Backend)
  - Progress feedback for each bug
  - Summary with success/failure counts
  - Validation of all IDs before processing
- **List Filtering & Sorting** - Advanced bug list filtering and sorting
  - `--priority <High|Medium|Low>` - Filter by priority level
  - `--status <Open|Resolved>` - Filter by bug status
  - `--tagged <tag>` - Filter by category/tag
  - `--author <name>` - Filter by author (partial match)
  - `--sort <priority|date|status|dueDate|id>` - Sort by field
  - `--order <asc|desc>` - Sort order (default: desc for most fields, asc for dueDate)
  - `--limit <N>` - Limit number of results shown
  - Multiple filters use AND logic
  - Display active filters and counts in header
- **GitHub Integration (Phase 1)** - Sync bugs to GitHub Issues
  - `bugbook github auth` - Authenticate with GitHub Personal Access Token
  - `bugbook github status` - Show sync status and pending bugs
  - `bugbook github push` - Push open bugs to GitHub Issues
  - Auto-detect repository from `.git/config`
  - Dry-run mode with `--dry-run` flag
  - Force re-push with `--force` flag
  - Store GitHub issue metadata in bugs (issue number, URL, last synced)
  - Auto-create labels from bug categories and priorities
- **Security Hardening** (1 HIGH, 4 MEDIUM vulnerabilities fixed)
  - Fixed vulnerable `tmp` dependency via `npm audit fix`
  - Added `validateBugId()` to prevent path traversal attacks
  - Added export path validation to prevent writing outside cwd
  - Sanitized shell metacharacters in editor commands
  - Expanded system directory blocklist
  - Replaced verbose error dumps with safe error messages
- **Test Coverage Expansion** (+22 new tests, 39 total)
  - Added security tests for `validateBugId()`
  - Added tests for storage utilities and command functions
  - Added tests for GitHub integration
- **Documentation & Planning**
  - Created `ideas/` folder with roadmap and feature specs
  - Added comprehensive GitHub integration documentation
  - Added quick start guide for GitHub features

### Changed
- Bug interface extended with GitHub metadata fields
- Config interface extended to support GitHub settings
- System directory blocklist expanded from 6 to 13 directories

### Security
- **HIGH**: Fixed path traversal vulnerability in bug ID handling
- **MEDIUM**: Fixed export path validation (prevent writes outside cwd)
- **MEDIUM**: Sanitized editor command input (prevent shell injection)
- **MEDIUM**: Fixed vulnerable `tmp` dependency (CVE GHSA-52f5-9888-hmc6)
- **LOW**: Replaced `console.dir(err)` to prevent info disclosure

## [0.4.3] - 2026-02-10

### Code Quality
- **ISO timestamps**: All `toLocaleString()` calls replaced with `toISOString()` for consistent, sortable timestamps
- **Shared editor setup**: Extracted `setupEditor()` helper in `config.ts` — used by `add`, `edit`, and `comment` commands
- **Shared bug picker**: Created `prompts.ts` with `selectBugPrompt()` — used by `delete`, `edit`, `resolve`, and `comment` commands
- **Consistent errors**: All error messages now use `console.error` instead of mixed `console.log`
- **Async export**: Converted `export.ts` from sync `fs.writeFileSync` to async `fs/promises`
- **Uppercase ID comparison**: All bug lookups now consistently use `toUpperCase()` instead of mixed `toLowerCase()`

## [0.4.2] - 2026-02-10

### Improved
- **Lazy initialization**: `validateCwd()` no longer runs on module import — paths are computed on first access via getter functions (`getBugDirPath()`, `getBugsDirPath()`, `getTagsPath()`). Improves testability.
- **Consistent bug IDs**: All bug IDs are now normalized to uppercase consistently in `saveBug()`, `deleteBug()`, and `getBugById()`.
- **Clearer API**: Renamed `validateFilePaths()` → `warnMissingFiles()` to accurately reflect its behavior (warns but always returns all paths). Old name available as deprecated alias.
- **No more process.exit()**: Removed all `process.exit()` calls from `init.ts` — the command handler now returns naturally.

## [0.4.1] - 2026-02-10

### Fixed
- **Corrupt file resilience**: `getBugs()` now catches parse errors per file instead of failing on all bugs when one file is corrupt.
- **Performance**: `addComment()` now reads a single bug file directly via new `getBugById()` helper instead of loading all bugs from disk.
- **Performance**: `migrateIfNeeded()` result is now cached — migration checks only run once per process.
- **Comment command**: Eliminated redundant double bug lookup (was reading all bugs twice).
- Removed unused `readdirSync`/`statSync` imports and unused loop variable.

## [0.4.0] - 2026-02-10

### Added
- **Comment System**: New `bugbook comment <id>` command to add timestamped notes to bugs without editing them. Supports editor mode.
- **Due Dates**: Bugs can now have optional due dates (`YYYY-MM-DD`) set during `add` or changed via `edit`.
- **Deadline Warnings**: `list` command shows overdue bug warnings. `stats` command displays overdue count.
- **Enhanced Export**: Markdown export now includes due dates and comments.

## [0.3.0] - 2026-02-10

### Added
- **Configurable Editor**: Users can now set their preferred editor (VS Code, Vim, Nano, etc.) using `bugbook config editor "cmd"`.
- **Interactive Init**: `bugbook init` now prompts for user name and editor preference if not set.
- **Richer Search**: Search now includes `priority` and `relatedFiles`.
- **File Validation**: `add` and `edit` commands warn if related files do not exist.
- **Improved Testing**: Added integration tests for commands and file validation logic.

## [0.2.0] - 2026-02-10

### Added
- **Global Configuration**: New `config` command to set user details (name, email) which are automatically attached to new bugs.
- **Richer Data**: Bugs now support `priority` levels (High, Medium, Low) and related `files`.
- **Export**: New `export` command to generate a Markdown report (`BUGS.md`) of all bugs.
- **External Editor**: The `add` command now opens your default editor for entering error messages and solutions, making it easier to paste large blocks of text or code.
- **Tags Management**: Enhanced tag management including creating new tags on the fly.

### Changed
- **Storage Engine**: Refactored storage to use individual JSON files for each bug (`.bugbook/bugs/BUG-ID.json`). This significantly reduces git merge conflicts when working in teams.
- **Migration**: Automatic migration system that converts existing `bugs.json` and `bugs.md` files to the new individual file format.
- **CLI Interface**: improved prompts and colors for better readability.

### Fixed
- Fixed issues with legacy file parsing.
- Improved error handling during file operations.

## [0.1.0] - Initial Release
- Basic bug tracking functionalities: add, list, delete, edit, resolve.
- Search capabilities (fuzzy search).
- Tagging system.
