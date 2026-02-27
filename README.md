# Bugbook

**Bugbook** is a developer-first bug tracker that lives entirely on your machine. Bugs are stored as plain JSON files inside your project, version-controlled with your code, and accessible from a fast CLI, a local web GUI, or a native desktop window — no server, no account, no friction.

[![CI](https://github.com/Brend-VanDenEynde/bugbook/actions/workflows/ci.yml/badge.svg)](https://github.com/Brend-VanDenEynde/bugbook/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/bugbook.svg)](https://www.npmjs.com/package/bugbook)
[![npm downloads](https://img.shields.io/npm/dm/bugbook.svg)](https://www.npmjs.com/package/bugbook)
![Version](https://img.shields.io/badge/version-0.6.0-green.svg)
![License](https://img.shields.io/badge/license-ISC-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)

---

## Features

### Core
- **Local-first storage** — Individual JSON files in `.bugbook/bugs/` keep every bug diffable and merge-friendly
- **Priority & due dates** — High / Medium / Low priority with overdue warnings
- **Comments** — Timestamped notes on any bug without editing the original report
- **Tags / categories** — Organize bugs by module, file type, or any label you define
- **Fuzzy search** — Find past solutions by error message, ID, priority, author, or file name
- **Export** — Generate a `BUGS.md` Markdown report for your repository

### Filtering & Sorting
- `--priority`, `--status`, `--tagged`, `--author` filters on `list`
- `--sort` by priority / date / status / due date, `--order asc|desc`, `--limit N`
- `--format json` on `list`, `search`, and `stats` for scripting / pipe-friendly output

### Bulk Operations
- Resolve multiple bugs at once: `bugbook resolve ID1 ID2 ID3`
- `--all-tagged <tag>` and `--all-status <status>` for batch resolves
- `-y` / `--no-confirm` flag to skip the confirmation prompt

### Web GUI (`bugbook serve`)
- Instant local web interface — no external dependencies, no build step
- Split-panel layout: searchable bug list on the left, full detail on the right
- Create, edit, resolve, delete, and comment on bugs in the browser
- Filter by status and priority; sort by newest / priority / overdue / oldest
- Keyboard shortcuts: `N` new · `E` edit · `Del` delete · `R` refresh · `↑ ↓` navigate
- Auto-refreshes when you switch back from the terminal (picks up CLI changes instantly)
- Opens your default browser automatically on start

### Desktop App (`bugbook app`)
- Native desktop window powered by Electron — same GUI, no browser required
- Reads and writes the exact same `.bugbook/` files as the CLI
- External links (GitHub issues) open in your real browser
- `F12` toggles DevTools for debugging

### GitHub Integration (`bugbook github`)
- Authenticate with a Personal Access Token (`bugbook github auth`)
- **Push** local bugs to GitHub Issues with labels auto-created from categories and priorities
- **Pull** GitHub Issues into your local bug database
- **Sync** two-way with conflict detection (default: remote wins; `--local-wins` to override)
- **Link** an existing bug to an existing issue: `bugbook github link <id> <issue-number>`
- Dry-run mode with `--dry-run` on all write operations
- Comment sync: local comments pushed to GitHub, GitHub comments imported with source tagging

### Shell Auto-Completion
- Tab completion for all commands and bug IDs in **bash**, **zsh**, and **fish**
- Offered automatically during `bugbook init`; or set up manually with `bugbook completion setup`

---

## Installation

### From npm (recommended)

```bash
npm install -g bugbook
```

### From source

```bash
git clone https://github.com/Brend-VanDenEynde/bugbook.git
cd bugbook
npm install
npm run build
npm link          # makes `bugbook` available globally
```

---

## Quick Start

```bash
# 1. Initialise in your project directory
cd my-project
bugbook init

# 2. Add your first bug
bugbook add

# 3. Open the web GUI in your browser
bugbook serve

# 4. Or open the desktop window
bugbook app
```

---

## CLI Reference

### Commands

| Command | Description |
| :--- | :--- |
| `init` | Initialise Bugbook in the current directory |
| `add` | Report a new bug (interactive prompts) |
| `list [options]` | List bugs with filtering and sorting |
| `view [ID]` | Show full detail for a single bug |
| `search [query]` | Fuzzy search by ID, text, priority, or file name |
| `edit [ID]` | Edit an existing bug |
| `delete [ID]` | Delete a bug (with confirmation) |
| `resolve [IDs] [options]` | Resolve or re-open bugs |
| `comment [ID]` | Add a timestamped comment to a bug |
| `stats [--format json]` | Overview of open, resolved, and overdue bugs |
| `tags` | List all tags and their usage counts |
| `new-tag` | Create a new tag |
| `export [--out file]` | Export bugs to a Markdown file (default: `BUGS.md`) |
| `config [key] [value]` | View or set global config (user.name, editor) |
| `serve [--port N]` | Start the local web GUI (default port 3000) |
| `app` | Open Bugbook as a native desktop window (Electron) |
| `github [subcommand]` | GitHub Issues integration |
| `completion [subcommand]` | Set up shell auto-completion |
| `version` | Show version |
| `help` | Show help menu |

### `list` flags

```
--priority High|Medium|Low    Filter by priority
--status   Open|Resolved      Filter by status
--tagged   <tag>              Filter by category
--author   <name>             Filter by author (partial match)
--sort     priority|date|status|dueDate|id
--order    asc|desc
--limit    N
--format   json
```

### `resolve` flags

```
--all-tagged  <tag>           Resolve all bugs with this tag
--all-status  <status>        Combined with --all-tagged for precision
-y / --no-confirm             Skip confirmation
```

### `github` subcommands

```
bugbook github auth                       Authenticate with a PAT
bugbook github push [--dry-run] [--force] Push bugs → GitHub Issues
bugbook github pull [--dry-run] [--auto]  Pull GitHub Issues → local
bugbook github sync [--dry-run] [--local-wins]  Two-way sync
bugbook github link <bug-id> <issue-num>  Link existing bug to issue
bugbook github status                     Show sync status
```

---

## Examples

```bash
# Add a bug with all fields
bugbook add

# Find a past solution fast
bugbook search "null pointer"

# View a single bug in full detail
bugbook view ABC12345

# Filter the list
bugbook list --priority High --status Open
bugbook list --tagged Frontend --sort dueDate --order asc --limit 10

# Batch resolve
bugbook resolve ABC123 DEF456
bugbook resolve --all-tagged Backend -y

# JSON output for scripting
bugbook list --format json | jq '.[] | .id'
bugbook stats --format json

# Start the web GUI on a custom port
bugbook serve --port 4000

# Export a Markdown report
bugbook export --out BUGS.md

# GitHub sync
bugbook github auth
bugbook github push --dry-run
bugbook github sync
```

---

## Web GUI

Run `bugbook serve` (or `bugbook app` for the desktop window) and manage your bugs visually:

```
┌────────────────────────────────────────────────────────────────┐
│  Bugbook   Total:4  Open:3  Resolved:1  Overdue:1    [↻] [+ New Bug] │
├──────────────────┬─────────────────────────────────────────────┤
│  🔍 Search...    │  ABC12345                                   │
│  [All][Open][✓]  │  ● OPEN  [High]  [OVERDUE]                 │
│  All ▼  Newest ▼ │                                             │
│  ─────────────── │  Error                                      │
│  ● ABC12345 High │  TypeError: Cannot read properties of null  │
│    TypeError...  │                                             │
│  ● DEF67890 Low  │  Solution                                   │
│    Button not... │  Add null check before accessing .user      │
│                  │                                             │
│                  │  Backend  ·  Alice  ·  Jan 15 2024          │
│                  │                                             │
│                  │  🔗 GitHub #42 · Open                       │
│                  │                                             │
│                  │  [Edit]  [Resolve]  [Delete]                │
│                  │  [Add a comment...          ] [Post]        │
└──────────────────┴─────────────────────────────────────────────┘
```

**Keyboard shortcuts:** `N` new bug · `E` edit selected · `Del` delete selected · `R` refresh · `↑`/`↓` navigate list · `Esc` close modal

---

## Storage

All data lives in your project directory — nothing is sent anywhere:

```
my-project/
└── .bugbook/
    ├── bugs/
    │   ├── BUG-ABC12345.json
    │   └── BUG-DEF67890.json
    └── tags.json
```

Add `.bugbook/` to your `.gitignore` to keep bugs private, or commit it to share with your team.

---

## GitHub Integration

Bugbook can mirror your bugs as GitHub Issues and keep them in sync.

**Setup:**

```bash
# Create a PAT at https://github.com/settings/tokens (needs `repo` scope)
bugbook github auth

# Push all open bugs as issues
bugbook github push

# Pull issues created on GitHub back into Bugbook
bugbook github pull

# Two-way sync (detects and resolves conflicts)
bugbook github sync
```

**Conflict resolution:** by default remote (GitHub) wins. Pass `--local-wins` to prefer local changes.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, branch strategy, and commit message conventions.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes, add tests if applicable
4. Verify: `npm run build && npm test`
5. Open a Pull Request against `main`

The CI pipeline will run the full build and test matrix automatically on your PR.

---

## License

[ISC](LICENSE)
