#!/usr/bin/env node
/**
 * Seed the Nayro blog with ready-made articles.
 *
 * Creates (or updates) real Shopify blog posts through the Admin GraphQL API,
 * including the article body, summary, tags, author, publish date and image.
 * Images are uploaded from assets/blog-demo-*.png.
 *
 * Required environment variables:
 *   SHOPIFY_STORE_DOMAIN     e.g. nayro.myshopify.com
 *   SHOPIFY_ADMIN_API_TOKEN  Admin API access token with read_content + write_content
 *
 * Optional:
 *   SHOPIFY_BLOG_HANDLE      default: news
 *   SHOPIFY_BLOG_TITLE       default: Nayro Blog
 *   SHOPIFY_BLOG_AUTHOR      default: Nayro
 *   SHOPIFY_API_VERSION      default: 2026-10
 *   FORCE_IMAGES=true        re-upload images even if an article already has one
 *
 * Usage:
 *   node scripts/seed-blog.mjs
 *   node scripts/seed-blog.mjs --dry-run
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { posts } from './blog-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STORE = (process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');
const TOKEN = (process.env.SHOPIFY_ADMIN_API_TOKEN || '').trim();
const API_VERSION = (process.env.SHOPIFY_API_VERSION || '2026-10').trim();
const BLOG_HANDLE = (process.env.SHOPIFY_BLOG_HANDLE || 'news').trim();
const BLOG_TITLE = (process.env.SHOPIFY_BLOG_TITLE || 'Nayro Blog').trim();
const AUTHOR = (process.env.SHOPIFY_BLOG_AUTHOR || 'Nayro').trim();
const FORCE_IMAGES = String(process.env.FORCE_IMAGES || '').toLowerCase() === 'true';
const DRY_RUN = process.argv.includes('--dry-run');

const ENDPOINT = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\n\u2716 ${message}\n`);
  process.exit(1);
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

async function adminRequest(query, variables = {}, attempt = 0) {
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

async function getOrCreateBlog() {
  const data = await adminRequest(
    `query BlogByHandle($handle: String!) {
      blogByHandle(handle: $handle) {
        id
        handle
        title
      }
    }`,
    { handle: BLOG_HANDLE },
  );

  if (data.blogByHandle) return data.blogByHandle;

  if (DRY_RUN) {
    console.log(`  + would create blog "${BLOG_TITLE}" (/blogs/${BLOG_HANDLE})`);
    return { id: 'dry-run-blog', handle: BLOG_HANDLE, title: BLOG_TITLE };
  }

  const created = await adminRequest(
    `mutation BlogCreate($blog: BlogCreateInput!) {
      blogCreate(blog: $blog) {
        blog {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { blog: { title: BLOG_TITLE, handle: BLOG_HANDLE } },
  );

  assertNoUserErrors(created.blogCreate, 'blogCreate');
  return created.blogCreate.blog;
}

async function getArticle(blogId, handle) {
  const data = await adminRequest(
    `query ArticleByHandle($blogId: ID!, $handle: String!) {
      articleByHandle(blogId: $blogId, handle: $handle) {
        id
        handle
        title
        image {
          altText
        }
      }
    }`,
    { blogId, handle },
  );

  return data.articleByHandle;
}

async function uploadArticleImage(fileName) {
  const filePath = path.join(ROOT, 'assets', fileName);
  const buffer = await readFile(filePath);

  const staged = await adminRequest(
    `mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: [
        {
          filename: fileName,
          mimeType: 'image/png',
          httpMethod: 'POST',
          resource: 'IMAGE',
        },
      ],
    },
  );

  assertNoUserErrors(staged.stagedUploadsCreate, 'stagedUploadsCreate');

  const target = staged.stagedUploadsCreate.stagedTargets?.[0];
  if (!target?.url) throw new Error(`No staged upload target returned for ${fileName}`);

  const form = new FormData();
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value);
  }
  form.append('file', new Blob([buffer], { type: 'image/png' }), fileName);

  const upload = await fetch(target.url, { method: 'POST', body: form });
  if (!upload.ok) {
    throw new Error(`Image upload failed for ${fileName}: HTTP ${upload.status} ${await upload.text()}`);
  }

  return target.resourceUrl;
}

function buildArticleInput(post, blogId, imageUrl) {
  const input = {
    blogId,
    title: post.title,
    handle: post.handle,
    author: { name: post.author || AUTHOR },
    body: post.body.trim(),
    summary: post.summary,
    tags: post.tags,
    isPublished: true,
    publishDate: post.publishDate,
  };

  if (imageUrl) {
    input.image = {
      url: imageUrl,
      altText: post.imageAlt || post.title,
    };
  }

  return input;
}

async function main() {
  if (!STORE) fail('Missing SHOPIFY_STORE_DOMAIN (for example: nayro.myshopify.com).');
  if (!TOKEN) fail('Missing SHOPIFY_ADMIN_API_TOKEN with read_content and write_content scopes.');
  if (!/\.myshopify\.com$/i.test(STORE)) {
    console.warn(`\u26a0 SHOPIFY_STORE_DOMAIN should be the *.myshopify.com domain. Got: ${STORE}`);
  }

  console.log(`Nayro blog seeder`);
  console.log(`  store:   ${STORE}`);
  console.log(`  version: ${API_VERSION}`);
  console.log(`  posts:   ${posts.length}${DRY_RUN ? ' (dry run)' : ''}\n`);

  const blog = await getOrCreateBlog();
  console.log(`Blog: "${blog.title}" (/blogs/${blog.handle})\n`);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      const existing = await getArticle(blog.id, post.handle);
      const needsImage = FORCE_IMAGES || !existing?.image;

      let imageUrl = '';
      if (needsImage) {
        imageUrl = DRY_RUN ? `dry-run://blog-demo-${post.image}.png` : await uploadArticleImage(`blog-demo-${post.image}.png`);
      }

      const articleInput = buildArticleInput(post, blog.id, imageUrl);

      if (existing) {
        if (DRY_RUN) {
          console.log(`  ~ would update: ${post.title}`);
          updated += 1;
          continue;
        }

        const result = await adminRequest(
          `mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
            articleUpdate(id: $id, article: $article) {
              article {
                id
                handle
              }
              userErrors {
                field
                message
              }
            }
          }`,
          { id: existing.id, article: articleInput },
        );
        assertNoUserErrors(result.articleUpdate, `articleUpdate ${post.handle}`);
        console.log(`  ~ updated: ${post.title}`);
        updated += 1;
      } else {
        if (DRY_RUN) {
          console.log(`  + would create: ${post.title}`);
          created += 1;
          continue;
        }

        const result = await adminRequest(
          `mutation ArticleCreate($article: ArticleCreateInput!) {
            articleCreate(article: $article) {
              article {
                id
                handle
              }
              userErrors {
                field
                message
              }
            }
          }`,
          { article: articleInput },
        );
        assertNoUserErrors(result.articleCreate, `articleCreate ${post.handle}`);
        console.log(`  + created: ${post.title}`);
        created += 1;
      }

      // Stay comfortably below the Admin API rate limit.
      await sleep(400);
    } catch (error) {
      failed += 1;
      console.error(`  \u2716 ${post.title}: ${error.message}`);
    }
  }

  console.log(`\nDone. created ${created}, updated ${updated}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => fail(error.message));
