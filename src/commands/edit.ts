import inquirer from 'inquirer';
import chalk from 'chalk';
import { getBugs, saveBug, getTags, ensureProjectInit, sanitizeInput, addTag, sanitizeTagName, warnMissingFiles, validateDateStr, validateBugId, MAX_INPUT_LENGTH } from '../utils/storage';
import { setupEditor } from '../utils/config';
import { selectBugPrompt } from '../utils/prompts';

export const handleEdit = async (argStr: string) => {
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
        console.log(chalk.white('No bugs found.'));
        return;
    }

    if (!bugId) {
        bugId = await selectBugPrompt(bugs, 'Select a bug to edit:');
    }

    const bug = bugs.find(b => b.id.toUpperCase() === bugId.toUpperCase());

    if (!bug) {
        console.error(chalk.red(`Error: Bug with ID '${bugId}' not found.`));
        return;
    }

    const useEditor = setupEditor();

    // Field selection
    const fieldAnswer = await inquirer.prompt([{
        type: 'list',
        name: 'field',
        message: 'Which field do you want to edit?',
        choices: [
            { name: 'Error Message', value: 'Error Message' },
            { name: 'Solution', value: 'Solution' },
            { name: 'Category', value: 'Category' },
            { name: 'Priority', value: 'Priority' },
            { name: 'Files', value: 'Files' },
            { name: 'Due Date', value: 'Due Date' },
            { name: 'Cancel', value: 'Cancel' }
        ]
    }] as any);

    if (fieldAnswer.field === 'Cancel') {
        console.log(chalk.white('Edit cancelled.'));
        return;
    }

    if (fieldAnswer.field === 'Category') {
        const tags = await getTags();
        const tagAnswer = await inquirer.prompt([{
            type: 'list',
            name: 'tag',
            message: 'Select new category:',
            choices: [
                ...tags.map(t => ({ name: t, value: t })),
                { name: '── Create new tag ──', value: '__new_tag__' }
            ]
        }] as any);

        let newTag = tagAnswer.tag;
        if (newTag === '__new_tag__') {
            const customTag = await inquirer.prompt([{
                type: 'input',
                name: 'val',
                message: 'Enter new tag name:'
            }]);

            const sanitized = sanitizeTagName(customTag.val);
            if (sanitized) {
                const result = await addTag(sanitized);
                if (result.success) {
                    console.log(chalk.green(result.message));
                }
                newTag = sanitized;
            } else {
                newTag = 'General';
                console.log(chalk.white('Invalid tag name, using "General".'));
            }
        }
        bug.category = newTag;

    } else if (fieldAnswer.field === 'Error Message') {
        const errAnswer = await inquirer.prompt([{
            type: useEditor ? 'editor' : 'input',
            name: 'val',
            message: 'New error message:',
            default: bug.error,
            validate: (input: string) => {
                if (!input.trim()) return 'Error message cannot be empty.';
                if (input.length > MAX_INPUT_LENGTH) return `Input too long. Maximum ${MAX_INPUT_LENGTH} characters.`;
                return true;
            }
        }] as any);
        bug.error = sanitizeInput(errAnswer.val);

    } else if (fieldAnswer.field === 'Solution') {
        const solAnswer = await inquirer.prompt([{
            type: useEditor ? 'editor' : 'input',
            name: 'val',
            message: 'New solution:',
            default: bug.solution,
            validate: (input: string) => {
                if (input.length > MAX_INPUT_LENGTH) return `Input too long. Maximum ${MAX_INPUT_LENGTH} characters.`;
                return true;
            }
        }] as any);
        bug.solution = sanitizeInput(solAnswer.val);

    } else if (fieldAnswer.field === 'Priority') {
        const priorityAnswer = await inquirer.prompt([{
            type: 'list',
            name: 'val',
            message: 'New priority:',
            choices: [
                { name: 'Low', value: 'Low' },
                { name: 'Medium', value: 'Medium' },
                { name: 'High', value: 'High' }
            ],
            default: bug.priority || 'Medium'
        }] as any);
        bug.priority = priorityAnswer.val;

    } else if (fieldAnswer.field === 'Files') {
        const filesAnswer = await inquirer.prompt([{
            type: 'input',
            name: 'val',
            message: 'Related files (comma separated):',
            default: bug.files ? bug.files.join(', ') : ''
        }]);
        const inputFiles = filesAnswer.val.split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0);
        bug.files = warnMissingFiles(inputFiles);

    } else if (fieldAnswer.field === 'Due Date') {
        const dueDateAnswer = await inquirer.prompt([{
            type: 'input',
            name: 'val',
            message: 'Due date (YYYY-MM-DD, leave empty to clear):',
            default: bug.dueDate || '',
            validate: (input: string) => {
                if (!validateDateStr(input)) return 'Invalid date format. Use YYYY-MM-DD.';
                return true;
            }
        }]);
        bug.dueDate = dueDateAnswer.val.trim() || undefined;
    }

    try {
        await saveBug(bug);
        console.log(chalk.green(`Bug [${bug.id}] updated successfully.`));
    } catch (e: any) {
        const msg = e?.code === 'ENOSPC' ? 'No disk space left.'
                  : e?.code === 'EACCES' ? 'Permission denied writing to .bugbook/.'
                  : e instanceof Error ? e.message
                  : 'Unknown error.';
        console.error(chalk.red(`Error: Could not save bug — ${msg}`));
    }
};
