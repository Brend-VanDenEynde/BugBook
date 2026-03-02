import { app, BrowserWindow, shell, Menu } from 'electron';
import net from 'net';
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
// Find a free port (let the OS pick one on port 0, then release and use it)
// ---------------------------------------------------------------------------
function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = addr && typeof addr === 'object' ? addr.port : 0;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
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

    let port: number;
    try {
        port = await findFreePort();
    } catch (err) {
        console.error('Could not find a free port:', err);
        app.quit();
        return;
    }

    try {
        await startServer(port, false); // log=false: no console noise inside Electron
    } catch (err) {
        console.error('Failed to start internal server:', err);
        app.quit();
        return;
    }

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
