/**
 * End-to-end smoke test
 *
 * Runs a full workflow against a real temporary directory using the storage
 * layer directly (no mocks, no spawned process) so it catches regressions that
 * unit tests with mocked I/O would miss.
 *
 * Workflow: bootstrap → add → list → getBugById → resolve → stats → overdue → export
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Temp directory setup — runs before any imports of the storage module so that
// process.cwd() resolves to the temp dir when getSafeCwd() is first called.
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalCwd: string;

beforeAll(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbook-e2e-'));

    // Bootstrap .bugbook structure (equivalent to `bugbook init`)
    fs.mkdirSync(path.join(tmpDir, '.bugbook', 'bugs'), { recursive: true });
    fs.writeFileSync(
        path.join(tmpDir, '.bugbook', 'tags.json'),
        JSON.stringify(['General', 'Frontend', 'Backend']),
        { mode: 0o600 }
    );

    process.chdir(tmpDir);
});

afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

describe('E2E smoke test — full workflow', () => {
    it('init check: ensureProjectInit returns true for bootstrapped dir', async () => {
        const { ensureProjectInit } = await import('../src/utils/storage');
        expect(ensureProjectInit()).toBe(true);
    });

    it('add: can save a bug to disk', async () => {
        const { addBug } = await import('../src/utils/storage');
        await addBug({
            id: 'E2E00001',
            timestamp: new Date().toISOString(),
            category: 'General',
            error: 'TypeError: Cannot read properties of undefined',
            solution: 'Add a null guard before accessing the property.',
            status: 'Open',
            priority: 'High',
        });

        // File should exist on disk
        const filePath = path.join(tmpDir, '.bugbook', 'bugs', 'BUG-E2E00001.json');
        expect(fs.existsSync(filePath)).toBe(true);
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(saved.id).toBe('E2E00001');
    });

    it('add: can save a second bug with a due date', async () => {
        const { addBug } = await import('../src/utils/storage');
        await addBug({
            id: 'E2E00002',
            timestamp: new Date().toISOString(),
            category: 'Backend',
            error: 'Database connection timeout',
            solution: '',
            status: 'Open',
            priority: 'Medium',
            dueDate: '2020-01-01', // intentionally overdue
        });
    });

    it('list: getBugs returns all saved bugs', async () => {
        const { getBugs } = await import('../src/utils/storage');
        const bugs = await getBugs();
        expect(bugs.length).toBeGreaterThanOrEqual(2);
        const ids = bugs.map((b) => b.id);
        expect(ids).toContain('E2E00001');
        expect(ids).toContain('E2E00002');
    });

    it('view: getBugById returns the correct bug', async () => {
        const { getBugById } = await import('../src/utils/storage');
        const bug = await getBugById('E2E00001');
        expect(bug).not.toBeNull();
        expect(bug!.error).toBe('TypeError: Cannot read properties of undefined');
        expect(bug!.priority).toBe('High');
    });

    it('view: getBugById returns null for a non-existent ID', async () => {
        const { getBugById } = await import('../src/utils/storage');
        const bug = await getBugById('FFFFFFFF');
        expect(bug).toBeNull();
    });

    it('resolve: saveBug persists a status change', async () => {
        const { getBugById, saveBug } = await import('../src/utils/storage');
        const bug = await getBugById('E2E00001');
        expect(bug).not.toBeNull();
        bug!.status = 'Resolved';
        await saveBug(bug!);

        const reloaded = await getBugById('E2E00001');
        expect(reloaded!.status).toBe('Resolved');
    });

    it('stats: correct open/resolved/overdue counts', async () => {
        const { getBugs, getOverdueBugs } = await import('../src/utils/storage');
        const bugs = await getBugs();

        const open = bugs.filter((b) => b.status === 'Open').length;
        const resolved = bugs.filter((b) => b.status === 'Resolved').length;
        const overdue = getOverdueBugs(bugs);

        expect(resolved).toBeGreaterThanOrEqual(1); // E2E00001 was resolved above
        expect(open).toBeGreaterThanOrEqual(1);     // E2E00002 is still open
        // E2E00002 has dueDate 2020-01-01 and is still Open → overdue
        expect(overdue.some((b) => b.id === 'E2E00002')).toBe(true);
    });

    it('comment: addComment appends a timestamped comment', async () => {
        const { addComment, getBugById } = await import('../src/utils/storage');
        const result = await addComment('E2E00002', 'Investigating the timeout issue.');
        expect(result.success).toBe(true);

        const bug = await getBugById('E2E00002');
        expect(bug!.comments).toHaveLength(1);
        expect(bug!.comments![0].text).toBe('Investigating the timeout issue.');
        expect(bug!.comments![0].timestamp).toBeTruthy();
    });

    it('delete: deleteBug removes the file from disk', async () => {
        const { deleteBug, getBugById } = await import('../src/utils/storage');
        await deleteBug('E2E00001');

        const bug = await getBugById('E2E00001');
        expect(bug).toBeNull();

        const filePath = path.join(tmpDir, '.bugbook', 'bugs', 'BUG-E2E00001.json');
        expect(fs.existsSync(filePath)).toBe(false);
    });
});
