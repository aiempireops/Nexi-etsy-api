import path from 'node:path';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanFlag(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

export function loadConfig() {
  const redirectUri = required('ETSY_REDIRECT_URI');
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const internalApiKey = process.env.INTERNAL_API_KEY?.trim() || '';

  if (nodeEnv === 'production' && !internalApiKey) {
    throw new Error('INTERNAL_API_KEY is required in production');
  }

  return {
    nodeEnv,
    port: positiveInt(process.env.PORT, 3000),
    etsy: {
      clientId: required('ETSY_CLIENT_ID'),
      sharedSecret: required('ETSY_SHARED_SECRET'),
      redirectUri,
      scopes: (process.env.ETSY_SCOPES || 'shops_r listings_r listings_w')
        .split(/\s+/)
        .filter(Boolean),
    },
    oauthSessionSecret: required('OAUTH_SESSION_SECRET'),
    tokenEncryptionSecret: required('TOKEN_ENCRYPTION_SECRET'),
    tokenStorePath: path.resolve(process.env.TOKEN_STORE_PATH || '.data/etsy-token.enc'),
    internalApiKey,
    etsyWriteEnabled: booleanFlag(process.env.ETSY_WRITE_ENABLED, false),
    etsyPublishEnabled: booleanFlag(process.env.ETSY_PUBLISH_ENABLED, false),
    secureCookies: redirectUri.startsWith('https://'),
  };
}
