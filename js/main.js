// ===== אתחול ולולאת המשחק =====

let lastFrameTime = null;
let rafId = null;
let renderAccumulator = 0;
const RENDER_INTERVAL = 0.1; // עדכון תצוגה כל 100ms - מונע ריצוד/רינדור מיותר בכל פריים

function loop(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  const deltaReal = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  if (state.started && !state.ended) {
    tickGame(state, deltaReal);
    renderAccumulator += deltaReal;
    if (renderAccumulator >= RENDER_INTERVAL || state.ended) {
      renderAccumulator = 0;
      render();
    }
    if (state.ended) {
      showEndScreen(state.result);
    }
  }
  rafId = requestAnimationFrame(loop);
}

function startNewGame() {
  state = createInitialState(selectedDifficulty);
  state.started = true;
  currentTab = 'ground';
  switchTab('ground');
  hideStartScreen();
  hideEndScreen();
  render();
  lastFrameTime = null;
}

function initApp() {
  state = createInitialState();
  initNav();
  initDifficultyPicker();
  wireInstallButtons();
  registerServiceWorker();

  el('btn-start').addEventListener('click', startNewGame);
  el('btn-restart').addEventListener('click', startNewGame);

  render();
  rafId = requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', initApp);
