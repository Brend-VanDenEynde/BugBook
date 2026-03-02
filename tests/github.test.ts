
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import https from 'https';
import { readFile } from 'fs/promises';
import {
    generateIssueBody,
    verifyGitHubToken,
    getGitHubConfig,
    detectGitHubRepo,
    createGitHubIssue,
    updateGitHubIssue,
    getGitHubIssues,
    closeGitHubIssue,
    reopenGitHubIssue
} from '../src/utils/github';
import { handleGitHubAuth, handleGitHubPush, handleGitHubStatus } from '../src/commands/github';
import { Bug } from '../src/utils/storage';

// ── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

vi.mock('https', () => ({
    default: { request: vi.fn() }
}));

vi.mock('fs/promises', () => ({
    default: { readFile: vi.fn() },
    readFile: vi.fn()
}));

vi.mock('../src/utils/config', () => ({
    getUserConfig: vi.fn(),
    setUserConfig: vi.fn(),
    resolveEditorCommand: vi.fn()
}));

vi.mock('../src/utils/storage', () => ({
    getBugs: vi.fn(),
    saveBug: vi.fn(),
    ensureProjectInit: vi.fn().mockReturnValue(true)
}));

vi.mock('inquirer', () => ({
    default: { prompt: vi.fn() }
}));

// ── Imports resolved after mocks ──────────────────────────────────────────────

import { getUserConfig, setUserConfig } from '../src/utils/config';
import { getBugs, saveBug, ensureProjectInit } from '../src/utils/storage';
import inquirer from 'inquirer';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Configure the https.request mock to respond with the given status code and body.
 * The response callback is called synchronously from req.end() to keep tests simple.
 */
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
 * Configure the https.request mock to emit an error event, simulating a network failure.
 */
function makeMockHttpsError(error: Error) {
    (https.request as any).mockImplementation((_opts: any, _callback: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn(() => {
            req.emit('error', error);
        });
        return req;
    });
}

/**
 * Configure https.request to respond 201 and capture the JSON written via req.write().
 * Returns an array that will be populated with the raw JSON string(s) after the call.
 */
function makeMockHttpsCapture(responseBody: any): string[] {
    const writeArgs: string[] = [];
    (https.request as any).mockImplementation((_opts: any, callback: any) => {
        const res = new EventEmitter() as any;
        res.statusCode = 201;
        const req = new EventEmitter() as any;
        req.write = vi.fn((data: string) => writeArgs.push(data));
        req.end = vi.fn(() => {
            callback(res);
            res.emit('data', JSON.stringify(responseBody));
            res.emit('end');
        });
        return req;
    });
    return writeArgs;
}

// ── Sample fixtures ───────────────────────────────────────────────────────────

const fullBug: Bug = {
    id: 'BUG-001',
    timestamp: '2024-01-15T10:00:00Z',
    category: 'Backend',
    error: 'Uncaught TypeError: Cannot read property of null',
    solution: 'Check for null before accessing property',
    files: ['src/api.ts', 'src/utils.ts'],
    status: 'Open',
    priority: 'High',
    author: 'Alice',
    dueDate: '2024-02-01'
};

