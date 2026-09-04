const EXPANDED_INFO_MARKER = /Información\s+ampliada\s*:/giu;

/**
 * Cleans descriptions coming from the remote events importer while keeping
 * intentional paragraph breaks. Import sources have historically prepended
 * the same expanded-information block more than once.
 */
export function normalizeEventDescription(value, { title = '', removeTitleOnly = true } = {}) {
  const text = String(value ?? '');
  if (!text.trim()) return '';

  const sections = text.split(EXPANDED_INFO_MARKER);
  const paragraphs = sections.flatMap((section) => splitParagraphs(section));
  const normalizedTitle = simplifyText(title);
  const uniqueParagraphs = [];

  for (const paragraph of paragraphs) {
    if (removeTitleOnly && normalizedTitle && simplifyText(paragraph) === normalizedTitle) continue;

    const duplicateIndex = uniqueParagraphs.findIndex((existing) => sameMeaning(existing, paragraph));
    if (duplicateIndex >= 0) {
      if (paragraphScore(paragraph) > paragraphScore(uniqueParagraphs[duplicateIndex])) {
        uniqueParagraphs[duplicateIndex] = paragraph;
      }
      continue;
    }

    uniqueParagraphs.push(paragraph);
  }

  // A description that consists only of the title still carries useful
  // fallback content. Remove title-only prefixes when there is more text, but
  // never turn an otherwise valid description into an empty value.
  return uniqueParagraphs.length
    ? uniqueParagraphs.join('\n\n')
    : paragraphs.join('\n\n');
}

export function simplifyText(value = '') {
  return cleanParagraph(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[‘’“”"'´]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

function splitParagraphs(value) {
  return cleanMarkup(value)
    .split(/\n{2,}/u)
    .map((paragraph) => cleanParagraph(paragraph))
    .filter(Boolean);
}

function cleanMarkup(value) {
  return String(value ?? '')
    .replace(/<\s*br\s*\/?>/giu, '\n\n')
    .replace(/<\s*\/(?:p|div|li|blockquote|h[1-6])\s*>/giu, '\n\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\r\n?/gu, '\n')
    .trim();
}

function cleanParagraph(value) {
  return String(value ?? '')
    .replace(/[ \t]+/gu, ' ')
    .replace(/[ \t]+([,.;:!?])/gu, '$1')
    .trim();
}

function sameMeaning(left, right) {
  const normalizedLeft = simplifyText(left);
  const normalizedRight = simplifyText(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

function paragraphScore(value) {
  return (/^[A-ZÁÉÍÓÚÜÑ]/u.test(value) ? 1000 : 0) + value.length;
}
