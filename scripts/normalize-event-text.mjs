import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const eventsPath = 'src/data/fiestas-2026/events.json';
const reportPath = 'docs/event-normalization-comparison.md';
const execFileAsync = promisify(execFile);

const textFields = ['title', 'location', 'zone', 'description', 'summary', 'type'];
const listFields = ['organizers', 'collaborators', 'tags'];
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

  if (Array.isArray(next.performances)) {
    const normalized = normalizePerformanceList(next.performances);
    if (JSON.stringify(normalized) !== JSON.stringify(next.performances)) {
      changes.push({
        field: 'performances',
        before: next.performances.join(' | '),
        after: normalized.join(' | ')
      });
      next.performances = normalized;
    }
  }

  normalizeAttributions(next, changes);

  for (const field of listFields) {
    if (!Array.isArray(next[field])) continue;
    const normalizedList = uniqueValues(next[field].map((value, index) => {
      if (typeof value !== 'string') return value;
      const normalized = normalizeText(value);
      if (normalized !== value) {
        changes.push({ field: `${field}[${index}]`, before: value, after: normalized });
      }
      return normalized;
    }).filter((value) => typeof value !== 'string' || isValidAttributionValue(value)));

    if (JSON.stringify(normalizedList) !== JSON.stringify(next[field])) {
      changes.push({
        field,
        before: next[field].join(' | '),
        after: normalizedList.join(' | ')
      });
      next[field] = normalizedList;
    }
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

function normalizeAttributions(event, changes) {
  const beforeOrganizers = [...(Array.isArray(event.organizers) ? event.organizers : [])];
  const beforeCollaborators = [...(Array.isArray(event.collaborators) ? event.collaborators : [])];
  const beforePerformances = [...(Array.isArray(event.performances) ? event.performances : [])];

  event.organizers = beforeOrganizers;
  event.collaborators = beforeCollaborators;

  for (const field of ['description', 'summary']) {
    if (typeof event[field] !== 'string') continue;
    const result = cleanAttributionsFromText(event[field]);
    addAttributions(event.organizers, result.organizers);
    addAttributions(event.collaborators, result.collaborators);
    if (result.text !== event[field]) {
      changes.push({ field, before: event[field], after: result.text });
      event[field] = result.text;
    }
  }

  if (Array.isArray(event.performances)) {
    event.performances = event.performances.map((value) => {
      if (typeof value !== 'string') return value;
      const result = cleanAttributionsFromText(value);
      addAttributions(event.organizers, result.organizers);
      addAttributions(event.collaborators, result.collaborators);
      return result.text;
    }).filter(Boolean);
  }

  event.organizers = cleanAttributionList(event.organizers, 'organizers');
  event.collaborators = cleanAttributionList(event.collaborators, 'collaborators');
  event.organizers = removeCrossListedAttributions(event.organizers, event.collaborators);

  removeListValuesFromText(event, 'description', [...event.organizers, ...event.collaborators], changes);
  removeListValuesFromText(event, 'summary', [...event.organizers, ...event.collaborators], changes);

  if (JSON.stringify(beforeOrganizers) !== JSON.stringify(event.organizers)) {
    changes.push({
      field: 'organizers',
      before: beforeOrganizers.join(' | '),
      after: event.organizers.join(' | ')
    });
  }

  if (JSON.stringify(beforeCollaborators) !== JSON.stringify(event.collaborators)) {
    changes.push({
      field: 'collaborators',
      before: beforeCollaborators.join(' | '),
      after: event.collaborators.join(' | ')
    });
  }

  if (JSON.stringify(beforePerformances) !== JSON.stringify(event.performances)) {
    changes.push({
      field: 'performances',
      before: beforePerformances.join(' | '),
      after: event.performances.join(' | ')
    });
  }
}

function cleanAttributionsFromText(value) {
  let text = value;
  const organizers = [];
  const collaborators = [];
  const matches = [...text.matchAll(/\b(Organiza|Organizan|Colabora|Colaboran):\s*/giu)];

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const start = match.index;
    const valueStart = start + match[0].length;
    const nextStart = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const rawSegment = text.slice(valueStart, nextStart);
    const segment = trimAttributionSegment(rawSegment);
    const values = parseAttributionValues(segment);

    if (/^Organiza/iu.test(match[1])) addAttributions(organizers, values);
    if (/^Colabora/iu.test(match[1])) addAttributions(collaborators, values);

    text = `${text.slice(0, start)}${text.slice(nextStart)}`;
  }

  return {
    text: cleanAttributionText(text),
    organizers,
    collaborators
  };
}

