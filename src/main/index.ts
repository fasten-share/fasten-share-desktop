/**
 * Electron main-process bootstrap for the desktop shell.
 *
 * Production runs the standalone Next.js server on a local port. Development
 * points the window at the Next.js development server configured by DEV_URL.
 */
import { app } from 'electron';
import { configureLanguageBridge } from './desktop-language';
import { startNextServer, stopNextServer } from './embedded-server';
import { beginAppQuit, createWindow, getMainWindow, showWindow } from './main-window';
import { configureTrayActions, createTray, destroyTray } from './tray';
import {
  checkForUpdates,
  clearUpdateInstallTimeout,
  configureAutoUpdater,
} from './updater';

export {
  configureLanguageBridge,
  getDesktopLanguage,
  setDesktopLanguage,
} from './desktop-language';
export { findFreePort, startNextServer, waitForServer } from './embedded-server';
export { createWindow, showWindow } from './main-window';
export { createTray } from './tray';
export {
  checkForUpdates,
  configureAutoUpdater,
  getUpdateChannel,
  installDownloadedUpdate,
  showUpdateDialog,
} from './updater';

const DEV_URL = process.env.DEV_URL;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

configureTrayActions({
  showWindow,
  checkForUpdates: () => void checkForUpdates(true),
  quit: () => {
    beginAppQuit();
    app.quit();
  },
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    const url = DEV_URL ?? (await startNextServer());
    configureLanguageBridge();
    createWindow(url);
    configureAutoUpdater();
    createTray();
    setTimeout(() => void checkForUpdates(), 15_000);
    setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);

    app.on('activate', () => {
      if (!getMainWindow()) createWindow(url);
      else showWindow();
    });
  });
}

app.on('before-quit', () => {
  beginAppQuit();
  clearUpdateInstallTimeout();
});

app.on('quit', () => {
  clearUpdateInstallTimeout();
  destroyTray();
  stopNextServer();
});
