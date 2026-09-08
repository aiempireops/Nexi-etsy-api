import { loadConfig } from './config.js';
import { EtsyClient } from './etsy.js';
import { EtsyService } from './etsy-service.js';
import { EncryptedFileTokenStore } from './token-store.js';

const config = loadConfig();
const client = new EtsyClient(config.etsy);
const tokenStore = new EncryptedFileTokenStore(config.tokenStorePath, config.tokenEncryptionSecret);
const etsy = new EtsyService(client, tokenStore);

function bestImageUrl(image) {
  return image?.url_fullxfull || image?.url_570xN || image?.url_300x300 || null;
}

try {
  const collection = await etsy.getListings({ state: 'active', limit: 100, offset: 0 });
  const baseListings = Array.isArray(collection?.results) ? collection.results : [];
  const catalog = [];

  for (const base of baseListings) {
    const detail = await etsy.getListing(base.listing_id, { includes: ['Images'] });
    const images = Array.isArray(detail?.images) ? detail.images : [];
    const socialImages = images.map(bestImageUrl).filter(Boolean).slice(0, 4);
    catalog.push({
      listing_id: detail?.listing_id ?? base.listing_id,
      title: detail?.title ?? base.title ?? '',
      url: detail?.url ?? null,
      first_image: socialImages[0] || null,
      social_images: socialImages,
      image_count: images.length,
    });
  }

  console.log(`ETSY_SOCIAL_CATALOG ${JSON.stringify({ count: catalog.length, listings: catalog })}`);
} catch (error) {
  console.error(`ETSY_SOCIAL_CATALOG_ERROR ${JSON.stringify({ status: error?.status ?? null, message: error?.message ?? 'unknown' })}`);
  process.exitCode = 1;
}
