import inquirer from 'inquirer';
import chalk from 'chalk';
import { getUserConfig, setUserConfig } from '../utils/config';
import {
    verifyGitHubToken,
    detectGitHubRepo,
    createGitHubIssue,
    updateGitHubIssue,
    getGitHubConfig,
    getGitHubIssues,
    getGitHubIssue,
    getIssueComments,
    createIssueComment,
    GitHubIssue
} from '../utils/github';
import {
    getBugs,
    getBugById,
    saveBug,
    ensureProjectInit,
    generateId,
    sanitizeInput,
    Bug,
    BugPriority,
    BugComment
} from '../utils/storage';

/**
 * Handle GitHub authentication
 */
export const handleGitHubAuth = async (args: string[]) => {
    // Check for --token flag
    const tokenIndex = args.indexOf('--token');
    let token: string | undefined;

    if (tokenIndex !== -1 && args[tokenIndex + 1]) {
        token = args[tokenIndex + 1];
    } else {
        // Interactive prompt
        const answer = await inquirer.prompt([{
            type: 'password',
            name: 'token',
            message: 'Enter your GitHub Personal Access Token:',
            validate: (input: string) => {
                if (!input.trim()) return 'Token cannot be empty.';
                if (!input.startsWith('ghp_') && !input.startsWith('github_pat_')) {
                    return 'Token should start with ghp_ or github_pat_';
                }
                return true;
            }
        }]);
        token = answer.token;
    }

    if (!token) {
        console.error(chalk.red('Error: No token provided.'));
        return;
    }

    // Verify token
    console.log(chalk.white('Verifying token...'));
    const valid = await verifyGitHubToken(token);

    if (!valid) {
        console.error(chalk.red('Error: Invalid GitHub token.'));
        console.log(chalk.white('\nTo create a token:'));
        console.log(chalk.white('1. Go to https://github.com/settings/tokens'));
        console.log(chalk.white('2. Click "Generate new token (classic)"'));
        console.log(chalk.white('3. Select scope: "repo"'));
        console.log(chalk.white('4. Copy the token and run this command again'));
        return;
    }

    // Save token
    setUserConfig('github.token', token);
    console.log(chalk.green('✓ GitHub token saved successfully!'));

    // Try to detect repository
    const detected = await detectGitHubRepo();
    if (detected) {
        setUserConfig('github.owner', detected.owner);
        setUserConfig('github.repo', detected.repo);
        console.log(chalk.green(`✓ Detected repository: ${detected.owner}/${detected.repo}`));
    } else {
        console.log(chalk.yellow('\n⚠  Could not detect GitHub repository.'));
        console.log(chalk.white('Run this in a git repository, or set manually:'));
        console.log(chalk.white('  bugbook config github.owner <username>'));
        console.log(chalk.white('  bugbook config github.repo <repo-name>'));
    }
};

/**
 * Show GitHub sync status
 */
export const handleGitHubStatus = async () => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    const config = getUserConfig();
    const githubConfig = config.github || {};

    console.log(chalk.bold.white('\nGitHub Integration Status\n'));

    // Authentication
    if (githubConfig.token) {
        const valid = await verifyGitHubToken(githubConfig.token);
        if (valid) {
            console.log(chalk.green('✓ Authenticated: Yes'));
        } else {
            console.log(chalk.red('✗ Authenticated: No (invalid token)'));
        }
    } else {
        console.log(chalk.red('✗ Authenticated: No'));
        console.log(chalk.white('  Run: bugbook github auth'));
    }

    // Repository
    if (githubConfig.owner && githubConfig.repo) {
        console.log(chalk.green(`✓ Repository: ${githubConfig.owner}/${githubConfig.repo}`));
    } else {
        console.log(chalk.yellow('⚠  Repository: Not configured'));
        const detected = await detectGitHubRepo();
        if (detected) {
            console.log(chalk.white(`  Detected: ${detected.owner}/${detected.repo}`));
            console.log(chalk.white(`  Run: bugbook github auth (to save)`));
        }
    }

    // Bug statistics
    const bugs = await getBugs();
    const openBugs = bugs.filter(b => b.status === 'Open');
    const syncedBugs = bugs.filter(b => b.github_issue_number);
    const pendingBugs = openBugs.filter(b => !b.github_issue_number);

    console.log(chalk.white(`\nOpen bugs: ${openBugs.length}`));
    console.log(chalk.white(`Synced to GitHub: ${syncedBugs.length}`));
    console.log(chalk.white(`Pending sync: ${pendingBugs.length}`));

    if (pendingBugs.length > 0) {
        console.log(chalk.white('\nPending bugs:'));
        pendingBugs.slice(0, 5).forEach(bug => {
            const preview = bug.error.split('\n')[0].substring(0, 60);
            console.log(chalk.gray(`  - [${bug.id}] ${preview}`));
        });
        if (pendingBugs.length > 5) {
            console.log(chalk.gray(`  ... and ${pendingBugs.length - 5} more`));
        }
        console.log(chalk.white('\nRun: bugbook github push'));
    }

    console.log('');
};

