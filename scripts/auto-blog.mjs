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
 *   SHOPIFY_STORE_DOMAIN     e.g. jq5gaa-01.myshopify.com
 *   SHOPIFY_ADMIN_API_TOKEN  Admin API token with read_content + write_content
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

const STORE = (process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');
const TOKEN = (process.env.SHOPIFY_ADMIN_API_TOKEN || '').trim();
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
const LANG = String(option('lang', 'fr')).toLowerCase();
const ONLY_SOURCES = String(option('source', ''))
  .split(',')
  .map((key) => key.trim().toLowerCase())
  .filter(Boolean);

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

function parseFeed(xml, source) {
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blockPattern = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockPattern) || [];

  const items = [];
  for (const block of blocks) {
    const title = stripHtml(tagText(block, 'title'));
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
    const text = summaryText.length >= 140 ? summaryText : contentText || summaryText;
    if (!text) continue;

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
  if (!STORE || !TOKEN) fail('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN are required (or use --dry-run).');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
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

async function getExistingHandles(blogId) {
  const handles = new Set();
  let cursor = null;
  do {
    const data = await adminRequest(
      `query BlogArticles($id: ID!, $cursor: String) {
        blog(id: $id) {
          articles(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { handle }
          }
        }
      }`,
      { id: blogId, cursor }
    );
    const page = data.blog?.articles;
    if (!page) break;
    for (const node of page.nodes) handles.add(node.handle);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return handles;
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

  const items = result.value
    .filter((item) => item.date.getTime() >= cutoff)
    .filter((item) => item.date.getTime() <= Date.now() + 3600 * 1000)
    .sort((a, b) => b.date - a.date);

  console.log(`  \u2713 ${source.key.padEnd(16)} ${items.length} recent item(s)`);
  perSource.push({ source, items });
}

let existingHandles = new Set();
let blog = null;
if (!DRY_RUN) {
  blog = await getOrCreateBlog();
  console.log(`\nBlog: "${blog.title}" (/blogs/${blog.handle})`);
  existingHandles = await getExistingHandles(blog.id);
  console.log(`Existing articles: ${existingHandles.size}\n`);
}

const candidates = [];
const seenHandles = new Set();
for (const { source, items } of perSource) {
  let picked = 0;
  for (const item of items) {
    if (picked >= PER_SOURCE) break;
    const handle = articleHandle(item.link);
    if (existingHandles.has(handle) || seenHandles.has(handle)) continue;
    seenHandles.add(handle);
    candidates.push({ ...item, handle, excerpt: truncate(item.text, EXCERPT_LENGTH) });
    picked += 1;
  }
}

candidates.sort((a, b) => b.date - a.date);
const chosen = candidates.slice(0, LIMIT);

if (chosen.length === 0) {
  console.log('Nothing new to publish.');
  process.exit(0);
}

let created = 0;
let failed = 0;

for (const post of chosen) {
  const language = post.source.lang;
  const body = [
    `<p>${escapeHtml(post.excerpt)}</p>`,
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
    summary: truncate(post.excerpt, 200),
    tags: buildTags(post),
    isPublished: !DRAFT,
    publishDate: post.date.toISOString(),
  };

  console.log(`\n  ${DRY_RUN ? '+' : '-'} ${post.title}`);
  console.log(`    source: ${post.source.name}  |  ${post.date.toISOString()}  |  /blogs/${BLOG_HANDLE}/${post.handle}`);

  if (DRY_RUN) {
    console.log(`    ${post.excerpt.slice(0, 160)}${post.excerpt.length > 160 ? '\u2026' : ''}`);
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
