export const CASETAS_FAVORITES_STORAGE_KEY = 'fiestasPucela:casetas-favorites';

const casetasFavoritesChangedEvent = 'fiestas:casetas-favorites-changed';

export function readCasetaFavoriteIds() {
  const value = readJson(CASETAS_FAVORITES_STORAGE_KEY, []);
  return normalizeIds(value);
}

export function writeCasetaFavoriteIds(ids) {
  const nextIds = normalizeIds(ids);
  writeJson(CASETAS_FAVORITES_STORAGE_KEY, nextIds);
  dispatchFavoritesChanged();
  return nextIds;
}

export function setCasetaFavorite(id, saved) {
  const normalizedId = normalizeId(id);
  const ids = new Set(readCasetaFavoriteIds());
  if (normalizedId && saved) ids.add(normalizedId);
  else if (normalizedId) ids.delete(normalizedId);
  return writeCasetaFavoriteIds([...ids]);
}

export function subscribeToCasetaFavorites(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};
  const onStorage = (event) => {
    if (event.key === CASETAS_FAVORITES_STORAGE_KEY) callback(readCasetaFavoriteIds());
  };
  const onCustom = () => callback(readCasetaFavoriteIds());
  window.addEventListener('storage', onStorage);
  window.addEventListener(casetasFavoritesChangedEvent, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(casetasFavoritesChangedEvent, onCustom);
  };
}

export function initCasetaDetailFavorite() {
  if (typeof document === 'undefined') return;
  const toggle = document.querySelector('[data-fiestas-caseta-favorite-toggle]');
  if (!toggle) return;
  const casetaId = normalizeId(toggle.dataset.casetaId);
  if (!casetaId) return;
  const casetaName = String(document.querySelector('[data-fiestas-detail]')?.dataset.eventTitle || 'caseta').trim();
  const feedback = document.querySelector('[data-fiestas-detail-feedback]');
  let feedbackTimer = null;

  const render = (ids = readCasetaFavoriteIds()) => {
    const saved = ids.includes(casetaId);
    toggle.classList.toggle('is-active', saved);
    toggle.setAttribute('aria-pressed', String(saved));
    toggle.setAttribute('aria-label', `${saved ? 'Quitar' : 'Añadir'} ${casetaName} ${saved ? 'de' : 'a'} favoritas`);
    toggle.innerHTML = `<i class="${saved ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i>`;
  };

  toggle.addEventListener('click', () => {
    const saved = !readCasetaFavoriteIds().includes(casetaId);
    const ids = setCasetaFavorite(casetaId, saved);
    render(ids);
    if (feedback) {
      feedback.textContent = saved ? 'Caseta guardada en favoritas.' : 'Caseta eliminada de favoritas.';
      feedback.hidden = false;
      if (feedbackTimer) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => { feedback.hidden = true; }, 2800);
    }
  });

  subscribeToCasetaFavorites(render);
  render();
}

function normalizeIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalizeId).filter(Boolean))];
}

function normalizeId(value) {
  return String(value || '').trim();
}

function readJson(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // A blocked or full localStorage must not prevent the app from working.
  }
}

function dispatchFavoritesChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(casetasFavoritesChangedEvent));
  }
}

if (typeof document !== 'undefined') initCasetaDetailFavorite();
