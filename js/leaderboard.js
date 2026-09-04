// ===== שיאים: תקשורת עם /api/leaderboard (Cloudflare Pages Function + KV) =====
// שרת גלובלי משותף לכל המכשירים. אם ה-API לא זמין (למשל אין רשת, או שהפרויקט
// לא חובר ל-KV) - כל הפונקציות כאן זורקות/דוחות, וקוד ה-UI שקורא להן אחראי
// להציג הודעת שגיאה ידידותית במקום לקרוס.

const PLAYER_NAME_KEY = 'yosovich_player_name';

function getSavedPlayerName() {
  try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch (e) { return ''; }
}

function savePlayerName(name) {
  try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch (e) { /* ignore */ }
}

async function fetchLeaderboard(difficulty) {
  const res = await fetch(`/api/leaderboard?difficulty=${encodeURIComponent(difficulty)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'לא ניתן לטעון את טבלת השיאים');
  return data.entries;
}

async function submitScore(name, percent, timeSec, difficulty) {
  const res = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, percent, timeSec, difficulty }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'שליחת הציון נכשלה');
  savePlayerName(name);
  return data;
}
