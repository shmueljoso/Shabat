// ===== Cloudflare Pages Function: /api/leaderboard =====
// טבלת שיאים גלובלית המשותפת בין כל המכשירים, מגובה ב-Cloudflare KV.
// לפריסה: יש ליצור namespace ב-Cloudflare Dashboard (Workers & Pages -> KV)
// ולקשר אותו לפרויקט ה-Pages תחת Settings -> Functions -> KV namespace bindings,
// עם שם המשתנה LEADERBOARD_KV (בדיוק כפי שמופיע כאן, env.LEADERBOARD_KV).

const MAX_ENTRIES = 50;
const MAX_NAME_LEN = 20;
const DIFFICULTIES = ['normal', 'early'];

function keyFor(difficulty) {
  return 'leaderboard:' + difficulty;
}

function sanitizeName(name) {
  return String(name || '').trim().slice(0, MAX_NAME_LEN).replace(/[<>]/g, '');
}

function normalizeDifficulty(value) {
  return DIFFICULTIES.includes(value) ? value : 'normal';
}

async function readList(env, difficulty) {
  const raw = await env.LEADERBOARD_KV.get(keyFor(difficulty));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

// אחוז גבוה יותר קודם; בשוויון - זמן קצר יותר (הגעה מהירה יותר לאחוז הסופי) קודם.
function sortList(list) {
  return list.slice().sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    return a.timeSec - b.timeSec;
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.LEADERBOARD_KV) {
    return Response.json({ ok: false, error: 'טבלת השיאים לא מוגדרת בשרת (חסר KV binding)' }, { status: 500 });
  }
  const url = new URL(request.url);
  const difficulty = normalizeDifficulty(url.searchParams.get('difficulty'));
  const list = sortList(await readList(env, difficulty)).slice(0, MAX_ENTRIES);
  return Response.json({ ok: true, difficulty, entries: list });
}

export async function onRequestPost({ request, env }) {
  if (!env.LEADERBOARD_KV) {
    return Response.json({ ok: false, error: 'טבלת השיאים לא מוגדרת בשרת (חסר KV binding)' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ ok: false, error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const difficulty = normalizeDifficulty(body.difficulty);
  const name = sanitizeName(body.name);
  const percent = Math.round(Number(body.percent));
  const timeSec = Number(body.timeSec);

  if (!name) return Response.json({ ok: false, error: 'נא להזין שם' }, { status: 400 });
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return Response.json({ ok: false, error: 'ציון לא תקין' }, { status: 400 });
  }
  if (!Number.isFinite(timeSec) || timeSec < 0 || timeSec > 3600) {
    return Response.json({ ok: false, error: 'זמן לא תקין' }, { status: 400 });
  }

  const list = await readList(env, difficulty);
  const entry = { name, percent, timeSec, at: Date.now() };
  list.push(entry);
  const sorted = sortList(list).slice(0, MAX_ENTRIES);

  await env.LEADERBOARD_KV.put(keyFor(difficulty), JSON.stringify(sorted));

  const rankIndex = sorted.findIndex(e => e.at === entry.at && e.name === entry.name);
  return Response.json({ ok: true, difficulty, entries: sorted, rank: rankIndex >= 0 ? rankIndex + 1 : null });
}
