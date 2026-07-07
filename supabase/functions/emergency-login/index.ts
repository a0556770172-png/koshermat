// ==========================================================
// Edge Function: emergency-login
// מטרה: לאחר שמנהל אישר בקשת "גישת חירום" (emergency_access_requests),
// הפונקציה הזו יוצרת קישור כניסה (magic link) בצד השרת בעזרת
// מפתח השירות (service role) של Supabase - ומחזירה ללקוח רק את
// ה-token_hash שלו, כדי שהלקוח יוכל להתחבר מיידית עם verifyOtp
// בלי לשלוח מייל בפועל ובלי צורך בשום אימות דרך תיבת הדואר.
//
// חשוב: מפתח השירות נשמר אך ורק כאן, בתוך הפונקציה בענן של Supabase,
// ואף פעם לא נחשף לדפדפן/ללקוח.
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
    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: "חסר מזהה בקשה" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // קוראים את הבקשה עם מפתח השירות (עוקף RLS) - כדי לוודא בעצמנו,
    // בצד השרת, שהבקשה הזו באמת אושרה על ידי מנהל, ולא לסמוך על הלקוח.
    const { data: reqRow, error: reqError } = await admin
      .from("emergency_access_requests")
      .select("id, email, status")
      .eq("id", request_id)
      .single();

    if (reqError || !reqRow) {
      return new Response(JSON.stringify({ error: "בקשה לא נמצאה" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (reqRow.status !== "approved") {
      return new Response(JSON.stringify({ error: "הבקשה עדיין לא אושרה על ידי מנהל" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // יוצרים קישור כניסה בצד השרת (זה גם יוצר את המשתמש אם הוא לא קיים עדיין)
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: reqRow.email,
    });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({ error: linkError?.message || "שגיאה ביצירת קישור כניסה" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        email: reqRow.email,
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
