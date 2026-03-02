import inquirer from 'inquirer';
import chalk from 'chalk';
import { getBugs, deleteBug, ensureProjectInit, validateBugId } from '../utils/storage';
import { selectBugPrompt } from '../utils/prompts';

export const handleDelete = async (argStr: string) => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized.'));
        return;
    }

    let bugId = argStr.trim();

    if (bugId && !validateBugId(bugId)) {
        console.error(chalk.red('Error: Invalid bug ID format.'));
        return;
    }

    const bugs = await getBugs();

    if (bugs.length === 0) {
        console.log(chalk.white('No bugs to delete.'));
        return;
    }

    if (!bugId) {
        bugId = await selectBugPrompt(bugs, 'Select a bug to delete:');
    }

    const bugIndex = bugs.findIndex(b => b.id.toUpperCase() === bugId.toUpperCase());

    if (bugIndex === -1) {
        console.error(chalk.red(`Error: Bug with ID '${bugId}' not found.`));
        return;
    }

    const confirmAnswer = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete bug [${bugs[bugIndex].id}]?`,
        default: false
    }]);

    if (confirmAnswer.confirm) {
        try {
            await deleteBug(bugs[bugIndex].id);
            console.log(chalk.green(`Bug [${bugId}] deleted successfully.`));
        } catch (e: any) {
            const msg = e?.code === 'EACCES' ? 'Permission denied removing file from .bugbook/.'
                      : e instanceof Error ? e.message
                      : 'Unknown error.';
            console.error(chalk.red(`Error: Could not delete bug — ${msg}`));
        }
    } else {
        console.log(chalk.white('Deletion cancelled.'));
    }
};
