// ===== שכבת ממשק המשתמש =====

let state = null;
let currentTab = 'ground';
let sheetKind = null;   // 'task' | 'mess' | 'babysit'
let sheetTargetId = null;
let sheetSelected = [];
let toastTimer = null;
let selectedDifficulty = 'normal';

const el = id => document.getElementById(id);

function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); t.hidden = true; }, 2200);
}

function initNav() {
  const nav = el('bottom-nav');
  nav.innerHTML = '';
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.tab = tab.id;
    btn.innerHTML = `<span class="nav-icon">${tab.icon}</span><span class="nav-label">${tab.label}</span>`;
    btn.addEventListener('click', () => { playSound('tap'); switchTab(tab.id); });
    nav.appendChild(btn);
  });
  updateNavActive();
}

function switchTab(tabId) {
  currentTab = tabId;
  ['ground', 'upper', 'outside', 'family'].forEach(id => {
    el('tab-' + id).hidden = id !== tabId;
  });
  updateNavActive();
  renderCurrentTab();
}

function updateNavActive() {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === currentTab);
  });
}

function renderCurrentTab() {
  if (currentTab === 'ground') renderGround();
  else if (currentTab === 'upper') renderUpper();
  else if (currentTab === 'outside') renderOutside();
  else if (currentTab === 'family') renderFamily();
}

function render() {
  renderHeader();
  renderCurrentTab();
}

// ===== Header =====
function renderHeader() {
  el('game-clock').textContent = formatGameTime(state.gameMin);
  el('real-clock').textContent = formatRealTime(state.realDurationSec - state.elapsedReal);
  el('game-clock-badge').hidden = state.difficulty !== 'early';
  const { percent } = computeProgress(state);
  el('progress-fill').style.width = percent + '%';
  el('progress-label').textContent = percent + '%';
}

// ===== בורר רמת קושי (מסך פתיחה) =====
function initDifficultyPicker() {
  el('difficulty-picker').querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('tap');
      selectedDifficulty = btn.dataset.diff;
      el('difficulty-picker').querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
      updateOverlaySub();
    });
  });
  updateOverlaySub();
}

function updateOverlaySub() {
  const mode = DIFFICULTY_MODES[selectedDifficulty] || DIFFICULTY_MODES.normal;
  const realSec = (mode.gameEndMin - GAME_START_MIN) * SEC_PER_GAME_MIN;
  el('overlay-sub').textContent =
    `בוקר יום שישי, השעה 06:00. יש לכם ${formatRealTime(realSec)} דקות עד כניסת השבת (${formatGameTime(mode.gameEndMin)}) לנהל את המשפחה, לחלק משימות ולהספיק הכל בזמן!`;
}

// ===== כפתור השתקה =====
function initMuteButton() {
  document.querySelectorAll('.btn-mute').forEach(btn => {
    updateMuteButtons();
    btn.addEventListener('click', () => {
      const nowMuted = toggleMuted();
      updateMuteButtons();
      if (!nowMuted) playSound('tap');
    });
  });
}

function updateMuteButtons() {
  document.querySelectorAll('.btn-mute').forEach(btn => {
    btn.textContent = isMuted() ? '🔇' : '🔊';
    btn.setAttribute('aria-label', isMuted() ? 'הפעל צלילים' : 'השתק צלילים');
  });
}

// ===== כרטיסי משימות =====
function taskStatus(def, t) {
  if (t.remaining <= 0) return 'done';
  if (t.active) return 'active';
  if (!isTaskUnlocked(def, state)) return 'locked';
  return 'available';
}

