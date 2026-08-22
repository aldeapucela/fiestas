import {
  createPlan,
  deletePlan,
  makeUniquePlanName,
  planHasActivity,
  readFavoriteIds,
  readPlans,
  removeActivityFromPlan,
  setPlanActivity,
  subscribeToPlans,
  updatePlan,
  writeFavoriteIds
} from './plan-storage.js';
import { createIcsFile, createPlanFile, downloadFile, shareFileOrDownload } from './plan-export.js';
import {
  trackActivityShared,
  trackFavoriteChanged,
  trackPlanActivityAdded,
  trackPlanActivityRemoved,
  trackPlanCalendarExported,
  trackPlanCreated,
  trackPlanExported,
  trackPlanImportError,
  trackPlanImported,
  trackPlanShared
} from './analytics.js';

const FESTIVAL_ID = 'valladolid-2026';
const MAX_IMPORT_BYTES = 256 * 1024;
const MAX_PLAN_NAME_LENGTH = 80;
const MAX_IMPORT_ACTIVITIES = 200;
const IMPORT_PREVIEW_ACTIVITY_LIMIT = 3;
let selectorInitialized = false;

export function setupPlansPage(rawEvents = []) {
  const page = document.querySelector('[data-fiestas-plans-page]');
  if (!page) return;

  const state = {
    events: normalizeEvents(rawEvents),
    plans: readPlans(),
    view: getPlanView(),
    selectedPlanId: new URLSearchParams(window.location.search).get('plan') || '',
    selectedDay: new URLSearchParams(window.location.search).get('date') || 'all',
    creatingPlan: false,
    pendingDeletePlanId: ''
  };
  let shareDialogPlan = null;
  let shareDialogReturnFocus = null;

  if (state.view === 'plan' && !state.selectedPlanId) state.selectedPlanId = state.plans[0]?.id || '';

  const els = {
    sections: [...page.querySelectorAll('[data-plan-section]')],
    savedContent: page.querySelector('[data-plan-saved-content]'),
    planList: page.querySelector('[data-plan-list]'),
    planDetail: page.querySelector('[data-plan-detail]'),
    createForm: page.querySelector('[data-plan-create-form]'),
    createInput: page.querySelector('[data-plan-create-input]'),
    feedback: page.querySelector('[data-plan-feedback]'),
    picker: page.querySelector('[data-plan-picker]'),
    headerShare: page.querySelector('[data-plan-header-share]'),
    importLink: page.querySelector('[data-plan-import-link]'),
    deleteConfirm: page.querySelector('[data-plan-delete-confirm]'),
    deleteConfirmName: page.querySelector('[data-plan-delete-confirm-name]'),
    deleteConfirmCancel: page.querySelector('[data-plan-delete-confirm-cancel]'),
    deleteConfirmAccept: page.querySelector('[data-plan-delete-confirm-accept]'),
    shareDialog: document.querySelector('[data-plan-share-dialog]'),
    shareDialogName: document.querySelector('[data-plan-share-name]'),
    shareDialogMessage: document.querySelector('[data-plan-share-message]'),
    shareDialogFeedback: document.querySelector('[data-plan-share-feedback]'),
    shareDialogCopy: document.querySelector('[data-plan-share-copy]'),
    shareDialogDownload: document.querySelector('[data-plan-share-download]')
  };

  const showShareDialogFeedback = (message, isError = false) => {
    if (!els.shareDialogFeedback) return;
    els.shareDialogFeedback.hidden = false;
    els.shareDialogFeedback.textContent = message;
    els.shareDialogFeedback.classList.toggle('is-error', isError);
  };

  const closeShareDialog = () => {
    if (!els.shareDialog) return;
    els.shareDialog.hidden = true;
    document.body.classList.remove('fiestas-plan-share-open');
    shareDialogPlan = null;
    const returnFocus = shareDialogReturnFocus;
    shareDialogReturnFocus = null;
    returnFocus?.focus();
  };

  const openShareDialog = (plan, trigger) => {
    if (!plan || !els.shareDialog) return;
    shareDialogPlan = plan;
    shareDialogReturnFocus = trigger || null;
    if (els.shareDialogName) els.shareDialogName.textContent = plan.name;
    if (els.shareDialogMessage) {
      els.shareDialogMessage.value = createPlanShareMessage(plan, page.dataset.planImportUrl);
    }
    if (els.shareDialogFeedback) {
      els.shareDialogFeedback.hidden = true;
      els.shareDialogFeedback.classList.remove('is-error');
      els.shareDialogFeedback.textContent = '';
    }
    els.shareDialog.hidden = false;
    document.body.classList.add('fiestas-plan-share-open');
    els.shareDialogCopy?.focus();
  };

  const render = () => {
    state.plans = readPlans();
    if (state.selectedPlanId && !state.plans.some((plan) => plan.id === state.selectedPlanId)) state.selectedPlanId = '';
    if (state.view === 'plan' && !state.selectedPlanId && state.plans.length && !state.creatingPlan) state.selectedPlanId = state.plans[0].id;
    const displayedPlan = state.view === 'saved' ? savedPlan(state.events) : state.plans.find((plan) => plan.id === state.selectedPlanId);
    if (state.selectedDay !== 'all' && displayedPlan && !eventsForPlan(displayedPlan, state.events).some((event) => event.date === state.selectedDay)) {
      state.selectedDay = 'all';
      updatePlanUrl(state);
    }
    renderPlanPicker(els.picker, state.plans, state.view, state.selectedPlanId);
    els.sections.forEach((section) => {
      const sectionName = section.dataset.planSection;
      section.hidden = sectionName === 'saved' ? state.view !== 'saved' : sectionName === 'plan' ? state.view !== 'plan' : !state.selectedPlanId || state.view !== 'plan';
    });
    if (state.view === 'saved') {
      renderPlanDetail(els.savedContent, savedPlan(state.events), state.events, state.plans, state.selectedDay, els.feedback, { isSaved: true });
    } else {
      if (els.planList) els.planList.hidden = Boolean(state.selectedPlanId);
      renderPlanList(els.planList, state.plans, state.events, state.selectedPlanId, els.feedback);
      renderPlanDetail(els.planDetail, state.plans.find((plan) => plan.id === state.selectedPlanId), state.events, state.plans, state.selectedDay, els.feedback);
    }
    if (els.planList && state.view === 'saved') els.planList.hidden = true;
    if (els.createForm) els.createForm.hidden = state.view !== 'plan' || Boolean(state.selectedPlanId);
    if (els.importLink) els.importLink.hidden = true;
    if (els.headerShare) els.headerShare.hidden = state.view === 'plan' && !state.selectedPlanId;
    renderDeleteConfirmation(els.deleteConfirm, els.deleteConfirmName, state.plans, state.pendingDeletePlanId);
  };

  els.picker?.addEventListener('change', () => {
    const value = els.picker.value;
    if (value === '__saved__') {
      state.view = 'saved';
      state.selectedPlanId = '';
      state.creatingPlan = false;
      state.pendingDeletePlanId = '';
    } else if (value === '__create__') {
      state.view = 'plan';
      state.selectedPlanId = '';
      state.creatingPlan = true;
      state.pendingDeletePlanId = '';
    } else if (value === '__import__') {
      window.location.href = '/plan/importar/';
      return;
    } else {
      state.view = 'plan';
      state.selectedPlanId = value;
      state.creatingPlan = false;
      state.pendingDeletePlanId = '';
    }
    updatePlanUrl(state);
    render();
  });

  els.headerShare?.addEventListener('click', async () => {
    const plan = state.view === 'saved' ? savedPlan(state.events) : state.plans.find((item) => item.id === state.selectedPlanId);
    if (plan) openShareDialog(plan, els.headerShare);
  });

  els.shareDialog?.querySelectorAll('[data-plan-share-close]').forEach((button) => {
    button.addEventListener('click', closeShareDialog);
  });
  els.shareDialogCopy?.addEventListener('click', async () => {
    const message = els.shareDialogMessage?.value || '';
    if (!message) return;
    try {
      await copyText(message);
      showShareDialogFeedback('Mensaje copiado al portapapeles.');
    } catch (_) {
      showShareDialogFeedback('No se pudo copiar el mensaje.', true);
    }
  });
  els.shareDialogDownload?.addEventListener('click', () => {
    if (!shareDialogPlan) return;
    downloadFile(createPlanFile(shareDialogPlan));
    trackPlanExported('file');
    showShareDialogFeedback('Plan descargado.');
  });

  els.createForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = String(els.createInput?.value || '').trim();
    if (!name || name.length > MAX_PLAN_NAME_LENGTH) {
      showFeedback(els.feedback, `Escribe un nombre de entre 1 y ${MAX_PLAN_NAME_LENGTH} caracteres.`);
      return;
    }
    const plan = createPlan(makeUniquePlanName(name));
    trackPlanCreated('manual');
    if (els.createInput) els.createInput.value = '';
    state.view = 'plan';
    state.selectedPlanId = plan.id;
    state.creatingPlan = false;
    updatePlanUrl(state);
    render();
    showFeedback(els.feedback, 'Plan creado.');
  });

  page.addEventListener('click', async (event) => {
    const openButton = event.target.closest('[data-plan-open]');
    if (openButton && !event.target.closest('button, a')) {
      state.view = 'plan';
      state.selectedPlanId = openButton.dataset.planOpen || '';
      state.creatingPlan = false;
      state.pendingDeletePlanId = '';
      updatePlanUrl(state);
      render();
      return;
    }

    const backButton = event.target.closest('[data-plan-back]');
    if (backButton) {
      state.selectedPlanId = '';
      state.view = 'plan';
      state.creatingPlan = false;
      state.pendingDeletePlanId = '';
      updatePlanUrl(state);
      render();
      return;
    }

    const renameButton = event.target.closest('[data-plan-rename]');
    if (renameButton) {
      const plan = state.plans.find((item) => item.id === renameButton.dataset.planRename);
      if (!plan) return;
      const nextName = window.prompt('Nuevo nombre del plan', plan.name)?.trim();
      if (!nextName || nextName.length > MAX_PLAN_NAME_LENGTH) {
        if (nextName) showFeedback(els.feedback, `El nombre no puede superar ${MAX_PLAN_NAME_LENGTH} caracteres.`);
        return;
      }
      updatePlan(plan.id, { name: nextName });
      render();
      showFeedback(els.feedback, 'Plan renombrado.');
      return;
    }

    const deleteButton = event.target.closest('[data-plan-delete]');
    if (deleteButton) {
      const plan = state.plans.find((item) => item.id === deleteButton.dataset.planDelete);
      if (!plan) return;
      state.pendingDeletePlanId = plan.id;
      render();
      els.deleteConfirm?.scrollIntoView({ block: 'nearest' });
      els.deleteConfirmAccept?.focus();
      return;
    }

    const cancelDeleteButton = event.target.closest('[data-plan-delete-confirm-cancel]');
    if (cancelDeleteButton) {
      state.pendingDeletePlanId = '';
      render();
      return;
    }

    const acceptDeleteButton = event.target.closest('[data-plan-delete-confirm-accept]');
    if (acceptDeleteButton) {
      const plan = state.plans.find((item) => item.id === state.pendingDeletePlanId);
      if (!plan) {
        state.pendingDeletePlanId = '';
        render();
        return;
      }
      deletePlan(plan.id);
      state.selectedPlanId = '';
      state.view = 'plan';
      state.creatingPlan = true;
      state.pendingDeletePlanId = '';
      updatePlanUrl(state);
      render();
      showFeedback(els.feedback, 'Plan eliminado.');
      return;
    }

    const removeSavedButton = event.target.closest('[data-plan-remove-saved]');
    if (removeSavedButton) {
      const ids = new Set(readFavoriteIds());
      ids.delete(removeSavedButton.dataset.planRemoveSaved || '');
      writeFavoriteIds([...ids]);
      trackFavoriteChanged(removeSavedButton.dataset.planRemoveSaved, false);
      render();
      showFeedback(els.feedback, 'Actividad eliminada de guardados.');
      return;
    }

    const removeActivityButton = event.target.closest('[data-plan-remove-activity]');
    if (removeActivityButton) {
      removeActivityFromPlan(state.selectedPlanId, removeActivityButton.dataset.planRemoveActivity);
      trackPlanActivityRemoved(removeActivityButton.dataset.planRemoveActivity);
      render();
      showFeedback(els.feedback, 'Actividad eliminada del plan.');
      return;
    }

    const exportSavedButton = event.target.closest('[data-plan-export-saved]');
    if (exportSavedButton) {
      await exportCalendar(state.events.filter((eventItem) => readFavoriteIds().includes(eventItem.id)), 'Mis guardados', els.feedback, 'saved');
      return;
    }

    const exportCalendarButton = event.target.closest('[data-plan-export-calendar]');
    if (exportCalendarButton) {
      const plan = getActionPlan(exportCalendarButton.dataset.planExportCalendar, state, state.events);
      if (plan) await exportCalendar(eventsForPlan(plan, state.events), plan.name, els.feedback, plan.id);
      return;
    }

    const exportFileButton = event.target.closest('[data-plan-export-file]');
    if (exportFileButton) {
      const plan = state.plans.find((item) => item.id === exportFileButton.dataset.planExportFile);
      if (plan) await exportPlanFile(plan, els.feedback);
      return;
    }

    const shareButton = event.target.closest('[data-plan-share]');
    if (shareButton) {
      const plan = getActionPlan(shareButton.dataset.planShare, state, state.events);
      if (plan) openShareDialog(plan, shareButton);
      return;
    }

    const dayButton = event.target.closest('[data-plan-day]');
    if (dayButton && !dayButton.disabled) {
      state.selectedDay = dayButton.dataset.planDay || '';
      updatePlanUrl(state);
      render();
      return;
    }

    const favoriteButton = event.target.closest('[data-plan-toggle-favorite]');
    if (favoriteButton) {
      const ids = new Set(readFavoriteIds());
      const id = favoriteButton.dataset.planToggleFavorite || '';
      const isSaved = ids.has(id);
      if (isSaved) ids.delete(id);
      else ids.add(id);
      writeFavoriteIds([...ids]);
      trackFavoriteChanged(id, !isSaved);
      render();
      return;
    }
  });

  page.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-plan-open]');
    if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (event.target.closest('button, a')) return;
    event.preventDefault();
    state.view = 'plan';
    state.selectedPlanId = card.dataset.planOpen || '';
    state.creatingPlan = false;
    updatePlanUrl(state);
    render();
  });

  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    state.view = getPlanView();
    state.selectedPlanId = params.get('plan') || '';
    state.selectedDay = params.get('date') || 'all';
    state.creatingPlan = false;
    state.pendingDeletePlanId = '';
    render();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.shareDialog && !els.shareDialog.hidden) closeShareDialog();
  });
  subscribeToPlans(() => render());
  render();
}

