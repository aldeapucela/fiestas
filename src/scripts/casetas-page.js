const CENTER = [41.6523, -4.7245];
const DEFAULT_ZOOM = 15;
const USER_ZOOM = 14;
const MAX_CITY_COORDINATE_DISTANCE_KM = 12;
const CARTO_LAYERS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};
const ZONE_COLORS = {
  'Zona 1': '#0f9f8d',
  'Zona 2': '#73579f',
  'Zona 3': '#d48625',
  'Zona 4': '#1976a8',
  'Zona 5': '#ba3d3d',
  'Zona 6': '#087e8c',
  'Zona 7': '#b94f72'
};
const ZONE_LABELS = {
  'Zona 1': 'Plaza Mayor',
  'Zona 2': 'San Benito',
  'Zona 3': 'Plaza de la Universidad',
  'Zona 4': 'Catedral y Portugalete',
  'Zona 5': 'Acera de Recoletos',
  'Zona 6': 'Paseo Zorrilla · Plaza de Toros',
  'Zona 7': 'Plaza de Santa Cruz'
};

let leafletPromise = null;
let initialized = false;

const state = {
  casetas: [],
  zones: [],
  selectedZone: null,
  searchQuery: '',
  searchOpen: false,
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
  els.searchToggle = document.querySelector('[data-fiestas-casetas-search-toggle]');
  els.searchPanel = document.querySelector('[data-fiestas-casetas-search-panel]');
  els.searchInput = document.querySelector('[data-fiestas-casetas-search-input]');
  els.searchClear = document.querySelector('[data-fiestas-casetas-search-clear]');
  els.mapSheetPreview = document.querySelector('[data-fiestas-map-sheet-preview]');
  els.mapSheetList = document.querySelector('[data-fiestas-map-sheet-list]');

  state.casetas = normalizeCasetas(window.__FIESTAS_2026_CASETAS__ || []);
  state.zones = buildZones(state.casetas);
  readUrlState();
  els.app?.classList.add('is-map-mode');
  bindControls();
  bindSheetGestures();
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
        lng: Number(entry.coordinates.lng)
      } : null;
      return {
        id,
        name,
        slug: String(entry.slug || slugify(name)),
        zone,
        location,
        placement,
        details,
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
      const positioned = items.filter((item) => hasCoordinates(item.coordinates));
      const cityPositioned = positioned.filter((item) => isNearValladolid(item.coordinates));
      const trusted = cityPositioned.length ? cityPositioned : positioned;
      const coordinates = trusted.length ? {
        // Nominatim can resolve a generic street name to another municipality
        // in Valladolid province. Prefer city results and use a median to keep
        // any remaining bad result from moving the whole zone.
        lat: median(trusted.map((item) => item.coordinates.lat)),
        lng: median(trusted.map((item) => item.coordinates.lng))
      } : null;
      return {
        zone,
        number: zone.match(/\d+/)?.[0] || '',
        items,
        coordinates,
        color: zoneColor(zone)
      };
    });
}

function bindControls() {
  els.mapLocate?.addEventListener('click', () => requestLocation({ centerOnSuccess: true, force: true }));
  els.locationNote?.addEventListener('click', () => requestLocation({ centerOnSuccess: true, force: true }));
  els.searchToggle?.addEventListener('click', () => {
    state.searchOpen = !state.searchOpen;
    if (state.searchOpen && state.sheetState !== 'expanded') {
      state.sheetState = 'expanded';
      renderSheet(getVisibleCasetas());
    } else {
      syncSearchUi();
    }
    if (state.searchOpen) els.searchInput?.focus();
  });
  els.searchInput?.addEventListener('input', (event) => {
    state.searchQuery = event.currentTarget.value.trim();
    if (els.searchClear) els.searchClear.hidden = !state.searchQuery;
    renderSheet(getVisibleCasetas());
  });
  els.searchClear?.addEventListener('click', () => {
    state.searchQuery = '';
    if (els.searchInput) els.searchInput.value = '';
    els.searchClear.hidden = true;
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
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !state.selectedZone) return;
    state.selectedZone = null;
    syncUrlState();
    renderMapMarkers();
    renderSheet(getVisibleCasetas());
  });
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const zone = params.get('zone');
  const selectedCaseta = params.get('caseta');
  if (zone && state.zones.some((item) => item.zone === zone)) state.selectedZone = zone;
  if (!state.selectedZone && selectedCaseta) {
    state.selectedZone = state.casetas.find((caseta) => caseta.id === selectedCaseta)?.zone || null;
  }
}

