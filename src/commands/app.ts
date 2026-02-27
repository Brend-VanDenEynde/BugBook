import { spawn } from 'child_process';
import path from 'path';
import { ensureProjectInit } from '../utils/storage';

export const handleApp = async (_args: string[]): Promise<void> => {
    if (!ensureProjectInit()) {
        console.error('Bugbook is not initialized in this directory. Run "bugbook init" first.');
        return;
    }

    // The `electron` package exports the path to the electron binary when required from Node.js
    let electronBin: string;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        electronBin = String(require('electron'));
    } catch {
        console.error('Electron is not installed. Run "npm install" to install dependencies.');
        return;
    }

    // electron-main.js is compiled from src/electron-main.ts → dist/electron-main.js
    const mainScript = path.join(__dirname, '../electron-main.js');

    console.log('Opening Bugbook...');

    const child = spawn(electronBin, [mainScript], {
        stdio: 'inherit',
        env: {
            ...process.env,
            // Tell the Electron main process which directory to use for .bugbook/
            BUGBOOK_CWD: process.cwd(),
        },
    });

    child.on('error', (err: Error) => {
        console.error('Failed to launch Bugbook window:', err.message);
    });

    // Keep the CLI process alive until the window is closed
    await new Promise<void>((resolve) => {
        child.on('close', () => resolve());
    });
};
