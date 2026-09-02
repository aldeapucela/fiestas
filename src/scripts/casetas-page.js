import { readCasetaFavoriteIds, setCasetaFavorite, subscribeToCasetaFavorites } from './casetas-favorites.js';
import { readCasetaDishLikeIds, subscribeToCasetaDishLikes } from './caseta-dish-likes.js';
import { trackCasetaFavoriteChanged } from './analytics.js';
import { buildCasetaDetailHref } from './casetas-navigation.js';
import { matchesSearch, normalizeText } from './search-text.js';

const CENTER = [41.645726, -4.732919];
const DEFAULT_ZOOM = 13;
const USER_ZOOM = 14;
const MAX_CITY_COORDINATE_DISTANCE_KM = 12;
const CARTO_BASEMAPS_API_KEY = 'cb1_27ug_1_19138f635d4f03358d12cb43';
const CARTO_LAYERS = {
  light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_BASEMAPS_API_KEY}`,
  dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_BASEMAPS_API_KEY}`
};
const LEAFLET_SCRIPT_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_SCRIPT_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const ZONE_COLORS = {
  'Zona 1': '#0f9f8d',
  'Zona 2': '#73579f',
  'Zona 3': '#d48625',
  'Zona 4': '#1976a8',
  'Zona 5': '#ba3d3d',
  'Zona 6': '#087e8c',
  'Zona 7': '#b94f72',
  'Zona 8': '#2f7d4f',
  'Zona Ferias': '#a85a2a'
};
const DIETARY_TITLE_LABELS = {
  vegetarian: 'Platos vegetarianos',
  vegan: 'Platos veganos',
  'gluten-free': 'Platos sin gluten'
};
const DEFAULT_DOCUMENT_TITLE = document.title;
const ZONE_LABELS = {
  'Zona 1': 'Plaza Mayor',
  'Zona 2': 'San Benito',
  'Zona 3': 'Plaza de la Universidad',
  'Zona 4': 'Catedral y Portugalete',
  'Zona 5': 'Acera de Recoletos',
  'Zona 6': 'Paseo Zorrilla · Plaza de Toros',
  'Zona 7': 'Plaza de Santa Cruz',
  'Zona 8': 'Plaza del Salvador',
  'Zona Ferias': 'Recinto ferial José Luis Bellido'
};

let leafletPromise = null;
let initialized = false;

const state = {
  casetas: [],
  zones: [],
  mapGroups: [],
  selectedZone: null,
  selectedLocation: null,
  searchQuery: '',
  searchOpen: false,
  dietaryFilters: new Set(),
  onlyFavorites: false,
  onlyLikedDishes: false,
  onlyWithMenu: false,
  casetaFavorites: new Set(),
  likedCasetaDishIds: new Set(),
  filterPanelOpen: false,
  filterReturnFocus: null,
  sheetState: 'collapsed',
  map: null,
  tileLayer: null,
  markers: null,
  userMarker: null,
  userLocation: null,
  locationStatus: 'idle',
  hasRequestedLocation: false,
  preferredMapCenter: null,
  suppressSheetToggleClick: false
};

const els = {};

