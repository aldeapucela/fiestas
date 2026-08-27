import { normalizePlanIcon } from './plan-storage.js';

const TIME_ZONE = 'Europe/Madrid';
const FESTIVAL_ID = 'valladolid-2026';

// El JSON de eventos del cliente ya no incluye canonicalUrl: se reconstruye la
// URL absoluta desde urlPath (los .ics necesitan URLs completas).
function eventAbsoluteUrl(event) {
  const url = event?.canonicalUrl || event?.urlPath || '';
  if (!url || /^https?:\/\//i.test(url)) return url;
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://fiestas.aldeapucela.org';
  return origin + url;
}

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
    if (event.endTime) {
      const endDate = eventEndDate(event.date, event.startTime, event.endTime);
      lines.push(`DTEND;TZID=${TIME_ZONE}:${formatLocalDateTime(endDate, event.endTime)}`);
    }
    lines.push(`SUMMARY:${escapeIcs(event.title || 'Actividad')}`);
    const location = event.location || event.zone || event.neighborhood;
    if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
    const description = event.description || event.summary;
    if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    const url = eventAbsoluteUrl(event);
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
      icon: normalizePlanIcon(plan?.icon),
      activityIds: [...new Set((plan?.activityIds || []).map(String).filter(Boolean))]
    }],
    ...options
  };
}

export function createPlanJson(plan) {
  return JSON.stringify(createPlanPayload(plan), null, 2) + '\n';
}

export function createPlanImportUrl(plan, importUrl = '/plan/importar/') {
  const url = new URL(importUrl, window.location.origin);
  url.searchParams.set('hash', encodeBase64(createPlanJson(plan)));
  return url.toString();
}

export function decodePlanImportHash(hash) {
  const value = String(hash || '');
  if (!value) throw new Error('empty_hash');
  try {
    return decodeBase64(value);
  } catch (_) {
    throw new Error('invalid_base64');
  }
}

export function createIcsFile(events, name = 'fiestas-valladolid-2026') {
  return makeFile(`${slugify(name)}.ics`, createIcs(events, name), 'text/calendar;charset=utf-8');
}

export function createCalendarLinks(event, pageUrl = '') {
  const range = eventCalendarDateRange(event);
  if (!range) return { google: '', outlook: '' };

  const title = String(event?.title || 'Actividad');
  const location = event?.location || event?.zone || event?.neighborhood || '';
  const details = [event?.description || event?.summary || '', pageUrl || eventAbsoluteUrl(event)]
    .filter(Boolean)
    .join('\n\n');

  const google = new URL('https://calendar.google.com/calendar/render');
  google.searchParams.set('action', 'TEMPLATE');
  google.searchParams.set('text', title);
  google.searchParams.set('dates', `${formatUtc(range.start)}/${formatUtc(range.end)}`);
  if (details) google.searchParams.set('details', details);
  if (location) google.searchParams.set('location', location);

  const outlook = new URL('https://outlook.live.com/calendar/deeplink/compose');
  outlook.searchParams.set('path', '/calendar/action/compose');
  outlook.searchParams.set('rru', 'addevent');
  outlook.searchParams.set('subject', title);
  if (details) outlook.searchParams.set('body', details);
  if (location) outlook.searchParams.set('location', location);
  outlook.searchParams.set('startdt', range.start.toISOString());
  outlook.searchParams.set('enddt', range.end.toISOString());

  return { google: google.toString(), outlook: outlook.toString() };
}

export async function shareFileOrDownload(file, options = {}) {
  const payload = {
    title: options.title || file.name,
    text: options.text || '',
    files: [file]
  };
  if (!options.forceDownload) {
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(payload);
        return 'shared';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadFile(file);
  return 'downloaded';
}

function downloadFile(file) {
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

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(String(value || ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function formatLocalDateTime(date, time) {
  const [year, month, day] = String(date).split('-');
  const [hour = '00', minute = '00'] = String(time || '00:00').split(':');
  return `${year}${month}${day}T${hour.padStart(2, '0')}${minute.padStart(2, '0')}00`;
}

function eventCalendarDateRange(event) {
  const start = zonedDateTimeToDate(event?.date, event?.startTime);
  if (!start) return null;

  const end = event?.endTime
    ? zonedDateTimeToDate(eventEndDate(event.date, event.startTime, event.endTime), event.endTime)
    : new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end: end || new Date(start.getTime() + 60 * 60 * 1000) };
}

function zonedDateTimeToDate(date, time) {
  const dateMatch = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time || '00:00').match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(localAsUtc)) return null;

  let result = new Date(localAsUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(result);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const displayedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    result = new Date(result.getTime() - (displayedAsUtc - localAsUtc));
  }
  return result;
}

function eventEndDate(date, startTime, endTime) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes >= startMinutes) return date;

  const nextDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(nextDate.getTime())) return date;
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
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
