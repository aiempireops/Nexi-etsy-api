function positiveId(value, label) {
  const id = String(value ?? '');
  if (!/^\d+$/.test(id) || id === '0') throw new Error(`Invalid ${label}`);
  return id;
}

function appendValue(form, key, value) {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    form.set(key, value.join(','));
    return;
  }
  form.set(key, String(value));
}

export function toFormBody(values = {}) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) appendValue(form, key, value);
  return form;
}

export async function createDraftListing(etsy, values) {
  const required = ['quantity', 'title', 'description', 'price', 'who_made', 'when_made', 'taxonomy_id'];
  for (const key of required) {
    if (values?.[key] === undefined || values?.[key] === null || values?.[key] === '') {
      throw new Error(`Missing required draft listing field: ${key}`);
    }
  }

  const shopId = await etsy.getShopId();
  return etsy.request(`/shops/${shopId}/listings`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: toFormBody(values),
  });
}

export async function uploadListingImage(etsy, listingId, file, options = {}) {
  const id = positiveId(listingId, 'Etsy listing ID');
  if (!file?.bytes?.length) throw new Error('Image file is required');
  const shopId = await etsy.getShopId();
  const form = new FormData();
  const blob = new Blob([file.bytes], { type: file.contentType || 'application/octet-stream' });
  form.append('image', blob, file.filename || 'image.bin');
  appendValue(form, 'rank', options.rank);
  appendValue(form, 'overwrite', options.overwrite);
  appendValue(form, 'is_watermarked', options.isWatermarked);
  appendValue(form, 'alt_text', options.altText);

  return etsy.request(`/shops/${shopId}/listings/${id}/images`, {
    method: 'POST',
    body: form,
  });
}

export async function uploadListingFile(etsy, listingId, file, options = {}) {
  const id = positiveId(listingId, 'Etsy listing ID');
  if (!file?.bytes?.length) throw new Error('Digital file is required');
  const filename = String(file.filename || '').trim();
  if (!filename || filename.length > 70 || !/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new Error('Digital filename must be 1-70 characters using only letters, numbers, periods, underscores, or hyphens');
  }

  const shopId = await etsy.getShopId();
  const form = new FormData();
  const blob = new Blob([file.bytes], { type: file.contentType || 'application/octet-stream' });
  form.append('file', blob, filename);
  form.append('name', filename);
  appendValue(form, 'rank', options.rank);

  return etsy.request(`/shops/${shopId}/listings/${id}/files`, {
    method: 'POST',
    body: form,
  });
}

export async function getListingFiles(etsy, listingId) {
  const id = positiveId(listingId, 'Etsy listing ID');
  const shopId = await etsy.getShopId();
  return etsy.request(`/shops/${shopId}/listings/${id}/files`);
}

export async function deleteListingFile(etsy, listingId, listingFileId) {
  const id = positiveId(listingId, 'Etsy listing ID');
  const fileId = positiveId(listingFileId, 'Etsy listing file ID');
  const shopId = await etsy.getShopId();
  return etsy.request(`/shops/${shopId}/listings/${id}/files/${fileId}`, { method: 'DELETE' });
}

export async function deleteListingImage(etsy, listingId, listingImageId) {
  const id = positiveId(listingId, 'Etsy listing ID');
  const imageId = positiveId(listingImageId, 'Etsy listing image ID');
  const shopId = await etsy.getShopId();
  return etsy.request(`/shops/${shopId}/listings/${id}/images/${imageId}`, { method: 'DELETE' });
}
