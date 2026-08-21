import {
  trackPwaInstallAccepted,
  trackPwaInstallAvailable,
  trackPwaInstallCancelled,
  trackPwaIosHelpOpened,
  trackPwaServiceWorkerError
} from './analytics.js';

const DISMISSED_KEY = 'fiestasPucela:pwa-install-dismissed';
const INSTALL_HINT_SEEN_KEY = 'fiestasPucela:pwa-install-hint-seen';
let deferredInstallPrompt = null;
let installAvailableTracked = false;
let previousFocus = null;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isAppleMobile() {
  const userAgent = window.navigator.userAgent || '';
  const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|FxiOS|Android/i.test(userAgent);
  return isSafari && (/iPad|iPhone|iPod/i.test(userAgent) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1));
}

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function setDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, 'true');
  } catch (_) {}
}

function wasInstallHintSeen() {
  try {
    return window.localStorage.getItem(INSTALL_HINT_SEEN_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function markInstallHintSeen() {
  try {
    window.localStorage.setItem(INSTALL_HINT_SEEN_KEY, 'true');
  } catch (_) {}
}

function updateInstallHint() {
  const seen = wasInstallHintSeen();
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const installDot = document.querySelector('[data-pwa-install-hint]');
  const iosDot = document.querySelector('[data-pwa-ios-hint]');
  if (installDot) installDot.hidden = seen || !installButton || installButton.hidden;
  if (iosDot) iosDot.hidden = seen || !iosButton || iosButton.hidden;
}

function markInstallHintWhenMenuIsViewed() {
  if (wasInstallHintSeen()) return;
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  if ((!installButton || installButton.hidden) && (!iosButton || iosButton.hidden)) return;
  window.setTimeout(() => {
    markInstallHintSeen();
    updateInstallHint();
  }, 500);
}

function updateInstallActions() {
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const canInstall = Boolean(deferredInstallPrompt) && !isStandalone() && !wasDismissed();
  const canShowIosHelp = isAppleMobile() && !isStandalone();

  if (installButton) installButton.hidden = !canInstall;
  if (iosButton) iosButton.hidden = !canShowIosHelp;
  updateInstallHint();
}

function closeMenu() {
  document.querySelector('[data-menu-close]')?.click();
}

function getIosDialog() {
  return document.querySelector('[data-pwa-ios-help]');
}

function openIosHelp() {
  const dialog = getIosDialog();
  if (!dialog) return;
  previousFocus = document.activeElement;
  closeMenu();
  dialog.hidden = false;
  trackPwaIosHelpOpened();
  dialog.querySelector('[data-pwa-ios-help-close]')?.focus();
}

function closeIosHelp() {
  const dialog = getIosDialog();
  if (!dialog) return;
  dialog.hidden = true;
  if (previousFocus instanceof HTMLElement) previousFocus.focus();
  previousFocus = null;
}

async function promptInstall() {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  closeMenu();
  deferredInstallPrompt = null;
  updateInstallActions();

  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  if (choice.outcome === 'accepted') {
    trackPwaInstallAccepted();
  } else {
    setDismissed();
    trackPwaInstallCancelled();
  }
  updateInstallActions();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      trackPwaServiceWorkerError();
    });
  }, { once: true });
}

export function setupPwa() {
  registerServiceWorker();
  updateInstallActions();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!installAvailableTracked) {
      installAvailableTracked = true;
      trackPwaInstallAvailable();
    }
    updateInstallActions();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallActions();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-pwa-install]')) {
      event.preventDefault();
      markInstallHintSeen();
      updateInstallHint();
      promptInstall();
      return;
    }
    if (event.target.closest('[data-pwa-ios-help-open]')) {
      event.preventDefault();
      markInstallHintSeen();
      updateInstallHint();
      openIosHelp();
      return;
    }
    if (event.target.closest('[data-pwa-ios-help-close]') || event.target.closest('[data-pwa-ios-help-backdrop]')) {
      event.preventDefault();
      closeIosHelp();
    }
  });

  window.addEventListener('fiestas:menu-opened', markInstallHintWhenMenuIsViewed);

  window.addEventListener('keydown', (event) => {
    const dialog = getIosDialog();
    if (event.key === 'Escape' && dialog && !dialog.hidden) closeIosHelp();
  });
}
