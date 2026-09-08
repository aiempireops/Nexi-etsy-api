function positiveListingId(listingId) {
  const id = String(listingId || '');
  if (!/^\d+$/.test(id) || id === '0') throw new Error('Invalid Etsy listing ID');
  return id;
}

function toFormBody(values) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      form.set(key, value.join(','));
    } else {
      form.set(key, String(value));
    }
  }
  return form;
}

export class EtsyService {
  constructor(client, tokenStore) {
    this.client = client;
    this.tokenStore = tokenStore;
  }

  async status() {
    const token = await this.tokenStore.get();
    if (!token) return { connected: false };
    return {
      connected: true,
      user_id: this.client.userIdFromAccessToken(token.access_token),
      scope: token.scope || '',
      expires_at: token.expires_at || null,
      refresh_available: Boolean(token.refresh_token),
    };
  }

  async saveToken(token) {
    await this.tokenStore.set(token);
  }

  async disconnect() {
    await this.tokenStore.clear();
  }

  async getValidToken({ forceRefresh = false } = {}) {
    let token = await this.tokenStore.get();
    if (!token) throw new Error('Etsy account is not connected');

    const expiresSoon = !token.expires_at || token.expires_at <= Date.now() + 60_000;
    if (forceRefresh || expiresSoon) {
      if (!token.refresh_token) throw new Error('Etsy token cannot be refreshed; reconnect the account');
      const refreshed = await this.client.refreshAccessToken(token.refresh_token);
      token = {
        ...refreshed,
        refresh_token: refreshed.refresh_token || token.refresh_token,
      };
      await this.tokenStore.set(token);
    }
    return token;
  }

  async request(path, options = {}) {
    let token = await this.getValidToken();
    try {
      return await this.client.request(token.access_token, path, options);
    } catch (error) {
      if (error?.status !== 401) throw error;
      token = await this.getValidToken({ forceRefresh: true });
      return this.client.request(token.access_token, path, options);
    }
  }

  async getMe() {
    return this.request('/users/me');
  }

  async getShop() {
    const token = await this.getValidToken();
    const userId = this.client.userIdFromAccessToken(token.access_token);
    return this.request(`/users/${userId}/shops`);
  }

  async getShopId() {
    const shop = await this.getShop();
    if (!shop?.shop_id) throw new Error('Connected Etsy user does not have a shop');
    return shop.shop_id;
  }

  async getListings({ state = 'active', limit = 25, offset = 0 } = {}) {
    const shopId = await this.getShopId();
    return this.request(`/shops/${shopId}/listings`, {
      query: { state, limit, offset },
    });
  }

  async getListing(listingId, { includes = ['Images'] } = {}) {
    const id = positiveListingId(listingId);
    return this.request(`/listings/${id}`, {
      query: { includes: Array.isArray(includes) ? includes.join(',') : includes },
    });
  }

  async getListingImages(listingId) {
    const id = positiveListingId(listingId);
    return this.request(`/listings/${id}/images`);
  }

  async updateListing(listingId, updates) {
    const id = positiveListingId(listingId);
    const form = toFormBody(updates);
    if ([...form.keys()].length === 0) throw new Error('No Etsy listing fields supplied for update');
    const shopId = await this.getShopId();
    return this.request(`/shops/${shopId}/listings/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
  }

  async verifyConnection() {
    const status = await this.status();
    if (!status.connected) {
      return {
        connected: false,
        shop_readable: false,
        listings_readable: false,
        active_listing_count: null,
      };
    }

    const result = {
      connected: true,
      shop_readable: false,
      listings_readable: false,
      active_listing_count: null,
    };

    try {
      const shop = await this.getShop();
      result.shop_readable = Boolean(shop?.shop_id);
      result.shop_name = shop?.shop_name || null;
    } catch (error) {
      result.shop_error_status = Number.isInteger(error?.status) ? error.status : null;
    }

    try {
      const listings = await this.getListings({ state: 'active', limit: 1, offset: 0 });
      result.listings_readable = true;
      result.active_listing_count = Number.isInteger(listings?.count)
        ? listings.count
        : Array.isArray(listings?.results)
          ? listings.results.length
          : null;
    } catch (error) {
      result.listings_error_status = Number.isInteger(error?.status) ? error.status : null;
    }

    return result;
  }
}
