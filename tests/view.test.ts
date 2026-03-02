
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleView } from '../src/commands/view';
import { Bug } from '../src/utils/storage';

vi.mock('../src/utils/storage', () => ({
    getBugById: vi.fn(),
    isOverdue: vi.fn().mockReturnValue(false),
    ensureProjectInit: vi.fn().mockReturnValue(true),
}));

import { getBugById, isOverdue, ensureProjectInit } from '../src/utils/storage';

const fullBug: Bug = {
    id: 'AABB1122',
    timestamp: '2024-01-15T10:00:00Z',
    category: 'Backend',
    error: 'Uncaught TypeError: Cannot read property of null',
    solution: 'Check for null before accessing property',
    status: 'Open',
    priority: 'High',
    author: 'Alice',
    dueDate: '2099-12-31',
    files: ['src/api.ts', 'src/utils.ts'],
    comments: [
        { text: 'First comment', timestamp: '2024-01-16T10:00:00Z', author: 'Bob' },
        { text: 'GitHub comment', timestamp: '2024-01-17T10:00:00Z', author: 'octocat', source: 'github' },
    ],
    github_issue_number: 42,
    github_issue_url: 'https://github.com/owner/repo/issues/42',
    last_synced: '2024-01-15T12:00:00Z',
};

describe('handleView', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (ensureProjectInit as any).mockReturnValue(true);
        (isOverdue as any).mockReturnValue(false);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('prints error when project is not initialized', async () => {
        (ensureProjectInit as any).mockReturnValue(false);
        await handleView(['AABB1122']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not initialized/i));
    });

    it('prints usage when no bug ID is provided', async () => {
        await handleView([]);
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Usage/i));
        expect(getBugById).not.toHaveBeenCalled();
    });

    it('prints error when bug ID is not found', async () => {
        (getBugById as any).mockResolvedValue(null);
        await handleView(['DEADBEEF']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not found/i));
    });

    it('displays bug ID and status', async () => {
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('AABB1122');
        expect(output).toContain('OPEN');
    });

    it('displays error, solution, and category', async () => {
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('Uncaught TypeError');
        expect(output).toContain('Check for null');
        expect(output).toContain('Backend');
    });

    it('displays author and priority', async () => {
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('Alice');
        expect(output).toContain('High');
    });

    it('displays related files', async () => {
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('src/api.ts');
        expect(output).toContain('src/utils.ts');
    });

    it('displays comments with author and source tag for GitHub comments', async () => {
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('First comment');
        expect(output).toContain('Bob');
        expect(output).toContain('GitHub comment');
        expect(output).toContain('[GitHub]');
    });

    it('displays GitHub issue number and URL', async () => {
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('#42');
        expect(output).toContain('https://github.com/owner/repo/issues/42');
    });

    it('marks due date as OVERDUE when isOverdue returns true', async () => {
        (isOverdue as any).mockReturnValue(true);
        (getBugById as any).mockResolvedValue(fullBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('OVERDUE');
    });

    it('shows [RESOLVED] badge for resolved bugs', async () => {
        const resolvedBug: Bug = { ...fullBug, status: 'Resolved' };
        (getBugById as any).mockResolvedValue(resolvedBug);
        await handleView(['AABB1122']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('RESOLVED');
    });

    it('works for a minimal bug (no optional fields)', async () => {
        const minimalBug: Bug = {
            id: 'MIN00001',
            timestamp: '2024-01-01T00:00:00Z',
            category: 'General',
            error: 'Simple error',
            solution: '',
            status: 'Open',
        };
        (getBugById as any).mockResolvedValue(minimalBug);
        await handleView(['MIN00001']);
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toContain('MIN00001');
        expect(output).toContain('Simple error');
        // No GitHub section should appear
        expect(output).not.toContain('GitHub:');
    });
});