function taskCardHTML(def, t) {
  const status = taskStatus(def, t);
  const countBadge = def.count > 1 ? `<span class="count-badge">${t.doneCount}/${def.count}</span>` : '';
  const critBadge = isTaskCritical(def, state) ? `<span class="crit-badge">🔥 ברזל</span>` : '';
  let body = '';
  if (status === 'active') {
    const a = t.active;
    const pct = Math.min(100, ((state.elapsedReal - a.startReal) / (a.endReal - a.startReal)) * 100);
    const names = a.charIds.map(id => (state.characters.find(c => c.id === id) || {}).avatar || '').join(' ');
    body = `<div class="task-progress"><div class="task-progress-fill" style="width:${pct}%"></div></div>
            <div class="task-meta">${names} · נותרו ${formatRealTime(a.endReal - state.elapsedReal)}</div>`;
  } else if (status === 'locked') {
    body = `<div class="task-meta locked-meta">🔒 נעול</div>`;
  } else if (status === 'done') {
    body = `<div class="task-meta done-meta">✅ הושלם</div>`;
  } else {
    const slotTxt = def.slots > 1 ? `נדרשות ${def.slots} דמויות` : 'הקש/י להצבה';
    const licTxt = def.license === true ? ' (רישיון חובה)' : def.license === 'any' ? ' (לפחות רישיון אחד)' : '';
    body = `<div class="task-meta available-meta">👆 ${slotTxt}${licTxt}</div>`;
  }
  const badges = (countBadge || critBadge) ? `<div class="task-badges">${critBadge}${countBadge}</div>` : '';
  return `
    <div class="task-card room-${def.room} status-${status}" data-task="${def.id}" data-kind="task">
      <div class="task-card-top">
        <span class="task-icon">${def.icon}</span>
        <span class="task-name">${def.name}</span>
      </div>
      ${badges}
      ${body}
    </div>`;
}

function messCardHTML(m) {
  const status = m.remaining <= 0 ? 'done' : (m.active ? 'active' : 'available');
  let body = '';
  if (status === 'active') {
    const a = m.active;
    const pct = Math.min(100, ((state.elapsedReal - a.startReal) / (a.endReal - a.startReal)) * 100);
    body = `<div class="task-progress"><div class="task-progress-fill" style="width:${pct}%"></div></div>
            <div class="task-meta">נותרו ${formatRealTime(a.endReal - state.elapsedReal)}</div>`;
  } else if (status === 'done') {
    body = `<div class="task-meta done-meta">✅ סודר</div>`;
  } else {
    body = `<div class="task-meta available-meta">👆 הקש/י להצבה</div>`;
  }
  return `
    <div class="task-card mess-card room-salon status-${status}" data-task="${m.id}" data-kind="mess">
      <div class="task-card-top">
        <span class="task-icon">${m.icon}</span>
        <span class="task-name">${m.name}</span>
      </div>
      ${body}
    </div>`;
}

function attachTaskCardHandlers(container) {
  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const kind = card.dataset.kind;
      const id = card.dataset.task;
      if (kind === 'task') {
        const def = TASKS.find(d => d.id === id);
        const t = state.tasks[id];
        const status = taskStatus(def, t);
        if (status !== 'available') {
          if (status === 'locked') { playSound('denied'); showToast('המשימה נעולה - יש להשלים תנאים מקדימים'); }
          return;
        }
        playSound('tap');
        openTaskSheet(id);
      } else if (kind === 'mess') {
        const m = state.messTasks.find(x => x.id === id);
        if (!m || m.active || m.remaining <= 0) return;
        playSound('tap');
        openMessSheet(id);
      }
    });
  });
}

// ===== קומה תחתונה =====
function renderGround() {
  const kitchenTasks = TASKS.filter(d => d.room === 'kitchen');
  el('kitchen-tasks').innerHTML = kitchenTasks.map(def => taskCardHTML(def, state.tasks[def.id])).join('');
  attachTaskCardHandlers(el('kitchen-tasks'));

  renderJoker();

  const salonDefs = TASKS.filter(d => d.room === 'salon');
  const openMess = state.messTasks.filter(m => m.remaining > 0 || m.active);
  el('salon-tasks').innerHTML =
    salonDefs.map(def => taskCardHTML(def, state.tasks[def.id])).join('') +
    openMess.map(messCardHTML).join('');
  attachTaskCardHandlers(el('salon-tasks'));

  renderBabysitCard();
}

