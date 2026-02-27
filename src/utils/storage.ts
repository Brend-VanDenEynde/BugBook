import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import { getUserConfig } from './config';

export const BUG_DIR = '.bugbook';
export const BUGS_SUBDIR = 'bugs';
export const BUG_FILE_JSON = 'bugs.json'; // Legacy
export const TAGS_FILE_JSON = 'tags.json';

// Legacy files for migration
const LEGACY_BUG_FILE = 'bugs.md';
const LEGACY_TAGS_FILE = 'tags.md';

/**
 * Validate that the current working directory is safe.
 * Lazy: only runs on first access, not on module load.
 */
let _safeCwd: string | null = null;
const getSafeCwd = (): string => {
    if (_safeCwd) return _safeCwd;
    const cwd = process.cwd();
    const normalized = path.resolve(cwd);
    const systemDirs = ['/etc', '/usr', '/bin', '/sbin', '/var', '/boot', '/lib', '/proc', '/sys', 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData'];
    for (const sysDir of systemDirs) {
        if (normalized.toLowerCase().startsWith(sysDir.toLowerCase())) {
            throw new Error(`Cannot initialize bugbook in system directory: ${normalized}`);
        }
    }
    _safeCwd = normalized;
    return _safeCwd;
};

/** Lazy-computed paths — not evaluated at import time. */
export const getBugDirPath = () => path.join(getSafeCwd(), BUG_DIR);
export const getBugsDirPath = () => path.join(getBugDirPath(), BUGS_SUBDIR);
export const getTagsPath = () => path.join(getBugDirPath(), TAGS_FILE_JSON);
export const getLegacyBugJsonPath = () => path.join(getBugDirPath(), BUG_FILE_JSON);
const getLegacyBugMdPath = () => path.join(getBugDirPath(), LEGACY_BUG_FILE);
const getLegacyTagsMdPath = () => path.join(getBugDirPath(), LEGACY_TAGS_FILE);

export const BUG_PREVIEW_LENGTH = 50;
export const DEFAULT_LIST_COUNT = 5;
export const MAX_INPUT_LENGTH = 2000;

const VALID_STATUSES = ['Open', 'Resolved'] as const;
export type BugStatus = typeof VALID_STATUSES[number];

export type BugPriority = 'High' | 'Medium' | 'Low';

export interface BugComment {
    text: string;
    timestamp: string;
    author?: string;
    source?: 'github'; // marks comments imported from GitHub
}

export interface Bug {
    id: string;
    timestamp: string;
    category: string;
    error: string;
    solution: string;
    status: BugStatus;
    author?: string;
    priority?: BugPriority;
    files?: string[];
    comments?: BugComment[];
    dueDate?: string; // YYYY-MM-DD
    // GitHub integration
    github_issue_number?: number;
    github_issue_url?: string;
    github_issue_closed?: boolean;
    last_synced?: string; // ISO timestamp
    last_modified?: string; // ISO timestamp, updated on every saveBug() call
}

export const ensureProjectInit = (): boolean => {
    // Check if .bugbook exists
    return existsSync(getBugDirPath());
};

export const initStorage = async () => {
    if (!existsSync(getBugDirPath())) {
        await fs.mkdir(getBugDirPath(), { recursive: true });
    }
    if (!existsSync(getBugsDirPath())) {
        await fs.mkdir(getBugsDirPath(), { recursive: true });
    }
};

/**
 * Migrate legacy data to individual JSON files.
 * Cached: only runs once per process lifetime.
 */
let migrationDone = false;
const migrateIfNeeded = async (): Promise<void> => {
    if (migrationDone) return;
    await initStorage();

    // 1. Migrate bugs.json (Legacy JSON) to individual files
    if (existsSync(getLegacyBugJsonPath())) {
        console.log(chalk.yellow('Migrating bugs.json to individual files...'));
        try {
            const content = await fs.readFile(getLegacyBugJsonPath(), 'utf-8');
            const bugs: Bug[] = JSON.parse(content);

            for (const bug of bugs) {
                const bugPath = path.join(getBugsDirPath(), `BUG-${bug.id}.json`);
                if (!existsSync(bugPath)) {
                    await fs.writeFile(bugPath, JSON.stringify(bug, null, 2), { mode: 0o600 });
                }
            }

            await fs.rename(getLegacyBugJsonPath(), `${getLegacyBugJsonPath()}.bak`);
            console.log(chalk.green(`Migrated ${bugs.length} bugs from bugs.json.`));
        } catch (error) {
            console.error(chalk.red('Migration from bugs.json failed:'), error);
        }
    }

    // 2. Migrate bugs.md (Legacy Markdown) to individual files
    if (existsSync(getLegacyBugMdPath())) {
        console.log(chalk.yellow('Migrating legacy Markdown to individual files...'));
        try {
            const content = await fs.readFile(getLegacyBugMdPath(), 'utf-8');
            const sections = content.split('---').map(s => s.trim()).filter(s => s.length > 0);

            let count = 0;
            for (const section of sections) {
                const idMatch = section.match(/\*\*ID:\*\*\s*(.*)/i);
                const catMatch = section.match(/\*\*Category:\*\*\s*(.*)/i);
                const errMatch = section.match(/\*\*Error:\*\*\s*(.*)/i);
                const solMatch = section.match(/\*\*Solution:\*\*\s*(.*)/i);
                const statusMatch = section.match(/\*\*Status:\*\*\s*(.*)/i);
                const timeMatch = section.match(/^## \[(.*)\]/);

                const bug: Bug = {
                    id: idMatch ? idMatch[1].trim() : generateId(),
                    timestamp: timeMatch ? timeMatch[1].trim() : new Date().toISOString(),
                    category: catMatch ? catMatch[1].trim() : 'General',
                    error: errMatch ? errMatch[1].trim() : '',
                    solution: solMatch ? solMatch[1].trim() : '',
                    status: (statusMatch ? statusMatch[1].trim() : 'Open') as BugStatus,
                    author: '' // Legacy bugs have no author
                };

                const bugPath = path.join(getBugsDirPath(), `BUG-${bug.id}.json`);
                if (!existsSync(bugPath)) {
                    await fs.writeFile(bugPath, JSON.stringify(bug, null, 2), { mode: 0o600 });
                    count++;
                }
            }

            await fs.rename(getLegacyBugMdPath(), `${getLegacyBugMdPath()}.bak`);
            console.log(chalk.green(`Migrated ${count} bugs from bugs.md.`));

        } catch (error) {
            console.error(chalk.red('Migration from bugs.md failed:'), error);
        }
    }

    // 3. Migrate tags
    if (existsSync(getLegacyTagsMdPath()) && !existsSync(getTagsPath())) {
        try {
            const content = await fs.readFile(getLegacyTagsMdPath(), 'utf-8');
            const tags = content.split('\n').map(t => t.trim()).filter(t => t.length > 0);
            await fs.writeFile(getTagsPath(), JSON.stringify(tags, null, 2), { mode: 0o600 });
            await fs.rename(getLegacyTagsMdPath(), `${getLegacyTagsMdPath()}.bak`);
        } catch (error) {
            console.error(chalk.red('Tag migration failed:'), error);
        }
    }
    migrationDone = true;
};

export const getTags = async (): Promise<string[]> => {
    await migrateIfNeeded();
    if (existsSync(getTagsPath())) {
        const fileContent = await fs.readFile(getTagsPath(), 'utf-8');
        try {
            return JSON.parse(fileContent) as string[];
        } catch {
            return ['General'];
        }
    }
    return ['General'];
};

export const getBugs = async (): Promise<Bug[]> => {
    await migrateIfNeeded();
    if (!existsSync(getBugsDirPath())) return [];

    try {
        const files = await fs.readdir(getBugsDirPath());
        const bugs: Bug[] = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(path.join(getBugsDirPath(), file), 'utf-8');
                    bugs.push(JSON.parse(content));
                } catch (err) {
                    console.error(chalk.yellow(`Warning: Skipping corrupt file ${file}`));
                }
            }
        }

        // Sort by timestamp descending (newest first)
        // Note: This relies on the timestamp string format which might not sort chronologically perfect if locale varies
        // but essentially we just return them. The list command can sort if needed.
        return bugs;

    } catch (error) {
        console.error(chalk.red('Error reading bugs directory:'), error);
        return [];
    }
};

