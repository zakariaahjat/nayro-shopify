/**
 * Feeds used by scripts/auto-blog.mjs.
 *
 * Add a source with: key (unique, used in the article tag), name (shown as the
 * article author), url (RSS or Atom feed), lang and optional tags.
 *
 * Only feeds that are publicly available and allow excerpt + link attribution
 * are used. Articles are never copied in full: the theme publishes a short
 * excerpt with a link to the original article.
 */

export const sources = [
  // French
  {
    key: 'numerama',
    name: 'Numerama',
    url: 'https://www.numerama.com/feed/',
    lang: 'fr',
    tags: ['Tech'],
  },
  {
    key: 'presse-citron',
    name: 'Presse-Citron',
    url: 'https://www.presse-citron.net/feed/',
    lang: 'fr',
    tags: ['Tech'],
  },
  {
    key: '01net',
    name: '01net',
    url: 'https://www.01net.com/feed/',
    lang: 'fr',
    tags: ['Tech'],
  },
  {
    key: 'frandroid',
    name: 'FrAndroid',
    url: 'https://www.frandroid.com/feed',
    lang: 'fr',
    tags: ['Android', 'Smartphones'],
  },
  {
    key: 'journaldugeek',
    name: 'Journal du Geek',
    url: 'https://www.journaldugeek.com/feed/',
    lang: 'fr',
    tags: ['Tech'],
  },
  {
    key: 'tomshardware-fr',
    name: "Tom's Hardware FR",
    url: 'https://www.tomshardware.fr/feed/',
    lang: 'fr',
    tags: ['PC', 'Hardware'],
  },

  // English
  {
    key: 'gsmarena',
    name: 'GSMArena',
    url: 'https://www.gsmarena.com/rss-news-reviews.php3',
    lang: 'en',
    tags: ['Smartphones'],
  },
  {
    key: 'androidauthority',
    name: 'Android Authority',
    url: 'https://www.androidauthority.com/feed/',
    lang: 'en',
    tags: ['Android'],
  },
  {
    key: '9to5mac',
    name: '9to5Mac',
    url: 'https://9to5mac.com/feed/',
    lang: 'en',
    tags: ['Apple'],
  },
  {
    key: 'theverge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    lang: 'en',
    tags: ['Tech'],
  },
  {
    key: 'techradar',
    name: 'TechRadar',
    url: 'https://www.techradar.com/rss',
    lang: 'en',
    tags: ['Tech'],
  },
  {
    key: 'arstechnica',
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    lang: 'en',
    tags: ['Tech'],
  },
  {
    key: 'tomshardware',
    name: "Tom's Hardware",
    url: 'https://www.tomshardware.com/feeds/all',
    lang: 'en',
    tags: ['PC', 'Hardware'],
  },
];

export const sourceByKey = new Map(sources.map((source) => [source.key, source]));
