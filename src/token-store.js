import fs from 'node:fs/promises';
import path from 'node:path';
import { openJson, sealJson } from './crypto.js';

export class EncryptedFileTokenStore {
  constructor(filePath, secret) {
    this.filePath = filePath;
    this.secret = secret;
  }

  async get() {
    try {
      const sealed = await fs.readFile(this.filePath, 'utf8');
      return openJson(sealed.trim(), this.secret);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async set(token) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, sealJson(token, this.secret), { mode: 0o600 });
    await fs.rename(tempPath, this.filePath);
  }

  async clear() {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}
