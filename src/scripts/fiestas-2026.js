import { setupMenuDrawer } from './menu-drawer.js';
import { setupSubscribe } from './subscribe.js';
import { initTheme } from './theme.js';

const state = {
  view: 'agenda',
  events: [],
  dates: [],
  types: [],
  selectedDate: null,
  selectedTypes: new Set(),
  search: '',
  onlyFavorites: false,
  favorites: new Set(readFavorites()),
  map: null,
  markers: null,
  didInitialScroll: false,
  scrollFrame: null
};

const els = {
  agenda: document.querySelector('[data-fiestas-agenda]'),
  mapView: document.querySelector('[data-fiestas-map-view]'),
  mapCanvas: document.querySelector('[data-fiestas-map]'),
  mapEmpty: document.querySelector('[data-fiestas-map-empty]'),
  dateStrip: document.querySelector('[data-fiestas-dates]'),
  typeStrip: document.querySelector('[data-fiestas-types]'),
  typeToggle: document.querySelector('[data-fiestas-types-toggle]'),
  typeLabel: document.querySelector('[data-fiestas-types-label]'),
  search: document.querySelector('[data-fiestas-search]'),
  filterPanel: document.querySelector('[data-fiestas-filter-panel]'),
  mobileFilterToggle: document.querySelector('[data-fiestas-mobile-filters-toggle]'),
  favoriteFilter: document.querySelector('[data-fiestas-favorites-filter]'),
  clearFilters: document.querySelector('[data-fiestas-clear-filters]'),
  viewTabs: [...document.querySelectorAll('[data-view-tab]')],
  detailMap: document.querySelector('[data-fiestas-detail-map]')
};

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const storageKey = 'fiestasPucela:favorites';
let leafletPromise = null;

init();

function init() {
  initTheme();
  setupMenuDrawer();
  setupSubscribe();

  if (els.detailMap) {
    initDetailMap();
    return;
  }
  if (!els.agenda) return;
  state.events = normalizeEvents(window.__FIESTAS_2026_EVENTS__ || []);
  state.dates = getDates(state.events);
  state.types = [...new Set(state.events.map((event) => event.type || 'Evento'))].sort((a, b) => collator.compare(a, b));
  state.selectedDate = getCurrentCandidate(state.events)?.date || state.dates[0]?.date || null;

  bindControls();
  renderDateButtons();
  renderTypeButtons();
  render();
}

