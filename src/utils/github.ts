import https from 'https';
import { getUserConfig } from './config';
import { Bug } from './storage';

export interface GitHubConfig {
    token?: string;
    owner?: string;
    repo?: string;
    auto_labels?: boolean;
    label_prefix?: string;
}

export interface GitHubIssue {
    number: number;
    title: string;
    body: string;
    html_url: string;
    state: 'open' | 'closed';
    labels: Array<{ name: string }>;
    created_at: string;
    updated_at: string;
}

export interface GitHubComment {
    body: string;
    created_at: string;
    user: { login: string };
}

/**
 * Make an authenticated request to GitHub API
 */
const githubRequest = (
    method: string,
    path: string,
    token: string,
    data?: any
): Promise<any> => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path,
            method,
            headers: {
                'User-Agent': 'BugBook-CLI',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    if (!body) { resolve({}); return; }
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        reject(new Error(`Failed to parse GitHub API response (status ${res.statusCode})`));
                    }
                } else if (
                    res.statusCode === 429 ||
                    (res.statusCode === 403 && body.toLowerCase().includes('rate limit'))
                ) {
                    const resetHeader = res.headers['x-ratelimit-reset'];
                    const resetTime = resetHeader
                        ? new Date(Number(resetHeader) * 1000).toLocaleTimeString()
                        : 'unknown';
                    reject(new Error(
                        `GitHub API rate limit exceeded. Resets at ${resetTime}. ` +
                        `Use --dry-run to preview without hitting the API.`
                    ));
                } else {
                    reject(new Error(`GitHub API error: ${res.statusCode} - ${body}`));
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
};

/**
 * Verify GitHub token is valid
 */
export const verifyGitHubToken = async (token: string): Promise<boolean> => {
    try {
        await githubRequest('GET', '/user', token);
        return true;
    } catch {
        return false;
    }
};

/**
 * Get GitHub config from user config
 */
export const getGitHubConfig = (): GitHubConfig => {
    const config = getUserConfig();
    return (config as any).github || {};
};

/**
 * Detect GitHub repository from .git/config
 */
export const detectGitHubRepo = async (): Promise<{ owner: string; repo: string } | null> => {
    try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const gitConfigPath = path.join(process.cwd(), '.git', 'config');

        const content = await fs.readFile(gitConfigPath, 'utf-8');

        // Match GitHub URLs in remote.origin.url
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git
        const httpsMatch = content.match(/url\s*=\s*https:\/\/github\.com\/([^\/]+)\/([^\/\n]+)/);
        const sshMatch = content.match(/url\s*=\s*git@github\.com:([^\/]+)\/([^\/\n]+)/);

        const match = httpsMatch || sshMatch;
        if (match) {
            const owner = match[1];
            const repo = match[2].replace(/\.git$/, '');
            return { owner, repo };
        }

        return null;
    } catch {
        return null;
    }
};

/**
 * Generate GitHub issue body from bug
 */
export const generateIssueBody = (bug: Bug): string => {
    let body = `## Error\n${bug.error}\n\n`;

    if (bug.solution) {
        body += `## Solution\n${bug.solution}\n\n`;
    }

    if (bug.files && bug.files.length > 0) {
        body += `## Related Files\n`;
        bug.files.forEach(f => body += `- \`${f}\`\n`);
        body += '\n';
    }

    body += `## Metadata\n`;
    body += `- **BugBook ID**: ${bug.id}\n`;
    body += `- **Category**: ${bug.category}\n`;
    if (bug.priority) body += `- **Priority**: ${bug.priority}\n`;
    if (bug.author) body += `- **Author**: ${bug.author}\n`;
    if (bug.dueDate) body += `- **Due Date**: ${bug.dueDate}\n`;
    body += `- **Created**: ${bug.timestamp}\n`;

    body += '\n---\n';
    body += '*Created from [BugBook](https://github.com/Brend-VanDenEynde/bugbook)*';

    return body;
};

/**
 * Create a GitHub issue from a bug
 */
export const createGitHubIssue = async (
    bug: Bug,
    owner: string,
    repo: string,
    token: string
): Promise<GitHubIssue> => {
    const config = getGitHubConfig();
    const labelPrefix = config.label_prefix || 'bug:';

    const labels: string[] = [];

    // Add category label
    if (bug.category) {
        labels.push(bug.category);
    }

    // Add priority label
    if (bug.priority) {
        labels.push(`priority:${bug.priority.toLowerCase()}`);
    }

    const title = bug.error.split('\n')[0].substring(0, 256);
    const body = generateIssueBody(bug);

    const issueData = {
        title,
        body,
        labels: config.auto_labels !== false ? labels : []
    };

    return await githubRequest('POST', `/repos/${owner}/${repo}/issues`, token, issueData);
};

/**
 * Update an existing GitHub issue
 */
export const updateGitHubIssue = async (
    issueNumber: number,
    bug: Bug,
    owner: string,
    repo: string,
    token: string
): Promise<GitHubIssue> => {
    const title = bug.error.split('\n')[0].substring(0, 256);
    const body = generateIssueBody(bug);
    const state = bug.status === 'Resolved' ? 'closed' : 'open';

    const updateData = {
        title,
        body,
        state
    };

    return await githubRequest('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, token, updateData);
};

/**
 * Get all issues from repository (handles pagination for repos with >100 issues).
 */
export const getGitHubIssues = async (
    owner: string,
    repo: string,
    token: string,
    state: 'open' | 'closed' | 'all' = 'all'
): Promise<GitHubIssue[]> => {
    const all: GitHubIssue[] = [];
    let page = 1;
    while (true) {
        const results: GitHubIssue[] = await githubRequest(
            'GET',
            `/repos/${owner}/${repo}/issues?state=${state}&per_page=100&page=${page}`,
            token
        );
        if (!Array.isArray(results) || results.length === 0) break;
        all.push(...results);
        if (results.length < 100) break;
        page++;
    }
    return all;
};

/**
 * Close a GitHub issue
 */
export const closeGitHubIssue = async (
    issueNumber: number,
    owner: string,
    repo: string,
    token: string
): Promise<void> => {
    await githubRequest('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, token, { state: 'closed' });
};

/**
 * Reopen a closed GitHub issue
 */
export const reopenGitHubIssue = async (
    issueNumber: number,
    owner: string,
    repo: string,
    token: string
): Promise<void> => {
    await githubRequest('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, token, { state: 'open' });
};

/**
 * Fetch a single GitHub issue by number
 */
export const getGitHubIssue = async (
    issueNumber: number,
    owner: string,
    repo: string,
    token: string
): Promise<GitHubIssue> => {
    return await githubRequest('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`, token);
};

/**
 * Fetch all comments on a GitHub issue (handles pagination).
 */
export const getIssueComments = async (
    issueNumber: number,
    owner: string,
    repo: string,
    token: string
): Promise<GitHubComment[]> => {
    const all: GitHubComment[] = [];
    let page = 1;
    while (true) {
        const results: GitHubComment[] = await githubRequest(
            'GET',
            `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
            token
        );
        if (!Array.isArray(results) || results.length === 0) break;
        all.push(...results);
        if (results.length < 100) break;
        page++;
    }
    return all;
};

/**
 * Post a comment to a GitHub issue
 */
export const createIssueComment = async (
    issueNumber: number,
    body: string,
    owner: string,
    repo: string,
    token: string
): Promise<void> => {
    await githubRequest('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, { body });
};
