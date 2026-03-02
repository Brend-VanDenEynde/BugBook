import inquirer from 'inquirer';
import chalk from 'chalk';
import { generateId, getTags, ensureProjectInit, addBug, Bug, sanitizeInput, addTag, sanitizeTagName, warnMissingFiles, validateDateStr, MAX_INPUT_LENGTH } from '../utils/storage';
import { setupEditor } from '../utils/config';

export const handleAdd = async () => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Bugbook is not initialized in this directory.'));
        console.log(chalk.white('Run "bugbook init" first.'));
        return;
    }

    console.log(chalk.bold.white('\nAdd New Bug Entry'));

    const useEditor = setupEditor();

    // Step 1: Error message
    const errorAnswer = await inquirer.prompt([{
        type: useEditor ? 'editor' : 'input',
        name: 'errorMsg',
        message: 'Bug error message:',
        validate: (input: string) => {
            if (!input.trim()) return 'Error message cannot be empty.';
            return true;
        }
    }] as any);

    // Step 2: Solution
    const solutionAnswer = await inquirer.prompt([{
        type: useEditor ? 'editor' : 'input',
        name: 'solutionMsg',
        message: 'Bug solution:',
    }] as any);

    // Step 3: Priority
    const priorityAnswer = await inquirer.prompt([{
        type: 'list',
        name: 'priority',
        message: 'Priority:',
        choices: [
            { name: 'Low', value: 'Low' },
            { name: 'Medium', value: 'Medium' },
            { name: 'High', value: 'High' }
        ],
        default: 'Medium'
    }] as any);

    // Step 4: Related files
    const filesAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'files',
        message: 'Related files (comma separated, optional):'
    }]);

    // Step 5: Tag
    const tags = await getTags();
    const tagChoices = [
        ...tags.map(t => ({ name: t, value: t })),
        { name: '── Create new tag ──', value: '__new_tag__' }
    ];

    const tagAnswer = await inquirer.prompt([{
        type: 'list',
        name: 'tag',
        message: 'Select a category/tag:',
        choices: tagChoices,
        pageSize: 10
    }] as any);

    let selectedTag = tagAnswer.tag;

    if (selectedTag === '__new_tag__') {
        const newTagAnswer = await inquirer.prompt([{
            type: 'input',
            name: 'newTagName',
            message: 'Enter new tag name:'
        }]);

        const sanitized = sanitizeTagName(newTagAnswer.newTagName);
        if (sanitized) {
            const result = await addTag(sanitized);
            if (result.success) {
                console.log(chalk.green(result.message));
            }
            selectedTag = sanitized;
        } else {
            selectedTag = 'General';
            console.log(chalk.white('Invalid tag name, using "General".'));
        }
    }

    const inputFiles = filesAnswer.files ? filesAnswer.files.split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0) : [];
    const files = warnMissingFiles(inputFiles);

    // Step 6: Due date (optional)
    const dueDateAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'dueDate',
        message: 'Due date (YYYY-MM-DD, leave empty to skip):',
        validate: (input: string) => {
            if (!validateDateStr(input)) return 'Invalid date format. Use YYYY-MM-DD.';
            return true;
        }
    }]);

    const newBug: Bug = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        category: selectedTag,
        error: sanitizeInput(errorAnswer.errorMsg),
        solution: sanitizeInput(solutionAnswer.solutionMsg),
        status: 'Open',
        priority: priorityAnswer.priority,
        files: files,
        dueDate: dueDateAnswer.dueDate.trim() || undefined
    };

    try {
        await addBug(newBug);
        console.log(chalk.green(`\n✔ Bug added successfully!`));
        console.log(chalk.white(`ID: ${newBug.id}`));
    } catch (e: any) {
        const msg = e?.code === 'ENOSPC' ? 'No disk space left.'
                  : e?.code === 'EACCES' ? 'Permission denied writing to .bugbook/.'
                  : e instanceof Error ? e.message
                  : 'Unknown error.';
        console.error(chalk.red(`Error: Could not save bug — ${msg}`));
    }
};
