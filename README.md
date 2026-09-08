# Nexi Etsy API

A small server-side bridge for Etsy Open API v3. It handles Etsy OAuth 2.0 Authorization Code + PKCE, stores OAuth tokens encrypted at rest, refreshes access tokens automatically, and exposes a narrow internal API for the connected shop.

## What is implemented

- Etsy OAuth authorization redirect with PKCE/S256 and single-use `state`
- Encrypted, HTTP-only OAuth flow cookie with a 10-minute lifetime
- Authorization-code exchange and encrypted token persistence
- Automatic access-token refresh (access tokens are normally valid for one hour)
- One retry after a 401 using a freshly refreshed token
- Etsy v3 `x-api-key` authentication using `keystring:shared_secret`
- Internal API-key protection for connected-account endpoints
- Read endpoints for the authenticated user, shop, and shop listings
- Health/status/disconnect endpoints
- Node built-in tests for PKCE, encryption, and token persistence

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/auth/etsy` | Start Etsy OAuth |
| GET | `/auth/etsy/callback` | Etsy callback URI |
| GET | `/auth/status` | Connection/token status |
| POST | `/auth/disconnect` | Remove the stored Etsy token |
| GET | `/api/etsy/me` | Basic authenticated Etsy user info |
| GET | `/api/etsy/shop` | Connected user's shop |
| GET | `/api/etsy/listings?state=active&limit=25&offset=0` | Shop listings |

`/auth/status`, `/auth/disconnect`, and `/api/*` require `Authorization: Bearer <INTERNAL_API_KEY>` in production. During local development, authentication is skipped only when `INTERNAL_API_KEY` is empty.

## Etsy app setup

1. Create/open the Etsy developer app in **Your Apps**.
2. Add the exact callback URI used by this service, e.g. `https://etsy-api.example.com/auth/etsy/callback`.
3. Copy the app **keystring** to `ETSY_CLIENT_ID` and **shared secret** to `ETSY_SHARED_SECRET`.
4. Configure `ETSY_SCOPES`. The default is `shops_r listings_r listings_w`.
5. Set the remaining secrets from `.env.example` in the deployment environment. Never commit the real `.env` file.

Etsy requires an API key on every v3 request. Current Etsy documentation specifies the `x-api-key` value as `keystring:shared_secret`. User-authorized/private operations additionally use the OAuth Bearer token.

## Local run

```bash
cp .env.example .env
# Export the variables in .env using your preferred environment loader.
npm install
npm test
npm start
```

This project intentionally does not depend on an env-file loader; deployment platforms can inject variables directly. For local development you can use your shell, IDE, container environment, or run Node with an environment-file option supported by your Node version.

Then visit:

```text
http://localhost:3000/auth/etsy
```

The `ETSY_REDIRECT_URI` must match what is registered with Etsy. Use HTTPS for a deployed callback.

## Token storage

The default token store is `.data/etsy-token.enc`. The payload is encrypted with AES-256-GCM using a key derived from `TOKEN_ENCRYPTION_SECRET`, and `.data/` is gitignored.

For a single long-running instance, mount persistent storage for `.data`. If this is deployed to a serverless/multi-instance environment, replace `EncryptedFileTokenStore` with a shared database/secret-store adapter before relying on it in production.

## Next integration layer

OAuth and authenticated reads are deliberately separated from listing mutations. The next layer can add guarded operations for draft listing creation/update, image/file uploads, inventory, and publishing while reusing the same automatically refreshed token service.
