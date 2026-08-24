import {
  trackPwaInstallClicked,
  trackPwaInstallAccepted,
  trackPwaInstallCancelled,
  trackPwaInstalled,
  trackPwaIosHelpOpened,
  trackPwaServiceWorkerError
} from './analytics.js';

const DISMISSED_KEY = 'fiestasPucela:pwa-install-dismissed';
const INSTALLED_KEY = 'fiestasPucela:pwa-installed';
const IOS_HELP_SEEN_KEY = 'fiestasPucela:pwa-ios-help-seen';
let deferredInstallPrompt = null;
let previousFocus = null;
let installRequestSource = 'install';
let installProgressTimer = null;

const INSTALL_PROGRESS_TIMEOUT = 25000;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isAppleMobile() {
  const userAgent = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(userAgent) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
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

function wasIosHelpSeen() {
  try {
    return window.localStorage.getItem(IOS_HELP_SEEN_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

function markIosHelpSeen() {
  try {
    window.localStorage.setItem(IOS_HELP_SEEN_KEY, 'true');
  } catch (_) {}
}

function updateInstallHint() {
  const installed = isStandalone() || wasInstalled();
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const installDot = document.querySelector('[data-pwa-install-hint]');
  const iosDot = document.querySelector('[data-pwa-ios-hint]');
  if (installDot) installDot.hidden = installed || !installButton || installButton.hidden || installButton.dataset.pwaInstallReady !== 'true';
  if (iosDot) iosDot.hidden = installed || !iosButton || iosButton.hidden;
}

function updateInstallActions() {
  const installButton = document.querySelector('[data-pwa-install]');
  const iosButton = document.querySelector('[data-pwa-ios-help-open]');
  const installed = isStandalone() || wasInstalled();
  const dismissed = wasDismissed();
  const canInstall = Boolean(deferredInstallPrompt) && !installed;
  const canShowInlineInstall = canInstall && !dismissed;
  const canKeepInstallMenuItem = !installed && dismissed;
  const canShowIosHelp = isAppleMobile() && !installed;
  const iosHelpSeen = wasIosHelpSeen();

  if (installButton) {
    installButton.hidden = !(canInstall || canKeepInstallMenuItem);
    installButton.dataset.pwaInstallReady = String(canInstall);
  }
  if (iosButton) iosButton.hidden = !canShowIosHelp;
  updateInstallHint();
  const detail = {
    available: canInstall || canShowIosHelp,
    installable: canInstall,
    iosHelp: canShowIosHelp,
    inlineAvailable: canShowInlineInstall || (canShowIosHelp && !iosHelpSeen),
    installed,
    iosHelpSeen
  };
  window.__FIESTAS_PWA_STATE__ = detail;
  window.dispatchEvent(new CustomEvent('fiestas:pwa-availability', { detail }));
}

function closeMenu() {
  document.querySelector('[data-menu-close]')?.click();
}

function getIosDialog() {
  return document.querySelector('[data-pwa-ios-help]');
}

function getInstallProgressDialog() {
  return document.querySelector('[data-pwa-install-progress]');
}

function hideInstallProgress() {
  const dialog = getInstallProgressDialog();
  if (installProgressTimer) window.clearTimeout(installProgressTimer);
  installProgressTimer = null;
  if (dialog) dialog.hidden = true;
}

function showInstallProgress() {
  if (isStandalone() || wasInstalled()) return;
  const dialog = getInstallProgressDialog();
  if (!dialog) return;
  dialog.hidden = false;
  if (installProgressTimer) window.clearTimeout(installProgressTimer);
  installProgressTimer = window.setTimeout(hideInstallProgress, INSTALL_PROGRESS_TIMEOUT);
}

function openIosHelp() {
  const dialog = getIosDialog();
  if (!dialog) return;
  previousFocus = document.activeElement;
  closeMenu();
  markIosHelpSeen();
  dialog.hidden = false;
  trackPwaIosHelpOpened();
  updateInstallActions();
  dialog.querySelector('[data-pwa-ios-help-close]')?.focus();
}

function closeIosHelp() {
  const dialog = getIosDialog();
  if (!dialog) return;
  dialog.hidden = true;
  if (previousFocus instanceof HTMLElement) previousFocus.focus();
  previousFocus = null;
}

async function promptInstall(source = 'install') {
  if (!deferredInstallPrompt) return false;
  const promptEvent = deferredInstallPrompt;
  installRequestSource = source;
  closeMenu();
  trackPwaInstallClicked(source);

  let choice;
  try {
    await promptEvent.prompt();
    choice = await promptEvent.userChoice;
  } catch (_) {
    deferredInstallPrompt = null;
    installRequestSource = 'install';
    updateInstallActions();
    return false;
  }

  deferredInstallPrompt = null;
  if (choice.outcome === 'accepted') {
    trackPwaInstallAccepted(source);
    showInstallProgress();
  } else if (choice.outcome === 'dismissed') {
    setDismissed();
    trackPwaInstallCancelled(source);
    installRequestSource = 'install';
  }
  updateInstallActions();
  return choice.outcome === 'accepted';
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
    updateInstallActions();
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
    deferredInstallPrompt = null;
    hideInstallProgress();
    trackPwaInstalled(installRequestSource);
    installRequestSource = 'install';
    updateInstallActions();
  });

  window.addEventListener('fiestas:pwa-install-request', (event) => {
    if (event.detail?.mode === 'ios-help') {
      openIosHelp();
      return;
    }
    promptInstall(event.detail?.source || 'agenda_cta');
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-pwa-install-progress-close]')) {
      event.preventDefault();
      hideInstallProgress();
      return;
    }
    if (event.target.closest('[data-pwa-install]')) {
      event.preventDefault();
      updateInstallHint();
      promptInstall('menu');
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
    const progressDialog = getInstallProgressDialog();
    if (event.key === 'Escape' && progressDialog && !progressDialog.hidden) hideInstallProgress();
  });
}

try {
  setupPwa();
} catch (error) {
  console.error('No se pudo inicializar la instalación PWA.', error);
}
