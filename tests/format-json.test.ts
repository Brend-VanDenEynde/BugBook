
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleList } from '../src/commands/list';
import { handleSearch } from '../src/commands/search';
import { handleStats } from '../src/commands/stats';
import { Bug } from '../src/utils/storage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/utils/storage', () => ({
    getBugs: vi.fn(),
    displayBugs: vi.fn(),
    getOverdueBugs: vi.fn().mockReturnValue([]),
    ensureProjectInit: vi.fn().mockReturnValue(true),
    DEFAULT_LIST_COUNT: 5,
}));

vi.mock('inquirer', () => ({
    default: { prompt: vi.fn() }
}));

import { getBugs, getOverdueBugs, ensureProjectInit } from '../src/utils/storage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeBug = (overrides: Partial<Bug> = {}): Bug => ({
    id: 'AAAABBBB',
    timestamp: '2024-01-01T00:00:00Z',
    category: 'Backend',
    error: 'Test error',
    solution: '',
    status: 'Open',
    priority: 'High',
    ...overrides,
});

const sampleBugs: Bug[] = [
    makeBug({ id: 'AAA00001', status: 'Open',     priority: 'High',   category: 'Backend'  }),
    makeBug({ id: 'BBB00002', status: 'Resolved', priority: 'Low',    category: 'Frontend' }),
    makeBug({ id: 'CCC00003', status: 'Open',     priority: 'Medium', category: 'Backend'  }),
];

// ── --format json: list ───────────────────────────────────────────────────────

describe('handleList --format json', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (getOverdueBugs as any).mockReturnValue([]);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => logSpy.mockRestore());

    it('outputs valid JSON array when bugs exist', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleList('--format json');

        // Should have been called once with a JSON string
        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('['));
        expect(jsonCall).toBeDefined();
        const parsed = JSON.parse(jsonCall!);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
    });

    it('outputs [] when no bugs exist', async () => {
        (getBugs as any).mockResolvedValue([]);
        await handleList('--format json');
        expect(logSpy).toHaveBeenCalledWith('[]');
    });

    it('outputs [] when filters produce no matches', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleList('--priority Low --status Open --format json');
        expect(logSpy).toHaveBeenCalledWith('[]');
    });

    it('JSON output respects --status filter', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleList('--status Open --format json');

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('['));
        const parsed: Bug[] = JSON.parse(jsonCall!);
        expect(parsed.every(b => b.status === 'Open')).toBe(true);
    });

    it('does not produce chalk-formatted output when --format json is set', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleList('--format json');

        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        // Chalk headers like "Showing last N entry(s):" should not appear
        expect(output).not.toMatch(/Showing last/);
        expect(output).not.toMatch(/Filters:/);
    });

    it('JSON output works together with --priority filter', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleList('--priority High --format json');

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('['));
        const parsed: Bug[] = JSON.parse(jsonCall!);
        expect(parsed.every(b => b.priority === 'High')).toBe(true);
    });
});

// ── --format json: search ─────────────────────────────────────────────────────

describe('handleSearch --format json', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (ensureProjectInit as any).mockReturnValue(true);
        (getBugs as any).mockResolvedValue(sampleBugs);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => logSpy.mockRestore());

    it('outputs a JSON array for a matching query', async () => {
        await handleSearch('Backend --format json');
        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('['));
        expect(jsonCall).toBeDefined();
        const parsed = JSON.parse(jsonCall!);
        expect(Array.isArray(parsed)).toBe(true);
    });

    it('outputs [] when query is empty in json mode (no interactive prompt)', async () => {
        await handleSearch('--format json');
        expect(logSpy).toHaveBeenCalledWith('[]');
    });

    it('does not call inquirer when --format json and empty query', async () => {
        const inquirer = await import('inquirer');
        await handleSearch('--format json');
        expect((inquirer.default.prompt as any)).not.toHaveBeenCalled();
    });

    it('strips --format json from the search query', async () => {
        // "Test --format json" should search for "Test", not "Test --format json"
        (getBugs as any).mockResolvedValue([makeBug({ error: 'Test error' })]);
        await handleSearch('Test --format json');
        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('['));
        expect(jsonCall).toBeDefined();
        // Should be valid JSON
        expect(() => JSON.parse(jsonCall!)).not.toThrow();
    });

    it('does not produce chalk output when --format json is set', async () => {
        await handleSearch('Backend --format json');
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).not.toMatch(/Found \d+ match/);
    });
});

// ── --format json: stats ──────────────────────────────────────────────────────

describe('handleStats --format json', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (ensureProjectInit as any).mockReturnValue(true);
        (getOverdueBugs as any).mockReturnValue([]);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => logSpy.mockRestore());

    it('outputs a JSON object with required keys', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleStats('--format json');

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('{'));
        expect(jsonCall).toBeDefined();
        const parsed = JSON.parse(jsonCall!);
        expect(parsed).toHaveProperty('total');
        expect(parsed).toHaveProperty('open');
        expect(parsed).toHaveProperty('resolved');
        expect(parsed).toHaveProperty('overdue');
        expect(parsed).toHaveProperty('byPriority');
        expect(parsed).toHaveProperty('byCategory');
    });

    it('computes correct counts in the JSON output', async () => {
        const bugs = [
            makeBug({ id: '1', status: 'Open' }),
            makeBug({ id: '2', status: 'Open' }),
            makeBug({ id: '3', status: 'Resolved' }),
        ];
        (getBugs as any).mockResolvedValue(bugs);
        await handleStats('--format json');

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('{'));
        const parsed = JSON.parse(jsonCall!);
        expect(parsed.total).toBe(3);
        expect(parsed.open).toBe(2);
        expect(parsed.resolved).toBe(1);
    });

    it('outputs zero-stats JSON when no bugs exist', async () => {
        (getBugs as any).mockResolvedValue([]);
        await handleStats('--format json');

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('{'));
        expect(jsonCall).toBeDefined();
        const parsed = JSON.parse(jsonCall!);
        expect(parsed.total).toBe(0);
    });

    it('byCategory reflects actual bug categories', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleStats('--format json');

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        const jsonCall = calls.find(s => s.startsWith('{'));
        const parsed = JSON.parse(jsonCall!);
        expect(parsed.byCategory['Backend']).toBe(2);
        expect(parsed.byCategory['Frontend']).toBe(1);
    });

    it('does not print chalk-formatted output when --format json is set', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        await handleStats('--format json');
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).not.toMatch(/Bugbook Statistics/);
    });

    it('existing calls without argStr still work (backward compat)', async () => {
        (getBugs as any).mockResolvedValue(sampleBugs);
        // Call with no argument — should not throw and should print normal output
        await handleStats();
        const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(output).toMatch(/Bugbook Statistics/);
    });
});
