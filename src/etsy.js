import { pkceChallenge, randomBase64Url } from './crypto.js';

const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const API_BASE_URL = 'https://api.etsy.com/v3/application';

export class EtsyApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'EtsyApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function tokenWithExpiry(token) {
  return {
    ...token,
    expires_at: Date.now() + Number(token.expires_in || 3600) * 1000,
  };
}

export class EtsyClient {
  constructor({ clientId, sharedSecret, redirectUri, scopes }) {
    this.clientId = clientId;
    this.sharedSecret = sharedSecret;
    this.redirectUri = redirectUri;
    this.scopes = scopes;
  }

  createAuthorizationRequest() {
    const state = randomBase64Url(32);
    const codeVerifier = randomBase64Url(48);
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString(), state, codeVerifier };
  }

  async exchangeAuthorizationCode(code, codeVerifier) {
    return this.#tokenRequest({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: codeVerifier,
    });
  }

  async refreshAccessToken(refreshToken) {
    return this.#tokenRequest({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken,
    });
  }

  async #tokenRequest(params) {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const body = await parseResponse(response);
    if (!response.ok) {
      throw new EtsyApiError('Etsy OAuth token request failed', {
        status: response.status,
        body,
      });
    }
    return tokenWithExpiry(body);
  }

  async request(accessToken, path, options = {}) {
    const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL}/`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    headers.set('x-api-key', `${this.clientId}:${this.sharedSecret}`);
    headers.set('authorization', `Bearer ${accessToken}`);

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
    });
    const body = await parseResponse(response);
    if (!response.ok) {
      throw new EtsyApiError(`Etsy API request failed: ${response.status}`, {
        status: response.status,
        body,
      });
    }
    return body;
  }

  userIdFromAccessToken(accessToken) {
    const prefix = String(accessToken || '').split('.', 1)[0];
    if (!/^\d+$/.test(prefix)) throw new Error('Unable to derive Etsy user_id from access token');
    return prefix;
  }
}
