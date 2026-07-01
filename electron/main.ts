import { app, BrowserWindow, Menu, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { autoUpdater } from 'electron-updater';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;
let updateCheckInFlight = false;

app.setPath('sessionData', path.join(app.getPath('userData'), 'session-data'));

function sendUpdateStatus(payload: Record<string, unknown>) {
  mainWindow?.webContents.send('update:status', payload);
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateCheckInFlight = true;
    sendUpdateStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    updateCheckInFlight = false;
    sendUpdateStatus({ state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    updateCheckInFlight = false;
    sendUpdateStatus({ state: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ state: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (error) => {
    updateCheckInFlight = false;
    sendUpdateStatus({ state: 'error', message: error?.message ?? 'Update fehlgeschlagen' });
  });
}

function userDataPath(fileName: string): string {
  return path.join(app.getPath('userData'), fileName);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 720,
    title: 'Gleito - Gleitzettel',
    icon: path.join(app.getAppPath(), 'assets', 'Logo.ico'),
    backgroundColor: '#f7f7f3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configureAutoUpdater();

  ipcMain.handle('db:load', () => {
    const dbPath = userDataPath('gleitzettel.sqlite');
    if (!existsSync(dbPath)) return null;
    return readFileSync(dbPath);
  });

  ipcMain.handle('db:save', (_event, bytes: Uint8Array) => {
    const dbPath = userDataPath('gleitzettel.sqlite');
    mkdirSync(path.dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, Buffer.from(bytes));
    return dbPath;
  });

  ipcMain.handle('backup:export', async (_event, bytes: Uint8Array, suggestedName: string) => {
    const owner = mainWindow ?? undefined;
    const options = {
      title: 'Daten exportieren',
      defaultPath: suggestedName,
      filters: [{ name: 'Gleitzettel Backup', extensions: ['gleito'] }]
    };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    writeFileSync(result.filePath, Buffer.from(bytes));
    return result.filePath;
  });

  ipcMain.handle('backup:import', async () => {
    const owner = mainWindow ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Daten importieren',
      filters: [{ name: 'Gleitzettel Backup', extensions: ['gleito', 'sqlite'] }],
      properties: ['openFile']
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return readFileSync(result.filePaths[0]);
  });

  ipcMain.handle('pdf:export', async (_event, html: string, suggestedName: string) => {
    const owner = mainWindow ?? undefined;
    const options = {
      title: 'Monat als PDF exportieren',
      defaultPath: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

    const printWindow = new BrowserWindow({
      show: false,
      width: 1120,
      height: 1584,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true
    });
    writeFileSync(result.filePath, pdf);
    printWindow.close();
    return result.filePath;
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { supported: false, reason: 'not-packaged' };
    if (updateCheckInFlight) return { supported: true, started: false };
    updateCheckInFlight = true;
    void autoUpdater.checkForUpdates();
    return { supported: true, started: true };
  });
  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) return { supported: false, started: false };
    await autoUpdater.downloadUpdate();
    return { supported: true, started: true };
  });
  ipcMain.handle('update:install', () => {
    if (!app.isPackaged) return { supported: false };
    setImmediate(() => autoUpdater.quitAndInstall());
    return { supported: true };
  });

  await createWindow();
  if (app.isPackaged) {
    void autoUpdater.checkForUpdates();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});
