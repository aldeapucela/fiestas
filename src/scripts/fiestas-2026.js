import { setupMenuDrawer } from './menu-drawer.js';
import { setupSubscribe } from './subscribe.js';
import { initTheme } from './theme.js';

const storageKey = 'fiestasPucela:favorites';
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const cartoLayers = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};
let leafletPromise = null;

const state = {
  view: 'agenda',
  events: [],
  dates: [],
  types: [],
  areas: [],
  selectedDate: null,
  selectedTypes: new Set(),
  selectedAreas: new Set(),
  selectedTicketKinds: new Set(),
  search: '',
  onlyFavorites: false,
  favorites: new Set(readFavorites()),
  map: null,
  tileLayer: null,
  markers: null
};

const els = {
  agenda: document.querySelector('[data-fiestas-agenda]'),
  mapView: document.querySelector('[data-fiestas-map-view]'),
  mapCanvas: document.querySelector('[data-fiestas-map]'),
  mapEmpty: document.querySelector('[data-fiestas-map-empty]'),
  dateStrip: document.querySelector('[data-fiestas-dates]'),
  typeList: document.querySelector('[data-fiestas-types]'),
  typeToggle: document.querySelector('[data-fiestas-types-toggle]'),
  typeLabel: document.querySelector('[data-fiestas-types-label]'),
  areaList: document.querySelector('[data-fiestas-areas]'),
  areaToggle: document.querySelector('[data-fiestas-areas-toggle]'),
  areaLabel: document.querySelector('[data-fiestas-areas-label]'),
  ticketList: document.querySelector('[data-fiestas-tickets]'),
  ticketToggle: document.querySelector('[data-fiestas-tickets-toggle]'),
  ticketLabel: document.querySelector('[data-fiestas-tickets-label]'),
  search: document.querySelector('[data-fiestas-search]'),
  activeFilters: document.querySelector('[data-fiestas-active-filters]'),
  favoriteFilter: document.querySelector('[data-fiestas-favorites-filter]'),
  clearFilters: document.querySelector('[data-fiestas-clear-filters]'),
  viewTabs: [...document.querySelectorAll('[data-view-tab]')],
  detail: document.querySelector('[data-fiestas-detail]'),
  detailSave: document.querySelector('[data-fiestas-detail-save]'),
  detailShare: document.querySelector('[data-fiestas-share]'),
  detailBack: document.querySelector('[data-fiestas-back]'),
  detailFeedback: document.querySelector('[data-fiestas-detail-feedback]'),
  detailShareFallback: document.querySelector('[data-fiestas-share-fallback]'),
  detailShareInput: document.querySelector('[data-fiestas-share-url-input]'),
  detailMap: document.querySelector('[data-fiestas-detail-map]')
};

init();

function init() {
  initTheme();
  setupMenuDrawer();
  setupSubscribe();

  if (els.detail) {
    initDetailPage();
    return;
  }

  if (!els.agenda) return;

  try {
    state.events = normalizeEvents(window.__FIESTAS_2026_EVENTS__ || []);
    state.dates = getDates(state.events);
    state.types = getTypes(state.events);
    state.areas = getAreas(state.events);
    state.selectedDate = getInitialDate(state.dates);
    applyInitialUrlState();
    bindControls();
    renderControlLists();
    render();
  } catch (error) {
    console.error(error);
    els.agenda.replaceChildren(emptyState('No se pudo cargar la agenda. Recarga la página para intentarlo de nuevo.', true));
  }
}

