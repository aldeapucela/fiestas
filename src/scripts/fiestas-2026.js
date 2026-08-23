import { setupMenuDrawer } from './menu-drawer.js';
import { setupSubscribe } from './subscribe.js';
import { initTheme } from './theme.js';
import {
  trackActivityOpened,
  trackActivityShared,
  trackActivityViewed,
  trackDateSelected,
  trackDirectionsOpened,
  trackExternalLinkOpened,
  trackFavoriteChanged,
  trackFilterApplied,
  trackMapMarkerSelected,
  trackMapOpened,
  trackPlanCalendarExported,
  trackSearchResults,
  trackTicketsOpened
} from './analytics.js';
import { readFavoriteIds, writeFavoriteIds } from './plan-storage.js';
import { createIcsFile, shareFileOrDownload } from './plan-export.js';
import { setupPlanImportPage, setupPlanSelector, setupPlansPage } from './plans-page.js';
import { setupCommunityPlanDetailPage, setupCommunityPlansPage } from './community-plans.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const defaultQueryKeys = ['date', 'q', 'type', 'area', 'ticket', 'view', 'event'];
const SITE_SHARE_URL = 'https://fiestas.aldeapucela.org/?mtm_campaign=share';
const SITE_SHARE_MESSAGE = `Mira, la mejor web para seguir las fiestas y ferias de Valladolid 2026\n\n${SITE_SHARE_URL}`;
const cartoLayers = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};
const valladolidCenter = [41.6523, -4.7245];
const userLocationZoom = 14;
const nearbyRadiusMeters = 2000;
const COMMUNITY_PLANS_INSERT_AFTER = 15;
let leafletPromise = null;
let initialDate = null;
let filterBackdrop = null;
let filterScrollY = 0;
let filterReturnFocus = null;
let suppressMapSheetClick = false;
let isApplyingUrlState = false;
let lastTrackedSearchKey = '';
let siteShareFeedbackTimer = null;
let scrollHeaderFrame = null;

function getCommunityCtaMode(pwaState = window.__FIESTAS_PWA_STATE__ || {}) {
  if (pwaState.installed) return 'community';
  if (pwaState.installable) return 'install';
  if (pwaState.iosHelp && !pwaState.iosHelpSeen && pwaState.inlineAvailable !== false) return 'ios-help';
  return 'community';
}

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
  markers: null,
  userMarker: null,
  selectedEventId: null,
  sheetState: 'collapsed',
  mapDateOpen: false,
  mapFilterPanelOpen: false,
  locationStatus: 'idle',
  userLocation: null,
  hasRequestedLocation: false,
  mapLoadError: false,
  currentMapEvents: [],
  preferredMapCenter: null,
  focusedClusterEventIds: null,
  communityCtaMode: getCommunityCtaMode()
};

const els = {
  app: document.querySelector('[data-fiestas-app]'),
  agenda: document.querySelector('[data-fiestas-agenda]'),
  mapView: document.querySelector('[data-fiestas-map-view]'),
  mapCanvas: document.querySelector('[data-fiestas-map]'),
  mapEmpty: document.querySelector('[data-fiestas-map-empty]'),
  datePanel: document.querySelector('[data-fiestas-dates]')?.closest('.fiestas-date-panel'),
  filterRegion: document.querySelector('[data-fiestas-filter-region]'),
  mapDateToggle: document.querySelector('[data-fiestas-map-date-toggle]'),
  mapDateLabel: document.querySelector('[data-fiestas-map-date-label]'),
  mapFilterToggle: document.querySelector('[data-fiestas-map-filter-toggle]'),
  mapFilterCount: document.querySelector('[data-fiestas-map-filter-count]'),
  mapFilterClose: document.querySelector('[data-fiestas-map-filter-close]'),
  mapLocate: document.querySelector('[data-fiestas-map-locate]'),
  locationNote: document.querySelector('[data-fiestas-location-note]'),
  mapSheet: document.querySelector('[data-fiestas-map-sheet]'),
  mapSheetToggle: document.querySelector('[data-fiestas-map-sheet-toggle]'),
  mapSheetOpen: document.querySelector('[data-fiestas-map-sheet-open]'),
  mapSheetTitle: document.querySelector('[data-fiestas-map-sheet-title]'),
  mapSheetCount: document.querySelector('[data-fiestas-map-sheet-count]'),
  mapSheetTabLabel: document.querySelector('[data-fiestas-map-sheet-tab-label]'),
  mapSheetPreview: document.querySelector('[data-fiestas-map-sheet-preview]'),
  mapSheetList: document.querySelector('[data-fiestas-map-sheet-list]'),
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
  siteShare: document.querySelector('[data-fiestas-share-site]'),
  siteShareFeedback: document.querySelector('[data-fiestas-share-feedback]'),
  searchToggle: document.querySelector('[data-fiestas-search-toggle]'),
  scrollHeader: document.querySelector('[data-fiestas-scroll-header]'),
  scrollHeaderDay: document.querySelector('[data-fiestas-scroll-day]'),
  scrollHeaderTop: document.querySelector('[data-fiestas-scroll-top]'),
  scrollSearchToggle: document.querySelector('[data-fiestas-scroll-search]'),
  searchPanel: document.querySelector('[data-fiestas-search-panel]'),
  search: document.querySelector('[data-fiestas-search]'),
  filterSummary: document.querySelector('[data-fiestas-filter-summary]'),
  activeFilters: document.querySelector('[data-fiestas-active-filters]'),
  filterCount: document.querySelector('[data-fiestas-filter-count]'),
  favoriteFilter: document.querySelector('[data-fiestas-favorites-filter]'),
  clearFilters: document.querySelector('[data-fiestas-clear-filters]'),
  viewTabs: [...document.querySelectorAll('[data-view-tab]')],
  detail: document.querySelector('[data-fiestas-detail]'),
  detailSave: document.querySelector('[data-fiestas-detail-save]'),
  detailActionSave: document.querySelector('[data-fiestas-detail-action-save]'),
  detailActionShare: document.querySelector('[data-fiestas-detail-action-share]'),
  detailActionCalendar: document.querySelector('[data-fiestas-detail-action-calendar]'),
  detailShare: document.querySelector('[data-fiestas-share]'),
  detailBack: document.querySelector('[data-fiestas-back]'),
  detailFeedback: document.querySelector('[data-fiestas-detail-feedback]'),
  detailShareFallback: document.querySelector('[data-fiestas-share-fallback]'),
  detailShareCopy: document.querySelector('[data-fiestas-copy-share]'),
  detailShareInput: document.querySelector('[data-fiestas-share-url-input]'),
  detailMap: document.querySelector('[data-fiestas-detail-map]'),
  detailImage: document.querySelector('[data-fiestas-detail-image]'),
  detailLightbox: document.querySelector('[data-fiestas-detail-lightbox]'),
  detailLightboxImage: document.querySelector('[data-fiestas-detail-lightbox-image]')
};

init();

