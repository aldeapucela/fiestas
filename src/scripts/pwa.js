import {
  trackPwaInstallAccepted,
  trackPwaInstallAvailable,
  trackPwaInstallCancelled,
  trackPwaIosHelpOpened,
  trackPwaServiceWorkerError
} from './analytics.js';

const DISMISSED_KEY = 'fiestasPucela:pwa-install-dismissed';
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

function updateInstallActions() {
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const canInstall = Boolean(deferredInstallPrompt) && !isStandalone() && !wasDismissed();
  const canShowIosHelp = isAppleMobile() && !isStandalone();

  if (installButton) installButton.hidden = !canInstall;
  if (iosButton) iosButton.hidden = !canShowIosHelp;
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
      promptInstall();
      return;
    }
    if (event.target.closest('[data-pwa-ios-help-open]')) {
      event.preventDefault();
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