function renderJoker() {
  const btn = el('btn-joker');
  const def = TASKS.find(d => d.id === 'clean_kitchen');
  const t = state.tasks['clean_kitchen'];
  const unlocked = isTaskUnlocked(def, state);
  if (!unlocked || t.remaining <= 0) { btn.hidden = true; return; }
  btn.hidden = false;
  const jc = state.jokerCleaner;
  if (jc.active) {
    btn.disabled = true;
    btn.textContent = `🧞 מנקה... ${formatRealTime(jc.active.endReal - state.elapsedReal)}`;
  } else {
    const cooldownLeft = JOKER_CLEANER_COOLDOWN_SEC - (state.elapsedReal - jc.lastUsedReal);
    if (cooldownLeft > 0 && jc.lastUsedReal > -Infinity) {
      btn.disabled = true;
      btn.textContent = `🧞 ג'וקר בקירור (${formatRealTime(cooldownLeft)})`;
    } else if (t.active) {
      btn.disabled = true;
      btn.textContent = `🧞 המטבח כבר מנוקה בידיים`;
    } else {
      btn.disabled = false;
      btn.textContent = `🧞 ג'וקר מנקה - ניקוי מיידי (15 שנ')`;
    }
  }
  btn.onclick = () => {
    const res = useJokerCleaner(state);
    if (!res.ok) { playSound('denied'); showToast(res.error || 'לא ניתן כרגע'); }
    else { playSound('tap'); showToast('הג\'וקר יוצא לפעולה!'); }
  };
}

function renderBabysitCard() {
  const card = el('babysitting-card');
  if (state.kidsPresentCount <= 0) { card.hidden = true; return; }
  card.hidden = false;
  const sitter = state.babysittingCharId && state.characters.find(c => c.id === state.babysittingCharId);
  const meterPct = state.messMeter;
  if (sitter) {
    card.className = 'babysit-card manned';
    card.innerHTML = `
      <div class="task-card-top">
        <span class="task-icon">🧸</span>
        <span class="task-name">מתחם שמרטפות - ${sitter.avatar} ${sitter.name} שומר/ת</span>
      </div>
      <div class="task-meta">👶 ${state.kidsPresentCount} ילדים בסלון · מד בלגן: ${meterPct}%</div>
      <button class="btn-secondary small" id="btn-release-sitter">שחרר/י משמרטפות</button>`;
    el('btn-release-sitter').onclick = () => { playSound('tap'); releaseBabysitter(state); render(); };
  } else {
    card.className = 'babysit-card unmanned';
    card.innerHTML = `
      <div class="task-card-top">
        <span class="task-icon">🧸</span>
        <span class="task-name">מתחם שמרטפות - אין שמרטף!</span>
      </div>
      <div class="task-meta locked-meta">👶 ${state.kidsPresentCount} ילדים בסלון · מד בלגן: ${meterPct}% · 👆 הקש/י להצבה</div>`;
    card.onclick = () => { playSound('tap'); openBabysitSheet(); };
  }
}

// ===== קומה עליונה =====
function renderUpper() {
  const upperDefs = TASKS.filter(d => d.room === 'upper');
  el('upper-tasks').innerHTML = upperDefs.map(def => taskCardHTML(def, state.tasks[def.id])).join('');
  attachTaskCardHandlers(el('upper-tasks'));

  const list = el('shower-list');
  list.innerHTML = state.characters.map(c => {
    let statusHTML;
    if (c.showered) statusHTML = `<span class="shower-status done">✅ מוכן/ה לשבת</span>`;
    else if (c.status === 'sleeping') statusHTML = `<span class="shower-status">😴 ישן/ה עד ${formatGameTime(c.wake)}</span>`;
    else if (c.status === 'showering') {
      const pct = Math.min(100, Math.max(0, ((state.elapsedReal - c.showerStart) / (c.showerEnd - c.showerStart)) * 100));
      statusHTML = `<div class="task-progress small"><div class="task-progress-fill" style="width:${pct}%"></div></div>`;
    } else if (c.status === 'idle') {
      statusHTML = `<button class="btn-secondary small shower-btn" data-char="${c.id}">🚿 שלח/י למקלחת</button>`;
    } else {
      statusHTML = `<span class="shower-status">🔧 עסוק/ה במשימה אחרת</span>`;
    }
    return `<div class="shower-row">
      <span class="char-avatar">${c.avatar}</span>
      <span class="char-name">${c.name}</span>
      ${statusHTML}
    </div>`;
  }).join('');
  list.querySelectorAll('.shower-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = startShower(state, btn.dataset.char);
      if (!res.ok) { playSound('denied'); showToast(res.error || 'לא ניתן כרגע'); }
      else playSound('tap');
      render();
    });
  });
}

// ===== בחוץ =====
function renderOutside() {
  const outsideDefs = TASKS.filter(d => d.room === 'outside');
  el('outside-tasks').innerHTML = outsideDefs.map(def => taskCardHTML(def, state.tasks[def.id])).join('');
  attachTaskCardHandlers(el('outside-tasks'));
}

