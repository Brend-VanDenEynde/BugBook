import chalk from 'chalk';
import { getBugById, isOverdue, ensureProjectInit } from '../utils/storage';

export const handleView = async (args: string[]): Promise<void> => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    const bugId = args[0];

    if (!bugId) {
        console.log(chalk.white('Usage: bugbook view <bug-id>'));
        return;
    }

    const bug = await getBugById(bugId);

    if (!bug) {
        console.error(chalk.red(`Error: Bug '${bugId}' not found.`));
        return;
    }

    const line = '═'.repeat(60);
    const thinLine = '─'.repeat(40);

    // Status badge
    const statusBadge = bug.status === 'Open'
        ? chalk.green.bold('[OPEN]')
        : chalk.grey.bold('[RESOLVED]');

    // Priority badge
    let priorityBadge = '';
    if (bug.priority) {
        const pColor = bug.priority === 'High'
            ? chalk.red
            : (bug.priority === 'Medium' ? chalk.yellow : chalk.blue);
        priorityBadge = ` ${pColor.bold(`[${bug.priority}]`)}`;
    }

    console.log(chalk.white(line));
    console.log(`${chalk.bold.white('BUG')} ${chalk.bold.cyan(bug.id)} ${statusBadge}${priorityBadge}`);
    console.log(chalk.white(line));

    // Core fields
    console.log(`${chalk.bold.white('Error:')}    ${bug.error}`);
    if (bug.solution) {
        console.log(`${chalk.bold.white('Solution:')} ${bug.solution}`);
    }
    console.log(`${chalk.bold.white('Category:')} ${bug.category}`);

    if (bug.author) {
        console.log(`${chalk.bold.white('Author:')}   ${bug.author}`);
    }

    console.log(`${chalk.bold.white('Created:')}  ${new Date(bug.timestamp).toLocaleString()}`);

    if (bug.dueDate) {
        const overdue = isOverdue(bug);
        const dueDateStr = overdue
            ? chalk.red.bold(`${bug.dueDate} (OVERDUE)`)
            : chalk.green(bug.dueDate);
        console.log(`${chalk.bold.white('Due Date:')} ${dueDateStr}`);
    }

    // Related files
    if (bug.files && bug.files.length > 0) {
        console.log(`\n${chalk.bold.white('Related Files:')}`);
        bug.files.forEach(f => console.log(`  ${chalk.gray('•')} ${f}`));
    }

    // Comments
    if (bug.comments && bug.comments.length > 0) {
        console.log(`\n${chalk.bold.white(`Comments (${bug.comments.length}):`)} `);
        console.log(chalk.white(thinLine));
        bug.comments.forEach((c, i) => {
            const authorStr = c.author ? chalk.cyan(c.author) : chalk.gray('(unknown)');
            const sourceTag = c.source === 'github' ? chalk.gray(' [GitHub]') : '';
            const dateStr = chalk.gray(new Date(c.timestamp).toLocaleString());
            console.log(`${chalk.gray(`[${i + 1}]`)} ${authorStr}${sourceTag} ${dateStr}`);
            console.log(`  ${c.text}`);
            if (i < bug.comments!.length - 1) {
                console.log(chalk.gray('  ···'));
            }
        });
    }

    // GitHub section
    if (bug.github_issue_number) {
        console.log(`\n${chalk.bold.white('GitHub:')}`);
        console.log(`  ${chalk.bold.white('Issue:')}      ${chalk.cyan(`#${bug.github_issue_number}`)}`);
        if (bug.github_issue_url) {
            console.log(`  ${chalk.bold.white('URL:')}        ${chalk.underline(bug.github_issue_url)}`);
        }
        if (bug.last_synced) {
            console.log(`  ${chalk.bold.white('Last Synced:')} ${chalk.gray(new Date(bug.last_synced).toLocaleString())}`);
        }
    }

    console.log(chalk.white('\n' + line));
};
