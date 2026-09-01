const CASETA_DISH_LIKES_API_URL = 'https://api.aldeapucela.org/fiestas/caseta-dish-likes';
const REQUEST_TIMEOUT = 5000;
const popularDishCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const MIN_VISIBLE_POPULAR_DISHES = 5;
const DIETARY_FILTERS = new Set(['vegetarian', 'vegan']);

export function getPopularDishShareLabel(filters = {}) {
  const dietaryLabel = filters.dietary === 'vegan'
    ? 'veganos'
    : filters.dietary === 'vegetarian' ? 'vegetarianos' : '';
  if (dietaryLabel && filters.glutenFree === true) return `Pinchos populares ${dietaryLabel} y sin gluten`;
  if (dietaryLabel) return `Pinchos populares ${dietaryLabel}`;
  if (filters.glutenFree === true) return 'Pinchos populares sin gluten';
  return 'Pinchos populares';
}

export function readPopularDishFilters(search = '') {
  const params = new URLSearchParams(search);
  const dietary = params.get('dietary') || params.get('diet') || '';
  return {
    dietary: DIETARY_FILTERS.has(dietary) ? dietary : '',
    glutenFree: params.get('gluten-free') === '1' || params.get('glutenFree') === '1'
  };
}

export function filterDishesByPreferences(dishes = [], filters = {}) {
  const dietary = DIETARY_FILTERS.has(filters.dietary) ? filters.dietary : '';
  const glutenFree = filters.glutenFree === true;
  return (Array.isArray(dishes) ? dishes : []).filter((dish) => {
    const matchesDietary = !dietary
      || (dietary === 'vegetarian' && ['vegetarian', 'vegan'].includes(dish.dietary))
      || (dietary === 'vegan' && dish.dietary === 'vegan');
    return matchesDietary && (!glutenFree || dish.glutenFree === true);
  });
}

export function getPopularDishesForFilters(dishes = [], filters = {}) {
  const matchingDishes = filterDishesByPreferences(dishes, filters);
  const totalLikes = matchingDishes.reduce((sum, dish) => sum + Math.max(0, Number(dish?.likeCount) || 0), 0);
  return {
    matchingDishes,
    ...filterPopularDishes(matchingDishes, totalLikes)
  };
}

export function getPopularDishThreshold(totalLikes) {
  const total = Number(totalLikes);
  if (!Number.isFinite(total) || total < 50) return 1;
  if (total < 250) return 2;
  if (total < 500) return 5;
  return Math.max(5, Math.ceil(total * 0.02));
}

