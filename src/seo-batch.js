import { loadConfig } from './config.js';
import { EtsyClient } from './etsy.js';
import { EtsyService } from './etsy-service.js';
import { EncryptedFileTokenStore } from './token-store.js';

const config = loadConfig();
if (!config.etsyWriteEnabled) {
  throw new Error('ETSY_WRITE_ENABLED must be true to run SEO batch');
}

const client = new EtsyClient(config.etsy);
const tokenStore = new EncryptedFileTokenStore(config.tokenStorePath, config.tokenEncryptionSecret);
const etsy = new EtsyService(client, tokenStore);

const updates = [
  {
    listing_id: 4568848990,
    title: 'Pet Sitting & Dog Walking Business Spreadsheet | Client CRM, Visit Tracker, Route Planner and Profit',
    tags: ['pet sitting biz','dog walking biz','pet sitter template','dog walker template','pet client crm','visit tracker','route planner','booking tracker','pet care sheet','client tracker','profit tracker','service business','pet business excel'],
  },
  {
    listing_id: 4568796724,
    title: 'Personal Trainer Business Spreadsheet | Client Tracker, Session Planner, Pricing & Profit',
    tags: ['personal trainer','trainer spreadsheet','fitness coach','client tracker','session tracker','fitness client crm','package pricing','online coach','coaching business','profit tracker','client onboarding','fitness spreadsheet','trainer business'],
  },
  {
    listing_id: 4568777987,
    title: 'Photography Business Spreadsheet | Client CRM, Pricing, Bookings, Workflow & Profit',
    tags: ['photography business','photographer crm','photo client tracker','pricing calculator','booking tracker','wedding photographer','portrait business','photo spreadsheet','profit tracker','editing workflow','photography excel','photography planner','photo pricing'],
  },
  {
    listing_id: 4568773079,
    title: 'Handyman Business Spreadsheet | Estimate Calculator, Job Costing, Work Orders & Profit',
    tags: ['handyman business','handyman spreadsheet','handyman estimate','estimate calculator','job costing','work order','contractor template','material markup','profit tracker','property maintenance','expense tracker','client tracker','handyman pricing'],
  },
  {
    listing_id: 4568783748,
    title: 'Painting Contractor Spreadsheet | Estimate Calculator, Job Costing, Change Orders & Profit',
    tags: ['painting contractor','painting business','painting estimate','painter spreadsheet','estimate calculator','job costing','change order','painting template','profit tracker','job cost tracker','painting pricing','paint quote template','contractor excel'],
  },
  {
    listing_id: 4568765879,
    title: 'Dog Grooming Business Spreadsheet | Client CRM, Appointments, Pricing & Profit Tracker',
    tags: ['dog grooming','grooming business','dog groomer','groomer spreadsheet','appointment tracker','pet client crm','grooming template','profit tracker','booking spreadsheet','dog grooming excel','grooming pricing','dog grooming crm','pet grooming excel'],
  },
  {
    listing_id: 4568762647,
    title: 'Lawn Care Business Spreadsheet | Landscaping CRM, Quote Calculator, Routes & Profit',
    tags: ['lawn care business','landscaping business','lawn spreadsheet','landscaping excel','quote calculator','route planner','job costing','profit tracker','mowing business','expense tracker','client tracker','lawn care template','lawn care crm'],
  },
  {
    listing_id: 4568754215,
    title: 'Pressure Washing Business Spreadsheet | Quote Calculator, Job Tracker, CRM & Profit',
    tags: ['pressure washing','power washing','pressure wash biz','pressure wash quote','quote calculator','job tracker','job costing','client crm','profit tracker','expense tracker','pricing spreadsheet','pressure wash crm','soft wash business'],
  },
  {
    listing_id: 4568239533,
    title: 'Mobile Detailing Business Spreadsheet | Quote Calculator, Client CRM, Job Tracker & Profit',
    tags: ['mobile detailing','detailing business','auto detailing','detail spreadsheet','detailing template','quote calculator','job tracker','client crm','profit tracker','expense tracker','detailing pricing','auto detail template','business spreadsheet'],
  },
  {
    listing_id: 4568212420,
    title: 'Cleaning Business Spreadsheet | Quote Calculator, Client CRM, Job Tracker & Profit',
    tags: ['cleaning business','cleaning spreadsheet','cleaning template','cleaning quote','quote calculator','cleaning pricing','client crm','job tracker','profit tracker','expense tracker','house cleaning','cleaning service','business spreadsheet'],
  },
];

function sameTags(a, b) {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);
}

const results = [];
for (const target of updates) {
  try {
    const current = await etsy.getListing(target.listing_id, { includes: [] });
    const titleChanged = current?.title !== target.title;
    const tagsChanged = !sameTags(current?.tags || [], target.tags);
    if (!titleChanged && !tagsChanged) {
      results.push({ listing_id: target.listing_id, status: 'unchanged' });
      continue;
    }
    await etsy.updateListing(target.listing_id, { title: target.title, tags: target.tags });
    results.push({ listing_id: target.listing_id, status: 'updated', titleChanged, tagsChanged });
  } catch (error) {
    results.push({
      listing_id: target.listing_id,
      status: 'error',
      http_status: error?.status ?? null,
      message: error?.message ?? 'unknown',
      api_error: typeof error?.body === 'object' && error.body ? error.body.error ?? error.body.message ?? null : null,
    });
  }
}

console.log(`ETSY_SEO_BATCH ${JSON.stringify({ updated_at: new Date().toISOString(), results })}`);
