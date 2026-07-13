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