function syncUrlState() {
  const url = new URL(window.location.href);
  if (state.selectedZone) url.searchParams.set('zone', state.selectedZone);
  else {
    url.searchParams.delete('zone');
    url.searchParams.delete('caseta');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getVisibleCasetas() {
  const source = state.selectedZone
    ? state.zones.find((zone) => zone.zone === state.selectedZone)?.items || state.casetas
    : state.casetas;
  const query = normalizeText(state.searchQuery);
  if (!query) return source;
  return source.filter((caseta) => caseta.searchText.includes(query));
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
  const zonesWithCoordinates = state.zones.filter((zone) => hasCoordinates(zone.coordinates));
  if (!zonesWithCoordinates.length) {
    showMapEmpty('Las zonas todavía no tienen una ubicación exacta en el mapa.');
    return;
  }
  els.mapEmpty.hidden = true;
  zonesWithCoordinates.forEach((zone) => {
    const reference = zoneLabel(zone.zone);
    const marker = window.L.marker([zone.coordinates.lat, zone.coordinates.lng], {
      title: `${zone.zone} - ${reference}. ${zone.items.length} ${zone.items.length === 1 ? 'caseta' : 'casetas'}`,
      alt: `${zone.zone} - ${reference}. ${zone.items.length} ${zone.items.length === 1 ? 'caseta' : 'casetas'}`,
      keyboard: false,
      icon: window.L.divIcon({
        className: `fiestas-map-marker fiestas-caseta-zone-marker${state.selectedZone === zone.zone ? ' is-selected' : ''}`,
        html: `<button type="button" style="--fiestas-type-color:${escapeAttribute(zone.color)}" aria-label="Ver ${escapeAttribute(zone.zone)} - ${escapeAttribute(reference)} con ${zone.items.length} casetas"><span>Z${escapeHtml(zone.number)}</span></button>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
    });
    marker.on('click', () => selectZone(zone.zone));
    marker.addTo(state.markers);
  });
}

function selectZone(zone) {
  state.selectedZone = zone;
  state.sheetState = 'expanded';
  syncUrlState();
  renderMapMarkers();
  renderSheet(getVisibleCasetas(), { scrollToTop: true });
}

function renderSheet(items, options = {}) {
  if (!els.mapSheet) return;
  if (state.sheetState !== 'expanded') state.searchOpen = false;
  const sorted = [...items].sort(compareCasetas);
  const isFocused = Boolean(state.selectedZone);
  const zoneTitle = state.selectedZone
    ? `Casetas de la ${state.selectedZone.toLowerCase()} - ${zoneLabel(state.selectedZone)}`
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
  renderLocationStatus(isFocused);
  els.mapSheetPreview?.replaceChildren();
  els.mapSheetList?.replaceChildren();

  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'fiestas-empty fiestas-casetas-empty';
    empty.innerHTML = state.searchQuery
      ? `<p>No se han encontrado casetas para «${escapeHtml(state.searchQuery)}».</p>`
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
  const href = `/c/${encodeURIComponent(caseta.id)}/${encodeURIComponent(caseta.slug)}/`;
  const placement = caseta.placement || '';
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
    <a class="fiestas-map-result-focus" href="${href}" aria-label="Ver ficha de ${escapeAttribute(caseta.name)}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a>
  `;
  return article;
}

function getSearchMatch(caseta) {
  const query = normalizeText(state.searchQuery).trim();
  if (!query) return null;

  const menuMatches = (caseta.details?.menuSections || []).flatMap((section) => [
    ...(section.items || []).map((item) => ({ text: item }))
  ]);
  const highlightMatches = (caseta.details?.highlights || []).map((highlight) => ({ text: highlight }));

  return [...menuMatches, ...highlightMatches]
    .find((candidate) => candidate.text && normalizeText(candidate.text).includes(query)) || null;
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
  if (els.searchClear) els.searchClear.hidden = !state.searchQuery;
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
  } else {
    const coordinates = state.zones
      .filter((zone) => hasCoordinates(zone.coordinates))
      .map((zone) => [zone.coordinates.lat, zone.coordinates.lng]);
    if (coordinates.length > 1) {
      state.map.fitBounds(coordinates, {
        paddingTopLeft: [24, 92],
        paddingBottomRight: [24, 124],
        maxZoom: DEFAULT_ZOOM
      });
    } else {
      state.map.setView(CENTER, DEFAULT_ZOOM);
    }
  }
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

function zoneColor(zone) {
  return ZONE_COLORS[zone] || '#0f9f8d';
}

function zoneLabel(zone) {
  return ZONE_LABELS[zone] || 'Valladolid';
}

function compareCasetas(a, b) {
  return a.zone.localeCompare(b.zone, 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

function hasCoordinates(coordinates) {
  return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
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

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
