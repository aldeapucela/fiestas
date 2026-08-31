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

export function createCasetaQrPosterSvg({ qrSvg, posterBaseHref, posterBaseDataUri, siteUrl }) {
  const { viewBox, content } = qrSvgParts(qrSvg);
  const [, , qrWidth] = viewBox.trim().split(/[\s,]+/).map(Number);
  if (!Number.isFinite(qrWidth) || qrWidth <= 0) throw new Error('El código QR no tiene unas dimensiones válidas.');
  const posterBase = posterBaseHref || posterBaseDataUri;
  if (!posterBase) throw new Error('El cartel QR necesita una referencia a la plantilla base.');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 904 1280" width="904" height="1280" role="img" aria-labelledby="poster-title poster-description">
  <title id="poster-title">Valora nuestros pinchos</title>
  <desc id="poster-description">Escanea el código QR para descubrir y valorar las casetas de feria de día.</desc>
  <image x="0" y="0" width="904" height="1280" preserveAspectRatio="none" href="${escapeXml(posterBase)}" xlink:href="${escapeXml(posterBase)}" />

  <!-- La plantilla ya contiene la composición, logo, textos y URL; solo reemplazamos su QR. -->
  <rect x="280" y="825" width="346" height="344" rx="18" fill="#fffdfa" stroke="#0f9f8d" stroke-width="3" />
  <g transform="translate(304 849) scale(${298 / qrWidth})">${content}</g>
</svg>
`;
}
