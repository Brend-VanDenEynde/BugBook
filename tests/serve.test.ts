import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import http from 'http';
import { startServer } from '../src/commands/serve';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_BUG = {
    id: 'AABB1122',
    timestamp: '2024-01-15T10:00:00.000Z',
    category: 'General',
    error: 'TypeError: Cannot read property of null',
    solution: 'Add null check',
    status: 'Open',
    priority: 'High',
    comments: [],
};

// ---------------------------------------------------------------------------
// Mock storage — vi.hoisted() ensures the object exists before vi.mock hoists
// the factory to the top of the file.
// ---------------------------------------------------------------------------

const mockStorage = vi.hoisted(() => ({
    getBugs: vi.fn(),
    getBugById: vi.fn(),
    saveBug: vi.fn(),
    deleteBug: vi.fn(),
    addBug: vi.fn(),
    getTags: vi.fn(),
    generateId: vi.fn(() => 'CCDD3344'),
    sanitizeInput: (s: string) => (typeof s === 'string' ? s.trim() : ''),
    ensureProjectInit: vi.fn(() => true),
}));

vi.mock('../src/utils/storage', () => mockStorage);

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: http.Server;
let base: string;

beforeAll(async () => {
    server = await startServer(0, false); // port 0 → OS picks a free port
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
    await new Promise<void>((res) => server.close(() => res()));
});

beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getBugs.mockResolvedValue([{ ...MOCK_BUG }]);
    mockStorage.getBugById.mockImplementation(async (id: string) =>
        id === 'AABB1122' ? { ...MOCK_BUG } : null
    );
    mockStorage.saveBug.mockResolvedValue(undefined);
    mockStorage.deleteBug.mockResolvedValue(undefined);
    mockStorage.addBug.mockResolvedValue(undefined);
    mockStorage.getTags.mockResolvedValue(['General', 'Frontend', 'Backend']);
    mockStorage.generateId.mockReturnValue('CCDD3344');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function req(method: string, path: string, body?: unknown) {
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, opts);
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
}

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('GET /', () => {
    it('serves the HTML frontend', async () => {
        const res = await fetch(`${base}/`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const html = await res.text();
        expect(html).toContain('Bugbook');
    });
});

// ---------------------------------------------------------------------------
// GET /api/bugs
// ---------------------------------------------------------------------------

describe('GET /api/bugs', () => {
    it('returns the bug list as JSON', async () => {
        const { status, body } = await req('GET', '/api/bugs');
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe('AABB1122');
    });

    it('returns an empty array when there are no bugs', async () => {
        mockStorage.getBugs.mockResolvedValue([]);
        const { status, body } = await req('GET', '/api/bugs');
        expect(status).toBe(200);
        expect(body).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// GET /api/tags
// ---------------------------------------------------------------------------

describe('GET /api/tags', () => {
    it('returns the tag list', async () => {
        const { status, body } = await req('GET', '/api/tags');
        expect(status).toBe(200);
        expect(body).toEqual(['General', 'Frontend', 'Backend']);
    });
});

// ---------------------------------------------------------------------------
// GET /api/stats
// ---------------------------------------------------------------------------

describe('GET /api/stats', () => {
    it('returns correct counts', async () => {
        const { status, body } = await req('GET', '/api/stats');
        expect(status).toBe(200);
        expect(body.total).toBe(1);
        expect(body.open).toBe(1);
        expect(body.resolved).toBe(0);
        expect(body.overdue).toBe(0);
    });

    it('counts overdue open bugs correctly', async () => {
        mockStorage.getBugs.mockResolvedValue([
            { ...MOCK_BUG, status: 'Open', dueDate: '2020-01-01' },
        ]);
        const { body } = await req('GET', '/api/stats');
        expect(body.overdue).toBe(1);
    });

    it('does not count resolved bugs as overdue', async () => {
        mockStorage.getBugs.mockResolvedValue([
            { ...MOCK_BUG, status: 'Resolved', dueDate: '2020-01-01' },
        ]);
        const { body } = await req('GET', '/api/stats');
        expect(body.overdue).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// GET /api/bugs/:id
// ---------------------------------------------------------------------------

describe('GET /api/bugs/:id', () => {
    it('returns a bug by ID', async () => {
        const { status, body } = await req('GET', '/api/bugs/AABB1122');
        expect(status).toBe(200);
        expect(body.id).toBe('AABB1122');
    });

    it('returns 404 for a missing bug', async () => {
        const { status, body } = await req('GET', '/api/bugs/DEADBEEF');
        expect(status).toBe(404);
        expect(body.error).toMatch(/not found/i);
    });

    it('returns 404 for an invalid ID format', async () => {
        const { status } = await req('GET', '/api/bugs/not-a-valid-id');
        expect(status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// POST /api/bugs — create
// ---------------------------------------------------------------------------

describe('POST /api/bugs', () => {
    it('creates a bug and returns 201', async () => {
        const { status, body } = await req('POST', '/api/bugs', {
            error: 'New bug error',
            solution: 'Fix it',
            category: 'Frontend',
            priority: 'Low',
        });
        expect(status).toBe(201);
        expect(body.id).toBe('CCDD3344');
        expect(body.error).toBe('New bug error');
        expect(mockStorage.addBug).toHaveBeenCalledOnce();
    });

    it('returns 400 when error field is missing', async () => {
        const { status, body } = await req('POST', '/api/bugs', { solution: 'only solution' });
        expect(status).toBe(400);
        expect(body.error).toMatch(/error field is required/i);
    });

    it('returns 400 for invalid JSON body', async () => {
        const res = await fetch(`${base}/api/bugs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{broken json',
        });
        expect(res.status).toBe(400);
    });

    it('rejects a body over 100 KB', async () => {
        // The server calls req.destroy() when the body exceeds the limit.
        // That closes the socket before it can send a response, so fetch may
        // throw a SocketError instead of returning a 400. Both outcomes
        // prove the server is enforcing the limit.
        const bigPayload = JSON.stringify({ error: 'x'.repeat(110 * 1024) });
        let status: number | null = null;
        try {
            const res = await fetch(`${base}/api/bugs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: bigPayload,
            });
            status = res.status;
        } catch {
            status = null; // socket closed by server — limit enforced
        }
        expect(status === null || status === 400).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// PUT /api/bugs/:id — update
// ---------------------------------------------------------------------------

describe('PUT /api/bugs/:id', () => {
    it('updates a bug and returns it', async () => {
        const updated = { ...MOCK_BUG, solution: 'Better fix' };
        mockStorage.saveBug.mockResolvedValue(undefined);
        mockStorage.getBugById.mockResolvedValue({ ...MOCK_BUG });

        const { status, body } = await req('PUT', '/api/bugs/AABB1122', {
            solution: 'Better fix',
        });
        expect(status).toBe(200);
        expect(mockStorage.saveBug).toHaveBeenCalledOnce();
    });

    it('returns 404 for a missing bug', async () => {
        const { status } = await req('PUT', '/api/bugs/DEADBEEF', { solution: 'x' });
        expect(status).toBe(404);
    });

    it('ignores invalid priority values', async () => {
        mockStorage.getBugById.mockResolvedValue({ ...MOCK_BUG });
        const { status } = await req('PUT', '/api/bugs/AABB1122', { priority: 'Critical' });
        expect(status).toBe(200);
        // saveBug should still be called — invalid priority is silently dropped
        expect(mockStorage.saveBug).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// DELETE /api/bugs/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/bugs/:id', () => {
    it('deletes a bug and returns { ok: true }', async () => {
        const { status, body } = await req('DELETE', '/api/bugs/AABB1122');
        expect(status).toBe(200);
        expect(body.ok).toBe(true);
        expect(mockStorage.deleteBug).toHaveBeenCalledWith('AABB1122');
    });

    it('returns 404 for a missing bug', async () => {
        const { status } = await req('DELETE', '/api/bugs/DEADBEEF');
        expect(status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// POST /api/bugs/:id/resolve — toggle
// ---------------------------------------------------------------------------

describe('POST /api/bugs/:id/resolve', () => {
    it('toggles an open bug to resolved', async () => {
        mockStorage.getBugById.mockResolvedValue({ ...MOCK_BUG, status: 'Open' });
        const { status, body } = await req('POST', '/api/bugs/AABB1122/resolve');
        expect(status).toBe(200);
        expect(body.status).toBe('Resolved');
        expect(mockStorage.saveBug).toHaveBeenCalledOnce();
    });

    it('toggles a resolved bug back to open', async () => {
        mockStorage.getBugById.mockResolvedValue({ ...MOCK_BUG, status: 'Resolved' });
        const { status, body } = await req('POST', '/api/bugs/AABB1122/resolve');
        expect(status).toBe(200);
        expect(body.status).toBe('Open');
    });

    it('returns 404 for a missing bug', async () => {
        const { status } = await req('POST', '/api/bugs/DEADBEEF/resolve');
        expect(status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// POST /api/bugs/:id/comments
// ---------------------------------------------------------------------------

describe('POST /api/bugs/:id/comments', () => {
    it('adds a comment to an existing bug', async () => {
        mockStorage.getBugById.mockResolvedValue({ ...MOCK_BUG, comments: [] });
        const { status, body } = await req('POST', '/api/bugs/AABB1122/comments', {
            text: 'This is a test comment',
        });
        expect(status).toBe(200);
        expect(mockStorage.saveBug).toHaveBeenCalledOnce();
        const savedBug = mockStorage.saveBug.mock.calls[0][0];
        expect(savedBug.comments).toHaveLength(1);
        expect(savedBug.comments[0].text).toBe('This is a test comment');
    });

    it('returns 400 when text is missing', async () => {
        mockStorage.getBugById.mockResolvedValue({ ...MOCK_BUG, comments: [] });
        const { status, body } = await req('POST', '/api/bugs/AABB1122/comments', {});
        expect(status).toBe(400);
        expect(body.error).toMatch(/text is required/i);
    });

    it('returns 404 for a missing bug', async () => {
        const { status } = await req('POST', '/api/bugs/DEADBEEF/comments', { text: 'hi' });
        expect(status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// Unknown routes
// ---------------------------------------------------------------------------

describe('Unknown routes', () => {
    it('returns 404 for an unrecognised path', async () => {
        const { status } = await req('GET', '/api/unknown');
        expect(status).toBe(404);
    });

    it('returns 404 for an unrecognised method on a known path', async () => {
        const { status } = await req('PATCH', '/api/tags');
        expect(status).toBe(404);
    });
});