export function setupPlanImportPage(rawEvents = []) {
  const page = document.querySelector('[data-fiestas-plan-import]');
  if (!page) return;

  const events = normalizeEvents(rawEvents);
  const eventIds = new Set(events.map((event) => event.id));
  const input = page.querySelector('[data-plan-import-file]');
  const status = page.querySelector('[data-plan-import-status]');
  const preview = page.querySelector('[data-plan-import-preview]');
  const actions = page.querySelector('[data-plan-import-actions]');
  const cancelButton = page.querySelector('[data-plan-import-cancel]');
  const confirmButton = page.querySelector('[data-plan-import-confirm]');
  const success = page.querySelector('[data-plan-import-success]');
  const viewLink = page.querySelector('[data-plan-import-view]');
  let pending = null;

  const reset = () => {
    pending = null;
    if (preview) preview.hidden = true;
    if (actions) actions.hidden = true;
    if (confirmButton) confirmButton.hidden = true;
    if (success) success.hidden = true;
    if (viewLink) {
      viewLink.hidden = true;
      viewLink.removeAttribute('href');
    }
  };

  const processText = (text, source = 'file') => {
    const result = validateImport(text, eventIds);
    if (!result.ok) {
      reset();
      setStatus(status, result.message, true);
      trackPlanImportError(result.errorType);
      return;
    }
    pending = { ...result, source };
    renderImportPreview(preview, result, events);
    const importablePlans = result.plans.filter((plan) => plan.validIds.length);
    if (actions) actions.hidden = false;
    if (confirmButton) confirmButton.hidden = !importablePlans.length;
    setStatus(
      status,
      importablePlans.length ? 'Revisa los planes antes de guardarlos.' : 'No hay actividades compatibles para importar.',
      !importablePlans.length
    );
  };

  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      reset();
      setStatus(status, 'El archivo supera el límite de 256 KiB.', true);
      trackPlanImportError('file_too_large');
      return;
    }
    try {
      processText(await file.text(), 'file');
    } catch (_) {
      reset();
      setStatus(status, 'No se pudo leer el archivo.', true);
      trackPlanImportError('read_error');
    }
  });

  cancelButton?.addEventListener('click', () => {
    reset();
    if (input) input.value = '';
    setStatus(status, 'Importación cancelada.', false);
  });

  confirmButton?.addEventListener('click', () => {
    if (!pending) return;
    const importablePlans = pending.plans.filter((plan) => plan.validIds.length);
    if (!importablePlans.length) return;
    const importedPlans = importablePlans.map((plan) => {
      const name = makeUniquePlanName(plan.name);
      return createPlan(name, plan.validIds);
    });
    trackPlanImported(pending.source);
    const skippedCount = pending.plans.length - importablePlans.length;
    const importedLabel = importedPlans.length === 1
      ? `Plan “${importedPlans[0].name}” importado correctamente.`
      : `${importedPlans.length} planes importados correctamente.`;
    const skippedLabel = skippedCount ? ` ${skippedCount} sin actividades compatibles no se han guardado.` : '';
    setStatus(status, `${importedLabel}${skippedLabel}`, false);
    if (actions) actions.hidden = true;
    confirmButton.hidden = true;
    if (success) success.hidden = false;
    if (viewLink) {
      const multiple = importedPlans.length > 1;
      viewLink.hidden = false;
      viewLink.textContent = multiple ? 'Ver planes importados' : 'Ver plan importado';
      viewLink.href = multiple
        ? '/plan/?tab=plans'
        : `/plan/?tab=plans&plan=${encodeURIComponent(importedPlans[0].id)}`;
    }
    if (input) input.value = '';
    pending = null;
  });

}

