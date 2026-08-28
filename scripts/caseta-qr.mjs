function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function qrSvgParts(qrSvg) {
  const source = String(qrSvg || '');
  const viewBox = source.match(/\bviewBox="([^"]+)"/)?.[1] || '0 0 1 1';
  const content = source
    .replace(/^\s*<\?xml[^>]*>\s*/i, '')
    .replace(/^\s*<!doctype[^>]*>\s*/i, '')
    .replace(/^\s*<svg\b[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '');
  return { viewBox, content };
}

export function createCompactQrSvg(qrCode) {
  const size = Number(qrCode?.modules?.size || 0);
  const data = qrCode?.modules?.data;
  if (!size || !data || data.length !== size * size) throw new Error('El código QR no tiene una matriz válida.');

  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!data[row * size + column]) continue;
      path += `M${column} ${row}h1v1h-1z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path fill="#000000" d="${path}"/></svg>`;
}

export function createCasetaQrTargetUrl({ baseUrl, publicSlug, slug }) {
  const routeSlug = String(publicSlug || slug || '').trim();
  if (!routeSlug) throw new Error('El QR necesita el publicSlug de la caseta.');
  const url = new URL(`/c/${encodeURIComponent(routeSlug)}/`, baseUrl);
  url.searchParams.set('mtm_campaign', 'QR');
  return url.toString();
}

export function createCasetaQrPosterSvg({ qrSvg, logoHref, logoDataUri, siteUrl }) {
  const { viewBox, content } = qrSvgParts(qrSvg);
  const [, , qrWidth] = viewBox.trim().split(/[\s,]+/).map(Number);
  if (!Number.isFinite(qrWidth) || qrWidth <= 0) throw new Error('El código QR no tiene unas dimensiones válidas.');
  const visibleUrl = new URL(siteUrl).host;
  const logo = logoHref || logoDataUri;
  if (!logo) throw new Error('El cartel QR necesita una referencia al logo.');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 1600" role="img" aria-labelledby="poster-title poster-description">
  <title id="poster-title">Valora nuestros pinchos</title>
  <desc id="poster-description">Escanea el código QR para descubrir y valorar las casetas de feria de día.</desc>
  <rect width="1200" height="1600" fill="#fffdfa" />

  <image x="525" y="72" width="150" height="150" preserveAspectRatio="xMidYMid meet" href="${escapeXml(logo)}" xlink:href="${escapeXml(logo)}" />
  <text x="600" y="270" text-anchor="middle" fill="#172b4d" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" letter-spacing="8">ALDEA PUCELA</text>
  <text x="600" y="316" text-anchor="middle" fill="#5d7393" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">Fiestas Valladolid 2026</text>

  <text x="600" y="472" text-anchor="middle" fill="#0f9f8d" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700" letter-spacing="7">CASETAS · FERIA DE DÍA</text>
  <text x="600" y="625" text-anchor="middle" fill="#102342" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="700">Valora nuestros</text>
  <text x="600" y="740" text-anchor="middle" fill="#0f9f8d" font-family="Arial, Helvetica, sans-serif" font-size="94" font-weight="700">pinchos</text>
  <text x="600" y="900" text-anchor="middle" fill="#102342" font-family="Arial, Helvetica, sans-serif" font-size="39" font-weight="700" letter-spacing="4">ESCANEA EL CÓDIGO</text>

  <rect x="390" y="950" width="420" height="440" rx="28" fill="#ffffff" />
  <g transform="translate(420 990) scale(${360 / qrWidth})">${content}</g>
  <text x="600" y="1480" text-anchor="middle" fill="#0f746b" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" letter-spacing="1">${escapeXml(visibleUrl)}</text>
</svg>
`;
}
