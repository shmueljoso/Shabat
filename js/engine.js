// ===== מנוע המשחק =====

function createInitialState(difficultyId) {
  const mode = DIFFICULTY_MODES[difficultyId] || DIFFICULTY_MODES.normal;
  const gameEndMin = mode.gameEndMin;
  const realDurationSec = (gameEndMin - GAME_START_MIN) * SEC_PER_GAME_MIN;

  const characters = CHARACTERS.map(c => ({
    ...c,
    status: 'sleeping', // sleeping | idle | working | showering
    currentTaskId: null,
    currentRoom: null,
    showered: false,
    showerStart: null,
    showerEnd: null,
    isGuest: false,
  }));

  const tasks = {};
  TASKS.forEach(def => {
    tasks[def.id] = { remaining: def.count, doneCount: 0, active: null };
  });

  const shuffled = [...GUEST_FAMILIES].sort(() => Math.random() - 0.5);
  const numFamilies = Math.random() < 0.5 ? 1 : 2;
  const chosen = shuffled.slice(0, numFamilies);
  const earliestReal = (GUEST_ARRIVAL_MIN_EARLIEST - GAME_START_MIN) / GAME_MIN_PER_REAL_SEC;
  const latestReal = (GUEST_ARRIVAL_MIN_LATEST - GAME_START_MIN) / GAME_MIN_PER_REAL_SEC;
  const guestQueue = chosen
    .map(fam => ({
      family: fam,
      arrivalReal: earliestReal + Math.random() * (latestReal - earliestReal),
      arrived: false,
    }))
    .sort((a, b) => a.arrivalReal - b.arrivalReal);

  return {
    started: false,
    ended: false,
    result: null,
    difficulty: mode.id,
    gameEndMin,
    realDurationSec,
    elapsedReal: 0,
    gameMin: GAME_START_MIN,
    characters,
    tasks,
    flags: { ingredientsAvailable: false },
    guestQueue,
    kidsPresentCount: 0,
    babysittingCharId: null,
    unattendedGameMinAccum: 0,
    messMeter: 0,
    messTasks: [],
    messTaskCounter: 0,
    jokerCleaner: { lastUsedReal: -Infinity, active: null },
    log: [],
    soundEvents: [], // אירועים לניגון סאונד - הצרכן (ui.js/main.js) מרוקן ומנגן, ראה playSound ב-audio.js
    // האחוז עולה בהדרגה ולעולם לא יורד (doneCount/showered רק מצטברים), אז
    // "הזמן שלקח להגיע לאחוז הסופי" הוא מדד נקי לשיאים - מתעדכן רק כשהאחוז עולה.
    bestPercent: 0,
    bestPercentReal: 0,
  };
}

function computeCharSpeedMultiplier(character, taskLike, state) {
  let bonus = 0;
  const b = character.bonuses || {};
  (taskLike.categories || []).forEach(cat => {
    if (b[cat]) bonus += b[cat];
  });
  if (b.all) bonus += b.all;

  const mom = state.characters.find(c => c.id === 'mom');
  if (mom && mom.id !== character.id && mom.status === 'working' &&
      taskLike.room && mom.currentRoom === taskLike.room) {
    bonus += 0.20;
  }
  return 1 + bonus;
}

// כמה חדרי אורחים חייבים להיות מוכנים - חדר לכל אח/אחות נשואים שהגיעו
function requiredGuestRooms(state) {
  return Math.min(2, state.guestQueue.filter(g => g.arrived).length);
}

function readyGuestRooms(state) {
  return (state.tasks['guest_room_1'].remaining === 0 ? 1 : 0) +
         (state.tasks['guest_room_2'].remaining === 0 ? 1 : 0);
}

// משימת ברזל קבועה, או חדר אורחים שהפך לחובה אחרי הגעת האחים
function isTaskCritical(def, state) {
  if (def.critical) return true;
  if (def.guestRoomIndex) return requiredGuestRooms(state) >= def.guestRoomIndex;
  return false;
}

function isTaskUnlocked(def, state) {
  if (def.requires) {
    for (const rid of def.requires) {
      if (state.tasks[rid].doneCount < 1) return false;
    }
  }
  if (def.requiresIngredients && !state.flags.ingredientsAvailable) return false;
  if (def.requiresAllCookingDone) {
    for (const cid of COOKING_TASK_IDS) {
      if (state.tasks[cid].remaining > 0) return false;
    }
  }
  return true;
}