export const saveBug = async (bug: Bug) => {
    await initStorage();
    bug.last_modified = new Date().toISOString();
    const bugPath = path.join(getBugsDirPath(), `BUG-${bug.id.toUpperCase()}.json`);
    await fs.writeFile(bugPath, JSON.stringify(bug, null, 2), { mode: 0o600 });
};

export const deleteBug = async (bugId: string) => {
    await initStorage();
    const bugPath = path.join(getBugsDirPath(), `BUG-${bugId.toUpperCase()}.json`);
    if (existsSync(bugPath)) {
        await fs.unlink(bugPath);
    }
};

export const addBug = async (bug: Bug) => {
    // Inject author if available
    const config = getUserConfig();
    if (config.user?.name) {
        bug.author = config.user.name;
    }

    await saveBug(bug);
};

export const getBugCounts = async (): Promise<Record<string, number>> => {
    const bugs = await getBugs();
    const counts: Record<string, number> = {};
    bugs.forEach(b => {
        counts[b.category] = (counts[b.category] || 0) + 1;
    });
    return counts;
};

export const generateId = (): string => {
    return randomUUID().substring(0, 8).toUpperCase();
};

export const sanitizeInput = (input: string): string => {
    return input.substring(0, MAX_INPUT_LENGTH).trim();
};

export const validateBugId = (id: string): boolean => {
    return /^[A-Fa-f0-9]{1,8}$/i.test(id.trim());
};

export const sanitizeTagName = (tag: string): string => {
    return tag.trim().replace(/[^\w\s-]/g, '');
};

