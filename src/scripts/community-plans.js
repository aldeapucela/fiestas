import { createPlan, getPlanIcon, normalizePlanIcon, readPlans } from './plan-storage.js';
import { trackPlanCreated } from './analytics.js';

const CATALOG_SCHEMA_VERSION = 1;
const FESTIVAL_ID = 'valladolid-2026';
const MAX_PLAN_NAME_LENGTH = 80;
const MAX_ACTIVITY_IDS = 200;
const MAX_JSON_BYTES = 256 * 1024;

export function setupCommunityPlansPage(rawEvents = []) {
  const page = document.querySelector('[data-community-plans-page]');
  if (!page) return;

  const events = normalizeEvents(rawEvents);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const catalog = page.querySelector('[data-community-plans-catalog]');
  let entries = [];

  const renderCatalog = () => {
    if (!catalog) return;
    catalog.replaceChildren();
    catalog.setAttribute('aria-busy', 'false');
    if (!entries.length) {
      catalog.append(createEmptyState());
      return;
    }
    const list = document.createElement('div');
    list.className = 'fiestas-community-plans-list';
    entries.forEach((entry) => list.append(createPlanCard(entry)));
    catalog.append(list);
  };

  const loadCatalog = async () => {
    const source = page.dataset.communityPlansUrl || '/data/planes.json';
    try {
      const value = await fetchJson(source);
      entries = normalizeCatalog(value).map((entry) => ({
        ...entry,
        pageUrl: `/planes/${entry.id}/`,
        summary: 'Previsualización disponible en la ficha'
      }));
      renderCatalog();
      entries = await Promise.all(entries.map((entry) => enrichEntry(entry, eventById)));
      renderCatalog();
    } catch (_) {
      renderCatalogError(catalog);
    }
  };

  page.addEventListener('click', async (event) => {
    const addLink = event.target.closest('[data-community-plan-add]');
    if (!addLink || !page.contains(addLink)) return;
    const entry = entries.find((item) => item.id === addLink.dataset.communityPlanId);
    if (!entry) return;
    if (addLink.dataset.communityPlanAdded === 'true') return;
    event.preventDefault();
    addLink.dataset.communityPlanBusy = 'true';
    addLink.setAttribute('aria-busy', 'true');
    setActionText(addLink, 'Añadiendo…', 'fa-spinner');
    try {
      const imported = await loadExportedPlan(entry.url, eventById);
      const existing = findExistingCommunityPlan(entry, imported);
      if (existing) {
        markAddedLink(addLink, existing);
        return;
      }
      const plan = createPlan(entry.name || imported.name, imported.activityIds, {
        sourcePlanId: entry.id,
        icon: imported.icon || entry.icon
      });
      trackPlanCreated('community');
      markAddedLink(addLink, plan);
    } catch (_) {
      addLink.removeAttribute('aria-busy');
      addLink.removeAttribute('data-community-plan-busy');
      setActionText(addLink, 'Añadir a mis planes', 'fa-plus');
      showLinkFeedback(addLink, 'No se ha podido cargar este plan. Puedes intentarlo de nuevo desde su ficha.');
    }
  });

  loadCatalog();
}

