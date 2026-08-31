import {
  trackCommunityPromptClicked,
  trackCommunityPromptDismissed,
  trackCommunityPromptViewed
} from './analytics.js';
import { getVisitedDays } from './visit-tracker.js';

export const COMMUNITY_PROMPT_STORAGE_KEY = 'fiestasPucela:community-prompt:v1';
export const COMMUNITY_PROMPT_SCHEMA_VERSION = 1;
export const COMMUNITY_PROMPT_MAX_EXPOSURES = 2;
export const COMMUNITY_PROMPT_SNOOZE_DAYS = 5;
export const COMMUNITY_PROMPT_SNOOZE_MS = COMMUNITY_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

export const DEFAULT_COMMUNITY_PROMPT_CAMPAIGN = Object.freeze({
  id: 'valladolid-2026',
  startDate: '2026-09-04',
  endDate: '2026-09-13'
});

const RELEVANT_ENGAGEMENTS = new Set([
  'activity:save',
  'activity:share',
  'activity:view_detail',
  'agenda:search',
  'caseta:save',
  'plan:add_community',
  'plan:share'
]);

const EMPTY_STATE = Object.freeze({
  schemaVersion: COMMUNITY_PROMPT_SCHEMA_VERSION,
  campaignId: DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id,
  exposureCount: 0,
  lastShownAt: 0,
  nextEligibleAt: 0,
  neverAgain: false,
  relevantActionSeen: false
});

export function createCommunityPromptState(campaignId = DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id) {
  return {
    ...EMPTY_STATE,
    campaignId: String(campaignId || DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id)
  };
}

export function normalizeCommunityPromptState(value, campaignId = DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id) {
  const expectedCampaignId = String(campaignId || DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id);
  if (!value || typeof value !== 'object' || value.schemaVersion !== COMMUNITY_PROMPT_SCHEMA_VERSION || value.campaignId !== expectedCampaignId) {
    return createCommunityPromptState(expectedCampaignId);
  }

  const exposureCount = Number(value.exposureCount);
  const lastShownAt = Number(value.lastShownAt);
  const nextEligibleAt = Number(value.nextEligibleAt);
  return {
    schemaVersion: COMMUNITY_PROMPT_SCHEMA_VERSION,
    campaignId: expectedCampaignId,
    exposureCount: Number.isInteger(exposureCount) ? Math.min(Math.max(exposureCount, 0), COMMUNITY_PROMPT_MAX_EXPOSURES) : 0,
    lastShownAt: Number.isFinite(lastShownAt) && lastShownAt >= 0 ? lastShownAt : 0,
    nextEligibleAt: Number.isFinite(nextEligibleAt) && nextEligibleAt >= 0 ? nextEligibleAt : 0,
    neverAgain: value.neverAgain === true,
    relevantActionSeen: value.relevantActionSeen === true
  };
}

export function readCommunityPromptState(storage, campaignId = DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id) {
  if (!storage || typeof storage.getItem !== 'function') return createCommunityPromptState(campaignId);
  try {
    const raw = storage.getItem(COMMUNITY_PROMPT_STORAGE_KEY);
    return normalizeCommunityPromptState(raw ? JSON.parse(raw) : null, campaignId);
  } catch (_) {
    return createCommunityPromptState(campaignId);
  }
}

export function writeCommunityPromptState(storage, state) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(COMMUNITY_PROMPT_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (_) {
    return false;
  }
}

export function isCommunityPromptCampaignActive(campaign, now = Date.now()) {
  const start = localDateBoundary(campaign?.startDate, false);
  const end = localDateBoundary(campaign?.endDate, true);
  return start !== null && end !== null && now >= start && now <= end;
}

export function canShowCommunityPrompt({ state, visitedDays, campaign, now = Date.now() }) {
  if (!isCommunityPromptCampaignActive(campaign, now)) return false;
  if (!state || state.neverAgain || state.exposureCount >= COMMUNITY_PROMPT_MAX_EXPOSURES) return false;
  if (Number(state.nextEligibleAt) > now) return false;
  return Number(visitedDays) >= 2 && state.relevantActionSeen === true;
}

export function recordCommunityPromptExposure(state, now = Date.now()) {
  const nextCount = Math.min(state.exposureCount + 1, COMMUNITY_PROMPT_MAX_EXPOSURES);
  return {
    ...state,
    exposureCount: nextCount,
    lastShownAt: now,
    nextEligibleAt: now + COMMUNITY_PROMPT_SNOOZE_MS
  };
}

