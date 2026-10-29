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

## Automatic blog posts

`scripts/auto-blog.mjs` reads the RSS/Atom feeds listed in
`scripts/blog-sources.mjs` and publishes the newest tech stories to the store
blog. It ships with 19 verified sources:

- **French:** Numerama, Presse-Citron, 01net, FrAndroid, Journal du Geek,
  Tom's Hardware FR.
- **English:** GSMArena, Android Authority, Android Central, 9to5Mac,
  9to5Google, XDA Developers, Liliputing, Digital Trends, The Verge, TechRadar,
  Ars Technica, Tom's Hardware, Google News (smartphone / laptop / USB-C / GPU
  search).

Each imported post is a **short excerpt** (about 700 characters), the source
name, and a link to the original article. Full articles are never copied, so the
blog stays on the right side of copyright and does not compete with the source
for search traffic. No AI service is involved and nothing is rewritten, so there
is no OpenAI/Claude bill and no API key. Posts are tagged `auto-blog`,
`source-<key>` and `lang-<fr|en>` so you can find or unpublish them in bulk.

### Keyword filter

Matching follows the WordPress-style setup: an article is imported only when its
title or summary mentions one of the keywords, ignoring case and accents. The
default list is:

`phone, smartphone, mobile, téléphone, laptop, ordinateur portable, pc, computer,
ordinateur, cable, câble, charger, chargeur, USB-C, accessory, accessoire, GPU,
graphics card, carte graphique, launch, lancement, brand, marque, product,
produit, tech, technology, technologie`

Because words like `tech`, `product` and `launch` appear in almost every story on
a tech site, the filter is intentionally loose. Puzzles, word games and
crosswords are excluded (see `--exclude`). Narrow the list for a tighter blog:

```powershell
node scripts/auto-blog.mjs --keywords "smartphone,laptop,gpu,usb-c,charger"
node scripts/auto-blog.mjs --no-keywords   # import everything
```

### Running it

From GitHub (no local setup): **Actions -> Auto blog -> Run workflow**. It runs
automatically **every 10 minutes**, publishes 1 new post per run (max 1 per
source) and skips anything older than 48 hours. A hard cap of **6 posts per 24
hours** stops the 10-minute schedule from flooding the blog, and posts are spaced
**at least 2 hours apart**, so a run that finds nothing new simply waits. The
inputs let you change the count, the language (`fr`, `en` or `all`), the daily
cap, publish as drafts, or do a dry run.

The workflow uses GitHub's free Actions minutes (the repository is public, so
scheduled runs are unlimited). Shopify's Admin API token is also free: it is the
key that lets the workflow add posts to your blog, not a paid service. There is
no way to create real Shopify blog posts without it — Shopify requires
authentication for every write. If the token ever leaks, uninstall the app in
**Settings -> Apps and sales channels** and create a new one; nothing else
changes.

Locally:

```powershell
$env:SHOPIFY_STORE_DOMAIN="jq5gaa-01.myshopify.com"
$env:SHOPIFY_ADMIN_API_TOKEN="shpat_..."
node scripts/auto-blog.mjs --dry-run --limit 3 --lang all   # preview
node scripts/auto-blog.mjs --limit 3 --lang all             # publish
```

Flags:

| Flag | Default | Meaning |
|---|---|---|
| `--dry-run` | off | Print the posts, write nothing |
| `--draft` | off | Create unpublished articles |
| `--limit` | `3` | Max posts per run |
| `--per-source` | `1` | Max posts taken from one feed |
| `--max-per-day` | `6` | Hard cap of auto posts per 24h (`0` = unlimited) |
| `--min-gap-minutes` | `120` | Wait at least this long between two auto posts (`0` = no wait) |
| `--max-age-hours` | `48` | Ignore older articles |
| `--excerpt-length` | `700` | Characters kept from the feed summary |
| `--lang` | `fr` | `fr`, `en` or `all` |
| `--keywords` | built-in list | Replace the keyword list |
| `--no-keywords` | off | Import every recent article |
| `--exclude` | puzzle games | Replace the exclusion list |
| `--source` | all | Comma separated source keys, e.g. `numerama,gsmarena` |

Duplicates are prevented by a deterministic handle built from the article URL,
so re-running the workflow never publishes the same story twice. Identical
headlines from two feeds are also collapsed into one post.

### Set it and forget it

Once the app is installed and the three secrets exist, there is nothing left to
do. Every 10 minutes GitHub starts a run that:

1. downloads the 19 feeds,
2. keeps only recent articles,
3. keeps only articles matching the keywords,
4. skips anything already published,
5. publishes at most one post, and stops for the day after 6.

If nothing matches, the run ends silently. The blog is created on the first
post. The workflow also commits a timestamp to `.github/auto-blog-heartbeat`
every two weeks, because GitHub disables scheduled workflows after 60 days
without repository activity — this keeps the schedule running with no manual
action.

Things that still need you once:

- Install the app on the store (Shopify refuses to issue tokens otherwise).
- Add the repository secrets.
- Remove the storefront password if you want visitors and Google to see the blog
  (**Online Store -> Preferences -> Password protection**).
- Rotate the client secret if it was ever shared, then update the GitHub secret.

### Required settings

The workflow needs `SHOPIFY_STORE_DOMAIN` plus **one** of these two credentials.
Neither costs anything, and both are only used to let the script add posts —
Shopify rejects every write without one.

**Option A — Dev Dashboard app (no token to copy).** Create the app, add
`read_content` + `write_content` to a version, release it, and install it on your
store. Then add these repository secrets:

