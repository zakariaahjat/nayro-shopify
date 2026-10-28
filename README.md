# Nayro Shopify theme

Custom Shopify theme for Nayro, plus a small automation that publishes the
starter blog posts to a real Shopify store.

## Logo

The storefront logo lives at:

```
assets/nayro-logo.png
```

The header, footer, password page and Organization structured data all use this
asset automatically when no logo is selected in **Theme settings → Logo**. To
change the logo, replace that file with your own image (the bundled one is
600 × 327 px, transparent PNG).

If you prefer to manage the logo from the Shopify theme editor, set
**Theme settings → Logo** and it will take priority over the asset.

## Blog posts

The starter articles live in [`scripts/blog-content.mjs`](scripts/blog-content.mjs)
and their images are `assets/blog-demo-1.png` … `assets/blog-demo-6.png`.

The theme already renders those images as a fallback on the blog, article and
home-page blog sections, so posts look complete even before an image is set.

To create the articles as **real Shopify blog posts** (title, body, summary,
tags, author, publish date and image), run the seeder:

```bash
npm run seed:blog
```

The seeder is idempotent: existing articles are matched by handle and updated,
new ones are created. Use `npm run seed:blog:dry` to preview without writing.

### 1. Create an Admin API token

1. In Shopify admin, go to **Settings → Apps and sales channels → Develop apps**.
2. Create a custom app (for example `Nayro Blog Seeder`).
3. Under **Configuration → Admin API access scopes**, enable:
   - `read_content`
   - `write_content`
4. Install the app and copy the **Admin API access token**.

### 2. Add GitHub secrets

In the GitHub repository, open **Settings → Secrets and variables → Actions**
and add:

| Secret | Value |
| --- | --- |
| `SHOPIFY_STORE_DOMAIN` | your store domain, e.g. `nayro.myshopify.com` |
| `SHOPIFY_ADMIN_API_TOKEN` | the Admin API access token from step 1 |

### 3. Run the automation

Open **Actions → Seed blog posts → Run workflow**.

Optional inputs:

- **Blog handle** — defaults to `news` (the `/blogs/news` blog used by the theme).
- **Re-upload images** — refresh article images even if one is already set.

### Run locally

```bash
export SHOPIFY_STORE_DOMAIN=nayro.myshopify.com
export SHOPIFY_ADMIN_API_TOKEN=shpat_xxx
npm run seed:blog
```

Optional variables: `SHOPIFY_BLOG_HANDLE`, `SHOPIFY_BLOG_TITLE`,
`SHOPIFY_BLOG_AUTHOR`, `SHOPIFY_API_VERSION` (default `2026-10`),
`FORCE_IMAGES=true`.

## Blog page and menu

The blog listing is rendered by `templates/blog.json` at `/blogs/news` and single
posts by `templates/article.json`. The header shows a **Blog** link automatically
whenever no menu item already points to a blog, so the page is reachable right
away. You can pick which blog it links to and change its label from
**Theme editor -> Header**.

To add it through the Shopify admin instead:

1. Go to **Online Store -> Navigation -> Main menu**.
2. Click **Add menu item** and name it `Blog`.
3. Choose **Blogs** as the link type and select your blog (usually `News`).
4. Click **Save** and refresh the storefront.

Publish at least one article under **Online Store -> Blog posts** for posts to
appear. The homepage "From the blog" section uses the `News` blog by default and
can be pointed to a different blog from the theme editor.

## Brands and product counts

The home page brand section ships with 43 tech brands (Apple, Samsung, Dell, HP,
Lenovo, Asus, Acer, MSI, Xiaomi, Huawei, Sony, LG, Intel, AMD, NVIDIA and more).
Each brand links to its vendor page, for example `/collections/vendors?q=Apple`.

The number shown next to a brand is read from the storefront **Vendor** filter.
To turn those automatic counts on, install the free **Search & Discovery** app
and add a **Vendor** filter under **Filters**. Without the app, set a count
manually per brand from **Theme editor -> Brands -> Brand -> Products count**.

Category cards already show `collection.all_products_count` under each title.

## Product technical specifications (Fiche technique)

`templates/product.json` includes a **Fiche technique** section after the product
information. It shows:

- Brand, category, SKU and availability (each can be turned off), and
- every non-empty product metafield in the `specs` namespace.

To add spec rows, go to **Settings -> Custom data -> Products** in Shopify admin
and create metafield definitions with the namespace `specs`, for example:
`processor`, `ram`, `storage`, `screen`, `battery`, `warranty`, `weight`.
The key becomes the row label (`screen_size` becomes "Screen size") and the value
becomes the row value. Change the namespace from **Theme editor -> Fiche
technique -> Metafield namespace**.

## Hero banner images

Each slide has a **Show text and button** checkbox. Turn it off when the uploaded
banner image already contains its own text and button, so only the image is
shown. The **Image link** field on the slide is the destination for the whole
banner: clicking anywhere on the image opens that link. If no link is set, the
banner opens `/collections/all`.

## Theme structure

```
assets/     CSS, JS, logo and blog images
config/     Theme settings
layout/     theme.liquid, password.liquid, gift_card.liquid
sections/   Home page and template sections
snippets/   Reusable partials
templates/  JSON templates
scripts/    Blog content + Admin API seeder
```