// ===== משפחה =====
function statusLabel(c) {
  if (c.status === 'sleeping') return `😴 ישן/ה עד ${formatGameTime(c.wake)}`;
  if (c.status === 'showering') return '🚿 במקלחת';
  if (c.status === 'working') {
    if (c.currentTaskId === 'babysitting') return '🧸 שומר/ת על הילדים';
    const def = TASKS.find(d => d.id === c.currentTaskId);
    const mess = state.messTasks.find(m => m.id === c.currentTaskId);
    return `🔧 עסוק/ה: ${def ? def.name : (mess ? mess.name : c.currentTaskId)}`;
  }
  return '🙋 פנוי/ה';
}

function renderFamily() {
  el('family-list').innerHTML = state.characters.map(c => `
    <div class="family-card">
      <span class="char-avatar big">${c.avatar}</span>
      <div class="family-info">
        <div class="family-name-row">
          <b>${c.name}</b>
          ${c.license ? '<span class="lic-icon" title="בעל/ת רישיון">🚗</span>' : ''}
          ${c.isGuest ? '<span class="guest-badge">אורח/ת</span>' : ''}
        </div>
        <div class="family-status">${statusLabel(c)}</div>
        <div class="family-shower ${c.showered ? 'ok' : ''}">${c.showered ? '✅ התקלח/ה' : '⬜ טרם התקלח/ה'}</div>
      </div>
    </div>
  `).join('');

  el('event-log').innerHTML = state.log.slice(0, 20).map(l => `<div class="log-line">${l}</div>`).join('') ||
    '<div class="log-line muted">עוד לא קרה כלום...</div>';
}

// ===== Bottom Sheet =====
function openSheetShell() {
  el('sheet-backdrop').hidden = false;
  el('assign-sheet').hidden = false;
  requestAnimationFrame(() => {
    el('sheet-backdrop').classList.add('show');
    el('assign-sheet').classList.add('show');
  });
}

function closeSheet() {
  el('sheet-backdrop').classList.remove('show');
  el('assign-sheet').classList.remove('show');
  setTimeout(() => {
    el('sheet-backdrop').hidden = true;
    el('assign-sheet').hidden = true;
  }, 200);
  sheetKind = null;
  sheetTargetId = null;
  sheetSelected = [];
}

function charRowHTML(c, bonus, disabled, selected) {
  const bonusTxt = bonus > 0 ? `<span class="bonus-tag">+${Math.round(bonus * 100)}%</span>` : '';
  return `
    <div class="char-row ${disabled ? 'disabled' : ''} ${selected ? 'selected' : ''}" data-char="${c.id}">
      <span class="char-avatar">${c.avatar}</span>
      <span class="char-name">${c.name}${c.license ? ' 🚗' : ''}</span>
      ${bonusTxt}
      ${selected ? '<span class="check-mark">✓</span>' : ''}
    </div>`;
}

function openTaskSheet(taskId) {
  sheetKind = 'task';
  sheetTargetId = taskId;
  sheetSelected = [];
  renderSheet();
  openSheetShell();
}

function openMessSheet(messId) {
  sheetKind = 'mess';
  sheetTargetId = messId;
  sheetSelected = [];
  renderSheet();
  openSheetShell();
}

function openBabysitSheet() {
  sheetKind = 'babysit';
  sheetTargetId = null;
  sheetSelected = [];
  renderSheet();
  openSheetShell();
}

