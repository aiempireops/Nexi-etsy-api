import assert from 'node:assert/strict';
import test from 'node:test';
import { EtsyService } from '../src/etsy-service.js';

function makeHarness() {
  let storedToken = {
    access_token: '123.mock-token',
    refresh_token: 'refresh-token',
    scope: 'shops_r listings_r listings_w',
    expires_at: Date.now() + 600_000,
  };
  const calls = [];

  const tokenStore = {
    async get() {
      return storedToken;
    },
    async set(token) {
      storedToken = token;
    },
    async clear() {
      storedToken = null;
    },
  };

  const client = {
    userIdFromAccessToken() {
      return '123';
    },
    async refreshAccessToken(refreshToken) {
      assert.equal(refreshToken, 'refresh-token');
      return {
        access_token: '123.refreshed-token',
        expires_in: 3600,
        expires_at: Date.now() + 3_600_000,
      };
    },
    async request(_accessToken, path, options = {}) {
      calls.push({ path, options });
      if (path === '/users/123/shops') {
        return { shop_id: 456, shop_name: 'NexaSystemsStudio' };
      }
      if (path === '/shops/456/listings') {
        return { count: 10, results: [{ listing_id: 999 }] };
      }
      if (path === '/listings/999') {
        return { listing_id: 999, title: 'Example', images: [] };
      }
      if (path === '/listings/999/images') {
        return { count: 1, results: [{ listing_image_id: 42 }] };
      }
      if (path === '/users/me') {
        return { user_id: 123 };
      }
      throw new Error(`Unexpected path: ${path}`);
    },
  };

  return { service: new EtsyService(client, tokenStore), calls };
}

test('verifyConnection confirms shop and listing access', async () => {
  const { service } = makeHarness();
  const result = await service.verifyConnection();

  assert.equal(result.connected, true);
  assert.equal(result.shop_readable, true);
  assert.equal(result.listings_readable, true);
  assert.equal(result.active_listing_count, 10);
  assert.equal(result.shop_name, 'NexaSystemsStudio');
});

test('getListing and getListingImages call the expected Etsy endpoints', async () => {
  const { service, calls } = makeHarness();

  const listing = await service.getListing(999, { includes: ['Images', 'Shop'] });
  const images = await service.getListingImages(999);

  assert.equal(listing.listing_id, 999);
  assert.equal(images.count, 1);
  assert.deepEqual(calls.at(-2), {
    path: '/listings/999',
    options: { query: { includes: 'Images,Shop' } },
  });
  assert.deepEqual(calls.at(-1), {
    path: '/listings/999/images',
    options: {},
  });
});

test('listing methods reject invalid listing IDs before calling Etsy', async () => {
  const { service, calls } = makeHarness();

  await assert.rejects(() => service.getListing('not-an-id'), /Invalid Etsy listing ID/);
  await assert.rejects(() => service.getListingImages('0'), /Invalid Etsy listing ID/);
  assert.equal(calls.length, 0);
});
