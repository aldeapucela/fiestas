const CONFIG_KEY = '__FIESTAS_ANALYTICS_CONFIG__';
const INITIALIZED_KEY = '__FIESTAS_MATOMO_INITIALIZED__';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const DEFAULT_TRACKER_URL = 'https://stats.aldeapucela.org/';
const DEFAULT_SITE_ID = '29';
const TRACKED_FAVORITES_STORAGE_KEY = 'fiestasPucela:analytics:saved-activities';
const TRACKED_CASETA_FAVORITES_STORAGE_KEY = 'fiestasPucela:analytics:saved-casetas';
const TRACKED_COMMUNITY_PLANS_STORAGE_KEY = 'fiestasPucela:analytics:added-community-plans';

const categoryActions = {
  activity: new Set(['view_detail', 'save', 'remove_save', 'share', 'open_directions', 'open_external_link', 'open_tickets']),
  caseta: new Set(['save', 'remove_save']),
  agenda: new Set(['select_date', 'select_all_dates', 'apply_filter', 'search', 'open_activity']),
  map: new Set(['open', 'select_marker', 'select_date', 'select_all_dates', 'apply_filter']),
  plan: new Set(['create', 'add_activity', 'remove_activity', 'add_to_calendar', 'add_community', 'export', 'import', 'share', 'import_error']),
  pwa: new Set(['install_clicked', 'install_accepted', 'install_cancelled', 'installed', 'ios_help_opened', 'sw_registration_error'])
};

const filterNames = new Set(['type', 'area', 'ticket']);
let analyticsReady = false;
const trackedFavoriteIds = new Set();
const trackedCasetaFavoriteIds = new Set();
const trackedCommunityPlanIds = new Set();

export function initAnalytics() {
  if (typeof window === 'undefined' || window[INITIALIZED_KEY]) return;
  window[INITIALIZED_KEY] = true;

  const config = getConfig();
  if (!config.enabled || isDoNotTrackEnabled()) return;

  const queue = hasPushQueue(window._paq) ? window._paq : [];
  window._paq = queue;
  queue.push(['setTrackerUrl', `${config.trackerUrl}matomo.php`]);
  queue.push(['setSiteId', config.siteId]);
  queue.push(['disableCookies']);
  queue.push(['enableLinkTracking']);
  queue.push(['trackPageView']);

  const script = document.createElement('script');
  script.async = true;
  script.src = `${config.trackerUrl}matomo.js`;
  script.dataset.fiestasMatomoLoader = 'true';
  script.addEventListener('error', () => {
    analyticsReady = false;
  }, { once: true });
  document.head.append(script);
  analyticsReady = true;
}

export function trackActivityViewed(activityId) {
  return pushEvent('activity', 'view_detail', activityId);
}

export function trackActivityOpened(activityId) {
  return pushEvent('agenda', 'open_activity', activityId);
}

export function trackFavoriteChanged(activityId, saved) {
  try {
    const normalizedActivityId = normalizeToken(activityId);
    if (saved && (!normalizedActivityId || hasTrackedFavorite(normalizedActivityId))) return false;

    const tracked = pushEvent('activity', saved ? 'save' : 'remove_save', normalizedActivityId);
    if (saved && tracked) rememberTrackedFavorite(normalizedActivityId);
    return tracked;
  } catch (_) {
    // Analytics must never prevent the local favorite from being saved.
    return false;
  }
}

export function trackCasetaFavoriteChanged(casetaId, saved) {
  try {
    const normalizedCasetaId = normalizeCasetaId(casetaId);
    if (!normalizedCasetaId || (saved && hasTrackedCasetaFavorite(normalizedCasetaId))) return false;

    const tracked = pushEvent('caseta', saved ? 'save' : 'remove_save', normalizedCasetaId);
    if (saved && tracked) rememberTrackedCasetaFavorite(normalizedCasetaId);
    return tracked;
  } catch (_) {
    // Analytics must never prevent the local caseta favorite from being saved.
    return false;
  }
}

export function trackActivityShared(activityId) {
  return pushEvent('activity', 'share', activityId);
}

