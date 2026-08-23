import {
  trackPwaInstallAccepted,
  trackPwaInstallAvailable,
  trackPwaInstallCancelled,
  trackPwaInstalled,
  trackPwaIosHelpOpened,
  trackPwaServiceWorkerError
} from './analytics.js';

const DISMISSED_KEY = 'fiestasPucela:pwa-install-dismissed';
const INSTALLED_KEY = 'fiestasPucela:pwa-installed';
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

function wasInstalled() {
  try {
    return window.localStorage.getItem(INSTALLED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function markInstalled() {
  try {
    window.localStorage.setItem(INSTALLED_KEY, 'true');
  } catch (_) {}
}

function updateInstallHint() {
  const installed = isStandalone() || wasInstalled();
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const installDot = document.querySelector('[data-pwa-install-hint]');
  const iosDot = document.querySelector('[data-pwa-ios-hint]');
  if (installDot) installDot.hidden = installed || !installButton || installButton.hidden;
  if (iosDot) iosDot.hidden = installed || !iosButton || iosButton.hidden;
}

function updateInstallActions() {
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const installed = isStandalone() || wasInstalled();
  const canInstall = Boolean(deferredInstallPrompt) && !installed && !wasDismissed();
  const canShowIosHelp = isAppleMobile() && !installed;

  if (installButton) installButton.hidden = !canInstall;
  if (iosButton) iosButton.hidden = !canShowIosHelp;
  updateInstallHint();
  window.dispatchEvent(new CustomEvent('fiestas:pwa-availability', {
    detail: { available: canInstall || canShowIosHelp }
  }));
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

  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  deferredInstallPrompt = null;
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
    markInstalled();
    deferredInstallPrompt = null;
    trackPwaInstalled();
    updateInstallActions();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-pwa-install]')) {
      event.preventDefault();
      updateInstallHint();
      promptInstall();
      return;
    }
    if (event.target.closest('[data-pwa-ios-help-open]')) {
      event.preventDefault();
      updateInstallHint();
      openIosHelp();
      return;
    }
    if (event.target.closest('[data-pwa-ios-help-close]') || event.target.closest('[data-pwa-ios-help-backdrop]')) {
      event.preventDefault();
      closeIosHelp();
    }
  });

  window.addEventListener('keydown', (event) => {
    const dialog = getIosDialog();
    if (event.key === 'Escape' && dialog && !dialog.hidden) closeIosHelp();
  });
}

try {
  setupPwa();
} catch (error) {
  console.error('No se pudo inicializar la instalación PWA.', error);
}
