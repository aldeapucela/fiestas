import assert from 'node:assert/strict';
import test from 'node:test';

const popularDishes = await import(`../src/scripts/popular-dishes-page.js?test=${Date.now()}`);

test('reads dietary filters from shareable URLs', () => {
  assert.deepEqual(popularDishes.readPopularDishFilters('?dietary=vegan&gluten-free=1'), {
    dietary: 'vegan',
    glutenFree: true
  });
  assert.deepEqual(popularDishes.readPopularDishFilters('?diet=vegetarian&glutenFree=1'), {
    dietary: 'vegetarian',
    glutenFree: true
  });
  assert.deepEqual(popularDishes.readPopularDishFilters('?dietary=unknown&gluten-free=0'), {
    dietary: '',
    glutenFree: false
  });
});

test('builds descriptive share labels for active dietary filters', () => {
  assert.equal(popularDishes.getPopularDishShareLabel({}), 'Pinchos populares');
  assert.equal(popularDishes.getPopularDishShareLabel({ dietary: 'vegetarian' }), 'Pinchos populares vegetarianos');
  assert.equal(popularDishes.getPopularDishShareLabel({ dietary: 'vegan' }), 'Pinchos populares veganos');
  assert.equal(popularDishes.getPopularDishShareLabel({ glutenFree: true }), 'Pinchos populares sin gluten');
  assert.equal(popularDishes.getPopularDishShareLabel({ dietary: 'vegetarian', glutenFree: true }), 'Pinchos populares vegetarianos y sin gluten');
});

test('filters dietary preferences before applying the popularity threshold', () => {
  const dishes = [
    { dishName: 'Pincho general', dietary: '', glutenFree: false, likeCount: 80 },
    { dishName: 'Pincho vegano', dietary: 'vegan', glutenFree: true, likeCount: 1 },
    { dishName: 'Pincho vegetariano', dietary: 'vegetarian', glutenFree: true, likeCount: 1 },
    { dishName: 'Pincho vegetariano con gluten', dietary: 'vegetarian', glutenFree: false, likeCount: 1 }
  ];

  const result = popularDishes.getPopularDishesForFilters(dishes, {
    dietary: 'vegan',
    glutenFree: true
  });

  assert.equal(result.totalLikes, 1);
  assert.equal(result.threshold, 1);
  assert.deepEqual(result.matchingDishes.map((dish) => dish.dishName), ['Pincho vegano']);
  assert.deepEqual(result.dishes.map((dish) => dish.dishName), ['Pincho vegano']);
});

test('vegetarian filtering includes vegan dishes and gluten-free remains an independent constraint', () => {
  const dishes = [
    { dishName: 'Vegano sin gluten', dietary: 'vegan', glutenFree: true, likeCount: 2 },
    { dishName: 'Vegetariano sin gluten', dietary: 'vegetarian', glutenFree: true, likeCount: 2 },
    { dishName: 'Vegetariano con gluten', dietary: 'vegetarian', glutenFree: false, likeCount: 2 }
  ];

  const result = popularDishes.getPopularDishesForFilters(dishes, {
    dietary: 'vegetarian',
    glutenFree: true
  });

  assert.deepEqual(result.matchingDishes.map((dish) => dish.dishName), [
    'Vegano sin gluten',
    'Vegetariano sin gluten'
  ]);
});

test('uses an adaptive vote threshold for popular dishes', () => {
  assert.equal(popularDishes.getPopularDishThreshold(0), 1);
  assert.equal(popularDishes.getPopularDishThreshold(49), 1);
  assert.equal(popularDishes.getPopularDishThreshold(50), 2);
  assert.equal(popularDishes.getPopularDishThreshold(249), 2);
  assert.equal(popularDishes.getPopularDishThreshold(250), 5);
  assert.equal(popularDishes.getPopularDishThreshold(499), 5);
  assert.equal(popularDishes.getPopularDishThreshold(500), 10);
});

test('filters low-volume dishes using the total vote count', () => {
  const dishes = [
    { dishName: 'A', likeCount: 18 },
    { dishName: 'B', likeCount: 10 },
    { dishName: 'C', likeCount: 9 },
    { dishName: 'D', likeCount: 5 },
    { dishName: 'E', likeCount: 4 },
    { dishName: 'F', likeCount: 1 }
  ];

  const result = popularDishes.filterPopularDishes(dishes, 500);

  assert.equal(result.threshold, 10);
  assert.equal(result.totalLikes, 500);
  assert.deepEqual(result.dishes.map((dish) => dish.dishName), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(result.usedFallback, true);
});

test('keeps all dishes with an early low vote volume', () => {
  const dishes = [
    { dishName: 'A', likeCount: 2 },
    { dishName: 'B', likeCount: 1 },
    { dishName: 'C', likeCount: 1 }
  ];

  const result = popularDishes.filterPopularDishes(dishes, 4);

  assert.equal(result.threshold, 1);
  assert.deepEqual(result.dishes, dishes);
  assert.equal(result.usedFallback, false);
});

test('falls back to the five highest-ranked dishes when a strict threshold is too restrictive', () => {
  const dishes = Array.from({ length: 8 }, (_, index) => ({
    dishName: String.fromCharCode(65 + index),
    likeCount: 8 - index
  }));

  const result = popularDishes.filterPopularDishes(dishes, 1000);

  assert.equal(result.threshold, 20);
  assert.deepEqual(result.dishes.map((dish) => dish.dishName), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(result.usedFallback, true);
});

test('falls back to the fifteen highest-ranked dishes without filters', () => {
  const dishes = Array.from({ length: 20 }, (_, index) => ({
    dishName: String.fromCharCode(65 + index),
    likeCount: index < 4 ? 50 : 1
  }));

  const result = popularDishes.getPopularDishesForFilters(dishes);

  assert.equal(result.threshold, 2);
  assert.equal(result.dishes.length, 15);
  assert.deepEqual(result.dishes.map((dish) => dish.dishName), [...'ABCDEFGHIJKLMNO']);
  assert.equal(result.usedFallback, true);
});

test('keeps the five-dish fallback when a dietary filter is active', () => {
  const dishes = Array.from({ length: 20 }, (_, index) => ({
    dishName: String.fromCharCode(65 + index),
    dietary: 'vegan',
    likeCount: index < 4 ? 50 : 1
  }));

  const result = popularDishes.getPopularDishesForFilters(dishes, { dietary: 'vegan' });

  assert.equal(result.dishes.length, 5);
  assert.deepEqual(result.dishes.map((dish) => dish.dishName), [...'ABCDE']);
  assert.equal(result.usedFallback, true);
});
