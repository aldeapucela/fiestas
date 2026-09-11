import {
  trackPostFiestasBannerClicked,
  trackPostFiestasWelcomeClicked,
  trackPostFiestasWelcomeDismissed,
  trackPostFiestasWelcomeViewed
} from './analytics.js';

export const DEFAULT_POST_FIESTAS_START = '2026-09-11';
export const DEFAULT_POST_FIESTAS_END = null;
export const DEFAULT_POST_FIESTAS_WELCOME_START = '2026-09-14';
export const POST_FIESTAS_WELCOME_STORAGE_KEY = 'fiestasPucela:post-fiestas-welcome:last-shown-date:v1';
export const POST_FIESTAS_WELCOME_SESSION_KEY = 'fiestasPucela:post-fiestas-welcome:session:v1';

export function getMadridDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Madrid',
    year: 'numeric'
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isPostFiestasBannerActive(startDate, endDate, value = new Date()) {
  const start = String(startDate || DEFAULT_POST_FIESTAS_START).trim();
  const end = endDate ? String(endDate).trim() : DEFAULT_POST_FIESTAS_END;
  const current = getMadridDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(start)
    && (end === null || /^\d{4}-\d{2}-\d{2}$/.test(end))
    && current >= start
    && (end === null || current <= end);
}

export function hasSeenPostFiestasWelcome(storage, date) {
  if (!storage || typeof storage.getItem !== 'function') return false;
  try {
    return storage.getItem(POST_FIESTAS_WELCOME_STORAGE_KEY) === String(date || '');
  } catch (_) {
    return false;
  }
}

export function markPostFiestasWelcomeSeen(storage, date = new Date()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    const value = date instanceof Date ? getMadridDate(date) : String(date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    storage.setItem(POST_FIESTAS_WELCOME_STORAGE_KEY, value);
    return true;
  } catch (_) {
    return false;
  }
}

export function hasSeenPostFiestasWelcomeInSession(storage, date) {
  if (!storage || typeof storage.getItem !== 'function') return false;
  try {
    return storage.getItem(POST_FIESTAS_WELCOME_SESSION_KEY) === String(date || '');
  } catch (_) {
    return false;
  }
}

export function markPostFiestasWelcomeSeenInSession(storage, date = new Date()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    const value = date instanceof Date ? getMadridDate(date) : String(date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    storage.setItem(POST_FIESTAS_WELCOME_SESSION_KEY, value);
    return true;
  } catch (_) {
    return false;
  }
}

export function shouldShowPostFiestasWelcome({ storage, sessionStorage, startDate, now = new Date(), preview = false } = {}) {
  if (preview) return true;
  const today = getMadridDate(now);
  return isPostFiestasBannerActive(startDate || DEFAULT_POST_FIESTAS_WELCOME_START, null, now)
    && !hasSeenPostFiestasWelcome(storage, today)
    && !hasSeenPostFiestasWelcomeInSession(sessionStorage, today);
}

export function setupPostFiestasBanner(root = document.querySelector('[data-fiestas-post-fiestas-banner]'), now = new Date()) {
  if (!root || !isPostFiestasBannerActive(root.dataset.fiestasPostFiestasStart, root.dataset.fiestasPostFiestasEnd, now)) return false;

  root.hidden = false;
  root.querySelectorAll('[data-fiestas-post-fiestas-link]').forEach((link) => {
    link.addEventListener('click', () => {
      trackPostFiestasBannerClicked(link.dataset.fiestasPostFiestasLink);
    });
  });
  return true;
}

function getLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}

function getSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch (_) {
    return null;
  }
}

function isWelcomePreview() {
  if (typeof window === 'undefined' || !window.location) return false;
  const search = String(window.location.search || '');
  return /(?:^|[?&])postFiestasWelcome=preview(?:&|$)/.test(search);
}

export function setupPostFiestasWelcome(root = document.querySelector('[data-fiestas-post-fiestas-welcome]'), now = new Date()) {
  if (!root) return false;

  const storage = getLocalStorage();
  const sessionStorage = getSessionStorage();
  const preview = isWelcomePreview();
  if (preview) root.hidden = false;
  if (!shouldShowPostFiestasWelcome({
    storage,
    sessionStorage,
    startDate: root.dataset.fiestasPostFiestasStart,
    now,
    preview
  })) return false;

  const panel = root.querySelector('.post-fiestas-welcome-panel');
  const closeButton = root.querySelector('[data-fiestas-post-fiestas-welcome-close]');
  const backdrop = root.querySelector('[data-fiestas-post-fiestas-welcome-backdrop]');
  const links = [...root.querySelectorAll('[data-fiestas-post-fiestas-welcome-link]')];
  if (!panel || !closeButton || !backdrop) return false;

  let isOpen = false;
  let previousFocus = null;
  let previousOverflow = '';

  const rememberShown = () => {
    if (preview) return;
    markPostFiestasWelcomeSeen(storage, now);
    markPostFiestasWelcomeSeenInSession(sessionStorage, now);
  };

  const hide = ({ remember = true } = {}) => {
    if (!isOpen) return;
    root.hidden = true;
    isOpen = false;
    document.body.style.overflow = previousOverflow;
    if (remember && !preview) {
      trackPostFiestasWelcomeDismissed();
    }
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus = null;
  };

  const show = () => {
    if (isOpen) return false;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.hidden = false;
    isOpen = true;
    rememberShown();
    if (!preview) trackPostFiestasWelcomeViewed();
    closeButton.focus({ preventScroll: true });
    return true;
  };

  const dismiss = () => hide();
  closeButton.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  links.forEach((link) => {
    link.addEventListener('click', () => {
      if (!isOpen) return;
      rememberShown();
      trackPostFiestasWelcomeClicked(link.dataset.fiestasPostFiestasWelcomeLink);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [closeButton, ...links].filter((element) => !element.disabled && !element.hidden);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  show();
  return { show, hide, isOpen: () => isOpen };
}

if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
  setupPostFiestasBanner();
  setupPostFiestasWelcome();
}