function bindControls() {
  els.search?.addEventListener('input', (event) => {
    state.search = normalizeText(event.target.value.trim());
    state.didInitialScroll = false;
    render();
  });

  els.favoriteFilter?.addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.didInitialScroll = false;
    render();
  });

  els.clearFilters?.addEventListener('click', () => {
    state.search = '';
    state.selectedTypes.clear();
    state.onlyFavorites = false;
    state.didInitialScroll = false;
    if (els.search) els.search.value = '';
    renderTypeButtons();
    setTypeMenuOpen(false);
    setMobileFiltersOpen(false);
    render();
  });

  els.mobileFilterToggle?.addEventListener('click', () => {
    const expanded = els.mobileFilterToggle.getAttribute('aria-expanded') === 'true';
    setMobileFiltersOpen(!expanded);
  });

  els.viewTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.viewTab === 'map' ? 'map' : 'agenda';
      render({ scrollToView: true });
    });
  });

  els.dateStrip?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    state.selectedDate = button.dataset.date;
    renderDateButtons();
    if (state.view === 'agenda') {
      document.getElementById(`fiestas-day-${state.selectedDate}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      render({ scrollToView: true });
    }
  });

  els.typeStrip?.addEventListener('click', (event) => {
    const input = event.target.closest('input[data-type]');
    if (!input) return;
    const type = input.dataset.type || input.value || 'Evento';
    if (input.checked) state.selectedTypes.add(type);
    else state.selectedTypes.delete(type);
    state.didInitialScroll = false;
    renderTypeButtons();
    render();
  });

  els.typeToggle?.addEventListener('click', () => {
    const expanded = els.typeToggle.getAttribute('aria-expanded') === 'true';
    setTypeMenuOpen(!expanded);
  });

  document.addEventListener('click', (event) => {
    if (!els.typeStrip || !els.typeToggle) return;
    if (event.target.closest('.fiestas-type-menu')) return;
    setTypeMenuOpen(false);
  });

  els.agenda?.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-fiestas-save]');
    if (saveButton) {
      toggleFavorite(saveButton.dataset.eventId);
      return;
    }
  });

  window.addEventListener('scroll', () => {
    if (state.view !== 'agenda' || state.scrollFrame) return;
    state.scrollFrame = window.requestAnimationFrame(() => {
      state.scrollFrame = null;
      updateVisibleDate();
    });
  }, { passive: true });
}

function normalizeEvents(events) {
  return events.map((event) => ({
    ...event,
    type: event.type || 'Evento',
    searchable: normalizeText([
      event.title,
      event.location,
      event.zone,
      event.type,
      event.description,
      event.summary,
      event.ticket?.label,
      event.ticket?.note,
      event.ticket?.required ? 'entradas compra ticket' : '',
      ...(event.performances || []),
      ...(event.organizers || []),
      ...(event.collaborators || []),
      event.dateLabel
    ].filter(Boolean).join(' '))
  })).sort((a, b) => (
    a.date.localeCompare(b.date) ||
    sortMinutes(a.startTime) - sortMinutes(b.startTime) ||
    collator.compare(a.title, b.title)
  ));
}

function render(options = {}) {
  const filtered = getFilteredEvents();
  renderShellState(filtered);
  if (state.view === 'map') {
    els.agenda.hidden = true;
    els.mapView.hidden = false;
    const mapEvents = filtered.filter((event) => !state.selectedDate || event.date === state.selectedDate);
    renderMap(mapEvents);
    if (options.scrollToView) {
      els.mapView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    els.mapView.hidden = true;
    els.agenda.hidden = false;
    renderAgenda(filtered);
    if (options.scrollToView) {
      els.agenda.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function renderShellState(filtered) {
  els.viewTabs.forEach((button) => {
    const active = button.dataset.viewTab === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  els.favoriteFilter?.classList.toggle('is-active', state.onlyFavorites);
  els.favoriteFilter?.setAttribute('aria-pressed', String(state.onlyFavorites));
  if (els.clearFilters) {
    els.clearFilters.hidden = !(state.search || state.selectedTypes.size || state.onlyFavorites);
  }
  els.mobileFilterToggle?.classList.toggle('is-active', Boolean(state.search || state.selectedTypes.size || state.onlyFavorites));
  renderDateButtons();
}

function renderAgenda(events) {
  els.agenda.replaceChildren();
  if (!events.length) {
    els.agenda.append(emptyState('No hay eventos con esos filtros.'));
    return;
  }

  groupByDayAndHour(events).forEach(([date, hourGroups]) => {
    const section = document.createElement('section');
    section.className = 'fiestas-day';
    section.id = `fiestas-day-${date}`;
    section.dataset.date = date;

    const title = document.createElement('h2');
    title.className = 'fiestas-day-title';
    title.textContent = state.dates.find((day) => day.date === date)?.label || date;
    section.append(title);

    hourGroups.forEach(([hour, groupEvents]) => {
      const group = document.createElement('div');
      group.className = 'fiestas-time-group';
      const label = document.createElement('div');
      label.className = 'fiestas-time-label';
      label.textContent = hour;
      group.append(label);
      groupEvents.forEach((event) => group.append(eventCard(event)));
      section.append(group);
    });

    els.agenda.append(section);
  });

  if (!state.didInitialScroll) {
    state.didInitialScroll = true;
    const candidate = getCurrentCandidate(events);
    if (candidate) {
      document.querySelector(`[data-fiestas-card="${cssEscape(candidate.id)}"]`)?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }
}

function eventCard(event) {
  const article = document.createElement('article');
  article.className = 'fiestas-event-card';
  article.dataset.fiestasCard = event.id;

  const link = document.createElement('a');
  link.className = 'fiestas-event-link';
  link.href = event.urlPath;
  link.innerHTML = `
    <span class="fiestas-event-icon" aria-hidden="true"><i class="fa-solid ${escapeHtml(event.icon || iconForType(event.type))}"></i></span>
    <span class="fiestas-event-copy">
      <span class="fiestas-event-topline">${escapeHtml(timeRange(event))}</span>
      <span class="fiestas-event-title">${escapeHtml(event.title)}</span>
      <span class="fiestas-event-meta">${escapeHtml([event.location, event.zone].filter(Boolean).join(' · ') || 'Lugar por confirmar')}</span>
      <span class="fiestas-event-badges">
        <span class="fiestas-badge">${escapeHtml(event.type || 'Evento')}</span>
        ${event.coordinates ? '<span class="fiestas-badge">Mapa</span>' : ''}
      </span>
    </span>
  `;

  const save = document.createElement('button');
  save.className = 'fiestas-save';
  save.classList.toggle('is-active', state.favorites.has(event.id));
  save.type = 'button';
  save.dataset.fiestasSave = 'true';
  save.dataset.eventId = event.id;
  save.setAttribute('aria-label', state.favorites.has(event.id) ? 'Quitar de favoritos' : 'Guardar favorito');
  save.innerHTML = `<i class="${state.favorites.has(event.id) ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>`;

  article.append(link, save);
  return article;
}

async function renderMap(events) {
  const withCoordinates = events.filter((event) => hasCoordinates(event.coordinates));
  if (!els.mapCanvas) return;
  const leaflet = await ensureLeaflet();
  if (!leaflet) {
    showMapEmpty('No se pudo cargar el mapa.');
    return;
  }
  if (!withCoordinates.length) {
    showMapEmpty('No hay eventos con mapa para estos filtros.');
  } else {
    els.mapEmpty.hidden = true;
  }

  if (!state.map) {
    state.map = leaflet.map(els.mapCanvas, { scrollWheelZoom: true }).setView([41.6523, -4.7245], 14);
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
    state.markers = leaflet.layerGroup().addTo(state.map);
  }

  state.markers.clearLayers();
  withCoordinates.forEach((event) => {
    const marker = leaflet.marker([event.coordinates.lat, event.coordinates.lng]);
    marker.bindPopup(`<strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(timeRange(event))}<br>${escapeHtml(event.location || '')}<br><a href="${escapeHtml(event.urlPath)}">Ver evento</a>`);
    marker.addTo(state.markers);
  });

  window.requestAnimationFrame(() => {
    state.map.invalidateSize();
    if (withCoordinates.length) {
      state.map.fitBounds(leaflet.latLngBounds(withCoordinates.map((event) => [event.coordinates.lat, event.coordinates.lng])), {
        padding: [26, 26],
        maxZoom: 16
      });
    }
  });
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-fiestas-leaflet-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L || null), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.dataset.fiestasLeafletLoader = 'true';
    script.addEventListener('load', () => resolve(window.L || null), { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });
    document.head.append(script);
  });
  return leafletPromise;
}

