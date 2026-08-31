export const DAILY_POPULAR_START_DATE = '2026-09-04';
export const DAILY_POPULAR_END_DATE = '2026-09-13';
export const DAILY_POPULAR_MAX_ITEMS = 6;
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const STORY_SAFE_TOP = 250;
export const STORY_SAFE_BOTTOM = 270;
export const STORY_CONTENT_BOTTOM = STORY_HEIGHT - STORY_SAFE_BOTTOM;
export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1440;
export const POST_MAX_ITEMS = 4;

const titleCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function eventId(event) {
  return String(event?.id ?? '').trim();
}

function eventTime(event) {
  return event?.startTime || '99:99';
}

function compareEvents(a, b) {
  if (b.popularityScore !== a.popularityScore) return b.popularityScore - a.popularityScore;
  if (b.saveCount !== a.saveCount) return b.saveCount - a.saveCount;
  if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
  const timeComparison = eventTime(a).localeCompare(eventTime(b));
  if (timeComparison !== 0) return timeComparison;
  const titleComparison = titleCollator.compare(String(a.title || ''), String(b.title || ''));
  if (titleComparison !== 0) return titleComparison;
  return titleCollator.compare(eventId(a), eventId(b));
}

function percentile(value, values) {
  if (values.length <= 1) return 1;
  const lower = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return (lower + ((equal - 1) / 2)) / (values.length - 1);
}

export function isDailyPopularDate(date) {
  return /^2026-09-(0[4-9]|1[0-3])$/.test(String(date || ''));
}

export function dailyPopularDates() {
  return Array.from({ length: 10 }, (_, index) => `2026-09-${String(index + 4).padStart(2, '0')}`);
}

export function formatStoryDate(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(value).replace(',', '');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function rankDailyPopularEvents(events, activities, limit = DAILY_POPULAR_MAX_ITEMS) {
  const metrics = new Map((Array.isArray(activities) ? activities : []).map((activity) => [
    String(activity?.id ?? '').trim(),
    {
      saveCount: finiteCount(activity?.saveCount),
      visitCount: finiteCount(activity?.visitCount)
    }
  ]));
  const candidates = (Array.isArray(events) ? events : []).map((event) => {
    const metric = metrics.get(eventId(event)) || { saveCount: 0, visitCount: 0 };
    return { ...event, ...metric };
  });
  const saveValues = candidates.map((event) => event.saveCount).sort((a, b) => a - b);
  const visitValues = candidates.map((event) => event.visitCount).sort((a, b) => a - b);
  return candidates
    .map((event) => {
      const savePercentile = percentile(event.saveCount, saveValues);
      const visitPercentile = percentile(event.visitCount, visitValues);
      return {
        ...event,
        savePercentile,
        visitPercentile,
        popularityScore: Number((savePercentile * 0.6 + visitPercentile * 0.4).toFixed(6))
      };
    })
    .sort(compareEvents)
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function selectStoryPosterEvents(events, limit = DAILY_POPULAR_MAX_ITEMS) {
  const usedImages = new Set();
  return (Array.isArray(events) ? events : [])
    .filter((event) => typeof event?.image === 'string' && event.image.startsWith('/assets/'))
    .filter((event) => {
      if (usedImages.has(event.image)) return false;
      usedImages.add(event.image);
      return true;
    })
    .slice(0, Math.max(0, Number(limit) || 0));
}