export function recordCommunityPromptSnooze(state, now = Date.now()) {
  return {
    ...state,
    nextEligibleAt: now + COMMUNITY_PROMPT_SNOOZE_MS
  };
}

export function recordCommunityPromptNeverAgain(state) {
  return {
    ...state,
    neverAgain: true,
    nextEligibleAt: 0
  };
}

export function isRelevantCommunityEngagement(detail) {
  if (!detail || typeof detail !== 'object') return false;
  const key = `${String(detail.category || '')}:${String(detail.action || '')}`;
  if (!RELEVANT_ENGAGEMENTS.has(key)) return false;
  if (detail.category === 'agenda' && detail.action === 'search') return detail.name === 'with_results';
  return true;
}

function localDateBoundary(value, endOfDay) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}

function hasBlockingOverlay() {
  return Boolean(document.querySelector([
    '[data-menu-drawer]:not([hidden])',
    '[data-subscribe-modal]:not([hidden])',
    '[data-fiestas-detail-calendar-modal]:not([hidden])',
    '[data-add-event-modal]:not([hidden])',
    '[data-pwa-ios-help]:not([hidden])',
    '[data-fiestas-chatbot-dialog]:not([hidden])'
  ].join(', ')));
}

export function setupCommunityPrompt() {
  const prompt = document.querySelector('[data-community-prompt]');
  if (!prompt) return null;

  const panel = prompt.querySelector('.community-prompt-panel');
  const dismissButton = prompt.querySelector('[data-community-prompt-dismiss]');
  const neverButton = prompt.querySelector('[data-community-prompt-never]');
  const channelLinks = [...prompt.querySelectorAll('[data-community-prompt-channel]')];
  if (!panel || !dismissButton || !neverButton) return null;

  const campaign = {
    id: prompt.dataset.communityPromptCampaignId || DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.id,
    startDate: prompt.dataset.communityPromptStart || DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.startDate,
    endDate: prompt.dataset.communityPromptEnd || DEFAULT_COMMUNITY_PROMPT_CAMPAIGN.endDate
  };
  const storage = getStorage();
  let state = readCommunityPromptState(storage, campaign.id);
  let isOpen = false;
  let returnFocus = null;
  let previousBodyOverflow = '';

  const persist = () => writeCommunityPromptState(storage, state);

  const hide = ({ restoreFocus = true } = {}) => {
    prompt.hidden = true;
    document.body.style.overflow = previousBodyOverflow;
    document.body.classList.remove('community-prompt-open');
    isOpen = false;
    if (restoreFocus && returnFocus && typeof returnFocus.focus === 'function' && returnFocus.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
  };

  const show = () => {
    if (isOpen || hasBlockingOverlay() || !canShowCommunityPrompt({
      state,
      visitedDays: getVisitedDays(),
      campaign,
      now: Date.now()
    })) return false;

    returnFocus = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    state = recordCommunityPromptExposure(state);
    persist();
    prompt.hidden = false;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('community-prompt-open');
    isOpen = true;
    trackCommunityPromptViewed(state.exposureCount);
    window.requestAnimationFrame(() => dismissButton.focus({ preventScroll: true }));
    return true;
  };

  const snooze = () => {
    if (!isOpen) return;
    const iteration = state.exposureCount;
    state = recordCommunityPromptSnooze(state);
    persist();
    hide();
    trackCommunityPromptDismissed('snooze_5d', iteration);
  };

  const neverAgain = () => {
    if (!isOpen) return;
    const iteration = state.exposureCount;
    state = recordCommunityPromptNeverAgain(state);
    persist();
    hide();
    trackCommunityPromptDismissed('never_again', iteration);
  };

  dismissButton.addEventListener('click', snooze);
  neverButton.addEventListener('click', neverAgain);
  channelLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (!isOpen) return;
      const iteration = state.exposureCount;
      state = recordCommunityPromptSnooze(state);
      persist();
      trackCommunityPromptClicked(link.dataset.communityPromptChannel, iteration);
      hide({ restoreFocus: false });
    });
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      snooze();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('a[href], button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('fiestas:engagement', (event) => {
    if (!isRelevantCommunityEngagement(event.detail)) return;
    state = { ...state, relevantActionSeen: true };
    persist();
    if (getVisitedDays() < 2) return;
    window.setTimeout(show, 240);
  });

  return { show, hide, getState: () => ({ ...state }) };
}

if (typeof document !== 'undefined' && typeof document.querySelector === 'function') setupCommunityPrompt();