function assignTask(state, taskId, characterIds) {
  const def = TASKS.find(d => d.id === taskId);
  const t = state.tasks[taskId];
  if (!def || !t) return { ok: false, error: 'משימה לא נמצאה' };
  if (t.remaining <= 0) return { ok: false, error: 'המשימה כבר הושלמה' };
  if (t.active) return { ok: false, error: 'המשימה כבר בביצוע' };
  if (!isTaskUnlocked(def, state)) return { ok: false, error: 'המשימה נעולה' };
  if (characterIds.length !== def.slots) return { ok: false, error: `נדרשות ${def.slots} דמויות` };

  const chars = characterIds.map(id => state.characters.find(c => c.id === id));
  if (chars.some(c => !c || c.status !== 'idle')) return { ok: false, error: 'דמות לא זמינה' };
  if (def.license === true && !chars.every(c => c.license)) return { ok: false, error: 'נדרש בעל רישיון נהיגה' };
  if (def.license === 'any' && !chars.some(c => c.license)) return { ok: false, error: 'לפחות אחד חייב להיות בעל רישיון' };

  let bonusSum = 0;
  chars.forEach(c => { bonusSum += computeCharSpeedMultiplier(c, def, state) - 1; });
  const multiplier = 1 + bonusSum;
  const durationSec = gameMinToRealSec(def.gameMin) / multiplier;

  chars.forEach(c => { c.status = 'working'; c.currentTaskId = taskId; c.currentRoom = def.room; });
  t.active = { charIds: characterIds, startReal: state.elapsedReal, endReal: state.elapsedReal + durationSec, durationSec };
  return { ok: true };
}

function assignMessTask(state, messId, characterId) {
  const m = state.messTasks.find(x => x.id === messId);
  if (!m || m.active || m.remaining <= 0) return { ok: false, error: 'לא זמין' };
  const c = state.characters.find(ch => ch.id === characterId);
  if (!c || c.status !== 'idle') return { ok: false, error: 'דמות לא זמינה' };
  const mult = computeCharSpeedMultiplier(c, m, state);
  const durationSec = gameMinToRealSec(m.gameMin) / mult;
  c.status = 'working'; c.currentTaskId = m.id; c.currentRoom = 'salon';
  m.active = { charIds: [c.id], startReal: state.elapsedReal, endReal: state.elapsedReal + durationSec };
  return { ok: true };
}

function assignBabysitter(state, characterId) {
  const c = state.characters.find(ch => ch.id === characterId);
  if (!c || c.status !== 'idle') return { ok: false, error: 'דמות לא זמינה' };
  if (state.babysittingCharId) releaseBabysitter(state);
  c.status = 'working'; c.currentTaskId = 'babysitting'; c.currentRoom = 'salon';
  state.babysittingCharId = characterId;
  return { ok: true };
}

function releaseBabysitter(state) {
  const c = state.characters.find(ch => ch.id === state.babysittingCharId);
  if (c && c.currentTaskId === 'babysitting') { c.status = 'idle'; c.currentTaskId = null; c.currentRoom = null; }
  state.babysittingCharId = null;
}

function startShower(state, characterId) {
  const c = state.characters.find(ch => ch.id === characterId);
  if (!c || c.status !== 'idle' || c.showered) return { ok: false, error: 'לא זמין' };
  const mult = computeCharSpeedMultiplier(c, { categories: [], room: 'upper' }, state);
  const durationSec = gameMinToRealSec(SHOWER_GAME_MIN) / mult;
  c.status = 'showering'; c.currentRoom = 'upper';
  c.showerStart = state.elapsedReal;
  c.showerEnd = state.elapsedReal + durationSec;
  return { ok: true };
}

function useJokerCleaner(state) {
  const def = TASKS.find(d => d.id === 'clean_kitchen');
  const t = state.tasks['clean_kitchen'];
  if (!isTaskUnlocked(def, state)) return { ok: false, error: 'המטבח עדיין לא מוכן לניקיון' };
  if (t.remaining <= 0 || t.active) return { ok: false, error: 'אין צורך' };
  const jc = state.jokerCleaner;
  if (jc.active) return { ok: false, error: 'הג\'וקר כבר בפעולה' };
  if (state.elapsedReal - jc.lastUsedReal < JOKER_CLEANER_COOLDOWN_SEC) return { ok: false, error: 'הג\'וקר בקירור' };
  jc.active = { endReal: state.elapsedReal + JOKER_CLEANER_REAL_SEC };
  jc.lastUsedReal = state.elapsedReal;
  return { ok: true };
}

