#!/usr/bin/env node
/**
 * Auto blog: pulls the newest posts from the RSS/Atom feeds in
 * scripts/blog-sources.mjs and publishes them to a Shopify blog.
 *
 * Each post is a short excerpt, the source name and a link to the original
 * article. Full articles are never copied, so the blog stays on the right side
 * of copyright and does not compete with the source for SEO.
 *
 * Required environment variables (not needed with --dry-run):
 *   SHOPIFY_STORE_DOMAIN         e.g. jq5gaa-01.myshopify.com
 *
 *   and either
 *     SHOPIFY_ADMIN_API_TOKEN    custom app token (shpat_...)
 *   or
 *     SHOPIFY_CLIENT_ID          Dev Dashboard app client ID
 *     SHOPIFY_CLIENT_SECRET      Dev Dashboard app client secret
 *   (the client credentials are exchanged for a 24h token automatically)
 *
 * Optional:
 *   SHOPIFY_BLOG_HANDLE      default: news
 *   SHOPIFY_BLOG_TITLE       default: Nayro Blog
 *   SHOPIFY_API_VERSION      default: 2026-10
 *
 * Usage:
 *   node scripts/auto-blog.mjs --dry-run
 *   node scripts/auto-blog.mjs --limit 3 --lang fr
 *   node scripts/auto-blog.mjs --limit 3 --lang fr --draft
 *   node scripts/auto-blog.mjs --source numerama,frandroid
 */

import { createHash } from 'node:crypto';
import { sources, sourceByKey } from './blog-sources.mjs';
import { getAccessToken } from './shopify-auth.mjs';

const STORE = (process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');
const API_VERSION = (process.env.SHOPIFY_API_VERSION || '2026-10').trim();
const BLOG_HANDLE = (process.env.SHOPIFY_BLOG_HANDLE || 'news').trim();
const BLOG_TITLE = (process.env.SHOPIFY_BLOG_TITLE || 'Nayro Blog').trim();

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

/* -------------------------------------------------------------------------- */
/* Arguments                                                                   */
/* -------------------------------------------------------------------------- */

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

const DRY_RUN = process.argv.includes('--dry-run');
const DRAFT = process.argv.includes('--draft');
const LIMIT = Math.max(1, Number.parseInt(option('limit', '3'), 10) || 3);
const PER_SOURCE = Math.max(1, Number.parseInt(option('per-source', '1'), 10) || 1);
const MAX_AGE_HOURS = Math.max(1, Number.parseInt(option('max-age-hours', '48'), 10) || 48);
const EXCERPT_LENGTH = Math.max(200, Number.parseInt(option('excerpt-length', '700'), 10) || 700);
const MAX_PER_DAY = (() => {
  const parsed = Number.parseInt(option('max-per-day', '6'), 10);
  return Number.isNaN(parsed) ? 6 : Math.max(0, parsed);
})();
const MIN_GAP_MINUTES = (() => {
  const parsed = Number.parseInt(option('min-gap-minutes', '120'), 10);
  return Number.isNaN(parsed) ? 120 : Math.max(0, parsed);
})();
const LANG = String(option('lang', 'fr')).toLowerCase();
const ONLY_SOURCES = String(option('source', ''))
  .split(',')
  .map((key) => key.trim().toLowerCase())
  .filter(Boolean);

// Keywords from the WordPress-style setup: an article is imported only when its
// title or summary mentions one of them. Accents and case are ignored, so
// "téléphone" matches "telephone" and "Telephone". Use --keywords to replace the
// list, or --no-keywords to import every recent article.
const DEFAULT_KEYWORDS = [
  'phone',
  'smartphone',
  'mobile',
  'téléphone',
  'laptop',
  'ordinateur portable',
  'pc',
  'computer',
  'ordinateur',
  'cable',
  'câble',
  'charger',
  'chargeur',
  'usb-c',
  'accessory',
  'accessoire',
  'gpu',
  'graphics card',
  'carte graphique',
  'launch',
  'lancement',
  'brand',
  'marque',
  'product',
  'produit',
  'tech',
  'technology',
  'technologie',
];

const KEYWORD_INPUT = String(option('keywords', ''))
  .split(',')
  .map((keyword) => keyword.trim())
  .filter(Boolean);

const KEYWORD_LIST = process.argv.includes('--no-keywords')
  ? []
  : (KEYWORD_INPUT.length > 0 ? KEYWORD_INPUT : DEFAULT_KEYWORDS).map((keyword) => normalizeText(keyword));

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word matching, so "pc" does not match inside "apc" or "gpc".
const KEYWORD_PATTERNS = KEYWORD_LIST.map(
  (keyword) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`)
);

// Broad keywords like "tech" also catch non-product filler (puzzles, word
// games). Those are dropped even when a keyword matches.
const DEFAULT_EXCLUDES = ['nyt connections', 'wordle', 'crossword', 'sudoku', 'horoscope', 'connections hints'];

const EXCLUDES = (process.argv.includes('--no-exclude')
  ? []
  : String(option('exclude', '') || DEFAULT_EXCLUDES.join(','))
      .split(',')
      .map((value) => normalizeText(value.trim()))
      .filter(Boolean)
);

function isExcluded(item) {
  if (EXCLUDES.length === 0) return false;
  const haystack = normalizeText(`${item.title} ${item.text}`);
  return EXCLUDES.some((value) => haystack.includes(value));
}

function matchesKeywords(item) {
  if (KEYWORD_PATTERNS.length === 0) return true;
  const site = normalizeText(item.source?.name || '');
  const haystack = normalizeText(
    `${item.title} ${(item.categories || []).join(' ')} ${item.text}`
  )
    .split(site)
    .join(' ');
  return KEYWORD_PATTERNS.some((pattern) => pattern.test(haystack));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\n\u2716 ${message}\n`);
  process.exit(1);
}