export function filterPopularDishes(dishes = [], totalLikes = null) {
  const rankedDishes = Array.isArray(dishes) ? dishes : [];
  const total = Number(totalLikes);
  const resolvedTotal = Number.isFinite(total) && total >= 0
    ? total
    : rankedDishes.reduce((sum, dish) => sum + Math.max(0, Number(dish?.likeCount) || 0), 0);
  const threshold = getPopularDishThreshold(resolvedTotal);
  const filtered = rankedDishes.filter((dish) => dish.likeCount >= threshold);

  if (filtered.length >= MIN_VISIBLE_POPULAR_DISHES || rankedDishes.length <= MIN_VISIBLE_POPULAR_DISHES) {
    return { dishes: filtered, threshold, totalLikes: resolvedTotal, usedFallback: false };
  }

  return {
    dishes: rankedDishes.slice(0, MIN_VISIBLE_POPULAR_DISHES),
    threshold,
    totalLikes: resolvedTotal,
    usedFallback: true
  };
}

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
  const filterToggle = document.querySelector('[data-fiestas-popular-dishes-filter-toggle]');
  const filterPanel = document.querySelector('[data-fiestas-popular-dishes-filter-panel]');
  const filterClose = document.querySelector('[data-fiestas-popular-dishes-filter-close]');
  const filterOptions = [...document.querySelectorAll('[data-fiestas-popular-dishes-filter]')];
  const filterCount = document.querySelector('[data-fiestas-popular-dishes-filter-count]');
  const filterClear = document.querySelector('[data-fiestas-popular-dishes-filter-clear]');
  const shareButton = document.querySelector('[data-fiestas-share-site]');
  const state = {
    filters: readPopularDishFilters(window.location.search),
    rankedDishes: [],
    filterPanelOpen: false
  };

  const renderFilteredResults = () => {
    const popular = getPopularDishesForFilters(state.rankedDishes, state.filters);
    if (!popular.matchingDishes.length) {
      renderStatus(list, 'No hay pinchos que coincidan con estos filtros.', { backHref: '/pinchos-populares/' });
      return;
    }
    if (!popular.dishes.length) {
      renderStatus(list, 'Todavía no hay suficientes votos para mostrar pinchos con estos filtros.', { backHref: '/pinchos-populares/' });
      return;
    }
    renderDishList(list, popular.dishes);
  };

  const updateFilterUrl = () => {
    const url = new URL(window.location.href);
    if (state.filters.dietary) url.searchParams.set('dietary', state.filters.dietary);
    else url.searchParams.delete('dietary');
    url.searchParams.delete('diet');
    if (state.filters.glutenFree) url.searchParams.set('gluten-free', '1');
    else url.searchParams.delete('gluten-free');
    url.searchParams.delete('glutenFree');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const updateShareMetadata = () => {
    if (!shareButton) return;
    const label = getPopularDishShareLabel(state.filters);
    const shareUrl = new URL(shareButton.dataset.shareUrl || window.location.href);
    shareUrl.search = window.location.search;
    shareUrl.hash = window.location.hash;
    shareButton.dataset.shareTitle = `${label} | Fiestas Valladolid 2026`;
    shareButton.dataset.shareText = `Descubre ${label.toLowerCase()} de Valladolid`;
    shareButton.dataset.shareUrl = shareUrl.toString();
    shareButton.setAttribute('aria-label', `Compartir ${label.toLowerCase()}`);
    shareButton.title = `Compartir ${label.toLowerCase()}`;
  };

  const updateFilterControls = () => {
    const activeCount = Number(Boolean(state.filters.dietary)) + Number(state.filters.glutenFree);
    if (filterToggle) {
      filterToggle.classList.toggle('is-active', activeCount > 0);
      filterToggle.setAttribute('aria-expanded', String(state.filterPanelOpen));
      filterToggle.setAttribute('aria-label', activeCount
        ? `Filtros, ${activeCount} activos`
        : 'Filtrar pinchos populares');
    }
    if (filterCount) {
      filterCount.hidden = activeCount === 0;
      filterCount.textContent = String(activeCount);
    }
    filterOptions.forEach((option) => {
      const kind = option.dataset.fiestasPopularDishesFilter;
      const active = kind === 'dietary'
        ? state.filters.dietary === option.value
        : kind === 'gluten-free' && state.filters.glutenFree;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    if (filterClear) filterClear.hidden = activeCount === 0;
  };

  const setFilterPanelOpen = (open, { restoreFocus = true } = {}) => {
    state.filterPanelOpen = open;
    if (filterPanel) filterPanel.hidden = !open;
    updateFilterControls();
    if (!open && restoreFocus) filterToggle?.focus();
  };

  filterToggle?.addEventListener('click', () => setFilterPanelOpen(!state.filterPanelOpen));
  filterClose?.addEventListener('click', () => setFilterPanelOpen(false));
  filterOptions.forEach((option) => {
    option.addEventListener('click', () => {
      if (option.dataset.fiestasPopularDishesFilter === 'dietary') {
        state.filters.dietary = state.filters.dietary === option.value ? '' : option.value;
      } else if (option.dataset.fiestasPopularDishesFilter === 'gluten-free') {
        state.filters.glutenFree = !state.filters.glutenFree;
      }
      updateFilterUrl();
      updateShareMetadata();
      updateFilterControls();
      renderFilteredResults();
    });
  });
  filterClear?.addEventListener('click', () => {
    state.filters = { dietary: '', glutenFree: false };
    updateFilterUrl();
    updateShareMetadata();
    updateFilterControls();
    renderFilteredResults();
  });
  document.addEventListener('click', (event) => {
    if (state.filterPanelOpen
      && !event.target.closest('[data-fiestas-popular-dishes-filter-toggle]')
      && !event.target.closest('[data-fiestas-popular-dishes-filter-panel]')) {
      setFilterPanelOpen(false, { restoreFocus: false });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.filterPanelOpen) setFilterPanelOpen(false);
  });
  updateShareMetadata();
  updateFilterControls();
  renderStatus(list, 'Cargando pinchos populares…', { loading: true });
  void loadPopularDishes().then((result) => {
    if (!result.ok) {
      renderStatus(list, 'No se han podido cargar los pinchos populares.', { error: true, backHref: '/casetas/' });
      return;
    }
    state.rankedDishes = rankPopularDishes(casetas, result.dishes);
    renderFilteredResults();
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
    return { ok: true, dishes: payload.dishes, totalLikes: payload.totalLikes };
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
    const dietaryPills = [
      dish.dietary === 'vegetarian' ? '<span class="fiestas-caseta-dietary-pill fiestas-caseta-dietary-pill--vegetarian" role="img" aria-label="Vegetariano" title="Vegetariano"><i class="fa-solid fa-leaf" aria-hidden="true"></i></span>' : '',
      dish.dietary === 'vegan' ? '<span class="fiestas-caseta-dietary-pill fiestas-caseta-dietary-pill--vegan" role="img" aria-label="Vegano" title="Vegano"><i class="fa-solid fa-seedling" aria-hidden="true"></i></span>' : '',
      dish.glutenFree ? '<span class="fiestas-caseta-dietary-pill fiestas-caseta-dietary-pill--gluten-free" role="img" aria-label="Sin gluten" title="Sin gluten"><img class="fiestas-caseta-dietary-icon-image" src="/assets/icons/dietary-gluten-free.png" alt="" aria-hidden="true" /></span>' : ''
    ].filter(Boolean).join('');
    link.innerHTML = `
      <span class="fiestas-popular-dish-icon" aria-hidden="true"><i class="fa-solid fa-utensils"></i></span>
      <span class="fiestas-popular-dish-copy">
        <span class="fiestas-popular-dish-title-line">
          <strong>${escapeHtml(dish.dishName)}</strong>
          ${dietaryPills ? `<span class="fiestas-caseta-dietary-pills">${dietaryPills}</span>` : ''}
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
          glutenFree: item.glutenFree === true,
          location: caseta.location || 'Ubicación por confirmar',
          color: caseta.color,
          url: `/c/${encodeURIComponent(caseta.publicSlug || caseta.slug)}/`
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