function bindControls() {
  els.search?.addEventListener('input', (event) => {
    state.search = normalizeText(event.target.value.trim());
    render();
  });

  els.dateStrip?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    state.selectedDate = button.dataset.date || 'all';
    render({ scrollToAgenda: true });
  });

  els.typeList?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-type]');
    if (!input) return;
    toggleSetValue(state.selectedTypes, input.dataset.type || input.value || 'Evento', input.checked);
    render();
  });

  els.areaList?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-area]');
    if (!input) return;
    toggleSetValue(state.selectedAreas, input.dataset.area || input.value, input.checked);
    render();
  });

  els.ticketList?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-ticket-kind]');
    if (!input) return;
    toggleSetValue(state.selectedTicketKinds, input.dataset.ticketKind || input.value, input.checked);
    render();
  });

  els.areaToggle?.addEventListener('click', () => setMenuOpen('area', els.areaToggle.getAttribute('aria-expanded') !== 'true'));
  els.typeToggle?.addEventListener('click', () => setMenuOpen('type', els.typeToggle.getAttribute('aria-expanded') !== 'true'));
  els.ticketToggle?.addEventListener('click', () => setMenuOpen('ticket', els.ticketToggle.getAttribute('aria-expanded') !== 'true'));

  els.favoriteFilter?.addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    render();
  });

  els.clearFilters?.addEventListener('click', () => {
    state.search = '';
    state.selectedTypes.clear();
    state.selectedAreas.clear();
    state.selectedTicketKinds.clear();
    state.onlyFavorites = false;
    if (els.search) els.search.value = '';
    setMenuOpen('type', false);
    setMenuOpen('area', false);
    setMenuOpen('ticket', false);
    render();
  });

  els.activeFilters?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-filter]');
    if (!button) return;
    removeFilter(button.dataset.removeFilter, button.dataset.value || '');
    render();
  });

  els.viewTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.viewTab === 'map' ? 'map' : 'agenda';
      render({ scrollToAgenda: true });
    });
  });

  window.addEventListener('popstate', () => {
    applyInitialUrlState();
    render();
  });

  els.agenda?.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-fiestas-save]');
    if (!saveButton) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(saveButton.dataset.eventId);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.fiestas-type-menu')) {
      setMenuOpen('area', false);
      setMenuOpen('type', false);
      setMenuOpen('ticket', false);
    }
  });
}

function normalizeEvents(events) {
  return events.map((event) => {
    const tags = normalizeTags(event.tags, event.type);
    const area = event.neighborhood || event.zone || '';
    const ticketKind = event.ticketKind || inferTicketKind(event.ticket);
    return {
      ...event,
      type: event.type || 'Evento',
      tags,
      area,
      ticketKind,
      searchable: normalizeText([
        event.title,
        event.location,
        event.zone,
        event.neighborhood,
        event.type,
        ...tags,
        event.summary,
        event.description,
        ...(event.performances || []),
        ...(event.organizers || []),
        ...(event.collaborators || []),
        event.ticket?.label,
        event.ticket?.note,
        ticketKindLabel(ticketKind),
        ticketKind === 'free' ? 'gratis gratuito libre' : '',
        ticketKind === 'paid' ? 'pago entrada entradas' : '',
        ticketKind === 'registration' ? 'inscripcion registro apuntarse' : ''
      ].filter(Boolean).join(' '))
    };
  }).sort(compareEvents);
}

