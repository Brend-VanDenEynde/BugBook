
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import https from 'https';

vi.mock('https', () => ({
    default: { request: vi.fn() }
}));

vi.mock('../src/utils/config', () => ({
    getUserConfig: vi.fn(),
    setUserConfig: vi.fn(),
}));

vi.mock('../src/utils/storage', () => ({
    getBugs: vi.fn(),
    getBugById: vi.fn(),
    saveBug: vi.fn(),
    ensureProjectInit: vi.fn().mockReturnValue(true),
    generateId: vi.fn().mockReturnValue('NEWID001'),
    sanitizeInput: vi.fn((s: string) => s),
}));

vi.mock('inquirer', () => ({
    default: { prompt: vi.fn() }
}));

import { handleGitHubPull, handleGitHubSync, handleGitHubLink } from '../src/commands/github';
import { getUserConfig } from '../src/utils/config';
import { getBugs, getBugById, saveBug, ensureProjectInit } from '../src/utils/storage';
import { Bug } from '../src/utils/storage';
import inquirer from 'inquirer';

// ── HTTP mock helpers ─────────────────────────────────────────────────────────

function makeMockHttps(statusCode: number, responseBody: any) {
    (https.request as any).mockImplementation((_opts: any, callback: any) => {
        const res = new EventEmitter() as any;
        res.statusCode = statusCode;
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn(() => {
            callback(res);
            res.emit('data', JSON.stringify(responseBody));
            res.emit('end');
        });
        return req;
    });
}

/**
 * Make the https mock return different responses per call (queue-based).
 */
function makeMockHttpsQueue(responses: Array<{ statusCode: number; body: any }>) {
    let callIdx = 0;
    (https.request as any).mockImplementation((_opts: any, callback: any) => {
        const r = responses[callIdx] || responses[responses.length - 1];
        callIdx++;
        const res = new EventEmitter() as any;
        res.statusCode = r.statusCode;
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn(() => {
            callback(res);
            res.emit('data', JSON.stringify(r.body));
            res.emit('end');
        });
        return req;
    });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ghConfig = { token: 'ghp_token', owner: 'owner', repo: 'repo' };

const sampleBug: Bug = {
    id: 'AABB1122',
    timestamp: '2024-01-01T00:00:00Z',
    category: 'Backend',
    error: 'Null pointer error',
    solution: 'Add null check',
    status: 'Open',
    github_issue_number: 10,
    github_issue_url: 'https://github.com/owner/repo/issues/10',
    last_synced: '2024-01-01T12:00:00Z',
    last_modified: '2024-01-01T11:00:00Z',
};

const sampleIssue = {
    number: 10,
    title: 'Null pointer error',
    body: '## Error\nNull pointer error\n\n## Solution\nAdd null check\n\n## Metadata\n- **Category**: Backend\n\n---\n*Created from [BugBook](https://github.com/Brend-VanDenEynde/bugbook)*',
    html_url: 'https://github.com/owner/repo/issues/10',
    state: 'open',
    labels: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T11:30:00Z', // newer than last_synced
};

// ── handleGitHubLink ──────────────────────────────────────────────────────────

describe('handleGitHubLink', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (ensureProjectInit as any).mockReturnValue(true);
        (getUserConfig as any).mockReturnValue({ github: ghConfig });
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('prints usage when args are missing', async () => {
        await handleGitHubLink([]);
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Usage/i));
    });

    it('prints error when bug is not found', async () => {
        (getBugById as any).mockResolvedValue(null);
        await handleGitHubLink(['MISSING', '5']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not found/i));
    });

    it('prints error when issue number is not valid', async () => {
        (getBugById as any).mockResolvedValue(sampleBug);
        await handleGitHubLink(['AABB1122', 'abc']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/positive integer/i));
    });

    it('prints error when GitHub issue fetch fails', async () => {
        (getBugById as any).mockResolvedValue(sampleBug);
        makeMockHttps(404, { message: 'Not Found' });
        await handleGitHubLink(['AABB1122', '999']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Could not fetch/i));
    });

    it('saves bug with github fields on success', async () => {
        const unlinkedBug: Bug = { ...sampleBug, github_issue_number: undefined, github_issue_url: undefined };
        (getBugById as any).mockResolvedValue(unlinkedBug);
        makeMockHttps(200, { ...sampleIssue, number: 5, html_url: 'https://github.com/owner/repo/issues/5' });

        await handleGitHubLink(['AABB1122', '5']);

        expect(saveBug).toHaveBeenCalledWith(
            expect.objectContaining({
                github_issue_number: 5,
                github_issue_url: 'https://github.com/owner/repo/issues/5',
            })
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/linked/i));
    });

    it('prints error when project is not initialized', async () => {
        (ensureProjectInit as any).mockReturnValue(false);
        await handleGitHubLink(['AABB1122', '5']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not initialized/i));
    });

    it('prints error when GitHub token is not configured', async () => {
        (getUserConfig as any).mockReturnValue({ github: {} });
        await handleGitHubLink(['AABB1122', '5']);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/token not configured/i));
    });
});