function getFilteredEvents() {
  return state.events.filter((event) => {
    if (state.onlyFavorites && !state.favorites.has(event.id)) return false;
    if (state.search && !event.searchable.includes(state.search)) return false;
    if (state.selectedTypes.size && !state.selectedTypes.has(event.type || 'Evento')) return false;
    return true;
  });
}

function groupByDayAndHour(events) {
  const days = new Map();
  events.forEach((event) => {
    if (!days.has(event.date)) days.set(event.date, new Map());
    const hours = days.get(event.date);
    const hour = `${event.startTime.slice(0, 2)}:00`;
    if (!hours.has(hour)) hours.set(hour, []);
    hours.get(hour).push(event);
  });
  return [...days.entries()].map(([date, groups]) => [date, [...groups.entries()]]);
}

function renderDateButtons() {
  document.querySelectorAll('[data-date]').forEach((button) => {
    const active = button.dataset.date === state.selectedDate;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderTypeButtons() {
  document.querySelectorAll('input[data-type]').forEach((input) => {
    input.checked = state.selectedTypes.has(input.dataset.type || input.value || 'Evento');
  });
  if (!els.typeLabel) return;
  if (!state.selectedTypes.size) {
    els.typeLabel.textContent = 'Todos los tipos';
  } else if (state.selectedTypes.size === 1) {
    els.typeLabel.textContent = [...state.selectedTypes][0];
  } else {
    els.typeLabel.textContent = `${state.selectedTypes.size} tipos`;
  }
  els.typeToggle?.classList.toggle('is-active', state.selectedTypes.size > 0);
}

function updateVisibleDate() {
  const sections = [...document.querySelectorAll('.fiestas-day')];
  if (!sections.length) return;
  const threshold = document.querySelector('.fiestas-controls')?.getBoundingClientRect().bottom || 0;
  const visible = sections.reduce((current, section) => (
    section.getBoundingClientRect().top <= threshold + 12 ? section : current
  ), sections[0]);
  if (!visible?.dataset.date || visible.dataset.date === state.selectedDate) return;
  state.selectedDate = visible.dataset.date;
  renderDateButtons();
}

function setTypeMenuOpen(open) {
  if (!els.typeStrip || !els.typeToggle) return;
  els.typeStrip.hidden = !open;
  els.typeToggle.setAttribute('aria-expanded', String(open));
}

function setMobileFiltersOpen(open) {
  if (!els.filterPanel || !els.mobileFilterToggle) return;
  els.filterPanel.classList.toggle('is-open', open);
  els.mobileFilterToggle.setAttribute('aria-expanded', String(open));
}

function getDates(events) {
  return [...new Map(events.map((event) => [event.date, { date: event.date, label: event.dateLabel || event.date }])).values()];
}

function getCurrentCandidate(events) {
  const now = Date.now();
  const timed = events.map((event) => ({
    event,
    start: eventDateTime(event, 'startTime'),
    end: event.endTime ? eventDateTime(event, 'endTime') : null
  }));
  return timed.find(({ start, end }) => {
    const startMs = start.getTime();
    const endMs = end ? end.getTime() : startMs + 90 * 60 * 1000;
    return startMs <= now && now <= endMs;
  })?.event || timed.find(({ start }) => start.getTime() >= now)?.event || events[0] || null;
}

function eventDateTime(event, field) {
  const [hour, minute] = String(event[field] || '00:00').split(':').map(Number);
  const date = new Date(`${event.date}T00:00:00`);
  date.setHours(hour, minute, 0, 0);
  if (field === 'endTime' && sortMinutes(event.endTime) < sortMinutes(event.startTime)) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function sortMinutes(time = '00:00') {
  const [hour, minute] = String(time).split(':').map(Number);
  const minutes = hour * 60 + minute;
  return hour < 6 ? minutes + 24 * 60 : minutes;
}

function toggleFavorite(id) {
  if (!id) return;
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
  } else {
    state.favorites.add(id);
  }
  localStorage.setItem(storageKey, JSON.stringify([...state.favorites]));
  render();
}

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function timeRange(event) {
  return [event.startTime, event.endTime].filter(Boolean).join(' - ');
}

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
}

function directionsUrl(coordinates) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${coordinates.lat},${coordinates.lng}`)}`;
}

function initDetailMap() {
  if (!window.L) return;
  const lat = Number(els.detailMap.dataset.lat);
  const lng = Number(els.detailMap.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const map = L.map(els.detailMap, { scrollWheelZoom: true }).setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  L.marker([lat, lng]).addTo(map).bindPopup(escapeHtml(els.detailMap.dataset.title || 'Evento'));
  window.requestAnimationFrame(() => map.invalidateSize());
}

function iconForType(type = '') {
  const icons = {
    danza: 'fa-person-dress',
    deporte: 'fa-person-running',
    exposicion: 'fa-image',
    folklore: 'fa-guitar',
    'fuegos-artificiales': 'fa-wand-sparkles',
    gastronomia: 'fa-utensils',
    'infantil-y-familiar': 'fa-children',
    magia: 'fa-hat-wizard',
    musica: 'fa-music',
    otros: 'fa-star',
    penas: 'fa-people-group',
    religioso: 'fa-place-of-worship',
    talleres: 'fa-screwdriver-wrench',
    teatro: 'fa-masks-theater',
    toros: 'fa-circle-dot'
  };
  return icons[slugify(type)] || 'fa-calendar-day';
}

function slugify(value = '') {
  return normalizeText(value)
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function showMapEmpty(message) {
  if (!els.mapEmpty) return;
  els.mapEmpty.hidden = false;
  els.mapEmpty.textContent = message;
}

function emptyState(message) {
  const node = document.createElement('div');
  node.className = 'fiestas-empty';
  node.textContent = message;
  return node;
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/"/g, '\\"');
}
