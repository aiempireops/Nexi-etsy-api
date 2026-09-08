# Nexi Etsy API

Server-side bridge for Etsy Open API v3. It handles Etsy OAuth 2.0 Authorization Code + PKCE, encrypted token persistence, automatic refresh, guarded reads, and opt-in listing updates for the connected Etsy shop.

## Implemented

- Etsy OAuth authorization redirect with PKCE/S256 and single-use `state`
- Encrypted HTTP-only OAuth flow cookie with 10-minute lifetime
- Authorization-code exchange and AES-256-GCM token persistence
- Automatic access-token refresh and one retry after a 401
- Etsy v3 `x-api-key` authentication using `keystring:shared_secret`
- Persistent token storage support for Railway volumes
- Internal API-key protection for connected-account endpoints
- Connection verification against the Etsy shop and active listings
- Listing collection, listing-detail and listing-image reads
- Guarded listing PATCH support using `listings_w`
- Writes disabled by default with `ETSY_WRITE_ENABLED=false`
- GitHub Actions CI and Node built-in tests

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/auth/etsy` | Start Etsy OAuth |
| GET | `/auth/etsy/callback` | Etsy callback URI |
| GET | `/auth/status` | Connection/token status |
| POST | `/auth/disconnect` | Remove stored Etsy token |
| GET | `/api/etsy/verify` | Safe shop/listing connection check |
| GET | `/api/etsy/write-status` | Whether listing writes are enabled |
| GET | `/api/etsy/me` | Authenticated Etsy user info |
| GET | `/api/etsy/shop` | Connected user's shop |
| GET | `/api/etsy/listings?state=active&limit=25&offset=0` | Shop listings |
| GET | `/api/etsy/listings/:listingId?includes=Images,Shop` | Listing details |
| GET | `/api/etsy/listings/:listingId/images` | Listing images |
| PATCH | `/api/etsy/listings/:listingId` | Update supported listing fields; write flag required |

`/auth/status`, `/auth/disconnect`, and `/api/*` require `Authorization: Bearer <INTERNAL_API_KEY>` in production.

The container-only `GET /internal/etsy/verify` endpoint accepts requests only from loopback and exists for Railway smoke tests without exposing the internal API key publicly.

## Listing updates

Writes require both:

1. an OAuth token containing `listings_w`, and
2. `ETSY_WRITE_ENABLED=true` in the deployment environment.

The default is **false**, even when the OAuth scope includes `listings_w`.

Example JSON body:

```json
{
  "title": "Updated Etsy listing title",
  "description": "Updated description",
  "tags": ["spreadsheet", "business template", "etsy seller"],
  "should_auto_renew": true
}
```

Supported update fields are intentionally allowlisted in `src/server.js`. Etsy receives the request as `application/x-www-form-urlencoded`, as required by the Open API v3 `updateListing` endpoint.

## Etsy app setup

1. Open the Seller App in Etsy Developer **Your Apps**.
2. Add the exact callback URI, for example `https://nexi-etsy-api-production.up.railway.app/auth/etsy/callback`.
3. Set the app keystring as `ETSY_CLIENT_ID` and shared secret as `ETSY_SHARED_SECRET`.
4. Keep `ETSY_SCOPES=shops_r listings_r listings_w` for the current integration.
5. Set the remaining secrets from `.env.example` only in the deployment environment.
6. Never commit real credentials or the encrypted token file.

## Railway production setup

The current production pattern is:

- service port: `3000`
- healthcheck: `/health`
- persistent volume mount: `/app/.data`
- token path: `.data/etsy-token.enc`
- production write flag: keep `ETSY_WRITE_ENABLED=false` until intentional write testing begins

## Local run

```bash
npm install
npm test
npm start
```

The application reads configuration directly from environment variables and does not require an env-file loader.

## Next layer

The next implementation layer is digital-product management: draft listing creation, image upload, digital file upload, inventory handling, publishing, and a narrow OpenAPI action schema for controlled automation.
