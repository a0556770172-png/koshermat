// ==========================================================
// חיבור ל-Supabase
// ==========================================================
const SUPABASE_URL = "https://ibzlbpbsqyfpmwomxbgm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mtYSf_WBf9xsDQKa0BsP8Q_-o9TsNVg";

// עוטפים את fetch בטיימאאוט - כדי שאף בקשה לשרת (התחברות, הרשמה, מהלכים,
// צ'אט וכו') לא תישאר "תקועה" לנצח בלי תגובה. ברשתות עם סינון תוכן, לפעמים
// בקשה נבלעת בשקט בלי להחזיר שגיאה בכלל - וכתוצאה מזה כפתורים נשארים תקועים
// (למשל "נרשם...") כי ה-Promise פשוט אף פעם לא נפתר. אחרי 15 שניות ללא
// תגובה, הבקשה תבוטל ותוחזר שגיאה ברורה במקום תקיעה אינסופית.
function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: fetchWithTimeout }
});

window.sb = sb;
