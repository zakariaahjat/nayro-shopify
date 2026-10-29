/**
 * Shopify Admin API authentication.
 *
 * Two ways to authenticate, checked in this order:
 *
 * 1. SHOPIFY_ADMIN_API_TOKEN — a ready-made `shpat_…` token from a custom app.
 * 2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET — credentials from a Dev
 *    Dashboard app. They are exchanged for a token with the client credentials
 *    grant, which is exactly what Shopify recommends for apps acting on stores
 *    in your own organization.
 *
 * Client-credentials tokens expire after 24 hours, so they are requested at the
 * start of every run and cached only while the process is alive. That is why the
 * GitHub workflow works without ever storing a token.
 *
 * Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 */

const STORE = (process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');

const STATIC_TOKEN = (process.env.SHOPIFY_ADMIN_API_TOKEN || '').trim();
const CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.SHOPIFY_CLIENT_SECRET || '').trim();

let cachedToken = '';
let cachedUntil = 0;

function fail(message) {
  const error = new Error(message);
  error.isConfiguration = true;
  throw error;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function requestToken() {
  if (!STORE) fail('SHOPIFY_STORE_DOMAIN is missing (for example jq5gaa-01.myshopify.com).');
  if (!CLIENT_ID || !CLIENT_SECRET) {
    fail(
      'No credentials found. Set SHOPIFY_ADMIN_API_TOKEN, or both SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.'
    );
  }

  const response = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const oauthCode = raw.match(/Oauth error\s+([a-z0-9_]+)/i)?.[1]?.toLowerCase() || '';
    const detail = stripHtml(payload.error_description || payload.error || oauthCode || raw).slice(0, 300);

    if (oauthCode === 'app_not_installed' || /app_not_installed/i.test(detail)) {
      fail(
        'The app is not installed on this store (app_not_installed). In the Dev Dashboard open the app, ' +
          'release the version that has the read_content and write_content scopes, then click Install and ' +
          'approve it for ' + STORE + '. After that the same Client ID and secret will work; no token to copy.'
      );
    }
    if (/shop_not_permitted/i.test(`${oauthCode} ${detail}`)) {
      fail(
        'Shopify refused the client credentials grant for this store (shop_not_permitted). ' +
          'The app and the store must be in the same Shopify organization: in the Dev Dashboard, ' +
          'open Dev stores and make sure this store is listed there. A store created from the ' +
          'normal admin is not in the organization, so create/transfer it from Dev Dashboard, ' +
          'or use a custom app token (Settings -> Apps and sales channels -> Develop apps).'
      );
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      fail(
        `Shopify rejected the app credentials (HTTP ${response.status}): ${detail}. ` +
          'Check the Client ID and Client secret in the Dev Dashboard, and make sure the app is installed on the store.'
      );
    }
    fail(`Token request failed (HTTP ${response.status}): ${detail}`);
  }

  if (!payload.access_token) {
    fail(`Shopify did not return an access token: ${raw.slice(0, 300)}`);
  }

  const scope = String(payload.scope || '');
  if (scope && !/\bwrite_content\b/.test(scope)) {
    fail(
      `The app token does not have the write_content scope (it has: ${scope}). ` +
        'Add read_content and write_content to the app version in the Dev Dashboard, release it, and install/approve it again.'
    );
  }

  cachedToken = payload.access_token;
  cachedUntil = Date.now() + Math.max(60, Number(payload.expires_in) || 86_399) * 1000;
  return cachedToken;
}

export async function getAccessToken() {
  if (STATIC_TOKEN) return STATIC_TOKEN;
  if (cachedToken && Date.now() < cachedUntil - 60_000) return cachedToken;
  return requestToken();
}

export function isConfigurationError(error) {
  return Boolean(error?.isConfiguration);
}
