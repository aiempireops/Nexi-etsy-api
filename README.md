# Nexi Etsy API

Server-side Etsy Open API v3 bridge for the connected NexaSystemsStudio shop. It handles OAuth 2.0 + PKCE, encrypted persistent token storage, automatic token refresh, authenticated reads, and tightly guarded listing mutations.

## Production capabilities

- Etsy OAuth Authorization Code + PKCE/S256
- Encrypted AES-256-GCM token persistence on Railway volume `/app/.data`
- Automatic access-token refresh and one retry after Etsy 401 responses
- Etsy v3 `x-api-key` authentication using `keystring:shared_secret`
- Internal bearer-key protection for all connected-account API endpoints
- Verified reads of the connected shop and active listings
- Listing details, images and digital-file reads
- Draft listing creation, defaulting to digital `type=download`
- Listing field updates
- Raw-binary listing image uploads
- Raw-binary digital file uploads with Etsy's 5-file / 20 MB guardrails
- Listing image/file deletion helpers
- Explicit publish endpoint
- OpenAPI 3.1 schema in `openapi.yaml`
- GitHub Actions CI and unit tests

## Safety model

OAuth contains `listings_w`, but mutations are still disabled unless the deployment safety switches are enabled:

```text
ETSY_WRITE_ENABLED=false
ETSY_PUBLISH_ENABLED=false
```

`ETSY_WRITE_ENABLED=true` allows draft creation, edits, uploads and image/file deletion. Publishing or setting `state=active` additionally requires `ETSY_PUBLISH_ENABLED=true`.

## Main endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/auth/etsy` | Start Etsy OAuth |
| GET | `/auth/etsy/callback` | Etsy callback |
| GET | `/api/etsy/verify` | Verify shop/listing reads |
| GET | `/api/etsy/write-status` | Read safety-switch status |
| GET | `/api/etsy/shop` | Connected shop |
| GET | `/api/etsy/listings` | List shop listings |
| POST | `/api/etsy/listings/drafts` | Create a draft listing |
| GET/PATCH | `/api/etsy/listings/:listingId` | Read/update listing |
| POST | `/api/etsy/listings/:listingId/publish` | Publish prepared listing |
| GET/POST | `/api/etsy/listings/:listingId/images` | Read/upload images |
| DELETE | `/api/etsy/listings/:listingId/images/:listingImageId` | Delete image |
| GET/POST | `/api/etsy/listings/:listingId/files` | Read/upload digital files |
| DELETE | `/api/etsy/listings/:listingId/files/:listingFileId` | Delete digital file |

All `/api/*` endpoints require `Authorization: Bearer <INTERNAL_API_KEY>` in production.

### Binary uploads

Image and digital-file upload endpoints accept the file bytes as the raw request body. Pass the buyer-visible filename with `?filename=...`. Digital filenames are limited to 70 characters using letters, numbers, `.`, `_`, or `-`, matching Etsy's rules. Digital files are limited to 20 MB each and Etsy allows at most five files per listing.

## Railway production setup

- service port: `3000`
- healthcheck: `/health`
- persistent volume: `etsy-data`
- volume mount: `/app/.data`
- token path: `.data/etsy-token.enc`
- callback: `https://nexi-etsy-api-production.up.railway.app/auth/etsy/callback`
- production start: `npm start` → `node src/server-v2.js`

## Etsy scopes

Current integration:

```text
shops_r listings_r listings_w
```

Deleting an entire Etsy listing would require `listings_d`; this service intentionally does not implement that operation.

## Local validation

```bash
npm install
npm test
npm start
```

The application reads configuration directly from environment variables. Real credentials and token files must never be committed.
