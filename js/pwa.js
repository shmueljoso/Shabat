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
  if (!('serviceWorker' in navigator)) return;

  // רענון חד-פעמי כשגרסת Service Worker חדשה משתלטת - כדי שאפליקציה שכבר
  // מותקנת תקבל CSS/JS מעודכנים בלי צורך לסגור ולפתוח אותה מחדש.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  });
}
