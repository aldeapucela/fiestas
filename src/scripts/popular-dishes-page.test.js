import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPopularDishes } from './popular-dishes-page.js';

const casetas = [
  {
    id: 'z2-07',
    name: 'Madame X',
    slug: 'madame-x',
    location: 'San Benito',
    color: '#73579f',
    details: {
      menuSections: [
        { votable: true, items: [{ id: 'pincho-brocheta-pollo', name: 'Brocheta de pollo' }] }
      ]
    }
  },
  {
    id: 'z3-01',
    name: 'La Tasca Castellana',
    slug: 'la-tasca-castellana',
    location: 'Plaza de la Universidad',
    color: '#d48625',
    details: {
      menuSections: [
        { votable: true, items: [{ id: 'racion-cecina-leon', name: 'Cecina de León' }] },
        { votable: false, items: [{ id: 'bebida-agua', name: 'Agua' }] }
      ]
    }
  }
];

test('ranks known popular dishes by likes and links them to their caseta', () => {
  const ranked = rankPopularDishes(casetas, [
    { casetaId: 'z2-07', dishId: 'pincho-brocheta-pollo', likeCount: 4 },
    { casetaId: 'z3-01', dishId: 'racion-cecina-leon', likeCount: 7 },
    { casetaId: 'z9-99', dishId: 'pincho-unknown', likeCount: 100 },
    { casetaId: 'z2-07', dishId: 'bebida-agua', likeCount: 20 },
    { casetaId: 'z2-07', dishId: 'pincho-brocheta-pollo', likeCount: 0 }
  ]);

  assert.deepEqual(ranked.map((dish) => dish.dishName), ['Cecina de León', 'Brocheta de pollo']);
  assert.equal(ranked[0].url, '/c/z3-01/la-tasca-castellana/');
  assert.equal(ranked[0].likeCount, 7);
});

test('uses the dish name and caseta name as deterministic tie breakers', () => {
  const ranked = rankPopularDishes(casetas, [
    { casetaId: 'z2-07', dishId: 'pincho-brocheta-pollo', likeCount: 2 },
    { casetaId: 'z3-01', dishId: 'racion-cecina-leon', likeCount: 2 }
  ]);

  assert.deepEqual(ranked.map((dish) => dish.dishName), ['Brocheta de pollo', 'Cecina de León']);
});
