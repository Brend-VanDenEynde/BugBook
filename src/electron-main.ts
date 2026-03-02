import { app, BrowserWindow, shell, Menu } from 'electron';
import type http from 'http';
import { startServer } from './commands/serve';
import { ensureProjectInit } from './utils/storage';

// ---------------------------------------------------------------------------
// The CLI handler passes the project directory via this env var so that
// the storage utils (which use process.cwd()) resolve .bugbook/ correctly.
// ---------------------------------------------------------------------------
const PROJECT_CWD = process.env.BUGBOOK_CWD;
if (PROJECT_CWD) {
    try {
        process.chdir(PROJECT_CWD);
    } catch {
        console.error(`Could not change to project directory: ${PROJECT_CWD}`);
    }
}

// ---------------------------------------------------------------------------
// Create the main window
// ---------------------------------------------------------------------------
function createWindow(port: number): BrowserWindow {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Bugbook',
        backgroundColor: '#0d1117',  // match the app's dark background — prevents white flash
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        // Show window only once content is ready (no white flash)
        show: false,
    });

    // Remove default menu bar (File, Edit, View, …)
    Menu.setApplicationMenu(null);

    win.loadURL(`http://localhost:${port}`);

    // Show as soon as the page has painted its first frame
    win.once('ready-to-show', () => win.show());

    // F12 → toggle DevTools (useful for debugging)
    win.webContents.on('before-input-event', (_event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
            win.webContents.toggleDevTools();
        }
    });

    // Open external links (github issue URLs) in the real browser, not Electron
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(`http://localhost:${port}`)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    return win;
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
    if (!ensureProjectInit()) {
        const { dialog } = await import('electron');
        await dialog.showErrorBox(
            'Bugbook — Not initialised',
            'No .bugbook directory found in:\n' + process.cwd() +
            '\n\nRun "bugbook init" in your project folder first.'
        );
        app.quit();
        return;
    }

    // Pass port 0 so the OS assigns a free port atomically — eliminates the race
    // condition of a two-step find-then-bind approach.
    let server: http.Server;
    try {
        server = await startServer(0, false); // log=false: no console noise inside Electron
    } catch (err) {
        console.error('Failed to start internal server:', err);
        app.quit();
        return;
    }

    const port = (server.address() as { port: number }).port;
    createWindow(port);

    // macOS: re-create window when dock icon is clicked and no windows are open
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(port);
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
