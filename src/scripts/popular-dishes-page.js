const CASETA_DISH_LIKES_API_URL = 'https://api.aldeapucela.org/fiestas/caseta-dish-likes';
const REQUEST_TIMEOUT = 5000;
const popularDishCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function rankPopularDishes(casetas = [], dishes = []) {
  const dishIndex = buildDishIndex(casetas);
  return dishes
    .map((entry) => {
      const casetaId = normalizeCasetaId(entry?.casetaId);
      const dishId = normalizeDishId(entry?.dishId);
      const match = dishIndex.get(`${casetaId}/${dishId}`);
      const likeCount = Number(entry?.likeCount);
      if (!match || !Number.isFinite(likeCount) || likeCount <= 0) return null;
      return { ...match, likeCount: Math.round(likeCount) };
    })
    .filter(Boolean)
    .sort((left, right) => right.likeCount - left.likeCount
      || popularDishCollator.compare(left.dishName, right.dishName)
      || popularDishCollator.compare(left.casetaName, right.casetaName));
}

export function initPopularDishesPage() {
  const list = document.querySelector('[data-fiestas-popular-dishes-list]');
  if (!list) return;

  const casetas = normalizeCasetas(window.__FIESTAS_2026_CASETAS__ || []);
  renderStatus(list, 'Cargando pinchos populares…', { loading: true });
  void loadPopularDishes().then((result) => {
    if (!result.ok) {
      renderStatus(list, 'No se han podido cargar los pinchos populares.', { error: true, backHref: '/casetas/' });
      return;
    }
    const dishes = rankPopularDishes(casetas, result.dishes);
    if (!dishes.length) {
      renderStatus(list, 'Todavía no hay pinchos con me gusta.', { backHref: '/casetas/' });
      return;
    }
    renderDishList(list, dishes);
  });
}

async function loadPopularDishes() {
  if (typeof window.fetch !== 'function') return { ok: false };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT);
  try {
    const response = await window.fetch(CASETA_DISH_LIKES_API_URL, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal
    });
    if (!response.ok) return { ok: false };
    const payload = await response.json();
    if (payload?.ok !== true || !Array.isArray(payload.dishes)) return { ok: false };
    return { ok: true, dishes: payload.dishes };
  } catch (_) {
    return { ok: false };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderDishList(list, dishes) {
  list.replaceChildren();
  const fragment = document.createDocumentFragment();
  dishes.forEach((dish) => {
    const article = document.createElement('article');
    article.className = 'fiestas-popular-dish-card';
    article.style.setProperty('--fiestas-dish-color', dish.color);

    const link = document.createElement('a');
    link.className = 'fiestas-popular-dish-link';
    link.href = dish.url;
    link.setAttribute('aria-label', `${dish.dishName}, ${dish.casetaName}, ${dish.likeCount} me gusta`);
    link.innerHTML = `
      <span class="fiestas-popular-dish-icon" aria-hidden="true"><i class="fa-solid fa-utensils"></i></span>
      <span class="fiestas-popular-dish-copy">
        <span class="fiestas-popular-dish-title-line">
          <strong>${escapeHtml(dish.dishName)}</strong>
          ${dish.dietary === 'vegetarian' ? '<span class="fiestas-caseta-dietary-pill fiestas-caseta-dietary-pill--vegetarian">Vegetariano</span>' : ''}
          ${dish.dietary === 'vegan' ? '<span class="fiestas-caseta-dietary-pill fiestas-caseta-dietary-pill--vegan">Vegano</span>' : ''}
        </span>
        <span class="fiestas-popular-dish-caseta"><i class="fa-solid fa-store" aria-hidden="true"></i>${escapeHtml(dish.casetaName)}</span>
        <span class="fiestas-popular-dish-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(dish.location)}</span>
      </span>
      <span class="fiestas-popular-dish-likes"><i class="fa-solid fa-thumbs-up" aria-hidden="true"></i><span>${dish.likeCount}</span></span>
      <i class="fa-solid fa-chevron-right fiestas-popular-dish-arrow" aria-hidden="true"></i>
    `;
    article.append(link);
    fragment.append(article);
  });
  list.append(fragment);
  list.setAttribute('aria-busy', 'false');
}

function renderStatus(list, message, options = {}) {
  list.replaceChildren();
  list.setAttribute('aria-busy', String(Boolean(options.loading)));
  const status = document.createElement('div');
  status.className = `fiestas-popular-status${options.error ? ' is-error' : ''}`;
  if (options.loading) {
    const spinner = document.createElement('i');
    spinner.className = 'fa-solid fa-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    status.append(spinner);
  }
  const copy = document.createElement('p');
  copy.textContent = message;
  status.append(copy);
  if (options.backHref) {
    const link = document.createElement('a');
    link.href = options.backHref;
    link.textContent = 'Volver a Casetas';
    status.append(link);
  }
  list.append(status);
}

function normalizeCasetas(entries) {
  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const id = normalizeCasetaId(entry.id);
      const name = String(entry.name || '').trim();
      const slug = String(entry.slug || slugify(name)).trim();
      const details = entry.details && typeof entry.details === 'object' ? entry.details : null;
      return {
        id,
        name,
        slug,
        location: String(entry.location || '').trim(),
        color: String(entry.color || '#0f9f8d').trim(),
        details
      };
    })
    .filter((entry) => entry.id && entry.name);
}

function buildDishIndex(casetas) {
  const index = new Map();
  casetas.forEach((caseta) => {
    (caseta.details?.menuSections || []).forEach((section) => {
      if (section?.votable !== true) return;
      (section.items || []).forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const dishId = normalizeDishId(item.id);
        const dishName = String(item.name || '').trim();
        if (!dishId || !dishName) return;
        index.set(`${caseta.id}/${dishId}`, {
          casetaName: caseta.name,
          dishName,
          dietary: item.dietary || '',
          location: caseta.location || 'Ubicación por confirmar',
          color: caseta.color,
          url: `/c/${encodeURIComponent(caseta.id)}/${encodeURIComponent(caseta.slug)}/`
        });
      });
    });
  });
  return index;
}

function normalizeCasetaId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^z[1-7]-[0-9]+$/.test(normalized) ? normalized : '';
}

function normalizeDishId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : '';
}

function slugify(value = '') {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'caseta';
}

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
