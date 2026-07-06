// ==========================================================
// מסך חשבון מושעה: הצגת סיבת החסימה + שליחת ערעור
// ==========================================================

let ME = null;

(async function init() {
  // redirectIfBanned=false - אחרת נכנסים ללולאה: הדף הזה בעצמו נועד למשתמשים חסומים
  const auth = await requireAuth(false);
  if (!auth) return;
  ME = auth.profile;

  if (!ME.is_banned) {
    // המשתמש כבר לא חסום (אולי מנהל ביטל את החסימה) - אין מה לעשות כאן
    location.href = "lobby.html";
    return;
  }

  document.getElementById("ban-reason").textContent = ME.banned_reason || "הפרת כללי הקהילה";
  document.getElementById("ban-date").textContent = ME.banned_at ? "נחסם בתאריך: " + new Date(ME.banned_at).toLocaleDateString("he-IL") : "";

  await renderAppealArea();

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "auth.html";
  });
})();

async function renderAppealArea() {
  const area = document.getElementById("appeal-area");

  if (ME.appeals_blocked) {
    area.innerHTML = `<p class="muted text-center" style="font-size:14px;">לא ניתן לשלוח ערעורים נוספים מחשבון זה.</p>`;
    return;
  }

  const { data: appeals } = await sb
    .from("ban_appeals")
    .select("*")
    .eq("user_id", ME.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latest = appeals && appeals[0];

  if (latest && latest.status === "open") {
    area.innerHTML = `
      <div class="card" style="background:var(--glass);">
        <div class="muted" style="font-size:13px; margin-bottom:6px;">הערעור שלך:</div>
        <div>${escapeHtml(latest.message)}</div>
        <div class="muted mt-1" style="font-size:12px;">נשלח ${timeAgo(latest.created_at)} · ממתין לבדיקת הצוות</div>
      </div>`;
    return;
  }

  const previousNote = latest
    ? `<p class="muted" style="font-size:12px; margin-bottom:8px;">הערעור הקודם שלך ${latest.status === "dismissed" ? "נדחה" : "טופל"}. אפשר לשלוח ערעור נוסף:</p>`
    : "";

  area.innerHTML = `
    ${previousNote}
    <form id="appeal-form" class="flex flex-col gap-1">
      <label>למה שווה לבטל את החסימה שלך?</label>
      <textarea id="appeal-message" rows="4" required minlength="5" placeholder="הסבר בקצרה..." style="width:100%; resize:vertical;"></textarea>
      <button type="submit" class="btn btn-primary btn-block mt-1">📨 שלח ערעור</button>
    </form>`;

  document.getElementById("appeal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const textarea = document.getElementById("appeal-message");
    const message = textarea.value.trim();
    if (!message) return;
    const { error } = await sb.from("ban_appeals").insert({ user_id: ME.id, message });
    if (error) {
      toast("שגיאה בשליחת הערעור: " + error.message, "error");
      return;
    }
    toast("הערעור נשלח, נבדוק את זה בהקדם", "success");
    await renderAppealArea();
  });
}