export function setupPlanSelector() {
  if (selectorInitialized) return;
  const selector = document.querySelector('[data-fiestas-plan-selector]');
  if (!selector) return;
  const options = document.querySelector('[data-fiestas-event-options]');
  selectorInitialized = true;

  let activityId = '';
  let optionsActivityId = '';
  const close = () => {
    selector.hidden = true;
    activityId = '';
  };
  const closeOptions = () => {
    if (options) options.hidden = true;
    optionsActivityId = '';
  };
  const openSelector = (nextActivityId) => {
    activityId = nextActivityId || '';
    if (!activityId) return;
    render();
    selector.hidden = false;
    selector.querySelector('[data-plan-selector-close]')?.focus();
  };
  const render = () => {
    const list = selector.querySelector('[data-plan-selector-list]');
    const empty = selector.querySelector('[data-plan-selector-empty]');
    if (!list) return;
    const plans = readPlans();
    list.replaceChildren(...plans.map((plan) => {
      const label = document.createElement('label');
      label.className = 'fiestas-plan-selector-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = planHasActivity(plan, activityId);
      checkbox.dataset.planSelectorId = plan.id;
      const text = document.createElement('span');
      text.textContent = plan.name;
      label.append(checkbox, text);
      return label;
    }));
    if (empty) empty.hidden = plans.length > 0;
  };

  document.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-fiestas-plan-add]');
    if (openButton) {
      event.preventDefault();
      event.stopPropagation();
      openSelector(openButton.dataset.eventId || '');
      return;
    }
    const moreButton = event.target.closest('[data-fiestas-more-options]');
    if (moreButton) {
      event.preventDefault();
      event.stopPropagation();
      closeOptions();
      openSelector(moreButton.dataset.eventId || '');
      return;
    }
    if (event.target.closest('[data-event-option-plan]')) {
      event.preventDefault();
      const nextActivityId = optionsActivityId;
      closeOptions();
      openSelector(nextActivityId);
      return;
    }
    if (event.target.closest('[data-plan-selector-close]') || event.target.matches('[data-fiestas-plan-selector]')) close();
    if (event.target.closest('[data-event-options-close]') || event.target.matches('[data-fiestas-event-options]')) closeOptions();
  });

  selector.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-plan-selector-id]');
    if (!checkbox || !activityId) return;
    setPlanActivity(checkbox.dataset.planSelectorId, activityId, checkbox.checked);
    if (checkbox.checked) trackPlanActivityAdded(activityId);
    else trackPlanActivityRemoved(activityId);
  });

  selector.querySelector('[data-plan-selector-create-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = selector.querySelector('[data-plan-selector-create-input]');
    const name = String(input?.value || '').trim();
    if (!name || name.length > MAX_PLAN_NAME_LENGTH) {
      selector.querySelector('[data-plan-selector-feedback]').textContent = `Usa entre 1 y ${MAX_PLAN_NAME_LENGTH} caracteres.`;
      return;
    }
    const plan = createPlan(makeUniquePlanName(name), activityId ? [activityId] : []);
    trackPlanCreated('manual');
    if (activityId) trackPlanActivityAdded(activityId);
    if (input) input.value = '';
    render();
    selector.querySelector('[data-plan-selector-feedback]').textContent = 'Plan creado y actividad añadida.';
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !selector.hidden) close();
    if (event.key === 'Escape' && options && !options.hidden) closeOptions();
  });
}

