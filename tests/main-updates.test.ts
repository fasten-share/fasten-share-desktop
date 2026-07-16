import { describe, expect, it, vi } from 'vitest';
import { getMocks, loadMain } from './main-test-support';
const mocks = getMocks();

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
    mocks.dialog.showMessageBox
      .mockResolvedValueOnce({ response: 1 })
      .mockResolvedValueOnce({ response: 0 });
    await downloaded({ version: '2.0.0' });
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Fasten Share 2.0.0 has been downloaded.',
    }));

    main.createWindow('http://desktop/');
    await downloaded({ version: '2.1.0' });
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(
      mocks.windows[0], expect.objectContaining({
        message: 'Fasten Share 2.1.0 has been downloaded.',
      }),
    );
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('offers the website directly on the next update check when an install attempt did not quit', async () => {
    vi.useFakeTimers();
    const main = await loadMain();
    main.configureAutoUpdater();
    mocks.dialog.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    await mocks.updaterHandlers.get('update-downloaded')!({ version: '2.0.0' });
    await main.checkForUpdates(true);

    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledTimes(2);
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'error',
      title: 'Automatic Update Failed',
      detail: 'Download the latest version from the official website and install it manually.',
    }));
    expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://www.fastenshare.com/download/');
  });

  it('offers the website download when restart and install has not begun after 30 seconds', async () => {
    vi.useFakeTimers();
    const main = await loadMain();
    main.configureAutoUpdater();
    mocks.dialog.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 });

    await mocks.updaterHandlers.get('update-downloaded')!({ version: '2.0.0' });
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'error',
      title: 'Automatic Update Failed',
      detail: 'Download the latest version from the official website and install it manually.',
    }));
    expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://www.fastenshare.com/download/');
  });

  it('cancels the install timeout once the app begins quitting', async () => {
    vi.useFakeTimers();
    const main = await loadMain();
    main.installDownloadedUpdate();
    mocks.appHandlers.get('before-quit')!();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('explains that manual checks are unavailable in development', async () => {
    const main = await loadMain({ DEV_URL: 'http://localhost:8086' });
    await main.checkForUpdates(true);
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Update checks are unavailable in development mode.',
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
      title: 'New Version Available',
      message: 'Fasten Share 2.0.0 is downloading.',
      detail: 'Current version: 1.2.3\n\nYou will be prompted to restart and install when the download finishes.',
    }));
    expect(mocks.menuItem).toEqual({ enabled: true, label: 'Check for Updates…' });

    await main.checkForUpdates(true);
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'You are using the latest version.',
      detail: 'Current version: 1.2.3',
    }));
  });

  it('uses Chinese update copy when the system locale is Chinese', async () => {
    mocks.app.getLocale.mockReturnValue('zh-CN');
    const main = await loadMain();
    mocks.autoUpdater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: true, updateInfo: { version: '2.0.0' },
    });
    await main.checkForUpdates(true);
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      title: '发现新版本',
      message: 'Fasten Share 2.0.0 正在下载。',
      detail: '当前版本：1.2.3\n\n下载完成后会提示你重启并安装。',
    }));

    await main.checkForUpdates(true);
    expect(mocks.dialog.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({
      title: '检查更新',
      message: '当前已是最新版本。',
      detail: '当前版本：1.2.3',
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
      type: 'error', title: 'Update Check Failed',
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
    expect(mocks.menuItem).toEqual({ enabled: false, label: 'Checking for Updates…' });
    await second;
    resolve({ isUpdateAvailable: false, updateInfo: { version: '1.2.3' } });
    await first;
    expect(mocks.menuItem).toEqual({ enabled: true, label: 'Check for Updates…' });
  });
});
