import { trackCasetaDishLiked, trackCasetaDishUnliked } from './analytics.js';

export const CASETA_DISH_LIKES_STORAGE_KEY = 'fiestasPucela:liked-caseta-dishes';

const casetaDishLikesChangedEvent = 'fiestas:caseta-dish-likes-changed';
const CASETA_DISH_LIKES_API_URL = 'https://api.aldeapucela.org/fiestas/caseta-dish-likes';
const LIKES_REQUEST_TIMEOUT = 5000;

let initialized = false;

const state = {
  casetaId: '',
  likedIds: new Set(),
  counts: new Map(),
  optimisticCounts: new Map(),
  buttons: []
};

export function casetaDishKey(casetaId, dishId) {
  const normalizedCasetaId = normalizeCasetaId(casetaId);
  const normalizedDishId = normalizeDishId(dishId);
  return normalizedCasetaId && normalizedDishId ? `${normalizedCasetaId}/${normalizedDishId}` : '';
}

export function readCasetaDishLikeIds() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(CASETA_DISH_LIKES_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizeStoredKey).filter(Boolean))];
  } catch (_) {
    return [];
  }
}

export function setCasetaDishLiked(casetaId, dishId, liked = true) {
  const key = casetaDishKey(casetaId, dishId);
  const ids = new Set(readCasetaDishLikeIds());
  if (key) {
    if (liked) ids.add(key);
    else ids.delete(key);
  }
  const nextIds = [...ids];
  writeJson(CASETA_DISH_LIKES_STORAGE_KEY, nextIds);
  dispatchLikesChanged();
  return nextIds;
}

export function subscribeToCasetaDishLikes(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};
  const onStorage = (event) => {
    if (event.key === CASETA_DISH_LIKES_STORAGE_KEY) callback(readCasetaDishLikeIds());
  };
  const onCustom = () => callback(readCasetaDishLikeIds());
  window.addEventListener('storage', onStorage);
  window.addEventListener(casetaDishLikesChangedEvent, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(casetaDishLikesChangedEvent, onCustom);
  };
}

export function initCasetaDishLikes() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  const detail = document.querySelector('[data-caseta-detail]');
  const buttons = [...document.querySelectorAll('[data-fiestas-caseta-dish-like]')];
  if (!detail || !buttons.length) return;

  state.casetaId = normalizeCasetaId(detail.dataset.casetaId || detail.closest('[data-fiestas-detail]')?.dataset.eventId);
  state.likedIds = new Set(readCasetaDishLikeIds());
  state.buttons = buttons;

  buttons.forEach((button) => {
    button.addEventListener('click', () => toggleDishLike(button));
  });
  subscribeToCasetaDishLikes((ids) => {
    state.likedIds = new Set(ids);
    renderButtons();
  });
  renderButtons();
  void loadLikeCounts();
}

function toggleDishLike(button) {
  const dishId = normalizeDishId(button.dataset.dishId);
  const key = casetaDishKey(state.casetaId, dishId);
  if (!key) return;
  const liked = state.likedIds.has(key);
  const nextLiked = !liked;

  state.likedIds = new Set(setCasetaDishLiked(state.casetaId, dishId, nextLiked));
  if (nextLiked) {
    trackCasetaDishLiked(state.casetaId, dishId);
    if (!state.optimisticCounts.has(key)) {
      const previousCount = Number(state.counts.get(key) || 0);
      state.optimisticCounts.set(key, Math.max(previousCount + 1, 1));
      state.counts.set(key, state.optimisticCounts.get(key));
    }
  } else {
    trackCasetaDishUnliked(state.casetaId, dishId);
  }
  renderButtons();
}

async function loadLikeCounts() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = window.setTimeout(() => controller?.abort(), LIKES_REQUEST_TIMEOUT);
  try {
    const response = await window.fetch(CASETA_DISH_LIKES_API_URL, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload?.ok !== true || !Array.isArray(payload.dishes)) return;
    const serverCounts = new Map();
    payload.dishes.forEach((dish) => {
      const key = casetaDishKey(dish?.casetaId, dish?.dishId);
      const count = Number(dish?.likeCount);
      if (key && Number.isFinite(count) && count >= 0) serverCounts.set(key, Math.round(count));
    });
    state.counts = serverCounts;
    state.optimisticCounts.forEach((count, key) => {
      state.counts.set(key, Math.max(Number(state.counts.get(key) || 0), count));
    });
    renderButtons();
  } catch (_) {
    // Los contadores son informativos: una caída de la API no bloquea las reacciones.
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderButtons() {
  state.buttons.forEach((button) => {
    const key = casetaDishKey(state.casetaId, button.dataset.dishId);
    const liked = Boolean(key && state.likedIds.has(key));
    const count = Number(state.counts.get(key));
    const countElement = button.querySelector('[data-fiestas-caseta-dish-like-count]');
    const dishName = String(button.dataset.dishName || 'este plato').trim();
    button.classList.toggle('is-active', liked);
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', liked ? `Quitar me gusta de ${dishName}` : `Me gusta ${dishName}`);
    button.title = liked ? `Quitar me gusta de ${dishName}` : `Me gusta ${dishName}`;
    const hasCount = liked || (Number.isFinite(count) && count > 0);
    if (countElement) {
      countElement.hidden = !hasCount;
      countElement.textContent = hasCount
        ? String(Math.max(Number.isFinite(count) ? count : 0, liked ? 1 : 0))
        : '';
    }
    const icon = button.querySelector('[data-fiestas-caseta-dish-like-icon]');
    if (icon) icon.className = `${liked ? 'fa-solid' : 'fa-regular'} fa-thumbs-up`;
  });
}

function normalizeStoredKey(value) {
  const [casetaId, dishId] = String(value || '').trim().split('/');
  return casetaDishKey(casetaId, dishId);
}

function normalizeCasetaId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^z[1-7]-[0-9]+$/.test(normalized) ? normalized : '';
}

function normalizeDishId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : '';
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Un almacenamiento bloqueado no debe impedir que la carta siga funcionando.
  }
}

function dispatchLikesChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(casetaDishLikesChangedEvent));
  }
}

if (typeof document !== 'undefined') initCasetaDishLikes();
