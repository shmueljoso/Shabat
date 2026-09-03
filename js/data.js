// ===== קבועי זמן =====
const GAME_START_MIN = 360;               // 06:00 בדקות מחצות
const GAME_MIN_PER_REAL_SEC = 2;          // 1 שעת משחק = 30 שניות אמת (קבוע, לא תלוי ברמת קושי)
const SEC_PER_GAME_MIN = 1 / GAME_MIN_PER_REAL_SEC; // 0.5 שניות אמת לדקת משחק

// רמות קושי: "שבת מוקדמת" מקדימה את כניסת השבת בשעה וחצי, וכתוצאה מהיחס
// הקבוע לעיל גם מקצרת את משך המשחק האמיתי - פחות זמן לאותן משימות בדיוק.
const DIFFICULTY_MODES = {
  normal: { id: 'normal', label: 'רגיל', gameEndMin: 1080 },      // 18:00
  early: { id: 'early', label: 'שבת מוקדמת', gameEndMin: 990 },   // 16:30
};

function gameMinToRealSec(gameMin) {
  return gameMin * SEC_PER_GAME_MIN;
}

// ===== דמויות המשפחה =====
const CHARACTERS = [
  { id: 'dad', name: 'אבא', avatar: '👨', wake: 420, license: true,
    bonuses: { chicken: 0.25, hotplate: 0.25 } },
  { id: 'mom', name: 'אמא', avatar: '👩', wake: 420, license: true, manager: true,
    bonuses: {} },
  { id: 'yael', name: 'יעל', avatar: '👧', wake: 540, license: false,
    bonuses: { babysitting: 0.30 } },
  { id: 'chaim', name: 'חיים', avatar: '🧑', wake: 600, license: false,
    bonuses: { schnitzel: 0.30 } },
  { id: 'binyamin', name: 'בנימין', avatar: '🧑', wake: 600, license: false,
    bonuses: { packbags: 0.30, general: 0.30 } },
  { id: 'shmuel', name: 'שמואל', avatar: '🧔', wake: 660, license: true,
    bonuses: { bigshopping: 0.35, fridayround: 0.35 } },
  { id: 'tzivya', name: 'צביה', avatar: '👩', wake: 720, license: false,
    bonuses: { cake: 0.25, generalcooking: 0.25, babysitting: 0.25 } },
];

// ===== משפחות אורחים (הגעה אקראית 12:30-14:30 = דקות 750-870) =====
const GUEST_ARRIVAL_MIN_EARLIEST = 750;
const GUEST_ARRIVAL_MIN_LATEST = 870;
const BABYSIT_UNATTENDED_LIMIT_GAMEMIN = 40; // 20 שניות אמת

const GUEST_FAMILIES = [
  { id: 'chana', name: 'חנה', avatar: '👩', license: false,
    kids: ['אסתר', 'בת שבע'],
    bonuses: { challah: 0.25, kugel: 0.25, generalcooking: 0.25 } },
  { id: 'elisheva', name: 'אלישבע', avatar: '👩', license: true,
    kids: ['חיים', 'תמר'],
    bonuses: { cake: 0.25 } },
  { id: 'benzi', name: 'בנצי', avatar: '👨', license: true,
    kids: ['אביטל', 'טליה'],
    bonuses: { meat: 0.25 } },
  { id: 'david', name: 'דוד', avatar: '👨', license: true,
    kids: ['תינוקת'],
    bonuses: { all: 0.25 } },
];

