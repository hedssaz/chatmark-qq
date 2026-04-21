import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer, stopServer } from '../server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = 'http://127.0.0.1:41739';

let mainWindow = null;
let server = null;
let isQuitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 980,
    minHeight: 720,
    autoHideMenuBar: true,
    title: 'chatmark-qq',
    show: false,
    backgroundColor: '#f7f0e5',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(APP_URL);
}

async function bootstrap() {
  server = await startServer({
    logger: (message) => console.log(`[desktop] ${message}`),
  });
  createMainWindow();
}

async function showStartupError(error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  console.error(detail);
  await dialog.showErrorBox('chatmark-qq failed to start', detail);
  await app.quit();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(bootstrap).catch(showStartupError);

  app.on('activate', () => {
    if (!mainWindow) {
      createMainWindow();
    }
  });

  app.on('before-quit', async (event) => {
    if (isQuitting) return;
    isQuitting = true;
    event.preventDefault();
    await stopServer(server).catch(() => {});
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
