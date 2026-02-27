import chalk from 'chalk';
import { getBugs, getOverdueBugs, ensureProjectInit } from '../utils/storage';

export const handleStats = async (argStr: string = '') => {
    if (!ensureProjectInit()) {
        console.error(chalk.red('Error: Project not initialized.'));
        return;
    }

    const jsonFormat = argStr.includes('--format json');

    const bugs = await getBugs();
    const totalBugs = bugs.length;

    if (totalBugs === 0) {
        if (jsonFormat) {
            console.log(JSON.stringify({ total: 0, open: 0, resolved: 0, overdue: 0, byPriority: {}, byCategory: {} }, null, 2));
        } else {
            console.log(chalk.white('No bugs recorded yet.'));
        }
        return;
    }

    const openBugs = bugs.filter(b => b.status === 'Open').length;
    const resolvedBugs = bugs.filter(b => b.status === 'Resolved').length;
    const overdueBugs = getOverdueBugs(bugs).length;

    const categoryCounts: Record<string, number> = {};
    bugs.forEach(b => {
        const cat = b.category || 'Uncategorized';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const priorityCounts: Record<string, number> = {};
    bugs.forEach(b => {
        const p = b.priority || 'None';
        priorityCounts[p] = (priorityCounts[p] || 0) + 1;
    });

    if (jsonFormat) {
        console.log(JSON.stringify({
            total: totalBugs,
            open: openBugs,
            resolved: resolvedBugs,
            overdue: overdueBugs,
            byPriority: priorityCounts,
            byCategory: categoryCounts
        }, null, 2));
        return;
    }

    const sortedCategories = Object.entries(categoryCounts)
        .sort(([, a], [, b]) => b - a);

    console.log(chalk.bold.white('\nBugbook Statistics\n'));
    console.log(chalk.white('--------------------------------------------------'));

    console.log(`${chalk.bold.white('Total Bugs:')}     ${totalBugs}`);
    console.log(`${chalk.bold.white('Open:')}           ${openBugs}`);
    console.log(`${chalk.bold.white('Resolved:')}       ${resolvedBugs}`);
    if (overdueBugs > 0) {
        console.log(`${chalk.bold.red('Overdue:')}        ${overdueBugs}`);
    }

    console.log(chalk.white('--------------------------------------------------'));
    console.log(chalk.bold.white('Top Categories:'));

    if (sortedCategories.length === 0) {
        console.log(chalk.white('  No categories found.'));
    } else {
        sortedCategories.forEach(([category, count]) => {
            console.log(`  ${category}: ${count}`);
        });
    }
    console.log(chalk.white('--------------------------------------------------\n'));
};