function init() {
  initTheme();
  setupMenuDrawer();
  setupSubscribe();
  setupPlanSelector();

  if (els.detail) {
    initDetailPage();
    return;
  }

  if (!els.agenda) {
    setupCommunityPlansPage(window.__FIESTAS_2026_EVENTS__ || []);
    setupCommunityPlanDetailPage(window.__FIESTAS_2026_EVENTS__ || []);
    setupPlansPage(window.__FIESTAS_2026_EVENTS__ || []);
    setupPlanImportPage(window.__FIESTAS_2026_EVENTS__ || []);
    return;
  }

  try {
    state.events = normalizeEvents(window.__FIESTAS_2026_EVENTS__ || []);
    state.dates = getDates(state.events);
    state.types = getTypes(state.events);
    state.areas = getAreas(state.events);
    initialDate = getInitialDate(state.dates);
    state.selectedDate = initialDate;
    applyInitialUrlState();
    bindControls();
    if (state.view === 'map') requestLocationOnce();
    renderControlLists();
    setupCommunityCtaPwa();
    render();
    setupScrollHeader();
  } catch (error) {
    console.error(error);
    els.agenda.replaceChildren(emptyState('No se pudo cargar la agenda. Recarga la página para intentarlo de nuevo.', true));
  }
}

function bindControls() {
  [els.searchToggle, els.scrollSearchToggle].forEach((toggle) => {
    toggle?.addEventListener('click', () => setSearchOpen(els.searchPanel?.hidden));
  });
  els.scrollHeaderTop?.addEventListener('click', () => {
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  });
  document.querySelectorAll('[data-fiestas-share-site]').forEach((button) => {
    button.addEventListener('click', shareSite);
  });

  els.search?.addEventListener('input', (event) => {
    state.search = normalizeText(event.target.value.trim());
    state.focusedClusterEventIds = null;
    render({ updateUrl: true });
  });
  els.search?.addEventListener('change', trackCommittedSearch);
  els.search?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    trackCommittedSearch();
  });

  els.dateStrip?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    state.selectedDate = button.dataset.date || 'all';
    if (state.view === 'map') setMapDateOpen(false);
    trackDateSelected(state.selectedDate, state.view);
    state.focusedClusterEventIds = null;
    render({ scrollToAgenda: true, updateUrl: true });
  });

  els.typeList?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-type]');
    if (!input) return;
    toggleSetValue(state.selectedTypes, input.dataset.type || input.value || 'Evento', input.checked);
    trackFilterApplied('type', input.dataset.type || input.value, state.view);
    state.focusedClusterEventIds = null;
    render({ updateUrl: true });
  });

  els.areaList?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-area]');
    if (!input) return;
    toggleSetValue(state.selectedAreas, input.dataset.area || input.value, input.checked);
    trackFilterApplied('area', input.dataset.area || input.value, state.view);
    state.focusedClusterEventIds = null;
    render({ updateUrl: true });
  });

  els.ticketList?.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-ticket-kind]');
    if (!input) return;
    toggleSetValue(state.selectedTicketKinds, input.dataset.ticketKind || input.value, input.checked);
    trackFilterApplied('ticket', input.dataset.ticketKind || input.value, state.view);
    state.focusedClusterEventIds = null;
    render({ updateUrl: true });
  });

  [els.areaList, els.typeList, els.ticketList].forEach((list) => {
    list?.addEventListener('pointerdown', (event) => event.stopPropagation());
    list?.addEventListener('click', (event) => event.stopPropagation());
  });

  els.areaToggle?.addEventListener('click', () => setMenuOpen('area', els.areaToggle.getAttribute('aria-expanded') !== 'true'));
  els.typeToggle?.addEventListener('click', () => setMenuOpen('type', els.typeToggle.getAttribute('aria-expanded') !== 'true'));
  els.ticketToggle?.addEventListener('click', () => setMenuOpen('ticket', els.ticketToggle.getAttribute('aria-expanded') !== 'true'));

  document.querySelectorAll('[data-fiestas-filter-accept]').forEach((acceptButton) => {
    acceptButton.addEventListener('click', (event) => {
      event.preventDefault();
      setMenuOpen('area', false);
      setMenuOpen('type', false);
      setMenuOpen('ticket', false);
    });
  });

  els.favoriteFilter?.addEventListener('click', () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.focusedClusterEventIds = null;
    render();
  });

  els.mapDateToggle?.addEventListener('click', () => {
    setMapDateOpen(!state.mapDateOpen);
  });

  els.mapFilterToggle?.addEventListener('click', () => {
    setMapFilterPanelOpen(!state.mapFilterPanelOpen);
  });

  els.mapFilterClose?.addEventListener('click', () => {
    setMapFilterPanelOpen(false);
  });

  els.clearFilters?.addEventListener('click', () => {
    state.search = '';
    state.selectedTypes.clear();
    state.selectedAreas.clear();
    state.selectedTicketKinds.clear();
    state.onlyFavorites = false;
    state.focusedClusterEventIds = null;
    if (els.search) els.search.value = '';
    setMenuOpen('type', false);
    setMenuOpen('area', false);
    setMenuOpen('ticket', false);
    render({ updateUrl: true });
  });

  els.activeFilters?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-filter]');
    if (!button) return;
    removeFilter(button.dataset.removeFilter, button.dataset.value || '');
    state.focusedClusterEventIds = null;
    render({ updateUrl: button.dataset.removeFilter !== 'favorites' });
  });

  els.viewTabs.forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.viewTab === 'map' ? 'map' : 'agenda';
      if (state.view !== 'map') {
        setMapDateOpen(false, { restoreFocus: false });
        setMapFilterPanelOpen(false, { restoreFocus: false });
        setSearchOpen(Boolean(state.search), { focus: false });
      }
      if (state.view === 'map') requestLocationOnce();
      render({ scrollToAgenda: true, updateUrl: true });
    });
  });

  els.mapLocate?.addEventListener('click', () => {
    if (state.userLocation && state.map) {
      state.map.setView([state.userLocation.lat, state.userLocation.lng], userLocationZoom);
      return;
    }
    requestLocation({ centerOnSuccess: true, force: true });
  });

  els.locationNote?.addEventListener('click', () => {
    requestLocation({ centerOnSuccess: true, force: true });
  });

  els.mapSheetToggle?.addEventListener('click', () => {
    if (suppressMapSheetClick) {
      suppressMapSheetClick = false;
      return;
    }
    state.sheetState = state.sheetState === 'expanded' ? 'collapsed' : 'expanded';
    renderMapSheet(getFilteredEvents());
  });

  els.mapSheetOpen?.addEventListener('click', () => {
    state.sheetState = 'collapsed';
    renderMapSheet(getFilteredEvents());
  });

  bindMapSheetGestures();

  window.addEventListener('popstate', () => {
    applyInitialUrlState();
    if (state.view === 'map') requestLocationOnce();
    render();
  });

  els.agenda?.addEventListener('click', (event) => {
    const communityCta = event.target.closest('[data-fiestas-community-cta]');
    if (communityCta && communityCta.dataset.ctaMode !== 'community') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('fiestas:pwa-install-request', {
        detail: { mode: communityCta.dataset.ctaMode }
      }));
      return;
    }
    const activityLink = event.target.closest('a.fiestas-event-link');
    if (activityLink) {
      const card = activityLink.closest('[data-fiestas-card]');
      trackActivityOpened(card?.dataset.fiestasCard);
      return;
    }
    const saveButton = event.target.closest('[data-fiestas-save]');
    if (!saveButton) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(saveButton.dataset.eventId);
  });

  els.agenda?.addEventListener('keydown', (event) => {
    const communityCta = event.target.closest('[data-fiestas-community-cta]');
    if (!communityCta || communityCta.dataset.ctaMode === 'community' || event.key !== ' ') return;
    event.preventDefault();
    communityCta.click();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-fiestas-map-date-toggle]') && !event.target.closest('#fiestas-date-panel')) {
      setMapDateOpen(false, { restoreFocus: false });
    }
    if (!event.target.closest('[data-fiestas-map-filter-toggle]') && !event.target.closest('[data-fiestas-filter-region]')) {
      setMapFilterPanelOpen(false, { restoreFocus: false });
    }
    if (!event.target.closest('.fiestas-type-menu') && !event.target.closest('[data-fiestas-filter-backdrop]')) {
      setMenuOpen('area', false);
      setMenuOpen('type', false);
      setMenuOpen('ticket', false);
    }
  });

  document.addEventListener('keydown', handleOverlayKeydown);
}