/**
 * Push bugs to GitHub Issues
 */
export const handleGitHubPush = async (args: string[]) => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    const config = getUserConfig();
    const githubConfig = config.github || {};

    // Validate configuration
    if (!githubConfig.token) {
        console.error(chalk.red('Error: GitHub token not configured.'));
        console.log(chalk.white('Run: bugbook github auth'));
        return;
    }

    if (!githubConfig.owner || !githubConfig.repo) {
        console.error(chalk.red('Error: GitHub repository not configured.'));
        const detected = await detectGitHubRepo();
        if (detected) {
            console.log(chalk.white(`Detected: ${detected.owner}/${detected.repo}`));
            console.log(chalk.white('Run: bugbook github auth (to save)'));
        } else {
            console.log(chalk.white('Set manually:'));
            console.log(chalk.white('  bugbook config github.owner <username>'));
            console.log(chalk.white('  bugbook config github.repo <repo-name>'));
        }
        return;
    }

    // Parse flags
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');
    const specificBugIds = args.filter(arg => !arg.startsWith('--'));

    // Get bugs to push
    let bugs = await getBugs();

    // Filter for open bugs
    bugs = bugs.filter(b => b.status === 'Open');

    // Filter by specific IDs if provided
    if (specificBugIds.length > 0) {
        bugs = bugs.filter(b => specificBugIds.some(id => id.toUpperCase() === b.id.toUpperCase()));
    }

    // Filter out already synced bugs unless --force
    if (!force) {
        bugs = bugs.filter(b => !b.github_issue_number);
    }

    if (bugs.length === 0) {
        console.log(chalk.white('No bugs to push.'));
        return;
    }

    if (dryRun) {
        console.log(chalk.white(`\nDry run: Would push ${bugs.length} bug(s):\n`));
        bugs.forEach(bug => {
            const preview = bug.error.split('\n')[0].substring(0, 60);
            console.log(chalk.gray(`  - [${bug.id}] ${preview}`));
        });
        console.log(chalk.white('\nRun without --dry-run to push.'));
        return;
    }

    // Confirm
    const confirmAnswer = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Push ${bugs.length} bug(s) to GitHub Issues?`,
        default: true
    }]);

    if (!confirmAnswer.confirm) {
        console.log(chalk.white('Cancelled.'));
        return;
    }

    // Push bugs
    console.log(chalk.white(`\nPushing ${bugs.length} bug(s) to GitHub...\n`));

    let successCount = 0;
    let failCount = 0;

    for (const bug of bugs) {
        try {
            const issue = await createGitHubIssue(
                bug,
                githubConfig.owner!,
                githubConfig.repo!,
                githubConfig.token!
            );

            // Update bug with GitHub metadata
            bug.github_issue_number = issue.number;
            bug.github_issue_url = issue.html_url;
            bug.github_issue_closed = false;
            bug.last_synced = new Date().toISOString();
            await saveBug(bug);

            console.log(chalk.green(`✓ [${bug.id}] → Issue #${issue.number}`));
            successCount++;
        } catch (error: any) {
            console.error(chalk.red(`✗ [${bug.id}] Failed: ${error.message}`));
            failCount++;
        }
    }

    console.log(chalk.white(`\nDone! ${chalk.green(successCount)} succeeded, ${failCount > 0 ? chalk.red(failCount) : failCount} failed.`));

    if (successCount > 0) {
        console.log(chalk.white(`\nView issues: https://github.com/${githubConfig.owner}/${githubConfig.repo}/issues`));
    }
};

// ─── Phase 2 helpers ──────────────────────────────────────────────────────────

/**
 * Parse a BugBook-formatted GitHub issue body to extract structured bug fields.
 */
