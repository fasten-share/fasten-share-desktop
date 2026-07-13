/**
 * Fasten Share desktop — Electron shell that runs the Next.js client as an
 * embedded Node server.
 *
 * The client (`fasten-share-client`) is a Next.js app built with
 * `output: 'standalone'`. In production this shell spawns its `server.js`
 * (Next's own Node server) on a free local port and points the window at it; in
 * development it loads the running `next dev` server. The shell relaxes the
 * same-origin policy so the renderer can fetch LLM backends directly. See
 * DESIGN §3.1 / §10.
 */
import { join } from 'node:path';
import { createServer } from 'node:net';
import { app, BrowserWindow, dialog, Menu, net, Tray, utilityProcess } from 'electron';
import type { MenuItem, MessageBoxOptions, UtilityProcess } from 'electron';
import { autoUpdater } from 'electron-updater';

// In dev, point at the running `next dev` server (see package.json `dev`).
const DEV_URL = process.env.DEV_URL;

// In prod the standalone bundle is shipped unpacked as an extraResource.
const SERVER_DIR = join(process.resourcesPath, 'server-dist');
const SERVER_ENTRY = join(SERVER_DIR, 'server.js');
const UPDATE_BASE_URL = process.env.FASTEN_SHARE_UPDATE_BASE_URL || 'https://www.fastenshare.com/download';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let win: BrowserWindow | undefined;
let tray: Tray | undefined;
let checkForUpdatesMenuItem: MenuItem | undefined;
let serverProc: UtilityProcess | undefined;
let updateCheckInFlight = false;
let isQuitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

/** Ask the OS for a free TCP port on the loopback interface. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Poll the server until it answers (or time out). */
async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await net.fetch(url);
      return; // any HTTP response means it's listening
    } catch {
      if (Date.now() > deadline) throw new Error('Next server did not start in time');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

/** Spawn the standalone Next server and resolve once it's reachable. */
async function startNextServer(): Promise<string> {
  const port = await findFreePort();
  serverProc = utilityProcess.fork(SERVER_ENTRY, [], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      // Persist node config under the app's userData dir (writable).
      FS_DATA_DIR: app.getPath('userData'),
    },
  });
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  return url;
}

function createWindow(url: string): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Fasten Share',
    // No webSecurity override needed: the renderer only talks to its own
    // same-origin Next server (UI + control API + proxy). All LLM forwarding
    // now happens in the Node server, not the browser.
  });
  win.removeMenu();
  void win.loadURL(url);
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win?.hide();
  });
  win.on('closed', () => {
    win = undefined;
  });
}

function showWindow(): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray(): void {
  const iconPath = join(app.getAppPath(), 'build', 'icons', 'icon-32.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Fasten Share');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 Fasten Share',
      click: showWindow,
    },
    {
      id: 'check-for-updates',
      label: '检查更新…',
      click: () => void checkForUpdates(true),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  checkForUpdatesMenuItem = contextMenu.getMenuItemById('check-for-updates') ?? undefined;
  tray.setContextMenu(contextMenu);
  tray.on('click', showWindow);
}

async function showUpdateDialog(options: MessageBoxOptions): Promise<void> {
  if (win && !win.isDestroyed()) await dialog.showMessageBox(win, options);
  else await dialog.showMessageBox(options);
}

function getUpdateChannel(): { dir: string } | null {
  if (process.platform === 'win32') return { dir: 'windows' };
  if (process.platform === 'darwin') return { dir: 'macos' };
  if (process.platform === 'linux') return { dir: 'linux' };
  return null;
}

function configureAutoUpdater(): void {
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
    const options: MessageBoxOptions = {
      type: 'info',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
      title: 'Fasten Share 更新已就绪',
      message: `Fasten Share ${info.version} 已下载完成。`,
      detail: '重启 Fasten Share 即可完成更新。',
    };
    const result = win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });
}

async function checkForUpdates(notifyUser = false): Promise<void> {
  if (DEV_URL || !app.isPackaged) {
    if (notifyUser) {
      await showUpdateDialog({
        type: 'info',
        title: '检查更新',
        message: '开发环境不支持检查更新。',
        detail: '请安装正式打包版本后再试。',
      });
    }
    return;
  }
  if (updateCheckInFlight) return;

  updateCheckInFlight = true;
  if (checkForUpdatesMenuItem) {
    checkForUpdatesMenuItem.enabled = false;
    checkForUpdatesMenuItem.label = '正在检查更新…';
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!notifyUser) return;

    if (result?.isUpdateAvailable) {
      await showUpdateDialog({
        type: 'info',
        title: '发现新版本',
        message: `Fasten Share ${result.updateInfo.version} 正在下载。`,
        detail: '下载完成后会提示你重启并安装。',
      });
    } else {
      await showUpdateDialog({
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本。',
        detail: `当前版本：${app.getVersion()}`,
      });
    }
  } catch (error) {
    console.warn('[update] check failed', error);
    if (notifyUser) {
      await showUpdateDialog({
        type: 'error',
        title: '检查更新失败',
        message: '暂时无法检查更新。',
        detail: '请检查网络连接后重试。',
      });
    }
  } finally {
    updateCheckInFlight = false;
    if (checkForUpdatesMenuItem) {
      checkForUpdatesMenuItem.enabled = true;
      checkForUpdatesMenuItem.label = '检查更新…';
    }
  }
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    const url = DEV_URL ?? (await startNextServer());
    createWindow(url);
    configureAutoUpdater();
    createTray();
    setTimeout(() => void checkForUpdates(), 15_000);
    setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);

    app.on('activate', () => {
      if (!win || win.isDestroyed()) createWindow(url);
      else showWindow();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// Make sure the embedded server doesn't outlive the app.
app.on('quit', () => {
  tray?.destroy();
  serverProc?.kill();
});
