// Modal de suscripción (calendario / RSS). Autocontenido para poder usarse en
// páginas que no cargan home.js, como la ficha de evento.
// ponytail: home.js todavía tiene su propia copia inline de esta lógica dentro
// de su gran delegación de clicks; migrarla a este módulo cuando se toque.
export function setupSubscribe() {
  const modal = document.querySelector('[data-subscribe-modal]');
  if (!modal) return;

  const open = (section = 'calendar') => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    scrollSubscribePanel(modal, section);
    modal.querySelector('[data-subscribe-close]')?.focus({ preventScroll: true });
  };

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    const panel = modal.querySelector('.subscribe-modal-panel') || modal;
    panel.scrollTop = 0;
  };

  document.addEventListener('click', async (event) => {
    const openBtn = event.target.closest('[data-subscribe-open]');
    if (openBtn) {
      event.preventDefault();
      open(openBtn.dataset.subscribeOpen || 'calendar');
      return;
    }
    if (event.target.closest('[data-subscribe-close]')) {
      event.preventDefault();
      close();
      return;
    }
    const copyBtn = event.target.closest('[data-copy-url]');
    if (copyBtn) {
      event.preventDefault();
      await copySubscribeUrl(copyBtn);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });

  setupCategoryPicker(modal);
}

function scrollSubscribePanel(modal, section = 'calendar') {
  const panel = modal.querySelector('.subscribe-modal-panel') || modal;
  const syncScroll = () => {
    const target = modal.querySelector(`[data-subscribe-section="${section}"]`);
    const shouldPinCalendar = section === 'calendar' && window.matchMedia('(max-width: 640px)').matches;
    panel.scrollTop = 0;
    if (!target || (section === 'calendar' && !shouldPinCalendar)) {
      return;
    }
    const panelTop = panel.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    panel.scrollTop = Math.max(0, panel.scrollTop + targetTop - panelTop - 16);
  };
  syncScroll();
  window.requestAnimationFrame(() => window.requestAnimationFrame(syncScroll));
}

async function copySubscribeUrl(button) {
  const key = button.dataset.copyUrl;
  const input = document.querySelector(`[data-copy-source="${key}"]`);
  if (!input) return;
  const value = input.value;
  const originalLabel = button.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      input.removeAttribute('readonly');
      input.focus();
      input.select();
      document.execCommand('copy');
      input.setAttribute('readonly', 'readonly');
    }
    button.textContent = 'Copiado';
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1200);
  } catch {
    input.focus();
    input.select();
  }
}

function setupCategoryPicker(modal) {
  const picker = modal.querySelector('[data-category-picker]');
  const select = modal.querySelector('[data-category-select]');
  const urlInput = modal.querySelector('[data-category-url]');
  if (!picker || !select || !urlInput) return;
  const googleLink = modal.querySelector('[data-category-google]');
  const appleLink = modal.querySelector('[data-category-apple]');
  let feeds = [];
  try {
    feeds = JSON.parse(picker.dataset.feeds || '[]');
  } catch {
    feeds = [];
  }
  const syncFeed = () => {
    const selected = feeds.find((feed) => feed.slug === select.value) || feeds[0];
    if (!selected) return;
    urlInput.value = selected.url;
    urlInput.setAttribute('value', selected.url);
    if (googleLink) {
      googleLink.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(selected.webcalUrl)}`;
    }
    if (appleLink) {
      appleLink.href = selected.webcalUrl;
    }
  };
  select.addEventListener('change', syncFeed);
  syncFeed();
}
