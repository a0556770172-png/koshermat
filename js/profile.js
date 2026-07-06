// ==========================================================
// עמוד פרופיל: סטטיסטיקות, מדליות, היסטוריית משחקים, עריכה
// ==========================================================

let ME = null;
let VIEWED = null;
const AVATAR_OPTIONS = ["♟️", "♞", "♝", "♜", "♛", "♚", "🦁", "🐺", "🦊", "🐉", "🦅", "🐢"];

(async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  ME = auth.profile;
  renderNav("profile", ME);

  const params = new URLSearchParams(location.search);
  const userId = params.get("user") || ME.id;

  const { data: viewed, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error || !viewed) {
    toast("משתמש לא נמצא", "error");
    return;
  }
  VIEWED = viewed;

  renderProfile();
  await loadMedals();
  await loadHistory();

  if (VIEWED.id === ME.id) {
    document.getElementById("edit-section").style.display = "block";
    wireEditForm();
  }
})();

function renderProfile() {
  const isMe = VIEWED.id === ME.id;
  const challengeBtn =
    !isMe && !VIEWED.is_banned
      ? `<button class="btn btn-primary mt-2 btn-block" onclick="sendGameInvite('${ME.id}','${VIEWED.id}','${escapeHtml(VIEWED.username)}')">⚔️ אתגר למשחק</button>`
      : "";

  document.getElementById("profile-header").innerHTML = `
    <div style="font-size:64px;">${VIEWED.avatar_emoji}</div>
    <div style="font-size:24px; font-weight:900; margin-top:8px;">${escapeHtml(VIEWED.username)} ${isMe ? "(אתה)" : ""}</div>
    <div class="mt-1">${rankBadgeHtml(VIEWED.rating)}</div>
    ${VIEWED.is_banned ? `<div class="badge banned mt-1">חשבון מושעה</div>` : ""}
    ${challengeBtn}
  `;
  document.getElementById("stats-box").innerHTML = `
    <div class="stat-row"><span>נקודות</span><b>${VIEWED.points}</b></div>
    <div class="stat-row"><span>משחקים ששוחקו</span><b>${VIEWED.games_played}</b></div>
    <div class="stat-row"><span>נצחונות</span><b>${VIEWED.wins}</b></div>
    <div class="stat-row"><span>הפסדים</span><b>${VIEWED.losses}</b></div>
    <div class="stat-row"><span>תיקו</span><b>${VIEWED.draws}</b></div>
    <div class="stat-row"><span>רצף ניצחונות שיא</span><b>${VIEWED.best_streak} 🔥</b></div>
  `;
}

async function loadMedals() {
  const { data: allMedals } = await sb.from("medals").select("*").order("id");
  const { data: mine } = await sb.from("user_medals").select("medal_id").eq("user_id", VIEWED.id);
  const mineSet = new Set((mine || []).map((m) => m.medal_id));
  document.getElementById("medal-grid").innerHTML = (allMedals || [])
    .map(
      (m) => `<div class="medal ${mineSet.has(m.id) ? "" : "locked"}">
        ${m.icon}<div class="tooltip">${escapeHtml(m.name)} — ${escapeHtml(m.description)}</div>
      </div>`
    )
    .join("");
}

async function loadHistory() {
  const { data } = await sb
    .from("games")
    .select("id, status, winner_id, created_at, white_id, black_id, white:white_id(username), black:black_id(username)")
    .or(`white_id.eq.${VIEWED.id},black_id.eq.${VIEWED.id}`)
    .neq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  const box = document.getElementById("history-list");
  if (!data || !data.length) {
    box.innerHTML = `<p class="muted text-center">אין עדיין משחקים שהושלמו</p>`;
    return;
  }
  box.innerHTML = data
    .map((g) => {
      const iAmWhite = g.white_id === VIEWED.id;
      const opponent = iAmWhite ? g.black?.username : g.white?.username;
      let resultLabel, resultColor;
      if (g.status === "draw") { resultLabel = "תיקו"; resultColor = "var(--gold)"; }
      else if (g.winner_id === VIEWED.id) { resultLabel = "ניצחון"; resultColor = "var(--success)"; }
      else { resultLabel = "הפסד"; resultColor = "var(--danger)"; }
      return `
        <div class="game-list-item" onclick="location.href='game.html?id=${g.id}'">
          <span>נגד ${escapeHtml(opponent || "?")} · ${timeAgo(g.created_at)}</span>
          <span style="color:${resultColor}; font-weight:700;">${resultLabel}</span>
        </div>`;
    })
    .join("");
}

function wireEditForm() {
  document.getElementById("avatar-options").innerHTML = AVATAR_OPTIONS.map(
    (a) => `<button type="button" class="avatar-opt" data-a="${a}" style="font-size:26px; padding:8px 10px; border-radius:10px; background:var(--glass); border:1px solid var(--glass-border); cursor:pointer;">${a}</button>`
  ).join("");

  let selectedAvatar = VIEWED.avatar_emoji;
  document.querySelectorAll(".avatar-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedAvatar = btn.dataset.a;
      document.querySelectorAll(".avatar-opt").forEach((b) => (b.style.boxShadow = "none"));
      btn.style.boxShadow = "0 0 0 2px var(--accent-2)";
    });
  });

  document.getElementById("username-input").value = VIEWED.username;

  document.getElementById("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById("username-input").value.trim();
    if (newUsername.length < 3) {
      toast("שם המשתמש חייב להכיל לפחות 3 תווים", "error");
      return;
    }
    const { error } = await sb
      .from("profiles")
      .update({ username: newUsername, avatar_emoji: selectedAvatar })
      .eq("id", ME.id);

    if (error) {
      toast("שגיאה בעדכון הפרופיל: " + error.message, "error");
      return;
    }
    toast("הפרופיל עודכן בהצלחה!", "success");
    VIEWED.username = newUsername;
    VIEWED.avatar_emoji = selectedAvatar;
    renderProfile();
  });
}