function render(options = {}) {
  const filtered = getFilteredEvents();
  renderShellState(filtered);

  if (state.view === 'map') {
    els.agenda.hidden = true;
    els.mapView.hidden = false;
    renderMap(filtered);
  } else {
    els.mapView.hidden = true;
    els.agenda.hidden = false;
    renderAgenda(filtered);
  }

  if (options.scrollToAgenda) {
    document.querySelector('.fiestas-screen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderShellState(filtered) {
  document.querySelectorAll('[data-date]').forEach((button) => {
    const active = button.dataset.date === state.selectedDate;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  els.viewTabs.forEach((button) => {
    const active = button.dataset.viewTab === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  els.favoriteFilter?.classList.toggle('is-active', state.onlyFavorites);
  els.favoriteFilter?.setAttribute('aria-pressed', String(state.onlyFavorites));
  renderCheckedFilters();
  renderFilterLabels();
  renderActiveFilters(filtered.length);
}

function renderAgenda(events) {
  els.agenda.replaceChildren();

  if (!state.events.length) {
    els.agenda.append(emptyState('La agenda todavía no tiene actividades cargadas.', true));
    return;
  }

  if (!events.length) {
    const message = hasActiveFilters()
      ? 'No hay actividades con esos filtros.'
      : 'No hay actividades para el día seleccionado.';
    els.agenda.append(emptyState(message, hasActiveFilters()));
    return;
  }

  if (state.selectedDate === 'all') {
    const summary = document.createElement('div');
    summary.className = 'fiestas-agenda-summary';
    summary.textContent = `${events.length} ${events.length === 1 ? 'actividad filtrada' : 'actividades filtradas'}`;
    els.agenda.append(summary);
  }

  const groups = state.selectedDate === 'all' ? groupByDay(events) : [[state.selectedDate, events]];
  groups.forEach(([date, dayEvents]) => {
    const section = document.createElement('section');
    section.className = 'fiestas-day';
    section.id = `fiestas-day-${date}`;

    const header = document.createElement('div');
    header.className = 'fiestas-day-head';
    header.innerHTML = `
      <h2 class="fiestas-day-title">${escapeHtml(labelForDate(date))}</h2>
      <span>${dayEvents.length} ${dayEvents.length === 1 ? 'actividad' : 'actividades'}</span>
    `;
    section.append(header);

    const list = document.createElement('div');
    list.className = 'fiestas-event-list';
    dayEvents.forEach((event) => list.append(eventCard(event)));
    section.append(list);
    els.agenda.append(section);
  });
}

function eventCard(event) {
  const article = document.createElement('article');
  article.className = 'fiestas-event-card';
  article.dataset.fiestasCard = event.id;

  const saved = state.favorites.has(event.id);
  const place = event.location || 'Lugar por confirmar';

  const link = document.createElement('a');
  link.className = 'fiestas-event-link';
  link.href = event.urlPath;
  link.innerHTML = `
    <span class="fiestas-event-time">${escapeHtml(timeRange(event))}</span>
    <span class="fiestas-event-art" aria-hidden="true">
      <i class="fa-solid ${escapeHtml(event.icon || iconForType(event.type))}"></i>
    </span>
    <span class="fiestas-event-copy">
      <span class="fiestas-event-title">${escapeHtml(event.title || 'Actividad sin título')}</span>
      <span class="fiestas-event-place"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(place)}</span>
    </span>
  `;

  const save = document.createElement('button');
  save.className = 'fiestas-save';
  save.classList.toggle('is-active', saved);
  save.type = 'button';
  save.dataset.fiestasSave = 'true';
  save.dataset.eventId = event.id;
  save.setAttribute('aria-label', saved ? 'Quitar de guardados' : 'Guardar actividad');
  save.setAttribute('aria-pressed', String(saved));
  save.innerHTML = `<i class="${saved ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>`;

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
    showMapEmpty('No hay actividades con mapa para esta selección.');
  } else {
    els.mapEmpty.hidden = true;
  }

  if (!state.map) {
    state.map = leaflet.map(els.mapCanvas, { scrollWheelZoom: true }).setView([41.6523, -4.7245], 14);
    state.tileLayer = createCartoLayer(leaflet).addTo(state.map);
    state.markers = leaflet.layerGroup().addTo(state.map);
    document.addEventListener('aldeapucela:themechange', () => updateMapTheme(leaflet));
  }

  state.markers.clearLayers();
  withCoordinates.forEach((event) => {
    const marker = leaflet.marker([event.coordinates.lat, event.coordinates.lng]);
    marker.bindPopup(`<strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(timeRange(event))}<br>${escapeHtml(event.location || 'Lugar por confirmar')}<br><a href="${escapeHtml(event.urlPath)}">Ver actividad</a>`);
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

function getFilteredEvents() {
  return state.events.filter((event) => {
    if (state.selectedDate && state.selectedDate !== 'all' && event.date !== state.selectedDate) return false;
    if (state.search && !event.searchable.includes(state.search)) return false;
    if (state.selectedTypes.size && !event.tags.some((tag) => state.selectedTypes.has(tag))) return false;
    if (state.selectedAreas.size && !state.selectedAreas.has(event.area)) return false;
    if (state.selectedTicketKinds.size && !state.selectedTicketKinds.has(event.ticketKind)) return false;
    if (state.onlyFavorites && !state.favorites.has(event.id)) return false;
    return true;
  });
}

function renderControlLists() {
  renderTypeButtons();
  renderAreaButtons();
}

function renderTypeButtons() {
  if (!els.typeList) return;
  const current = new Set([...els.typeList.querySelectorAll('input[data-type]')].map((input) => input.dataset.type));
  if (current.size === state.types.length) return;
  els.typeList.replaceChildren(...state.types.map((type) => checkboxOption(type, 'type')));
}

function renderAreaButtons() {
  if (!els.areaList) return;
  els.areaList.replaceChildren(...state.areas.map((area) => checkboxOption(area, 'area')));
}

function checkboxOption(value, kind) {
  const label = document.createElement('label');
  label.className = 'fiestas-type-option';
  label.innerHTML = `
    <input type="checkbox" value="${escapeHtml(value)}" data-${kind}="${escapeHtml(value)}" />
    <span>${escapeHtml(value)}</span>
  `;
  return label;
}

function renderCheckedFilters() {
  document.querySelectorAll('input[data-type]').forEach((input) => {
    input.checked = state.selectedTypes.has(input.dataset.type || input.value);
  });
  document.querySelectorAll('input[data-area]').forEach((input) => {
    input.checked = state.selectedAreas.has(input.dataset.area || input.value);
  });
  document.querySelectorAll('input[data-ticket-kind]').forEach((input) => {
    input.checked = state.selectedTicketKinds.has(input.dataset.ticketKind || input.value);
  });
}

function renderFilterLabels() {
  if (els.typeLabel) els.typeLabel.textContent = setLabel(state.selectedTypes, 'Tipos', 'tipo', 'tipos');
  if (els.areaLabel) els.areaLabel.textContent = setLabel(state.selectedAreas, 'Todas las zonas', 'zona', 'zonas');
  if (els.ticketLabel) els.ticketLabel.textContent = ticketSetLabel();
  els.typeToggle?.classList.toggle('is-active', state.selectedTypes.size > 0);
  els.areaToggle?.classList.toggle('is-active', state.selectedAreas.size > 0);
  els.ticketToggle?.classList.toggle('is-active', state.selectedTicketKinds.size > 0);
  if (els.clearFilters) els.clearFilters.hidden = !hasActiveFilters();
}

function renderActiveFilters(count) {
  if (!els.activeFilters) return;
  els.activeFilters.replaceChildren();
  const chips = [];
  if (state.search) chips.push(filterChip('search', '', `Buscar: ${els.search?.value || state.search}`));
  state.selectedTypes.forEach((type) => chips.push(filterChip('type', type, type)));
  state.selectedAreas.forEach((area) => chips.push(filterChip('area', area, area)));
  state.selectedTicketKinds.forEach((kind) => chips.push(filterChip('ticket', kind, ticketKindLabel(kind))));
  if (state.onlyFavorites) chips.push(filterChip('favorites', '', 'Guardados'));
  chips.forEach((chip) => els.activeFilters.append(chip));
  if (chips.length) {
    const summary = document.createElement('span');
    summary.className = 'fiestas-filter-count';
    summary.textContent = `${count} ${count === 1 ? 'resultado' : 'resultados'}`;
    els.activeFilters.append(summary);
  }
}

function filterChip(kind, value, label) {
  const button = document.createElement('button');
  button.className = 'fiestas-active-chip';
  button.type = 'button';
  button.dataset.removeFilter = kind;
  button.dataset.value = value;
  button.innerHTML = `<span>${escapeHtml(label)}</span><i class="fa-solid fa-xmark" aria-hidden="true"></i>`;
  return button;
}

function removeFilter(kind, value) {
  if (kind === 'search') {
    state.search = '';
    if (els.search) els.search.value = '';
  }
  if (kind === 'type') state.selectedTypes.delete(value);
  if (kind === 'area') state.selectedAreas.delete(value);
  if (kind === 'ticket') state.selectedTicketKinds.delete(value);
  if (kind === 'favorites') state.onlyFavorites = false;
}

function setMenuOpen(kind, open) {
  const menus = {
    area: [els.areaList, els.areaToggle],
    type: [els.typeList, els.typeToggle],
    ticket: [els.ticketList, els.ticketToggle]
  };
  const [list, toggle] = menus[kind] || [];
  if (!list || !toggle) return;
  list.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

function getInitialDate(dates) {
  if (!dates.length) return 'all';
  const today = localDateKey(new Date());
  const first = dates[0].date;
  const last = dates[dates.length - 1].date;
  if (today < first) return first;
  if (today > last) return last;
  return dates.some((date) => date.date === today) ? today : first;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDates(events) {
  return [...new Map(events.map((event) => [event.date, { date: event.date, label: event.dateLabel || event.date }])).values()];
}

function getTypes(events) {
  return [...new Set(events.flatMap((event) => event.tags?.length ? event.tags : [event.type || 'Evento']))].sort((a, b) => collator.compare(a, b));
}

function getAreas(events) {
  return [...new Set(events.map((event) => event.area).filter(Boolean))].sort((a, b) => collator.compare(a, b));
}

function groupByDay(events) {
  const days = new Map();
  events.forEach((event) => {
    if (!days.has(event.date)) days.set(event.date, []);
    days.get(event.date).push(event);
  });
  return [...days.entries()];
}

function labelForDate(date) {
  return state.dates.find((day) => day.date === date)?.label || date;
}

function toggleSetValue(set, value, checked) {
  if (!value) return;
  if (checked) set.add(value);
  else set.delete(value);
}

function hasActiveFilters() {
  return Boolean(state.search || state.selectedTypes.size || state.selectedAreas.size || state.selectedTicketKinds.size || state.onlyFavorites);
}

function setLabel(set, empty, singular, plural) {
  if (!set.size) return empty;
  if (set.size === 1) return [...set][0];
  return `${set.size} ${set.size === 1 ? singular : plural}`;
}

function ticketSetLabel() {
  if (!state.selectedTicketKinds.size) return 'Entradas';
  if (state.selectedTicketKinds.size === 1) return ticketKindLabel([...state.selectedTicketKinds][0]);
  return `${state.selectedTicketKinds.size} entradas`;
}

function toggleFavorite(id) {
  if (!id) return;
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem(storageKey, JSON.stringify([...state.favorites]));
  if (els.agenda) render();
  updateDetailFavorite();
}

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags, type) {
  const primary = type || 'Evento';
  const values = Array.isArray(tags) ? tags.map(String) : [];
  return [...new Set([primary, ...values].map((tag) => tag.trim()).filter(Boolean))];
}

function compareEvents(a, b) {
  return a.date.localeCompare(b.date) || sortMinutes(a.startTime) - sortMinutes(b.startTime) || collator.compare(a.title, b.title);
}

function sortMinutes(time = '') {
  if (!time) return 99 * 60;
  const [hour, minute] = String(time).split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 99 * 60;
  const minutes = hour * 60 + minute;
  return hour < 6 ? minutes + 24 * 60 : minutes;
}

function timeRange(event) {
  if (!event.startTime) return 'Hora por confirmar';
  return [event.startTime, event.endTime].filter(Boolean).join(' - ');
}

function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function createCartoLayer(leaflet) {
  return leaflet.tileLayer(cartoLayers[currentTheme()], {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  });
}

function updateMapTheme(leaflet) {
  if (!state.map || !state.tileLayer) return;
  state.map.removeLayer(state.tileLayer);
  state.tileLayer = createCartoLayer(leaflet).addTo(state.map);
}

function inferTicketKind(ticket) {
  if (!ticket?.required) return 'free';
  const text = normalizeText([ticket.label, ticket.url, ticket.note].filter(Boolean).join(' '));
  if (text.includes('espaciosjovenesvalladolid')) return 'registration';
  return 'paid';
}

function ticketKindLabel(kind) {
  const labels = {
    free: 'Gratis',
    paid: 'Pago',
    registration: 'Inscripción'
  };
  return labels[kind] || 'Entrada';
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

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
}

function showMapEmpty(message) {
  if (!els.mapEmpty) return;
  els.mapEmpty.hidden = false;
  els.mapEmpty.textContent = message;
}

function emptyState(message, canClear = false) {
  const node = document.createElement('div');
  node.className = 'fiestas-empty';
  const button = canClear ? '<button type="button" data-empty-clear>Limpiar filtros</button>' : '';
  node.innerHTML = `<p>${escapeHtml(message)}</p>${button}`;
  node.querySelector('[data-empty-clear]')?.addEventListener('click', () => els.clearFilters?.click());
  return node;
}

function applyInitialUrlState() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const eventId = params.get('event');
  if (view === 'map') state.view = 'map';
  if (eventId) {
    const event = state.events.find((item) => item.id === eventId);
    if (event?.date) state.selectedDate = event.date;
  }
}

function initDetailPage() {
  updateDetailFavorite({ silent: true });
  els.detailSave?.addEventListener('click', () => toggleFavorite(els.detail.dataset.eventId));
  els.detailShare?.addEventListener('click', shareDetail);
  els.detailBack?.addEventListener('click', goBackToAgenda);
  if (els.detailMap) initDetailMap();
}

function updateDetailFavorite(options = {}) {
  if (!els.detail || !els.detailSave) return;
  const saved = state.favorites.has(els.detail.dataset.eventId);
  els.detailSave.classList.toggle('is-active', saved);
  els.detailSave.setAttribute('aria-pressed', String(saved));
  els.detailSave.setAttribute('aria-label', saved ? 'Quitar de guardados' : 'Guardar actividad');
  els.detailSave.innerHTML = `<i class="${saved ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>`;
  if (!options.silent) showDetailFeedback(saved ? 'Actividad guardada.' : 'Actividad eliminada de guardados.');
}

function goBackToAgenda() {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch (_) {}
  window.location.href = '/';
}

async function shareDetail() {
  if (!els.detail) return;
  const title = els.detail.dataset.shareTitle || document.title;
  const text = els.detail.dataset.shareText || title;
  const url = els.detail.dataset.shareUrl || window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      showDetailFeedback('Actividad compartida.');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);
    showDetailFeedback('Enlace copiado.');
  } catch (_) {
    if (els.detailShareFallback) els.detailShareFallback.hidden = false;
    if (els.detailShareInput) {
      els.detailShareInput.value = url;
      els.detailShareInput.focus();
      els.detailShareInput.select();
    }
    showDetailFeedback('Copia el enlace desde el campo.');
  }
}

function showDetailFeedback(message) {
  if (!els.detailFeedback) return;
  els.detailFeedback.hidden = false;
  els.detailFeedback.textContent = message;
  window.clearTimeout(showDetailFeedback.timer);
  showDetailFeedback.timer = window.setTimeout(() => {
    els.detailFeedback.hidden = true;
  }, 2800);
}

async function initDetailMap() {
  const leaflet = await ensureLeaflet();
  const error = document.querySelector('[data-fiestas-detail-map-error]');
  if (!leaflet) {
    showDetailMapError(error, 'No se pudo cargar el mapa. La ubicación textual sigue disponible.');
    return;
  }
  const lat = Number(els.detailMap.dataset.lat);
  const lng = Number(els.detailMap.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showDetailMapError(error, 'Ubicación en mapa no disponible.');
    return;
  }
  try {
    const map = leaflet.map(els.detailMap, { scrollWheelZoom: false }).setView([lat, lng], 16);
    let tileLayer = createCartoLayer(leaflet).addTo(map);
    document.addEventListener('aldeapucela:themechange', () => {
      map.removeLayer(tileLayer);
      tileLayer = createCartoLayer(leaflet).addTo(map);
    });
    leaflet.marker([lat, lng]).addTo(map).bindPopup(escapeHtml(els.detailMap.dataset.title || 'Actividad'));
    window.requestAnimationFrame(() => map.invalidateSize());
  } catch (error) {
    console.error(error);
    showDetailMapError(document.querySelector('[data-fiestas-detail-map-error]'), 'No se pudo mostrar el mapa. La ubicación textual sigue disponible.');
  }
}

function showDetailMapError(error, message) {
  if (!error) return;
  error.hidden = false;
  error.textContent = message;
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
