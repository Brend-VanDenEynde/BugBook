import chalk from 'chalk';
import { getBugs, displayBugs, getOverdueBugs, DEFAULT_LIST_COUNT, Bug, BugPriority, BugStatus } from '../utils/storage';

interface ListOptions {
    priority?: BugPriority;
    status?: BugStatus;
    tagged?: string;
    author?: string;
    sort?: 'priority' | 'date' | 'status' | 'dueDate' | 'id';
    order?: 'asc' | 'desc';
    limit?: number;
    hasFilters: boolean;
    format?: 'json';
}

const parseListArgs = (argStr: string): ListOptions => {
    const options: ListOptions = {
        hasFilters: false
    };

    const parts = argStr.trim().split(/\s+/).filter(p => p);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part === '--priority' && parts[i + 1]) {
            const priority = parts[i + 1];
            if (priority === 'High' || priority === 'Medium' || priority === 'Low') {
                options.priority = priority;
                options.hasFilters = true;
            }
            i++;
        } else if (part === '--status' && parts[i + 1]) {
            const status = parts[i + 1];
            if (status === 'Open' || status === 'Resolved') {
                options.status = status;
                options.hasFilters = true;
            }
            i++;
        } else if (part === '--tagged' && parts[i + 1]) {
            options.tagged = parts[i + 1];
            options.hasFilters = true;
            i++;
        } else if (part === '--author' && parts[i + 1]) {
            options.author = parts[i + 1];
            options.hasFilters = true;
            i++;
        } else if (part === '--sort' && parts[i + 1]) {
            const sort = parts[i + 1];
            if (['priority', 'date', 'status', 'dueDate', 'id'].includes(sort)) {
                options.sort = sort as ListOptions['sort'];
            }
            i++;
        } else if (part === '--order' && parts[i + 1]) {
            const order = parts[i + 1];
            if (order === 'asc' || order === 'desc') {
                options.order = order;
            }
            i++;
        } else if (part === '--limit' && parts[i + 1]) {
            const limit = parseInt(parts[i + 1], 10);
            if (!isNaN(limit) && limit > 0) {
                options.limit = limit;
            }
            i++;
        } else if (part === '--format' && parts[i + 1] === 'json') {
            options.format = 'json';
            i++;
        }
    }

    return options;
};

const priorityValue = (priority?: BugPriority): number => {
    if (priority === 'High') return 3;
    if (priority === 'Medium') return 2;
    if (priority === 'Low') return 1;
    return 0; // No priority
};

const sortBugs = (bugs: Bug[], sortBy?: string, order?: 'asc' | 'desc'): Bug[] => {
    if (!sortBy) {
        // Default: sort by timestamp descending (newest first)
        return [...bugs].sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeB - timeA;
        });
    }

    const sorted = [...bugs];

    sorted.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
            case 'priority':
                comparison = priorityValue(a.priority) - priorityValue(b.priority);
                break;
            case 'date':
                comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                break;
            case 'status':
                comparison = a.status.localeCompare(b.status);
                break;
            case 'dueDate':
                if (a.dueDate && b.dueDate) {
                    comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                } else if (a.dueDate) {
                    comparison = -1;
                } else if (b.dueDate) {
                    comparison = 1;
                }
                break;
            case 'id':
                comparison = a.id.localeCompare(b.id);
                break;
        }

        return comparison;
    });

    // Apply order (default is desc for most fields, asc for dueDate)
    const defaultOrder = sortBy === 'dueDate' ? 'asc' : 'desc';
    const finalOrder = order || defaultOrder;

    if (finalOrder === 'desc') {
        sorted.reverse();
    }

    return sorted;
};

export const handleList = async (argStr: string = '') => {
    const allBugs = await getBugs();
    const options = parseListArgs(argStr);

    if (allBugs.length === 0) {
        if (options.format === 'json') {
            console.log('[]');
        } else {
            console.log(chalk.white('No bugs found.'));
        }
        return;
    }

    let filtered = allBugs;

    // Apply filters
    if (options.priority) {
        filtered = filtered.filter(b => b.priority === options.priority);
    }
    if (options.status) {
        filtered = filtered.filter(b => b.status === options.status);
    }
    if (options.tagged) {
        filtered = filtered.filter(b =>
            b.category.toLowerCase() === options.tagged!.toLowerCase()
        );
    }
    if (options.author) {
        filtered = filtered.filter(b =>
            b.author?.toLowerCase().includes(options.author!.toLowerCase())
        );
    }

    if (filtered.length === 0) {
        if (options.format === 'json') {
            console.log('[]');
        } else {
            console.log(chalk.yellow('No bugs match the specified filters.'));
        }
        return;
    }

    // Apply sorting
    const sorted = sortBugs(filtered, options.sort, options.order);

    // Apply limit
    let displayed: Bug[];
    if (options.hasFilters) {
        // With filters, show all matching bugs unless limit specified
        displayed = options.limit ? sorted.slice(0, options.limit) : sorted;
    } else {
        // Without filters, show last N (backward compatible)
        const limit = options.limit || DEFAULT_LIST_COUNT;
        displayed = sorted.slice(-limit);
    }

    // JSON output short-circuit
    if (options.format === 'json') {
        console.log(JSON.stringify(displayed, null, 2));
        return;
    }

    // Display header with counts and active filters
    const filterInfo: string[] = [];
    if (options.priority) filterInfo.push(`Priority: ${options.priority}`);
    if (options.status) filterInfo.push(`Status: ${options.status}`);
    if (options.tagged) filterInfo.push(`Tagged: ${options.tagged}`);
    if (options.author) filterInfo.push(`Author: ${options.author}`);
    if (options.sort) filterInfo.push(`Sort: ${options.sort} (${options.order || (options.sort === 'dueDate' ? 'asc' : 'desc')})`);

    if (filterInfo.length > 0) {
        console.log(chalk.bold.white(`\nFilters: ${filterInfo.join(', ')}`));
        console.log(chalk.bold.white(`Showing ${displayed.length} of ${filtered.length} matching bug(s):\n`));
    } else {
        console.log(chalk.bold.white(`\nShowing last ${displayed.length} entry(s):\n`));
    }

    displayBugs(displayed);

    // Overdue warnings (only for displayed bugs)
    const overdue = getOverdueBugs(displayed);
    if (overdue.length > 0) {
        console.log(chalk.red.bold(`\n⚠️  ${overdue.length} overdue bug(s):`));
        overdue.forEach(b => {
            console.log(chalk.red(`  - [${b.id}] Due: ${b.dueDate} — ${b.error.substring(0, 40)}${b.error.length > 40 ? '...' : ''}`));
        });
        console.log('');
    }
};
