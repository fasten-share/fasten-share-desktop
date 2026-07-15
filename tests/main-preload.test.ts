import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}));

describe('desktop preload language bridge', () => {
  beforeEach(() => vi.resetModules());

  it('exposes language reads, writes, and change subscriptions', async () => {
    await import('../src/main/preload');
    expect(mocks.exposeInMainWorld).toHaveBeenCalledWith('fastenShareDesktop', expect.any(Object));
    const bridge = mocks.exposeInMainWorld.mock.calls[0][1];

    await bridge.getLanguage();
    await bridge.setLanguage('zh');
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'fasten-share:language:get');
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'fasten-share:language:set', 'zh');

    const listener = vi.fn();
    const unsubscribe = bridge.onLanguageChanged(listener);
    const ipcListener = mocks.on.mock.calls[0][1];
    ipcListener({}, 'en');
    expect(listener).toHaveBeenCalledWith('en');
    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith(
      'fasten-share:language:changed',
      ipcListener,
    );
  });
});
