import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCasetaDetailHref,
  getCasetasListPath,
  getCasetasReturnPath
} from '../src/scripts/casetas-navigation.js';

test('conserva una query combinada de casetas al enlazar a una ficha', () => {
  const href = buildCasetaDetailHref(
    { publicSlug: 'madame-x' },
    'http://127.0.0.1:8002/casetas/?favorites=1&dietary=vegan&dietary=gluten-free&search=cecina&zone=Zona+2&location=San+Benito'
  );
  const url = new URL(href, 'http://127.0.0.1:8002');

  assert.equal(url.pathname, '/c/madame-x/');
  assert.equal(
    url.searchParams.get('return'),
    '/casetas/?favorites=1&dietary=vegan&dietary=gluten-free&search=cecina&zone=Zona+2&location=San+Benito'
  );
});

test('restaura una vuelta válida a casetas y evita anidar retornos', () => {
  const path = getCasetasReturnPath(
    'https://fiestas.aldeapucela.org/c/madame-x/?return=%2Fcasetas%2F%3Fsearch%3Dcecina%26return%3Dignored'
  );

  assert.equal(path, '/casetas/?search=cecina');
  assert.equal(getCasetasListPath('https://fiestas.aldeapucela.org/c/madame-x/'), '');
});

test('rechaza retornos externos o rutas que no sean el listado de casetas', () => {
  assert.equal(
    getCasetasReturnPath('https://fiestas.aldeapucela.org/c/madame-x/?return=https%3A%2F%2Fevil.example%2F'),
    ''
  );
  assert.equal(
    getCasetasReturnPath('https://fiestas.aldeapucela.org/c/madame-x/?return=%2Fmapa%2F%3Ftype%3DM%C3%BAsica'),
    ''
  );
});

test('una ficha sin filtros mantiene su URL pública limpia', () => {
  assert.equal(
    buildCasetaDetailHref({ slug: 'la-criolla' }, 'https://fiestas.aldeapucela.org/casetas/'),
    '/c/la-criolla/'
  );
});
