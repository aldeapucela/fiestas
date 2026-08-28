const CASETAS_PATH = '/casetas/';
const NAVIGATION_BASE_URL = 'https://fiestas.aldeapucela.org';

function isCasetasPath(pathname) {
  return String(pathname || '').replace(/\/+$/, '') === '/casetas';
}

function relativeUrl(url) {
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Returns the current casetas list URL without nested return parameters.
 * The origin is intentionally not restricted here because this helper also
 * runs in local development and on preview deployments.
 */
export function getCasetasListPath(value = '') {
  const source = String(value || '').trim();
  if (!source) return CASETAS_PATH;
  let url;
  try {
    url = new URL(source, NAVIGATION_BASE_URL);
  } catch (_) {
    return CASETAS_PATH;
  }
  if (!isCasetasPath(url.pathname)) return '';
  url.searchParams.delete('return');
  return relativeUrl(url) || CASETAS_PATH;
}

/**
 * Reads the optional return target on a caseta detail URL. Only a same-origin
 * /casetas/ target is accepted, so a query parameter cannot become an open
 * redirect.
 */
export function getCasetasReturnPath(value = '') {
  const source = String(value || '').trim();
  if (!source) return '';
  let pageUrl;
  try {
    pageUrl = new URL(source, NAVIGATION_BASE_URL);
  } catch (_) {
    return '';
  }
  const returnValue = pageUrl.searchParams.get('return');
  if (!returnValue) return '';
  let returnUrl;
  try {
    returnUrl = new URL(returnValue, pageUrl.origin);
  } catch (_) {
    return '';
  }
  if (returnUrl.origin !== pageUrl.origin || !isCasetasPath(returnUrl.pathname)) return '';
  returnUrl.searchParams.delete('return');
  return relativeUrl(returnUrl) || CASETAS_PATH;
}

export function buildCasetaDetailHref(caseta, currentUrl = '') {
  const slug = String(caseta?.publicSlug || caseta?.slug || '').trim();
  if (!slug) return '';
  const detailPath = `/c/${encodeURIComponent(slug)}/`;
  const source = currentUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const returnPath = getCasetasListPath(source);
  if (!returnPath || returnPath === CASETAS_PATH) return detailPath;
  return `${detailPath}?return=${encodeURIComponent(returnPath)}`;
}
