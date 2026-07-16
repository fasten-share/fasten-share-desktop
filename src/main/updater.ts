import { app, dialog, shell } from 'electron';
import type { MessageBoxOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getMessages } from './desktop-language';
import { getMainWindow, isAppQuitting } from './main-window';
import { setUpdateCheckInFlight } from './tray';

const DEV_URL = process.env.DEV_URL;
const UPDATE_BASE_URL = process.env.FASTEN_SHARE_UPDATE_BASE_URL || 'https://www.fastenshare.com/download';
const DOWNLOAD_PAGE_URL = 'https://www.fastenshare.com/download/';
const UPDATE_INSTALL_TIMEOUT_MS = 30_000;

let updateCheckInFlight = false;
let updateInstallTimeout: ReturnType<typeof setTimeout> | undefined;
let hasAttemptedUpdateInstall = false;

export async function showUpdateDialog(options: MessageBoxOptions): Promise<void> {
  const window = getMainWindow();
  if (window) await dialog.showMessageBox(window, options);
  else await dialog.showMessageBox(options);
}

export function clearUpdateInstallTimeout(): void {
  if (!updateInstallTimeout) return;
  clearTimeout(updateInstallTimeout);
  updateInstallTimeout = undefined;
}

async function showUpdateInstallFallback(): Promise<void> {
  if (isAppQuitting()) return;
  const messages = getMessages().update;
  const options: MessageBoxOptions = {
    type: 'error',
    buttons: [messages.openDownloadPage, messages.cancel],
    defaultId: 0,
    cancelId: 1,
    title: messages.automaticUpdateFailed,
    message: messages.automaticUpdateFailedMessage,
    detail: messages.manualInstall,
  };
  const window = getMainWindow();
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  if (result.response === 0) await shell.openExternal(DOWNLOAD_PAGE_URL);
}

export function installDownloadedUpdate(): void {
  if (hasAttemptedUpdateInstall) {
    clearUpdateInstallTimeout();
    void showUpdateInstallFallback();
    return;
  }
  hasAttemptedUpdateInstall = true;
  clearUpdateInstallTimeout();
  updateInstallTimeout = setTimeout(() => {
    updateInstallTimeout = undefined;
    void showUpdateInstallFallback();
  }, UPDATE_INSTALL_TIMEOUT_MS);
  updateInstallTimeout.unref?.();
  autoUpdater.quitAndInstall(false, true);
}

export function getUpdateChannel(): { dir: string } | null {
  if (process.platform === 'win32') return { dir: 'windows' };
  if (process.platform === 'darwin') return { dir: 'macos' };
  if (process.platform === 'linux') return { dir: 'linux' };
  return null;
}

export function configureAutoUpdater(): void {
  const channel = getUpdateChannel();
  if (!channel || DEV_URL || !app.isPackaged) return;

  const baseUrl = UPDATE_BASE_URL.replace(/\/+$/, '');
  autoUpdater.setFeedURL({ provider: 'generic', url: `${baseUrl}/${channel.dir}` });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    console.warn('[update] check failed', error);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    if (hasAttemptedUpdateInstall) {
      clearUpdateInstallTimeout();
      await showUpdateInstallFallback();
      return;
    }
    const messages = getMessages().update;
    const options: MessageBoxOptions = {
      type: 'info',
      buttons: [messages.restartNow, messages.later],
      defaultId: 0,
      cancelId: 1,
      title: messages.ready,
      message: messages.downloaded(info.version),
      detail: messages.restartToFinish,
    };
    const window = getMainWindow();
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) installDownloadedUpdate();
  });
}

export async function checkForUpdates(notifyUser = false): Promise<void> {
  const messages = getMessages();
  if (DEV_URL || !app.isPackaged) {
    if (notifyUser) {
      await showUpdateDialog({
        type: 'info',
        title: messages.update.checkForUpdates,
        message: messages.update.developmentUnavailable,
        detail: messages.update.installProductionBuild,
      });
    }
    return;
  }
  if (hasAttemptedUpdateInstall) {
    clearUpdateInstallTimeout();
    await showUpdateInstallFallback();
    return;
  }
  if (updateCheckInFlight) return;

  updateCheckInFlight = true;
  setUpdateCheckInFlight(true);
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!notifyUser) return;

    if (result?.isUpdateAvailable) {
      await showUpdateDialog({
        type: 'info',
        title: messages.update.newVersionAvailable,
        message: messages.update.downloading(result.updateInfo.version),
        detail: `${messages.update.currentVersion(app.getVersion())}\n\n${messages.update.restartPrompt}`,
      });
    } else {
      await showUpdateDialog({
        type: 'info',
        title: messages.update.checkForUpdates,
        message: messages.update.latestVersion,
        detail: messages.update.currentVersion(app.getVersion()),
      });
    }
  } catch (error) {
    console.warn('[update] check failed', error);
    if (notifyUser) {
      await showUpdateDialog({
        type: 'error',
        title: messages.update.checkFailed,
        message: messages.update.temporarilyUnavailable,
        detail: messages.update.checkNetwork,
      });
    }
  } finally {
    updateCheckInFlight = false;
    setUpdateCheckInFlight(false);
  }
}
