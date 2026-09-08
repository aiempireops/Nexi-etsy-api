import express from 'express';
import { loadConfig } from './config.js';
import { openJson, safeEqual, sealJson } from './crypto.js';
import { EtsyApiError, EtsyClient } from './etsy.js';
import { EtsyService } from './etsy-service.js';
import { EncryptedFileTokenStore } from './token-store.js';

const config = loadConfig();
const client = new EtsyClient(config.etsy);
const tokenStore = new EncryptedFileTokenStore(config.tokenStorePath, config.tokenEncryptionSecret);
const etsy = new EtsyService(client, tokenStore);
const app = express();
const OAUTH_COOKIE = 'nexi_etsy_oauth';
const OAUTH_TTL_MS = 10 * 60 * 1000;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function oauthCookie(value, maxAgeSeconds) {
  const parts = [
    `${OAUTH_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.secureCookies) parts.push('Secure');
  return parts.join('; ');
}

function requireInternalApiKey(req, res, next) {
  if (!config.internalApiKey && config.nodeEnv !== 'production') return next();
  const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.get('x-internal-api-key') || '';
  if (!safeEqual(supplied, config.internalApiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireEtsyWriteEnabled(_req, res, next) {
  if (!config.etsyWriteEnabled) {
    return res.status(503).json({
      error: 'Etsy write operations are disabled',
      hint: 'Set ETSY_WRITE_ENABLED=true only when write access is intentionally enabled.',
    });
  }
  next();
}

function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return value;
}

app.get('/', (_req, res) => {
  res.json({
    service: 'Nexi Etsy API',
    ok: true,
    connect: '/auth/etsy',
    health: '/health',
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nexi-etsy-api' });
});

// Railway/container-only smoke test. Public requests receive 404 and no API key is needed on loopback.
app.get('/internal/etsy/verify', async (req, res, next) => {
  if (!isLoopbackRequest(req)) return res.status(404).json({ error: 'Not found' });
  try {
    return res.json(await etsy.verifyConnection());
  } catch (error) {
    return next(error);
  }
});

app.get('/auth/etsy', (_req, res) => {
  const auth = client.createAuthorizationRequest();
  const session = sealJson(
    { state: auth.state, codeVerifier: auth.codeVerifier, createdAt: Date.now() },
    config.oauthSessionSecret,
  );
  res.setHeader('set-cookie', oauthCookie(session, OAUTH_TTL_MS / 1000));
  res.redirect(auth.url);
});

app.get('/auth/etsy/callback', async (req, res, next) => {
  try {
    if (req.query.error) {
      return res.status(400).json({
        error: String(req.query.error),
        description: req.query.error_description ? String(req.query.error_description) : undefined,
      });
    }

    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const cookies = parseCookies(req.get('cookie'));
    if (!code || !state || !cookies[OAUTH_COOKIE]) {
      return res.status(400).json({ error: 'Missing OAuth callback data' });
    }

    let session;
    try {
      session = openJson(cookies[OAUTH_COOKIE], config.oauthSessionSecret);
    } catch {
      return res.status(400).json({ error: 'Invalid or expired OAuth session' });
    }

    if (!safeEqual(state, session.state) || Date.now() - session.createdAt > OAUTH_TTL_MS) {
      return res.status(400).json({ error: 'OAuth state validation failed' });
    }

    const token = await client.exchangeAuthorizationCode(code, session.codeVerifier);
    await etsy.saveToken(token);
    res.setHeader('set-cookie', oauthCookie('', 0));

    let shop = null;
    try {
      shop = await etsy.getShop();
    } catch {
      // Token connection succeeded even if shop lookup is unavailable.
    }

    return res.json({
      connected: true,
      user_id: client.userIdFromAccessToken(token.access_token),
      shop_id: shop?.shop_id || null,
      shop_name: shop?.shop_name || null,
      scope: token.scope || '',
      message: 'Etsy OAuth connection completed successfully.',
    });
  } catch (error) {
    next(error);
  }
});

app.use(['/auth/status', '/auth/disconnect', '/api'], requireInternalApiKey);

app.get('/auth/status', async (_req, res, next) => {
  try {
    res.json(await etsy.status());
  } catch (error) {
    next(error);
  }
});

app.post('/auth/disconnect', async (_req, res, next) => {
  try {
    await etsy.disconnect();
    res.json({ connected: false });
  } catch (error) {
    next(error);
  }
});

app.get('/api/etsy/verify', async (_req, res, next) => {
  try {
    res.json(await etsy.verifyConnection());
  } catch (error) {
    next(error);
  }
});

app.get('/api/etsy/write-status', (_req, res) => {
  res.json({ enabled: config.etsyWriteEnabled });
});

app.get('/api/etsy/me', async (_req, res, next) => {
  try {
    res.json(await etsy.getMe());
  } catch (error) {
    next(error);
  }
});

app.get('/api/etsy/shop', async (_req, res, next) => {
  try {
    res.json(await etsy.getShop());
  } catch (error) {
    next(error);
  }
});

app.get('/api/etsy/listings', async (req, res, next) => {
  try {
    const allowedStates = new Set(['active', 'inactive', 'sold_out', 'draft', 'expired']);
    const state = allowedStates.has(String(req.query.state)) ? String(req.query.state) : 'active';
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '25', 10) || 25, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset || '0', 10) || 0, 0);
    res.json(await etsy.getListings({ state, limit, offset }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/etsy/listings/:listingId/images', async (req, res, next) => {
  try {
    res.json(await etsy.getListingImages(req.params.listingId));
  } catch (error) {
    next(error);
  }
});

app.get('/api/etsy/listings/:listingId', async (req, res, next) => {
  try {
    const includes = String(req.query.includes || 'Images')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    res.json(await etsy.getListing(req.params.listingId, { includes }));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/etsy/listings/:listingId', requireEtsyWriteEnabled, async (req, res, next) => {
  try {
    const allowed = new Set([
      'title',
      'description',
      'tags',
      'materials',
      'styles',
      'image_ids',
      'should_auto_renew',
      'taxonomy_id',
      'state',
      'price',
      'quantity',
      'shop_section_id',
      'is_taxable',
      'who_made',
      'when_made',
      'is_supply',
      'shipping_profile_id',
      'return_policy_id',
      'processing_min',
      'processing_max',
      'readiness_state_id',
    ]);
    const listFields = new Set(['tags', 'materials', 'styles', 'image_ids']);
    const updates = {};

    for (const [key, value] of Object.entries(req.body || {})) {
      if (!allowed.has(key)) continue;
      updates[key] = listFields.has(key) ? listValue(value) : value;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No supported Etsy listing fields supplied' });
    }

    res.json(await etsy.updateListing(req.params.listingId, updates));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof EtsyApiError) {
    return res.status(error.status || 502).json({
      error: error.message,
      etsy_status: error.status || null,
      etsy_response: error.body ?? null,
    });
  }
  const status = /not connected|cannot be refreshed/i.test(error?.message || '') ? 401 : 500;
  return res.status(status).json({ error: error?.message || 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Nexi Etsy API listening on port ${config.port}`);
});