function renderSheet() {
  const idleChars = state.characters.filter(c => c.status === 'idle');
  const confirmBtn = el('sheet-confirm');

  if (sheetKind === 'task') {
    const def = TASKS.find(d => d.id === sheetTargetId);
    el('sheet-title').textContent = `${def.icon} ${def.name}`;
    const licTxt = def.license === true ? ' · נדרש בעל/ת רישיון נהיגה' : def.license === 'any' ? ' · לפחות דמות אחת עם רישיון' : '';
    el('sheet-sub').textContent = def.slots > 1 ? `בחרו ${def.slots} דמויות פנויות${licTxt}` : `בחרו דמות פנויה${licTxt}`;

    el('sheet-char-list').innerHTML = idleChars.map(c => {
      const mult = computeCharSpeedMultiplier(c, def, state);
      const disabled = def.license === true && !c.license;
      const selected = sheetSelected.includes(c.id);
      return charRowHTML(c, mult - 1, disabled, selected);
    }).join('') || '<p class="sheet-empty">אין כרגע דמויות פנויות וערות 😔</p>';

    if (def.slots > 1) {
      confirmBtn.hidden = false;
      confirmBtn.disabled = sheetSelected.length !== def.slots;
    } else {
      confirmBtn.hidden = true;
    }

    attachCharRowHandlers(row => {
      const cid = row.dataset.char;
      if (row.classList.contains('disabled')) { playSound('denied'); showToast('נדרש בעל/ת רישיון נהיגה למשימה זו'); return; }
      playSound('tap');
      if (def.slots > 1) {
        if (sheetSelected.includes(cid)) sheetSelected = sheetSelected.filter(x => x !== cid);
        else if (sheetSelected.length < def.slots) sheetSelected.push(cid);
        renderSheet();
      } else {
        const res = assignTask(state, def.id, [cid]);
        if (!res.ok) showToast(res.error);
        else { closeSheet(); render(); }
      }
    });

    confirmBtn.onclick = () => {
      const res = assignTask(state, def.id, sheetSelected);
      if (!res.ok) { playSound('denied'); showToast(res.error); }
      else { playSound('tap'); closeSheet(); render(); }
    };
  } else if (sheetKind === 'mess') {
    const m = state.messTasks.find(x => x.id === sheetTargetId);
    el('sheet-title').textContent = `${m.icon} ${m.name}`;
    el('sheet-sub').textContent = 'בחרו דמות פנויה';
    confirmBtn.hidden = true;
    el('sheet-char-list').innerHTML = idleChars.map(c => {
      const mult = computeCharSpeedMultiplier(c, m, state);
      return charRowHTML(c, mult - 1, false, false);
    }).join('') || '<p class="sheet-empty">אין כרגע דמויות פנויות וערות 😔</p>';

    attachCharRowHandlers(row => {
      const res = assignMessTask(state, m.id, row.dataset.char);
      if (!res.ok) { playSound('denied'); showToast(res.error); }
      else { playSound('tap'); closeSheet(); render(); }
    });
  } else if (sheetKind === 'babysit') {
    el('sheet-title').textContent = '🧸 הצבת שמרטף/ית';
    el('sheet-sub').textContent = 'בחרו דמות פנויה לשמור על הילדים בסלון';
    confirmBtn.hidden = true;
    el('sheet-char-list').innerHTML = idleChars.map(c => {
      const mult = computeCharSpeedMultiplier(c, { categories: ['babysitting'], room: 'salon' }, state);
      return charRowHTML(c, mult - 1, false, false);
    }).join('') || '<p class="sheet-empty">אין כרגע דמויות פנויות וערות 😔</p>';

    attachCharRowHandlers(row => {
      const res = assignBabysitter(state, row.dataset.char);
      if (!res.ok) { playSound('denied'); showToast(res.error); }
      else { playSound('tap'); closeSheet(); render(); }
    });
  }
}

function attachCharRowHandlers(handler) {
  el('sheet-char-list').querySelectorAll('.char-row').forEach(row => {
    row.addEventListener('click', () => handler(row));
  });
}

el('sheet-cancel').addEventListener('click', () => { playSound('tap'); closeSheet(); });
el('sheet-backdrop').addEventListener('click', closeSheet);

// ===== מסכי התחלה/סיום =====
function showEndScreen(result) {
  el('end-overlay').hidden = false;
  el('end-overlay').querySelector('.overlay-card').className = `overlay-card tier-${result.tier}`;
  el('end-title').textContent = result.title;
  el('end-message').textContent = result.message;
  el('end-stats').innerHTML = `
    <div class="stat-row"><span>אחוז השלמה כולל</span><b>${result.percent}%</b></div>
    <div class="stat-row"><span>זמן להישג</span><b>${formatRealTime(result.timeSec)}</b></div>
    <div class="stat-row"><span>מתקלחים</span><b>${result.showeredCount}/${result.totalChars}</b></div>
    <div class="stat-row"><span>חלות</span><b>${result.challahDone ? '✅' : '❌'}</b></div>
    <div class="stat-row"><span>פלטה ושעונים</span><b>${result.hotplateDone ? '✅' : '❌'}</b></div>
    ${result.roomsNeeded > 0 ? `<div class="stat-row"><span>חדרי אורחים</span><b>${result.roomsReady}/${result.roomsNeeded} ${result.guestRoomsOk ? '✅' : '❌'}</b></div>` : ''}
    <div class="stat-row"><span>סיבוב יום שישי</span><b>${result.fridayDone ? '✅' : '❌'}</b></div>
  `;
  initScoreSubmit(result);
}

