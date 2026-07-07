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
import { app, BrowserWindow, net, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';

// In dev, point at the running `next dev` server (see package.json `dev`).
const DEV_URL = process.env.DEV_URL;

// In prod the standalone bundle is shipped unpacked as an extraResource.
const SERVER_DIR = join(process.resourcesPath, 'server-dist');
const SERVER_ENTRY = join(SERVER_DIR, 'server.js');

let win: BrowserWindow | undefined;
let serverProc: UtilityProcess | undefined;

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
  win.on('closed', () => {
    win = undefined;
  });
}

app.whenReady().then(async () => {
  const url = DEV_URL ?? (await startNextServer());
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Make sure the embedded server doesn't outlive the app.
app.on('quit', () => {
  serverProc?.kill();
});
