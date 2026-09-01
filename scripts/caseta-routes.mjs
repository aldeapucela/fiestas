const CASING_PATTERN = /[^a-z0-9]+/g;

export function slugifyCaseta(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(CASING_PATTERN, '-')
    .replace(/^-+|-+$/g, '') || 'caseta';
}

export function getCasetaPublicSlug(caseta) {
  return String(caseta?.publicSlug || '').trim() || slugifyCaseta(caseta?.name);
}

export function casetaDetailPath(publicSlug) {
  return `/c/${encodeURIComponent(String(publicSlug || '').trim())}/`;
}

export function casetaQrPath(publicSlug) {
  return `${casetaDetailPath(publicSlug)}qr/`;
}

export function casetaLegacyDetailPath(id, slug) {
  return `/c/${encodeURIComponent(String(id || '').trim())}/${encodeURIComponent(String(slug || '').trim())}/`;
}

export function casetaLegacyPaths(caseta) {
  const publicSlug = getCasetaPublicSlug(caseta);
  const slugs = new Set([
    slugifyCaseta(caseta?.name),
    ...(Array.isArray(caseta?.legacySlugs) ? caseta.legacySlugs : [])
  ].map((slug) => String(slug || '').trim()).filter(Boolean));
  return [...slugs].flatMap((slug) => {
    const legacyDetail = casetaLegacyDetailPath(caseta.id, slug);
    const paths = [{ detail: legacyDetail, qr: `${legacyDetail}qr/` }];
    if (slug !== publicSlug) {
      paths.push({ detail: casetaDetailPath(slug), qr: casetaQrPath(slug) });
    }
    return paths;
  });
}
