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
  await loadAppeals();
  await loadDmMonitor();
  await loadEmergencyRequests();
  await loadGuestCode();

  document.getElementById("dm-admin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const targetId = document.getElementById("dm-admin-target").value;
    const input = document.getElementById("dm-admin-input");
    const msg = input.value.trim();
    if (!msg || !targetId) return;
    input.value = "";
    const { error } = await sb.from("direct_messages").insert({
      sender_id: ME.id,
      recipient_id: targetId,
      message: msg,
    });
    if (error) {
      toast("שגיאה בשליחה: " + error.message, "error");
      return;
    }
    toast("ההודעה נשלחה מטעם הניהול", "success");
    if (CURRENT_DM_PAIR) await viewDmPair(CURRENT_DM_PAIR.a, CURRENT_DM_PAIR.b);
  });

  document.getElementById("user-search").addEventListener("input", (e) => renderUsers(e.target.value.trim().toLowerCase()));

  document.getElementById("abort-all-games-btn").addEventListener("click", abortAllGames);

  document.getElementById("save-guest-code-btn").addEventListener("click", saveGuestCode);
})();

async function abortAllGames() {
  if (!confirm("לבטל את כל המשחקים החיים? הפעולה בלתי הפיכה ולא תשפיע על דירוג השחקנים.")) return;
  const { data, error } = await sb.rpc("admin_abort_all_games");
  if (error) {
    toast("שגיאה: " + error.message, "error");
    return;
  }
  toast(`בוטלו ${data ?? 0} משחקים`, "success");
  await loadGames();
  await loadStats();
}
window.abortAllGames = abortAllGames;

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

// ---------------- Ban appeals ----------------
async function loadAppeals() {
  const { data } = await sb
    .from("ban_appeals")
    .select("*, user:user_id(username, avatar_emoji, is_banned, appeals_blocked, banned_reason)")
    .order("created_at", { ascending: false });

  const box = document.getElementById("appeals-list");
  if (!data || !data.length) {
    box.innerHTML = `<p class="muted text-center">אין ערעורים</p>`;
    return;
  }
  box.innerHTML = data
    .map((a) => {
      const u = a.user || {};
      return `
    <div class="card" style="margin-bottom:10px;">
      <div class="flex" style="justify-content:space-between; align-items:start;">
        <div>
          <div><b>${u.avatar_emoji || "♟️"} ${escapeHtml(u.username || "?")}</b> ${u.is_banned ? `<span class="badge banned">חסום</span>` : `<span class="badge actioned">לא חסום</span>`}</div>
          <div class="muted mt-1" style="font-size:12px;">סיבת החסימה: ${escapeHtml(u.banned_reason || "-")}</div>
          <div class="mt-1">${escapeHtml(a.message)}</div>
          <div class="muted" style="font-size:12px; margin-top:4px;">${timeAgo(a.created_at)}</div>
        </div>
        <span class="badge ${a.status}">${{ open: "פתוח", reviewed: "טופל", dismissed: "נדחה" }[a.status] || a.status}</span>
      </div>
      ${
        a.status === "open"
          ? `<div class="flex gap-1 mt-2" style="flex-wrap:wrap;">
              <button class="btn btn-accent" style="padding:6px 12px; font-size:12px;" onclick="approveAppeal('${a.id}', '${a.user_id}')">✔️ בטל חסימה</button>
              <button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" onclick="dismissAppeal('${a.id}')">✖️ דחה ערעור</button>
              ${
                u.appeals_blocked
                  ? `<button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" onclick="setAppealsBlocked('${a.user_id}', false)">🔓 אפשר ערעורים נוספים</button>`
                  : `<button class="btn btn-danger" style="padding:6px 12px; font-size:12px;" onclick="setAppealsBlocked('${a.user_id}', true)">🛑 חסום ערעורים נוספים (חפירה)</button>`
              }
            </div>`
          : ""
      }
    </div>`;
    })
    .join("");
}

async function approveAppeal(appealId, userId) {
  const { error: banError } = await sb.rpc("admin_set_ban", { p_target: userId, p_banned: false, p_reason: null });
  if (banError) return toast("שגיאה: " + banError.message, "error");
  await sb.from("ban_appeals").update({ status: "reviewed", reviewed_by: ME.id, reviewed_at: new Date().toISOString() }).eq("id", appealId);
  toast("החסימה בוטלה והערעור סומן כטופל", "success");
  await loadAppeals();
  await loadUsers();
}
window.approveAppeal = approveAppeal;