function trackCommittedSearch() {
  const query = normalizeText(els.search?.value.trim() || '');
  if (!query) {
    lastTrackedSearchKey = '';
    return;
  }
  const resultCount = getFilteredEvents().length;
  const searchKey = `${query}:${resultCount}`;
  if (searchKey === lastTrackedSearchKey) return;
  lastTrackedSearchKey = searchKey;
  trackSearchResults(resultCount);
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

  if (options.updateUrl && !isApplyingUrlState) updateUrlFromState();

  if (state.view === 'map') {
    els.agenda.hidden = true;
    els.mapView.hidden = false;
    renderMap(filtered);
  } else {
    els.mapView.hidden = true;
    els.agenda.hidden = false;
    renderAgenda(filtered);
  }

  updateScrollHeader();

  if (options.scrollToAgenda) {
    document.querySelector('.fiestas-screen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setupScrollHeader() {
  if (!els.scrollHeader) return;
  const scheduleUpdate = () => {
    if (scrollHeaderFrame) return;
    scrollHeaderFrame = window.requestAnimationFrame(() => {
      scrollHeaderFrame = null;
      updateScrollHeader();
    });
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  updateScrollHeader();
}

function updateScrollHeader() {
  if (!els.scrollHeader) return;
  const sections = [...(els.agenda?.querySelectorAll('.fiestas-day') || [])];
  const visible = state.view === 'agenda'
    && sections.length > 0
    && (window.scrollY || document.documentElement.scrollTop || 0) > Math.max(180, window.innerHeight * 0.2);

  els.scrollHeader.classList.toggle('is-visible', visible);
  els.scrollHeader.setAttribute('aria-hidden', String(!visible));
  els.scrollHeader.inert = !visible;
  if (!visible || !els.scrollHeaderDay) return;

  const headerOffset = els.scrollHeader.getBoundingClientRect().height + 24;
  const passedSections = sections.filter((section) => section.getBoundingClientRect().top <= headerOffset);
  const activeSection = passedSections[passedSections.length - 1] || sections[0];
  const label = activeSection.querySelector('.fiestas-day-title')?.textContent?.trim() || 'Agenda de fiestas';
  els.scrollHeaderDay.textContent = label;
}

function renderShellState(filtered) {
  els.app?.classList.toggle('is-map-mode', state.view === 'map');
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
  const mapMode = state.view === 'map';
  const activeFilterCount = getActiveFilterCount();
  els.app?.classList.toggle('is-map-date-open', mapMode && state.mapDateOpen);
  els.app?.classList.toggle('is-map-filters-open', mapMode && state.mapFilterPanelOpen);
  els.mapDateLabel && (els.mapDateLabel.textContent = compactDateLabel(state.selectedDate));
  els.mapDateToggle?.setAttribute('aria-expanded', String(state.mapDateOpen));
  els.mapFilterToggle?.setAttribute('aria-expanded', String(state.mapFilterPanelOpen));
  els.mapFilterToggle?.classList.toggle('is-active', activeFilterCount > 0);
  els.mapFilterToggle?.setAttribute('aria-label', activeFilterCount ? `Abrir filtros. ${activeFilterCount} activos` : 'Abrir filtros');
  if (els.mapFilterCount) {
    els.mapFilterCount.hidden = activeFilterCount === 0;
    els.mapFilterCount.textContent = String(activeFilterCount);
  }
  if (els.datePanel) els.datePanel.setAttribute('aria-hidden', String(mapMode && !state.mapDateOpen));
  if (els.filterRegion) {
    const dialogOpen = mapMode && state.mapFilterPanelOpen;
    els.filterRegion.setAttribute('aria-hidden', String(mapMode && !dialogOpen));
    if (dialogOpen) {
      els.filterRegion.setAttribute('role', 'dialog');
      els.filterRegion.setAttribute('aria-modal', 'true');
    } else {
      els.filterRegion.removeAttribute('role');
      els.filterRegion.removeAttribute('aria-modal');
    }
  }
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

  const groups = state.selectedDate === 'all' ? groupByDay(events) : [[state.selectedDate, events]];
  let renderedEventCount = 0;
  groups.forEach(([date, dayEvents]) => {
    const section = document.createElement('section');
    section.className = 'fiestas-day';
    section.classList.toggle('is-all-days', state.selectedDate === 'all');
    section.id = `fiestas-day-${date}`;

    const header = document.createElement('div');
    header.className = 'fiestas-day-head';
    const dayCountLabel = `${dayEvents.length} ${dayEvents.length === 1 ? 'actividad' : 'actividades'}`;
    header.innerHTML = `
      <h2 class="fiestas-day-title">${escapeHtml(labelForDate(date))}</h2>
      <span>${dayCountLabel}</span>
    `;
    section.append(header);

    const list = document.createElement('div');
    list.className = 'fiestas-event-list';
    dayEvents.forEach((event) => {
      list.append(eventCard(event));
      renderedEventCount += 1;
      if (renderedEventCount === COMMUNITY_PLANS_INSERT_AFTER) list.append(communityPlansCard());
    });
    section.append(list);
    els.agenda.append(section);
  });
}

function communityPlansCard() {
  const card = document.createElement('a');
  card.className = 'fiestas-community-plans-cta';
  card.dataset.fiestasCommunityCta = 'true';
  updateCommunityPlansCard(card);
  return card;
}

function updateCommunityPlansCard(card) {
  const mode = state.communityCtaMode;
  const communityHref = els.app?.dataset.communityPlansHref || '/planes/';
  const isCommunity = mode === 'community';
  const isIosHelp = mode === 'ios-help';

  card.classList.toggle('is-install', !isCommunity);
  card.dataset.ctaMode = mode;
  card.href = isCommunity ? communityHref : '#fiestas-pwa-install';
  if (isCommunity) {
    card.removeAttribute('role');
    card.removeAttribute('aria-label');
  } else {
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', isIosHelp ? 'Ver cómo añadir la agenda a la pantalla de inicio' : 'Añadir la agenda a la pantalla de inicio');
  }
  card.innerHTML = isCommunity ? `
    <i class="fiestas-community-plans-cta-icon fa-solid fa-people-group" aria-hidden="true"></i>
    <span>
      <strong>Descubre los planes vecinales</strong>
      <small>Creados por vecinos para disfrutar las fiestas.</small>
    </span>
    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
  ` : `
    <i class="fiestas-community-plans-cta-icon fa-solid fa-mobile-screen-button" aria-hidden="true"></i>
    <span>
      <strong>Añadir a pantalla de inicio</strong>
      <small>${isIosHelp ? 'Consulta cómo instalarla en Safari.' : 'Consúltalo cuando lo necesites.'}</small>
    </span>
    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
  `;
}

function setupCommunityCtaPwa() {
  window.addEventListener('fiestas:pwa-availability', (event) => {
    state.communityCtaMode = getCommunityCtaMode(event.detail);
    document.querySelectorAll('[data-fiestas-community-cta]').forEach(updateCommunityPlansCard);
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
  const typeClass = typeColorClass(event.type);
  const artMarkup = event.image
    ? `<img class="fiestas-event-image" src="${escapeHtml(event.image)}" alt="" loading="lazy" decoding="async">`
    : `<i class="fa-solid ${escapeHtml(event.icon || iconForType(event.type))}"></i>`;
  link.href = event.urlPath;
  link.innerHTML = `
    <span class="fiestas-event-time">${timeMarkup(event)}</span>
    <span class="fiestas-event-art ${typeClass}${event.image ? ' has-image' : ''}" aria-hidden="true">${artMarkup}</span>
    <span class="fiestas-event-copy">
      <span class="fiestas-event-title">${escapeHtml(event.title || 'Actividad sin título')}</span>
      <span class="fiestas-event-place"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span class="fiestas-event-place-text">${escapeHtml(place)}</span></span>
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

  const moreOptions = document.createElement('button');
  moreOptions.className = 'fiestas-more-options';
  moreOptions.type = 'button';
  moreOptions.dataset.fiestasMoreOptions = 'true';
  moreOptions.dataset.eventId = event.id;
  moreOptions.setAttribute('aria-label', 'Más opciones');
  moreOptions.setAttribute('aria-haspopup', 'dialog');
  moreOptions.innerHTML = '<i class="fa-solid fa-ellipsis" aria-hidden="true"></i>';

  article.append(link, save, moreOptions);
  return article;
}

async function renderMap(events) {
  if (state.view === 'map' && !state.map) trackMapOpened();
  const withCoordinates = events.filter((event) => hasCoordinates(event.coordinates));
  state.currentMapEvents = withCoordinates;
  if (state.selectedEventId && !events.some((event) => event.id === state.selectedEventId)) state.selectedEventId = null;
  if (!els.mapCanvas) return;
  const leaflet = await ensureLeaflet();
  if (!leaflet) {
    state.mapLoadError = true;
    showMapEmpty('No se pudo cargar el mapa. Puedes seguir consultando las actividades en la lista inferior.');
    renderMapSheet(events);
    return;
  }
  state.mapLoadError = false;
  if (!withCoordinates.length) {
    const message = hasActiveFilters()
      ? 'No hay actividades con mapa para esos filtros.'
      : 'No hay actividades con mapa para esta fecha.';
    showMapEmpty(message);
  } else {
    els.mapEmpty.hidden = true;
  }

  if (!state.map) {
    state.map = leaflet.map(els.mapCanvas, { maxZoom: 19, scrollWheelZoom: true }).setView(valladolidCenter, 14);
    state.tileLayer = createCartoLayer(leaflet).addTo(state.map);
    state.tileLayer.on('tileerror', () => {
      showMapEmpty('El mapa tiene problemas de conexión. Puedes seguir consultando las actividades en la lista inferior.');
    });
    state.markers = leaflet.layerGroup().addTo(state.map);
    state.map.on('zoomend moveend', () => renderMapMarkers(state.currentMapEvents, leaflet));
    document.addEventListener('aldeapucela:themechange', () => updateMapTheme(leaflet));
  }

  renderMapMarkers(withCoordinates, leaflet);
  renderUserMarker(leaflet);
  renderMapSheet(events);

  window.requestAnimationFrame(() => {
    state.map.invalidateSize();
    if (state.preferredMapCenter) {
      state.map.setView(state.preferredMapCenter.latLng, state.preferredMapCenter.zoom);
      state.preferredMapCenter = null;
    } else if (state.userLocation && state.locationStatus === 'granted') {
      state.map.setView([state.userLocation.lat, state.userLocation.lng], userLocationZoom);
    } else {
      state.map.setView(valladolidCenter, 14);
    }
  });
}

function renderMapMarkers(events, leaflet) {
  if (!state.markers || !state.map) return;
  state.markers.clearLayers();
  const groups = clusterEvents(events);
  groups.forEach((group) => {
    if (group.events.length > 1) {
      const clusterType = sharedEventType(group.events);
      const clusterTypeClass = clusterType ? ` ${typeColorClass(clusterType)}` : '';
      const marker = leaflet.marker(group.center, {
        icon: leaflet.divIcon({
          className: `fiestas-map-cluster${clusterTypeClass}`,
          html: `<button type="button" aria-label="${group.events.length} actividades en esta zona">${group.events.length}</button>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        })
      });
      marker.on('click', () => {
        group.events.forEach((event) => trackMapMarkerSelected(event.id));
        if (canZoomIn()) {
          const nextZoom = Math.min(state.map.getZoom() + 2, state.map.getMaxZoom());
          if (hasSameCoordinates(group.events)) {
            state.map.setView(group.center, nextZoom);
            return;
          }
          const bounds = leaflet.latLngBounds(group.events.map((event) => [event.coordinates.lat, event.coordinates.lng]));
          state.map.fitBounds(bounds, { padding: [44, 44], maxZoom: nextZoom });
          return;
        }

        showClusterEvents(group.events);
      });
      marker.addTo(state.markers);
      return;
    }

    const event = group.events[0];
    const selected = event.id === state.selectedEventId;
    const marker = leaflet.marker([event.coordinates.lat, event.coordinates.lng], {
      title: `${event.title}. ${event.type || 'Actividad'}`,
      alt: `${event.title}. ${event.type || 'Actividad'}`,
      icon: leaflet.divIcon({
        className: `fiestas-map-marker ${typeColorClass(event.type)}${selected ? ' is-selected' : ''}`,
        html: `<button type="button" aria-label="${escapeHtml(event.title)}. ${escapeHtml(event.type || 'Actividad')}"><i class="fa-solid ${escapeHtml(event.icon || iconForType(event.type))}" aria-hidden="true"></i></button>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      })
    });
    marker.bindPopup(mapPopup(event));
    marker.on('click', () => {
      trackMapMarkerSelected(event.id);
      state.selectedEventId = event.id;
      state.focusedClusterEventIds = null;
      state.sheetState = 'expanded';
      renderMapMarkers(events, leaflet);
      renderMapSheet(getFilteredEvents(), { scrollToSelected: true });
    });
    marker.addTo(state.markers);
  });
}

function sharedEventType(events) {
  const type = events[0]?.type || 'Evento';
  return events.every((event) => (event.type || 'Evento') === type) ? type : null;
}

function hasSameCoordinates(events) {
  if (events.length < 2) return false;
  const first = events[0].coordinates;
  return events.every((event) => {
    const coordinates = event.coordinates;
    return coordinates && Math.abs(coordinates.lat - first.lat) < 0.00001 && Math.abs(coordinates.lng - first.lng) < 0.00001;
  });
}

function canZoomIn() {
  if (!state.map) return false;
  return state.map.getZoom() < state.map.getMaxZoom();
}

function showClusterEvents(events) {
  state.focusedClusterEventIds = new Set(events.map((event) => event.id));
  state.selectedEventId = events[0]?.id || null;
  state.sheetState = 'expanded';
  renderMapSheet(getFilteredEvents(), { scrollToSelected: true });
}

function clusterEvents(events) {
  if (!state.map) return events.map((event) => ({ center: [event.coordinates.lat, event.coordinates.lng], events: [event] }));
  const threshold = state.map.getZoom() >= 17 ? 18 : state.map.getZoom() >= 15 ? 30 : 46;
  const groups = [];
  events.forEach((event) => {
    const point = state.map.latLngToLayerPoint([event.coordinates.lat, event.coordinates.lng]);
    const group = groups.find((item) => item.point.distanceTo(point) < threshold);
    if (group) {
      group.events.push(event);
      group.point = group.point.add(point).divideBy(2);
      group.center = [
        group.events.reduce((sum, item) => sum + item.coordinates.lat, 0) / group.events.length,
        group.events.reduce((sum, item) => sum + item.coordinates.lng, 0) / group.events.length
      ];
    } else {
      groups.push({ point, center: [event.coordinates.lat, event.coordinates.lng], events: [event] });
    }
  });
  return groups;
}

function mapPopup(event) {
  return `
    <div class="fiestas-map-popup">
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(timeRange(event))}</span>
      <span>${escapeHtml(event.location || 'Lugar por confirmar')}</span>
      <a href="${escapeHtml(event.urlPath)}">Ver actividad</a>
    </div>
  `;
}

function renderUserMarker(leaflet) {
  if (!state.map) return;
  if (state.userMarker) {
    state.userMarker.remove();
    state.userMarker = null;
  }
  if (!state.userLocation || state.locationStatus !== 'granted') return;
  state.userMarker = leaflet.circleMarker([state.userLocation.lat, state.userLocation.lng], {
    radius: 8,
    color: '#0f9f8d',
    fillColor: '#17b8a4',
    fillOpacity: 0.85,
    weight: 3
  }).addTo(state.map);
  state.userMarker.bindPopup('Tu ubicación aproximada');
}

function renderMapSheet(events, options = {}) {
  if (!els.mapSheet) return;
  const withCoordinates = events.filter((event) => hasCoordinates(event.coordinates));
  const sheetEvents = getMapSheetEvents(events);
  const sorted = sortMapEvents(sheetEvents);
  const context = state.focusedClusterEventIds
    ? 'Actividades en este punto'
    : state.locationStatus === 'granted' ? 'Cerca de ti' : state.selectedDate === 'all' ? 'Actividades' : 'Actividades del día';
  const count = state.focusedClusterEventIds ? sorted.length : withCoordinates.length;
  const countText = `${count} ${count === 1 ? 'actividad' : 'actividades'} · ${compactDateLabel(state.selectedDate)}`;

  els.mapSheet.classList.toggle('is-expanded', state.sheetState === 'expanded');
  els.mapSheet.classList.toggle('is-collapsed', state.sheetState === 'collapsed');
  els.mapSheet.classList.toggle('is-hidden', state.sheetState === 'hidden');
  if (els.mapSheetOpen) els.mapSheetOpen.hidden = state.sheetState !== 'hidden';
  if (els.mapSheetToggle) els.mapSheetToggle.setAttribute('aria-expanded', String(state.sheetState === 'expanded'));
  if (els.mapSheetTitle) els.mapSheetTitle.textContent = context;
  if (els.mapSheetCount) els.mapSheetCount.textContent = countText;
  if (els.mapSheetTabLabel) els.mapSheetTabLabel.textContent = countText;
  renderLocationStatus();

  els.mapSheetPreview?.replaceChildren();
  els.mapSheetList?.replaceChildren();

  if (!sheetEvents.length) {
    const message = hasActiveFilters()
      ? 'No hay actividades con esos filtros.'
      : 'No hay actividades para el día seleccionado.';
    els.mapSheetPreview?.append(emptyState(message, hasActiveFilters()));
    return;
  }

  if (!withCoordinates.length) {
    els.mapSheetPreview?.append(emptyState('Las actividades de esta selección no tienen coordenadas.', hasActiveFilters()));
    sorted.slice(0, 8).forEach((event) => els.mapSheetList?.append(mapSheetItem(event)));
    return;
  }

  if (state.focusedClusterEventIds) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'fiestas-map-cluster-reset';
    reset.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Ver todas las actividades</span>';
    reset.addEventListener('click', () => {
      state.focusedClusterEventIds = null;
      state.selectedEventId = null;
      renderMapSheet(getFilteredEvents());
    });
    els.mapSheetList?.append(reset);
  }

  sorted.slice(0, 3).forEach((event) => els.mapSheetPreview?.append(mapSheetItem(event, true)));
  sorted.forEach((event) => els.mapSheetList?.append(mapSheetItem(event)));
  if (options.scrollToSelected) scrollSelectedMapResult();
}

function getMapSheetEvents(events) {
  if (!state.focusedClusterEventIds) return events;
  const focused = events.filter((event) => state.focusedClusterEventIds.has(event.id));
  return focused.length ? focused : events;
}

function renderLocationStatus() {
  if (els.mapLocate) {
    const labels = {
      idle: 'Centrar en mi ubicación',
      pending: 'Localizando ubicación',
      granted: 'Centrar en mi ubicación',
      denied: 'Solicitar permiso de ubicación',
      blocked: 'Activar ubicación en los ajustes',
      unavailable: 'Volver a solicitar ubicación'
    };
    const label = labels[state.locationStatus] || 'Centrar en mi ubicación';
    els.mapLocate.setAttribute('aria-label', label);
    els.mapLocate.title = label;
  }
  if (!els.locationNote) return;
  const canRequestLocation = !['pending', 'granted'].includes(state.locationStatus);
  els.locationNote.hidden = !canRequestLocation || state.sheetState === 'hidden' || Boolean(state.focusedClusterEventIds);
  els.locationNote.disabled = !canRequestLocation;
}

function mapSheetItem(event, compact = false) {
  const article = document.createElement('article');
  const typeClass = typeColorClass(event.type);
  const selected = event.id === state.selectedEventId && !state.focusedClusterEventIds;
  article.className = `fiestas-map-result ${typeClass}${compact ? ' is-compact' : ''}`;
  article.dataset.mapResultId = event.id;
  article.classList.toggle('is-selected', selected);
  if (selected) article.setAttribute('aria-current', 'true');

  const distance = distanceLabel(event);
  const eventDateTime = `${compactDateLabel(event.date)} ${event.startTime || 'Hora por confirmar'}`;
  const title = event.title || 'Actividad sin título';
  const place = event.location || 'Lugar por confirmar';
  const type = event.type || 'Evento';
  const distanceMarkup = distance
    ? `<span class="fiestas-map-result-distance"><i class="fa-solid fa-person-walking" aria-hidden="true"></i>${escapeHtml(distance)}</span>`
    : '';

  const link = document.createElement('a');
  link.href = event.urlPath;
  link.innerHTML = `
    <span class="fiestas-map-result-icon ${typeClass}" aria-hidden="true"><i class="fa-solid ${escapeHtml(event.icon || iconForType(event.type))}"></i></span>
    <span class="fiestas-map-result-copy">
      <span class="fiestas-map-result-title-line">
        <span class="fiestas-map-result-title">${escapeHtml(title)}</span>
        <span class="fiestas-map-result-type">${escapeHtml(type)}</span>
      </span>
      <span class="fiestas-map-result-meta"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(place)}</span>
      <span class="fiestas-map-result-date">${escapeHtml(eventDateTime)}</span>
      ${distanceMarkup}
    </span>
  `;

  const locate = document.createElement('a');
  locate.href = event.urlPath;
  locate.className = 'fiestas-map-result-focus';
  locate.setAttribute('aria-label', `Ver ${title}`);
  locate.innerHTML = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';

  article.append(link, locate);
  return article;
}

function scrollSelectedMapResult() {
  if (!state.selectedEventId || !els.mapSheetList) return;
  window.requestAnimationFrame(() => {
    const selected = els.mapSheetList.querySelector(`[data-map-result-id="${escapeCssIdentifier(state.selectedEventId)}"]`);
    selected?.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
}

function escapeCssIdentifier(value = '') {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function sortMapEvents(events) {
  if (state.locationStatus !== 'granted' || !state.userLocation) return [...events].sort(compareEvents);
  return [...events].sort((a, b) => {
    const aDistance = distanceToEvent(a);
    const bDistance = distanceToEvent(b);
    const aNear = aDistance <= nearbyRadiusMeters;
    const bNear = bDistance <= nearbyRadiusMeters;
    if (aNear !== bNear) return aNear ? -1 : 1;
    if (Number.isFinite(aDistance) && Number.isFinite(bDistance) && aDistance !== bDistance) return aDistance - bDistance;
    if (Number.isFinite(aDistance) !== Number.isFinite(bDistance)) return Number.isFinite(aDistance) ? -1 : 1;
    return compareEvents(a, b);
  });
}

function distanceToEvent(event) {
  if (!state.userLocation || !hasCoordinates(event.coordinates)) return Infinity;
  return haversineMeters(state.userLocation, { lat: event.coordinates.lat, lng: event.coordinates.lng });
}

function distanceLabel(event) {
  if (state.locationStatus !== 'granted' || !state.userLocation || !hasCoordinates(event.coordinates)) return '';
  const meters = distanceToEvent(event);
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace('.', ',')} km`;
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function requestLocationOnce() {
  if (state.hasRequestedLocation || state.locationStatus === 'pending' || state.locationStatus === 'granted') return;
  requestLocation({ centerOnSuccess: true });
}

function requestLocation(options = {}) {
  if (!navigator.geolocation) {
    state.locationStatus = 'unavailable';
    renderMapSheet(getFilteredEvents());
    return;
  }
  if (state.locationStatus === 'pending') return;
  state.hasRequestedLocation = true;
  state.locationStatus = 'pending';
  renderMapSheet(getFilteredEvents());
  navigator.geolocation.getCurrentPosition((position) => {
    state.locationStatus = 'granted';
    state.userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    if (options.centerOnSuccess) state.preferredMapCenter = { latLng: [state.userLocation.lat, state.userLocation.lng], zoom: userLocationZoom };
    renderMap(getFilteredEvents());
  }, (error) => {
    state.userLocation = null;
    state.locationStatus = error?.code === error?.PERMISSION_DENIED
      ? (state.hasRequestedLocation && options.force ? 'blocked' : 'denied')
      : 'unavailable';
    renderMap(getFilteredEvents());
  }, {
    enableHighAccuracy: false,
    maximumAge: 5 * 60 * 1000,
    timeout: 9000
  });
}

function bindMapSheetGestures() {
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

  const resetDrag = () => {
    tracking = false;
    dragged = false;
    pointerId = null;
    els.mapSheet.classList.remove('is-dragging');
    els.mapSheet.style.removeProperty('transform');
  };

  els.mapSheetToggle.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    tracking = true;
    dragged = false;
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
    const nextTransformY = Math.max(-80, Math.min(els.mapSheet.offsetHeight, startTransformY + delta));
    els.mapSheet.style.transform = `translateY(${nextTransformY}px)`;
  });

  const finishDrag = (event, cancelled = false) => {
    if (!tracking || event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    const didDrag = dragged && Math.abs(delta) >= 28;
    resetDrag();
    els.mapSheetToggle.releasePointerCapture?.(event.pointerId);
    if (cancelled || !didDrag) return;

    suppressMapSheetClick = true;
    window.setTimeout(() => {
      suppressMapSheetClick = false;
    }, 0);
    if (delta < -28) state.sheetState = 'expanded';
    else if (delta > 44 && state.sheetState === 'expanded') state.sheetState = 'collapsed';
    else if (delta > 44) state.sheetState = 'hidden';
    renderMapSheet(getFilteredEvents());
  };

  els.mapSheetToggle.addEventListener('pointerup', (event) => finishDrag(event));
  els.mapSheetToggle.addEventListener('pointercancel', (event) => finishDrag(event, true));
  els.mapSheetToggle.addEventListener('lostpointercapture', (event) => finishDrag(event, true));
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
  const options = els.typeList.querySelector('.fiestas-type-options');
  if (!options) return;
  const current = new Set([...options.querySelectorAll('input[data-type]')].map((input) => input.dataset.type));
  if (current.size === state.types.length) return;
  options.replaceChildren(...state.types.map((type) => checkboxOption(type, 'type')));
}

function renderAreaButtons() {
  if (!els.areaList) return;
  const options = els.areaList.querySelector('.fiestas-type-options');
  if (!options) return;
  options.replaceChildren(...state.areas.map((area) => checkboxOption(area, 'area')));
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
  if (els.areaLabel) els.areaLabel.textContent = setLabel(state.selectedAreas, 'Zonas', 'zona', 'zonas');
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
  if (els.filterSummary) els.filterSummary.hidden = !chips.length;
  if (els.filterCount) els.filterCount.textContent = chips.length ? `${count} ${count === 1 ? 'resultado' : 'resultados'}` : '';
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
  if (open) {
    Object.entries(menus).forEach(([menuKind, [menuList, menuToggle]]) => {
      if (menuKind === kind || !menuList || !menuToggle) return;
      menuList.hidden = true;
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  }
  list.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  updateFilterModalState();
}

function setMapDateOpen(open, options = {}) {
  const isOpen = Boolean(open);
  if (isOpen && state.view !== 'map') return;
  if (isOpen && state.mapFilterPanelOpen) setMapFilterPanelOpen(false, { restoreFocus: false });
  state.mapDateOpen = isOpen;
  renderShellState(getFilteredEvents());

  if (isOpen) {
    window.requestAnimationFrame(() => {
      const dateButton = [...(els.dateStrip?.querySelectorAll('[data-date]') || [])]
        .find((button) => button.dataset.date === state.selectedDate);
      dateButton?.focus();
    });
    return;
  }

  if (options.restoreFocus !== false) {
    window.requestAnimationFrame(() => els.mapDateToggle?.focus());
  }
}

function setMapFilterPanelOpen(open, options = {}) {
  const isOpen = Boolean(open);
  if (isOpen && state.view !== 'map') return;
  if (isOpen && state.mapDateOpen) setMapDateOpen(false, { restoreFocus: false });

  if (isOpen) {
    const activeElement = document.activeElement;
    filterReturnFocus = activeElement instanceof HTMLElement
      && activeElement !== document.body
      && activeElement !== document.documentElement
      ? activeElement
      : els.mapFilterToggle;
    state.mapFilterPanelOpen = true;
    setMenuOpen('type', false);
    setMenuOpen('area', false);
    setMenuOpen('ticket', false);
    setSearchOpen(true, { focus: false });
    renderShellState(getFilteredEvents());
    updateFilterModalState();
    window.requestAnimationFrame(() => els.search?.focus());
    return;
  }

  state.mapFilterPanelOpen = false;
  setMenuOpen('type', false);
  setMenuOpen('area', false);
  setMenuOpen('ticket', false);
  if (state.view === 'map') setSearchOpen(false, { focus: false });
  renderShellState(getFilteredEvents());
  updateFilterModalState();
  if (options.restoreFocus !== false) {
    filterReturnFocus?.focus();
  }
  filterReturnFocus = null;
}

function getActiveFilterCount() {
  return (state.search ? 1 : 0)
    + state.selectedTypes.size
    + state.selectedAreas.size
    + state.selectedTicketKinds.size
    + (state.onlyFavorites ? 1 : 0);
}

function compactDateLabel(date) {
  if (date === 'all') return 'Todos';
  if (!date) return 'Fecha';
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return 'Fecha';
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(value).replace('.', '');
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(value);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}`;
}

function handleOverlayKeydown(event) {
  if (event.key === 'Escape') {
    if (state.mapFilterPanelOpen) {
      event.preventDefault();
      setMapFilterPanelOpen(false);
      return;
    }
    if (state.mapDateOpen) {
      event.preventDefault();
      setMapDateOpen(false);
      return;
    }
    setMenuOpen('type', false);
    setMenuOpen('area', false);
    setMenuOpen('ticket', false);
    return;
  }

  if (!state.mapFilterPanelOpen || event.key !== 'Tab' || !els.filterRegion) return;
  const focusable = [...els.filterRegion.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setSearchOpen(open, options = {}) {
  if (!els.searchPanel || !els.searchToggle) return;
  const isOpen = Boolean(open);
  els.searchPanel.hidden = !isOpen;
  [els.searchToggle, els.scrollSearchToggle].forEach((toggle) => {
    toggle?.setAttribute('aria-expanded', String(isOpen));
    toggle?.setAttribute('aria-label', isOpen ? 'Ocultar buscador' : 'Abrir buscador');
    toggle?.classList.toggle('is-active', isOpen);
  });
  if (isOpen && options.focus !== false) els.search?.focus();
}

function getInitialDate(dates) {
  if (!dates.length) return 'all';
  const today = localDateKey(new Date());
  return dates.some((date) => date.date === today) ? today : 'all';
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
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return state.dates.find((day) => day.date === date)?.label || date;
  const [, year, month, day] = match;
  const dateValue = new Date(Number(year), Number(month) - 1, Number(day));
  const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  return `${weekdays[dateValue.getDay()]} ${dateValue.getDate()} de ${months[dateValue.getMonth()]}`;
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
  if (!state.selectedTicketKinds.size) return 'Precio';
  if (state.selectedTicketKinds.size === 1) return ticketKindLabel([...state.selectedTicketKinds][0]);
  return `${state.selectedTicketKinds.size} precios`;
}

function toggleFavorite(id) {
  if (!id) return;
  const saved = !state.favorites.has(id);
  if (saved) state.favorites.add(id);
  else state.favorites.delete(id);
  writeFavoriteIds([...state.favorites]);
  trackFavoriteChanged(id, saved);
  if (els.agenda) render();
  updateDetailFavorite();
}

function readFavorites() {
  return readFavoriteIds();
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

function timeMarkup(event) {
  if (!event.startTime) return '<span>Hora por confirmar</span>';
  if (!event.endTime) return `<span>${escapeHtml(event.startTime)}</span>`;
  return `<span>${escapeHtml(event.startTime)}</span><span>${escapeHtml(event.endTime)}</span>`;
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
  isApplyingUrlState = true;
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const eventId = params.get('event');
  state.view = isMapPath() || view === 'map' ? 'map' : 'agenda';
  state.selectedDate = getUrlDate(params) || initialDate || getInitialDate(state.dates);
  state.search = normalizeText(params.get('q') || '');
  state.selectedTypes = getUrlSet(params, 'type', state.types);
  state.selectedAreas = getUrlSet(params, 'area', state.areas);
  state.selectedTicketKinds = getUrlSet(params, 'ticket', ['free', 'paid', 'registration']);
  state.mapDateOpen = false;
  state.mapFilterPanelOpen = false;
  if (els.search) els.search.value = params.get('q') || '';
  setSearchOpen(Boolean(state.search));
  if (eventId) {
    const event = state.events.find((item) => item.id === eventId);
    if (event?.date) {
      state.selectedDate = event.date;
      state.selectedEventId = event.id;
      if (hasCoordinates(event.coordinates)) {
        state.preferredMapCenter = { latLng: [event.coordinates.lat, event.coordinates.lng], zoom: 17 };
      }
    }
  }
  setMenuOpen('type', false);
  setMenuOpen('area', false);
  setMenuOpen('ticket', false);
  isApplyingUrlState = false;
}

function getUrlDate(params) {
  const date = params.get('date');
  if (!date) return null;
  if (date === 'all') return 'all';
  return state.dates.some((day) => day.date === date) ? date : null;
}

function getUrlSet(params, key, allowedValues) {
  const allowed = new Set(allowedValues);
  const values = params.getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value && allowed.has(value));
  return new Set(values);
}

function updateUrlFromState() {
  const params = new URLSearchParams(window.location.search);
  defaultQueryKeys.forEach((key) => params.delete(key));

  if (state.selectedDate && state.selectedDate !== initialDate) params.set('date', state.selectedDate);
  if (els.search?.value.trim()) params.set('q', els.search.value.trim());
  [...state.selectedTypes].sort((a, b) => collator.compare(a, b)).forEach((type) => params.append('type', type));
  [...state.selectedAreas].sort((a, b) => collator.compare(a, b)).forEach((area) => params.append('area', area));
  [...state.selectedTicketKinds].sort().forEach((ticket) => params.append('ticket', ticket));

  const query = params.toString();
  const nextPath = state.view === 'map' ? '/mapa/' : '/';
  const nextUrl = `${nextPath}${query ? `?${query}` : ''}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history.replaceState(null, '', nextUrl);
}

function isMapPath() {
  return window.location.pathname.replace(/\/+$/, '') === '/mapa';
}

function updateFilterModalState() {
  const isOpen = state.mapFilterPanelOpen || [els.areaList, els.typeList, els.ticketList].some((list) => list && !list.hidden);
  if (isOpen) {
    ensureFilterBackdrop();
    document.body.classList.add('fiestas-filter-open');
    if (!document.body.dataset.fiestasFilterScrollLocked) {
      filterScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.dataset.fiestasFilterScrollLocked = 'true';
      document.body.style.top = `-${filterScrollY}px`;
    }
    filterBackdrop.hidden = false;
  } else {
    filterBackdrop?.setAttribute('hidden', '');
    document.body.classList.remove('fiestas-filter-open');
    if (document.body.dataset.fiestasFilterScrollLocked) {
      delete document.body.dataset.fiestasFilterScrollLocked;
      document.body.style.top = '';
      window.scrollTo(0, filterScrollY);
    }
  }
}

function ensureFilterBackdrop() {
  if (filterBackdrop) return filterBackdrop;
  filterBackdrop = document.createElement('button');
  filterBackdrop.type = 'button';
  filterBackdrop.className = 'fiestas-filter-backdrop';
  filterBackdrop.dataset.fiestasFilterBackdrop = 'true';
  filterBackdrop.setAttribute('aria-label', 'Cerrar filtros');
  filterBackdrop.hidden = true;
  filterBackdrop.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.mapFilterPanelOpen) {
      setMapFilterPanelOpen(false);
      return;
    }
    setMenuOpen('type', false);
    setMenuOpen('area', false);
    setMenuOpen('ticket', false);
  });
  document.body.append(filterBackdrop);
  return filterBackdrop;
}

