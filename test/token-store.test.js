import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EncryptedFileTokenStore } from '../src/token-store.js';

test('encrypted token store persists and clears tokens', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexi-etsy-'));
  const file = path.join(dir, 'token.enc');
  const store = new EncryptedFileTokenStore(file, 'test-token-encryption-secret');
  const token = { access_token: '123.token', refresh_token: '123.refresh', expires_at: Date.now() + 1000 };

  assert.equal(await store.get(), null);
  await store.set(token);
  assert.deepEqual(await store.get(), token);
  const raw = await fs.readFile(file, 'utf8');
  assert.equal(raw.includes('123.token'), false);
  await store.clear();
  assert.equal(await store.get(), null);
});
