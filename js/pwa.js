// ===== PWA: התקנה ו-Service Worker =====

let deferredInstallPrompt = null;

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const b1 = document.getElementById('btn-install');
  const b2 = document.getElementById('btn-install-header');
  if (b1) b1.hidden = false;
  if (b2) b2.hidden = false;
});

function wireInstallButtons() {
  const attempt = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('btn-install').hidden = true;
    document.getElementById('btn-install-header').hidden = true;
  };
  document.getElementById('btn-install').addEventListener('click', attempt);
  document.getElementById('btn-install-header').addEventListener('click', attempt);

  if (isIOS() && !isStandalone()) {
    document.getElementById('ios-install-hint').hidden = false;
  }
}

window.addEventListener('appinstalled', () => {
  document.getElementById('btn-install').hidden = true;
  document.getElementById('btn-install-header').hidden = true;
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}