function initDetailPage() {
  trackActivityViewed(els.detail.dataset.eventId);
  updateDetailFavorite({ silent: true });
  initDetailDirections();
  els.detailSave?.addEventListener('click', () => toggleFavorite(els.detail.dataset.eventId));
  els.detailActionSave?.addEventListener('click', () => toggleFavorite(els.detail.dataset.eventId));
  els.detailShare?.addEventListener('click', shareDetail);
  els.detailActionShare?.addEventListener('click', shareDetail);
  els.detailActionCalendar?.addEventListener('click', addDetailToCalendar);
  els.detailShareCopy?.addEventListener('click', copyShareFallback);
  els.detailBack?.addEventListener('click', goBackToAgenda);
  initDetailLightbox();
  document.querySelectorAll('[data-fiestas-analytics-action]').forEach((link) => {
    link.addEventListener('click', () => trackDetailExternalAction(link.dataset.fiestasAnalyticsAction));
  });
  if (els.detailMap) initDetailMap();
}

function initDetailLightbox() {
  if (!els.detailImage || !els.detailLightbox || !els.detailLightboxImage) return;

  const closeButtons = els.detailLightbox.querySelectorAll('[data-fiestas-detail-lightbox-close]');
  const openLightbox = () => {
    els.detailLightboxImage.src = els.detailImage.dataset.imageSrc || els.detailLightboxImage.src;
    els.detailLightboxImage.alt = els.detailImage.dataset.imageAlt || '';
    els.detailLightbox.hidden = false;
    document.body.classList.add('detail-lightbox-open');
    closeButtons[closeButtons.length - 1]?.focus();
  };
  const closeLightbox = () => {
    els.detailLightbox.hidden = true;
    document.body.classList.remove('detail-lightbox-open');
    els.detailImage.focus();
  };

  els.detailImage.addEventListener('click', openLightbox);
  closeButtons.forEach((button) => button.addEventListener('click', closeLightbox));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.detailLightbox.hidden) closeLightbox();
  });
}

