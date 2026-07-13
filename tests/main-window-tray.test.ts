import { describe, expect, it, vi } from 'vitest';
import { getMocks, loadMain } from './main-test-support';
const mocks = getMocks();

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