function trimAttributionSegment(value) {
  return value
    .replace(/\s+Entrada:.*$/iu, '')
    .replace(/\s+\+\s*Info.*$/iu, '')
    .replace(/\s+Info\s+.*$/iu, '')
    .replace(/\s*[\s.]+$/u, '')
    .trim();
}

function parseAttributionValues(value) {
  return splitAttributionValue(value)
    .map(cleanAttributionValue)
    .filter(isValidAttributionValue);
}

function splitAttributionValue(value) {
  const parts = splitOutsideQuotes(value, ',');
  if (parts.length > 1) return parts;
  return [value];
}

function addAttributions(target, values) {
  for (const value of values) {
    const cleaned = cleanAttributionValue(value);
    if (!isValidAttributionValue(cleaned)) continue;
    if (target.some((item) => item.toLocaleLowerCase('es-ES') === cleaned.toLocaleLowerCase('es-ES'))) continue;
    target.push(cleaned);
  }
}

function cleanAttributionList(values, field) {
  return compactAttributionValues(uniqueValues(values.flatMap((value) => {
    const cleaned = cleanAttributionValue(value);
    if (!isValidAttributionValue(cleaned)) return [];

    const nested = String(value || '').match(/^(Organiza|Organizan|Colabora|Colaboran):\s*(.+)$/iu);
    if (nested && field === 'organizers' && /^Colabora/iu.test(nested[1])) return [];
    if (nested && field === 'collaborators' && /^Organiza/iu.test(nested[1])) return [];
    return nested ? parseAttributionValues(nested[1]) : [cleaned];
  })));
}

function cleanAttributionValue(value) {
  return normalizeText(String(value || ''))
    .replace(/\s+Entrada:.*$/iu, '')
    .replace(/\bCoordina dora\b/giu, 'Coordinadora')
    .replace(/\bFun dación\b/giu, 'Fundación')
    .replace(/\bFunda ción\b/giu, 'Fundación')
    .replace(/\bBa loncesto\b/giu, 'Baloncesto')
    .replace(/\bEspaño la\b/giu, 'Española')
    .replace(/^(?:Organiza|Organizan|Colabora|Colaboran):\s*/iu, '')
    .replace(/\s*[\s.]+$/u, '')
    .trim();
}

function isValidAttributionValue(value) {
  return Boolean(value)
    && !/^(?:Organiza|Organizan|Colabora|Colaboran):?$/iu.test(value)
    && !/^(?:Info|Entrada|A continuación)$/iu.test(value)
    && value.length > 2;
}

function removeListValuesFromText(event, field, values, changes) {
  if (typeof event[field] !== 'string') return;
  const before = event[field];
  let text = before;

  const sorted = values
    .map(cleanAttributionValue)
    .filter(isValidAttributionValue)
    .sort((a, b) => b.length - a.length);

  for (const value of sorted) {
    text = removeAttributionValueSuffix(text, value);
  }

  const cleaned = cleanAttributionText(text);
  if (cleaned !== before) {
    changes.push({ field, before, after: cleaned });
    event[field] = cleaned;
  }
}

function removeAttributionValueSuffix(text, value) {
  const escaped = escapeRegExp(value);
  return text
    .replace(new RegExp(`(?:\\.?\\s+)${escaped}$`, 'iu'), '')
    .replace(new RegExp(`(?:\\.?\\s+)${escaped}(?=\\s*$)`, 'iu'), '');
}

function removeCrossListedAttributions(organizers, collaborators) {
  if (organizers.length < 2) return organizers;
  const collaboratorKeys = collaborators.map((value) => value.toLocaleLowerCase('es-ES'));
  const filtered = organizers.filter((value) => {
    const key = value.toLocaleLowerCase('es-ES');
    return !collaboratorKeys.some((collaborator) => collaborator === key || collaborator.includes(key));
  });
  return filtered.length ? filtered : organizers;
}

function compactAttributionValues(values) {
  return values.filter((value, index) => {
    const key = value.toLocaleLowerCase('es-ES');
    return !values.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      const otherKey = other.toLocaleLowerCase('es-ES');
      return otherKey.length > key.length && otherKey.includes(key);
    });
  });
}

function cleanAttributionText(value) {
  return value
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\.\s*\./g, '.')
    .replace(/\s*,\s*$/u, '')
    .replace(/\s*[\s.]+$/u, '')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePerformanceList(values) {
  return uniqueValues(values.flatMap((value) => {
    if (typeof value !== 'string') return [];
    return splitPerformance(normalizeText(value)).map(normalizePerformanceItem).filter(Boolean);
  }));
}

function splitPerformance(value) {
  const sentences = value
    .split(/\.\s+A continuación,?/u)
    .map(cleanPerformanceSentence)
    .filter(Boolean);

  return sentences.flatMap((sentence) => splitPerformanceSentence(sentence));
}