function trackDetailExternalAction(action) {
  const activityId = els.detail?.dataset.eventId;
  if (action === 'directions') trackDirectionsOpened(activityId);
  else if (action === 'tickets') trackTicketsOpened(activityId);
  else if (action) trackExternalLinkOpened(action);
}

function initDetailDirections() {
  const link = document.querySelector('[data-fiestas-directions]');
  if (!link) return;

  const lat = Number(link.dataset.lat);
  const lng = Number(link.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const title = link.dataset.title || 'Actividad';
  const platform = getMapPlatform();
  if (platform === 'android') {
    const label = encodeURIComponent(title);
    link.href = `geo:0,0?q=${lat},${lng}(${label})`;
    link.removeAttribute('target');
    link.removeAttribute('rel');
    return;
  }

  if (platform === 'ios') {
    link.href = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }
}

function getMapPlatform() {
  const userAgent = navigator.userAgent || '';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(userAgent)) return 'ios';
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

function updateDetailFavorite(options = {}) {
  if (!els.detail) return;
  const saved = state.favorites.has(els.detail.dataset.eventId);
  document.querySelectorAll('[data-fiestas-detail-save], [data-fiestas-detail-action-save]').forEach((button) => {
    button.classList.toggle('is-active', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', saved ? 'Quitar de guardados' : 'Guardar actividad');
    button.innerHTML = `<i class="${saved ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i>${button === els.detailActionSave ? `<span>${saved ? 'Guardado' : 'Guardar'}</span>` : ''}`;
  });
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
      trackActivityShared(els.detail.dataset.eventId);
      showDetailFeedback('Actividad compartida.');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);
    trackActivityShared(els.detail.dataset.eventId);
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

async function copyShareFallback() {
  if (!els.detail) return;
  const url = els.detail.dataset.shareUrl || window.location.href;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      if (!els.detailShareInput) throw new Error('Share input unavailable');
      els.detailShareInput.focus();
      els.detailShareInput.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    }
    trackActivityShared(els.detail.dataset.eventId);
    showDetailFeedback('Enlace copiado.');
  } catch (_) {
    showDetailFeedback('No se pudo copiar el enlace.');
  }
}