// ── handleGitHubPull ──────────────────────────────────────────────────────────

describe('handleGitHubPull', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (ensureProjectInit as any).mockReturnValue(true);
        (getUserConfig as any).mockReturnValue({ github: ghConfig });
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('prints error when project is not initialized', async () => {
        (ensureProjectInit as any).mockReturnValue(false);
        await handleGitHubPull([]);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not initialized/i));
    });

    it('prints error when token is missing', async () => {
        (getUserConfig as any).mockReturnValue({ github: {} });
        await handleGitHubPull([]);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/token not configured/i));
    });

    it('shows "No open issues" when GitHub returns empty list', async () => {
        makeMockHttps(200, []);
        (getBugs as any).mockResolvedValue([]);
        await handleGitHubPull([]);
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No open issues/i));
    });

    it('--dry-run shows what would happen without saving', async () => {
        makeMockHttps(200, [sampleIssue]);
        (getBugs as any).mockResolvedValue([]);

        await handleGitHubPull(['--dry-run']);

        expect(saveBug).not.toHaveBeenCalled();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/[Dd]ry run/);
    });

    it('--auto creates a new local bug from an unlinked issue without prompting', async () => {
        makeMockHttps(200, [sampleIssue]);
        (getBugs as any).mockResolvedValue([]);

        await handleGitHubPull(['--auto']);

        expect(inquirer.prompt).not.toHaveBeenCalled();
        expect(saveBug).toHaveBeenCalledWith(
            expect.objectContaining({
                github_issue_number: sampleIssue.number,
                github_issue_url: sampleIssue.html_url,
            })
        );
    });

    it('updates an already-linked bug when remote has changed', async () => {
        // Issue updated_at is newer than bug last_synced
        const updatedIssue = {
            ...sampleIssue,
            title: 'Updated title',
            updated_at: '2024-02-01T00:00:00Z', // newer than last_synced '2024-01-01T12:00:00Z'
        };
        makeMockHttps(200, [updatedIssue]);
        (getBugs as any).mockResolvedValue([sampleBug]);

        await handleGitHubPull([]);

        expect(saveBug).toHaveBeenCalled();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/updated from GitHub/);
    });

    it('shows "no changes" for a linked bug that has not been updated', async () => {
        // Issue updated_at is OLDER than bug last_synced → no change
        const unchanged = { ...sampleIssue, updated_at: '2024-01-01T10:00:00Z' };
        makeMockHttps(200, [unchanged]);
        (getBugs as any).mockResolvedValue([sampleBug]);

        await handleGitHubPull([]);

        expect(saveBug).not.toHaveBeenCalled();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/no changes/);
    });

    it('prompts user when unlinked issues exist and --auto is not set', async () => {
        (inquirer.prompt as any).mockResolvedValue({ createAll: false });
        makeMockHttps(200, [sampleIssue]);
        (getBugs as any).mockResolvedValue([]); // no local bugs linked

        await handleGitHubPull([]);

        expect(inquirer.prompt).toHaveBeenCalled();
        // User said no → should not save
        expect(saveBug).not.toHaveBeenCalled();
    });

    it('creates bugs when user confirms the prompt', async () => {
        (inquirer.prompt as any).mockResolvedValue({ createAll: true });
        makeMockHttps(200, [sampleIssue]);
        (getBugs as any).mockResolvedValue([]);

        await handleGitHubPull([]);

        expect(saveBug).toHaveBeenCalledWith(
            expect.objectContaining({ github_issue_number: sampleIssue.number })
        );
    });
});

// ── handleGitHubSync ──────────────────────────────────────────────────────────

