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

  async getListings({ state = 'active', limit = 25, offset = 0 } = {}) {
    const shop = await this.getShop();
    if (!shop?.shop_id) throw new Error('Connected Etsy user does not have a shop');
    return this.request(`/shops/${shop.shop_id}/listings`, {
      query: { state, limit, offset },
    });
  }
}