export function initCasetasPage() {
  if (initialized) return;
  initialized = true;
  els.app = document.querySelector('[data-fiestas-casetas-page]');
  els.mapCanvas = document.querySelector('[data-fiestas-map]');
  els.mapEmpty = document.querySelector('[data-fiestas-map-empty]');
  els.mapLocate = document.querySelector('[data-fiestas-map-locate]');
  els.locationNote = document.querySelector('[data-fiestas-location-note]');
  els.mapSheet = document.querySelector('[data-fiestas-map-sheet]');
  els.mapSheetToggle = document.querySelector('[data-fiestas-map-sheet-toggle]');
  els.mapSheetOpen = document.querySelector('[data-fiestas-map-sheet-open]');
  els.mapSheetTitle = document.querySelector('[data-fiestas-map-sheet-title]');
  els.mapSheetCount = document.querySelector('[data-fiestas-map-sheet-count]');
  els.mapSheetTabLabel = document.querySelector('[data-fiestas-map-sheet-tab-label]');
  els.filterToggle = document.querySelector('[data-fiestas-casetas-filter-toggle]');
  els.filterPanel = document.querySelector('[data-fiestas-casetas-filter-panel]');
  els.filterClose = document.querySelector('[data-fiestas-casetas-filter-close]');
  els.filterInputs = [...document.querySelectorAll('[data-fiestas-casetas-dietary-filter]')];
  els.filterFavorite = document.querySelector('[data-fiestas-casetas-favorites-filter]');
  els.filterLikedDishes = document.querySelector('[data-fiestas-casetas-liked-dishes-filter]');
  els.filterWithMenu = document.querySelector('[data-fiestas-casetas-menu-filter]');
  els.filterCount = document.querySelector('[data-fiestas-casetas-filter-count]');
  els.filterClear = document.querySelector('[data-fiestas-casetas-filter-clear]');
  els.mapClearFilters = document.querySelector('[data-fiestas-map-clear-filters]');
  els.searchToggle = document.querySelector('[data-fiestas-casetas-search-toggle]');
  els.searchPanel = document.querySelector('[data-fiestas-casetas-search-panel]');
  els.searchInput = document.querySelector('[data-fiestas-casetas-search-input]');
  els.searchClear = document.querySelector('[data-fiestas-casetas-search-clear]');
  els.mapSheetPreview = document.querySelector('[data-fiestas-map-sheet-preview]');
  els.mapSheetList = document.querySelector('[data-fiestas-map-sheet-list]');

  state.casetas = normalizeCasetas(window.__FIESTAS_2026_CASETAS__ || []);
  state.zones = buildZones(state.casetas);
  state.mapGroups = buildMapGroups(state.zones);
  state.casetaFavorites = new Set(readCasetaFavoriteIds());
  state.likedCasetaDishIds = new Set(readCasetaDishLikeIds());
  readUrlState();
  els.app?.classList.add('is-map-mode');
  bindControls();
  bindSheetGestures();
  subscribeToCasetaFavorites((ids) => {
    state.casetaFavorites = new Set(ids);
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  subscribeToCasetaDishLikes((ids) => {
    state.likedCasetaDishIds = new Set(ids);
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  renderSheet(getVisibleCasetas());
  requestLocation({ centerOnSuccess: false });
  void initializeMap();
}

function normalizeCasetas(entries) {
  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const id = String(entry.id || '').trim();
      const name = String(entry.name || '').trim();
      const zone = String(entry.zone || '').trim();
      const location = String(entry.location || '').trim();
      const placement = String(entry.placement || '').trim();
      const details = entry.details && typeof entry.details === 'object' ? entry.details : null;
      const coordinates = hasCoordinates(entry.coordinates) ? {
        lat: Number(entry.coordinates.lat),
        lng: Number(entry.coordinates.lng),
        source: String(entry.coordinates.source || '')
      } : null;
      return {
        id,
        name,
        slug: String(entry.publicSlug || entry.slug || slugify(name)),
        publicSlug: String(entry.publicSlug || entry.slug || slugify(name)),
        zone,
        location,
        placement,
        details,
        dietary: getDietaryLabels(details),
        searchText: normalizeText([
          name,
          location,
          zone,
          placement,
          ...collectTextValues(details)
        ].join(' ')),
        coordinates,
        color: zoneColor(zone)
      };
    })
    .filter((entry) => entry.id && entry.name && entry.zone && entry.location)
    .sort(compareCasetas);
}

function buildZones(casetas) {
  const grouped = new Map();
  casetas.forEach((caseta) => {
    if (!grouped.has(caseta.zone)) grouped.set(caseta.zone, []);
    grouped.get(caseta.zone).push(caseta);
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([zone, items]) => {
      return {
        zone,
        number: zone.match(/\d+/)?.[0] || '',
        items,
        coordinates: representativeCoordinates(items),
        color: zoneColor(zone)
      };
    });
}

function buildMapGroups(zones) {
  return zones.flatMap((zone) => {
    if (zone.zone === 'Zona 1') {
      return [{
        id: `${zone.zone}-all`,
        zone: zone.zone,
        number: zone.number,
        location: null,
        items: zone.items,
        coordinates: zone.coordinates,
        color: zone.color
      }];
    }
    const grouped = new Map();
    zone.items.forEach((caseta) => {
      const key = normalizeText(caseta.location);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(caseta);
    });
    return [...grouped.entries()].map(([key, items]) => ({
      id: `${zone.zone}-${key}`,
      zone: zone.zone,
      number: zone.number,
      location: items[0].location,
      items,
      // Use the location's city coordinates whenever possible. If the
      // geocoder could not resolve that location reliably, keep the group
      // visible by falling back to the zone's representative point.
      coordinates: representativeCoordinates(items) || zone.coordinates,
      color: zone.color
    }));
  }).sort((a, b) => a.zone.localeCompare(b.zone, 'es', { numeric: true })
    || (a.location || '').localeCompare(b.location || '', 'es', { sensitivity: 'base' }));
}

function bindControls() {
  els.mapLocate?.addEventListener('click', () => requestLocation({ centerOnSuccess: true, force: true }));
  els.locationNote?.addEventListener('click', () => requestLocation({ centerOnSuccess: true, force: true }));
  els.filterToggle?.addEventListener('click', () => setFilterPanelOpen(!state.filterPanelOpen));
  els.filterClose?.addEventListener('click', () => setFilterPanelOpen(false));
  els.filterInputs.forEach((input) => {
    input.addEventListener('click', (event) => {
      const value = event.currentTarget.value;
      if (state.dietaryFilters.has(value)) state.dietaryFilters.delete(value);
      else state.dietaryFilters.add(value);
      syncUrlState();
      renderMapMarkers();
      renderSheet(getVisibleCasetas());
    });
  });
  els.filterFavorite?.addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    syncUrlState();
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  els.filterLikedDishes?.addEventListener('click', () => {
    state.onlyLikedDishes = !state.onlyLikedDishes;
    syncUrlState();
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  els.filterWithMenu?.addEventListener('click', () => {
    state.onlyWithMenu = !state.onlyWithMenu;
    syncUrlState();
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  els.filterClear?.addEventListener('click', () => {
    state.dietaryFilters.clear();
    state.onlyFavorites = false;
    state.onlyLikedDishes = false;
    state.onlyWithMenu = false;
    syncUrlState();
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  els.mapClearFilters?.addEventListener('click', () => els.filterClear?.click());
  els.searchToggle?.addEventListener('click', () => {
    const opening = !state.searchOpen;
    state.searchOpen = opening;
    if (opening) {
      // Search is a city-wide action. Leave any zone explored on the map
      // before rendering results so a search cannot be scoped accidentally.
      resetMapSelection({ render: false });
      if (state.sheetState !== 'expanded') state.sheetState = 'expanded';
      renderSheet(getVisibleCasetas());
    } else {
      syncSearchUi();
    }
    if (opening) els.searchInput?.focus();
  });
  els.searchInput?.addEventListener('input', (event) => {
    // Sin trim: syncSearchUi() reescribe el input desde el estado, y recortar
    // aqui borraba el espacio recien tecleado. Se recorta al usar la consulta.
    state.searchQuery = event.currentTarget.value;
    if (els.searchClear) els.searchClear.hidden = !state.searchQuery.trim();
    syncUrlState();
    renderSheet(getVisibleCasetas());
  });
  els.searchClear?.addEventListener('click', () => {
    state.searchQuery = '';
    if (els.searchInput) els.searchInput.value = '';
    els.searchClear.hidden = true;
    syncUrlState();
    renderSheet(getVisibleCasetas());
    els.searchInput?.focus();
  });
  syncSearchUi();
  els.mapSheetToggle?.addEventListener('click', () => {
    if (state.suppressSheetToggleClick) {
      state.suppressSheetToggleClick = false;
      return;
    }
    state.sheetState = state.sheetState === 'expanded' ? 'collapsed' : 'expanded';
    renderSheet(getVisibleCasetas());
  });
  els.mapSheetOpen?.addEventListener('click', () => {
    state.sheetState = 'collapsed';
    renderSheet(getVisibleCasetas());
  });
  document.addEventListener('click', (event) => {
    if (state.filterPanelOpen
      && !event.target.closest('[data-fiestas-casetas-filter-toggle]')
      && !event.target.closest('[data-fiestas-casetas-filter-panel]')) {
      setFilterPanelOpen(false, { restoreFocus: false });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.filterPanelOpen) {
      setFilterPanelOpen(false);
      return;
    }
    if (!state.selectedZone) return;
    if (state.selectedLocation) state.selectedLocation = null;
    else state.selectedZone = null;
    syncUrlState();
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const zone = params.get('zone');
  const location = params.get('location');
  const selectedCaseta = params.get('caseta');
  state.searchQuery = String(params.get('search') || '').trim();
  if (zone && state.zones.some((item) => item.zone === zone)) state.selectedZone = zone;
  if (!state.selectedZone && selectedCaseta) {
    state.selectedZone = state.casetas.find((caseta) => caseta.id === selectedCaseta)?.zone || null;
  }
  const selectedZone = state.zones.find((item) => item.zone === state.selectedZone);
  if (selectedZone && location && selectedZone.items.some((caseta) => caseta.location === location)) {
    state.selectedLocation = location;
  }
  const dietaryValues = [
    ...params.getAll('dietary').flatMap((value) => value.split(',')),
    ...params.getAll('diet')
  ];
  dietaryValues
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value === 'vegetarian' || value === 'vegan' || value === 'gluten-free')
    .forEach((value) => state.dietaryFilters.add(value));
  state.onlyFavorites = ['1', 'true'].includes(String(params.get('favorites') || '').toLowerCase());
  state.onlyLikedDishes = ['1', 'true'].includes(String(params.get('liked') || '').toLowerCase());
  state.onlyWithMenu = ['1', 'true'].includes(String(params.get('menu') || '').toLowerCase());
}

function syncUrlState() {
  const url = new URL(window.location.href);
  if (state.selectedZone) {
    url.searchParams.set('zone', state.selectedZone);
    if (state.selectedLocation) url.searchParams.set('location', state.selectedLocation);
    else url.searchParams.delete('location');
  }
  else {
    url.searchParams.delete('zone');
    url.searchParams.delete('caseta');
    url.searchParams.delete('location');
  }
  url.searchParams.delete('dietary');
  url.searchParams.delete('diet');
  if (state.onlyFavorites) url.searchParams.set('favorites', '1');
  else url.searchParams.delete('favorites');
  if (state.onlyLikedDishes) url.searchParams.set('liked', '1');
  else url.searchParams.delete('liked');
  if (state.onlyWithMenu) url.searchParams.set('menu', '1');
  else url.searchParams.delete('menu');
  const searchQuery = state.searchQuery.trim();
  if (searchQuery) url.searchParams.set('search', searchQuery);
  else url.searchParams.delete('search');
  [...state.dietaryFilters]
    .sort()
    .forEach((dietary) => url.searchParams.append('dietary', dietary));
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getVisibleCasetas() {
  const selectedZone = state.selectedZone
    ? state.zones.find((zone) => zone.zone === state.selectedZone)
    : null;
  const source = selectedZone
    ? state.selectedLocation
      ? selectedZone.items.filter((caseta) => caseta.location === state.selectedLocation)
      : selectedZone.items
    : state.casetas;
  return source.filter((caseta) => {
    const matchesQuery = matchesSearch(caseta.searchText, state.searchQuery);
    return matchesQuery && matchesCasetaFilters(caseta);
  });
}

function matchesCasetaFilters(caseta) {
  const matchesDietary = !state.dietaryFilters.size
    || [...state.dietaryFilters].some((dietary) => caseta.dietary.includes(dietary));
  const matchesFavorite = !state.onlyFavorites || state.casetaFavorites.has(caseta.id);
  const matchesLikedDish = !state.onlyLikedDishes || casetaHasLikedDish(caseta, state.likedCasetaDishIds);
  const matchesMenu = !state.onlyWithMenu || casetaHasMenu(caseta);
  return matchesDietary && matchesFavorite && matchesLikedDish && matchesMenu;
}

export function casetaHasMenu(caseta) {
  return (caseta?.details?.menuSections || []).some((section) => Array.isArray(section?.items) && section.items.length > 0);
}

export function casetaHasLikedDish(caseta, likedDishIds = new Set()) {
  return (caseta.details?.menuSections || []).some((section) => (section?.items || []).some((item) => {
    const dishId = typeof item === 'object' ? item?.id : '';
    return section?.votable && dishId && likedDishIds.has(`${caseta.id}/${dishId}`);
  }));
}

function getDietaryLabels(details) {
  return [...new Set((details?.menuSections || []).flatMap((section) => (section?.items || [])
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      return [
        item.dietary === 'vegetarian' || item.dietary === 'vegan' ? item.dietary : '',
        item.glutenFree === true ? 'gluten-free' : ''
      ];
    })
    .filter(Boolean)))];
}

function collectTextValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectTextValues(item));
  if (value && typeof value === 'object') return Object.values(value).flatMap((item) => collectTextValues(item));
  return [];
}

async function initializeMap() {
  if (!els.mapCanvas) return;
  const leaflet = await ensureLeaflet();
  if (!leaflet) {
    showMapEmpty('El mapa no está disponible ahora. Puedes consultar todas las casetas en la lista.');
    return;
  }
  state.map = leaflet.map(els.mapCanvas, { maxZoom: 19, scrollWheelZoom: true }).setView(CENTER, DEFAULT_ZOOM);
  state.map.on('click', (event) => {
    if (event.originalEvent?.target?.closest?.('.fiestas-caseta-zone-marker')) return;
    resetMapSelection({ collapse: true });
  });
  state.tileLayer = createCartoLayer(leaflet).addTo(state.map);
  state.markers = leaflet.layerGroup().addTo(state.map);
  document.addEventListener('aldeapucela:themechange', () => updateMapTheme(leaflet));
  renderMapMarkers();
  renderUserMarker(leaflet);
  window.requestAnimationFrame(() => {
    state.map.invalidateSize();
    applyPreferredCenter();
  });
}

function renderMapMarkers() {
  if (!state.map || !state.markers || !window.L) return;
  state.markers.clearLayers();
  const groupsWithCoordinates = state.mapGroups.map((group) => ({
    ...group,
    items: group.items.filter(matchesCasetaFilters)
  })).filter((group) => hasCoordinates(group.coordinates) && group.items.length);
  if (!groupsWithCoordinates.length) {
    const emptyMessage = state.onlyFavorites && !state.casetaFavorites.size
      ? 'Todavía no has guardado ninguna caseta como favorita.'
      : state.onlyFavorites
        ? 'No hay casetas favoritas con esos filtros.'
        : state.onlyLikedDishes && !state.likedCasetaDishIds.size
          ? 'Todavía no has dado me gusta a ningún pincho.'
        : state.onlyLikedDishes
            ? 'No hay casetas con pinchos que te gusten y esos filtros.'
        : state.onlyWithMenu && !state.casetas.some(casetaHasMenu)
          ? 'Todavía no hay cartas integradas.'
        : state.onlyWithMenu
          ? 'No hay casetas con carta y esos filtros.'
        : state.dietaryFilters.size
          ? 'No hay casetas con esos filtros.'
          : 'Las zonas todavía no tienen una ubicación exacta en el mapa.';
    showMapEmpty(emptyMessage);
    return;
  }
  els.mapEmpty.hidden = true;
  groupsWithCoordinates.forEach((group) => {
    const markerLabel = group.location ? `${group.zone} - ${group.location}` : group.zone;
    const groupCount = `${group.items.length} ${group.items.length === 1 ? 'caseta' : 'casetas'}`;
    const markerCode = group.number ? `Z${group.number}` : 'ZF';
    const marker = window.L.marker([group.coordinates.lat, group.coordinates.lng], {
      title: `${markerLabel}. ${groupCount}`,
      alt: `${markerLabel}. ${groupCount}`,
      keyboard: false,
      zIndexOffset: group.location ? 0 : 1000,
      icon: window.L.divIcon({
        className: `fiestas-map-marker fiestas-caseta-zone-marker${state.selectedZone === group.zone && (!group.location || state.selectedLocation === group.location) ? ' is-selected' : ''}`,
        html: `<button type="button" style="--fiestas-type-color:${escapeAttribute(group.color)}" aria-label="Ver ${escapeAttribute(markerLabel)} con ${groupCount}"><span>${escapeHtml(markerCode)}</span></button>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
    });
    marker.on('click', () => selectMapGroup(group));
    marker.addTo(state.markers);
  });
}

function selectMapGroup(group) {
  state.selectedZone = group.zone;
  state.selectedLocation = group.location || null;
  state.searchOpen = false;
  state.sheetState = 'expanded';
  syncUrlState();
  renderMapMarkers();
  renderSheet(getVisibleCasetas(), { scrollToTop: true });
}

function resetMapSelection({ collapse = false, render = true } = {}) {
  if (!state.selectedZone && !state.selectedLocation) return false;
  state.selectedZone = null;
  state.selectedLocation = null;
  if (collapse) state.sheetState = 'collapsed';
  syncUrlState();
  renderMapMarkers();
  if (render) renderSheet(getVisibleCasetas());
  return true;
}

function updateDocumentTitle() {
  const labels = [...state.dietaryFilters].map((value) => DIETARY_TITLE_LABELS[value]).filter(Boolean).sort();
  document.title = labels.length
    ? `${labels.join(' y ')} | Casetas Feria de Día | Fiestas Valladolid 2026`
    : DEFAULT_DOCUMENT_TITLE;
}

function renderSheet(items, options = {}) {
  if (!els.mapSheet) return;
  updateDocumentTitle();
  if (state.sheetState !== 'expanded') state.searchOpen = false;
  const sorted = [...items].sort(compareCasetas);
  const isFocused = Boolean(state.selectedZone);
  const zoneTitle = state.selectedZone
    ? `Casetas de la ${state.selectedZone.toLowerCase()}${state.selectedLocation ? ` - ${state.selectedLocation}` : ''}`
    : 'Casetas en Valladolid';
  const count = sorted.length;
  const countText = `${count} ${count === 1 ? 'caseta' : 'casetas'}`;
  els.mapSheet.classList.toggle('is-expanded', state.sheetState === 'expanded');
  els.mapSheet.classList.toggle('is-collapsed', state.sheetState === 'collapsed');
  els.mapSheet.classList.toggle('is-hidden', state.sheetState === 'hidden');
  els.mapSheet.classList.toggle('is-zone-focused', isFocused);
  if (els.mapSheetOpen) els.mapSheetOpen.hidden = state.sheetState !== 'hidden';
  els.mapSheetToggle?.setAttribute('aria-expanded', String(state.sheetState === 'expanded'));
  if (els.mapSheetTitle) els.mapSheetTitle.textContent = zoneTitle;
  if (els.mapSheetCount) els.mapSheetCount.textContent = countText;
  if (els.mapSheetTabLabel) els.mapSheetTabLabel.textContent = `Ver ${countText}`;
  syncSearchUi();
  syncFilterUi();
  renderLocationStatus(isFocused);
  els.mapSheetPreview?.replaceChildren();
  els.mapSheetList?.replaceChildren();

  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'fiestas-empty fiestas-casetas-empty';
    empty.innerHTML = state.searchQuery.trim()
      ? `<p>No se han encontrado casetas para «${escapeHtml(state.searchQuery.trim())}».</p>`
      : state.onlyFavorites && !state.casetaFavorites.size
        ? '<p>Todavía no has guardado ninguna caseta como favorita.</p>'
        : state.onlyFavorites
          ? '<p>No hay casetas favoritas con estos filtros.</p>'
          : state.onlyLikedDishes && !state.likedCasetaDishIds.size
            ? '<p>Todavía no has dado me gusta a ningún pincho.</p>'
            : state.onlyLikedDishes
              ? '<p>No hay casetas con pinchos que te gusten y estos filtros.</p>'
      : state.onlyWithMenu && !state.casetas.some(casetaHasMenu)
        ? '<p>Todavía no hay cartas integradas.</p>'
      : state.onlyWithMenu
        ? '<p>No hay casetas con carta y estos filtros.</p>'
      : state.dietaryFilters.size
        ? '<p>No hay casetas con esos filtros.</p>'
        : '<p>No hay casetas disponibles.</p>';
    els.mapSheetPreview?.append(empty);
    return;
  }

  if (isFocused) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'fiestas-map-cluster-reset';
    reset.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Ver todas las zonas</span>';
    reset.addEventListener('click', () => {
      state.selectedZone = null;
      state.selectedLocation = null;
      state.sheetState = 'collapsed';
      syncUrlState();
      renderMapMarkers();
      renderSheet(getVisibleCasetas());
    });
    els.mapSheetList?.append(reset);
  }
  sorted.slice(0, 3).forEach((caseta) => els.mapSheetPreview?.append(casetaRow(caseta)));
  sorted.forEach((caseta) => els.mapSheetList?.append(casetaRow(caseta)));
  if (options.scrollToTop) els.mapSheetList?.scrollTo({ top: 0, behavior: 'auto' });
}

function casetaRow(caseta) {
  const article = document.createElement('article');
  article.className = 'fiestas-map-result fiestas-caseta-result';
  article.dataset.mapResultId = caseta.id;
  article.style.setProperty('--fiestas-type-color', caseta.color);
  const href = buildCasetaDetailHref(caseta);
  const placement = caseta.placement || '';
  const saved = state.casetaFavorites.has(caseta.id);
  const distance = state.userLocation && caseta.coordinates
    ? formatDistance(distanceInKilometres(
      [state.userLocation.lat, state.userLocation.lng],
      [caseta.coordinates.lat, caseta.coordinates.lng]
    ))
    : '';
  const searchMatch = getSearchMatch(caseta);
  if (searchMatch) article.dataset.searchMatch = searchMatch.text;
  article.innerHTML = `
    <a class="fiestas-map-result-link" href="${href}">
      <span class="fiestas-map-result-icon"><i class="fa-solid fa-store" aria-hidden="true"></i></span>
      <span class="fiestas-map-result-copy">
        <span class="fiestas-map-result-title-line">
          <span class="fiestas-map-result-title">${escapeHtml(caseta.name)}</span>
          <span class="fiestas-map-result-type">${escapeHtml(caseta.zone)}</span>
        </span>
        ${searchMatch ? `<span class="fiestas-map-result-search-match"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>${escapeHtml(searchMatch.text)}</span></span>` : ''}
        <span class="fiestas-map-result-meta"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(caseta.location)}</span>
        ${placement || distance ? `<span class="fiestas-map-result-time-line">${placement ? `<span class="fiestas-map-result-date">${escapeHtml(placement)}</span>` : ''}${distance ? `<span class="fiestas-map-result-distance"><i class="fa-solid fa-person-walking" aria-hidden="true"></i>${escapeHtml(distance)}</span>` : ''}</span>` : ''}
      </span>
    </a>
    <span class="fiestas-map-result-actions">
      <button
        class="fiestas-map-result-favorite${saved ? ' is-active' : ''}"
        type="button"
        data-fiestas-caseta-favorite-toggle
        data-caseta-id="${escapeAttribute(caseta.id)}"
        aria-label="${saved ? 'Quitar' : 'Añadir'} ${escapeAttribute(caseta.name)} ${saved ? 'de' : 'a'} favoritas"
        aria-pressed="${String(saved)}"
      ><i class="${saved ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i></button>
      <a class="fiestas-map-result-focus" href="${href}" aria-label="Ver ficha de ${escapeAttribute(caseta.name)}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a>
    </span>
  `;
  article.querySelector('[data-fiestas-caseta-favorite-toggle]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextSaved = !state.casetaFavorites.has(caseta.id);
    state.casetaFavorites = new Set(setCasetaFavorite(caseta.id, nextSaved));
    trackCasetaFavoriteChanged(caseta.id, nextSaved);
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
  return article;
}

function getSearchMatch(caseta) {
  if (!state.searchQuery.trim()) return null;

  const menuMatches = (caseta.details?.menuSections || []).flatMap((section) => [
    ...(section.items || []).map((item) => ({ text: typeof item === 'string' ? item : item?.name }))
  ]);
  const highlightMatches = (caseta.details?.highlights || []).map((highlight) => ({ text: highlight }));

  return [...menuMatches, ...highlightMatches]
    .find((candidate) => candidate.text && matchesSearch(candidate.text, state.searchQuery)) || null;
}

function renderLocationStatus(isFocused) {
  if (!els.locationNote) return;
  const show = !isFocused
    && state.sheetState === 'expanded'
    && ['denied', 'blocked', 'unavailable'].includes(state.locationStatus);
  els.locationNote.hidden = !show;
  els.locationNote.disabled = state.locationStatus === 'pending';
  els.locationNote.setAttribute('aria-label', 'Clic para compartir ubicación');
}

function syncSearchUi() {
  if (!els.searchToggle || !els.searchPanel) return;
  els.searchToggle.setAttribute('aria-expanded', String(state.searchOpen));
  els.searchToggle.setAttribute('aria-label', state.searchOpen ? 'Cerrar búsqueda' : 'Buscar caseta');
  els.searchToggle.setAttribute('title', state.searchOpen ? 'Cerrar búsqueda' : 'Buscar caseta');
  els.searchToggle.classList.toggle('is-active', state.searchOpen);
  els.searchPanel.hidden = !state.searchOpen;
  if (els.searchInput && els.searchInput.value !== state.searchQuery) els.searchInput.value = state.searchQuery;
  if (els.searchClear) els.searchClear.hidden = !state.searchQuery.trim();
}

function setFilterPanelOpen(open, options = {}) {
  const nextOpen = Boolean(open);
  if (nextOpen && !state.filterPanelOpen) state.filterReturnFocus = document.activeElement;
  state.filterPanelOpen = nextOpen;
  syncFilterUi();
  if (nextOpen) {
    (els.filterFavorite || els.filterInputs[0])?.focus();
  } else if (options.restoreFocus !== false) {
    const returnFocus = state.filterReturnFocus;
    state.filterReturnFocus = null;
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    else els.filterToggle?.focus();
  }
}

function syncFilterUi() {
  if (!els.filterToggle || !els.filterPanel) return;
  const activeFilterCount = state.dietaryFilters.size
    + (state.onlyFavorites ? 1 : 0)
    + (state.onlyLikedDishes ? 1 : 0)
    + (state.onlyWithMenu ? 1 : 0);
  els.filterToggle.classList.toggle('is-active', activeFilterCount > 0);
  els.filterToggle.setAttribute('aria-expanded', String(state.filterPanelOpen));
  els.filterToggle.setAttribute('aria-label', activeFilterCount
    ? `Abrir filtros. ${activeFilterCount} activos`
    : 'Abrir filtros');
  if (els.filterCount) {
    els.filterCount.hidden = activeFilterCount === 0;
    els.filterCount.textContent = String(activeFilterCount);
  }
  els.filterPanel.hidden = !state.filterPanelOpen;
  els.filterPanel.setAttribute('aria-hidden', String(!state.filterPanelOpen));
  els.filterPanel.toggleAttribute('aria-modal', state.filterPanelOpen);
  els.filterInputs.forEach((input) => {
    const active = state.dietaryFilters.has(input.value);
    input.classList.toggle('is-active', active);
    input.setAttribute('aria-pressed', String(active));
    const label = {
      vegetarian: 'vegetarianas',
      vegan: 'veganas',
      'gluten-free': 'sin gluten'
    }[input.value] || input.value;
    input.setAttribute('aria-label', active
      ? 'Mostrar todas las casetas'
      : `Mostrar solo casetas ${label}`);
  });
  if (els.filterFavorite) {
    els.filterFavorite.classList.toggle('is-active', state.onlyFavorites);
    els.filterFavorite.setAttribute('aria-pressed', String(state.onlyFavorites));
    els.filterFavorite.setAttribute('aria-label', state.onlyFavorites
      ? 'Mostrar todas las casetas'
      : 'Mostrar solo favoritas');
    const favoriteIcon = els.filterFavorite.querySelector('[data-fiestas-casetas-favorites-icon]');
    if (favoriteIcon) favoriteIcon.className = state.onlyFavorites ? 'fa-solid fa-star' : 'fa-regular fa-star';
  }
  if (els.filterLikedDishes) {
    els.filterLikedDishes.classList.toggle('is-active', state.onlyLikedDishes);
    els.filterLikedDishes.setAttribute('aria-pressed', String(state.onlyLikedDishes));
    els.filterLikedDishes.setAttribute('aria-label', state.onlyLikedDishes
      ? 'Mostrar todas las casetas'
      : 'Mostrar solo casetas con pinchos que te gustan');
    const likedIcon = els.filterLikedDishes.querySelector('[data-fiestas-casetas-liked-dishes-icon]');
    if (likedIcon) likedIcon.className = state.onlyLikedDishes ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
  }
  if (els.filterWithMenu) {
    els.filterWithMenu.classList.toggle('is-active', state.onlyWithMenu);
    els.filterWithMenu.setAttribute('aria-pressed', String(state.onlyWithMenu));
    els.filterWithMenu.setAttribute('aria-label', state.onlyWithMenu
      ? 'Mostrar todas las casetas'
      : 'Mostrar solo casetas con carta');
    const menuIcon = els.filterWithMenu.querySelector('[data-fiestas-casetas-menu-icon]');
    if (menuIcon) menuIcon.className = 'fa-solid fa-utensils';
  }
  if (els.filterClear) els.filterClear.hidden = activeFilterCount === 0;
  if (els.mapClearFilters) els.mapClearFilters.hidden = activeFilterCount === 0;
}

function requestLocation(options = {}) {
  if (!navigator.geolocation) {
    state.locationStatus = 'unavailable';
    renderSheet(getVisibleCasetas());
    return;
  }
  if (state.locationStatus === 'pending') return;
  state.hasRequestedLocation = true;
  state.locationStatus = 'pending';
  renderSheet(getVisibleCasetas());
  navigator.geolocation.getCurrentPosition((position) => {
    state.locationStatus = 'granted';
    state.userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    if (options.centerOnSuccess) state.preferredMapCenter = { latLng: [state.userLocation.lat, state.userLocation.lng], zoom: USER_ZOOM };
    if (state.map) {
      renderUserMarker(window.L);
      if (options.centerOnSuccess) applyPreferredCenter();
    }
    renderSheet(getVisibleCasetas());
  }, (error) => {
    state.userLocation = null;
    state.locationStatus = error?.code === error?.PERMISSION_DENIED
      ? (options.force ? 'blocked' : 'denied')
      : 'unavailable';
    renderUserMarker(window.L);
    renderSheet(getVisibleCasetas());
  }, {
    enableHighAccuracy: false,
    maximumAge: 5 * 60 * 1000,
    timeout: 9000
  });
}

function renderUserMarker(leaflet) {
  if (!state.map || !leaflet) return;
  state.userMarker?.remove();
  state.userMarker = null;
  if (!state.userLocation || state.locationStatus !== 'granted') return;
  state.userMarker = leaflet.circleMarker([state.userLocation.lat, state.userLocation.lng], {
    radius: 8,
    color: '#0f9f8d',
    fillColor: '#17b8a4',
    fillOpacity: 0.85,
    weight: 3
  }).addTo(state.map);
}

function applyPreferredCenter() {
  if (!state.map) return;
  if (state.preferredMapCenter) {
    state.map.setView(state.preferredMapCenter.latLng, state.preferredMapCenter.zoom);
    state.preferredMapCenter = null;
  } else state.map.setView(CENTER, DEFAULT_ZOOM);
}

function bindSheetGestures() {
  if (!els.mapSheet || !els.mapSheetToggle) return;
  let startY = 0;
  let startTransformY = 0;
  let pointerId = null;
  let tracking = false;
  let dragged = false;
  const readTransformY = () => {
    const transform = getComputedStyle(els.mapSheet).transform;
    if (!transform || transform === 'none') return 0;
    const values = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number);
    return values.length === 6 ? values[5] : values.length === 16 ? values[13] : 0;
  };
  const reset = () => {
    tracking = false;
    dragged = false;
    pointerId = null;
    els.mapSheet.classList.remove('is-dragging');
    els.mapSheet.style.removeProperty('transform');
  };
  els.mapSheetToggle.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    tracking = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    startTransformY = readTransformY();
    els.mapSheet.classList.add('is-dragging');
    els.mapSheetToggle.setPointerCapture?.(event.pointerId);
  });
  els.mapSheetToggle.addEventListener('pointermove', (event) => {
    if (!tracking || event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    if (Math.abs(delta) > 8) {
      dragged = true;
      event.preventDefault();
    }
    if (!dragged) return;
    const next = Math.max(-80, Math.min(els.mapSheet.offsetHeight, startTransformY + delta));
    els.mapSheet.style.transform = `translateY(${next}px)`;
  });
  const finish = (event, cancelled = false) => {
    if (!tracking || event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    const didDrag = dragged && Math.abs(delta) >= 28;
    reset();
    els.mapSheetToggle.releasePointerCapture?.(event.pointerId);
    if (cancelled || !didDrag) return;
    // Mobile browsers dispatch a synthetic click after a pointer gesture. Do
    // not let that click immediately undo the state selected by the swipe.
    state.suppressSheetToggleClick = true;
    window.setTimeout(() => {
      state.suppressSheetToggleClick = false;
    }, 0);
    if (delta < -28) state.sheetState = 'expanded';
    else if (delta > 44 && state.sheetState === 'expanded') state.sheetState = 'collapsed';
    else if (delta > 44) state.sheetState = 'hidden';
    renderSheet(getVisibleCasetas());
  };
  els.mapSheetToggle.addEventListener('pointerup', (event) => finish(event));
  els.mapSheetToggle.addEventListener('pointercancel', (event) => finish(event, true));
  els.mapSheetToggle.addEventListener('lostpointercapture', (event) => finish(event, true));
}

function showMapEmpty(message) {
  if (!els.mapEmpty) return;
  els.mapEmpty.hidden = false;
  els.mapEmpty.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function createCartoLayer(leaflet) {
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  return leaflet.tileLayer(CARTO_LAYERS[theme], {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  });
}

function updateMapTheme(leaflet) {
  if (!state.map || !state.tileLayer) return;
  state.map.removeLayer(state.tileLayer);
  state.tileLayer = createCartoLayer(leaflet).addTo(state.map);
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  ensureLeafletCss();
  leafletPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-fiestas-leaflet-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L || null), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_SCRIPT_URL;
    script.integrity = LEAFLET_SCRIPT_INTEGRITY;
    script.crossOrigin = '';
    script.dataset.fiestasLeafletLoader = 'true';
    script.addEventListener('load', () => resolve(window.L || null), { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });
    document.head.append(script);
  });
  return leafletPromise;
}

// El CSS de Leaflet se inyecta bajo demanda junto al JS (ya no bloquea el render).
function ensureLeafletCss() {
  if (document.querySelector('link[href*="leaflet"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  link.crossOrigin = '';
  document.head.append(link);
}

function zoneColor(zone) {
  return ZONE_COLORS[zone] || '#0f9f8d';
}

function zoneLabel(zone) {
  return ZONE_LABELS[zone] || 'Valladolid';
}

function compareCasetas(a, b) {
  return a.zone.localeCompare(b.zone, 'es', { numeric: true })
    || a.location.localeCompare(b.location, 'es', { sensitivity: 'base' })
    || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
}

function representativeCoordinates(items) {
  const positioned = items.filter((item) => hasCoordinates(item.coordinates)
    && item.coordinates.source !== 'zone-fallback');
  const cityPositioned = positioned.filter((item) => isNearValladolid(item.coordinates));
  if (!cityPositioned.length) return null;
  return {
    lat: median(cityPositioned.map((item) => item.coordinates.lat)),
    lng: median(cityPositioned.map((item) => item.coordinates.lng))
  };
}

function isNearValladolid(coordinates) {
  return distanceInKilometres(CENTER, [coordinates.lat, coordinates.lng]) <= MAX_CITY_COORDINATE_DISTANCE_KM;
}

function distanceInKilometres([fromLat, fromLng], [toLat, toLng]) {
  const earthRadius = 6371;
  const latDelta = (toLat - fromLat) * Math.PI / 180;
  const lngDelta = (toLng - fromLng) * Math.PI / 180;
  const fromLatitude = fromLat * Math.PI / 180;
  const toLatitude = toLat * Math.PI / 180;
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) return `${Math.max(1, Math.round(distanceKm * 1000))} m`;
  return `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(distanceKm)} km`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function slugify(value = '') {
  return normalizeText(value).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'caseta';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value = '') {
  return escapeHtml(value);
}
