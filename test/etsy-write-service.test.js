import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDraftListing,
  deleteListingFile,
  deleteListingImage,
  getListingFiles,
  toFormBody,
  uploadListingFile,
  uploadListingImage,
} from '../src/etsy-write-service.js';

function makeEtsy() {
  const calls = [];
  return {
    calls,
    async getShopId() { return 456; },
    async request(path, options = {}) {
      calls.push({ path, options });
      return { ok: true, path };
    },
  };
}

test('toFormBody serializes arrays as comma-separated values', () => {
  const form = toFormBody({ title: 'Test', tags: ['one', 'two'], empty: null });
  assert.equal(form.get('title'), 'Test');
  assert.equal(form.get('tags'), 'one,two');
  assert.equal(form.has('empty'), false);
});

test('createDraftListing validates required fields and calls Etsy shop listing endpoint', async () => {
  const etsy = makeEtsy();
  const result = await createDraftListing(etsy, {
    quantity: 999,
    title: 'Digital spreadsheet',
    description: 'A useful spreadsheet',
    price: 99,
    who_made: 'i_did',
    when_made: '2020_2026',
    taxonomy_id: 1,
    type: 'download',
    tags: ['spreadsheet', 'business'],
  });

  assert.equal(result.ok, true);
  assert.equal(etsy.calls[0].path, '/shops/456/listings');
  assert.equal(etsy.calls[0].options.method, 'POST');
  assert.equal(etsy.calls[0].options.body.get('type'), 'download');
  assert.equal(etsy.calls[0].options.body.get('tags'), 'spreadsheet,business');

  await assert.rejects(() => createDraftListing(etsy, { title: 'missing fields' }), /Missing required draft listing field/);
});

test('uploadListingImage builds multipart request', async () => {
  const etsy = makeEtsy();
  await uploadListingImage(etsy, 999, {
    bytes: Buffer.from('image-data'),
    filename: 'image.png',
    contentType: 'image/png',
  }, { rank: 1, overwrite: true, altText: 'Preview image' });

  const call = etsy.calls[0];
  assert.equal(call.path, '/shops/456/listings/999/images');
  assert.equal(call.options.method, 'POST');
  assert.ok(call.options.body instanceof FormData);
  assert.equal(call.options.body.get('rank'), '1');
  assert.equal(call.options.body.get('overwrite'), 'true');
  assert.equal(call.options.body.get('alt_text'), 'Preview image');
});

test('uploadListingFile validates Etsy digital filename rules and builds multipart request', async () => {
  const etsy = makeEtsy();
  await uploadListingFile(etsy, 999, {
    bytes: Buffer.from('zip-data'),
    filename: 'Nexa_Business_OS.zip',
    contentType: 'application/zip',
  }, { rank: 1 });

  const call = etsy.calls[0];
  assert.equal(call.path, '/shops/456/listings/999/files');
  assert.equal(call.options.method, 'POST');
  assert.ok(call.options.body instanceof FormData);
  assert.equal(call.options.body.get('name'), 'Nexa_Business_OS.zip');
  assert.equal(call.options.body.get('rank'), '1');

  await assert.rejects(
    () => uploadListingFile(etsy, 999, { bytes: Buffer.from('x'), filename: 'bad file name.zip' }),
    /Digital filename must be/,
  );
});

test('file/image read-delete helpers call expected endpoints', async () => {
  const etsy = makeEtsy();
  await getListingFiles(etsy, 999);
  await deleteListingFile(etsy, 999, 111);
  await deleteListingImage(etsy, 999, 222);

  assert.deepEqual(etsy.calls.map((call) => [call.path, call.options.method || 'GET']), [
    ['/shops/456/listings/999/files', 'GET'],
    ['/shops/456/listings/999/files/111', 'DELETE'],
    ['/shops/456/listings/999/images/222', 'DELETE'],
  ]);
});
