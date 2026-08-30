// Texto de búsqueda compartido por la agenda y por las casetas.

// Compara sin acentos ni mayúsculas: "Café" y "cafe" son lo mismo.
export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Cada palabra de la consulta se busca por separado, así "japonesa taberna"
// encuentra "Taberna Japonesa Wabi-Sabi" y los espacios de más no estorban.
export function searchTokens(query = '') {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

export function matchesSearch(haystack = '', query = '') {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;
  const text = normalizeText(haystack);
  return tokens.every((token) => text.includes(token));
}
