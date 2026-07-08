// ==========================================================
// חיבור ל-Supabase
// ==========================================================
const SUPABASE_URL = "https://ibzlbpbsqyfpmwomxbgm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mtYSf_WBf9xsDQKa0BsP8Q_-o9TsNVg";

// עוטפים את fetch בטיימאאוט - כדי שאף בקשה לשרת (התחברות, הרשמה, מהלכים,
// צ'אט וכו') לא תישאר "תקועה" לנצח בלי תגובה. ברשתות עם סינון תוכן, לפעמים
// בקשה נבלעת בשקט בלי להחזיר שגיאה בכלל - וכתוצאה מזה כפתורים נשארים תקועים
// (למשל "נרשם...") כי ה-Promise פשוט אף פעם לא נפתר. אחרי 20 שניות ללא
// תגובה (הוגדל מ-15 בעקבות משתמשים על רשתות סלולריות איטיות), הבקשה
// תבוטל ותוחזר שגיאה ברורה במקום תקיעה אינסופית.
function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: fetchWithTimeout }
});

window.sb = sb;

// עוטף כל קריאה לשרת בניסיון חוזר אוטומטי אחד, למקרה של תקלת רשת חד-פעמית
// או רשת סלולרית איטית/לא יציבה - לפני שמציגים שגיאה למשתמש. משמש בכל דפי
// ההרשמה/התחברות/גישת חירום כדי לצמצם מקרים שבהם בקשה נכשלת רק כי הרשת
// "גמגמה" לרגע אחד.
async function withRetry(fn, retries = 1, delayMs = 1200) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}
window.withRetry = withRetry;
