import { trackPostFiestasBannerClicked } from './analytics.js';

export const DEFAULT_POST_FIESTAS_START = '2026-09-11';
export const DEFAULT_POST_FIESTAS_END = null;

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

if (typeof document !== 'undefined' && typeof document.querySelector === 'function') setupPostFiestasBanner();