function renderSaved(container, events) {
  if (!container) return;
  container.replaceChildren();
  const ids = new Set(readFavoriteIds());
  const saved = events.filter((event) => ids.has(event.id));
  const header = document.createElement('div');
  header.className = 'fiestas-plan-section-head';
  header.append(textNode('h2', 'Guardados'), textNode('span', `${saved.length} ${saved.length === 1 ? 'actividad' : 'actividades'}`));
  container.append(header);

  const actions = document.createElement('div');
  actions.className = 'fiestas-plan-actions';
  const exportButton = actionButton('Añadir al calendario', 'fa-calendar-plus', { 'data-plan-export-saved': 'true' });
  exportButton.disabled = saved.length === 0;
  actions.append(exportButton);
  container.append(actions);

  if (!saved.length) {
    const empty = document.createElement('div');
    empty.className = 'fiestas-plan-empty';
    empty.append(textNode('p', 'Guarda actividades desde la agenda para encontrarlas aquí.'), linkNode('Ver agenda', '/'));
    container.append(empty);
    return;
  }
  container.append(groupedEvents(saved, (event) => eventSavedCard(event)));
}

function renderPlanList(container, plans, events, selectedPlanId, feedback) {
  if (!container) return;
  container.replaceChildren();
  if (!plans.length) {
    const empty = document.createElement('div');
    empty.className = 'fiestas-plan-empty';
    empty.append(textNode('p', 'Crea un plan para organizar tus actividades favoritas por momentos, estilos o compañía.'));
    container.append(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'fiestas-plan-list';
  plans.forEach((plan) => {
    const card = document.createElement('article');
    card.className = 'fiestas-plan-summary-card';
    card.dataset.planOpen = plan.id;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Abrir ${plan.name}`);
    card.append(textNode('h3', plan.name));
    const planEvents = eventsForPlan(plan, events);
    const next = planEvents[0];
    card.append(textNode('p', `${planEvents.length} ${planEvents.length === 1 ? 'actividad' : 'actividades'}`));
    if (next) card.append(textNode('p', `Próxima: ${next.title} · ${next.dateLabel || next.date}`));
    if (planEvents.length > 1) card.append(textNode('p', `Del ${planEvents[0].dateLabel || planEvents[0].date} al ${planEvents.at(-1).dateLabel || planEvents.at(-1).date}`));
    const actions = document.createElement('div');
    actions.className = 'fiestas-plan-card-actions';
    const manageRow = document.createElement('div');
    manageRow.className = 'fiestas-plan-card-actions-row';
    manageRow.append(
      actionButton('Renombrar', 'fa-pen', { 'data-plan-rename': plan.id }),
      actionButton('Eliminar', 'fa-trash', { 'data-plan-delete': plan.id, className: 'is-danger' })
    );
    const exportRow = document.createElement('div');
    exportRow.className = 'fiestas-plan-card-actions-row';
    exportRow.append(
      actionButton('Calendario', 'fa-calendar-plus', { 'data-plan-export-calendar': plan.id }),
      actionButton('Exportar', 'fa-share-from-square', { 'data-plan-export-file': plan.id })
    );
    actions.append(manageRow, exportRow);
    card.append(actions);
    list.append(card);
  });
  container.append(list);
}

function renderDeleteConfirmation(container, nameElement, plans, pendingPlanId) {
  if (!container) return;
  const plan = plans.find((item) => item.id === pendingPlanId);
  container.hidden = !plan;
  if (plan && nameElement) nameElement.textContent = `“${plan.name}”`;
}

function renderPlanDetail(container, plan, events, plans, selectedDay, feedback, options = {}) {
  if (!container) return;
  container.replaceChildren();
  if (!plan) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const planEvents = eventsForPlan(plan, events);
  const activeDay = selectedDay !== 'all' && selectedDay && planEvents.some((event) => event.date === selectedDay)
    ? selectedDay
    : 'all';
  const dayEvents = activeDay === 'all' ? planEvents : planEvents.filter((event) => event.date === activeDay);
  const dateChoices = getPlanDateChoices(events);

  const hero = document.createElement('section');
  hero.className = 'fiestas-plan-hero';
  const copy = document.createElement('div');
  copy.className = 'fiestas-plan-hero-copy';
  copy.append(textNode('h2', 'Tu plan de fiestas'));
  const summary = document.createElement('p');
  summary.className = 'fiestas-plan-summary';
  summary.classList.toggle('is-day-filtered', activeDay !== 'all');
  const summaryCount = activeDay === 'all' ? planEvents.length : dayEvents.length;
  const summaryLabel = activeDay === 'all'
    ? `${summaryCount} ${summaryCount === 1 ? 'actividad guardada' : 'actividades guardadas'}`
    : `${summaryCount} ${summaryCount === 1 ? 'actividad' : 'actividades'}`;
  summary.append(
    textNode('span', summaryLabel),
    textNode('span', ' · '),
    textNode('strong', formatPlanLongDate(activeDay))
  );
  copy.append(summary);
  const illustration = document.createElement('img');
  illustration.className = 'fiestas-plan-illustration';
  illustration.src = '/assets/plan-confetti.png';
  illustration.alt = '';
  illustration.setAttribute('aria-hidden', 'true');
  hero.append(copy, illustration);
  container.append(hero);

  const dateStrip = document.createElement('div');
  dateStrip.className = 'fiestas-plan-date-strip';
  dateStrip.setAttribute('role', 'tablist');
  dateStrip.setAttribute('aria-label', 'Días con actividades del plan');
  let activeDateButton = null;
  dateChoices.forEach((date) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fiestas-plan-date';
    button.classList.toggle('is-active', date === activeDay);
    button.dataset.planDay = date;
    const available = date === 'all' || planEvents.some((event) => event.date === date);
    button.disabled = !available;
    button.classList.toggle('is-disabled', !available);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(date === activeDay));
    button.setAttribute('aria-disabled', String(!available));
    const parts = formatPlanDateParts(date);
    button.append(textNode('span', parts.weekday), textNode('strong', parts.day));
    dateStrip.append(button);
    if (date === activeDay) activeDateButton = button;
  });
  container.append(dateStrip);
  if (activeDateButton && activeDay !== 'all') {
    window.requestAnimationFrame(() => activeDateButton.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }

  if (dayEvents.length) {
    const timeline = document.createElement('div');
    timeline.className = 'fiestas-plan-timeline';
    const groups = activeDay === 'all' ? groupEventsByDate(dayEvents) : [[activeDay, dayEvents]];
    groups.forEach(([date, group]) => {
      if (activeDay === 'all') {
        const dayLabel = textNode('h3', group[0].dateLabel || date);
        dayLabel.className = 'fiestas-plan-day-label';
        timeline.append(dayLabel);
      }
      group.forEach((event, index) => {
        const row = document.createElement('div');
        row.className = 'fiestas-plan-timeline-row';
        const rail = document.createElement('div');
        rail.className = 'fiestas-plan-timeline-rail';
        rail.append(textNode('time', event.startTime || '—'));
        const icon = document.createElement('span');
        icon.className = `fiestas-plan-timeline-icon${event.image ? ' has-image' : ''}`;
        if (event.image) {
          const image = document.createElement('img');
          image.className = 'fiestas-plan-timeline-image';
          image.src = event.image;
          image.alt = '';
          image.loading = 'lazy';
          image.decoding = 'async';
          icon.append(image);
        } else {
          icon.append(iconNode(`fa-solid ${iconForPlanEvent(event)}`));
        }
        rail.append(icon);
        if (index < group.length - 1) {
          const line = document.createElement('span');
          line.className = 'fiestas-plan-timeline-line';
          rail.append(line);
        }
        row.append(rail, renderPlanTimelineEvent(event, plan.id, plans, events));
        timeline.append(row);
      });
    });
    container.append(timeline);
  } else {
    const empty = document.createElement('div');
    empty.className = 'fiestas-plan-empty fiestas-plan-day-empty';
    empty.append(textNode('p', planEvents.length ? 'No hay actividades guardadas para este día.' : 'Añade actividades desde la agenda o desde una ficha de actividad.'));
    container.append(empty);
  }

  const bottomActions = document.createElement('div');
  bottomActions.className = 'fiestas-plan-bottom-actions';
  bottomActions.append(
    actionButton('Compartir mi plan', 'fa-arrow-up-from-bracket', { className: 'fiestas-plan-share-button', 'data-plan-share': plan.id }),
    actionButton('Añadir al calendario', 'fa-calendar-plus', { className: 'fiestas-plan-calendar-button', 'data-plan-export-calendar': plan.id })
  );
  container.append(bottomActions);

  if (!options.isSaved) {
    const management = document.createElement('div');
    management.className = 'fiestas-plan-management';
    management.append(
      actionButton('Renombrar', 'fa-pen', { 'data-plan-rename': plan.id }),
      actionButton('Exportar archivo', 'fa-file-arrow-down', { 'data-plan-export-file': plan.id }),
      actionButton('Eliminar plan', 'fa-trash', { 'data-plan-delete': plan.id, className: 'is-danger' })
    );
    container.append(management);
  }
}

function renderPlanTimelineEvent(event, planId, plans, events) {
  const card = document.createElement('article');
  card.className = 'fiestas-plan-timeline-card';

  const top = document.createElement('div');
  top.className = 'fiestas-plan-timeline-card-top';
  const title = linkNode(event.title || 'Actividad sin título', event.urlPath || eventUrl(event));
  title.className = 'fiestas-plan-timeline-title';
  top.append(title);
  const favoriteButton = document.createElement('button');
  const saved = readFavoriteIds().includes(event.id);
  favoriteButton.type = 'button';
  favoriteButton.className = 'fiestas-plan-heart';
  favoriteButton.dataset.planToggleFavorite = event.id;
  favoriteButton.setAttribute('aria-label', saved ? 'Quitar de guardados' : 'Guardar actividad');
  favoriteButton.setAttribute('aria-pressed', String(saved));
  favoriteButton.append(iconNode(`${saved ? 'fa-solid' : 'fa-regular'} fa-heart`));
  top.append(favoriteButton);
  card.append(top);

  const location = document.createElement('p');
  location.className = 'fiestas-plan-timeline-location';
  location.append(iconNode('fa-solid fa-location-dot'), textNode('span', event.location || event.zone || 'Lugar por confirmar'));
  card.append(location);

  const tag = textNode('span', `#${slugifyPlanTag(event.tags?.[0] || event.type || 'Actividad')}`);
  tag.className = 'fiestas-plan-tag';
  card.append(tag);

  const overlap = findPlanOverlap(event, planId, plans, events);
  if (overlap) {
    const warning = document.createElement('div');
    warning.className = 'fiestas-plan-overlap-warning';
    warning.append(iconNode('fa-solid fa-triangle-exclamation'));
    warning.append(textNode('span', 'Se solapa con otro plan'));
    const review = actionButton('Revisar', 'fa-chevron-right', { className: 'fiestas-plan-overlap-review', 'data-plan-open': overlap.planId });
    warning.append(review);
    card.append(warning);
  }
  return card;
}

function eventSavedCard(event) {
  const card = eventPlanCard(event);
  const remove = actionButton('Quitar', 'fa-bookmark-slash', { 'data-plan-remove-saved': event.id });
  card.querySelector('.fiestas-plan-event-actions')?.append(remove);
  return card;
}

function eventPlanCard(event, planId = '') {
  const card = document.createElement('article');
  card.className = 'fiestas-plan-event-card';
  const time = textNode('span', formatTime(event));
  time.className = 'fiestas-plan-event-time';
  card.append(time);
  const body = document.createElement('div');
  body.className = 'fiestas-plan-event-body';
  body.append(linkNode(event.title || 'Actividad sin título', event.urlPath || eventUrl(event)));
  body.append(textNode('span', [event.type, event.location || event.zone || 'Lugar por confirmar'].filter(Boolean).join(' · ')));
  card.append(body);
  const actions = document.createElement('div');
  actions.className = 'fiestas-plan-event-actions';
  actions.append(actionButton('Más opciones', 'fa-ellipsis', { 'data-fiestas-more-options': 'true', 'data-event-id': event.id, 'aria-haspopup': 'dialog' }));
  if (planId) actions.append(actionButton('Quitar del plan', 'fa-xmark', { 'data-plan-remove-activity': event.id }));
  card.append(actions);
  return card;
}

function groupedEvents(events, renderEvent) {
  const wrapper = document.createElement('div');
  wrapper.className = 'fiestas-plan-events';
  const groups = new Map();
  events.forEach((event) => {
    if (!groups.has(event.date)) groups.set(event.date, []);
    groups.get(event.date).push(event);
  });
  groups.forEach((dayEvents, date) => {
    const section = document.createElement('section');
    section.className = 'fiestas-plan-day';
    section.append(textNode('h3', dayEvents[0].dateLabel || date));
    dayEvents.forEach((event) => section.append(renderEvent(event)));
    wrapper.append(section);
  });
  return wrapper;
}

function groupEventsByDate(events) {
  const groups = new Map();
  events.forEach((event) => {
    if (!groups.has(event.date)) groups.set(event.date, []);
    groups.get(event.date).push(event);
  });
  return [...groups.entries()];
}

async function exportCalendar(events, name, feedback, analyticsId) {
  if (!events.length) {
    showFeedback(feedback, 'No hay actividades para exportar.');
    return;
  }
  const result = await shareFileOrDownload(createIcsFile(events, name), {
    title: name,
    text: 'Añade este plan al calendario de Fiestas Valladolid 2026'
  });
  if (result !== 'cancelled') trackPlanCalendarExported(analyticsId);
  showFeedback(feedback, result === 'shared' ? 'Calendario compartido.' : result === 'downloaded' ? 'Calendario descargado.' : 'Compartición cancelada.');
}

async function exportPlanFile(plan, feedback) {
  const result = await shareFileOrDownload(createPlanFile(plan), {
    title: plan.name,
    text: 'Importa este plan de las Fiestas de Valladolid'
  });
  if (result === 'shared') trackPlanShared('file');
  else if (result === 'downloaded') trackPlanExported('file');
  showFeedback(feedback, result === 'shared' ? 'Plan compartido.' : result === 'downloaded' ? 'Archivo descargado.' : 'Compartición cancelada.');
}

function createPlanShareMessage(plan, importUrl = 'https://fiestas.aldeapucela.org/plan/importar/') {
  return `Échale un vistazo al plan «${plan.name}» para las Fiestas y Ferias de Valladolid 2026.\n\nPuedes importar el archivo que te mando en ${importUrl}`;
}

async function copyText(text) {
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
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy failed');
}

function validateImport(text, eventIds) {
  if (String(text || '').length > MAX_IMPORT_BYTES) return { ok: false, message: 'El archivo supera el límite de 256 KiB.', errorType: 'file_too_large' };
  let value;
  try {
    value = JSON.parse(String(text || ''));
  } catch (_) {
    return { ok: false, message: 'El archivo no contiene un JSON válido.', errorType: 'invalid_json' };
  }
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || value.festival !== FESTIVAL_ID) {
    return { ok: false, message: 'El archivo no pertenece a Fiestas Valladolid 2026 o usa una versión incompatible.', errorType: 'unsupported_format' };
  }
  const hasPlans = Object.prototype.hasOwnProperty.call(value, 'plans');
  if (hasPlans && !Array.isArray(value.plans)) {
    return { ok: false, message: 'La lista de planes del archivo no es válida.', errorType: 'unsupported_format' };
  }
  const rawPlans = hasPlans ? value.plans : [value];
  if (!rawPlans.length) return { ok: false, message: 'El archivo no contiene ningún plan.', errorType: 'unsupported_format' };
  const plans = [];
  for (const rawPlan of rawPlans) {
    if (!rawPlan || typeof rawPlan !== 'object') {
      return { ok: false, message: 'Uno de los planes del archivo no es válido.', errorType: 'unsupported_format' };
    }
    const name = String(rawPlan.name || '').trim();
    if (!name || name.length > MAX_PLAN_NAME_LENGTH) {
      return { ok: false, message: `Cada nombre debe tener entre 1 y ${MAX_PLAN_NAME_LENGTH} caracteres.`, errorType: 'invalid_name' };
    }
    if (!Array.isArray(rawPlan.activityIds) || rawPlan.activityIds.length > MAX_IMPORT_ACTIVITIES) {
      return { ok: false, message: `El plan “${name}” supera el máximo de ${MAX_IMPORT_ACTIVITIES} actividades.`, errorType: 'too_many_activities' };
    }
    const ids = [...new Set(rawPlan.activityIds.map(String).map((id) => id.trim()).filter(Boolean))];
    const validIds = ids.filter((id) => eventIds.has(id));
    plans.push({
      name,
      ids,
      validIds,
      missingIds: ids.filter((id) => !eventIds.has(id))
    });
  }
  return {
    ok: true,
    plans
  };
}

function renderImportPreview(container, result, events) {
  if (!container) return;
  container.replaceChildren();
  container.hidden = false;
  const countLabel = result.plans.length === 1 ? '1 plan encontrado' : `${result.plans.length} planes encontrados`;
  container.append(textNode('h2', 'Vista previa de la importación'));
  const summary = textNode('p', `${countLabel}. Revisa los nombres y las actividades antes de aceptar.`);
  summary.className = 'fiestas-plan-import-summary';
  container.append(summary);

  const list = document.createElement('div');
  list.className = 'fiestas-plan-import-list';
  result.plans.forEach((plan, index) => {
    const item = document.createElement('article');
    item.className = 'fiestas-plan-import-item';
    if (index >= 2) {
      item.hidden = true;
      item.dataset.planImportExtra = 'true';
    }
    item.append(textNode('h3', plan.name));
    item.append(textNode('p', `${plan.validIds.length} actividades válidas de ${plan.ids.length}.`));
    if (plan.missingIds.length) {
      const missing = textNode('p', `${plan.missingIds.length} actividad${plan.missingIds.length === 1 ? '' : 'es'} no encontrada${plan.missingIds.length === 1 ? '' : 's'}.`);
      missing.className = 'fiestas-plan-import-item-warning';
      item.append(missing);
    }
    const validEvents = events.filter((event) => plan.validIds.includes(event.id));
    if (validEvents.length) item.append(textNode('p', `Fechas: ${validEvents[0].dateLabel || validEvents[0].date} — ${validEvents.at(-1).dateLabel || validEvents.at(-1).date}.`));
    if (validEvents.length) {
      const activityList = document.createElement('ul');
      activityList.className = 'fiestas-plan-import-activity-list';
      validEvents.forEach((event, eventIndex) => {
        const activity = document.createElement('li');
        activity.className = 'fiestas-plan-import-activity';
        if (eventIndex >= IMPORT_PREVIEW_ACTIVITY_LIMIT) {
          activity.hidden = true;
          activity.dataset.planImportActivityExtra = 'true';
        }
        const time = textNode('time', event.startTime || '—');
        const copy = document.createElement('span');
        copy.className = 'fiestas-plan-import-activity-copy';
        copy.append(
          textNode('strong', event.title || 'Actividad sin título'),
          textNode('span', [event.dateLabel || event.date, formatTime(event), event.location || event.zone || event.neighborhood || 'Lugar por confirmar'].join(' · '))
        );
        activity.append(time, copy);
        activityList.append(activity);
      });
      item.append(activityList);

      if (validEvents.length > IMPORT_PREVIEW_ACTIVITY_LIMIT) {
        const extraCount = validEvents.length - IMPORT_PREVIEW_ACTIVITY_LIMIT;
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'fiestas-plan-import-activity-toggle';
        expand.setAttribute('aria-expanded', 'false');
        expand.textContent = `Ver ${extraCount} actividad${extraCount === 1 ? '' : 'es'} más`;
        expand.addEventListener('click', () => {
          const expanded = expand.getAttribute('aria-expanded') === 'true';
          activityList.querySelectorAll('[data-plan-import-activity-extra]').forEach((activity) => { activity.hidden = expanded; });
          expand.setAttribute('aria-expanded', String(!expanded));
          expand.textContent = expanded ? `Ver ${extraCount} actividad${extraCount === 1 ? '' : 'es'} más` : 'Ocultar actividades';
        });
        item.append(expand);
      }
    } else {
      item.append(textNode('p', 'No hay actividades compatibles para importar.'));
    }
    list.append(item);
  });
  container.append(list);

  if (result.plans.length > 2) {
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'fiestas-plan-import-expand';
    expand.setAttribute('aria-expanded', 'false');
    expand.textContent = `Ver los ${result.plans.length - 2} planes restantes`;
    expand.addEventListener('click', () => {
      const expanded = expand.getAttribute('aria-expanded') === 'true';
      list.querySelectorAll('[data-plan-import-extra]').forEach((item) => { item.hidden = expanded; });
      expand.setAttribute('aria-expanded', String(!expanded));
      expand.textContent = expanded ? `Ver los ${result.plans.length - 2} planes restantes` : 'Ocultar planes restantes';
    });
    container.append(expand);
  }
}

function eventsForPlan(plan, events) {
  const ids = new Set(plan?.activityIds || []);
  return events.filter((event) => ids.has(event.id));
}

function getPlanView() {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'plans' || params.get('tab') === 'plans' || params.get('plan') ? 'plan' : 'saved';
}

function renderPlanPicker(select, plans, view, selectedPlanId) {
  if (!select) return;
  select.replaceChildren();
  const saved = document.createElement('option');
  saved.value = '__saved__';
  saved.textContent = 'Guardados';
  select.append(saved);
  plans.forEach((plan) => {
    const option = document.createElement('option');
    option.value = plan.id;
    option.textContent = plan.name;
    select.append(option);
  });
  const create = document.createElement('option');
  create.value = '__create__';
  create.textContent = 'Crear un plan nuevo';
  select.append(create);
  const importOption = document.createElement('option');
  importOption.value = '__import__';
  importOption.textContent = 'Importar un plan';
  select.append(importOption);
  select.value = view === 'saved' ? '__saved__' : selectedPlanId || '__create__';
}

function getPlanDateChoices(events) {
  const dates = [...new Set(events.map((event) => event.date).filter(Boolean))].sort();
  if (!dates.length) return ['all'];
  return ['all', ...dates];
}

function formatPlanDateParts(date) {
  if (date === 'all') return { weekday: 'Todos', day: '' };
  if (!date) return { weekday: '—', day: '—' };
  const value = new Date(`${date}T12:00:00`);
  return {
    weekday: capitalizePlanLabel(new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(value).replace('.', '').slice(0, 3)),
    day: new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(value)
  };
}

function formatPlanLongDate(date) {
  if (date === 'all') return 'Todos los días';
  if (!date) return 'Añade actividades para empezar';
  const value = new Date(`${date}T12:00:00`);
  const weekday = capitalizePlanLabel(new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(value).replace('.', ''));
  const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(value);
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(value);
  return `${weekday} ${day} ${month}`;
}

function capitalizePlanLabel(value) {
  const text = String(value || '');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function iconForPlanEvent(event) {
  if (event.icon) return event.icon;
  const type = String(event.type || '').toLowerCase();
  if (type.includes('música') || type.includes('concierto')) return 'fa-music';
  if (type.includes('deporte')) return 'fa-person-running';
  if (type.includes('humor') || type.includes('monólogo') || type.includes('teatro') || type.includes('danza')) return 'fa-masks-theater';
  if (type.includes('peña') || type.includes('pasacalle')) return 'fa-drum';
  if (type.includes('infantil') || type.includes('famil')) return 'fa-child-reaching';
  return 'fa-calendar-day';
}

function iconNode(className) {
  const icon = document.createElement('i');
  icon.className = className;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function slugifyPlanTag(value) {
  return String(value || 'actividad')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '') || 'actividad';
}

function findPlanOverlap(event, planId, plans, events) {
  const start = sortMinutes(event.startTime);
  const end = event.endTime ? sortMinutes(event.endTime) : start + 60;
  for (const plan of plans) {
    if (plan.id === planId) continue;
    for (const other of eventsForPlan(plan, events)) {
      if (other.date !== event.date) continue;
      const otherStart = sortMinutes(other.startTime);
      const otherEnd = other.endTime ? sortMinutes(other.endTime) : otherStart + 60;
      if (start < otherEnd && otherStart < end) return { planId: plan.id, name: plan.name };
    }
  }
  return null;
}

function savedPlan(events) {
  return {
    id: '__saved__',
    name: 'Guardados',
    activityIds: readFavoriteIds().filter((id) => events.some((event) => event.id === id)),
    isSaved: true
  };
}

function getActionPlan(planId, state, events) {
  return planId === '__saved__' ? savedPlan(events) : state.plans.find((plan) => plan.id === planId);
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : []).map((event) => ({ ...event })).filter((event) => event.id && event.date).sort(compareEvents);
}

function eventUrl(event) {
  const slug = event.slug || slugifyPlanUrl(event.title || 'evento');
  return `/e/${event.id}/${slug}/`;
}

function slugifyPlanUrl(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'evento';
}

function compareEvents(a, b) {
  return String(a.date).localeCompare(String(b.date)) || sortMinutes(a.startTime) - sortMinutes(b.startTime) || String(a.title).localeCompare(String(b.title), 'es');
}

function sortMinutes(time = '') {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 99 * 60;
  const value = hour * 60 + minute;
  return hour < 6 ? value + 24 * 60 : value;
}

function formatTime(event) {
  if (!event.startTime) return 'Hora por confirmar';
  return [event.startTime, event.endTime].filter(Boolean).join(' - ');
}

function updatePlanUrl(state) {
  const params = new URLSearchParams(window.location.search);
  params.delete('tab');
  params.delete('view');
  params.delete('plan');
  params.delete('date');
  if (state.view === 'plan') params.set('tab', 'plans');
  else params.set('view', 'saved');
  if (state.selectedPlanId) params.set('plan', state.selectedPlanId);
  if (state.selectedDay) params.set('date', state.selectedDay);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

function showFeedback(node, message) {
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  window.clearTimeout(node._timer);
  node._timer = window.setTimeout(() => { node.hidden = true; }, 3200);
}

function setStatus(node, message, isError) {
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  node.classList.toggle('is-error', Boolean(isError));
}

function textNode(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function linkNode(text, href) {
  const node = document.createElement('a');
  node.href = href;
  node.textContent = text;
  return node;
}

function actionButton(label, icon, data = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `fiestas-plan-action ${data.className || ''}`.trim();
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'className') return;
    button.setAttribute(key, value);
  });
  const iconNode = document.createElement('i');
  iconNode.className = `fa-solid ${icon}`;
  iconNode.setAttribute('aria-hidden', 'true');
  button.append(iconNode, document.createTextNode(label));
  return button;
}
