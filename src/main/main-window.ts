import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { onDesktopLanguageChanged } from './desktop-language';
import { DESKTOP_LANGUAGE_CHANNELS } from './language-bridge';

let mainWindow: BrowserWindow | undefined;
let appIsQuitting = false;

onDesktopLanguageChanged((language) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(DESKTOP_LANGUAGE_CHANNELS.changed, language);
});

export function getMainWindow(): BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
}

export function createWindow(url: string): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Fasten Share',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.removeMenu();
  const openExternal = (targetUrl: string): void => {
    // Explicit new-window links belong in the user's default app.
    if (!targetUrl.startsWith('mailto:') && !/^https?:\/\//i.test(targetUrl)) return;
    void shell.openExternal(targetUrl);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    openExternal(targetUrl);
    return { action: 'deny' };
  });
  void mainWindow.loadURL(url);
  mainWindow.on('close', (event) => {
    if (appIsQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

export function showWindow(): void {
  const window = getMainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

export function beginAppQuit(): void {
  appIsQuitting = true;
}

export function isAppQuitting(): boolean {
  return appIsQuitting;
}