export function trackDateSelected(date, view = 'agenda') {
  const category = view === 'map' ? 'map' : 'agenda';
  return pushEvent(category, date === 'all' ? 'select_all_dates' : 'select_date', date);
}

export function trackFilterApplied(filterName, filterValue, view = 'agenda') {
  if (!filterNames.has(filterName)) return false;
  const category = view === 'map' ? 'map' : 'agenda';
  return pushEvent(category, 'apply_filter', filterName, normalizeToken(filterValue));
}

export function trackSearchResults(resultCount) {
  const count = Number.isFinite(resultCount) && resultCount >= 0 ? Math.round(resultCount) : 0;
  return pushEvent('agenda', 'search', count > 0 ? 'with_results' : 'without_results', count);
}

export function trackMapOpened() {
  return pushEvent('map', 'open', 'map');
}

export function trackMapMarkerSelected(activityId) {
  return pushEvent('map', 'select_marker', activityId);
}

export function trackDirectionsOpened(activityId) {
  return pushEvent('activity', 'open_directions', activityId);
}

export function trackTicketsOpened(activityId) {
  return pushEvent('activity', 'open_tickets', activityId);
}

export function trackExternalLinkOpened(linkType) {
  return pushEvent('activity', 'open_external_link', linkType);
}

export function trackPlanCreated(planType = 'manual') {
  return pushEvent('plan', 'create', planType);
}

export function trackCommunityPlanAdded(planId) {
  try {
    const normalizedPlanId = normalizeToken(planId);
    if (!normalizedPlanId || hasTrackedCommunityPlan(normalizedPlanId)) return false;

    const tracked = pushEvent('plan', 'add_community', normalizedPlanId);
    if (tracked) rememberTrackedCommunityPlan(normalizedPlanId);
    return tracked;
  } catch (_) {
    // Analytics must never prevent the local plan from being saved.
    return false;
  }
}

export function trackPlanActivityAdded(activityId) {
  return pushEvent('plan', 'add_activity', activityId);
}

export function trackPlanActivityRemoved(activityId) {
  return pushEvent('plan', 'remove_activity', activityId);
}

export function trackPlanCalendarExported(activityId = 'plan') {
  return pushEvent('plan', 'add_to_calendar', activityId);
}

export function trackPlanExported(planType = 'file') {
  return pushEvent('plan', 'export', planType);
}

export function trackPlanImported(planType = 'file') {
  return pushEvent('plan', 'import', planType);
}

export function trackPlanShared(planType = 'file') {
  return pushEvent('plan', 'share', planType);
}

export function trackPlanImportError(errorType = 'invalid') {
  return pushEvent('plan', 'import_error', errorType);
}

export function trackPwaInstallClicked(source = 'install') {
  return pushEvent('pwa', 'install_clicked', 'install', source);
}

export function trackPwaInstallAccepted(source = 'install') {
  return pushEvent('pwa', 'install_accepted', 'install', source);
}

export function trackPwaInstallCancelled(source = 'install') {
  return pushEvent('pwa', 'install_cancelled', 'install', source);
}

export function trackPwaInstalled(source = 'install') {
  return pushEvent('pwa', 'installed', 'install', source);
}

export function trackPwaIosHelpOpened() {
  return pushEvent('pwa', 'ios_help_opened', 'ios');
}

export function trackPwaServiceWorkerError() {
  return pushEvent('pwa', 'sw_registration_error', 'register');
}

function getConfig() {
  const configured = window[CONFIG_KEY] && typeof window[CONFIG_KEY] === 'object'
    ? window[CONFIG_KEY]
    : {};
  const hostname = window.location?.hostname || '';
  const configuredEnabled = configured.enabled;
  const enabled = typeof configuredEnabled === 'boolean'
    ? configuredEnabled
    : !LOCAL_HOSTS.has(hostname);
  const trackerUrl = normalizeTrackerUrl(configured.trackerUrl || DEFAULT_TRACKER_URL);
  const siteId = normalizeToken(configured.siteId || DEFAULT_SITE_ID);
  return { enabled, trackerUrl, siteId };
}