async function dismissAppeal(appealId) {
  await sb.from("ban_appeals").update({ status: "dismissed", reviewed_by: ME.id, reviewed_at: new Date().toISOString() }).eq("id", appealId);
  toast("הערעור נדחה", "success");
  await loadAppeals();
}
window.dismissAppeal = dismissAppeal;

async function setAppealsBlocked(userId, blocked) {
  const { error } = await sb.rpc("admin_set_appeals_blocked", { p_target: userId, p_blocked: blocked });
  if (error) return toast("שגיאה: " + error.message, "error");
  toast(blocked ? "המשתמש לא יוכל לשלוח ערעורים נוספים" : "המשתמש יכול לשלוח ערעורים שוב", "success");
  await loadAppeals();
}
window.setAppealsBlocked = setAppealsBlocked;

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
          <div class="muted" style="font-size:12px; margin-top:4px;">${timeAgo(r.created_at)}${r.game_id ? ` · <a href="javascript:void(0)" onclick="goToGame('${r.game_id}')">צפייה במשחק</a>` : ""}</div>
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
        <a href="javascript:void(0)" onclick="goToGame('${g.id}')" class="btn btn-ghost" style="padding:6px 12px; font-size:12px;">צפייה</a>
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

// ---------------- פיקוח על שיחות פרטיות ----------------
let CURRENT_DM_PAIR = null;

async function loadDmMonitor() {
  const { data } = await sb
    .from("direct_messages")
    .select("id, message, attachment_type, created_at, sender_id, recipient_id, sender:sender_id(username, avatar_emoji), recipient:recipient_id(username, avatar_emoji)")
    .order("created_at", { ascending: false })
    .limit(500);

  const seen = new Set();
  const pairs = [];
  for (const m of data || []) {
    const [a, b] = [m.sender_id, m.recipient_id].sort();
    const key = a + "_" + b;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      a, b,
      userA: m.sender_id === a ? m.sender : m.recipient,
      userB: m.sender_id === b ? m.sender : m.recipient,
      preview: m.attachment_type ? attachmentLabelAdmin(m.attachment_type) : m.message,
    });
  }

  const list = document.getElementById("dm-monitor-list");
  if (!pairs.length) {
    list.innerHTML = `<p class="muted text-center">אין עדיין שיחות פרטיות במערכת</p>`;
    return;
  }
  list.innerHTML = pairs
    .map(
      (p) => `
      <div class="conversation-item" onclick='viewDmPair(${JSON.stringify(p.a)}, ${JSON.stringify(p.b)})'>
        <span>${escapeHtml(p.userA?.username || "?")} ⇄ ${escapeHtml(p.userB?.username || "?")}</span>
        <span class="muted" style="font-size:12px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.preview || "")}</span>
      </div>`
    )
    .join("");
}

function attachmentLabelAdmin(type) {
  if (type === "image") return "📷 תמונה";
  if (type === "video") return "🎬 וידאו";
  if (type === "audio") return "🎵 קובץ שמע";
  return "📎 קובץ מצורף";
}

async function viewDmPair(userAId, userBId) {
  CURRENT_DM_PAIR = { a: userAId, b: userBId };

  const { data: messages } = await sb
    .from("direct_messages")
    .select("id, message, attachment_url, attachment_type, created_at, sender_id, recipient_id, sender:sender_id(username)")
    .or(
      `and(sender_id.eq.${userAId},recipient_id.eq.${userBId}),and(sender_id.eq.${userBId},recipient_id.eq.${userAId})`
    )
    .order("created_at", { ascending: true })
    .limit(500);

  const { data: profilesData } = await sb.from("profiles").select("id, username").in("id", [userAId, userBId]);
  const nameOf = (id) => profilesData?.find((p) => p.id === id)?.username || "?";

  document.getElementById("dm-monitor-title").textContent = `${nameOf(userAId)} ⇄ ${nameOf(userBId)}`;

  const box = document.getElementById("dm-monitor-messages");
  box.innerHTML = (messages || [])
    .map((m) => {
      const attachment = renderAttachmentAdmin(m);
      return `<div class="chat-msg"><span class="sender">${escapeHtml(m.sender?.username || "?")}</span>${escapeHtml(m.message || "")}${attachment}</div>`;
    })
    .join("");
  box.scrollTop = box.scrollHeight;

  const targetSelect = document.getElementById("dm-admin-target");
  targetSelect.innerHTML = `
    <option value="${userAId}">${escapeHtml(nameOf(userAId))}</option>
    <option value="${userBId}">${escapeHtml(nameOf(userBId))}</option>
  `;
  document.getElementById("dm-admin-form").style.display = "flex";
}
window.viewDmPair = viewDmPair;