const minimalBug: Bug = {
    id: 'BUG-002',
    timestamp: '2024-01-16T12:00:00Z',
    category: 'Frontend',
    error: 'Button click not working',
    solution: '',
    status: 'Open'
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GitHub Integration', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        (getUserConfig as any).mockReturnValue({});
    });

    // ── generateIssueBody ─────────────────────────────────────────────────────

    describe('generateIssueBody', () => {
        it('full bug includes all sections', () => {
            const body = generateIssueBody(fullBug);
            expect(body).toContain('## Error');
            expect(body).toContain(fullBug.error);
            expect(body).toContain('## Solution');
            expect(body).toContain(fullBug.solution!);
            expect(body).toContain('## Related Files');
            expect(body).toContain('`src/api.ts`');
            expect(body).toContain('`src/utils.ts`');
            expect(body).toContain('**Priority**: High');
            expect(body).toContain('**Author**: Alice');
            expect(body).toContain('**Due Date**: 2024-02-01');
        });

        it('minimal bug omits Solution and Related Files sections', () => {
            const body = generateIssueBody(minimalBug);
            expect(body).toContain('## Error');
            expect(body).not.toContain('## Solution');
            expect(body).not.toContain('## Related Files');
        });

        it('metadata section is always present', () => {
            const body = generateIssueBody(minimalBug);
            expect(body).toContain('## Metadata');
            expect(body).toContain(`**BugBook ID**: ${minimalBug.id}`);
            expect(body).toContain(`**Category**: ${minimalBug.category}`);
            expect(body).toContain(`**Created**: ${minimalBug.timestamp}`);
        });

        it('footer contains BugBook attribution link', () => {
            const body = generateIssueBody(minimalBug);
            expect(body).toContain('[BugBook]');
            expect(body).toContain('https://github.com/Brend-VanDenEynde/bugbook');
        });
    });

    // ── verifyGitHubToken ─────────────────────────────────────────────────────

    describe('verifyGitHubToken', () => {
        it('returns true when API responds 200', async () => {
            makeMockHttps(200, { login: 'testuser' });
            const result = await verifyGitHubToken('ghp_testtoken');
            expect(result).toBe(true);
        });

        it('returns false when API responds 401', async () => {
            makeMockHttps(401, { message: 'Bad credentials' });
            const result = await verifyGitHubToken('ghp_badtoken');
            expect(result).toBe(false);
        });

        it('returns false when https.request emits an error event', async () => {
            makeMockHttpsError(new Error('Network error'));
            const result = await verifyGitHubToken('ghp_testtoken');
            expect(result).toBe(false);
        });
    });

    // ── getGitHubConfig ───────────────────────────────────────────────────────

    describe('getGitHubConfig', () => {
        it('returns github sub-object when present in config', () => {
            (getUserConfig as any).mockReturnValue({
                github: { token: 'ghp_abc', owner: 'user', repo: 'repo' }
            });
            const config = getGitHubConfig();
            expect(config).toEqual({ token: 'ghp_abc', owner: 'user', repo: 'repo' });
        });

        it('returns empty object when config has no github key', () => {
            (getUserConfig as any).mockReturnValue({ user: { name: 'Test' } });
            const config = getGitHubConfig();
            expect(config).toEqual({});
        });
    });

    // ── detectGitHubRepo ──────────────────────────────────────────────────────

    describe('detectGitHubRepo', () => {
        it('parses HTTPS remote URL', async () => {
            (readFile as any).mockResolvedValue(
                '[remote "origin"]\n\turl = https://github.com/myowner/myrepo.git\n'
            );
            const result = await detectGitHubRepo();
            expect(result).toEqual({ owner: 'myowner', repo: 'myrepo' });
        });

        it('parses SSH remote URL', async () => {
            (readFile as any).mockResolvedValue(
                '[remote "origin"]\n\turl = git@github.com:myowner/sshrepo.git\n'
            );
            const result = await detectGitHubRepo();
            expect(result).toEqual({ owner: 'myowner', repo: 'sshrepo' });
        });

        it('strips .git suffix from repo name', async () => {
            (readFile as any).mockResolvedValue(
                'url = https://github.com/owner/project.git\n'
            );
            const result = await detectGitHubRepo();
            expect(result?.repo).toBe('project');
        });

        it('returns null when .git/config file is missing', async () => {
            (readFile as any).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
            const result = await detectGitHubRepo();
            expect(result).toBeNull();
        });

        it('returns null when URL is not a GitHub remote', async () => {
            (readFile as any).mockResolvedValue(
                '[remote "origin"]\n\turl = https://gitlab.com/owner/repo.git\n'
            );
            const result = await detectGitHubRepo();
            expect(result).toBeNull();
        });
    });

    // ── createGitHubIssue ─────────────────────────────────────────────────────

    describe('createGitHubIssue', () => {
        it('sends POST to /repos/owner/repo/issues and returns parsed issue', async () => {
            const fakeIssue = { number: 42, title: 'Test', html_url: 'https://github.com/issues/42' };
            (getUserConfig as any).mockReturnValue({ github: {} });
            makeMockHttps(201, fakeIssue);

            const issue = await createGitHubIssue(fullBug, 'owner', 'repo', 'ghp_token');

            expect(issue).toEqual(fakeIssue);
            expect(https.request as any).toHaveBeenCalledWith(
                expect.objectContaining({ path: '/repos/owner/repo/issues', method: 'POST' }),
                expect.any(Function)
            );
        });

        it('truncates title to 256 characters when error is long', async () => {
            (getUserConfig as any).mockReturnValue({ github: {} });
            const writeArgs = makeMockHttpsCapture({ number: 1, html_url: 'u' });
            const longBug: Bug = { ...minimalBug, error: 'E'.repeat(300) };

            await createGitHubIssue(longBug, 'owner', 'repo', 'ghp_token');

            const payload = JSON.parse(writeArgs[0]);
            expect(payload.title.length).toBe(256);
        });

        it('includes category and priority labels when auto_labels is not false', async () => {
            (getUserConfig as any).mockReturnValue({ github: {} });
            const writeArgs = makeMockHttpsCapture({ number: 5, html_url: 'u' });

            await createGitHubIssue(fullBug, 'owner', 'repo', 'token');

            const payload = JSON.parse(writeArgs[0]);
            expect(payload.labels).toContain('Backend');
            expect(payload.labels).toContain('priority:high');
        });

        it('sends empty labels array when auto_labels is false', async () => {
            (getUserConfig as any).mockReturnValue({ github: { auto_labels: false } });
            const writeArgs = makeMockHttpsCapture({ number: 2, html_url: 'u' });

            await createGitHubIssue(fullBug, 'owner', 'repo', 'token');

            const payload = JSON.parse(writeArgs[0]);
            expect(payload.labels).toEqual([]);
        });
    });

    // ── handleGitHubAuth ──────────────────────────────────────────────────────

    describe('handleGitHubAuth', () => {
        it('prints error and skips saving when token is invalid', async () => {
            makeMockHttps(401, { message: 'Bad credentials' });
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubAuth(['--token', 'ghp_badtoken']);

            expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Invalid GitHub token/));
            expect(setUserConfig).not.toHaveBeenCalled();

            errorSpy.mockRestore();
            logSpy.mockRestore();
        });

        it('saves token when it is valid', async () => {
            makeMockHttps(200, { login: 'user' });
            (readFile as any).mockRejectedValue(new Error('ENOENT'));
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubAuth(['--token', 'ghp_validtoken']);

            expect(setUserConfig).toHaveBeenCalledWith('github.token', 'ghp_validtoken');
            logSpy.mockRestore();
        });

        it('also saves owner and repo when detectGitHubRepo succeeds', async () => {
            makeMockHttps(200, { login: 'user' });
            (readFile as any).mockResolvedValue(
                'url = https://github.com/myowner/myrepo.git\n'
            );
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubAuth(['--token', 'ghp_validtoken']);

            expect(setUserConfig).toHaveBeenCalledWith('github.owner', 'myowner');
            expect(setUserConfig).toHaveBeenCalledWith('github.repo', 'myrepo');
            logSpy.mockRestore();
        });

        it('prints warning when repo cannot be detected', async () => {
            makeMockHttps(200, { login: 'user' });
            (readFile as any).mockRejectedValue(new Error('ENOENT'));
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubAuth(['--token', 'ghp_validtoken']);

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringMatching(/Could not detect GitHub repository/)
            );
            logSpy.mockRestore();
        });
    });

    // ── handleGitHubPush --dry-run ────────────────────────────────────────────

    describe('handleGitHubPush --dry-run', () => {
        beforeEach(() => {
            (getUserConfig as any).mockReturnValue({
                github: { token: 'ghp_token', owner: 'owner', repo: 'repo' }
            });
            (ensureProjectInit as any).mockReturnValue(true);
        });

        it('lists bugs without making any API calls', async () => {
            (getBugs as any).mockResolvedValue([fullBug]);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubPush(['--dry-run']);

            expect(https.request as any).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Dry run/));
            logSpy.mockRestore();
        });

        it('skips already-synced bugs unless --force is passed', async () => {
            const syncedBug: Bug = { ...fullBug, github_issue_number: 10 };
            (getBugs as any).mockResolvedValue([syncedBug]);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubPush(['--dry-run']);

            expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No bugs to push/));
            logSpy.mockRestore();
        });

        it('prints "No bugs to push." when all bugs are already synced', async () => {
            const syncedBug: Bug = { ...fullBug, github_issue_number: 10 };
            (getBugs as any).mockResolvedValue([syncedBug]);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubPush([]);

            expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No bugs to push/));
            logSpy.mockRestore();
        });

        it('filters to only the specified bug IDs when args are provided', async () => {
            const otherBug: Bug = { ...minimalBug, id: 'BUG-999' };
            (getBugs as any).mockResolvedValue([fullBug, otherBug]);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubPush(['--dry-run', 'BUG-001']);

            const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
            expect(output).toContain('BUG-001');
            expect(output).not.toContain('BUG-999');
            logSpy.mockRestore();
        });
    });

    // ── updateGitHubIssue ─────────────────────────────────────────────────────

    describe('updateGitHubIssue', () => {
        it('sends PATCH to correct endpoint', async () => {
            const fakeIssue = { number: 7, html_url: 'https://github.com/issues/7' };
            makeMockHttps(200, fakeIssue);
            (getUserConfig as any).mockReturnValue({});

            await updateGitHubIssue(7, fullBug, 'owner', 'repo', 'token');

            expect(https.request as any).toHaveBeenCalledWith(
                expect.objectContaining({ path: '/repos/owner/repo/issues/7', method: 'PATCH' }),
                expect.any(Function)
            );
        });

        it('sets state to "closed" for Resolved bugs', async () => {
            const resolvedBug: Bug = { ...fullBug, status: 'Resolved' };
            (getUserConfig as any).mockReturnValue({});
            const writeArgs = makeMockHttpsCapture({ number: 7, html_url: 'u' });

            await updateGitHubIssue(7, resolvedBug, 'owner', 'repo', 'token');

            const payload = JSON.parse(writeArgs[0]);
            expect(payload.state).toBe('closed');
        });

        it('sets state to "open" for Open bugs', async () => {
            (getUserConfig as any).mockReturnValue({});
            const writeArgs = makeMockHttpsCapture({ number: 7, html_url: 'u' });

            await updateGitHubIssue(7, fullBug, 'owner', 'repo', 'token');

            const payload = JSON.parse(writeArgs[0]);
            expect(payload.state).toBe('open');
        });
    });

    // ── getGitHubIssues ───────────────────────────────────────────────────────

    describe('getGitHubIssues', () => {
        it('sends GET to correct endpoint with default state "all"', async () => {
            makeMockHttps(200, []);

            await getGitHubIssues('owner', 'repo', 'token');

            expect(https.request as any).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: '/repos/owner/repo/issues?state=all&per_page=100&page=1',
                    method: 'GET'
                }),
                expect.any(Function)
            );
        });

        it('passes the provided state filter in the URL', async () => {
            makeMockHttps(200, []);

            await getGitHubIssues('owner', 'repo', 'token', 'open');

            expect(https.request as any).toHaveBeenCalledWith(
                expect.objectContaining({ path: '/repos/owner/repo/issues?state=open&per_page=100&page=1' }),
                expect.any(Function)
            );
        });

        it('returns the array of issues from the API response', async () => {
            const issues = [{ number: 1 }, { number: 2 }];
            makeMockHttps(200, issues);

            const result = await getGitHubIssues('owner', 'repo', 'token');
            expect(result).toEqual(issues);
        });
    });

    // ── closeGitHubIssue ──────────────────────────────────────────────────────

    describe('closeGitHubIssue', () => {
        it('sends PATCH with state "closed" to the correct endpoint', async () => {
            makeMockHttps(200, {});
            const writeArgs = makeMockHttpsCapture({});

            await closeGitHubIssue(99, 'owner', 'repo', 'token');

            expect(https.request as any).toHaveBeenCalledWith(
                expect.objectContaining({ path: '/repos/owner/repo/issues/99', method: 'PATCH' }),
                expect.any(Function)
            );
            const payload = JSON.parse(writeArgs[0]);
            expect(payload.state).toBe('closed');
        });
    });

    // ── reopenGitHubIssue ─────────────────────────────────────────────────────

    describe('reopenGitHubIssue', () => {
        it('sends PATCH with state "open" to the correct endpoint', async () => {
            const writeArgs = makeMockHttpsCapture({});

            await reopenGitHubIssue(99, 'owner', 'repo', 'token');

            expect(https.request as any).toHaveBeenCalledWith(
                expect.objectContaining({ path: '/repos/owner/repo/issues/99', method: 'PATCH' }),
                expect.any(Function)
            );
            const payload = JSON.parse(writeArgs[0]);
            expect(payload.state).toBe('open');
        });
    });

    // ── handleGitHubPush (push) ───────────────────────────────────────────────

    describe('handleGitHubPush (push)', () => {
        beforeEach(() => {
            (getUserConfig as any).mockReturnValue({
                github: { token: 'ghp_token', owner: 'owner', repo: 'repo' }
            });
            (ensureProjectInit as any).mockReturnValue(true);
        });

        it('sets github_issue_closed to false after creating an issue', async () => {
            (getBugs as any).mockResolvedValue([{ ...fullBug }]);
            (inquirer.prompt as any).mockResolvedValue({ confirm: true });
            makeMockHttps(201, {
                number: 5,
                html_url: 'https://github.com/owner/repo/issues/5',
                title: fullBug.error,
                body: '',
                state: 'open',
                labels: [],
                created_at: '',
                updated_at: ''
            });
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await handleGitHubPush([]);

            expect(saveBug).toHaveBeenCalledWith(
                expect.objectContaining({ github_issue_closed: false })
            );

            logSpy.mockRestore();
            errorSpy.mockRestore();
        });
    });

    // ── handleGitHubStatus ────────────────────────────────────────────────────

    describe('handleGitHubStatus', () => {
        beforeEach(() => {
            (ensureProjectInit as any).mockReturnValue(true);
            (getBugs as any).mockResolvedValue([]);
            (readFile as any).mockRejectedValue(new Error('ENOENT'));
        });

        it('prints error when project is not initialized', async () => {
            (ensureProjectInit as any).mockReturnValue(false);
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubStatus();

            expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/not initialized/));
            errorSpy.mockRestore();
            logSpy.mockRestore();
        });

        it('shows unauthenticated when no token is configured', async () => {
            (getUserConfig as any).mockReturnValue({ github: {} });
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubStatus();

            const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
            expect(output).toContain('Authenticated: No');
            logSpy.mockRestore();
        });

        it('shows authenticated when token is valid', async () => {
            (getUserConfig as any).mockReturnValue({ github: { token: 'ghp_valid', owner: 'o', repo: 'r' } });
            makeMockHttps(200, { login: 'user' });
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubStatus();

            const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
            expect(output).toContain('Authenticated: Yes');
            logSpy.mockRestore();
        });

        it('shows repository when owner and repo are configured', async () => {
            (getUserConfig as any).mockReturnValue({ github: { token: 'ghp_valid', owner: 'myowner', repo: 'myrepo' } });
            makeMockHttps(200, { login: 'user' });
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubStatus();

            const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
            expect(output).toContain('myowner/myrepo');
            logSpy.mockRestore();
        });

        it('shows pending sync count from bug statistics', async () => {
            (getUserConfig as any).mockReturnValue({ github: { token: 'ghp_valid', owner: 'o', repo: 'r' } });
            makeMockHttps(200, { login: 'user' });
            const openBug: Bug = { ...minimalBug, status: 'Open' };
            const syncedBug: Bug = { ...fullBug, status: 'Open', github_issue_number: 5 };
            (getBugs as any).mockResolvedValue([openBug, syncedBug]);
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await handleGitHubStatus();

            const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
            expect(output).toContain('Pending sync: 1');
            logSpy.mockRestore();
        });
    });
});
