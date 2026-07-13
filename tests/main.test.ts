import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = { singleInstanceLock: false };
  const appHandlers = new Map<string, (...args: any[]) => any>();
  const updaterHandlers = new Map<string, (...args: any[]) => any>();
  const windows: any[] = [];
  const trays: any[] = [];
  const menuTemplates: any[][] = [];
  const menuItem = { enabled: true, label: '检查更新…' };

  const app = {
    isPackaged: true,
    requestSingleInstanceLock: vi.fn(() => state.singleInstanceLock),
    whenReady: vi.fn(() => new Promise<void>(() => undefined)),
    on: vi.fn((event: string, handler: (...args: any[]) => any) => appHandlers.set(event, handler)),
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp/fasten-user-data'),
    getAppPath: vi.fn(() => '/opt/fasten-share'),
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
    state, appHandlers, updaterHandlers, windows, trays, menuTemplates, menuItem,
    app, BrowserWindow, Tray, Menu, dialog, netFetch, serverProcess, utilityProcess, autoUpdater,
  };
});

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  dialog: mocks.dialog,
  Menu: mocks.Menu,
  net: { fetch: mocks.netFetch },
  Tray: mocks.Tray,
  utilityProcess: mocks.utilityProcess,
}));

vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }));

type MainModule = typeof import('../src/main/index');

