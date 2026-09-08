import express from 'express';
import { loadConfig } from './config.js';
import { openJson, safeEqual, sealJson } from './crypto.js';
import { EtsyApiError, EtsyClient } from './etsy.js';
import { EtsyService } from './etsy-service.js';
import { EncryptedFileTokenStore } from './token-store.js';
import {
  createDraftListing,
  deleteListingFile,
  deleteListingImage,
  getListingFiles,
  uploadListingFile,
  uploadListingImage,
} from './etsy-write-service.js';

const config = loadConfig();
const client = new EtsyClient(config.etsy);
const tokenStore = new EncryptedFileTokenStore(config.tokenStorePath, config.tokenEncryptionSecret);
const etsy = new EtsyService(client, tokenStore);
const app = express();
const OAUTH_COOKIE = 'nexi_etsy_oauth';
const OAUTH_TTL_MS = 10 * 60 * 1000;
const rawUpload = express.raw({ type: () => true, limit: '20mb' });

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
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
  if (!safeEqual(supplied, config.internalApiKey)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireWriteEnabled(_req, res, next) {
  if (!config.etsyWriteEnabled) {
    return res.status(503).json({ error: 'Etsy write operations are disabled' });
  }
  next();
}

function requirePublishEnabled(_req, res, next) {
  if (!config.etsyWriteEnabled || !config.etsyPublishEnabled) {
    return res.status(503).json({ error: 'Etsy publishing is disabled' });
  }
  next();
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return value;
}

function intValue(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function boolValue(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function positiveId(value) {
  return /^\d+$/.test(String(value || '')) && String(value) !== '0';
}

function pickAllowed(body, allowed, listFields = new Set()) {
  const result = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!allowed.has(key)) continue;
    result[key] = listFields.has(key) ? listValue(value) : value;
  }
  return result;
}

app.get('/', (_req, res) => {
  res.json({ service: 'Nexi Etsy API', version: 2, ok: true, connect: '/auth/etsy', health: '/health' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nexi-etsy-api', version: 2 });
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
    try { shop = await etsy.getShop(); } catch { /* OAuth still succeeded. */ }

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
  try { res.json(await etsy.status()); } catch (error) { next(error); }
});

app.post('/auth/disconnect', async (_req, res, next) => {
  try { await etsy.disconnect(); res.json({ connected: false }); } catch (error) { next(error); }
});

app.get('/api/etsy/verify', async (_req, res, next) => {
  try { res.json(await etsy.verifyConnection()); } catch (error) { next(error); }
});

app.get('/api/etsy/write-status', (_req, res) => {
  res.json({ writes_enabled: config.etsyWriteEnabled, publishing_enabled: config.etsyPublishEnabled });
});

app.get('/api/etsy/me', async (_req, res, next) => {
  try { res.json(await etsy.getMe()); } catch (error) { next(error); }
});

app.get('/api/etsy/shop', async (_req, res, next) => {
  try { res.json(await etsy.getShop()); } catch (error) { next(error); }
});

app.get('/api/etsy/listings', async (req, res, next) => {
  try {
    const allowedStates = new Set(['active', 'inactive', 'sold_out', 'draft', 'expired']);
    const state = allowedStates.has(String(req.query.state)) ? String(req.query.state) : 'active';
    const limit = intValue(req.query.limit, 25, 1, 100);
    const offset = intValue(req.query.offset, 0, 0);
    res.json(await etsy.getListings({ state, limit, offset }));
  } catch (error) { next(error); }
});

app.get('/api/etsy/listings/:listingId/images', async (req, res, next) => {
  try { res.json(await etsy.getListingImages(req.params.listingId)); } catch (error) { next(error); }
});

app.get('/api/etsy/listings/:listingId/files', async (req, res, next) => {
  try { res.json(await getListingFiles(etsy, req.params.listingId)); } catch (error) { next(error); }
});

app.get('/api/etsy/listings/:listingId', async (req, res, next) => {
  try {
    const includes = String(req.query.includes || 'Images').split(',').map((value) => value.trim()).filter(Boolean);
    res.json(await etsy.getListing(req.params.listingId, { includes }));
  } catch (error) { next(error); }
});

app.post('/api/etsy/listings/drafts', requireWriteEnabled, async (req, res, next) => {
  try {
    const allowed = new Set([
      'quantity', 'title', 'description', 'price', 'who_made', 'when_made', 'taxonomy_id', 'type',
      'tags', 'materials', 'image_ids', 'is_supply', 'is_customizable', 'should_auto_renew', 'is_taxable',
      'shop_section_id', 'production_partner_ids', 'language', 'readiness_state_id', 'return_policy_id',
      'shipping_profile_id',
    ]);
    const listFields = new Set(['tags', 'materials', 'image_ids', 'production_partner_ids']);
    const draft = pickAllowed(req.body, allowed, listFields);
    if (!draft.type) draft.type = 'download';
    res.status(201).json(await createDraftListing(etsy, draft));
  } catch (error) { next(error); }
});

app.patch('/api/etsy/listings/:listingId', requireWriteEnabled, async (req, res, next) => {
  try {
    const allowed = new Set([
      'title', 'description', 'tags', 'materials', 'styles', 'image_ids', 'should_auto_renew', 'taxonomy_id',
      'state', 'price', 'quantity', 'shop_section_id', 'is_taxable', 'who_made', 'when_made', 'is_supply',
      'shipping_profile_id', 'return_policy_id', 'processing_min', 'processing_max', 'readiness_state_id', 'type',
    ]);
    const listFields = new Set(['tags', 'materials', 'styles', 'image_ids']);
    const updates = pickAllowed(req.body, allowed, listFields);
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No supported Etsy listing fields supplied' });
    if (updates.state === 'active' && !config.etsyPublishEnabled) {
      return res.status(503).json({ error: 'Publishing is disabled; ETSY_PUBLISH_ENABLED must also be true' });
    }
    res.json(await etsy.updateListing(req.params.listingId, updates));
  } catch (error) { next(error); }
});

app.post('/api/etsy/listings/:listingId/publish', requirePublishEnabled, async (req, res, next) => {
  try { res.json(await etsy.updateListing(req.params.listingId, { state: 'active' })); } catch (error) { next(error); }
});

app.post('/api/etsy/listings/:listingId/images', requireWriteEnabled, rawUpload, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Raw image body is required' });
    const filename = String(req.query.filename || '').trim();
    if (!filename) return res.status(400).json({ error: 'filename query parameter is required' });
    const altText = String(req.query.alt_text || '');
    if (altText.length > 500) return res.status(400).json({ error: 'alt_text must be 500 characters or fewer' });
    const result = await uploadListingImage(etsy, req.params.listingId, {
      bytes: req.body,
      filename,
      contentType: req.get('content-type') || 'application/octet-stream',
    }, {
      rank: intValue(req.query.rank, 1, 0, 20),
      overwrite: boolValue(req.query.overwrite, false),
      isWatermarked: boolValue(req.query.is_watermarked, false),
      altText,
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post('/api/etsy/listings/:listingId/files', requireWriteEnabled, rawUpload, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Raw digital file body is required' });
    const filename = String(req.query.filename || '').trim();
    if (!filename) return res.status(400).json({ error: 'filename query parameter is required' });
    const existing = await getListingFiles(etsy, req.params.listingId);
    if (Number(existing?.count || existing?.results?.length || 0) >= 5) {
      return res.status(409).json({ error: 'Etsy allows at most 5 digital files per listing' });
    }
    const result = await uploadListingFile(etsy, req.params.listingId, {
      bytes: req.body,
      filename,
      contentType: req.get('content-type') || 'application/octet-stream',
    }, { rank: intValue(req.query.rank, 1, 1, 5) });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.delete('/api/etsy/listings/:listingId/files/:listingFileId', requireWriteEnabled, async (req, res, next) => {
  try {
    if (!positiveId(req.params.listingFileId)) return res.status(400).json({ error: 'Invalid listing file ID' });
    await deleteListingFile(etsy, req.params.listingId, req.params.listingFileId);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.delete('/api/etsy/listings/:listingId/images/:listingImageId', requireWriteEnabled, async (req, res, next) => {
  try {
    if (!positiveId(req.params.listingImageId)) return res.status(400).json({ error: 'Invalid listing image ID' });
    await deleteListingImage(etsy, req.params.listingId, req.params.listingImageId);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Upload exceeds 20 MB limit' });
  if (error instanceof EtsyApiError) {
    return res.status(error.status || 502).json({ error: error.message, etsy_status: error.status || null, etsy_response: error.body ?? null });
  }
  const status = /not connected|cannot be refreshed/i.test(error?.message || '') ? 401 : 500;
  return res.status(status).json({ error: error?.message || 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Nexi Etsy API v2 listening on port ${config.port}`);
});
