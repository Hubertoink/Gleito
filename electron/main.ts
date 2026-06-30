import { app, BrowserWindow, Menu, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;

function userDataPath(fileName: string): string {
  return path.join(app.getPath('userData'), fileName);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 720,
    title: 'Gleitzettel',
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

  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});
