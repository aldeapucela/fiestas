const TIME_ZONE = 'Europe/Madrid';
const FESTIVAL_ID = 'valladolid-2026';

export function createIcs(events = [], calendarName = 'Fiestas Valladolid 2026') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aldea Pucela//Fiestas Valladolid 2026//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`
  ];

  events.filter((event) => event?.id && event.date).forEach((event) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcs(`${event.id}@fiestas.aldeapucela.org`)}`);
    lines.push(`DTSTAMP:${formatUtc(new Date())}`);
    lines.push(`DTSTART;TZID=${TIME_ZONE}:${formatLocalDateTime(event.date, event.startTime)}`);
    if (event.endTime) lines.push(`DTEND;TZID=${TIME_ZONE}:${formatLocalDateTime(event.date, event.endTime)}`);
    lines.push(`SUMMARY:${escapeIcs(event.title || 'Actividad')}`);
    const location = event.location || event.zone || event.neighborhood;
    if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
    const description = event.description || event.summary;
    if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    const url = event.canonicalUrl || event.urlPath;
    if (url) lines.push(`URL:${escapeIcs(url)}`);
    if (Number.isFinite(Number(event.coordinates?.lat)) && Number.isFinite(Number(event.coordinates?.lng))) {
      lines.push(`GEO:${Number(event.coordinates.lat)};${Number(event.coordinates.lng)}`);
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.flatMap(foldIcsLine).join('\r\n') + '\r\n';
}

export function createPlanPayload(plan, options = {}) {
  return {
    schemaVersion: 1,
    festival: FESTIVAL_ID,
    exportedAt: new Date().toISOString(),
    plans: [{
      name: String(plan?.name || 'Mi plan').trim(),
      activityIds: [...new Set((plan?.activityIds || []).map(String).filter(Boolean))]
    }],
    ...options
  };
}

export function createPlanFile(plan) {
  const payload = createPlanPayload(plan);
  const text = JSON.stringify(payload, null, 2) + '\n';
  return makeFile(`${slugify(plan?.name || 'mi-plan')}.fiestas-plan.json`, text, 'application/json');
}

export function createIcsFile(events, name = 'fiestas-valladolid-2026') {
  return makeFile(`${slugify(name)}.ics`, createIcs(events, name), 'text/calendar;charset=utf-8');
}

export async function shareFileOrDownload(file, options = {}) {
  const payload = {
    title: options.title || file.name,
    text: options.text || '',
    files: [file]
  };
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share(payload);
      return 'shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
  }
  downloadFile(file);
  return 'downloaded';
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeFile(name, text, type) {
  return new File([text], name, { type });
}

function formatLocalDateTime(date, time) {
  const [year, month, day] = String(date).split('-');
  const [hour = '00', minute = '00'] = String(time || '00:00').split(':');
  return `${year}${month}${day}T${hour.padStart(2, '0')}${minute.padStart(2, '0')}00`;
}

function formatUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line) {
  const chunks = [];
  let current = '';
  [...String(line)].forEach((character) => {
    if (current.length >= 70) {
      chunks.push(current);
      current = ' ';
    }
    current += character;
  });
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}

function slugify(value) {
  return String(value || 'plan')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plan';
}
