// Abrir/cerrar el drawer de navegación móvil (hamburguesa). Autocontenido para
// poder usarse en páginas que no cargan home.js, como la ficha de evento.
// ponytail: home.js todavía tiene su propia copia inline de esta lógica;
// migrarla a este módulo cuando se toque.
const MORE_HINT_SEEN_KEY = 'fiestasPucela:more-hint-seen';

function wasMoreHintSeen() {
  try {
    return window.localStorage.getItem(MORE_HINT_SEEN_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function markMoreHintSeen() {
  try {
    window.localStorage.setItem(MORE_HINT_SEEN_KEY, 'true');
  } catch (_) {}
}

function updateMoreHint(pwaAvailable = false) {
  const seen = wasMoreHintSeen();
  document.querySelectorAll('[data-menu-hint-dot]').forEach((dot) => {
    dot.hidden = seen || !pwaAvailable;
  });
}

export function setupMenuDrawer() {
  const drawer = document.querySelector('[data-menu-drawer]');
  const addEventOpenButton = document.querySelector('[data-add-event-open]');
  const addEventModal = document.querySelector('[data-add-event-modal]');
  if (!drawer) return;

  const syncState = (isOpen) => {
    drawer.setAttribute('aria-hidden', String(!isOpen));
    document.querySelectorAll('[data-menu-open]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', String(isOpen));
      trigger.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    });
  };
  const open = () => {
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    markMoreHintSeen();
    updateMoreHint();
    syncState(true);
    window.dispatchEvent(new CustomEvent('fiestas:menu-opened'));
  };
  const close = () => {
    drawer.hidden = true;
    document.body.style.overflow = '';
    syncState(false);
  };
  const openAddEventModal = (trigger = addEventOpenButton) => {
    if (!addEventModal) return;
    close();
    addEventModal.hidden = false;
    document.body.style.overflow = 'hidden';
    addEventModal.dataset.returnFocus = trigger?.getAttribute('data-add-event-open') || '';
  };
  const closeAddEventModal = () => {
    if (!addEventModal) return;
    addEventModal.hidden = true;
    document.body.style.overflow = '';
    addEventOpenButton?.focus({ preventScroll: true });
  };
  const toggle = () => (drawer.hidden ? open() : close());

  updateMoreHint();
  syncState(!drawer.hidden);
  window.addEventListener('fiestas:pwa-availability', (event) => {
    updateMoreHint(Boolean(event.detail?.available));
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-menu-open]')) {
      event.preventDefault();
      toggle();
      return;
    }
    if (event.target.closest('[data-menu-close]')) {
      event.preventDefault();
      close();
      return;
    }
    if (event.target.closest('[data-add-event-open]')) {
      event.preventDefault();
      openAddEventModal(event.target.closest('[data-add-event-open]'));
      return;
    }
    if (event.target.closest('[data-add-event-close]')) {
      event.preventDefault();
      closeAddEventModal();
      return;
    }
    // Al navegar desde un enlace del drawer, ciérralo.
    if (event.target.closest('[data-menu-drawer] a[href]')) close();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer.hidden) close();
    if (event.key === 'Escape' && addEventModal && !addEventModal.hidden) closeAddEventModal();
  });
}