export function setupCommunityPlanDetailPage(rawEvents = []) {
  const page = document.querySelector('[data-community-plan-page]');
  if (!page) return;

  const events = normalizeEvents(rawEvents);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const detail = page.querySelector('[data-community-plan-detail]');
  const status = page.querySelector('[data-community-plan-detail-status]');
  const addLink = page.querySelector('[data-community-plan-add]');
  const entry = {
    id: String(page.dataset.communityPlanId || '').trim(),
    name: cleanText(page.dataset.communityPlanName, MAX_PLAN_NAME_LENGTH),
    author: cleanText(page.dataset.communityPlanAuthor, MAX_PLAN_NAME_LENGTH),
    url: safeJsonPlanUrl(page.dataset.communityPlanJsonUrl),
    icon: normalizePlanIcon(page.dataset.communityPlanIcon)
  };
  let imported = null;

  const setStatus = (message, kind = '') => {
    if (!status) return;
    status.hidden = !message;
    status.className = `fiestas-community-plan-status${kind ? ` is-${kind}` : ''}`;
    status.textContent = message;
  };

  const addToMyPlans = async () => {
    if (!imported || !addLink || addLink.dataset.communityPlanAdded === 'true') return;
    const existing = findExistingCommunityPlan(entry, imported);
    if (existing) {
      markAddedLink(addLink, existing);
      setStatus(`${existing.name} ya está disponible en Mi plan.`, 'success');
      return;
    }
    addLink.dataset.communityPlanBusy = 'true';
    addLink.setAttribute('aria-busy', 'true');
    setActionText(addLink, 'Añadiendo…', 'fa-spinner');
    try {
      const plan = createPlan(entry.name || imported.name, imported.activityIds, {
        sourcePlanId: entry.id,
        icon: imported.icon || entry.icon
      });
      trackPlanCreated('community');
      markAddedLink(addLink, plan);
      setStatus(`${plan.name} ya está disponible en Mi plan.`, 'success');
    } catch (_) {
      addLink.removeAttribute('aria-busy');
      addLink.removeAttribute('data-community-plan-busy');
      setActionText(addLink, 'Añadir a mis planes', 'fa-plus');
      setStatus('No se ha podido guardar este plan en este navegador.', 'error');
    }
  };

  addLink?.addEventListener('click', async (event) => {
    if (addLink.dataset.communityPlanAdded === 'true') return;
    event.preventDefault();
    if (!imported) return;
    await addToMyPlans();
  });

  const loadDetail = async () => {
    if (!entry.url) {
      setStatus('Este plan no tiene un archivo JSON válido.', 'error');
      return;
    }
    try {
      imported = await loadExportedPlan(entry.url, eventById);
      renderDetail(detail, entry, imported);
      setStatus('', '');
      const existing = findExistingCommunityPlan(entry, imported);
      if (existing) markAddedLink(addLink, existing);
      if (new URLSearchParams(window.location.search).get('add') === '1') await addToMyPlans();
    } catch (_) {
      setStatus('No se ha podido cargar el archivo de este plan. Vuelve a intentarlo más tarde.', 'error');
    }
  };

  loadDetail();
}

async function enrichEntry(entry, eventById) {
  try {
    const imported = await loadExportedPlan(entry.url, eventById);
    return { ...entry, icon: imported.icon || entry.icon, summary: formatImportedSummary(imported) };
  } catch (_) {
    return entry;
  }
}

async function loadExportedPlan(url, eventById) {
  const value = await fetchJson(url);
  return validateExportPayload(value, eventById);
}

