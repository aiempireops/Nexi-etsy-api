import assert from 'node:assert/strict';
import test from 'node:test';
import { openJson, pkceChallenge, sealJson } from '../src/crypto.js';

test('PKCE challenge uses S256 + base64url', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(pkceChallenge(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('sealed JSON round-trips and is not plaintext', () => {
  const input = { access_token: 'secret-token', expires_at: 123 };
  const sealed = sealJson(input, 'a sufficiently long test secret');
  assert.equal(sealed.includes('secret-token'), false);
  assert.deepEqual(openJson(sealed, 'a sufficiently long test secret'), input);
});
