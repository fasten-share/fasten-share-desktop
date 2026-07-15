import { afterEach, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = { singleInstanceLock: false };
  const appHandlers = new Map<string, (...args: any[]) => any>();
  const updaterHandlers = new Map<string, (...args: any[]) => any>();
  const ipcHandlers = new Map<string, (...args: any[]) => any>();
  const windows: any[] = [];
  const trays: any[] = [];
  const menuTemplates: any[][] = [];
  const menuItem = { enabled: true, label: 'Check for Updates…' };

  const app = {
    isPackaged: true,
    requestSingleInstanceLock: vi.fn(() => state.singleInstanceLock),
    whenReady: vi.fn(() => new Promise<void>(() => undefined)),
    on: vi.fn((event: string, handler: (...args: any[]) => any) => appHandlers.set(event, handler)),
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp/fasten-user-data'),
    getAppPath: vi.fn(() => '/opt/fasten-share'),
    getLocale: vi.fn(() => 'en-US'),
    getVersion: vi.fn(() => '1.2.3'),
  };

  const BrowserWindow = vi.fn(function (this: any, options: any) {
    const handlers = new Map<string, (...args: any[]) => any>();
    const instance = {
      options,
      handlers,
      removeMenu: vi.fn(),
      loadURL: vi.fn(async () => undefined),
      on: vi.fn((event: string, handler: (...args: any[]) => any) => handlers.set(event, handler)),
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      webContents: { send: vi.fn() },
    };
    windows.push(instance);
    return instance;
  });

  const Tray = vi.fn(function (this: any, iconPath: string) {
    const handlers = new Map<string, (...args: any[]) => any>();
    const instance = {
      iconPath,
      handlers,
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => any) => handlers.set(event, handler)),
      destroy: vi.fn(),
    };
    trays.push(instance);
    return instance;
  });

  const Menu = {
    buildFromTemplate: vi.fn((template: any[]) => {
      menuTemplates.push(template);
      return { getMenuItemById: vi.fn((id: string) => id === 'check-for-updates' ? menuItem : null) };
    }),
  };
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 1 })) };
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => ipcHandlers.set(channel, handler)),
  };
  const shell = { openExternal: vi.fn(async () => undefined) };
  const netFetch = vi.fn(async () => ({ ok: true }));
  const serverProcess = { kill: vi.fn() };
  const utilityProcess = { fork: vi.fn(() => serverProcess) };
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    setFeedURL: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => any) => updaterHandlers.set(event, handler)),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  };

  return {
    state, appHandlers, updaterHandlers, ipcHandlers, windows, trays, menuTemplates, menuItem,
    app, BrowserWindow, Tray, Menu, dialog, ipcMain, shell, netFetch, serverProcess, utilityProcess,
    autoUpdater,
  };
});

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  dialog: mocks.dialog,
  ipcMain: mocks.ipcMain,
  Menu: mocks.Menu,
  net: { fetch: mocks.netFetch },
  shell: mocks.shell,
  Tray: mocks.Tray,
  utilityProcess: mocks.utilityProcess,
}));

vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }));

type MainModule = typeof import('../src/main/index');

export function getMocks() { return mocks; }

export async function loadMain(env: Record<string, string | undefined> = {}): Promise<MainModule> {
  vi.resetModules();
  delete process.env.DEV_URL;
  delete process.env.FASTEN_SHARE_UPDATE_BASE_URL;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../src/main/index');
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process, 'resourcesPath', {
    value: '/opt/fasten-share/resources',
    configurable: true,
  });
  mocks.state.singleInstanceLock = false;
  mocks.appHandlers.clear();
  mocks.updaterHandlers.clear();
  mocks.ipcHandlers.clear();
  mocks.windows.length = 0;
  mocks.trays.length = 0;
  mocks.menuTemplates.length = 0;
  mocks.menuItem.enabled = true;
  mocks.menuItem.label = 'Check for Updates…';
  mocks.app.isPackaged = true;
  mocks.app.whenReady.mockImplementation(() => new Promise<void>(() => undefined));
  mocks.app.getLocale.mockReturnValue('en-US');
  mocks.app.getVersion.mockReturnValue('1.2.3');
  mocks.dialog.showMessageBox.mockResolvedValue({ response: 1 });
  mocks.netFetch.mockResolvedValue({ ok: true });
  mocks.autoUpdater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: false,
    updateInfo: { version: '1.2.3' },
  });
  mocks.autoUpdater.autoDownload = false;
  mocks.autoUpdater.autoInstallOnAppQuit = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