function normalizeTrackerUrl(value) {
  try {
    const url = new URL(String(value), window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return DEFAULT_TRACKER_URL;
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch (_) {
    return DEFAULT_TRACKER_URL;
  }
}

function isDoNotTrackEnabled() {
  return window.navigator?.doNotTrack === '1' || window.doNotTrack === '1';
}

function pushEvent(category, action, name, value) {
  if (!analyticsReady || !categoryActions[category]?.has(action)) return false;
  const queue = window._paq;
  const normalizedName = normalizeToken(name);
  if (!hasPushQueue(queue) || !normalizedName) return false;
  const event = ['trackEvent', category, action, normalizedName];
  if (value !== undefined) event.push(value);
  queue.push(event);
  return true;
}

function hasTrackedFavorite(activityId) {
  if (trackedFavoriteIds.has(activityId)) return true;
  const storedIds = readTrackedFavoriteIds();
  const alreadyTracked = storedIds.includes(activityId);
  if (alreadyTracked) trackedFavoriteIds.add(activityId);
  return alreadyTracked;
}

function rememberTrackedFavorite(activityId) {
  trackedFavoriteIds.add(activityId);
  const storedIds = new Set(readTrackedFavoriteIds());
  storedIds.add(activityId);
  try {
    window.localStorage.setItem(TRACKED_FAVORITES_STORAGE_KEY, JSON.stringify([...storedIds]));
  } catch (_) {
    // An unavailable localStorage still deduplicates saves for this page load.
  }
}

function hasTrackedCasetaFavorite(casetaId) {
  if (trackedCasetaFavoriteIds.has(casetaId)) return true;
  const storedIds = readTrackedCasetaFavoriteIds();
  const alreadyTracked = storedIds.includes(casetaId);
  if (alreadyTracked) trackedCasetaFavoriteIds.add(casetaId);
  return alreadyTracked;
}

function rememberTrackedCasetaFavorite(casetaId) {
  trackedCasetaFavoriteIds.add(casetaId);
  const storedIds = new Set(readTrackedCasetaFavoriteIds());
  storedIds.add(casetaId);
  try {
    window.localStorage.setItem(TRACKED_CASETA_FAVORITES_STORAGE_KEY, JSON.stringify([...storedIds]));
  } catch (_) {
    // An unavailable localStorage still deduplicates saves for this page load.
  }
}

function readTrackedFavoriteIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(TRACKED_FAVORITES_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizeToken).filter(Boolean))];
  } catch (_) {
    return [];
  }
}

function readTrackedCasetaFavoriteIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(TRACKED_CASETA_FAVORITES_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizeCasetaId).filter(Boolean))];
  } catch (_) {
    return [];
  }
}

function hasTrackedCommunityPlan(planId) {
  if (trackedCommunityPlanIds.has(planId)) return true;
  const storedIds = readTrackedCommunityPlanIds();
  const alreadyTracked = storedIds.includes(planId);
  if (alreadyTracked) trackedCommunityPlanIds.add(planId);
  return alreadyTracked;
}

function rememberTrackedCommunityPlan(planId) {
  trackedCommunityPlanIds.add(planId);
  const storedIds = new Set(readTrackedCommunityPlanIds());
  storedIds.add(planId);
  try {
    window.localStorage.setItem(TRACKED_COMMUNITY_PLANS_STORAGE_KEY, JSON.stringify([...storedIds]));
  } catch (_) {
    // An unavailable localStorage still deduplicates additions for this page load.
  }
}

function readTrackedCommunityPlanIds() {
  try {
    const value = JSON.parse(window.localStorage.getItem(TRACKED_COMMUNITY_PLANS_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizeToken).filter(Boolean))];
  } catch (_) {
    return [];
  }
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function normalizeCasetaId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^z[1-7]-[0-9]+$/.test(normalized) ? normalized : '';
}

function hasPushQueue(value) {
  return Boolean(value && typeof value.push === 'function');
}

initAnalytics();
