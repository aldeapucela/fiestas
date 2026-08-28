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

test('genera un cartel QR autónomo sin el pie redundante', () => {
  const poster = createCasetaQrPosterSvg({
    qrSvg,
    logoDataUri: 'data:image/png;base64,logo',
    siteUrl: 'https://fiestas.aldeapucela.org/c/z1-05/la-criolla/'
  });

  assert.match(poster, /Valora nuestros/);
  assert.match(poster, /ESCANEA EL CÓDIGO/);
  assert.match(poster, /fiestas\.aldeapucela\.org/);
  assert.match(poster, /data:image\/png;base64,logo/);
  assert.equal((poster.match(/<svg\b/g) || []).length, 1);
  assert.doesNotMatch(poster, /Escanea para descubrir y valorar\./);
  assert.doesNotMatch(poster, /La Criolla/);
});

test('compacta una matriz QR en una imagen SVG válida', () => {
  const compact = createCompactQrSvg({ modules: { size: 2, data: new Uint8Array([1, 0, 0, 1]) } });
  assert.match(compact, /viewBox="0 0 2 2"/);
  assert.match(compact, /M0 0h1v1h-1zM1 1h1v1h-1z/);
});

test('añade la campaña QR a la URL de destino de la caseta', () => {
  assert.equal(
    createCasetaQrTargetUrl({ baseUrl: 'https://fiestas.aldeapucela.org', id: 'z1-05', slug: 'la-criolla' }),
    'https://fiestas.aldeapucela.org/c/z1-05/la-criolla/?mtm_campaign=QR'
  );
});