async function loadMain(env: Record<string, string | undefined> = {}): Promise<MainModule> {
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
  mocks.windows.length = 0;
  mocks.trays.length = 0;
  mocks.menuTemplates.length = 0;
  mocks.menuItem.enabled = true;
  mocks.menuItem.label = '检查更新…';
  mocks.app.isPackaged = true;
  mocks.app.whenReady.mockImplementation(() => new Promise<void>(() => undefined));
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

describe('embedded Next server', () => {
  it('allocates a usable loopback TCP port', async () => {
    const main = await loadMain();
    const port = await main.findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65_535);
  });

  it('returns immediately when the server responds', async () => {
    const main = await loadMain();
    await expect(main.waitForServer('http://127.0.0.1:1234')).resolves.toBeUndefined();
    expect(mocks.netFetch).toHaveBeenCalledWith('http://127.0.0.1:1234');
  });

  it('retries transient failures and eventually succeeds', async () => {
    vi.useFakeTimers();
    mocks.netFetch.mockRejectedValueOnce(new Error('not ready')).mockResolvedValueOnce({ ok: true });
    const main = await loadMain();
    const waiting = main.waitForServer('http://local/');
    await vi.advanceTimersByTimeAsync(200);
    await expect(waiting).resolves.toBeUndefined();
    expect(mocks.netFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects after the startup timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    mocks.netFetch.mockRejectedValue(new Error('offline'));
    const main = await loadMain();
    const waiting = main.waitForServer('http://local/', 1);
    const assertion = expect(waiting).rejects.toThrow('Next server did not start in time');
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it('forks the packaged server with production paths and environment', async () => {
    const main = await loadMain();
    const url = await main.startNextServer();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const [entry, args, options] = mocks.utilityProcess.fork.mock.calls.at(-1)!;
    expect(entry).toMatch(/server-dist\/server\.js$/);
    expect(args).toEqual([]);
    expect(options).toMatchObject({
      cwd: expect.stringMatching(/server-dist$/),
      stdio: 'inherit',
      env: expect.objectContaining({
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        FS_DATA_DIR: '/tmp/fasten-user-data',
      }),
    });
    expect(options.env.PORT).toMatch(/^\d+$/);
    expect(mocks.netFetch).toHaveBeenCalledWith(url);
  });
});

describe('window and tray lifecycle', () => {
  it('creates the main window and hides it instead of closing', async () => {
    const main = await loadMain();
    main.createWindow('http://desktop/');
    const window = mocks.windows[0];
    expect(window.options).toMatchObject({ width: 1100, height: 760, title: 'Fasten Share' });
    expect(window.removeMenu).toHaveBeenCalledOnce();
    expect(window.loadURL).toHaveBeenCalledWith('http://desktop/');

    const event = { preventDefault: vi.fn() };
    window.handlers.get('close')!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(window.hide).toHaveBeenCalledOnce();
  });

  it('restores, shows, and focuses a minimized window', async () => {
    const main = await loadMain();
    main.createWindow('http://desktop/');
    const window = mocks.windows[0];
    window.isMinimized.mockReturnValue(true);
    main.showWindow();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('does nothing when a window is absent, destroyed, or already closed', async () => {
    const main = await loadMain();
    main.showWindow();
    main.createWindow('http://desktop/');
    const window = mocks.windows[0];
    window.isDestroyed.mockReturnValue(true);
    main.showWindow();
    window.handlers.get('closed')!();
    main.showWindow();
    expect(window.show).not.toHaveBeenCalled();
  });

  it('allows a real close after before-quit', async () => {
    const main = await loadMain();
    main.createWindow('http://desktop/');
    mocks.appHandlers.get('before-quit')!();
    const event = { preventDefault: vi.fn() };
    mocks.windows[0].handlers.get('close')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('builds a functional tray menu and supports tray click and exit', async () => {
    const main = await loadMain();
    main.createWindow('http://desktop/');
    main.createTray();
    const tray = mocks.trays[0];
    const template = mocks.menuTemplates[0];
    expect(tray.iconPath).toBe('/opt/fasten-share/build/icons/icon-32.png');
    expect(tray.setToolTip).toHaveBeenCalledWith('Fasten Share');
    expect(tray.setContextMenu).toHaveBeenCalledOnce();

    tray.handlers.get('click')!();
    template.find((item) => item.label === '显示 Fasten Share').click();
    expect(mocks.windows[0].show).toHaveBeenCalledTimes(2);
    template.find((item) => item.label === '退出').click();
    expect(mocks.app.quit).toHaveBeenCalled();
  });

  it('runs a user-visible update check from the tray menu', async () => {
    const main = await loadMain();
    main.createTray();
    const updateItem = mocks.menuTemplates[0].find((item) => item.id === 'check-for-updates');
    updateItem.click();
    await vi.waitFor(() => expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ message: '当前已是最新版本。' }),
    ));
  });
});

describe('automatic updates', () => {
  it.each([
    ['win32', 'windows'],
    ['darwin', 'macos'],
    ['linux', 'linux'],
  ])('maps %s to the %s update directory', async (platform, dir) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform as NodeJS.Platform);
    const main = await loadMain();
    expect(main.getUpdateChannel()).toEqual({ dir });
  });

  it('returns no update channel on unsupported systems', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('aix');
    const main = await loadMain();
    expect(main.getUpdateChannel()).toBeNull();
  });

  it('configures a packaged updater and handles updater errors', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const main = await loadMain({ FASTEN_SHARE_UPDATE_BASE_URL: 'https://updates.example///' });
    main.configureAutoUpdater();
    expect(mocks.autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic', url: 'https://updates.example/macos',
    });
    expect(mocks.autoUpdater.autoDownload).toBe(true);
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(true);
    const error = new Error('network');
    mocks.updaterHandlers.get('error')!(error);
    expect(warn).toHaveBeenCalledWith('[update] check failed', error);
  });

  it.each([
    { env: { DEV_URL: 'http://localhost:8086' }, packaged: true },
    { env: {}, packaged: false },
  ])('skips updater configuration outside packaged production', async ({ env, packaged }) => {
    mocks.app.isPackaged = packaged;
    const main = await loadMain(env);
    main.configureAutoUpdater();
    expect(mocks.autoUpdater.setFeedURL).not.toHaveBeenCalled();
  });

  it('prompts to install a downloaded update with and without a live window', async () => {
    const main = await loadMain();
    main.configureAutoUpdater();
    const downloaded = mocks.updaterHandlers.get('update-downloaded')!;
    mocks.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await downloaded({ version: '2.0.0' });
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Fasten Share 2.0.0 已下载完成。',
    }));
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);

    main.createWindow('http://desktop/');
    await downloaded({ version: '2.1.0' });
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(
      mocks.windows[0], expect.objectContaining({ message: 'Fasten Share 2.1.0 已下载完成。' }),
    );
  });

  it('explains that manual checks are unavailable in development', async () => {
    const main = await loadMain({ DEV_URL: 'http://localhost:8086' });
    await main.checkForUpdates(true);
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: '开发环境不支持检查更新。',
    }));
  });

  it('reports available and current versions for manual checks', async () => {
    const main = await loadMain();
    main.createTray();
    mocks.autoUpdater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: true, updateInfo: { version: '2.0.0' },
    });
    await main.checkForUpdates(true);
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      title: '发现新版本', message: 'Fasten Share 2.0.0 正在下载。',
    }));
    expect(mocks.menuItem).toEqual({ enabled: true, label: '检查更新…' });

    await main.checkForUpdates(true);
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      message: '当前已是最新版本。', detail: '当前版本：1.2.3',
    }));
  });

  it('reports manual check failures but keeps background failures quiet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const main = await loadMain();
    mocks.autoUpdater.checkForUpdates.mockRejectedValue(new Error('offline'));
    await main.checkForUpdates(false);
    expect(mocks.dialog.showMessageBox).not.toHaveBeenCalled();
    await main.checkForUpdates(true);
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error', title: '检查更新失败',
    }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent update checks and disables the menu while pending', async () => {
    let resolve!: (value: any) => void;
    mocks.autoUpdater.checkForUpdates.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const main = await loadMain();
    main.createTray();
    const first = main.checkForUpdates();
    const second = main.checkForUpdates();
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    expect(mocks.menuItem).toEqual({ enabled: false, label: '正在检查更新…' });
    await second;
    resolve({ isUpdateAvailable: false, updateInfo: { version: '1.2.3' } });
    await first;
    expect(mocks.menuItem).toEqual({ enabled: true, label: '检查更新…' });
  });
});

