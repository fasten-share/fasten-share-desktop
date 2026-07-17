import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

export function getCredentialKey(): string {
  const path = join(app.getPath('userData'), 'credential-key.v2.enc');
  try {
    return safeStorage.decryptString(readFileSync(path));
  } catch {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Operating-system credential encryption is unavailable');
    }
    const key = randomBytes(32).toString('base64url');
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(path, safeStorage.encryptString(key), { mode: 0o600 });
    return key;
  }
}
