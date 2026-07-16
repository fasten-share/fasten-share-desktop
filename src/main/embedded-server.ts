import { createServer } from 'node:net';
import { join } from 'node:path';
import { app, net, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';

const SERVER_DIR = join(process.resourcesPath, 'server-dist');
const SERVER_ENTRY = join(SERVER_DIR, 'server.js');

let serverProcess: UtilityProcess | undefined;

/** Ask the OS for a free TCP port on the loopback interface. */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Poll the server until it answers (or time out). */
export async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await net.fetch(url);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error('Next server did not start in time');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/** Spawn the standalone Next server and resolve once it is reachable. */
export async function startNextServer(): Promise<string> {
  const port = await findFreePort();
  serverProcess = utilityProcess.fork(SERVER_ENTRY, [], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      FS_DATA_DIR: app.getPath('userData'),
    },
  });
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  return url;
}

export function stopNextServer(): void {
  serverProcess?.kill();
  serverProcess = undefined;
}
