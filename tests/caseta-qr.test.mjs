import assert from 'node:assert/strict';
import test from 'node:test';
import { createCasetaQrPosterSvg, createCasetaQrTargetUrl, createCompactQrSvg, qrSvgParts } from '../scripts/caseta-qr.mjs';

const qrSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path fill="#000000" d="M0 0h1v1H0z" /></svg>';

test('extrae el contenido del QR sin anidar otro documento SVG', () => {
  assert.deepEqual(qrSvgParts(qrSvg), {
    viewBox: '0 0 21 21',
    content: '<path fill="#000000" d="M0 0h1v1H0z" />'
  });
});

test('genera un cartel QR sobre la plantilla visual sin duplicar su composición', () => {
  const poster = createCasetaQrPosterSvg({
    qrSvg,
    posterBaseDataUri: 'data:image/jpeg;base64,poster-base',
    siteUrl: 'https://fiestas.aldeapucela.org/c/z1-05/la-criolla/'
  });

  assert.match(poster, /data:image\/jpeg;base64,poster-base/);
  assert.match(poster, /viewBox="0 0 904 1280"/);
  assert.match(poster, /<rect x="280" y="825" width="346" height="344"/);
  assert.match(poster, /translate\(304 849\)/);
  assert.equal((poster.match(/<svg\b/g) || []).length, 1);
  assert.doesNotMatch(poster, /<text /);
});

test('compacta una matriz QR en una imagen SVG válida', () => {
  const compact = createCompactQrSvg({ modules: { size: 2, data: new Uint8Array([1, 0, 0, 1]) } });
  assert.match(compact, /viewBox="0 0 2 2"/);
  assert.match(compact, /M0 0h1v1h-1zM1 1h1v1h-1z/);
});

test('añade la campaña QR a la URL de destino de la caseta', () => {
  assert.equal(
    createCasetaQrTargetUrl({ baseUrl: 'https://fiestas.aldeapucela.org', publicSlug: 'la-criolla' }),
    'https://fiestas.aldeapucela.org/c/la-criolla/?mtm_campaign=QR'
  );
});
