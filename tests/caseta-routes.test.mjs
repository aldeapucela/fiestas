import assert from 'node:assert/strict';
import test from 'node:test';
import {
  casetaDetailPath,
  casetaLegacyPaths,
  casetaQrPath,
  getCasetaPublicSlug,
  slugifyCaseta
} from '../scripts/caseta-routes.mjs';

test('genera una URL pública sin zona ni ID interno', () => {
  assert.equal(getCasetaPublicSlug({ id: 'z2-07', name: 'Madame X' }), 'madame-x');
  assert.equal(casetaDetailPath('madame-x'), '/c/madame-x/');
  assert.equal(casetaQrPath('madame-x'), '/c/madame-x/qr/');
});

test('conserva slugs públicos explícitos aunque cambie el nombre', () => {
  assert.equal(getCasetaPublicSlug({ name: 'Nombre actualizado', publicSlug: 'nombre-original' }), 'nombre-original');
});

test('construye rutas legacy para la ficha y su QR', () => {
  assert.deepEqual(casetaLegacyPaths({
    id: 'z1-05',
    name: 'La Criolla',
    publicSlug: 'la-criolla',
    legacySlugs: ['restaurante-la-criolla']
  }), [
    { detail: '/c/z1-05/la-criolla/', qr: '/c/z1-05/la-criolla/qr/' },
    { detail: '/c/z1-05/restaurante-la-criolla/', qr: '/c/z1-05/restaurante-la-criolla/qr/' },
    { detail: '/c/restaurante-la-criolla/', qr: '/c/restaurante-la-criolla/qr/' }
  ]);
});

test('normaliza nombres para los slugs derivados', () => {
  assert.equal(slugifyCaseta('Café-Bar La Castellana'), 'cafe-bar-la-castellana');
});

test('no crea una ruta legacy cuando el nombre no es único', () => {
  assert.deepEqual(casetaLegacyPaths({
    id: 'z5-06',
    name: 'Café Ibérico',
    publicSlug: 'cafe-iberico-recoletos'
  }, { includeNameSlug: false }), []);
});
