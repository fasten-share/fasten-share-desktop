import { describe, expect, it, vi } from 'vitest';
import { getMocks, loadMain } from './main-test-support';
const mocks = getMocks();

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
