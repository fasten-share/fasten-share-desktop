import { describe, expect, it, vi } from 'vitest';
import { getMocks, loadMain } from './main-test-support';
const mocks = getMocks();

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