| Secret | Value |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | `jq5gaa-01.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | app Client ID (`0da0…`) |
| `SHOPIFY_CLIENT_SECRET` | app Client secret (`shpss_…`) |

`scripts/shopify-auth.mjs` exchanges the pair for a token with Shopify's client
credentials grant at the start of every run. Those tokens last 24 hours, so the
workflow always fetches a fresh one; there is no token to paste and nothing to
renew by hand. The app and the store must belong to the same Shopify
organization, and the app must be **installed** (Dev Dashboard -> app ->
Install), otherwise Shopify answers `app_not_installed` or `shop_not_permitted`.

**Option B — custom app token.** `Settings -> Apps and sales channels ->
Develop apps`, create a custom app with `read_content` + `write_content`,
install it, and reveal the Admin API access token once. Store it as
`SHOPIFY_ADMIN_API_TOKEN`. This token is used as-is and does not expire.

- Optional repository variables: `SHOPIFY_BLOG_HANDLE` (default `news`) and
  `SHOPIFY_BLOG_TITLE` (default `Nayro Blog`). The blog is created on the first
  run if it does not exist yet.

Rotate the client secret from the Dev Dashboard (app -> Settings -> Client
secret -> Rotate) if it was ever shared, and update the GitHub secret.

Add or remove a feed by editing `scripts/blog-sources.mjs` (one object per
source: `key`, `name`, `url`, `lang`, optional `tags`). Feeds that hide the real
article link behind a redirect (Google News) can set `stripPublisher: true` and
`resolveArticle: true`.

## Brands and product counts

The home page brand section ships with 43 tech brands (Apple, Samsung, Dell, HP,
Lenovo, Asus, Acer, MSI, Xiaomi, Huawei, Sony, LG, Intel, AMD, NVIDIA and more).
Each brand links to its vendor page, for example `/collections/vendors?q=Apple`.

The number shown next to a brand is read from the storefront **Vendor** filter.
To turn those automatic counts on, install the free **Search & Discovery** app
and add a **Vendor** filter under **Filters**. Without the app, set a count
manually per brand from **Theme editor -> Brands -> Brand -> Products count**.

Category cards already show `collection.all_products_count` under each title.

### Brand filter on collection pages

The **Brand** filter lists the store's real vendors first, then the canonical
brand list in `snippets/brand-list.liquid` (159 brands: phones, laptops,
accessories, gaming, audio, storage, networking, printers, smart home, cameras,
TVs and more). Duplicates are removed, and a search box at the top of the group
filters the list as you type. Brands with no products yet still appear; their
page is empty until a product uses that vendor name.

Add or remove brands by editing `snippets/brand-list.liquid` (one comma
separated line). The **Collection products -> Extra brands for the Brand filter**
setting is optional and is merged on top of that file.

To make a brand page actually list products, each product needs the matching
**Vendor**. Two ways:

- **Manually:** Products -> open the product -> **Product organization** ->
  **Vendor**.
- **In bulk:** run `node scripts/apply-vendors.mjs` (preview) then
  `node scripts/apply-vendors.mjs --apply`. It reads the same brand list, guesses
  the brand from the product title or tags (for example "Samsung Galaxy S24" ->
  `Samsung`, "iPhone 15" -> `Apple`) and only fills vendors that are blank or
  still the store name. Add `--overwrite` to replace brands you already set and
  `--report vendor-report.csv` to get a CSV of every decision. Products whose
  title has no brand in it are listed at the end so you can set them by hand.

The same run is available in GitHub Actions: **Actions -> Apply product brands
-> Run workflow** (uncheck `apply` to only preview). It needs the
`SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_API_TOKEN` repository secrets, and the
token needs the `read_products` and `write_products` scopes.

## Product technical specifications (Fiche technique)

`templates/product.json` includes a **Fiche technique** section after the product
information. Every row is optional and comes from four sources, in this order:

1. **JSON metafield** (recommended, one field per product). Create a product
   metafield definition of type **JSON** with the namespace `specs` and the key
   `fiche`, then paste a list of rows on each product:

   ```json
   [
     { "label": "Longueur", "value": "5 m" },
     { "label": "Couleur", "value": "16 millions de couleurs RGB" },
     { "label": "Alimentation", "value": "USB ou adaptateur 12 V" }
   ]
   ```

   A plain object also works: `{ "Longueur": "5 m", "Couleur": "RGB" }`.
   `label`/`value`, `name`/`value` and `title`/`text` are all accepted keys.
   Change the key from **Theme editor -> Fiche technique -> JSON metafield key**.

   The section also looks for the same value in the `custom` namespace, and for
   the keys `fiche_technique` and `custom.specs`, so a definition created in the
   wrong namespace still renders instead of silently disappearing.

   If nothing shows up, turn on **Theme editor -> Fiche technique -> Show
   diagnostic info**. The product page then prints the namespace, key, the
   metafield it actually found, its type and the number of rows rendered.
   A multi-line text metafield filled with `Label: value` lines on separate
   lines also works as a fallback.
2. **Row blocks** added in the theme editor (**Fiche technique -> Add row**).
   Type a label and a value, for example `Garantie` / `12 mois`. Blocks are shared
   by every product using this product template, so use them for common rows, or
   create one product template per product family and give each its own rows.
3. **Built-in rows**: brand, category, SKU, availability and tags, each with its
   own on/off switch and editable label. Brand and category are off by default,
   because they fall back to the store name and Shopify's product type.
4. **Individual product metafields** in the `specs` namespace (one key per row,
   for example `processor`, `ram`, `warranty`). The key becomes the row label
   (`screen_size` becomes "Screen size"). The JSON key itself is never rendered
   twice. Turn this off or change the namespace from **Theme editor -> Fiche
   technique**.

The section hides itself when nothing is selected or filled in.

## Recently viewed

A **Recently viewed** section is on the product page and under the product grid
on collection pages. It is filled from the visitor's browser and stays hidden
until they have viewed at least one product.

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
