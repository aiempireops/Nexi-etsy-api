import { loadConfig } from './config.js';
import { EtsyClient } from './etsy.js';
import { EtsyService } from './etsy-service.js';
import { EncryptedFileTokenStore } from './token-store.js';

const config = loadConfig();
const client = new EtsyClient(config.etsy);
const tokenStore = new EncryptedFileTokenStore(config.tokenStorePath, config.tokenEncryptionSecret);
const etsy = new EtsyService(client, tokenStore);

try {
  const result = await etsy.verifyConnection();
  console.log(`ETSY_SAFE_VERIFY ${JSON.stringify({
    connected: Boolean(result.connected),
    shop_readable: Boolean(result.shop_readable),
    listings_readable: Boolean(result.listings_readable),
    shop_name: result.shop_name || null,
    active_listing_count: Number.isInteger(result.active_listing_count) ? result.active_listing_count : null,
    shop_error_status: result.shop_error_status ?? null,
    listings_error_status: result.listings_error_status ?? null,
  })}`);
} catch (error) {
  console.log(`ETSY_SAFE_VERIFY ${JSON.stringify({
    connected: false,
    shop_readable: false,
    listings_readable: false,
    shop_name: null,
    active_listing_count: null,
    error_status: Number.isInteger(error?.status) ? error.status : null,
  })}`);
}
