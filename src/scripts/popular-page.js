const popularCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const MIN_VISIBLE_POPULAR_EVENTS = 5;
const MAX_VISIBLE_POPULAR_EVENTS = 30;

export function rankPopularEvents(events = [], saveCounts = new Map(), minimumSaveCount = 10) {
  return rankEventsByCount(events, saveCounts, minimumSaveCount);
}

export function rankVisitedEvents(events = [], visitCounts = new Map(), minimumVisitCount = 3) {
  return rankEventsByCount(events, visitCounts, minimumVisitCount);
}

export function getPopularVisitThreshold(totalVisits) {
  const total = Number(totalVisits);
  if (!Number.isFinite(total) || total < 500) return 3;
  return Math.max(3, Math.ceil(total * 0.005));
}

export function filterPopularVisitedEvents(rankedEvents = [], visitCounts = new Map(), totalVisits = null) {
  const events = Array.isArray(rankedEvents) ? rankedEvents : [];
  const numericTotal = Number(totalVisits);
  const resolvedTotal = Number.isFinite(numericTotal) && numericTotal >= 0
    ? numericTotal
    : events.reduce((total, event) => total + getCount(visitCounts, event?.id), 0);
  const threshold = getPopularVisitThreshold(resolvedTotal);
  const filtered = events.filter((event) => getCount(visitCounts, event?.id) >= threshold);

  if (filtered.length >= MIN_VISIBLE_POPULAR_EVENTS || events.length <= MIN_VISIBLE_POPULAR_EVENTS) {
    return {
      events: filtered.slice(0, MAX_VISIBLE_POPULAR_EVENTS),
      threshold,
      totalVisits: resolvedTotal,
      usedFallback: false
    };
  }

  return {
    events: events.slice(0, MIN_VISIBLE_POPULAR_EVENTS),
    threshold,
    totalVisits: resolvedTotal,
    usedFallback: true
  };
}

function rankEventsByCount(events, counts, minimumCount) {
  return [...events]
    .filter((event) => getCount(counts, event?.id) >= minimumCount)
    .sort((a, b) => {
      const countDifference = getCount(counts, b?.id) - getCount(counts, a?.id);
      if (countDifference) return countDifference;

      const dateDifference = String(a?.date || '').localeCompare(String(b?.date || ''));
      if (dateDifference) return dateDifference;

      const timeDifference = sortMinutes(a?.startTime) - sortMinutes(b?.startTime);
      if (timeDifference) return timeDifference;

      return popularCollator.compare(String(a?.title || ''), String(b?.title || ''));
    });
}

function getCount(saveCounts, activityId) {
  const count = Number(saveCounts?.get?.(String(activityId || '')));
  return Number.isFinite(count) ? count : 0;
}

function sortMinutes(time = '') {
  if (!/^\d{2}:\d{2}$/.test(String(time))) return 99 * 60;
  const [hour, minute] = String(time).split(':').map(Number);
  const minutes = hour * 60 + minute;
  return hour < 6 ? minutes + 24 * 60 : minutes;
}