function completeTask(state, def, t) {
  t.active.charIds.forEach(cid => {
    const c = state.characters.find(ch => ch.id === cid);
    if (c) { c.status = 'idle'; c.currentTaskId = null; c.currentRoom = null; }
  });
  t.remaining -= 1;
  t.doneCount += 1;
  t.active = null;
  state.log.unshift(`✅ הושלם: ${def.name}`);
  state.soundEvents.push({ type: isTaskCritical(def, state) ? 'criticalDone' : 'taskDone' });
}

function completeMessTask(state, m) {
  m.charIds = m.active.charIds;
  m.active.charIds.forEach(cid => {
    const c = state.characters.find(ch => ch.id === cid);
    if (c) { c.status = 'idle'; c.currentTaskId = null; c.currentRoom = null; }
  });
  m.remaining -= 1;
  m.doneCount += 1;
  m.active = null;
  state.messMeter = Math.max(0, state.messMeter - 20);
  state.soundEvents.push({ type: 'taskDone' });
}

function updateTaskCompletion(state) {
  TASKS.forEach(def => {
    const t = state.tasks[def.id];
    if (t.active && state.elapsedReal >= t.active.endReal) completeTask(state, def, t);
  });
  state.messTasks.forEach(m => {
    if (m.active && state.elapsedReal >= m.active.endReal) completeMessTask(state, m);
  });
}

function updateMess(state, deltaReal) {
  if (state.kidsPresentCount <= 0) return;
  const sitter = state.babysittingCharId &&
    state.characters.find(c => c.id === state.babysittingCharId && c.currentTaskId === 'babysitting');
  if (sitter) {
    state.unattendedGameMinAccum = 0;
    return;
  }
  state.unattendedGameMinAccum += deltaReal * GAME_MIN_PER_REAL_SEC;
  if (state.unattendedGameMinAccum >= BABYSIT_UNATTENDED_LIMIT_GAMEMIN) {
    state.unattendedGameMinAccum = 0;
    state.messMeter = Math.min(100, state.messMeter + 20);
    const openMess = state.messTasks.filter(m => m.remaining > 0).length;
    if (openMess < 3) {
      state.messTaskCounter++;
      state.messTasks.push({
        id: 'mess_' + state.messTaskCounter,
        name: 'סידור בלגן בסלון',
        icon: '🧸',
        room: 'salon',
        gameMin: MESS_TASK_GAME_MIN,
        categories: ['general'],
        remaining: 1,
        doneCount: 0,
        active: null,
      });
      state.log.unshift('🧸 הילדים עשו בלגן בסלון!');
      state.soundEvents.push({ type: 'alarm' });
    }
  }
}

function updateJoker(state) {
  const jc = state.jokerCleaner;
  if (jc.active && state.elapsedReal >= jc.active.endReal) {
    const t = state.tasks['clean_kitchen'];
    t.remaining = 0;
    t.doneCount = 1;
    t.active = null;
    jc.active = null;
    state.log.unshift('🧞 הג\'וקר ניקה את המטבח!');
    state.soundEvents.push({ type: 'jokerPoof' });
  }
}

function updateShowers(state) {
  state.characters.forEach(c => {
    if (c.status === 'showering' && state.elapsedReal >= c.showerEnd) {
      c.status = 'idle';
      c.showered = true;
      c.showerEnd = null;
      c.currentRoom = null;
      state.soundEvents.push({ type: 'showerDone' });
    }
  });
}

function updateGuestArrivals(state) {
  state.guestQueue.forEach(g => {
    if (!g.arrived && state.elapsedReal >= g.arrivalReal) {
      g.arrived = true;
      const newChar = {
        id: g.family.id, name: g.family.name, avatar: g.family.avatar,
        wake: 0, license: g.family.license, bonuses: g.family.bonuses,
        status: 'idle', currentTaskId: null, currentRoom: null,
        showered: false, showerStart: null, showerEnd: null, isGuest: true,
      };
      state.characters.push(newChar);
      state.kidsPresentCount += g.family.kids.length;
      state.log.unshift(`👋 ${g.family.name} הגיע/ה עם ${g.family.kids.join(' ו')}!`);
      state.log.unshift(`🛏️ חובה להכין חדר אורחים ${requiredGuestRooms(state)} - אחרת אין שבת!`);
      state.soundEvents.push({ type: 'guestArrive' });
    }
  });
}

