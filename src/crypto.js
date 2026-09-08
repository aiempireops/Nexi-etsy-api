import crypto from 'node:crypto';

export function randomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function sealJson(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function openJson(payload, secret) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid sealed payload');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