const selectedSources = sources.filter((source) => {
  if (ONLY_SOURCES.length > 0 && !ONLY_SOURCES.includes(source.key)) return false;
  if (LANG === 'all' || LANG === '*') return true;
  return source.lang === LANG;
});

if (selectedSources.length === 0) {
  fail(`No sources match lang="${LANG}" and --source="${ONLY_SOURCES.join(',')}".`);
}

/* -------------------------------------------------------------------------- */
/* Feed parsing                                                               */
/* -------------------------------------------------------------------------- */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  laquo: '\u00ab',
  raquo: '\u00bb',
  eacute: '\u00e9',
  egrave: '\u00e8',
  agrave: '\u00e0',
  ccedil: '\u00e7',
  ecirc: '\u00ea',
  ocirc: '\u00f4',
  icirc: '\u00ee',
  ugrave: '\u00f9',
  euro: '\u20ac',
  deg: '\u00b0',
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function cleanCdata(value) {
  return decodeEntities(
    String(value || '')
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
  ).trim();
}

function stripHtml(value) {
  return decodeEntities(
    String(value || '')
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPublisher(title, source) {
  if (!source?.stripPublisher) return title;
  return title.replace(/\s+[-\u2013\u2014]\s+[^-\u2013\u2014]{2,40}$/, '').trim() || title;
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceEnd > maxLength * 0.55) return slice.slice(0, sentenceEnd + 1).trim();
  const wordEnd = slice.lastIndexOf(' ');
  return `${(wordEnd > 0 ? slice.slice(0, wordEnd) : slice).trim()}\u2026`;
}

function tagText(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? cleanCdata(match[1]) : '';
}

function attrValue(markup, attribute) {
  const match = markup.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function firstImage(block, content) {
  const media = block.match(/<media:(?:content|thumbnail)[^>]*>/i);
  if (media) {
    const url = attrValue(media[0], 'url');
    if (/^https?:\/\//i.test(url)) return url;
  }

  for (const enclosure of block.match(/<enclosure[^>]*>/gi) || []) {
    const type = attrValue(enclosure, 'type');
    const url = attrValue(enclosure, 'url');
    if (/^image\//i.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) {
      if (/^https?:\/\//i.test(url)) return url;
    }
  }

  const img = String(content || '').match(/<img[^>]+>/i);
  if (img) {
    const src = attrValue(img[0], 'src') || attrValue(img[0], 'data-src');
    if (/^https?:\/\//i.test(src)) return src;
  }

  return '';
}

function parseDate(value) {
  const time = Date.parse(String(value || '').trim());
  return Number.isNaN(time) ? null : new Date(time);
}

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return '';
}

// Google News only gives redirect links and a title-plus-publisher summary.
// Follow the redirect once so the article links to the real publisher and use
// that page's own description as the excerpt.
async function resolveArticle(item) {
  const response = await fetch(item.link, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NayroBlogBot/1.0; +https://nayro.com)',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const finalUrl = response.url || item.link;
  const isPublisherUrl = /^https?:\/\//i.test(finalUrl) && !/news\.google\.com/i.test(finalUrl);
  if (!isPublisherUrl) return item;

  const html = await response.text();
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  const image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');

  return {
    ...item,
    link: finalUrl,
    text: description ? stripHtml(description) : item.text,
    image: item.image || image,
  };
}

function parseFeed(xml, source) {
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blockPattern = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockPattern) || [];

  const items = [];
  for (const block of blocks) {
    const title = stripPublisher(stripHtml(tagText(block, 'title')), source);
    if (!title) continue;

    let link = tagText(block, 'link');
    if (!link) {
      const linkTags = block.match(/<link[^>]*>/gi) || [];
      const preferred =
        linkTags.find((tag) => /rel\s*=\s*["']alternate["']/i.test(tag)) ||
        linkTags.find((tag) => !/rel\s*=\s*["']self["']/i.test(tag)) ||
        linkTags[0];
      link = preferred ? attrValue(preferred, 'href') : '';
    }
    if (!/^https?:\/\//i.test(link)) continue;

    const rawContent =
      tagText(block, 'content:encoded') || tagText(block, 'content') || tagText(block, 'description');
    const description = tagText(block, 'description') || tagText(block, 'summary') || rawContent;

    const summaryText = stripHtml(description);
    const contentText = stripHtml(rawContent);
    let text = summaryText.length >= 140 ? summaryText : contentText || summaryText;

    // Google News summaries are just "Headline Publisher" plus a boilerplate
    // line, so they add nothing on top of the title.
    if (source.stripPublisher) {
      if (/comprehensive up-to-date news coverage/i.test(text)) text = '';
      const prefix = `${title} `;
      if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = text.slice(prefix.length).trim();
        text = rest.length > 80 ? rest : '';
      }
    }

    if (!text && !source.stripPublisher) continue;

    const dateValue =
      tagText(block, 'pubDate') ||
      tagText(block, 'published') ||
      tagText(block, 'updated') ||
      tagText(block, 'dc:date');
    const date = parseDate(dateValue) || new Date(0);

    const categories = [];
    for (const match of block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)) {
      categories.push(stripHtml(cleanCdata(match[1])));
    }
    for (const match of block.matchAll(/<category[^>]*term\s*=\s*["']([^"']+)["'][^>]*\/?>/gi)) {
      categories.push(decodeEntities(match[1]));
    }

    items.push({
      source,
      title,
      link,
      feedLink: link,
      date,
      text,
      image: firstImage(block, rawContent),
      categories: categories.map((category) => category.trim()).filter(Boolean),
    });
  }

  return items;
}

async function loadSource(source) {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NayroBlogBot/1.0; +https://nayro.com)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(25_000),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  const items = parseFeed(xml, source);
  if (items.length === 0) throw new Error('no items in feed');
  return items;
}

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

function articleHandle(link) {
  const hash = createHash('sha1').update(link).digest('hex').slice(0, 6);
  const slug = slugify(new URL(link).pathname.split('/').filter(Boolean).pop()?.replace(/\.\w+$/, '') || '');
  return slug ? `${slug}-${hash}` : `post-${hash}`;
}

function buildTags(item) {
  const raw = ['auto-blog', `source-${item.source.key}`, `lang-${item.source.lang}`, ...(item.source.tags || []), ...item.categories];
  const seen = new Set();
  const tags = [];
  for (const tag of raw) {
    const clean = String(tag).replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    tags.push(clean);
    if (tags.length >= 8) break;
  }
  return tags;
}

/* -------------------------------------------------------------------------- */
/* Admin API                                                                  */
/* -------------------------------------------------------------------------- */

async function adminRequest(query, variables = {}, attempt = 0) {
  if (!STORE) fail('SHOPIFY_STORE_DOMAIN is required (or use --dry-run).');

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

  const raw = await response.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Shopify returned a non-JSON response (HTTP ${response.status}): ${raw.slice(0, 300)}`);
  }

  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep(1000 * 2 ** attempt);
      return adminRequest(query, variables, attempt + 1);
    }
    throw new Error(`Shopify HTTP ${response.status}: ${raw.slice(0, 500)}`);
  }

  if (json.errors?.length) {
    const throttled = json.errors.some((error) => error.extensions?.code === 'THROTTLED');
    if (throttled && attempt < 4) {
      await sleep(2000 * (attempt + 1));
      return adminRequest(query, variables, attempt + 1);
    }
    throw new Error(`Shopify GraphQL error: ${json.errors.map((error) => error.message).join('; ')}`);
  }

  return json.data;
}

function assertNoUserErrors(payload, label) {
  const errors = payload?.userErrors || [];
  if (errors.length > 0) {
    const details = errors
      .map((error) => [error.field?.join('.'), error.message].filter(Boolean).join(': '))
      .join('; ');
    throw new Error(`${label} failed: ${details}`);
  }
}

async function getOrCreateBlog() {
  const data = await adminRequest(
    `query BlogByHandle($handle: String!) {
      blogByHandle(handle: $handle) { id handle title }
    }`,
    { handle: BLOG_HANDLE }
  );

  if (data.blogByHandle) return data.blogByHandle;

  const created = await adminRequest(
    `mutation BlogCreate($blog: BlogCreateInput!) {
      blogCreate(blog: $blog) {
        blog { id handle title }
        userErrors { field message }
      }
    }`,
    { blog: { title: BLOG_TITLE, handle: BLOG_HANDLE } }
  );
  assertNoUserErrors(created.blogCreate, 'blogCreate');
  return created.blogCreate.blog;
}

async function getBlogState(blogId) {
  const handles = new Set();
  let publishedToday = 0;
  let latestCreatedAt = 0;
  const since = Date.now() - 24 * 3600 * 1000;
  let cursor = null;
  do {
    const data = await adminRequest(
      `query BlogArticles($id: ID!, $cursor: String) {
        blog(id: $id) {
          articles(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { handle createdAt tags }
          }
        }
      }`,
      { id: blogId, cursor }
    );
    const page = data.blog?.articles;
    if (!page) break;
    for (const node of page.nodes) {
      handles.add(node.handle);
      const tags = (node.tags || []).map((tag) => String(tag).toLowerCase());
      if (!tags.includes('auto-blog')) continue;
      const created = Date.parse(node.createdAt || '');
      if (Number.isNaN(created)) continue;
      if (created >= since) publishedToday += 1;
      if (created > latestCreatedAt) latestCreatedAt = created;
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return { handles, publishedToday, latestCreatedAt };
}

async function createArticle(input) {
  const data = await adminRequest(
    `mutation ArticleCreate($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id handle title }
        userErrors { field message }
      }
    }`,
    { article: input }
  );
  return data.articleCreate;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

console.log('\nNayro auto blog');
console.log(`  language:    ${LANG}`);
console.log(`  sources:     ${selectedSources.length}`);
console.log(`  limit:       ${LIMIT} post(s) per run, ${PER_SOURCE} per source`);
console.log(`  max age:     ${MAX_AGE_HOURS}h`);
console.log(`  keywords:    ${KEYWORD_LIST.length === 0 ? 'off (every article)' : `${KEYWORD_LIST.length} active`}`);
console.log(`  max per day: ${MAX_PER_DAY === 0 ? 'unlimited' : MAX_PER_DAY}`);
console.log(`  min gap:     ${MIN_GAP_MINUTES === 0 ? 'none' : `${MIN_GAP_MINUTES} min between posts`}`);
console.log(`  mode:        ${DRY_RUN ? 'dry run (nothing is published)' : DRAFT ? 'draft' : 'publish'}\n`);

const loaded = await Promise.allSettled(selectedSources.map((source) => loadSource(source)));

const cutoff = Date.now() - MAX_AGE_HOURS * 3600 * 1000;
const perSource = [];

for (let index = 0; index < loaded.length; index += 1) {
  const source = selectedSources[index];
  const result = loaded[index];
  if (result.status === 'rejected') {
    console.log(`  ! ${source.key.padEnd(16)} ${result.reason?.message || 'failed'}`);
    continue;
  }

  const recent = result.value
    .filter((item) => item.date.getTime() >= cutoff)
    .filter((item) => item.date.getTime() <= Date.now() + 3600 * 1000)
    .sort((a, b) => b.date - a.date);

  const items = recent.filter((item) => !isExcluded(item) && matchesKeywords(item));
  const skipped = recent.length - items.length;
  console.log(
    `  \u2713 ${source.key.padEnd(16)} ${items.length} matching item(s)` +
      (skipped > 0 ? ` (${skipped} off-keyword)` : '')
  );
  perSource.push({ source, items });
}

let existingHandles = new Set();
let publishedToday = 0;
let latestCreatedAt = 0;
let blog = null;
if (!DRY_RUN) {
  blog = await getOrCreateBlog();
  console.log(`\nBlog: "${blog.title}" (/blogs/${blog.handle})`);
  const state = await getBlogState(blog.id);
  existingHandles = state.handles;
  publishedToday = state.publishedToday;
  latestCreatedAt = state.latestCreatedAt;
  console.log(`Existing articles: ${existingHandles.size}`);
  console.log(`Published by auto-blog in the last 24h: ${publishedToday}/${MAX_PER_DAY || '\u221e'}`);
  if (MIN_GAP_MINUTES > 0 && latestCreatedAt > 0) {
    const minutesAgo = Math.round((Date.now() - latestCreatedAt) / 60000);
    console.log(`Last auto post: ${minutesAgo} min ago (minimum gap ${MIN_GAP_MINUTES} min)`);
    if (minutesAgo < MIN_GAP_MINUTES) {
      console.log(`\nWaiting: the next post is possible in ${MIN_GAP_MINUTES - minutesAgo} min.`);
      process.exit(0);
    }
  }
  console.log('');
} else {
  console.log('');
}

const remainingToday = MAX_PER_DAY === 0 ? Number.POSITIVE_INFINITY : Math.max(0, MAX_PER_DAY - publishedToday);
const runCapacity = Math.min(LIMIT, remainingToday);

const candidates = [];
const seenHandles = new Set();
const seenTitles = new Set();
for (const { source, items } of perSource) {
  let picked = 0;
  for (const item of items) {
    if (picked >= PER_SOURCE) break;
    const handle = articleHandle(item.feedLink || item.link);
    const titleKey = normalizeText(item.title).replace(/[^a-z0-9]+/g, ' ').trim();
    if (existingHandles.has(handle) || seenHandles.has(handle) || seenTitles.has(titleKey)) continue;
    seenHandles.add(handle);
    seenTitles.add(titleKey);
    candidates.push({ ...item, handle, excerpt: truncate(item.text, EXCERPT_LENGTH) });
    picked += 1;
  }
}

candidates.sort((a, b) => b.date - a.date);
const chosen = candidates.slice(0, runCapacity);

if (chosen.length === 0) {
  if (remainingToday === 0) {
    console.log(`Daily cap reached (${MAX_PER_DAY} posts in 24h). Nothing to do.`);
  } else {
    console.log('Nothing new to publish.');
  }
  process.exit(0);
}

let created = 0;
let failed = 0;

for (const original of chosen) {
  let post = original;

  if (post.source.resolveArticle) {
    try {
      post = await resolveArticle(post);
      post.handle = original.handle;
      post.excerpt = truncate(post.text, EXCERPT_LENGTH);
    } catch (error) {
      console.log(`    ! could not resolve ${post.source.name} link: ${error.message}`);
    }
  }

  const language = post.source.lang;
  const body = [
    ...(post.excerpt ? [`<p>${escapeHtml(post.excerpt)}</p>`] : []),
    `<p><em>Source\u00a0: ${escapeHtml(post.source.name)}</em> \u2014 <a href="${escapeHtml(post.link)}" rel="nofollow noopener" target="_blank">${
      language === 'fr' ? "Lire l'article complet" : 'Read the full article'
    }</a></p>`,
  ].join('\n');

  const input = {
    blogId: undefined,
    title: post.title,
    handle: post.handle,
    author: { name: post.source.name },
    body,
    summary: truncate(post.excerpt || post.title, 200),
    tags: buildTags(post),
    isPublished: !DRAFT,
    publishDate: post.date.toISOString(),
  };

  console.log(`\n  ${DRY_RUN ? '+' : '-'} ${post.title}`);
  console.log(`    source: ${post.source.name}  |  ${post.date.toISOString()}  |  ${post.link}`);

  if (DRY_RUN) {
    console.log(`    ${post.excerpt ? post.excerpt.slice(0, 160) + (post.excerpt.length > 160 ? '\u2026' : '') : '(no summary in feed)'}`);
    created += 1;
    continue;
  }

  input.blogId = blog.id;

  try {
    const result = await createArticle({
      ...input,
      ...(post.image ? { image: { url: post.image, altText: post.title } } : {}),
    });

    if ((result.userErrors || []).length > 0 && post.image) {
      // A broken remote image must not lose the whole article.
      const retry = await createArticle(input);
      assertNoUserErrors(retry, `articleCreate ${post.handle}`);
    } else {
      assertNoUserErrors(result, `articleCreate ${post.handle}`);
    }

    created += 1;
    console.log('    published');
  } catch (error) {
    failed += 1;
    console.error(`    \u2716 ${error.message}`);
  }

  await sleep(500);
}

console.log(`\nDone. ${DRY_RUN ? 'would publish' : 'published'} ${created}, failed ${failed}.`);
if (!DRY_RUN && created > 0) console.log(`View: https://${STORE}/blogs/${BLOG_HANDLE}\n`);
if (failed > 0) process.exitCode = 1;
