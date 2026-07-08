// ==========================================================
// Edge Function: guest-access
// מטרה: כניסה מיידית ומלאה לאתר עם "קוד גישת אורח" קבוע שהמנהל הגדיר
// בפאנל הניהול - בלי מייל, בלי שם משתמש, בלי שום שלב נוסף. ברגע
// שהקוד נכון, נוצר משתמש חדש עם מייל פנימי אקראי (המשתמש לא רואה
// אותו בכלל), ומוחזר ללקוח token_hash שמאפשר התחברות מיידית עם
// verifyOtp - באותה שיטה כמו emergency-login, רק שכאן אין בקשה
// לאישור מנהל בכלל - הקוד עצמו הוא האישור.
//
// לאחר הכניסה, המשתמש יכול (לא חובה) להגדיר בפרופיל שלו מייל/סיסמה/
// שם משתמש קבועים במקום החשבון הזמני, דרך set-guest-credentials.
// ==========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "חסר קוד גישה" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: cfgRow, error: cfgError } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "guest_access_code")
      .maybeSingle();

    if (cfgError) {
      return new Response(JSON.stringify({ error: cfgError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const validCode = cfgRow?.value;
    if (!validCode || code.trim() !== validCode) {
      return new Response(JSON.stringify({ error: "קוד גישה שגוי" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const randomId = crypto.randomUUID();
    const guestEmail = `guest-${randomId}@koshermat.guest`;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: guestEmail,
    });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({ error: linkError?.message || "שגיאה ביצירת משתמש אורח" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        email: guestEmail,
        token_hash: linkData.properties.hashed_token,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