function splitPerformanceSentence(value) {
  const cleaned = cleanPerformanceSentence(value);
  if (!cleaned) return [];

  const listText = extractPerformanceList(cleaned);
  if (!listText || !isClearPerformanceList(listText)) return [cleaned];

  return splitListText(listText)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractPerformanceList(value) {
  const withoutOrganizer = stripKnownOrganizerSuffix(value);

  const prefixed = withoutOrganizer.match(/^(?:Con DJs|Con los DJs|Con artistas|Con los artistas|Actuaciones(?: de las bandas)?|Actuaciones: Grupos?|Actuaciones:|Danzando en la calle:|Moreras Beach Fest:|Primera Concentración de Charangas)\s+(.+)$/iu)
    || withoutOrganizer.match(/\bActuaciones de las bandas\s+(.+)$/iu);
  return prefixed ? prefixed[1].trim() : withoutOrganizer;
}

function isClearPerformanceList(value) {
  if (!value.includes(',')) return false;
  if (!hasBalancedSmartQuotes(value)) return false;
  const parts = splitListText(value);
  if (parts.length < 2) return false;
  return parts.every((part) => {
    const trimmed = part.trim();
    if (!trimmed) return false;
    return trimmed.length <= 90 && !/^(?:con|por|para|hasta|a continuación)\b/iu.test(trimmed);
  });
}

function splitListText(value) {
  const commaParts = splitOutsideQuotes(value, ',');
  if (commaParts.length < 2) return [value];

  const last = commaParts.at(-1);
  const finalAndParts = splitFinalAndOutsideQuotes(last);
  if (finalAndParts.length > 1) {
    commaParts.splice(commaParts.length - 1, 1, ...finalAndParts);
  }

  return commaParts;
}

function cleanPerformanceSentence(value) {
  return value
    .replace(/^A continuación,?\s+/iu, '')
    .replace(/^Música en directo\s+/iu, '')
    .replace(/^Con\s+(?:los|las)?\s*/iu, 'Con ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePerformanceItem(value) {
  const normalized = stripKnownOrganizerSuffix(value)
    .replace(/^(?:con\s+)?(?:los\s+)?DJs?\s+(?=\S)/iu, 'DJ ')
    .replace(/\s+\.$/u, '.')
    .replace(/\.$/u, '')
    .trim();

  if (/^(?:DJs?|Coordinadora de Peñas|Fevapeñas|Rock&Roll Club Valladolid)$/u.test(normalized)) return '';
  return normalized;
}

function uniqueValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase('es-ES');
    if (seen.has(key)) continue;
    if (result.some((existing) => existing.toLocaleLowerCase('es-ES').startsWith(key))) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function stripKnownOrganizerSuffix(value) {
  return value
    .replace(/(?:\.\s*|\s+)Fevapeñas$/u, '')
    .replace(/(?:\.\s*|\s+)Rock&Roll Club Valladolid$/u, '')
    .replace(/(?<!\bde la)(?:\.\s*|\s+)Coordinadora de Peñas$/u, '')
    .trim();
}

function hasBalancedSmartQuotes(value) {
  return (value.match(/“/gu) || []).length === (value.match(/”/gu) || []).length;
}

function splitOutsideQuotes(value, separator) {
  const parts = [];
  let current = '';
  let quote = null;

  for (const char of value) {
    quote = nextQuoteState(char, quote);
    if (!quote && char === separator) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  parts.push(current.trim());
  return parts.filter(Boolean);
}

function splitFinalAndOutsideQuotes(value) {
  const matches = [];
  let quote = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    quote = nextQuoteState(char, quote);
    if (quote) continue;
    if (value.slice(index, index + 3) === ' y ') matches.push(index);
  }

  if (!matches.length) return [value.trim()];
  const index = matches.at(-1);
  return [
    value.slice(0, index).trim(),
    value.slice(index + 3).trim()
  ].filter(Boolean);
}

function nextQuoteState(char, quote) {
  if (char === '“') return '”';
  if (char === '”' && quote === '”') return null;
  if (char === '"' && quote === '"') return null;
  if (char === '"' && !quote) return '"';
  return quote;
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

const sourceRef = getSourceRef();
const source = sourceRef
  ? await readGitVersion(sourceRef, eventsPath)
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

function getSourceRef() {
  if (process.argv.includes('--from-head')) return 'HEAD';
  const refArg = process.argv.find((arg) => arg.startsWith('--from-ref='));
  return refArg ? refArg.slice('--from-ref='.length) : '';
}

async function readGitVersion(ref, path) {
  const { stdout } = await execFileAsync('git', ['show', `${ref}:${path}`], { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}