function parseIssueBody(body: string): Partial<Bug> {
    const result: Partial<Bug> = {};

    const errorMatch = body.match(/## Error\n([\s\S]*?)(?=\n##|---|\n\n---)/);
    if (errorMatch) result.error = errorMatch[1].trim();

    const solutionMatch = body.match(/## Solution\n([\s\S]*?)(?=\n##|---|\n\n---)/);
    if (solutionMatch) result.solution = solutionMatch[1].trim();

    const filesMatch = body.match(/## Related Files\n([\s\S]*?)(?=\n##|---|\n\n---)/);
    if (filesMatch) {
        result.files = filesMatch[1].trim()
            .split('\n')
            .filter(l => l.match(/^- `.*`$/))
            .map(l => l.replace(/^- `/, '').replace(/`$/, '').trim());
    }

    const categoryMatch = body.match(/\*\*Category\*\*:\s*(.*)/);
    if (categoryMatch) result.category = categoryMatch[1].trim();

    const priorityMatch = body.match(/\*\*Priority\*\*:\s*(.*)/);
    if (priorityMatch) {
        const p = priorityMatch[1].trim();
        if (p === 'High' || p === 'Medium' || p === 'Low') {
            result.priority = p as BugPriority;
        }
    }

    const authorMatch = body.match(/\*\*Author\*\*:\s*(.*)/);
    if (authorMatch) result.author = authorMatch[1].trim();

    const dueDateMatch = body.match(/\*\*Due Date\*\*:\s*(.*)/);
    if (dueDateMatch) result.dueDate = dueDateMatch[1].trim();

    return result;
}

/**
 * Extract category and priority from GitHub issue labels.
 */
function parseLabelsToBugFields(labels: Array<{ name: string }>): { category?: string; priority?: BugPriority } {
    const result: { category?: string; priority?: BugPriority } = {};
    for (const label of labels) {
        if (label.name.startsWith('priority:')) {
            const p = label.name.replace('priority:', '');
            const capitalized = p.charAt(0).toUpperCase() + p.slice(1);
            if (capitalized === 'High' || capitalized === 'Medium' || capitalized === 'Low') {
                result.priority = capitalized as BugPriority;
            }
        } else {
            result.category = label.name;
        }
    }
    return result;
}

/**
 * Convert a GitHub issue into a partial Bug (for creating or updating).
 */
function issueToLocalBug(issue: GitHubIssue): Partial<Bug> {
    const fromBody = issue.body ? parseIssueBody(issue.body) : {};
    const fromLabels = parseLabelsToBugFields(issue.labels || []);
    return {
        error: fromBody.error || issue.title,
        solution: fromBody.solution || '',
        category: fromBody.category || fromLabels.category || 'General',
        priority: fromBody.priority || fromLabels.priority,
        author: fromBody.author,
        dueDate: fromBody.dueDate,
        files: fromBody.files,
        status: issue.state === 'closed' ? 'Resolved' : 'Open',
        github_issue_number: issue.number,
        github_issue_url: issue.html_url,
    };
}

/**
 * Load and validate GitHub config — logs error and returns null on failure.
 */
function getValidatedGitHubConfig(): { token: string; owner: string; repo: string } | null {
    const config = getUserConfig();
    const gh = (config as any).github || {};
    if (!gh.token) {
        console.error(chalk.red('Error: GitHub token not configured. Run: bugbook github auth'));
        return null;
    }
    if (!gh.owner || !gh.repo) {
        console.error(chalk.red('Error: GitHub repository not configured.'));
        console.log(chalk.white('  bugbook config github.owner <username>'));
        console.log(chalk.white('  bugbook config github.repo <repo-name>'));
        return null;
    }
    return { token: gh.token, owner: gh.owner, repo: gh.repo };
}

// ─── handleGitHubLink ─────────────────────────────────────────────────────────

/**
 * Manually link a local bug to an existing GitHub issue.
 */
export const handleGitHubLink = async (args: string[]) => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    const gh = getValidatedGitHubConfig();
    if (!gh) return;

    const bugId = args[0];
    const issueNumberStr = args[1];

    if (!bugId || !issueNumberStr) {
        console.log(chalk.white('Usage: bugbook github link <bug-id> <issue-number>'));
        return;
    }

    const issueNumber = parseInt(issueNumberStr, 10);
    if (isNaN(issueNumber) || issueNumber <= 0) {
        console.error(chalk.red('Error: Issue number must be a positive integer.'));
        return;
    }

    // Validate bug exists
    const bug = await getBugById(bugId);
    if (!bug) {
        console.error(chalk.red(`Error: Bug '${bugId}' not found.`));
        return;
    }

    // Validate issue exists on GitHub
    console.log(chalk.white(`Fetching GitHub issue #${issueNumber}...`));
    let issue: GitHubIssue;
    try {
        issue = await getGitHubIssue(issueNumber, gh.owner, gh.repo, gh.token);
    } catch (error: any) {
        console.error(chalk.red(`Error: Could not fetch GitHub issue #${issueNumber}: ${error.message}`));
        return;
    }

    // Link the bug
    bug.github_issue_number = issue.number;
    bug.github_issue_url = issue.html_url;
    bug.last_synced = new Date().toISOString();
    await saveBug(bug);

    console.log(chalk.green(`✓ Bug [${bug.id}] linked to GitHub issue #${issue.number}`));
    console.log(chalk.gray(`  ${issue.html_url}`));
};

// ─── handleGitHubPull ─────────────────────────────────────────────────────────

/**
 * Import open GitHub Issues as new bugs (or update existing linked ones).
 */
export const handleGitHubPull = async (args: string[]) => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    const gh = getValidatedGitHubConfig();
    if (!gh) return;

    const dryRun = args.includes('--dry-run');
    const auto = args.includes('--auto');

    console.log(chalk.white(`\nFetching open issues from ${gh.owner}/${gh.repo}...`));

    let issues: GitHubIssue[];
    try {
        issues = await getGitHubIssues(gh.owner, gh.repo, gh.token, 'open');
    } catch (error: any) {
        console.error(chalk.red(`Error fetching issues: ${error.message}`));
        return;
    }

    if (issues.length === 0) {
        console.log(chalk.white('No open issues found on GitHub.'));
        return;
    }

    // Build map of github_issue_number → local bug
    const allBugs = await getBugs();
    const linkedBugsMap = new Map<number, Bug>();
    for (const bug of allBugs) {
        if (bug.github_issue_number) {
            linkedBugsMap.set(bug.github_issue_number, bug);
        }
    }

    let checkedCount = 0;
    let updatedCount = 0;
    let createdCount = 0;
    const issuesToCreate: GitHubIssue[] = [];

    console.log(chalk.white(`Found ${issues.length} open issue(s).\n`));

    for (const issue of issues) {
        checkedCount++;
        const linkedBug = linkedBugsMap.get(issue.number);

        if (linkedBug) {
            // Check for remote updates
            const remoteUpdated = linkedBug.last_synced && issue.updated_at > linkedBug.last_synced;
            if (remoteUpdated) {
                const remoteFields = issueToLocalBug(issue);
                if (dryRun) {
                    console.log(chalk.yellow(`  ~ [${linkedBug.id}] → #${issue.number} (would update from GitHub)`));
                } else {
                    // Apply remote fields to local bug (remote-wins)
                    linkedBug.error = remoteFields.error || linkedBug.error;
                    linkedBug.solution = remoteFields.solution !== undefined ? remoteFields.solution : linkedBug.solution;
                    linkedBug.status = remoteFields.status || linkedBug.status;
                    if (remoteFields.category) linkedBug.category = remoteFields.category;
                    if (remoteFields.priority !== undefined) linkedBug.priority = remoteFields.priority;
                    if (remoteFields.files !== undefined) linkedBug.files = remoteFields.files;
                    linkedBug.last_synced = new Date().toISOString();
                    await saveBug(linkedBug);
                    console.log(chalk.green(`  ✓ [${linkedBug.id}] updated from GitHub issue #${issue.number}`));
                    updatedCount++;
                }
            } else {
                console.log(chalk.gray(`  = [${linkedBug.id}] → #${issue.number} (no changes)`));
            }
        } else {
            // Issue not linked to any local bug
            issuesToCreate.push(issue);
            const preview = issue.title.substring(0, 60);
            if (dryRun || !auto) {
                console.log(chalk.cyan(`  + #${issue.number} "${preview}" (unlinked)`));
            }
        }
    }

    // Handle unlinked issues
    if (issuesToCreate.length > 0 && !dryRun) {
        if (auto) {
            // Create all without prompting
            for (const issue of issuesToCreate) {
                const fields = issueToLocalBug(issue);
                const newBug: Bug = {
                    id: generateId(),
                    timestamp: issue.created_at,
                    category: fields.category || 'General',
                    error: sanitizeInput(fields.error || issue.title),
                    solution: sanitizeInput(fields.solution || ''),
                    status: fields.status || 'Open',
                    priority: fields.priority,
                    author: fields.author,
                    dueDate: fields.dueDate,
                    files: fields.files,
                    github_issue_number: issue.number,
                    github_issue_url: issue.html_url,
                    last_synced: new Date().toISOString(),
                };
                await saveBug(newBug);
                console.log(chalk.green(`  ✓ Created bug [${newBug.id}] from GitHub issue #${issue.number}`));
                createdCount++;
            }
        } else {
            // Prompt once for all unlinked issues
            console.log(chalk.white(`\n${issuesToCreate.length} unlinked issue(s) found.`));
            const { createAll } = await inquirer.prompt([{
                type: 'confirm',
                name: 'createAll',
                message: `Create local bugs for all ${issuesToCreate.length} unlinked issue(s)?`,
                default: false
            }]);

            if (createAll) {
                for (const issue of issuesToCreate) {
                    const fields = issueToLocalBug(issue);
                    const newBug: Bug = {
                        id: generateId(),
                        timestamp: issue.created_at,
                        category: fields.category || 'General',
                        error: sanitizeInput(fields.error || issue.title),
                        solution: sanitizeInput(fields.solution || ''),
                        status: fields.status || 'Open',
                        priority: fields.priority,
                        author: fields.author,
                        dueDate: fields.dueDate,
                        files: fields.files,
                        github_issue_number: issue.number,
                        github_issue_url: issue.html_url,
                        last_synced: new Date().toISOString(),
                    };
                    await saveBug(newBug);
                    console.log(chalk.green(`  ✓ Created bug [${newBug.id}] from GitHub issue #${issue.number}`));
                    createdCount++;
                }
            } else {
                console.log(chalk.white('Skipped unlinked issues. Use --auto to create all without prompts.'));
            }
        }
    }

    if (dryRun) {
        console.log(chalk.yellow(`\nDry run complete. ${checkedCount} issue(s) checked, ${issuesToCreate.length} would be created.`));
        console.log(chalk.white('Run without --dry-run to apply changes.'));
    } else {
        console.log(chalk.white(`\nDone! ${checkedCount} checked, ${updatedCount} updated, ${createdCount} created.`));
    }
};

// ─── handleGitHubSync ─────────────────────────────────────────────────────────

/**
 * Full two-way sync: push local changes, pull remote changes, sync comments.
 */
export const handleGitHubSync = async (args: string[]) => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    const gh = getValidatedGitHubConfig();
    if (!gh) return;

    const dryRun = args.includes('--dry-run');
    const localWins = args.includes('--local-wins');

    const allBugs = await getBugs();
    const linkedBugs = allBugs.filter(b => b.github_issue_number);

    if (linkedBugs.length === 0) {
        console.log(chalk.white('No bugs are linked to GitHub issues.'));
        console.log(chalk.white('Use "bugbook github push" or "bugbook github link" first.'));
        return;
    }

    console.log(chalk.white(`\nSyncing ${linkedBugs.length} linked bug(s)...\n`));

    let pushedCount = 0;
    let pulledCount = 0;
    let conflictCount = 0;
    let commentsSynced = 0;
    let closedCount = 0;

    for (const bug of linkedBugs) {
        const issueNumber = bug.github_issue_number!;

        let issue: GitHubIssue;
        try {
            issue = await getGitHubIssue(issueNumber, gh.owner, gh.repo, gh.token);
        } catch (error: any) {
            console.error(chalk.red(`  ✗ [${bug.id}] Failed to fetch #${issueNumber}: ${error.message}`));
            continue;
        }

        const lastSynced = bug.last_synced || '1970-01-01T00:00:00Z';
        const remoteChanged = issue.updated_at > lastSynced;
        const localChanged = bug.last_modified ? bug.last_modified > lastSynced : false;

        // ── Conflict detection ──────────────────────────────────────────────
        if (remoteChanged && localChanged) {
            conflictCount++;
            const strategy = localWins ? 'local-wins' : 'remote-wins (default)';
            console.log(chalk.yellow(`  ⚡ [${bug.id}] CONFLICT with #${issueNumber} — strategy: ${strategy}`));

            if (dryRun) {
                console.log(chalk.gray(`     Local modified: ${bug.last_modified}`));
                console.log(chalk.gray(`     Remote updated: ${issue.updated_at}`));
            } else if (localWins) {
                // Push local changes to GitHub
                try {
                    await updateGitHubIssue(issueNumber, bug, gh.owner, gh.repo, gh.token);
                    bug.last_synced = new Date().toISOString();
                    await saveBug(bug);
                    console.log(chalk.green(`     → Pushed local changes to #${issueNumber}`));
                    pushedCount++;
                } catch (err: any) {
                    console.error(chalk.red(`     ✗ Push failed: ${err.message}`));
                }
            } else {
                // Remote wins: update local from GitHub
                const remoteFields = issueToLocalBug(issue);
                bug.error = remoteFields.error || bug.error;
                bug.solution = remoteFields.solution !== undefined ? remoteFields.solution : bug.solution;
                bug.status = remoteFields.status || bug.status;
                if (remoteFields.category) bug.category = remoteFields.category;
                if (remoteFields.priority !== undefined) bug.priority = remoteFields.priority;
                if (remoteFields.files !== undefined) bug.files = remoteFields.files;
                bug.last_synced = new Date().toISOString();
                await saveBug(bug);
                console.log(chalk.green(`     ← Pulled remote changes from #${issueNumber}`));
                pulledCount++;
            }

        } else if (remoteChanged) {
            // Remote changed: update local
            const remoteFields = issueToLocalBug(issue);
            if (dryRun) {
                console.log(chalk.cyan(`  ← [${bug.id}] would pull from #${issueNumber} (remote updated ${issue.updated_at})`));
            } else {
                bug.error = remoteFields.error || bug.error;
                bug.solution = remoteFields.solution !== undefined ? remoteFields.solution : bug.solution;
                bug.status = remoteFields.status || bug.status;
                if (remoteFields.category) bug.category = remoteFields.category;
                if (remoteFields.priority !== undefined) bug.priority = remoteFields.priority;
                if (remoteFields.files !== undefined) bug.files = remoteFields.files;
                bug.last_synced = new Date().toISOString();
                await saveBug(bug);
                console.log(chalk.green(`  ← [${bug.id}] pulled from #${issueNumber}`));
                pulledCount++;
            }

        } else if (localChanged) {
            // Local changed: push to GitHub
            if (dryRun) {
                console.log(chalk.cyan(`  → [${bug.id}] would push to #${issueNumber} (local modified ${bug.last_modified})`));
            } else {
                try {
                    await updateGitHubIssue(issueNumber, bug, gh.owner, gh.repo, gh.token);
                    bug.last_synced = new Date().toISOString();
                    await saveBug(bug);
                    console.log(chalk.green(`  → [${bug.id}] pushed to #${issueNumber}`));
                    pushedCount++;
                } catch (err: any) {
                    console.error(chalk.red(`  ✗ [${bug.id}] Push failed: ${err.message}`));
                }
            }

        } else {
            console.log(chalk.gray(`  = [${bug.id}] → #${issueNumber} (no changes)`));
        }

        // ── Auto-close GitHub issue when bug is Resolved ───────────────────
        if (!dryRun && bug.status === 'Resolved' && issue.state === 'open') {
            try {
                await updateGitHubIssue(issueNumber, bug, gh.owner, gh.repo, gh.token);
                bug.last_synced = new Date().toISOString();
                await saveBug(bug);
                console.log(chalk.green(`  ✓ [${bug.id}] auto-closed GitHub issue #${issueNumber}`));
                closedCount++;
            } catch (err: any) {
                console.error(chalk.red(`  ✗ [${bug.id}] Auto-close failed: ${err.message}`));
            }
        }

        // ── Comment sync ───────────────────────────────────────────────────
        if (!dryRun) {
            try {
                const ghComments = await getIssueComments(issueNumber, gh.owner, gh.repo, gh.token);

                // Pull new GitHub comments → append to local bug
                const existingTimestamps = new Set(
                    (bug.comments || [])
                        .filter(c => c.source === 'github')
                        .map(c => c.timestamp)
                );
                const newGhComments = ghComments.filter(
                    c => c.created_at > lastSynced && !existingTimestamps.has(c.created_at)
                );
                if (newGhComments.length > 0) {
                    if (!bug.comments) bug.comments = [];
                    for (const ghc of newGhComments) {
                        const imported: BugComment = {
                            text: ghc.body,
                            timestamp: ghc.created_at,
                            author: ghc.user.login,
                            source: 'github',
                        };
                        bug.comments.push(imported);
                        commentsSynced++;
                    }
                    await saveBug(bug);
                    console.log(chalk.green(`  ✓ [${bug.id}] imported ${newGhComments.length} GitHub comment(s)`));
                }

                // Push new local comments → post to GitHub
                const newLocalComments = (bug.comments || []).filter(
                    c => !c.source && c.timestamp > lastSynced
                );
                for (const localComment of newLocalComments) {
                    const authorPrefix = localComment.author ? `**${localComment.author}**: ` : '';
                    await createIssueComment(issueNumber, `${authorPrefix}${localComment.text}`, gh.owner, gh.repo, gh.token);
                    commentsSynced++;
                }
                if (newLocalComments.length > 0) {
                    console.log(chalk.green(`  ✓ [${bug.id}] posted ${newLocalComments.length} local comment(s) to GitHub`));
                }

            } catch (err: any) {
                console.error(chalk.red(`  ✗ [${bug.id}] Comment sync failed: ${err.message}`));
            }
        }
    }

    if (dryRun) {
        console.log(chalk.yellow(`\nDry run complete. Run without --dry-run to apply changes.`));
    } else {
        const parts: string[] = [];
        if (pushedCount) parts.push(`${pushedCount} pushed`);
        if (pulledCount) parts.push(`${pulledCount} pulled`);
        if (conflictCount) parts.push(`${conflictCount} conflicts resolved`);
        if (closedCount) parts.push(`${closedCount} issue(s) auto-closed`);
        if (commentsSynced) parts.push(`${commentsSynced} comment(s) synced`);
        console.log(chalk.white(`\nSync complete. ${parts.length > 0 ? parts.join(', ') + '.' : 'No changes.'}`));
    }
};

