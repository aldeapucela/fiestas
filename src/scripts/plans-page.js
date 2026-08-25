import {
  createPlan,
  DEFAULT_PLAN_ICON,
  deletePlan,
  getPlanIcon,
  makeUniquePlanName,
  normalizePlanIcon,
  PLAN_ICON_OPTIONS,
  planHasActivity,
  readFavoriteIds,
  readPlans,
  removeActivityFromPlan,
  setPlanActivity,
  subscribeToPlans,
  updatePlan,
  writeFavoriteIds
} from './plan-storage.js';
import { createIcsFile, createPlanImportUrl, decodePlanImportHash, shareFileOrDownload } from './plan-export.js';
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
const MAX_IMPORT_HASH_LENGTH = Math.ceil(MAX_IMPORT_BYTES * 4 / 3) + 1024;
const MAX_PLAN_NAME_LENGTH = 80;
const MAX_IMPORT_ACTIVITIES = 200;
const IMPORT_PREVIEW_ACTIVITY_LIMIT = 3;
const COMMUNITY_PLANS_CATALOG_URL = '/data/planes.json';
let communityPlansCatalogPromise = null;
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
    focusActivityId: '',
    creatingPlan: false,
    pendingDeletePlanId: '',
    newPlanIcon: DEFAULT_PLAN_ICON,
    editingPlanId: '',
    editingIcon: DEFAULT_PLAN_ICON
  };
  let shareDialogPlan = null;
  let shareDialogReturnFocus = null;
  let shareDialogUrl = '';
  let shareDialogResolution = 0;
  let deleteDialogReturnFocus = null;

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
    pickerTrigger: page.querySelector('[data-plan-picker-trigger]'),
    pickerMenu: page.querySelector('[data-plan-picker-menu]'),
    pickerLabel: page.querySelector('[data-plan-picker-label]'),
    pickerIcon: page.querySelector('[data-plan-picker-icon]'),
    createIcons: page.querySelector('[data-plan-create-icons]'),
    headerShare: page.querySelector('[data-plan-header-share]'),
    manageMenuTrigger: page.querySelector('[data-plan-manage-menu-trigger]'),
    manageMenu: page.querySelector('[data-plan-manage-menu]'),
    importLink: page.querySelector('[data-plan-import-link]'),
    deleteConfirm: page.querySelector('[data-plan-delete-confirm]'),
    deleteConfirmName: page.querySelector('[data-plan-delete-confirm-name]'),
    deleteConfirmCancel: page.querySelector('[data-plan-delete-confirm-cancel]'),
    deleteConfirmAccept: page.querySelector('[data-plan-delete-confirm-accept]'),
    editor: page.querySelector('[data-plan-editor]'),
    editorForm: page.querySelector('[data-plan-editor-form]'),
    editorName: page.querySelector('[data-plan-editor-name]'),
    editorIcons: page.querySelector('[data-plan-editor-icons]'),
    shareDialog: document.querySelector('[data-plan-share-dialog]'),
    shareDialogName: document.querySelector('[data-plan-share-name]'),
    shareDialogMessage: document.querySelector('[data-plan-share-message]'),
    shareDialogFeedback: document.querySelector('[data-plan-share-feedback]'),
    shareDialogNative: document.querySelector('[data-plan-share-native]'),
    shareDialogCopy: document.querySelector('[data-plan-share-copy]')
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
    shareDialogUrl = '';
    shareDialogResolution += 1;
    [els.shareDialogCopy, els.shareDialogNative].forEach((button) => {
      if (button) button.disabled = false;
    });
    const returnFocus = shareDialogReturnFocus;
    shareDialogReturnFocus = null;
    returnFocus?.focus();
  };

  const closePlanManageMenu = (restoreFocus = false) => {
    if (!els.manageMenu || !els.manageMenuTrigger) return;
    els.manageMenu.hidden = true;
    els.manageMenuTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) els.manageMenuTrigger.focus();
  };

  const openPlanManageMenu = () => {
    if (!els.manageMenu || !els.manageMenuTrigger || els.manageMenuTrigger.hidden) return;
    els.manageMenu.hidden = false;
    els.manageMenuTrigger.setAttribute('aria-expanded', 'true');
    els.manageMenu.querySelector('[role="menuitem"]')?.focus();
  };

  const openShareDialog = async (plan, trigger) => {
    if (!plan || !els.shareDialog) return;
    const resolution = ++shareDialogResolution;
    shareDialogPlan = plan;
    shareDialogUrl = '';
    shareDialogReturnFocus = trigger || null;
    if (els.shareDialogName) els.shareDialogName.textContent = plan.name;
    if (els.shareDialogMessage) {
      els.shareDialogMessage.value = 'Preparando el enlace…';
    }
    if (els.shareDialogFeedback) {
      els.shareDialogFeedback.hidden = true;
      els.shareDialogFeedback.classList.remove('is-error');
      els.shareDialogFeedback.textContent = '';
    }
    [els.shareDialogCopy, els.shareDialogNative].forEach((button) => {
      if (button) button.disabled = true;
    });
    els.shareDialog.hidden = false;
    document.body.classList.add('fiestas-plan-share-open');
    els.shareDialogNative?.focus();

    const url = await resolvePlanShareUrl(plan, page.dataset.planImportUrl);
    if (resolution !== shareDialogResolution || shareDialogPlan !== plan) return;
    shareDialogUrl = url;
    if (els.shareDialogMessage) els.shareDialogMessage.value = createPlanShareMessage(plan, url);
    [els.shareDialogCopy, els.shareDialogNative].forEach((button) => {
      if (button) button.disabled = false;
    });
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
    renderPlanPicker(els.picker, els.pickerIcon, state.plans, state.view, state.selectedPlanId);
    renderPlanIconPicker(els.createIcons, state.newPlanIcon, 'create');
    renderPlanIconPicker(els.editorIcons, state.editingIcon, 'edit');
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
    const canManagePlan = state.view === 'plan' && Boolean(state.selectedPlanId) && state.plans.some((plan) => plan.id === state.selectedPlanId);
    if (els.manageMenuTrigger) els.manageMenuTrigger.hidden = !canManagePlan;
    if (!canManagePlan) closePlanManageMenu();
    renderDeleteConfirmation(els.deleteConfirm, els.deleteConfirmName, state.plans, state.pendingDeletePlanId);
    if (state.focusActivityId) scrollToPlanActivity();
  };

  const scrollToPlanActivity = () => {
    const activityId = state.focusActivityId;
    if (!activityId) return;
    state.focusActivityId = '';
    window.requestAnimationFrame(() => {
      const target = [...(els.planDetail?.querySelectorAll('[data-plan-event-id]') || [])]
        .find((card) => card.dataset.planEventId === activityId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('is-overlap-target');
      window.setTimeout(() => target.classList.remove('is-overlap-target'), 1800);
    });
  };

  const closePlanEditor = () => {
    if (!els.editor) return;
    els.editor.hidden = true;
    document.body.classList.remove('fiestas-plan-editor-open');
    state.editingPlanId = '';
    state.editingIcon = DEFAULT_PLAN_ICON;
  };

  const openDeleteConfirmation = (plan, trigger) => {
    if (!plan || !els.deleteConfirm) return;
    deleteDialogReturnFocus = trigger || null;
    state.pendingDeletePlanId = plan.id;
    closePlanManageMenu();
    render();
    els.deleteConfirmAccept?.focus();
  };

  const closeDeleteConfirmation = (restoreFocus = true) => {
    state.pendingDeletePlanId = '';
    render();
    if (restoreFocus) deleteDialogReturnFocus?.focus();
    deleteDialogReturnFocus = null;
  };

  const openPlanEditor = (plan, trigger) => {
    if (!plan || !els.editor) return;
    state.editingPlanId = plan.id;
    state.editingIcon = normalizePlanIcon(plan.icon);
    if (els.editorName) els.editorName.value = plan.name;
    renderPlanIconPicker(els.editorIcons, state.editingIcon, 'edit');
    els.editor.hidden = false;
    document.body.classList.add('fiestas-plan-editor-open');
    els.editorName?.focus();
    if (trigger) els.editor.dataset.returnFocus = trigger.dataset.planRename || '';
  };

  const closePlanPicker = (restoreFocus = false) => {
    if (!els.pickerMenu || !els.pickerTrigger) return;
    els.pickerMenu.hidden = true;
    els.pickerTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) els.pickerTrigger.focus();
  };

  const selectPlan = (value) => {
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
    } else {
      state.view = 'plan';
      state.selectedPlanId = value;
      state.creatingPlan = false;
      state.pendingDeletePlanId = '';
    }
    closePlanPicker();
    updatePlanUrl(state);
    render();
  };

  els.picker?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-plan-picker-option]');
    if (option) {
      selectPlan(option.dataset.planPickerOption || '__saved__');
      return;
    }
    if (event.target.closest('[data-plan-picker-trigger]')) {
      const isOpen = els.pickerTrigger?.getAttribute('aria-expanded') === 'true';
      if (isOpen) closePlanPicker(true);
      else {
        els.pickerMenu.hidden = false;
        els.pickerTrigger.setAttribute('aria-expanded', 'true');
        els.pickerMenu.querySelector('[aria-selected="true"]')?.focus();
      }
    }
  });

  els.picker?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePlanPicker(true);
      return;
    }
    const options = [...(els.pickerMenu?.querySelectorAll('[data-plan-picker-option]') || [])];
    if (!options.length) return;
    const currentIndex = options.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (els.pickerTrigger === document.activeElement) {
        els.pickerMenu.hidden = false;
        els.pickerTrigger.setAttribute('aria-expanded', 'true');
      }
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[nextIndex].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1].focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const option = event.target.closest('[data-plan-picker-option]');
      if (option) {
        event.preventDefault();
        selectPlan(option.dataset.planPickerOption || '__saved__');
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (els.picker && !els.picker.contains(event.target)) closePlanPicker();
    if (els.manageMenu && !els.manageMenu.contains(event.target) && !els.manageMenuTrigger?.contains(event.target)) closePlanManageMenu();
  });

  els.editorForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const plan = state.plans.find((item) => item.id === state.editingPlanId);
    const name = String(els.editorName?.value || '').trim();
    if (!plan) {
      closePlanEditor();
      return;
    }
    if (!name || name.length > MAX_PLAN_NAME_LENGTH) {
      showFeedback(els.feedback, `Escribe un nombre de entre 1 y ${MAX_PLAN_NAME_LENGTH} caracteres.`);
      return;
    }
    updatePlan(plan.id, { name, icon: state.editingIcon });
    closePlanEditor();
    render();
    showFeedback(els.feedback, 'Plan actualizado.');
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
      trackPlanExported('url');
      showShareDialogFeedback('Mensaje copiado al portapapeles.');
    } catch (_) {
      showShareDialogFeedback('No se pudo copiar el mensaje.', true);
    }
  });
  els.shareDialogNative?.addEventListener('click', async () => {
    if (!shareDialogPlan) return;
    const url = shareDialogUrl || await resolvePlanShareUrl(shareDialogPlan, page.dataset.planImportUrl);
    try {
      if (!navigator.share) throw new Error('Share unavailable');
      await navigator.share({
        title: shareDialogPlan.name,
        text: createPlanShareText(shareDialogPlan),
        url
      });
      trackPlanShared('url');
      showShareDialogFeedback('Enlace compartido.');
    } catch (error) {
      if (error?.name === 'AbortError') {
        showShareDialogFeedback('Compartición cancelada.');
        return;
      }
      try {
        await copyText(createPlanShareMessage(shareDialogPlan, url));
        trackPlanExported('url');
        showShareDialogFeedback('No se pudo abrir compartir. Mensaje copiado.');
      } catch (_) {
        showShareDialogFeedback('No se pudo compartir el enlace.', true);
      }
    }
  });

  els.createForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = String(els.createInput?.value || '').trim();
    if (!name || name.length > MAX_PLAN_NAME_LENGTH) {
      showFeedback(els.feedback, `Escribe un nombre de entre 1 y ${MAX_PLAN_NAME_LENGTH} caracteres.`);
      return;
    }
    const plan = createPlan(makeUniquePlanName(name), [], { icon: state.newPlanIcon });
    trackPlanCreated('manual');
    if (els.createInput) els.createInput.value = '';
    state.newPlanIcon = DEFAULT_PLAN_ICON;
    state.view = 'plan';
    state.selectedPlanId = plan.id;
    state.creatingPlan = false;
    updatePlanUrl(state);
    render();
    showFeedback(els.feedback, 'Plan creado.');
  });

  page.addEventListener('click', async (event) => {
    const iconChoice = event.target.closest('[data-plan-icon-choice]');
    if (iconChoice && page.contains(iconChoice)) {
      const picker = iconChoice.closest('[data-plan-icon-picker]');
      const icon = normalizePlanIcon(iconChoice.dataset.planIconChoice);
      if (picker?.dataset.planIconPicker === 'create') state.newPlanIcon = icon;
      if (picker?.dataset.planIconPicker === 'edit') state.editingIcon = icon;
      renderPlanIconPicker(picker, icon, picker?.dataset.planIconPicker || 'create');
      return;
    }

    const manageTrigger = event.target.closest('[data-plan-manage-menu-trigger]');
    if (manageTrigger) {
      const isOpen = els.manageMenuTrigger?.getAttribute('aria-expanded') === 'true';
      if (isOpen) closePlanManageMenu(true);
      else openPlanManageMenu();
      return;
    }

    const manageAction = event.target.closest('[data-plan-manage-action]');
    if (manageAction) {
      const plan = state.plans.find((item) => item.id === state.selectedPlanId);
      if (!plan) return;
      const action = manageAction.dataset.planManageAction;
      closePlanManageMenu();
      if (action === 'calendar') {
        await exportCalendar(eventsForPlan(plan, state.events), plan.name, els.feedback, plan.id);
      } else if (action === 'edit') {
        openPlanEditor(plan, manageAction);
      } else if (action === 'delete') {
        openDeleteConfirmation(plan, els.manageMenuTrigger);
      }
      return;
    }

    if (event.target.closest('[data-plan-editor-close]')) {
      closePlanEditor();
      return;
    }

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

    const overlapOpenButton = event.target.closest('[data-plan-overlap-open]');
    if (overlapOpenButton) {
      state.view = 'plan';
      state.selectedPlanId = overlapOpenButton.dataset.planOverlapOpen || '';
      state.selectedDay = 'all';
      state.focusActivityId = overlapOpenButton.dataset.planOverlapActivity || '';
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
      if (plan) openPlanEditor(plan, renameButton);
      return;
    }

    const deleteButton = event.target.closest('[data-plan-delete]');
    if (deleteButton) {
      const plan = state.plans.find((item) => item.id === deleteButton.dataset.planDelete);
      if (!plan) return;
      openDeleteConfirmation(plan, deleteButton);
      return;
    }

    const cancelDeleteButton = event.target.closest('[data-plan-delete-confirm-cancel]');
    if (cancelDeleteButton) {
      closeDeleteConfirmation();
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
      deleteDialogReturnFocus = null;
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
    if (event.key === 'Escape' && els.editor && !els.editor.hidden) closePlanEditor();
    if (event.key === 'Escape' && els.deleteConfirm && !els.deleteConfirm.hidden) closeDeleteConfirmation();
    if (event.key === 'Escape' && els.manageMenu && !els.manageMenu.hidden) closePlanManageMenu(true);
  });
  subscribeToPlans(() => render());
  render();
}

