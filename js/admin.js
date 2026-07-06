// ==========================================================
// פאנל ניהול ופיקוח — למנהלים בלבד
// ==========================================================

let ME = null;

(async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  ME = auth.profile;

  if (!ME.is_admin) {
    toast("אין לך הרשאת גישה לעמוד זה", "error");
    setTimeout(() => (location.href = "lobby.html"), 800);
    return;
  }

  renderNav("admin", ME);
  wireTabs();
  await loadStats();
  await loadUsers();
  await loadReports();
  await loadGames();

  document.getElementById("user-search").addEventListener("input", (e) => renderUsers(e.target.value.trim().toLowerCase()));
})();

function wireTabs() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel[data-tab-panel]").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`.tab-panel[data-tab-panel="${btn.dataset.tab}"]`).classList.add("active");
    });
  });
}

async function loadStats() {
  const [{ count: usersCount }, { count: gamesCount }, { count: openReports }] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("games").select("*", { count: "exact", head: true }).eq("status", "active"),
    sb.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);
  document.getElementById("stat-users").textContent = usersCount ?? "-";
  document.getElementById("stat-games").textContent = gamesCount ?? "-";
  document.getElementById("stat-reports").textContent = openReports ?? "-";
}

// ---------------- Users ----------------
let ALL_USERS = [];
async function loadUsers() {
  const { data } = await sb.from("profiles").select("*").order("rating", { ascending: false });
  ALL_USERS = data || [];
  renderUsers("");
}

function renderUsers(filter) {
  const rows = ALL_USERS.filter((u) => !filter || u.username.toLowerCase().includes(filter));
  document.getElementById("users-body").innerHTML = rows
    .map(
      (u) => `
    <tr>
      <td>${u.avatar_emoji} ${escapeHtml(u.username)}</td>
      <td>${u.rating}</td>
      <td>${u.wins}/${u.losses}/${u.draws}</td>
      <td>${u.is_banned ? `<span class="badge banned">חסום</span>` : `<span class="badge actioned">פעיל</span>`}</td>
      <td>${u.is_admin ? "🛡️ מנהל" : ""}</td>
      <td>
        ${
          u.id === ME.id
            ? `<span class="muted">זה אתה</span>`
            : u.is_banned
            ? `<button class="btn btn-accent" style="padding:6px 12px; font-size:12px;" onclick="unbanUser('${u.id}')">בטל חסימה</button>`
            : `<button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="banUser('${u.id}')">חסום</button>`
        }
      </td>
    </tr>`
    )
    .join("");
}

async function banUser(userId) {
  const reason = prompt("סיבת החסימה:");
  if (reason === null) return;
  const { error } = await sb.rpc("admin_set_ban", { p_target: userId, p_banned: true, p_reason: reason || "הפרת כללי הקהילה" });
  if (error) return toast("שגיאה: " + error.message, "error");
  toast("המשתמש נחסם", "success");
  await loadUsers();
}

async function unbanUser(userId) {
  const { error } = await sb.rpc("admin_set_ban", { p_target: userId, p_banned: false, p_reason: null });
  if (error) return toast("שגיאה: " + error.message, "error");
  toast("החסימה בוטלה", "success");
  await loadUsers();
}
window.banUser = banUser;
window.unbanUser = unbanUser;

// ---------------- Reports ----------------
async function loadReports() {
  const { data } = await sb
    .from("reports")
    .select("*, reporter:reporter_id(username), reported:reported_id(username)")
    .order("created_at", { ascending: false });

  const box = document.getElementById("reports-list");
  if (!data || !data.length) {
    box.innerHTML = `<p class="muted text-center">אין דיווחים</p>`;
    return;
  }
  box.innerHTML = data
    .map(
      (r) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="flex" style="justify-content:space-between; align-items:start;">
        <div>
          <div><b>${escapeHtml(r.reporter?.username || "?")}</b> דיווח/ה על <b>${escapeHtml(r.reported?.username || "?")}</b></div>
          <div class="muted mt-1">${escapeHtml(r.reason)}</div>
          <div class="muted" style="font-size:12px; margin-top:4px;">${timeAgo(r.created_at)}${r.game_id ? ` · <a href="game.html#${r.game_id}">צפייה במשחק</a>` : ""}</div>
        </div>
        <span class="badge ${r.status}">${{ open: "פתוח", reviewed: "נבדק", dismissed: "נדחה", actioned: "טופל" }[r.status] || r.status}</span>
      </div>
      ${
        r.status === "open"
          ? `<div class="flex gap-1 mt-2">
              <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="actionReport('${r.id}', '${r.reported_id}')">חסום משתמש וסמן כטופל</button>
              <button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" onclick="dismissReport('${r.id}')">דחה דיווח</button>
            </div>`
          : ""
      }
    </div>`
    )
    .join("");
}

async function actionReport(reportId, reportedId) {
  const reason = prompt("סיבת החסימה:", "הפרת כללי קהילה — דווח משחקן אחר");
  if (reason === null) return;
  await sb.rpc("admin_set_ban", { p_target: reportedId, p_banned: true, p_reason: reason });
  await sb.from("reports").update({ status: "actioned", reviewed_by: ME.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
  toast("המשתמש נחסם והדיווח סומן כטופל", "success");
  await loadReports();
  await loadUsers();
}

async function dismissReport(reportId) {
  await sb.from("reports").update({ status: "dismissed", reviewed_by: ME.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
  toast("הדיווח נדחה", "success");
  await loadReports();
}
window.actionReport = actionReport;
window.dismissReport = dismissReport;

// ---------------- Live games ----------------
async function loadGames() {
  const { data } = await sb
    .from("games")
    .select("id, status, created_at, white:white_id(username), black:black_id(username)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const box = document.getElementById("admin-games-list");
  if (!data || !data.length) {
    box.innerHTML = `<p class="muted text-center">אין משחקים חיים כרגע</p>`;
    return;
  }
  box.innerHTML = data
    .map(
      (g) => `
    <div class="game-list-item">
      <span>${escapeHtml(g.white?.username || "?")} ⚔️ ${escapeHtml(g.black?.username || "?")} · ${timeAgo(g.created_at)}</span>
      <div class="flex gap-1">
        <a href="game.html#${g.id}" class="btn btn-ghost" style="padding:6px 12px; font-size:12px;">צפייה</a>
        <button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="abortGame('${g.id}')">בטל משחק</button>
      </div>
    </div>`
    )
    .join("");
}

async function abortGame(gameId) {
  if (!confirm("לבטל את המשחק? לא ישפיע על דירוג השחקנים.")) return;
  const { error } = await sb.rpc("admin_abort_game", { p_game_id: gameId });
  if (error) return toast("שגיאה: " + error.message, "error");
  toast("המשחק בוטל", "success");
  await loadGames();
}
window.abortGame = abortGame;