async function addDetailToCalendar() {
  if (!els.detail) return;
  const data = els.detail.dataset;
  const event = {
    id: data.eventId,
    date: data.eventDate,
    dateLabel: data.eventDateLabel,
    startTime: data.eventStartTime,
    endTime: data.eventEndTime,
    title: data.eventTitle,
    location: data.eventLocation,
    description: data.eventDescription,
    summary: data.eventSummary,
    canonicalUrl: data.eventUrl
  };
  if (data.eventLat && data.eventLng) {
    event.coordinates = { lat: Number(data.eventLat), lng: Number(data.eventLng) };
  }
  if (!event.id || !event.date || !event.title) {
    showDetailFeedback('No se pudo preparar el evento para el calendario.');
    return;
  }

  const result = await shareFileOrDownload(createIcsFile([event], event.title), {
    title: event.title,
    text: 'Añade esta actividad al calendario de Fiestas Valladolid 2026'
  });
  if (result !== 'cancelled') trackPlanCalendarExported(event.id);
  if (result === 'shared' || result === 'downloaded') showDetailFeedback(result === 'shared' ? 'Actividad compartida para añadirla al calendario.' : 'Calendario descargado.');
  else showDetailFeedback('Compartición cancelada.');
}

async function shareSite() {
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Fiestas Valladolid 2026',
        text: SITE_SHARE_MESSAGE
      });
      showSiteShareFeedback('Compartido.');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }

  try {
    await copyTextToClipboard(SITE_SHARE_MESSAGE);
    showSiteShareFeedback('Mensaje y enlace copiados.');
  } catch (_) {
    showSiteShareFeedback('No se pudo copiar el mensaje. Mantén pulsado para copiarlo.', true);
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

function showSiteShareFeedback(message, isError = false) {
  if (!els.siteShareFeedback) return;
  window.clearTimeout(siteShareFeedbackTimer);
  els.siteShareFeedback.textContent = message;
  els.siteShareFeedback.classList.toggle('is-error', isError);
  els.siteShareFeedback.hidden = false;
  siteShareFeedbackTimer = window.setTimeout(() => {
    els.siteShareFeedback.hidden = true;
  }, 4000);
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
    const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const map = leaflet.map(els.detailMap, {
      scrollWheelZoom: false,
      dragging: !isTouchDevice
    }).setView([lat, lng], 16);
    const title = els.detailMap.dataset.title || 'Actividad';
    const markerIcon = leaflet.divIcon({
      className: 'fiestas-detail-map-marker',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      html: `<span class="fiestas-detail-map-marker-content"><i class="fiestas-detail-map-marker-icon fa-solid fa-location-dot" aria-hidden="true"></i><span class="fiestas-detail-map-marker-label">${escapeHtml(title)}</span></span>`
    });
    let tileLayer = createCartoLayer(leaflet).addTo(map);
    document.addEventListener('aldeapucela:themechange', () => {
      map.removeLayer(tileLayer);
      tileLayer = createCartoLayer(leaflet).addTo(map);
    });
    leaflet.marker([lat, lng], { icon: markerIcon, title }).addTo(map).bindPopup(escapeHtml(title));
    trackMapOpened();
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
    'humor-y-monologos': 'fa-masks-theater',
    otros: 'fa-star',
    penas: 'fa-people-group',
    religioso: 'fa-place-of-worship',
    talleres: 'fa-screwdriver-wrench',
    teatro: 'fa-masks-theater',
    toros: 'fa-circle-dot'
  };
  return icons[slugify(type)] || 'fa-calendar-day';
}

function typeColorClass(type = '') {
  return `fiestas-type-${slugify(type)}`;
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
