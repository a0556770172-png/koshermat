// ==========================================================
// Edge Function: set-guest-credentials
// מטרה: לאפשר למשתמש שנכנס עם "קוד גישת אורח" (מייל פנימי אקראי,
// guest-XXXX@koshermat.guest) להגדיר לעצמו בפרופיל מייל אמיתי +
// סיסמה קבועה - מיידית, בלי ללחוץ על שום קישור אימות שנשלח למייל
// החדש (זו ההתנהגות הרגילה של Supabase ל-updateUser עם מייל חדש,
// אבל מי שנכנס בלי מייל בכלל לא אמור להיתקל בשום שלב אימות נוסף
// גם כשהוא בוחר "לשדרג" את החשבון שלו).
//
// הפונקציה מזהה את המשתמש לפי ה-access token שהוא שולח (מוודאת בצד
// השרת עם מפתח השירות שזה באמת המשתמש המחובר), ומעדכנת את המייל
// והסיסמה שלו ישירות עם email_confirm:true.
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "לא מחובר" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "משתמש לא מזוהה" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { email, password } = await req.json();
    if (!email || !password || String(password).length < 6) {
      return new Response(JSON.stringify({ error: "יש להזין מייל וסיסמה (לפחות 6 תווים)" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userData.user.id, {
      email,
      password,
      email_confirm: true,
    });

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