/**
 * Main GitHub command router
 */
export const handleGitHub = async (args: string[]) => {
    const subcommand = args[0];
    const restArgs = args.slice(1);

    switch (subcommand) {
        case 'auth':
            await handleGitHubAuth(restArgs);
            break;
        case 'status':
            await handleGitHubStatus();
            break;
        case 'push':
            await handleGitHubPush(restArgs);
            break;
        case 'pull':
            await handleGitHubPull(restArgs);
            break;
        case 'sync':
            await handleGitHubSync(restArgs);
            break;
        case 'link':
            await handleGitHubLink(restArgs);
            break;
        case 'help':
        case undefined:
            printGitHubHelp();
            break;
        default:
            console.error(chalk.red(`Unknown github subcommand: ${subcommand}`));
            printGitHubHelp();
    }
};

const printGitHubHelp = () => {
    console.log(chalk.bold.white('GitHub Integration Commands:'));
    console.log(`  ${chalk.white('github auth')}              - Authenticate with GitHub`);
    console.log(`  ${chalk.white('github status')}            - Show sync status`);
    console.log(`  ${chalk.white('github push')}              - Push local bugs to GitHub Issues`);
    console.log(`  ${chalk.white('github pull')}              - Import open GitHub Issues as local bugs`);
    console.log(`  ${chalk.white('github sync')}              - Full two-way sync (push + pull + comments)`);
    console.log(`  ${chalk.white('github link <id> <#>')}     - Link a bug to an existing GitHub issue`);
    console.log(`\n${chalk.bold.white('Flags:')}`);
    console.log(`  ${chalk.white('--dry-run')}   Show what would happen without making changes`);
    console.log(`  ${chalk.white('--auto')}      (pull) Create all unlinked issues without prompts`);
    console.log(`  ${chalk.white('--local-wins')} (sync) Prefer local version on conflicts`);
    console.log(`  ${chalk.white('--force')}     (push) Re-push already-synced bugs`);
    console.log(`\n${chalk.bold.white('Examples:')}`);
    console.log(`  ${chalk.gray('bugbook github auth')}`);
    console.log(`  ${chalk.gray('bugbook github auth --token ghp_xxx')}`);
    console.log(`  ${chalk.gray('bugbook github push --dry-run')}`);
    console.log(`  ${chalk.gray('bugbook github pull --auto')}`);
    console.log(`  ${chalk.gray('bugbook github sync --dry-run')}`);
    console.log(`  ${chalk.gray('bugbook github sync --local-wins')}`);
    console.log(`  ${chalk.gray('bugbook github link A1B2C3D4 42')}`);
};
