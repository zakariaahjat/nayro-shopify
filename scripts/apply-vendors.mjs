#!/usr/bin/env node
/**
 * Apply brand names to products: sets each product's Vendor so the storefront
 * Brand filter (/collections/vendors?q=Brand) actually returns products.
 *
 * The list of brands comes from snippets/brand-list.liquid, which is the same
 * list the theme renders in the Brand filter. A product is matched when its
 * title (or one of its tags) contains a brand name, e.g.
 * "Samsung Galaxy S24 Ultra" -> vendor "Samsung".
 *
 * Dry run by default: it prints what it would change and writes nothing.
 *
 * Required environment variables:
 *   SHOPIFY_STORE_DOMAIN     e.g. jq5gaa-01.myshopify.com
 *
 *   and either SHOPIFY_ADMIN_API_TOKEN, or
 *   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev Dashboard app, exchanged for
 *   a 24h token automatically by scripts/shopify-auth.mjs)
 *
 * Optional:
 *   SHOPIFY_STORE_NAME       generic vendor to replace (default: My Store 2)
 *   SHOPIFY_API_VERSION      default: 2026-10
 *
 * Usage:
 *   node scripts/apply-vendors.mjs                  # preview
 *   node scripts/apply-vendors.mjs --apply          # write to Shopify
 *   node scripts/apply-vendors.mjs --apply --overwrite
 *   node scripts/apply-vendors.mjs --report vendor-report.csv
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brands, detectBrand } from './brand-match.mjs';
import { getAccessToken } from './shopify-auth.mjs';

const STORE = (process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');
const API_VERSION = (process.env.SHOPIFY_API_VERSION || '2026-10').trim();
const STORE_NAME = (process.env.SHOPIFY_STORE_NAME || 'My Store 2').trim();

const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const reportIndex = process.argv.indexOf('--report');
const REPORT_FILE = reportIndex !== -1 ? process.argv[reportIndex + 1] || '' : '';

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\n\u2716 ${message}\n`);
  process.exit(1);
}

if (!STORE) fail('SHOPIFY_STORE_DOMAIN is missing.');

/* -------------------------------------------------------------------------- */
/* Admin API                                                                   */
/* -------------------------------------------------------------------------- */

async function graphql(query, variables, attempt = 0) {
  let token;
  try {
    token = await getAccessToken();
  } catch (error) {
    if (error.isConfiguration) fail(error.message);
    throw error;
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429 || response.status === 430) {
    if (attempt >= 5) fail(`Shopify rate limit: giving up after ${attempt} retries.`);
    const wait = 2000 * (attempt + 1);
    console.log(`   rate limited, waiting ${wait / 1000}s...`);
    await sleep(wait);
    return graphql(query, variables, attempt + 1);
  }

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    fail(`Shopify returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const detail = payload?.errors ? JSON.stringify(payload.errors).slice(0, 500) : text.slice(0, 300);
    fail(`Shopify returned HTTP ${response.status}: ${detail}`);
  }
  if (payload.errors?.length) {
    fail(`GraphQL error: ${JSON.stringify(payload.errors).slice(0, 500)}`);
  }
  return payload.data;
}

const PRODUCTS_QUERY = `#graphql
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle vendor tags }
    }
  }
`;

const UPDATE_MUTATION = `#graphql
  mutation SetVendor($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id vendor }
      userErrors { field message }
    }
  }
`;

async function fetchProducts() {
  const products = [];
  let cursor = null;
  do {
    const data = await graphql(PRODUCTS_QUERY, { cursor });
    const page = data.products;
    products.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    process.stdout.write(`\rFetched ${products.length} products...`);
  } while (cursor);
  process.stdout.write('\n');
  return products;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

console.log('\nNayro vendors');
console.log(`  store:  ${STORE}`);
console.log(`  brands: ${brands.length} (from snippets/brand-list.liquid)`);
console.log(`  mode:   ${APPLY ? 'APPLY (writing to Shopify)' : 'dry run (nothing is written)'}`);
console.log(`  overwrite existing vendors: ${OVERWRITE ? 'yes' : 'no'}\n`);

const products = await fetchProducts();
const rows = [];
let updated = 0;
let skipped = 0;
let unmatched = 0;

for (const product of products) {
  const detection = detectBrand(product.title, product.tags);
  const currentVendor = String(product.vendor || '').trim();
  const genericVendor = currentVendor === '' || currentVendor.toLowerCase() === STORE_NAME.toLowerCase();
  const alreadyBrand = brands.some((brand) => brand.toLowerCase() === currentVendor.toLowerCase());

  if (!detection) {
    unmatched += 1;
    rows.push({ product, brand: '', action: 'no brand in title', currentVendor });
    continue;
  }

  if (currentVendor === detection.brand) {
    skipped += 1;
    rows.push({ product, brand: detection.brand, action: 'already set', currentVendor });
    continue;
  }

  if (!genericVendor && !OVERWRITE) {
    skipped += 1;
    rows.push({
      product,
      brand: detection.brand,
      action: alreadyBrand ? `kept ${currentVendor}` : 'skipped custom vendor',
      currentVendor,
    });
    continue;
  }

  if (!APPLY) {
    updated += 1;
    rows.push({ product, brand: detection.brand, action: 'would set', currentVendor });
    continue;
  }

  const data = await graphql(UPDATE_MUTATION, {
    input: { id: product.id, vendor: detection.brand },
  });
  const errors = data.productUpdate.userErrors || [];
  if (errors.length > 0) {
    rows.push({
      product,
      brand: detection.brand,
      action: `error: ${errors.map((error) => error.message).join('; ')}`,
      currentVendor,
    });
    continue;
  }

  updated += 1;
  rows.push({ product, brand: detection.brand, action: 'updated', currentVendor });
  await sleep(250);
}

const pad = (value, width) => String(value).padEnd(width).slice(0, width);
console.log(`\n${pad('PRODUCT', 52)} ${pad('VENDOR', 18)} ${pad('FROM', 18)} ACTION`);
console.log('-'.repeat(110));
for (const row of rows) {
  console.log(
    `${pad(row.product.title, 52)} ${pad(row.brand || '-', 18)} ${pad(row.currentVendor || '-', 18)} ${row.action}`
  );
}

console.log(`\nTotal products: ${products.length}`);
console.log(`  ${APPLY ? 'updated' : 'would update'}: ${updated}`);
console.log(`  already fine / kept: ${skipped}`);
console.log(`  no brand in title or tags: ${unmatched}`);

if (unmatched > 0) {
  console.log('\nProducts without a brand in the title or tags need the Vendor set by hand:');
  console.log('  Products -> open the product -> Product organization -> Vendor.');
}

if (REPORT_FILE) {
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    'handle,title,current_vendor,detected_brand,action',
    ...rows.map((row) =>
      [row.product.handle, row.product.title, row.currentVendor, row.brand, row.action].map(escapeCsv).join(',')
    ),
  ].join('\n');
  await writeFile(path.resolve(REPORT_FILE), `${csv}\n`, 'utf8');
  console.log(`\nReport written to ${path.resolve(REPORT_FILE)}`);
}

if (!APPLY) {
  console.log('\nNothing was changed. Run with --apply to write these vendors to Shopify.\n');
}