describe('application bootstrap and cleanup', () => {
  it('quits immediately when the single-instance lock is unavailable', async () => {
    await loadMain();
    expect(mocks.app.quit).toHaveBeenCalled();
    expect(mocks.app.whenReady).not.toHaveBeenCalled();
  });

  it('starts from DEV_URL, handles activation, and cleans up resources', async () => {
    vi.useFakeTimers();
    mocks.state.singleInstanceLock = true;
    mocks.app.whenReady.mockResolvedValue();
    await loadMain({ DEV_URL: 'http://localhost:8086' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.windows[0].loadURL).toHaveBeenCalledWith('http://localhost:8086');
    expect(mocks.trays).toHaveLength(1);

    mocks.appHandlers.get('second-instance')!();
    expect(mocks.windows[0].focus).toHaveBeenCalled();
    mocks.appHandlers.get('activate')!();
    expect(mocks.windows[0].show).toHaveBeenCalledTimes(2);
    mocks.windows[0].handlers.get('closed')!();
    mocks.appHandlers.get('activate')!();
    expect(mocks.windows).toHaveLength(2);

    mocks.appHandlers.get('quit')!();
    expect(mocks.trays[0].destroy).toHaveBeenCalled();
  });

  it('starts and later kills the embedded production server', async () => {
    vi.useFakeTimers();
    mocks.state.singleInstanceLock = true;
    mocks.app.whenReady.mockResolvedValue();
    await loadMain();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.utilityProcess.fork).toHaveBeenCalledOnce();
    mocks.appHandlers.get('quit')!();
    expect(mocks.serverProcess.kill).toHaveBeenCalled();
  });
});