function computeProgress(state) {
  let totalWeight = 0, doneWeight = 0;
  TASKS.forEach(def => {
    const t = state.tasks[def.id];
    totalWeight += def.gameMin * def.count;
    doneWeight += def.gameMin * t.doneCount;
  });
  const totalChars = state.characters.length;
  const showeredCount = state.characters.filter(c => c.showered).length;
  totalWeight += SHOWER_GAME_MIN * totalChars;
  doneWeight += SHOWER_GAME_MIN * showeredCount;
  const percent = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;
  return { percent, totalChars, showeredCount };
}

function updatePercentTimeline(state) {
  const { percent } = computeProgress(state);
  if (percent > state.bestPercent) {
    state.bestPercent = percent;
    state.bestPercentReal = state.elapsedReal;
  }
}

function evaluateEnd(state) {
  const challahDone = state.tasks['bake_challah'].remaining === 0;
  const hotplateDone = state.tasks['hotplate_clocks'].remaining === 0;
  const fridayDone = state.tasks['friday_round'].remaining === 0;
  const { percent, totalChars, showeredCount } = computeProgress(state);
  const showerOk = showeredCount >= totalChars / 2;
  const roomsNeeded = requiredGuestRooms(state);
  const roomsReady = readyGuestRooms(state);
  const guestRoomsOk = roomsReady >= roomsNeeded;
  const criticalFail = !challahDone || !hotplateDone || !showerOk || !guestRoomsOk;

  let tier, title, message;
  if (criticalFail) {
    tier = 'fail';
    title = 'שבת נכנסה... 😔';
    const reasons = [];
    if (!challahDone) reasons.push('החלות לא היו מוכנות בזמן');
    if (!hotplateDone) reasons.push('הפלטה ושעוני השבת לא כוונו');
    if (!showerOk) reasons.push('פחות ממחצית מבני הבית הספיקו להתקלח');
    if (!guestRoomsOk) reasons.push(`האחים הנשואים הגיעו ואין להם איפה לישון (${roomsReady}/${roomsNeeded} חדרי אורחים מוכנים)`);
    message = 'לצערנו לא הושלמו משימות הברזל: ' + reasons.join(', ') + '.';
  } else if (percent >= 95 && fridayDone) {
    tier = 'perfect';
    title = 'מטורפים! שבת שלום למשפחת יוסוביץ׳! 🕯️';
    message = `השלמתם ${percent}% מהמשימות, סיבוב החלוקה הושלם וכולם מוכנים לשבת. פשוט מושלם!`;
  } else if (percent >= 65) {
    tier = 'good';
    title = 'כל הכבוד! 🌟';
    message = `משימות הברזל בוצעו והשלמתם ${percent}% מהמשימות. שבת שלום למשפחת יוסוביץ׳!`;
  } else {
    tier = 'ok';
    title = 'שבת נכנסה בדוחק... 😅';
    message = `הצלחתם להשלים רק ${percent}% מהמשימות, אך משימות הברזל בוצעו. שבת שלום, בקושי!`;
  }
  return { tier, title, message, percent, showeredCount, totalChars, challahDone, hotplateDone, fridayDone,
           roomsNeeded, roomsReady, guestRoomsOk, difficulty: state.difficulty, timeSec: state.bestPercentReal };
}

function endGame(state) {
  state.ended = true;
  state.started = false;
  state.result = evaluateEnd(state);
  state.soundEvents.push({ type: state.result.tier });
}

function tickGame(state, deltaReal) {
  if (!state.started || state.ended) return;
  state.elapsedReal = Math.min(state.elapsedReal + deltaReal, state.realDurationSec);
  state.gameMin = Math.min(GAME_START_MIN + state.elapsedReal * GAME_MIN_PER_REAL_SEC, state.gameEndMin);

  state.characters.forEach(c => {
    if (c.status === 'sleeping' && c.wake <= state.gameMin) c.status = 'idle';
  });

  updateGuestArrivals(state);
  state.flags.ingredientsAvailable = state.tasks['unload_groceries'].doneCount >= 1;
  updateTaskCompletion(state);
  updateMess(state, deltaReal);
  updateJoker(state);
  updateShowers(state);
  updatePercentTimeline(state);

  if (state.elapsedReal >= state.realDurationSec) endGame(state);
}

function formatGameTime(gameMin) {
  const h = Math.floor(gameMin / 60);
  const m = Math.floor(gameMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatRealTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