describe('handleGitHubSync', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (ensureProjectInit as any).mockReturnValue(true);
        (getUserConfig as any).mockReturnValue({ github: ghConfig });
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('prints error when project is not initialized', async () => {
        (ensureProjectInit as any).mockReturnValue(false);
        await handleGitHubSync([]);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not initialized/i));
    });

    it('shows message when no bugs are linked', async () => {
        (getBugs as any).mockResolvedValue([{ ...sampleBug, github_issue_number: undefined }]);
        await handleGitHubSync([]);
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No bugs are linked/i));
    });

    it('--dry-run does not call saveBug', async () => {
        (getBugs as any).mockResolvedValue([sampleBug]);
        // Queue: fetch issue, then fetch comments
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-02-01T00:00:00Z' } },
            { statusCode: 200, body: [] }, // comments
        ]);

        await handleGitHubSync(['--dry-run']);

        expect(saveBug).not.toHaveBeenCalled();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/[Dd]ry run/);
    });

    it('pulls remote changes when only remote has changed', async () => {
        const bug: Bug = {
            ...sampleBug,
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-01-01T11:00:00Z', // older than last_synced
        };
        (getBugs as any).mockResolvedValue([bug]);
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-02-01T00:00:00Z' } }, // newer
            { statusCode: 200, body: [] }, // comments
        ]);

        await handleGitHubSync([]);

        expect(saveBug).toHaveBeenCalled();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/pulled from/);
    });

    it('pushes local changes when only local has changed', async () => {
        const bug: Bug = {
            ...sampleBug,
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-02-01T00:00:00Z', // newer than last_synced
        };
        (getBugs as any).mockResolvedValue([bug]);
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-01-01T10:00:00Z' } }, // older than last_synced
            { statusCode: 200, body: [] }, // comments
        ]);

        await handleGitHubSync([]);

        expect(saveBug).toHaveBeenCalled();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/pushed to/);
    });

    it('detects conflicts when both sides have changed and applies remote-wins by default', async () => {
        const bug: Bug = {
            ...sampleBug,
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-02-01T00:00:00Z', // newer than last_synced
        };
        (getBugs as any).mockResolvedValue([bug]);
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-02-02T00:00:00Z' } }, // also newer
            { statusCode: 200, body: [] },
        ]);

        await handleGitHubSync([]);

        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/CONFLICT/);
        // remote-wins default: should pull (saveBug is called with updated local)
        expect(saveBug).toHaveBeenCalled();
        expect(output).toMatch(/Pulled remote/);
    });

    it('applies local-wins strategy on conflict when --local-wins flag is set', async () => {
        const bug: Bug = {
            ...sampleBug,
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-02-01T00:00:00Z',
        };
        (getBugs as any).mockResolvedValue([bug]);
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-02-02T00:00:00Z' } },
            { statusCode: 200, body: [] },
        ]);

        await handleGitHubSync(['--local-wins']);

        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/CONFLICT/);
        expect(output).toMatch(/Pushed local changes/);
    });

    it('imports new GitHub comments into the local bug', async () => {
        const bug: Bug = {
            ...sampleBug,
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-01-01T11:00:00Z',
            comments: [],
        };
        (getBugs as any).mockResolvedValue([bug]);
        const newComment = {
            body: 'Hello from GitHub',
            created_at: '2024-02-01T00:00:00Z', // after last_synced
            user: { login: 'octocat' },
        };
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-01-01T10:00:00Z' } }, // no change
            { statusCode: 200, body: [newComment] }, // new comment
        ]);

        await handleGitHubSync([]);

        expect(saveBug).toHaveBeenCalledWith(
            expect.objectContaining({
                comments: expect.arrayContaining([
                    expect.objectContaining({ text: 'Hello from GitHub', source: 'github', author: 'octocat' })
                ])
            })
        );
    });

    it('posts new local comments to GitHub', async () => {
        const newLocalComment = {
            text: 'Local note',
            timestamp: '2024-02-01T00:00:00Z', // after last_synced
            author: 'Alice',
        };
        const bug: Bug = {
            ...sampleBug,
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-01-01T11:00:00Z',
            comments: [newLocalComment],
        };
        (getBugs as any).mockResolvedValue([bug]);
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, updated_at: '2024-01-01T10:00:00Z' } },
            { statusCode: 200, body: [] }, // no GitHub comments
            { statusCode: 201, body: {} }, // post comment response
        ]);

        await handleGitHubSync([]);

        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/posted.*comment/);
    });

    it('auto-closes GitHub issue when linked bug is resolved', async () => {
        const resolvedBug: Bug = {
            ...sampleBug,
            status: 'Resolved',
            last_synced: '2024-01-01T12:00:00Z',
            last_modified: '2024-01-01T11:00:00Z',
        };
        (getBugs as any).mockResolvedValue([resolvedBug]);
        makeMockHttpsQueue([
            { statusCode: 200, body: { ...sampleIssue, state: 'open', updated_at: '2024-01-01T10:00:00Z' } },
            { statusCode: 200, body: {} }, // auto-close PATCH
            { statusCode: 200, body: [] }, // comments
        ]);

        await handleGitHubSync([]);

        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/auto-closed/);
    });
});
