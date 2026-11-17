const { app, BrowserWindow, screen, session, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
    // ── Dynamic Resolution: read the user's actual monitor ──
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const mainWindow = new BrowserWindow({
        width,
        height,
        fullscreen: true,
        frame: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // ── Auto-grant camera/microphone permissions ──
    session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback) => {
            if (permission === 'media') {
                callback(true);
            } else {
                callback(false);
            }
        }
    );

    // ── IPC: expose screen info to renderer ──
    ipcMain.handle('get-screen-size', () => {
        const display = screen.getPrimaryDisplay();
        return display.size;
    });

    // ── IPC: quit app ──
    ipcMain.on('quit-app', () => {
        app.quit();
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Open DevTools only in dev mode
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Handle ESC in fullscreen
    mainWindow.on('close', () => {
        app.quit();
    });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