export function setupPlanImportPage(rawEvents = []) {
  const page = document.querySelector('[data-fiestas-plan-import]');
  if (!page) return;

  const events = normalizeEvents(rawEvents);
  const eventIds = new Set(events.map((event) => event.id));
  const title = page.querySelector('[data-plan-import-title]');
  const status = page.querySelector('[data-plan-import-status]');
  const sharedPreview = page.querySelector('[data-plan-import-shared-preview]');
  const sharedDetail = page.querySelector('[data-plan-import-shared-detail]');
  const preview = page.querySelector('[data-plan-import-preview]');
  const actions = page.querySelector('[data-plan-import-actions]');
  const cancelButton = page.querySelector('[data-plan-import-cancel]');
  const confirmButton = page.querySelector('[data-plan-import-confirm]');
  const success = page.querySelector('[data-plan-import-success]');
  const viewLink = page.querySelector('[data-plan-import-view]');
  let pending = null;
  let sharedPlan = null;
  let sharedSelectedDay = 'all';
  let sharedAddedPlan = null;

  const renderSharedPreview = () => {
    if (!sharedDetail || !sharedPlan) return;
    renderImportSharedPreview(sharedDetail, sharedPlan, events, sharedSelectedDay, sharedAddedPlan);
  };

  const reset = () => {
    pending = null;
    sharedPlan = null;
    sharedSelectedDay = 'all';
    sharedAddedPlan = null;
    if (title) title.textContent = 'Importar plan';
    if (sharedPreview) sharedPreview.hidden = true;
    sharedDetail?.replaceChildren();
    if (preview) preview.hidden = true;
    if (actions) actions.hidden = true;
    if (confirmButton) confirmButton.hidden = true;
    if (success) success.hidden = true;
    if (viewLink) {
      viewLink.hidden = true;
      viewLink.removeAttribute('href');
    }
  };

  const processText = (text, source = 'url') => {
    const result = validateImport(text, eventIds);
    if (!result.ok) {
      reset();
      setStatus(status, result.message, true);
      trackPlanImportError(result.errorType);
      return;
    }
    pending = { ...result, source };
    sharedPlan = source === 'url' && result.plans.length === 1 ? result.plans[0] : null;
    sharedSelectedDay = 'all';
    sharedAddedPlan = null;
    if (sharedPlan) {
      if (title) title.textContent = 'Vista previa';
      if (sharedPreview) sharedPreview.hidden = false;
      if (preview) preview.hidden = true;
      if (actions) actions.hidden = true;
      renderSharedPreview();
    } else {
      renderImportPreview(preview, result, events);
    }
    const importablePlans = result.plans.filter((plan) => plan.isValid && plan.validIds.length);
    if (actions && !sharedPlan) actions.hidden = false;
    if (confirmButton) confirmButton.hidden = !importablePlans.length;
    setStatus(
      status,
      sharedPlan && !sharedPlan.isValid
        ? 'Este plan no es válido: contiene identificadores de actividades que no existen en esta edición.'
        : importablePlans.length
          ? (sharedPlan ? 'Revisa el plan antes de añadirlo.' : 'Revisa los planes antes de guardarlos.')
          : 'No hay actividades compatibles para importar.',
      !importablePlans.length
    );
  };

  sharedDetail?.addEventListener('click', (event) => {
    const dayButton = event.target.closest('[data-plan-day]');
    if (dayButton && !dayButton.disabled && sharedPlan) {
      sharedSelectedDay = dayButton.dataset.planDay || 'all';
      renderSharedPreview();
      return;
    }

    const favoriteButton = event.target.closest('[data-plan-toggle-favorite]');
    if (favoriteButton && sharedPlan) {
      const activityId = favoriteButton.dataset.planToggleFavorite || '';
      const ids = new Set(readFavoriteIds());
      const isSaved = ids.has(activityId);
      if (isSaved) ids.delete(activityId);
      else ids.add(activityId);
      writeFavoriteIds([...ids]);
      trackFavoriteChanged(activityId, !isSaved);
      renderSharedPreview();
      return;
    }

    const addButton = event.target.closest('[data-plan-import-shared-add]');
    if (!addButton || !sharedPlan || !sharedPlan.validIds.length || sharedAddedPlan) return;
    event.preventDefault();
    try {
      const name = makeUniquePlanName(sharedPlan.name);
      sharedAddedPlan = createPlan(name, sharedPlan.validIds, { icon: sharedPlan.icon });
      trackPlanImported(pending?.source || 'url');
      renderSharedPreview();
      const missingLabel = sharedPlan.missingIds.length
        ? ` ${sharedPlan.missingIds.length} actividad${sharedPlan.missingIds.length === 1 ? '' : 'es'} no compatible${sharedPlan.missingIds.length === 1 ? '' : 's'} no se ha añadido.`
        : '';
      setStatus(status, `Plan “${sharedAddedPlan.name}” añadido a Mi plan.${missingLabel}`, false);
    } catch (_) {
      setStatus(status, 'No se ha podido guardar este plan en este navegador.', true);
    }
  });

  const processHash = () => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('hash')) {
      setStatus(status, 'Abre el enlace compartido de un plan para previsualizarlo.', false);
      return;
    }
    const hash = params.get('hash') || '';
    if (!hash) {
      reset();
      setStatus(status, 'El enlace compartido no contiene ningún plan.', true);
      trackPlanImportError('empty_hash');
      return;
    }
    if (hash.length > MAX_IMPORT_HASH_LENGTH) {
      reset();
      setStatus(status, 'El enlace compartido supera el límite permitido.', true);
      trackPlanImportError('file_too_large');
      return;
    }
    try {
      processText(decodePlanImportHash(hash), 'url');
    } catch (_) {
      reset();
      setStatus(status, 'El enlace compartido no es válido.', true);
      trackPlanImportError('invalid_base64');
    }
  };

  cancelButton?.addEventListener('click', () => {
    reset();
    setStatus(status, 'Importación cancelada.', false);
  });

  confirmButton?.addEventListener('click', () => {
    if (!pending) return;
    const importablePlans = pending.plans.filter((plan) => plan.isValid && plan.validIds.length);
    if (!importablePlans.length) return;
    const importedPlans = importablePlans.map((plan) => {
      const name = makeUniquePlanName(plan.name);
      return createPlan(name, plan.validIds, { icon: plan.icon });
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
    pending = null;
  });

  processHash();
}

export function setupPlanSelector() {
  if (selectorInitialized) return;
  const selector = document.querySelector('[data-fiestas-plan-selector]');
  if (!selector) return;
  const options = document.querySelector('[data-fiestas-event-options]');
  selectorInitialized = true;

  let activityId = '';
  let optionsActivityId = '';
  let selectedIcon = DEFAULT_PLAN_ICON;
  let creatingPlan = false;
  const close = () => {
    selector.hidden = true;
    activityId = '';
    creatingPlan = false;
    selectedIcon = DEFAULT_PLAN_ICON;
  };
  const closeOptions = () => {
    if (options) options.hidden = true;
    optionsActivityId = '';
  };
  const openSelector = (nextActivityId) => {
    activityId = nextActivityId || '';
    if (!activityId) return;
    creatingPlan = false;
    render();
    selector.hidden = false;
    selector.querySelector('[data-plan-selector-close]')?.focus();
  };
  const render = () => {
    const list = selector.querySelector('[data-plan-selector-list]');
    const empty = selector.querySelector('[data-plan-selector-empty]');
    const createToggle = selector.querySelector('[data-plan-selector-create-toggle]');
    const createForm = selector.querySelector('[data-plan-selector-create-form]');
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
    if (createToggle) {
      createToggle.hidden = plans.length === 0 || creatingPlan;
      createToggle.setAttribute('aria-expanded', String(creatingPlan));
    }
    if (createForm) createForm.hidden = plans.length > 0 && !creatingPlan;
    renderPlanIconPicker(selector.querySelector('[data-plan-selector-icons]'), selectedIcon, 'selector');
  };

  document.addEventListener('click', (event) => {
    const iconChoice = event.target.closest('[data-plan-icon-choice]');
    if (iconChoice && selector.contains(iconChoice)) {
      selectedIcon = normalizePlanIcon(iconChoice.dataset.planIconChoice);
      renderPlanIconPicker(selector.querySelector('[data-plan-selector-icons]'), selectedIcon, 'selector');
      return;
    }

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
    if (event.target.closest('[data-plan-selector-create-toggle]')) {
      creatingPlan = true;
      render();
      selector.querySelector('[data-plan-selector-create-input]')?.focus();
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
    const plan = createPlan(makeUniquePlanName(name), activityId ? [activityId] : [], { icon: selectedIcon });
    trackPlanCreated('manual');
    if (activityId) trackPlanActivityAdded(activityId);
    if (input) input.value = '';
    selectedIcon = DEFAULT_PLAN_ICON;
    creatingPlan = false;
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
    const heading = document.createElement('div');
    heading.className = 'fiestas-plan-summary-heading';
    const planIcon = document.createElement('span');
    planIcon.className = 'fiestas-plan-summary-icon';
    planIcon.append(iconNode(`fa-solid ${getPlanIcon(plan.icon).className}`));
    heading.append(planIcon, textNode('h3', plan.name));
    card.append(heading);
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
    exportRow.append(actionButton('Calendario', 'fa-calendar-plus', { 'data-plan-export-calendar': plan.id }));
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
  document.body.classList.toggle('fiestas-plan-delete-open', Boolean(plan));
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

  const hero = document.createElement('section');
  hero.className = 'fiestas-plan-hero';
  const copy = document.createElement('div');
  copy.className = 'fiestas-plan-hero-copy';
  copy.append(textNode('h2', options.isSaved ? 'Mis guardados' : (plan.name || 'Tu plan')));
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

  renderPlanTimeline(container, plan, events, plans, selectedDay, options);

  const bottomActions = document.createElement('div');
  bottomActions.className = 'fiestas-plan-bottom-actions';
  bottomActions.append(
    actionButton('Compartir mi plan', 'fa-arrow-up-from-bracket', { className: 'fiestas-plan-share-button', 'data-plan-share': plan.id }),
    actionButton('Añadir al calendario', 'fa-calendar-plus', { className: 'fiestas-plan-calendar-button', 'data-plan-export-calendar': plan.id })
  );
  container.append(bottomActions);
}

export function renderPlanTimeline(container, plan, events, plans = [], selectedDay = 'all', options = {}) {
  if (!container || !plan) return;
  const planEvents = eventsForPlan(plan, events);
  const activeDay = selectedDay !== 'all' && selectedDay && planEvents.some((event) => event.date === selectedDay)
    ? selectedDay
    : 'all';
  const dayEvents = activeDay === 'all' ? planEvents : planEvents.filter((event) => event.date === activeDay);
  const dateChoices = getPlanDateChoices(events);

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
        row.append(rail, renderPlanTimelineEvent(event, plan.id, plans, events, options));
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
}

function renderPlanTimelineEvent(event, planId, plans, events, options = {}) {
  const card = document.createElement('article');
  card.className = 'fiestas-plan-timeline-card';
  card.dataset.planEventId = event.id;

  const top = document.createElement('div');
  top.className = 'fiestas-plan-timeline-card-top';
  const title = linkNode(event.title || 'Actividad sin título', event.urlPath || eventUrl(event));
  title.className = 'fiestas-plan-timeline-title';
  top.append(title);
  const saved = readFavoriteIds().includes(event.id);
  const bookmarkButton = document.createElement('button');
  const isSaved = options.isSaved || saved;
  bookmarkButton.type = 'button';
  bookmarkButton.className = 'fiestas-plan-bookmark';
  bookmarkButton.classList.toggle('is-active', isSaved);
  bookmarkButton.dataset.planToggleFavorite = event.id;
  bookmarkButton.setAttribute('aria-label', isSaved ? 'Quitar de guardados' : 'Guardar actividad');
  bookmarkButton.setAttribute('aria-pressed', String(isSaved));
  bookmarkButton.append(iconNode(`${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark`));
  top.append(bookmarkButton);
  card.append(top);

  const location = document.createElement('p');
  location.className = 'fiestas-plan-timeline-location';
  location.append(iconNode('fa-solid fa-location-dot'), textNode('span', event.location || event.zone || 'Lugar por confirmar'));
  card.append(location);

  const tag = textNode('span', `#${slugifyPlanTag(event.tags?.[0] || event.type || 'Actividad')}`);
  tag.className = 'fiestas-plan-tag';
  const footer = document.createElement('div');
  footer.className = 'fiestas-plan-timeline-card-footer';
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'fiestas-plan-more';
  moreButton.dataset.fiestasMoreOptions = 'true';
  moreButton.dataset.eventId = event.id;
  moreButton.setAttribute('aria-label', 'Más opciones para esta actividad');
  moreButton.setAttribute('aria-haspopup', 'dialog');
  moreButton.append(iconNode('fa-solid fa-ellipsis'));
  footer.append(tag, moreButton);
  card.append(footer);

  const overlap = findPlanOverlap(event, planId, plans, events);
  if (overlap) {
    const warning = document.createElement('div');
    warning.className = 'fiestas-plan-overlap-warning';
    warning.append(iconNode('fa-solid fa-triangle-exclamation'));
    warning.append(textNode('span', `Se solapa con «${overlap.activityName}»`));
    const review = actionButton('Ver', 'fa-chevron-right', {
      className: 'fiestas-plan-overlap-review',
      'data-plan-overlap-open': overlap.planId,
      'data-plan-overlap-activity': overlap.activityId
    });
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

function createPlanShareText(plan) {
  return `Échale un vistazo al plan «${plan.name}» para las Fiestas y Ferias de Valladolid 2026.`;
}

function createPlanShareMessage(plan, shareUrl) {
  return `${createPlanShareText(plan)}\n ${shareUrl}`;
}

async function resolvePlanShareUrl(plan, importUrl) {
  const fallbackUrl = createPlanImportUrl(plan, importUrl);
  const sourcePlanId = String(plan?.sourcePlanId || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourcePlanId)) return fallbackUrl;

  try {
    const sourcePlan = await loadCommunityPlanForSharing(sourcePlanId);
    if (!sourcePlan || !plansMatchSource(plan, sourcePlan)) return fallbackUrl;
    return createCommunityPlanUrl(sourcePlanId, importUrl);
  } catch (_) {
    return fallbackUrl;
  }
}

async function loadCommunityPlanForSharing(sourcePlanId) {
  if (!communityPlansCatalogPromise) {
    communityPlansCatalogPromise = fetchJsonForSharing(COMMUNITY_PLANS_CATALOG_URL);
  }
  const catalog = await communityPlansCatalogPromise;
  if (!catalog || catalog.schemaVersion !== 1 || catalog.festival !== FESTIVAL_ID || !Array.isArray(catalog.plans)) {
    throw new Error('Invalid community plans catalog');
  }
  const entry = catalog.plans.find((item) => item?.id === sourcePlanId);
  if (!entry?.url) throw new Error('Community plan not found');
  const sourceUrl = new URL(entry.url, new URL(COMMUNITY_PLANS_CATALOG_URL, window.location.href));
  if (sourceUrl.origin !== window.location.origin) throw new Error('Invalid community plan origin');
  const payload = await fetchJsonForSharing(sourceUrl.href);
  const sourcePlan = payload?.plans?.[0];
  if (payload?.schemaVersion !== 1 || payload?.festival !== FESTIVAL_ID || !sourcePlan) {
    throw new Error('Invalid community plan export');
  }
  return sourcePlan;
}

async function fetchJsonForSharing(url) {
  const response = await fetch(new URL(url, window.location.href), {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Community plan request failed with ${response.status}`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('Community plan is too large');
  return JSON.parse(text);
}

export function plansMatchSource(plan, sourcePlan) {
  if (!plan || !sourcePlan) return false;
  return String(plan.name || '').trim() === String(sourcePlan.name || '').trim()
    && normalizePlanIcon(plan.icon) === normalizePlanIcon(sourcePlan.icon)
    && sameActivityIds(plan.activityIds, sourcePlan.activityIds);
}

function sameActivityIds(left, right) {
  const normalizeIds = (value) => [...new Set((Array.isArray(value) ? value : []).map(String).map((id) => id.trim()).filter(Boolean))].sort();
  return JSON.stringify(normalizeIds(left)) === JSON.stringify(normalizeIds(right));
}

export function createCommunityPlanUrl(sourcePlanId, importUrl) {
  const currentUrl = globalThis.location?.href || 'http://localhost/';
  const base = new URL(importUrl || currentUrl, currentUrl);
  const url = new URL(`/planes/${sourcePlanId}/`, base.origin);
  url.searchParams.set('mtm_campaign', 'share');
  return url.toString();
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

export function validateImport(text, eventIds) {
  const source = String(text || '');
  if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) return { ok: false, message: 'El plan compartido supera el límite de 256 KiB.', errorType: 'file_too_large' };
  let value;
  try {
    value = JSON.parse(source);
  } catch (_) {
    return { ok: false, message: 'El enlace compartido no contiene un plan válido.', errorType: 'invalid_json' };
  }
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || value.festival !== FESTIVAL_ID) {
    return { ok: false, message: 'El plan compartido no pertenece a Fiestas Valladolid 2026 o usa una versión incompatible.', errorType: 'unsupported_format' };
  }
  const hasPlans = Object.prototype.hasOwnProperty.call(value, 'plans');
  if (hasPlans && !Array.isArray(value.plans)) {
    return { ok: false, message: 'La lista de planes compartidos no es válida.', errorType: 'unsupported_format' };
  }
  const rawPlans = hasPlans ? value.plans : [value];
  if (!rawPlans.length) return { ok: false, message: 'El enlace compartido no contiene ningún plan.', errorType: 'unsupported_format' };
  const plans = [];
  for (const rawPlan of rawPlans) {
    if (!rawPlan || typeof rawPlan !== 'object') {
      return { ok: false, message: 'Uno de los planes compartidos no es válido.', errorType: 'unsupported_format' };
    }
    const name = String(rawPlan.name || '').trim();
    if (!name || name.length > MAX_PLAN_NAME_LENGTH) {
      return { ok: false, message: `Cada nombre debe tener entre 1 y ${MAX_PLAN_NAME_LENGTH} caracteres.`, errorType: 'invalid_name' };
    }
    if (/[<>]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
      return { ok: false, message: `El nombre “${name}” contiene caracteres no permitidos.`, errorType: 'invalid_name' };
    }
    if (!Array.isArray(rawPlan.activityIds) || rawPlan.activityIds.length > MAX_IMPORT_ACTIVITIES) {
      return { ok: false, message: `El plan “${name}” supera el máximo de ${MAX_IMPORT_ACTIVITIES} actividades.`, errorType: 'too_many_activities' };
    }
    const rawIcon = rawPlan.icon === undefined || rawPlan.icon === null ? '' : String(rawPlan.icon).trim().toLocaleLowerCase('en');
    if (rawIcon && !PLAN_ICON_OPTIONS.some((option) => option.id === rawIcon)) {
      return { ok: false, message: `El plan “${name}” usa un icono no compatible.`, errorType: 'invalid_icon' };
    }
    const ids = [...new Set(rawPlan.activityIds.map(String).map((id) => id.trim()).filter(Boolean))];
    const validIds = ids.filter((id) => eventIds.has(id));
    const missingIds = ids.filter((id) => !eventIds.has(id));
    plans.push({
      name,
      icon: normalizePlanIcon(rawPlan.icon),
      ids,
      validIds,
      missingIds,
      isValid: missingIds.length === 0
    });
  }
  return {
    ok: true,
    plans
  };
}

function renderImportSharedPreview(container, plan, events, selectedDay, addedPlan = null) {
  if (!container || !plan) return;
  container.replaceChildren();

  const validEvents = events.filter((event) => plan.validIds.includes(event.id));
  const dayCount = new Set(validEvents.map((event) => event.date)).size;
  const header = document.createElement('header');
  header.className = 'fiestas-community-plan-detail-head';
  const icon = document.createElement('span');
  icon.className = 'fiestas-community-plan-detail-icon';
  icon.append(iconNode(`fa-solid ${getPlanIcon(plan.icon).className}`));
  const copy = document.createElement('div');
  copy.className = 'fiestas-community-plan-detail-head-copy';
  copy.append(textNode('h2', plan.name), textNode('p', 'Plan compartido'));
  const summary = textNode('p', `${plan.validIds.length} ${plan.validIds.length === 1 ? 'actividad' : 'actividades'} · ${dayCount} ${dayCount === 1 ? 'día' : 'días'}`);
  summary.className = 'fiestas-community-plan-detail-summary';
  header.append(icon, copy, summary);
  container.append(header);

  const actions = document.createElement('div');
  actions.className = 'fiestas-community-plan-detail-actions fiestas-community-plan-detail-actions-top';
  if (addedPlan) {
    const link = document.createElement('a');
    link.className = 'fiestas-community-plan-add';
    link.href = `/plan/?tab=plans&plan=${encodeURIComponent(addedPlan.id)}`;
    link.append(iconNode('fa-solid fa-eye'), textNode('span', 'Ver plan'));
    actions.append(link);
  } else if (plan.isValid && plan.validIds.length) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'fiestas-community-plan-add';
    add.dataset.planImportSharedAdd = 'true';
    add.append(iconNode('fa-solid fa-plus'), textNode('span', 'Añadir a mis planes'));
    actions.append(add);
  }
  container.append(actions);

  if (plan.missingIds.length) {
    const warning = textNode('p', `Plan no válido: ${plan.missingIds.length} actividad${plan.missingIds.length === 1 ? '' : 'es'} no existe${plan.missingIds.length === 1 ? '' : 'n'} en esta edición y no se puede añadir.`);
    warning.className = 'fiestas-community-plan-detail-warning';
    container.append(warning);
  }
  if (!plan.validIds.length) {
    const empty = textNode('p', 'No hay actividades compatibles con esta edición de Fiestas Valladolid 2026.');
    empty.className = 'fiestas-community-plan-detail-warning';
    container.append(empty);
    return;
  }

  renderPlanTimeline(container, { id: addedPlan?.id || '__shared_preview__', activityIds: plan.validIds }, events, [], selectedDay);
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
    const title = document.createElement('div');
    title.className = 'fiestas-plan-import-item-title';
    const icon = document.createElement('span');
    icon.className = 'fiestas-plan-import-item-icon';
    icon.append(iconNode(`fa-solid ${getPlanIcon(plan.icon).className}`));
    title.append(icon, textNode('h3', plan.name));
    item.append(title);
    item.append(textNode('p', plan.isValid
      ? `${plan.validIds.length} actividades válidas de ${plan.ids.length}.`
      : `Plan no válido: ${plan.validIds.length} actividades válidas de ${plan.ids.length}.`));
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

function renderPlanPicker(picker, pickerIcon, plans, view, selectedPlanId) {
  if (!picker) return;
  const trigger = picker.querySelector('[data-plan-picker-trigger]');
  const label = picker.querySelector('[data-plan-picker-label]');
  const menu = picker.querySelector('[data-plan-picker-menu]');
  if (!trigger || !label || !menu) return;

  const selectedValue = view === 'saved' ? '__saved__' : selectedPlanId || '__create__';
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const selectedLabel = view === 'saved' ? 'Guardados' : selectedPlan?.name || 'Crear un plan nuevo';
  const selectedIcon = getPlanIcon(view === 'saved' ? 'stars' : selectedPlan?.icon);
  label.textContent = selectedLabel;
  trigger.setAttribute('aria-label', `Seleccionar plan: ${selectedLabel}`);
  if (pickerIcon) pickerIcon.className = `fa-solid ${selectedIcon.className}`;
  menu.replaceChildren();

  const appendOption = ({ value, text, icon, kind = '' }) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `fiestas-plan-picker-option${kind ? ` is-${kind}` : ''}`;
    option.dataset.planPickerOption = value;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(value === selectedValue));
    option.append(iconNode(`fa-solid ${icon}`), textNode('span', text));
    if (value === selectedValue) option.append(iconNode('fa-solid fa-check'));
    menu.append(option);
  };

  appendOption({ value: '__saved__', text: 'Guardados', icon: getPlanIcon('stars').className });
  if (plans.length) {
    const plansLabel = textNode('p', 'Mis planes');
    plansLabel.className = 'fiestas-plan-picker-group-label';
    menu.append(plansLabel);
    plans.forEach((plan) => appendOption({
      value: plan.id,
      text: plan.name,
      icon: getPlanIcon(plan.icon).className
    }));
  }
  const divider = document.createElement('div');
  divider.className = 'fiestas-plan-picker-divider';
  menu.append(divider);
  appendOption({ value: '__create__', text: 'Crear un plan nuevo', icon: 'fa-plus', kind: 'action' });
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function renderPlanIconPicker(container, selectedIcon, pickerName) {
  if (!container) return;
  container.replaceChildren(...PLAN_ICON_OPTIONS.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fiestas-plan-icon-choice';
    button.dataset.planIconChoice = option.id;
    button.setAttribute('aria-label', option.label);
    button.setAttribute('aria-pressed', String(option.id === normalizePlanIcon(selectedIcon)));
    button.classList.toggle('is-selected', option.id === normalizePlanIcon(selectedIcon));
    button.title = option.label;
    button.append(iconNode(`fa-solid ${option.className}`));
    container.append(button);
    return button;
  }));
  container.dataset.planIconPicker = pickerName;
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
      if (other.id === event.id) continue;
      if (start < otherEnd && otherStart < end) {
        return {
          planId: plan.id,
          name: plan.name,
          activityId: other.id,
          activityName: other.title || 'Actividad sin título'
        };
      }
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
