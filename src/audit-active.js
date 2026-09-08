import { loadConfig } from './config.js';
import { EtsyClient } from './etsy.js';
import { EtsyService } from './etsy-service.js';
import { EncryptedFileTokenStore } from './token-store.js';

const config = loadConfig();
const client = new EtsyClient(config.etsy);
const tokenStore = new EncryptedFileTokenStore(config.tokenStorePath, config.tokenEncryptionSecret);
const etsy = new EtsyService(client, tokenStore);

function moneyValue(price) {
  if (!price || typeof price !== 'object') return null;
  const amount = Number(price.amount);
  const divisor = Number(price.divisor || 100);
  return Number.isFinite(amount) && Number.isFinite(divisor) && divisor > 0 ? amount / divisor : null;
}

try {
  const collection = await etsy.getListings({ state: 'active', limit: 100, offset: 0 });
  const baseListings = Array.isArray(collection?.results) ? collection.results : [];
  const audited = [];

  for (const base of baseListings) {
    const detail = await etsy.getListing(base.listing_id, { includes: ['Images'] });
    audited.push({
      listing_id: detail?.listing_id ?? base.listing_id,
      title: detail?.title ?? base.title ?? '',
      price: moneyValue(detail?.price ?? base.price),
      currency: detail?.price?.currency_code ?? base?.price?.currency_code ?? null,
      tags: Array.isArray(detail?.tags) ? detail.tags : [],
      taxonomy_id: detail?.taxonomy_id ?? null,
      views: Number.isFinite(Number(detail?.views)) ? Number(detail.views) : null,
      num_favorers: Number.isFinite(Number(detail?.num_favorers)) ? Number(detail.num_favorers) : null,
      quantity: Number.isFinite(Number(detail?.quantity)) ? Number(detail.quantity) : null,
      image_count: Array.isArray(detail?.images) ? detail.images.length : null,
      description_length: typeof detail?.description === 'string' ? detail.description.length : null,
      created_timestamp: detail?.created_timestamp ?? null,
      updated_timestamp: detail?.updated_timestamp ?? null,
      url: detail?.url ?? null,
    });
  }

  console.log(`ETSY_STORE_AUDIT ${JSON.stringify({ count: audited.length, listings: audited })}`);
} catch (error) {
  console.error(`ETSY_STORE_AUDIT_ERROR ${JSON.stringify({ status: error?.status ?? null, message: error?.message ?? 'unknown' })}`);
  process.exitCode = 1;
}
