import assert from 'node:assert/strict';
import test from 'node:test';

const popularDishes = await import(`../src/scripts/popular-dishes-page.js?test=${Date.now()}`);

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