function renderAttachmentAdmin(m) {
  if (!m.attachment_url) return "";
  const url = m.attachment_url;
  if (m.attachment_type === "image") {
    return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" style="max-width:200px; max-height:200px; border-radius:10px; margin-top:6px; display:block;" /></a>`;
  }
  if (m.attachment_type === "video") {
    return `<video src="${url}" controls style="max-width:220px; max-height:220px; border-radius:10px; margin-top:6px; display:block;"></video>`;
  }
  if (m.attachment_type === "audio") {
    return `<audio src="${url}" controls style="margin-top:6px; display:block; max-width:220px;"></audio>`;
  }
  return `<a href="${url}" target="_blank" rel="noopener" class="btn btn-ghost" style="margin-top:6px; display:inline-block; padding:6px 10px; font-size:12px;">📎 פתח קובץ</a>`;
}


// ---------------- קוד גישת אורח ----------------
async function loadGuestCode() {
  const { data, error } = await sb.rpc("admin_get_guest_code");
  if (error) return;
  const code = Array.isArray(data) ? data[0] : data;
  document.getElementById("guest-code-value").value = code || "";
}

async function saveGuestCode() {
  const input = document.getElementById("guest-code-value");
  const code = input.value.trim();
  if (!code) {
    toast("יש להזין קוד גישה", "error");
    return;
  }
  const { error } = await sb.rpc("admin_set_guest_code", { p_code: code });
  if (error) return toast("שגיאה בשמירת הקוד: " + error.message, "error");
  toast("קוד גישת האורח נשמר בהצלחה", "success");
}

// ---------------- גישת חירום ----------------
async function loadEmergencyRequests() {
  const { data } = await sb
    .from("emergency_access_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const box = document.getElementById("emergency-requests-list");
  if (!data || !data.length) {
    box.innerHTML = `<p class="muted text-center">אין בקשות גישת חירום</p>`;
    return;
  }
  const badgeClass = { pending: "open", approved: "actioned", rejected: "dismissed" };
  const badgeLabel = { pending: "ממתין", approved: "אושר", rejected: "נדחה" };
  box.innerHTML = data
    .map(
      (r) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="flex" style="justify-content:space-between; align-items:start;">
        <div>
          <div><b>${escapeHtml(r.email)}</b></div>
          <div class="muted" style="font-size:12px; margin-top:4px;">${timeAgo(r.created_at)}</div>
        </div>
        <span class="badge ${badgeClass[r.status] || ""}">${badgeLabel[r.status] || r.status}</span>
      </div>
      ${
        r.status === "pending"
          ? `<div class="flex gap-1 mt-2">
              <button class="btn btn-accent" style="padding:6px 12px; font-size:12px;" onclick="approveEmergencyRequest('${r.id}')">✔️ אשר גישה</button>
              <button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" onclick="rejectEmergencyRequest('${r.id}')">✖️ דחה</button>
            </div>`
          : ""
      }
    </div>`
    )
    .join("");
}

async function approveEmergencyRequest(id) {
  if (!confirm("לאשר גישת חירום למייל זה? המשתמש ייכנס ישירות ללא הרשמה רגילה.")) return;
  const { error } = await sb.rpc("admin_approve_emergency_access", { p_id: id });
  if (error) return toast("שגיאה: " + error.message, "error");
  toast("הבקשה אושרה - למשתמש נשלח קישור כניסה למייל", "success");
  await loadEmergencyRequests();
}
window.approveEmergencyRequest = approveEmergencyRequest;

async function rejectEmergencyRequest(id) {
  const { error } = await sb.rpc("admin_reject_emergency_access", { p_id: id });
  if (error) return toast("שגיאה: " + error.message, "error");
  toast("הבקשה נדחתה", "success");
  await loadEmergencyRequests();
}
window.rejectEmergencyRequest = rejectEmergencyRequest;
