export const FAVORITES_STORAGE_KEY = 'fiestasPucela:favorites';
export const PLANS_STORAGE_KEY = 'fiestasPucela:plans';
export const PLANS_SCHEMA_VERSION = 1;
export const DEFAULT_PLAN_ICON = 'layers';
export const PLAN_ICON_OPTIONS = Object.freeze([
  { id: 'stars', label: 'Estrellas', className: 'fa-star' },
  { id: 'music', label: 'Música', className: 'fa-music' },
  { id: 'microphone', label: 'Micrófono', className: 'fa-microphone' },
  { id: 'cocktail', label: 'Copas', className: 'fa-wine-glass' },
  { id: 'beer', label: 'Cerveza', className: 'fa-beer-mug-empty' },
  { id: 'food', label: 'Gastronomía', className: 'fa-utensils' },
  { id: 'dance', label: 'Baile', className: 'fa-person-dress' },
  { id: 'theater', label: 'Teatro', className: 'fa-masks-theater' },
  { id: 'masks', label: 'Disfraces', className: 'fa-mask-face' },
  { id: 'fireworks', label: 'Fuegos artificiales', className: 'fa-wand-sparkles' },
  { id: 'parade', label: 'Desfiles', className: 'fa-drum' },
  { id: 'family', label: 'Familia', className: 'fa-people-roof' },
  { id: 'children', label: 'Infantil', className: 'fa-child-reaching' },
  { id: 'sports', label: 'Deporte', className: 'fa-person-running' },
  { id: 'religious', label: 'Religioso', className: 'fa-place-of-worship' },
  { id: 'camera', label: 'Fotografía', className: 'fa-camera' },
  { id: 'art', label: 'Arte', className: 'fa-palette' },
  { id: 'culture', label: 'Cultura', className: 'fa-book-open' },
  { id: 'map', label: 'Rutas', className: 'fa-map-location-dot' },
  { id: 'calendar', label: 'Agenda', className: 'fa-calendar-days' },
  { id: 'heart', label: 'Favoritos', className: 'fa-heart' },
  { id: 'layers', label: 'Otros', className: 'fa-layer-group' }
]);

const plansChangedEvent = 'fiestas:plans-changed';

export function readFavoriteIds() {
  const value = readJson(FAVORITES_STORAGE_KEY, []);
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(Boolean))];
}

export function writeFavoriteIds(ids) {
  const nextIds = [...new Set((Array.isArray(ids) ? ids : [...ids]).map(String).filter(Boolean))];
  writeJson(FAVORITES_STORAGE_KEY, nextIds);
  return nextIds;
}

export function readPlans() {
  const value = readJson(PLANS_STORAGE_KEY, null);
  if (!value || typeof value !== 'object' || value.schemaVersion !== PLANS_SCHEMA_VERSION || !Array.isArray(value.plans)) {
    return [];
  }
  return value.plans.map(normalizePlan).filter(Boolean);
}

export function writePlans(plans) {
  const normalized = (Array.isArray(plans) ? plans : []).map(normalizePlan).filter(Boolean);
  writeJson(PLANS_STORAGE_KEY, { schemaVersion: PLANS_SCHEMA_VERSION, plans: normalized });
  dispatchPlansChanged();
  return normalized;
}

export function createPlan(name, activityIds = [], metadata = {}) {
  const now = new Date().toISOString();
  const sourcePlanId = String(metadata?.sourcePlanId || '').trim();
  const plan = {
    id: createId(),
    name: String(name || '').trim(),
    createdAt: now,
    updatedAt: now,
    activityIds: uniqueIds(activityIds),
    icon: normalizePlanIcon(metadata?.icon)
  };
  if (sourcePlanId) plan.sourcePlanId = sourcePlanId;
  const plans = [...readPlans(), plan];
  writePlans(plans);
  return plan;
}

export function updatePlan(planId, changes = {}) {
  let updated = null;
  const plans = readPlans().map((plan) => {
    if (plan.id !== planId) return plan;
    updated = normalizePlan({
      ...plan,
      ...changes,
      id: plan.id,
      createdAt: plan.createdAt,
      updatedAt: new Date().toISOString()
    });
    return updated || plan;
  });
  writePlans(plans);
  return updated;
}

export function deletePlan(planId) {
  const plans = readPlans().filter((plan) => plan.id !== planId);
  writePlans(plans);
  return plans;
}

export function setPlanActivity(planId, activityId, included) {
  const plans = readPlans();
  const plan = plans.find((item) => item.id === planId);
  if (!plan || !activityId) return null;
  const ids = new Set(plan.activityIds);
  if (included) ids.add(String(activityId));
  else ids.delete(String(activityId));
  return updatePlan(planId, { activityIds: [...ids] });
}

export function addActivityToPlan(planId, activityId) {
  return setPlanActivity(planId, activityId, true);
}

export function removeActivityFromPlan(planId, activityId) {
  return setPlanActivity(planId, activityId, false);
}

export function planHasActivity(plan, activityId) {
  return Boolean(plan?.activityIds?.includes(String(activityId)));
}

export function normalizePlanIcon(value) {
  const icon = String(value || '').trim().toLocaleLowerCase('en');
  return PLAN_ICON_OPTIONS.some((option) => option.id === icon) ? icon : DEFAULT_PLAN_ICON;
}

export function isUnmodifiedCommunityPlan(plan) {
  return Boolean(String(plan?.sourcePlanId || '').trim())
    && String(plan?.createdAt || '') === String(plan?.updatedAt || '');
}

export function getPlanIcon(value) {
  const iconId = normalizePlanIcon(value);
  return PLAN_ICON_OPTIONS.find((option) => option.id === iconId) || PLAN_ICON_OPTIONS.at(-1);
}

export function makeUniquePlanName(name, plans = readPlans()) {
  const base = String(name || '').trim() || 'Mi plan';
  const names = new Set(plans.map((plan) => plan.name.toLocaleLowerCase('es')));
  if (!names.has(base.toLocaleLowerCase('es'))) return base;
  let suffix = 2;
  while (names.has(`${base} (${suffix})`.toLocaleLowerCase('es'))) suffix += 1;
  return `${base} (${suffix})`;
}

export function subscribeToPlans(callback) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event) => {
    if (event.key === PLANS_STORAGE_KEY) callback(readPlans());
  };
  const onCustom = () => callback(readPlans());
  window.addEventListener('storage', onStorage);
  window.addEventListener(plansChangedEvent, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(plansChangedEvent, onCustom);
  };
}

function normalizePlan(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const name = String(value.name || '').trim();
  if (!id || !name) return null;
  const createdAt = validIso(value.createdAt) || new Date().toISOString();
  const updatedAt = validIso(value.updatedAt) || createdAt;
  return {
    id,
    name,
    createdAt,
    updatedAt,
    activityIds: uniqueIds(value.activityIds),
    icon: normalizePlanIcon(value.icon),
    ...(String(value.sourcePlanId || '').trim() ? { sourcePlanId: String(value.sourcePlanId).trim() } : {})
  };
}

function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).map((id) => id.trim()).filter(Boolean))];
}

function validIso(value) {
  const text = String(value || '');
  return text && Number.isFinite(Date.parse(text)) ? text : '';
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `local-${crypto.randomUUID()}`;
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function dispatchPlansChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(plansChangedEvent));
}