// ===== משימות =====
// room: kitchen | salon | upper | outside
// categories: לחישוב בונוסים
// count: כמה פעמים יש לבצע
// critical: משימת ברזל
// slots: כמה דמויות נדרשות בו-זמנית
// license: true = חובה בעל רישיון | 'any' = לפחות אחד מהמוקצים חייב רישיון
const TASKS = [
  // בחוץ
  { id: 'shopping_big', name: 'קניות גדולות (סופר)', icon: '🛒', room: 'outside',
    gameMin: 60, categories: ['bigshopping'], count: 1, slots: 1, license: true },
  { id: 'shopping_small', name: 'קניות קטנות (פיצוחים וג\'לים)', icon: '🍬', room: 'outside',
    gameMin: 30, categories: ['smallshopping'], count: 2, slots: 1, license: false },
  { id: 'friday_round', name: 'סיבוב יום שישי (חלוקה)', icon: '🚚', room: 'outside',
    gameMin: 90, categories: ['fridayround'], count: 1, slots: 2, license: 'any',
    requires: ['pack_bags'] },

  // מטבח
  { id: 'cook_chicken', name: 'בישול עוף', icon: '🍗', room: 'kitchen',
    gameMin: 90, categories: ['chicken', 'generalcooking'], count: 2, slots: 1, license: false,
    requiresIngredients: true },
  { id: 'cook_meat', name: 'בישול בשר', icon: '🥩', room: 'kitchen',
    gameMin: 90, categories: ['meat', 'generalcooking'], count: 2, slots: 1, license: false,
    requiresIngredients: true },
  { id: 'cook_schnitzel', name: 'הכנת שניצלים', icon: '🍤', room: 'kitchen',
    gameMin: 60, categories: ['schnitzel', 'generalcooking'], count: 2, slots: 1, license: false },
  { id: 'cook_kugel', name: 'הכנת קוגלים', icon: '🍲', room: 'kitchen',
    gameMin: 60, categories: ['kugel', 'generalcooking'], count: 2, slots: 1, license: false },
  { id: 'cook_cake', name: 'אפיית עוגות', icon: '🍰', room: 'kitchen',
    gameMin: 60, categories: ['cake'], count: 2, slots: 1, license: false },
  { id: 'bake_challah', name: 'אפיית חלות', icon: '🍞', room: 'kitchen',
    gameMin: 100, categories: ['challah'], count: 1, slots: 1, license: false, critical: true },
  { id: 'hotplate_clocks', name: 'פלטה וכיוון שעוני שבת', icon: '⏰', room: 'kitchen',
    gameMin: 30, categories: ['hotplate'], count: 1, slots: 1, license: false, critical: true },
  { id: 'clean_kitchen', name: 'ניקיון מטבח', icon: '🧽', room: 'kitchen',
    gameMin: 90, categories: ['general'], count: 1, slots: 1, license: false,
    requiresAllCookingDone: true },

  // סלון
  { id: 'unload_groceries', name: 'פריקת קניות למטבח', icon: '📦', room: 'salon',
    gameMin: 40, categories: ['general'], count: 1, slots: 1, license: false,
    requires: ['shopping_big'] },
  { id: 'pack_bags', name: 'אריזת שקיות לחלוקה', icon: '🛍️', room: 'salon',
    gameMin: 60, categories: ['packbags'], count: 1, slots: 1, license: false },
  { id: 'set_table', name: 'עריכת שולחן שבת', icon: '🍽️', room: 'salon',
    gameMin: 50, categories: ['general'], count: 1, slots: 1, license: false },

  // קומות עליונות ומעברים
  { id: 'tidy_stairs', name: 'סידור מדרגות', icon: '🪜', room: 'upper',
    gameMin: 40, categories: ['general'], count: 1, slots: 1, license: false },
  { id: 'laundry', name: 'מיון והפעלת כביסה', icon: '🧺', room: 'upper',
    gameMin: 60, categories: ['general'], count: 1, slots: 1, license: false },
  // חדרי אורחים: הופכים למשימת ברזל ברגע שאח/אחות נשואים מגיעים!
  { id: 'guest_room_1', name: 'הכנת חדר אורחים 1', icon: '🛏️', room: 'upper',
    gameMin: 50, categories: ['general'], count: 1, slots: 1, license: false, guestRoomIndex: 1 },
  { id: 'guest_room_2', name: 'הכנת חדר אורחים 2', icon: '🛏️', room: 'upper',
    gameMin: 50, categories: ['general'], count: 1, slots: 1, license: false, guestRoomIndex: 2 },
];

const COOKING_TASK_IDS = ['cook_chicken', 'cook_meat', 'cook_schnitzel', 'cook_kugel', 'cook_cake', 'bake_challah'];

const SHOWER_GAME_MIN = 20; // 10 שניות אמת לדמות

const JOKER_CLEANER_REAL_SEC = 15;
const JOKER_CLEANER_COOLDOWN_SEC = 60;

const MESS_TASK_GAME_MIN = 20; // 10 שניות אמת - משימת סידור בלגן

const TABS = [
  { id: 'ground', label: 'קומה תחתונה', icon: '🏠' },
  { id: 'upper', label: 'קומה עליונה', icon: '🛌' },
  { id: 'outside', label: 'בחוץ', icon: '🚗' },
  { id: 'family', label: 'משפחה', icon: '👨‍👩‍👧‍👦' },
];
