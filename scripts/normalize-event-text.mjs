import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const eventsPath = 'src/data/fiestas-2026/events.json';
const reportPath = 'docs/event-normalization-comparison.md';
const execFileAsync = promisify(execFile);

const textFields = ['title', 'location', 'zone', 'description', 'summary', 'type'];
const listFields = ['performances', 'organizers', 'collaborators', 'tags'];
const ticketFields = ['label', 'note'];

const smallWords = new Set([
  'a',
  'al',
  'ante',
  'bajo',
  'con',
  'contra',
  'de',
  'del',
  'desde',
  'e',
  'el',
  'en',
  'entre',
  'hacia',
  'hasta',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'que',
  'se',
  'sin',
  'sobre',
  'tras',
  'u',
  'y'
]);

const preserveUpper = new Set([
  '3D',
  'CDO',
  'DJ',
  'DJS',
  'FMD',
  'MVP',
  'ONCE',
  'RFEA',
  'SBK',
  'UEMC'
]);

const exactTokenMap = new Map([
  ['DJ´S', 'DJs'],
  ['DJ´S,', 'DJs,'],
  ['DJ´S.', 'DJs.'],
  ["DJ'S", 'DJs'],
  ["DJ'S,", 'DJs,'],
  ["DJ'S.", 'DJs.'],
  ['DJS', 'DJs'],
  ['DJS,', 'DJs,'],
  ['DJS.', 'DJs.'],
  ['MR', 'Mr'],
  ['MR.', 'Mr.'],
  ['PZA', 'Pza.'],
  ['PZA.', 'Pza.'],
  ['C/', 'C/']
]);

const titleSeparators = new Set([':', '.', '!', '?', '¿', '¡', '/', '+', '&', '-']);

function normalizeEvent(event) {
  const changes = [];
  const next = structuredClone(event);

  for (const field of textFields) {
    if (typeof next[field] !== 'string') continue;
    const normalized = normalizeText(next[field]);
    if (normalized !== next[field]) {
      changes.push({ field, before: next[field], after: normalized });
      next[field] = normalized;
    }
  }

  for (const field of listFields) {
    if (!Array.isArray(next[field])) continue;
    next[field] = next[field].map((value, index) => {
      if (typeof value !== 'string') return value;
      const normalized = normalizeText(value);
      if (normalized !== value) {
        changes.push({ field: `${field}[${index}]`, before: value, after: normalized });
      }
      return normalized;
    });
  }

  if (next.ticket && typeof next.ticket === 'object') {
    for (const field of ticketFields) {
      if (typeof next.ticket[field] !== 'string') continue;
      const normalized = normalizeText(next.ticket[field]);
      if (normalized !== next.ticket[field]) {
        changes.push({ field: `ticket.${field}`, before: next.ticket[field], after: normalized });
        next.ticket[field] = normalized;
      }
    }
  }

  return { event: next, changes };
}

function normalizeText(value) {
  return value
    .replace(/\bDJ[´']S\b/gi, 'DJs')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(\s+)/)
    .map((token, index, tokens) => normalizeToken(token, shouldCapitalize(index, tokens)))
    .join('')
    .replace(/\s+([,.;:!?])/g, '$1');
}

function shouldCapitalize(index, tokens) {
  let previousWord = '';
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!tokens[i].trim()) continue;
    previousWord = tokens[i];
    break;
  }

  if (!previousWord) return true;
  const last = previousWord.trim().at(-1);
  return titleSeparators.has(last);
}

function normalizeToken(token, capitalize) {
  if (!token.trim()) return token;
  if (exactTokenMap.has(token)) return exactTokenMap.get(token);
  if (/^https?:\/\//i.test(token)) return token;

  const match = token.match(/^([^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]*)(.*?)([^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]*)$/u);
  if (!match) return token;

  const [, prefix, core, suffix] = match;
  const tokenCapitalize = capitalize || /[“"‘'¿¡(]$/u.test(prefix);
  if (!core) return token;
  if (!isAllCapsCore(core)) {
    const lower = core.toLocaleLowerCase('es-ES');
    if (core === lower && tokenCapitalize && smallWords.has(lower)) {
      return `${prefix}${capitalizeWord(lower)}${suffix}`;
    }
    return token;
  }
  if (isRomanNumeral(core)) return token;

  const normalizedCore = normalizeCore(core, tokenCapitalize);
  return `${prefix}${normalizedCore}${suffix}`;
}

function normalizeCore(core, capitalize) {
  const upper = core.toLocaleUpperCase('es-ES');
  if (preserveUpper.has(upper)) return upper === 'DJS' ? 'DJs' : upper;

  const lower = core.toLocaleLowerCase('es-ES');
  if (smallWords.has(lower)) return capitalize ? capitalizeWord(lower) : lower;

  return capitalizeWord(lower);
}

function isAllCapsCore(value) {
  const letters = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/gu, '');
  if (letters.length < 1) return false;
  const lower = letters.toLocaleLowerCase('es-ES');
  return (letters.length > 1 || smallWords.has(lower)) && letters === letters.toLocaleUpperCase('es-ES');
}

function isRomanNumeral(value) {
  return /^(?=[IVXLCDM]+$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/u.test(value);
}

function capitalizeWord(value) {
  return value
    .split('-')
    .map((part) => part ? `${part[0].toLocaleUpperCase('es-ES')}${part.slice(1)}` : part)
    .join('-');
}

function markdownEscape(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function makeReport(rows, events) {
  const fieldCounts = rows.reduce((counts, row) => {
    counts.set(row.field, (counts.get(row.field) || 0) + 1);
    return counts;
  }, new Map());

  const lines = [
    '# Comparativa de normalización de eventos',
    '',
    `Eventos revisados: ${events.length}`,
    `Campos cambiados: ${rows.length}`,
    '',
    '## Resumen por campo',
    '',
    '| Campo | Cambios |',
    '| --- | ---: |',
    ...[...fieldCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([field, count]) => `| ${markdownEscape(field)} | ${count} |`),
    '',
    '## Comparativa',
    '',
    '| ID | Campo | Antes | Normalizado |',
    '| ---: | --- | --- | --- |',
    ...rows.map((row) => `| ${row.id} | ${markdownEscape(row.field)} | ${markdownEscape(row.before)} | ${markdownEscape(row.after)} |`)
  ];

  return `${lines.join('\n')}\n`;
}

const source = process.argv.includes('--from-head')
  ? await readHeadVersion(eventsPath)
  : await fs.readFile(eventsPath, 'utf8');
const events = JSON.parse(source);
const normalized = [];
const rows = [];

for (const event of events) {
  const result = normalizeEvent(event);
  normalized.push(result.event);
  for (const change of result.changes) {
    rows.push({ id: event.id, ...change });
  }
}

await fs.writeFile(eventsPath, `${JSON.stringify(normalized, null, 2)}\n`);
await fs.writeFile(reportPath, makeReport(rows, events));

console.log(`Normalized ${events.length} events`);
console.log(`Changed ${rows.length} fields`);
console.log(`Report written to ${reportPath}`);

async function readHeadVersion(path) {
  const { stdout } = await execFileAsync('git', ['show', `HEAD:${path}`], { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}