export const addTag = async (tag: string): Promise<{ success: boolean; message: string }> => {
    const sanitized = sanitizeTagName(tag);
    if (!sanitized) {
        return { success: false, message: 'Invalid tag name.' };
    }
    const currentTags = await getTags();
    if (currentTags.includes(sanitized)) {
        return { success: false, message: 'Tag already exists.' };
    }
    currentTags.push(sanitized);
    await fs.writeFile(getTagsPath(), JSON.stringify(currentTags, null, 2), { mode: 0o600 });
    return { success: true, message: `Tag '${sanitized}' added.` };
};

export const isOverdue = (bug: Bug): boolean => {
    if (!bug.dueDate || bug.status === 'Resolved') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(bug.dueDate + 'T00:00:00');
    return due < today;
};

export const getOverdueBugs = (bugs: Bug[]): Bug[] => {
    return bugs.filter(isOverdue);
};

export const validateDateStr = (input: string): boolean => {
    if (!input.trim()) return true; // empty is allowed (skip)
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(input.trim())) return false;
    const d = new Date(input.trim() + 'T00:00:00');
    return !isNaN(d.getTime());
};

/**
 * Load a single bug directly by ID (avoids reading all bugs from disk).
 */
export const getBugById = async (bugId: string): Promise<Bug | null> => {
    await migrateIfNeeded();
    const bugPath = path.join(getBugsDirPath(), `BUG-${bugId.toUpperCase()}.json`);
    if (!existsSync(bugPath)) return null;
    try {
        const content = await fs.readFile(bugPath, 'utf-8');
        return JSON.parse(content) as Bug;
    } catch {
        return null;
    }
};

export const addComment = async (bugId: string, text: string): Promise<{ success: boolean; message: string }> => {
    const bug = await getBugById(bugId);
    if (!bug) {
        return { success: false, message: `Bug with ID '${bugId}' not found.` };
    }

    const config = getUserConfig();
    const comment: BugComment = {
        text: sanitizeInput(text),
        timestamp: new Date().toISOString(),
        author: config.user?.name || undefined
    };

    if (!bug.comments) bug.comments = [];
    bug.comments.push(comment);
    await saveBug(bug);
    return { success: true, message: `Comment added to bug [${bug.id}].` };
};

export const displayBug = (bug: Bug): void => {
    console.log(chalk.white('--------------------------------------------------'));
    const statusIcon = bug.status === 'Resolved' ? '✅' : '🔴';

    let priorityStr = '';
    if (bug.priority) {
        const pColor = bug.priority === 'High' ? chalk.red : (bug.priority === 'Medium' ? chalk.yellow : chalk.blue);
        priorityStr = ` [${pColor(bug.priority)}]`;
    }

    console.log(`${chalk.bold.white('ID:')} ${bug.id}  ${statusIcon} ${bug.status}${priorityStr}`);
    if (bug.author) {
        console.log(`${chalk.bold.white('Author:')} ${bug.author}`);
    }
    console.log(`${chalk.bold.white('Category:')} ${bug.category}`);

    // Due date with overdue warning
    if (bug.dueDate) {
        if (isOverdue(bug)) {
            console.log(`${chalk.bold.white('Due Date:')} ${chalk.red(`⚠️  ${bug.dueDate} (OVERDUE)`)}`);
        } else {
            console.log(`${chalk.bold.white('Due Date:')} ${chalk.green(bug.dueDate)}`);
        }
    }

    console.log(`${chalk.bold.white('Error:')} ${bug.error}`);
    console.log(`${chalk.bold.white('Solution:')} ${bug.solution}`);

    if (bug.files && bug.files.length > 0) {
        console.log(`${chalk.bold.white('Files:')}`);
        bug.files.forEach(f => console.log(`  - ${f}`));
    }

    // Show comments
    if (bug.comments && bug.comments.length > 0) {
        console.log(`${chalk.bold.white('Comments:')} (${bug.comments.length})`);
        bug.comments.forEach((c) => {
            const authorStr = c.author ? ` (${c.author})` : '';
            console.log(chalk.gray(`  [${c.timestamp}]${authorStr}`));
            console.log(`  ${c.text}`);
        });
    }
};

export const displayBugs = (bugs: Bug[]): void => {
    bugs.forEach(displayBug);
    console.log(chalk.white('--------------------------------------------------'));
};


/**
 * Warns about missing file paths but still returns all of them.
 * Renamed from validateFilePaths to accurately reflect behavior.
 */
export const warnMissingFiles = (paths: string[]): string[] => {
    paths.forEach(p => {
        if (!existsSync(p)) {
            console.log(chalk.yellow(`Warning: File '${p}' does not exist. It will still be added.`));
        }
    });
    return paths;
};

/** @deprecated Use warnMissingFiles instead */
export const validateFilePaths = warnMissingFiles;

/**
 * Fast retrieval of all bug IDs (reads filenames only, not file contents).
 * Used for shell auto-completion.
 */
export const getAllBugIds = async (): Promise<string[]> => {
    if (!existsSync(getBugsDirPath())) return [];
    try {
        const files = await fs.readdir(getBugsDirPath());
        return files
            .filter(f => f.startsWith('BUG-') && f.endsWith('.json'))
            .map(f => f.replace('BUG-', '').replace('.json', ''));
    } catch {
        return [];
    }
};
