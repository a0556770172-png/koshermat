// ==========================================================
// חיבור ל-Supabase
// ==========================================================
const SUPABASE_URL = "https://ibzlbpbsqyfpmwomxbgm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mtYSf_WBf9xsDQKa0BsP8Q_-o9TsNVg";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

window.sb = sb;
