import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const eventsPath = path.join(root, 'src', 'data', 'fiestas-2026', 'events.json');
const sourceBase = 'https://eventos.aldeapucela.org';
const sitemapUrl = sourceBase + '/sitemap.xml';
const writeChanges = process.argv.includes('--write');
const concurrency = 8;
const requestTimeoutMs = 15000;

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCore(value = '') {
  const genericTokens = new Set(['teatro', 'concierto', 'festival', 'musical', 'obra', 'teatral', 'espectaculo', 'musica', 'cine']);
  const rawTokens = normalize(value).split(' ').filter(Boolean);
  const coreTokens = rawTokens.filter((token) => !genericTokens.has(token));
  return (coreTokens.length ? coreTokens : rawTokens).join(' ');
}

function tokens(value = '') {
  return new Set(titleCore(value).split(' ').filter(Boolean));
}

function dateOnly(value = '') {
  return String(value).slice(0, 10);
}

function timeOnly(value = '') {
  const match = String(value).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function dateMatches(event, remote) {
  const date = event.date;
  const start = dateOnly(remote.startDate);
  const end = dateOnly(remote.endDate || remote.startDate);
  return Boolean(start && date >= start && date <= end);
}

function locationText(remote) {
  const location = remote.location || {};
  const address = location.address || {};
  return [
    location.name,
    address.streetAddress,
    address.addressLocality,
    address.addressRegion
  ].filter(Boolean).join(' ');
}

function locationScore(event, remote) {
  const local = normalize(event.location || event.zone || '');
  const remoteValue = normalize(locationText(remote));
  if (!local || !remoteValue) return 0;
  if (remoteValue.includes(local) || local.includes(remoteValue)) return 1;
  const localTokens = new Set(local.split(' '));
  const remoteTokens = new Set(remoteValue.split(' '));
  const overlap = [...localTokens].filter((token) => token.length > 3 && remoteTokens.has(token));
  return overlap.length >= 2 ? 0.7 : overlap.length === 1 ? 0.25 : 0;
}

function titleScore(event, remote) {
  const local = normalize(event.title);
  const remoteValue = normalize(remote.name);
  const localCore = titleCore(event.title);
  const remoteCore = titleCore(remote.name);
  if (!local || !remoteValue) return 0;
  if (local === remoteValue || localCore === remoteCore) return 1;
  if (remoteValue.includes(local) || remoteCore.includes(localCore)) return 0.94;
  const localTokens = tokens(event.title);
  const remoteTokens = tokens(remote.name);
  const overlap = [...localTokens].filter((token) => remoteTokens.has(token));
  if (!localTokens.size) return 0;
  return overlap.length / localTokens.size;
}

function matchScore(event, remote) {
  if (!dateMatches(event, remote)) return null;
  const title = titleScore(event, remote);
  if (title < 0.65) return null;
  const location = locationScore(event, remote);
  const localTime = event.startTime;
  const remoteTime = timeOnly(remote.startDate);
  const time = !localTime || !remoteTime || remoteTime === '00:00' ? 0.35 : localTime === remoteTime ? 1 : 0;
  const score = (title * 10) + (location * 4) + (time * 2);
  if (title < 0.9 && location === 0 && time === 0) return null;
  return { score, title, location, time };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'fiestas-valladolid-image-linker/1.0' }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const values = Array.isArray(parsed) ? parsed : [parsed];
      const event = values.find((value) => value && typeof value === 'object' && (value['@type'] === 'Event' || String(value['@type'] || '').endsWith('Event')));
      if (event?.name && event?.startDate) return event;
    } catch {
      // Ignore malformed structured data from unrelated script blocks.
    }
  }
  return null;
}

async function loadRemoteEvents() {
  const sitemap = await fetchText(sitemapUrl);
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/eventos\.aldeapucela\.org\/e\/[^<]+)<\/loc>/g)].map((match) => match[1]);
  const remotes = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex++;
      const url = urls[index];
      try {
        const event = extractJsonLd(await fetchText(url));
        if (event) remotes.push({ ...event, url });
      } catch (error) {
        console.warn(`No se pudo leer ${url}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { urls, remotes };
}

function chooseMatch(event, remotes) {
  return remotes
    .map((remote) => {
      const score = matchScore(event, remote);
      return score ? { remote, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score.score - a.score.score)[0] || null;
}

const sourceEvents = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
const { urls, remotes } = await loadRemoteEvents();
const matches = [];
const unmatched = [];

for (const event of sourceEvents) {
  const match = chooseMatch(event, remotes);
  if (!match || !match.remote.image) {
    unmatched.push(event);
    continue;
  }
  event.image = Array.isArray(match.remote.image) ? match.remote.image[0] : String(match.remote.image);
  matches.push({
    id: event.id,
    title: event.title,
    image: event.image,
    source: match.remote.url,
    score: Number(match.score.score.toFixed(2)),
    titleScore: Number(match.score.title.toFixed(2)),
    locationScore: Number(match.score.location.toFixed(2)),
    timeScore: Number(match.score.time.toFixed(2))
  });
}

if (writeChanges) {
  await fs.writeFile(eventsPath, JSON.stringify(sourceEvents, null, 2) + '\n');
}

console.log(JSON.stringify({
  mode: writeChanges ? 'write' : 'dry-run',
  sitemapUrls: urls.length,
  remoteEvents: remotes.length,
  localEvents: sourceEvents.length,
  matches: matches.length,
  unmatched: unmatched.length,
  matchedEvents: matches,
  unmatchedEvents: unmatched.map((event) => ({ id: event.id, title: event.title, date: event.date, startTime: event.startTime, location: event.location }))
}, null, 2));
