#!/usr/bin/env node
import figlet from 'figlet';
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import packageJson from '../package.json';
import { BUG_DIR } from './utils/storage';
import { createCompletion } from './utils/completion';

import { handleInit } from './commands/init';
import { handleAdd } from './commands/add';
import { handleList } from './commands/list';
import { handleSearch } from './commands/search';
import { handleTags, handleNewTag } from './commands/tags';
import { handleVersion } from './commands/version';
import { handleDelete } from './commands/delete';
import { handleEdit } from './commands/edit';
import { handleResolve } from './commands/resolve';
import { handleStats } from './commands/stats';
import { handleExport } from './commands/export';
import { handleComment } from './commands/comment';
import { config } from './commands/config';
import { handleGitHub } from './commands/github';
import { handleCompletion } from './commands/completion';
import { handleView } from './commands/view';
import { handleServe } from './commands/serve';
import { handleApp } from './commands/app';

const printHelp = (includeQuit = false) => {
    console.log(chalk.bold.white('Available commands:'));
    console.log(`  ${chalk.white('init')}       - Initialize Bugbook in the current directory`);
    console.log(`  ${chalk.white('add')}        - Add a new bug entry`);
    console.log(`  ${chalk.white('list')}       - List bugs with filtering and sorting`);
    console.log(`               Flags: --priority, --status, --tagged, --author, --sort, --order, --limit`);
    console.log(`  ${chalk.white('view')}       - Show full detail for a single bug`);
    console.log(`  ${chalk.white('search')}     - Search bugs (fuzzy) by ID or text`);
    console.log(`  ${chalk.white('edit')}       - Edit an existing bug`);
    console.log(`  ${chalk.white('delete')}     - Delete a bug`);
    console.log(`  ${chalk.white('resolve')}    - Resolve/re-open bugs (supports multiple IDs and filters)`);
    console.log(`               Flags: --all-tagged, --all-status, -y/--no-confirm`);
    console.log(`  ${chalk.white('comment')}    - Add a comment to a bug`);
    console.log(`  ${chalk.white('stats')}      - Show bug statistics (--format json for JSON output)`);
    console.log(`  ${chalk.white('tags')}       - List all tags with usage counts`);
    console.log(`  ${chalk.white('new-tag')}    - Create a new tag`);
    console.log(`  ${chalk.white('export')}     - Export bugs to Markdown (default: BUGS.md)`);
    console.log(`  ${chalk.white('version')}    - Show version information`);
    console.log(`  ${chalk.white('config')}     - View or set global configuration`);
    console.log(`  ${chalk.white('serve')}      - Start local web UI in browser (default port 3000)`);
    console.log(`               Flags: --port <n>`);
    console.log(`  ${chalk.white('app')}        - Open Bugbook as a desktop window (Electron)`);
    console.log(`  ${chalk.white('github')}     - GitHub Issues integration (auth, push, pull, sync, link, status)`);
    console.log(`  ${chalk.white('completion')} - Setup shell auto-completion (install, setup, generate)`);
    if (includeQuit) {
        console.log(`  ${chalk.white('quit')}       - Exit the application`);
    } else {
        console.log(`  ${chalk.white('help')}       - Show this help menu`);
    }
};

const executeCommand = async (command: string, argStr: string, isInteractive: boolean): Promise<boolean> => {
    switch (command) {
        case 'quit':
        case 'exit':
            if (isInteractive) {
                console.log(chalk.white('Goodbye!'));
                process.exit(0);
            }
            return false;
        case 'init':
            if (!isInteractive) {
                await handleInit();
            }
            return true;
        case 'add':
            await handleAdd();
            return true;
        case 'list':
            await handleList(argStr);
            return true;
        case 'search':
            await handleSearch(argStr);
            return true;
        case 'delete':
            await handleDelete(argStr);
            return true;
        case 'edit':
            await handleEdit(argStr);
            return true;
        case 'resolve':
            await handleResolve(argStr);
            return true;
        case 'comment':
            await handleComment(argStr);
            return true;
        case 'stats':
            await handleStats(argStr);
            return true;
        case 'view':
            await handleView(argStr ? argStr.split(' ') : []);
            return true;
        case 'tags':
            await handleTags();
            return true;
        case 'new-tag':
            await handleNewTag();
            return true;
        case 'export':
            const exportArgs = argStr ? argStr.split(' ') : [];
            await handleExport(exportArgs);
            return true;
        case 'version':
            handleVersion();
            return true;
        case 'config':
            const configArgs = argStr ? argStr.split(' ') : [];
            await config(configArgs);
            return true;
        case 'github':
            const githubArgs = argStr ? argStr.split(' ') : [];
            await handleGitHub(githubArgs);
            return true;
        case 'serve':
            await handleServe(argStr ? argStr.split(' ') : []);
            return true;
        case 'app':
            await handleApp(argStr ? argStr.split(' ') : []);
            return true;
        case 'completion':
            const completionArgs = argStr ? argStr.split(' ') : [];
            await handleCompletion(completionArgs);
            return true;
        case 'help':
            printHelp(isInteractive);
            return true;
        case '':
            return true;
        default:
            console.log(chalk.red(`Unknown command: '${command}'`));
            if (!isInteractive) {
                console.log(`Run "bugbook help" for a list of commands.`);
            }
            return false;
    }
};

// Initialize completion handler (responds to shell completion requests)
const completion = createCompletion();
completion.init();

const args = process.argv.slice(2);
const command = args[0];
const restArgs = args.slice(1).join(' ');

async function main() {
    if (command === undefined) {
        startApp();
    } else {
        await executeCommand(command, restArgs, false);
    }
}

main();

function startApp() {
    if (!fs.existsSync(BUG_DIR)) {
        console.log(chalk.red('\nBugbook is not initialized in this directory.'));
        console.log(chalk.white('Please run "bugbook init" first to set up.\n'));
        process.exit(1);
    }

    console.clear();

    figlet('BUGBOOK', (err, data) => {
        if (err) {
            console.log(chalk.red('Something went wrong...'));
            console.error(err instanceof Error ? err.message : 'Unknown error');
            return;
        }
        console.log(chalk.white(data));
        console.log(chalk.bold.white(`\nBugbook CLI Tool v${packageJson.version}`));
        console.log(chalk.white('-----------------------'));
        console.log(chalk.white('Welcome to the Bugbook interface.\n'));
        console.log(chalk.white('Type "help" for a list of commands.\n'));

        const promptLoop = () => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: chalk.white('bugbook> ')
            });

            rl.question(chalk.white('bugbook> '), async (line) => {
                rl.close();
                const parts = line.trim().split(' ');
                const cmd = parts[0];
                const argStr = parts.slice(1).join(' ');

                await executeCommand(cmd, argStr, true);
                promptLoop();
            });
        };

        promptLoop();
    });
}
