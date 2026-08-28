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

export function createCasetaQrTargetUrl({ baseUrl, id, slug }) {
  const url = new URL(`/c/${encodeURIComponent(id)}/${encodeURIComponent(slug)}/`, baseUrl);
  url.searchParams.set('mtm_campaign', 'QR');
  return url.toString();
}

export function createCasetaQrPosterSvg({ qrSvg, logoHref, logoDataUri, siteUrl }) {
  const { viewBox, content } = qrSvgParts(qrSvg);
  const [, , qrWidth] = viewBox.trim().split(/[\s,]+/).map(Number);
  if (!Number.isFinite(qrWidth) || qrWidth <= 0) throw new Error('El código QR no tiene unas dimensiones válidas.');
  const qrScale = 560 / qrWidth;
  const visibleUrl = new URL(siteUrl).host;
  const logo = logoHref || logoDataUri;
  if (!logo) throw new Error('El cartel QR necesita una referencia al logo.');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 1600" role="img" aria-labelledby="poster-title poster-description">
  <title id="poster-title">Valora nuestros pinchos</title>
  <desc id="poster-description">Escanea el código QR para descubrir y valorar las casetas de feria de día.</desc>
  <defs>
    <linearGradient id="poster-background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff7e8" />
      <stop offset="0.55" stop-color="#fffdf5" />
      <stop offset="1" stop-color="#f1e9fb" />
    </linearGradient>
    <radialGradient id="poster-glow" cx="0.12" cy="0.2" r="0.8">
      <stop offset="0" stop-color="#f2c86b" stop-opacity="0.3" />
      <stop offset="1" stop-color="#f2c86b" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="1200" height="1600" fill="url(#poster-background)" />
  <rect width="1200" height="1600" fill="url(#poster-glow)" />

  <g transform="translate(120 105)">
    <image x="0" y="0" width="145" height="145" preserveAspectRatio="xMidYMid meet" href="${escapeXml(logo)}" xlink:href="${escapeXml(logo)}" />
    <text x="185" y="62" fill="#1f293b" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" letter-spacing="7">ALDEA PUCELA</text>
    <text x="185" y="110" fill="#5e6c84" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600">Fiestas Valladolid 2026</text>
  </g>

  <text x="600" y="365" text-anchor="middle" fill="#73579f" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700" letter-spacing="8">CASETAS · FERIA DE DÍA</text>
  <text x="600" y="470" text-anchor="middle" fill="#172033" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="700">Valora nuestros</text>
  <text x="600" y="560" text-anchor="middle" fill="#0f9f8d" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700">pinchos</text>
  <rect x="360" y="620" width="480" height="4" rx="2" fill="#0f9f8d" opacity="0.45" />
  <text x="600" y="715" text-anchor="middle" fill="#172033" font-family="Arial, Helvetica, sans-serif" font-size="39" font-weight="700" letter-spacing="4">ESCANEA EL CÓDIGO</text>

  <rect x="155" y="770" width="890" height="640" rx="34" fill="#ffffff" stroke="#e2d9ee" stroke-width="4" />
  <g transform="translate(320 810) scale(${qrScale})">${content}</g>
  <text x="600" y="1465" text-anchor="middle" fill="#0f746b" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" letter-spacing="1">${escapeXml(visibleUrl)}</text>
</svg>
`;
}