function hideEndScreen() { el('end-overlay').hidden = true; }
function hideStartScreen() { el('start-overlay').hidden = true; }
function showStartScreen() { el('start-overlay').hidden = false; }

// ===== שליחת ציון לטבלת השיאים =====
function initScoreSubmit(result) {
  const form = el('score-submit');
  const input = el('player-name-input');
  const btn = el('btn-submit-score');
  const status = el('score-submit-status');
  const viewBtn = el('btn-view-leaderboard');

  form.hidden = false;
  viewBtn.hidden = true;
  form.querySelector('.score-submit-row').hidden = false;
  status.textContent = '';
  status.className = 'score-submit-status';
  input.disabled = false;
  btn.disabled = false;
  input.value = getSavedPlayerName();

  btn.onclick = async () => {
    const name = input.value.trim();
    if (!name) { playSound('denied'); status.textContent = 'נא להזין שם'; status.className = 'score-submit-status error'; return; }
    btn.disabled = true;
    input.disabled = true;
    status.textContent = 'שולח...';
    status.className = 'score-submit-status';
    try {
      const data = await submitScore(name, result.percent, result.timeSec, result.difficulty);
      playSound('tap');
      status.textContent = data.rank ? `נשלח! את/ה במקום #${data.rank} 🎉` : 'נשלח בהצלחה! 🎉';
      status.className = 'score-submit-status ok';
      form.querySelector('.score-submit-row').hidden = true;
      viewBtn.hidden = false;
      viewBtn.onclick = () => openLeaderboard(result.difficulty);
    } catch (e) {
      playSound('denied');
      status.textContent = e.message || 'שליחה נכשלה - בדקו חיבור לרשת ונסו שוב';
      status.className = 'score-submit-status error';
      btn.disabled = false;
      input.disabled = false;
    }
  };
}

// ===== טבלת שיאים (מודאל) =====
let leaderboardDifficulty = 'normal';

function initLeaderboardOverlay() {
  el('btn-leaderboard-open').addEventListener('click', () => { playSound('tap'); openLeaderboard(selectedDifficulty); });
  el('btn-leaderboard-close').addEventListener('click', () => { playSound('tap'); el('leaderboard-overlay').hidden = true; });
  el('leaderboard-diff-picker').querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('tap');
      leaderboardDifficulty = btn.dataset.diff;
      el('leaderboard-diff-picker').querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b === btn));
      loadLeaderboardList();
    });
  });
}

function openLeaderboard(difficulty) {
  leaderboardDifficulty = difficulty === 'early' ? 'early' : 'normal';
  el('leaderboard-diff-picker').querySelectorAll('.diff-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diff === leaderboardDifficulty);
  });
  el('leaderboard-overlay').hidden = false;
  loadLeaderboardList();
}

async function loadLeaderboardList() {
  const list = el('leaderboard-list');
  list.innerHTML = '<p class="sheet-empty">טוען... ⏳</p>';
  try {
    const entries = await fetchLeaderboard(leaderboardDifficulty);
    list.innerHTML = leaderboardListHTML(entries);
  } catch (e) {
    list.innerHTML = `<p class="sheet-empty">😔 ${e.message || 'לא ניתן לטעון כרגע'}</p>`;
  }
}

const MEDALS = ['🥇', '🥈', '🥉'];

function leaderboardListHTML(entries) {
  if (!entries || entries.length === 0) {
    return '<p class="sheet-empty">עדיין אין שיאים ברמה הזו - היו הראשונים! 🚀</p>';
  }
  return entries.map((e, i) => `
    <div class="leaderboard-row ${i < 3 ? 'top3' : ''}">
      <span class="lb-rank">${MEDALS[i] || '#' + (i + 1)}</span>
      <span class="lb-name">${escapeHTML(e.name)}</span>
      <span class="lb-percent">${e.percent}%</span>
      <span class="lb-time">${formatRealTime(e.timeSec)}</span>
    </div>`).join('');
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