async function fetchJson(source) {
  const url = safeJsonUrl(source);
  if (!url) throw new Error('Invalid community plan URL');
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Community plan request failed with ${response.status}`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new Error('Community plan is too large');
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error('Community plan is not valid JSON');
  }
}

function normalizeCatalog(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== CATALOG_SCHEMA_VERSION || value.festival !== FESTIVAL_ID || !Array.isArray(value.plans)) {
    throw new Error('Unsupported community plans catalog');
  }
  const ids = new Set();
  return value.plans.map((rawEntry) => {
    if (!rawEntry || typeof rawEntry !== 'object') throw new Error('Invalid community plan entry');
    const id = cleanText(rawEntry.id, 80);
    const name = cleanText(rawEntry.name, MAX_PLAN_NAME_LENGTH);
    const author = cleanText(rawEntry.author, MAX_PLAN_NAME_LENGTH);
    const url = safeJsonPlanUrl(rawEntry.url);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id) || !name || !author || !url) {
      throw new Error('Invalid community plan catalog metadata');
    }
    ids.add(id);
    return { id, name, author, url, icon: normalizePlanIcon(rawEntry.icon || communityPlanIcon(id, name)) };
  });
}

function validateExportPayload(value, eventById) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== CATALOG_SCHEMA_VERSION || value.festival !== FESTIVAL_ID || !Array.isArray(value.plans) || value.plans.length !== 1) {
    throw new Error('Unsupported community plan export');
  }
  const sourcePlan = value.plans[0];
  const name = cleanText(sourcePlan?.name, MAX_PLAN_NAME_LENGTH);
  if (!sourcePlan || typeof sourcePlan !== 'object' || !name || !Array.isArray(sourcePlan.activityIds) || sourcePlan.activityIds.length > MAX_ACTIVITY_IDS) {
    throw new Error('Invalid community plan export');
  }
  const ids = uniqueIds(sourcePlan.activityIds);
  const activityIds = ids.filter((id) => eventById.has(id));
  return {
    name,
    icon: normalizePlanIcon(sourcePlan.icon),
    activityIds,
    missingIds: ids.filter((id) => !eventById.has(id)),
    events: activityIds.map((id) => eventById.get(id)).sort(compareEvents)
  };
}

function createPlanCard(entry) {
  const card = document.createElement('article');
  card.className = 'fiestas-community-plan-card';

  const icon = document.createElement('span');
  icon.className = 'fiestas-community-plan-card-icon';
  icon.append(createIcon(getPlanIcon(entry.icon).className));
  card.append(icon);

  const body = document.createElement('div');
  body.className = 'fiestas-community-plan-card-body';
  const title = document.createElement('h2');
  title.textContent = entry.name;
  const author = document.createElement('p');
  author.className = 'fiestas-community-plan-card-author';
  author.textContent = `Creado por ${entry.author}`;
  const meta = document.createElement('p');
  meta.className = 'fiestas-community-plan-card-meta';
  meta.textContent = entry.summary;
  body.append(title, author, meta);
  card.append(body);

  const actions = document.createElement('div');
  actions.className = 'fiestas-community-plan-card-actions';
  actions.append(createTextAction(entry.pageUrl, 'Previsualizar', 'fa-eye'));
  const addLink = createTextAction(`${entry.pageUrl}?add=1`, 'Añadir a mis planes', 'fa-plus');
  addLink.dataset.communityPlanAdd = '';
  addLink.dataset.communityPlanId = entry.id;
  const existing = findExistingCatalogPlan(entry);
  if (existing) markAddedLink(addLink, existing);
  actions.append(addLink);
  card.append(actions);
  return card;
}

function renderDetail(container, entry, imported) {
  if (!container) return;
  container.replaceChildren();

  const header = document.createElement('header');
  header.className = 'fiestas-community-plan-detail-head';
  const icon = document.createElement('span');
  icon.className = 'fiestas-community-plan-detail-icon';
  icon.append(createIcon(getPlanIcon(entry.icon || imported.icon).className));
  const kicker = document.createElement('p');
  kicker.className = 'fiestas-plan-kicker';
  kicker.textContent = 'PLAN VECINAL';
  const title = document.createElement('h2');
  title.id = 'community-plan-detail-title';
  title.textContent = entry.name || imported.name;
  const author = document.createElement('p');
  author.textContent = `Creado por ${entry.author}`;
  const summary = document.createElement('p');
  summary.className = 'fiestas-community-plan-detail-summary';
  summary.textContent = formatImportedSummary(imported);
  header.append(icon, kicker, title, author, summary);
  container.append(header);

  if (imported.missingIds.length) {
    const warning = document.createElement('p');
    warning.className = 'fiestas-community-plan-detail-warning';
    warning.textContent = `${imported.missingIds.length} actividad${imported.missingIds.length === 1 ? '' : 'es'} no está disponible en esta edición y no se añadirá.`;
    container.append(warning);
  }

  const list = document.createElement('div');
  list.className = 'fiestas-community-plan-detail-list';
  imported.events.forEach((event) => list.append(createDetailEvent(event)));
  if (!imported.events.length) {
    const empty = document.createElement('p');
    empty.className = 'fiestas-community-plan-detail-empty';
    empty.textContent = 'Este plan no tiene actividades disponibles para esta edición.';
    list.append(empty);
  }
  container.append(list);
}

function createDetailEvent(event) {
  const item = document.createElement('article');
  item.className = 'fiestas-community-plan-detail-item';
  const time = document.createElement('time');
  time.textContent = event.startTime || '—';
  const copy = document.createElement('div');
  copy.className = 'fiestas-community-plan-detail-item-copy';
  const title = event.urlPath ? document.createElement('a') : document.createElement('strong');
  title.textContent = event.title;
  if (event.urlPath) title.href = event.urlPath;
  const date = document.createElement('span');
  date.textContent = event.dateLabel || event.date;
  const location = document.createElement('span');
  location.textContent = event.location || 'Valladolid';
  copy.append(title, date, location);
  item.append(time, copy);
  return item;
}

function createTextAction(href, label, iconName) {
  const link = document.createElement('a');
  link.className = 'fiestas-community-plan-text-action';
  link.href = href;
  link.append(createIcon(iconName), document.createTextNode(label));
  return link;
}

function setActionText(link, label, iconName) {
  link.replaceChildren(createIcon(iconName), document.createTextNode(label));
}

function markAddedLink(link, plan) {
  if (!link) return;
  link.dataset.communityPlanAdded = 'true';
  link.removeAttribute('aria-busy');
  link.removeAttribute('data-community-plan-busy');
  link.removeAttribute('aria-disabled');
  if (plan?.id) link.href = `/plan/?tab=plans&plan=${encodeURIComponent(plan.id)}`;
  setActionText(link, 'Ver plan', 'fa-eye');
}

function findExistingCatalogPlan(entry) {
  return readPlans().find((plan) => plan.sourcePlanId === entry.id || normalizePlanName(plan.name) === normalizePlanName(entry.name)) || null;
}

function findExistingCommunityPlan(entry, imported) {
  const ids = new Set(imported?.activityIds || []);
  return readPlans().find((plan) => {
    if (plan.sourcePlanId === entry.id) return true;
    if (normalizePlanName(plan.name) !== normalizePlanName(entry.name || imported?.name)) return false;
    return plan.activityIds.length === ids.size && plan.activityIds.every((id) => ids.has(id));
  }) || null;
}

function normalizePlanName(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function createIcon(name) {
  const icon = document.createElement('i');
  icon.className = `fa-solid ${name}`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function showLinkFeedback(link, message) {
  const feedback = document.createElement('span');
  feedback.className = 'fiestas-community-plan-link-feedback';
  feedback.textContent = message;
  link.closest('.fiestas-community-plan-card')?.append(feedback);
}

function createEmptyState() {
  const empty = document.createElement('article');
  empty.className = 'fiestas-community-plans-empty';
  empty.append(createIcon('fa-people-group'));
  const copy = document.createElement('div');
  const kicker = document.createElement('p');
  kicker.className = 'fiestas-plan-kicker';
  kicker.textContent = 'PRÓXIMAMENTE';
  const title = document.createElement('h2');
  title.textContent = 'Planes vecinales';
  const description = document.createElement('p');
  description.textContent = 'Aquí aparecerán colecciones creadas por vecinos y editores de la comunidad.';
  copy.append(kicker, title, description);
  empty.append(copy);
  return empty;
}

function renderCatalogError(catalog) {
  if (!catalog) return;
  catalog.setAttribute('aria-busy', 'false');
  catalog.replaceChildren();
  const empty = document.createElement('article');
  empty.className = 'fiestas-community-plans-empty is-error';
  empty.append(createIcon('fa-cloud-arrow-down'));
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'No se han podido cargar los planes';
  const description = document.createElement('p');
  description.textContent = 'La colección vecinal estará disponible cuando el catálogo vuelva a responder.';
  copy.append(title, description);
  empty.append(copy);
  catalog.append(empty);
}

function formatImportedSummary(imported) {
  const count = `${imported.activityIds.length} ${imported.activityIds.length === 1 ? 'actividad' : 'actividades'}`;
  const dates = [...new Set(imported.events.map((event) => event.dateLabel || event.date))];
  return dates.length ? `${count} · ${dates.length} ${dates.length === 1 ? 'día' : 'días'}` : count;
}

function normalizeEvents(rawEvents) {
  return (Array.isArray(rawEvents) ? rawEvents : []).map((event) => ({
    id: String(event?.id || '').trim(),
    date: String(event?.date || ''),
    dateLabel: String(event?.dateLabel || event?.date || ''),
    startTime: String(event?.startTime || ''),
    title: String(event?.title || 'Actividad'),
    location: String(event?.location || ''),
    urlPath: String(event?.urlPath || '')
  })).filter((event) => event.id);
}

function compareEvents(a, b) {
  return `${a.date}T${a.startTime || '99:99'}`.localeCompare(`${b.date}T${b.startTime || '99:99'}`);
}

function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((id) => typeof id === 'string' || typeof id === 'number')
    .map(String)
    .map((id) => id.trim())
    .filter(Boolean))];
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function communityPlanIcon(id, name) {
  const text = `${id} ${name}`.toLocaleLowerCase('es');
  if (text.includes('cielo') || text.includes('estrella')) return 'stars';
  if (text.includes('plaza') || text.includes('concierto')) return 'microphone';
  return 'layers';
}

function safeJsonUrl(value) {
  const text = String(value || '').trim();
  if (!text || (text.startsWith('/') && !text.startsWith('/data/'))) return '';
  try {
    const url = new URL(text, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function safeJsonPlanUrl(value) {
  const url = safeJsonUrl(value);
  if (!url) return '';
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.fiestas-plan.json') ? url : '';
  } catch (_) {
    return '';
  }
}
