
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    addBug,
    getBugs,
    getTags,
    addTag,
    sanitizeInput,
    sanitizeTagName,
    generateId,
    getBugById,
    addComment,
    getOverdueBugs,
    deleteBug,
    Bug,
    getBugsDirPath,
    getTagsPath,
    MAX_INPUT_LENGTH
} from '../src/utils/storage';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Mock fs/promises and fs
vi.mock('fs/promises');
vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        ...actual,
        existsSync: vi.fn(),
        promises: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            rename: vi.fn(),
            readdir: vi.fn(),
            unlink: vi.fn(),
            mkdir: vi.fn(),
        }
    };
});

// Mock config
vi.mock('../src/utils/config', () => ({
    getUserConfig: vi.fn(() => ({ user: { name: 'Test User' } }))
}));

describe('Storage Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default exist check to false
        (existsSync as any).mockReturnValue(false);
    });

    it('should sanitize input correctly', () => {
        const simple = '  test  ';
        expect(sanitizeInput(simple)).toBe('test');
    });

    it('should add a bug to storage as individual file', async () => {
        (existsSync as any).mockReturnValue(true);

        const newBug: Bug = {
            id: '123',
            timestamp: 'Now',
            category: 'General',
            error: 'Test Error',
            solution: 'Test Solution',
            status: 'Open',
            priority: 'High',
            files: ['src/test.ts']
        };

        await addBug(newBug);

        const tmpPath = path.join(getBugsDirPath(), 'BUG-123.json.tmp');
        const finalPath = path.join(getBugsDirPath(), 'BUG-123.json');

        // saveBug() writes to a .tmp file first, then renames atomically
        expect(fs.writeFile).toHaveBeenCalledWith(
            tmpPath,
            expect.stringContaining('"id": "123"'),
            expect.objectContaining({ mode: 0o600 })
        );

        // Verify author injection from mock config
        expect(fs.writeFile).toHaveBeenCalledWith(
            tmpPath,
            expect.stringContaining('"author": "Test User"'),
            expect.objectContaining({ mode: 0o600 })
        );

        // Verify atomic rename
        expect(fs.rename).toHaveBeenCalledWith(tmpPath, finalPath);
    });

    it('should retrieve bugs from individual files', async () => {
        // Mock readdir to return file list
        (fs.readdir as any).mockResolvedValue(['BUG-1.json', 'BUG-2.json', 'other.txt']);

        // Mock readFile to return content for files
        (fs.readFile as any).mockImplementation(async (filePath: string) => {
            const strPath = String(filePath);
            if (strPath.endsWith('BUG-1.json')) return JSON.stringify({ id: '1', error: 'Error 1' });
            if (strPath.endsWith('BUG-2.json')) return JSON.stringify({ id: '2', error: 'Error 2' });
            return '[]'; // Default empty array for legacy files to avoid parse errors
        });

        // Mock existsSync to only return true for the bugs directory, NOT legacy files
        (existsSync as any).mockImplementation((filePath: string) => {
            const strPath = String(filePath);
            if (strPath.includes('bugs')) return true; // Directory and bug files exist
            return false; // Legacy files do not exist
        });

        const bugs = await getBugs();
        expect(bugs).toHaveLength(2);
        expect(bugs.find(b => b.id === '1')).toBeDefined();
        expect(bugs.find(b => b.id === '2')).toBeDefined();
    });

    it('should return empty array if bugs directory does not exist', async () => {
        (existsSync as any).mockReturnValue(false);
        const bugs = await getBugs();
        expect(bugs).toEqual([]);
    });

    it('should delete a bug file', async () => {
        (existsSync as any).mockReturnValue(true);
        const bugId = '123';
        await deleteBug(bugId);

        const expectedPath = path.join(getBugsDirPath(), 'BUG-123.json');
        expect(fs.unlink).toHaveBeenCalledWith(expectedPath);
    });

    it('should add a new tag', async () => {
        (fs.readFile as any).mockResolvedValue('["General"]');
        (existsSync as any).mockReturnValue(true);

        const result = await addTag('Frontend');

        expect(result.success).toBe(true);
        expect(fs.writeFile).toHaveBeenCalledWith(
            getTagsPath(),
            expect.stringContaining('"Frontend"'),
            expect.objectContaining({ mode: 0o600 })
        );
    });

    describe('sanitizeTagName', () => {
        it('should strip special characters', () => {
            expect(sanitizeTagName('hello@world!')).toBe('helloworld');
        });

        it('should preserve valid characters (letters, numbers, hyphens, underscores, spaces)', () => {
            expect(sanitizeTagName('my-tag_1 name')).toBe('my-tag_1 name');
        });

        it('should trim whitespace', () => {
            expect(sanitizeTagName('  padded  ')).toBe('padded');
        });

        it('should return empty string for all-special-char input', () => {
            expect(sanitizeTagName('@#$%^')).toBe('');
        });
    });

    describe('sanitizeInput', () => {
        it('should truncate strings longer than MAX_INPUT_LENGTH', () => {
            const longString = 'a'.repeat(MAX_INPUT_LENGTH + 100);
            const result = sanitizeInput(longString);
            expect(result.length).toBe(MAX_INPUT_LENGTH);
        });

        it('should pass through short strings unchanged (after trim)', () => {
            expect(sanitizeInput('  short string  ')).toBe('short string');
        });
    });

    describe('generateId', () => {
        it('should return an 8-character uppercase hex string', () => {
            const id = generateId();
            expect(id).toMatch(/^[A-F0-9]{8}$/);
        });

        it('should generate unique values on successive calls', () => {
            const id1 = generateId();
            const id2 = generateId();
            expect(id1).not.toBe(id2);
        });
    });

    describe('getBugById', () => {
        it('should return bug for a valid ID', async () => {
            const mockBug: Bug = {
                id: 'AABB1122',
                timestamp: '2023-01-01',
                category: 'General',
                error: 'Test',
                solution: 'Fix',
                status: 'Open'
            };

            (existsSync as any).mockImplementation((filePath: string) => {
                const strPath = String(filePath);
                if (strPath.includes('bugs')) return true;
                return false;
            });
            (fs.readFile as any).mockResolvedValue(JSON.stringify(mockBug));

            const result = await getBugById('AABB1122');
            expect(result).not.toBeNull();
            expect(result!.id).toBe('AABB1122');
        });

        it('should return null for a missing ID', async () => {
            (existsSync as any).mockImplementation((filePath: string) => {
                const strPath = String(filePath);
                if (strPath.endsWith('.json')) return false;
                if (strPath.includes('bugs')) return true;
                return false;
            });

            const result = await getBugById('DEADBEEF');
            expect(result).toBeNull();
        });
    });

    describe('addComment', () => {
        it('should return failure for non-existent bug', async () => {
            (existsSync as any).mockImplementation((filePath: string) => {
                const strPath = String(filePath);
                if (strPath.endsWith('.json')) return false;
                if (strPath.includes('bugs')) return true;
                return false;
            });

            const result = await addComment('NONEXIST', 'hello');
            expect(result.success).toBe(false);
            expect(result.message).toContain('not found');
        });
    });

    describe('getOverdueBugs', () => {
        it('should filter only open bugs that are past due', () => {
            const bugs: Bug[] = [
                { id: '1', timestamp: '', category: '', error: '', solution: '', status: 'Open', dueDate: '2020-01-01' },
                { id: '2', timestamp: '', category: '', error: '', solution: '', status: 'Resolved', dueDate: '2020-01-01' },
                { id: '3', timestamp: '', category: '', error: '', solution: '', status: 'Open', dueDate: '2099-12-31' },
                { id: '4', timestamp: '', category: '', error: '', solution: '', status: 'Open' },
            ];
            const overdue = getOverdueBugs(bugs);
            expect(overdue).toHaveLength(1);
            expect(overdue[0].id).toBe('1');
        });
    });

    describe('getBugs (corrupt file)', () => {
        it('should skip corrupt JSON files and return partial results', async () => {
            (fs.readdir as any).mockResolvedValue(['BUG-GOOD.json', 'BUG-BAD.json']);
            (fs.readFile as any).mockImplementation(async (filePath: string) => {
                const strPath = String(filePath);
                if (strPath.endsWith('BUG-GOOD.json')) return JSON.stringify({ id: 'GOOD', error: 'OK' });
                if (strPath.endsWith('BUG-BAD.json')) return '{corrupt json!!!';
                return '[]';
            });
            (existsSync as any).mockImplementation((filePath: string) => {
                const strPath = String(filePath);
                if (strPath.includes('bugs')) return true;
                return false;
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const bugs = await getBugs();
            expect(bugs).toHaveLength(1);
            expect(bugs[0].id).toBe('GOOD');
            consoleSpy.mockRestore();
        });
    });

    describe('addTag (duplicate)', () => {
        it('should reject an already-existing tag', async () => {
            (fs.readFile as any).mockResolvedValue('["General", "Frontend"]');
            (existsSync as any).mockReturnValue(true);

            const result = await addTag('Frontend');
            expect(result.success).toBe(false);
            expect(result.message).toContain('already exists');
        });
    });
});
