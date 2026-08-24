const popularCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function rankPopularEvents(events = [], saveCounts = new Map(), minimumSaveCount = 3) {
  return events
    .filter((event) => getCount(saveCounts, event?.id) >= minimumSaveCount)
    .sort((a, b) => {
      const countDifference = getCount(saveCounts, b?.id) - getCount(saveCounts, a?.id);
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
