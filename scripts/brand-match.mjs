/**
 * Brand matching helpers for scripts/apply-vendors.mjs.
 *
 * The brand list is read from snippets/brand-list.liquid, so the theme's Brand
 * filter and this script always agree on which brands exist.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND_LIST_FILE = path.join(ROOT, 'snippets', 'brand-list.liquid');

const raw = await readFile(BRAND_LIST_FILE, 'utf8');
const withoutComments = raw.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');

export const brands = withoutComments
  .split(',')
  .map((brand) => brand.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

if (brands.length === 0) {
  throw new Error(`No brands found in ${BRAND_LIST_FILE}.`);
}

// Brands whose name is also a common word. They are still matched from an
// exact product tag (a tag saying "ring" really means the brand), but never
// guessed from a title, where "ring light" or "Cat 6 cable" would be wrong.
const SKIP_TITLE_MATCH = new Set([
  'ring',
  'blue',
  'trust',
  'cat',
  'framework',
  'poly',
  'nomad',
  'glorious',
  'astro',
]);

// Product lines that do not contain the vendor name.
const ALIASES = [
  [/\biphone\b/i, 'Apple'],
  [/\bipad\b/i, 'Apple'],
  [/\bmacbook\b/i, 'Apple'],
  [/\bairpods?\b/i, 'Apple'],
  [/\bimac\b/i, 'Apple'],
  [/\bgalaxy\b/i, 'Samsung'],
  [/\bplaystation\b/i, 'Sony'],
  [/\bps[45]\b/i, 'Sony'],
  [/\bxbox\b/i, 'Microsoft'],
  [/\bsurface\b/i, 'Microsoft'],
  [/\bsteam deck\b/i, 'Valve'],
  [/\bnintendo switch\b/i, 'Nintendo'],
  [/\bpixel\b/i, 'Google'],
  [/\bkindle\b/i, 'Amazon'],
  [/\bthinkpad\b/i, 'Lenovo'],
  [/\bideapad\b/i, 'Lenovo'],
  [/\blegion\b/i, 'Lenovo'],
  [/\bpavilion\b/i, 'HP'],
  [/\belitebook\b/i, 'HP'],
  [/\bomen\b/i, 'HP'],
  [/\bultragear\b/i, 'LG'],
  [/\bultra gear\b/i, 'LG'],
  [/\bpredator\b/i, 'Acer'],
  [/\bnitro\b/i, 'Acer'],
  [/\bzenbook\b/i, 'Asus'],
  [/\brog\b/i, 'Asus'],
  [/\btuf\b/i, 'Asus'],
  [/\bredmi\b/i, 'Redmi'],
  [/\bpoco\b/i, 'POCO'],
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const brandMatchers = brands
  .map((brand) => ({
    brand,
    lower: brand.toLowerCase(),
    pattern: new RegExp(`(^|[^a-z0-9])${escapeRegExp(brand.toLowerCase())}([^a-z0-9]|$)`, 'i'),
  }))
  .sort((a, b) => b.brand.length - a.brand.length);

/**
 * @param {string} title
 * @param {string[]} tags
 * @returns {{ brand: string, source: 'title' | 'tag' } | null}
 */
export function detectBrand(title, tags) {
  const titleText = String(title || '');
  const lowerTitle = titleText.toLowerCase();

  for (const [pattern, brand] of ALIASES) {
    if (!pattern.test(titleText)) continue;
    const target = brands.find((name) => name.toLowerCase() === brand.toLowerCase());
    if (target) return { brand: target, source: 'title' };
  }

  for (const tag of tags || []) {
    const cleanTag = String(tag).trim().toLowerCase();
    const match = brands.find((brand) => brand.toLowerCase() === cleanTag);
    if (match) return { brand: match, source: 'tag' };
  }

  for (const matcher of brandMatchers) {
    if (SKIP_TITLE_MATCH.has(matcher.lower)) continue;
    if (matcher.pattern.test(lowerTitle)) return { brand: matcher.brand, source: 'title' };
  }

  return null;
}
