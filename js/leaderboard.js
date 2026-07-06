// ==========================================================
// טבלת דירוג
// ==========================================================

let ME = null;
let ALL_PLAYERS = [];

(async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  ME = auth.profile;
  renderNav("leaderboard", ME);
  await loadLeaderboard();

  document.getElementById("search-input").addEventListener("input", (e) => {
    renderTable(e.target.value.trim().toLowerCase());
  });
})();

async function loadLeaderboard() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, username, avatar_emoji, rating, points, wins, losses, draws")
    .order("rating", { ascending: false })
    .limit(100);

  if (error) {
    toast("שגיאה בטעינת הדירוג", "error");
    return;
  }
  ALL_PLAYERS = data || [];
  renderTable("");
}

function renderTable(filter) {
  const rows = ALL_PLAYERS.filter((p) => !filter || p.username.toLowerCase().includes(filter));
  const tbody = document.getElementById("lb-body");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted text-center">לא נמצאו שחקנים</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((p, i) => {
      const idx = ALL_PLAYERS.indexOf(p);
      const medalIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
      const r = getRank(p.rating);
      const isMe = p.id === ME.id;
      const inviteBtn = isMe
        ? ""
        : `<button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" onclick="sendGameInvite('${ME.id}','${p.id}','${escapeHtml(p.username)}')">⚔️ אתגר</button>
           <button class="btn btn-ghost" style="padding:6px 12px; font-size:12px;" onclick="openDM('${p.id}','${escapeHtml(p.username)}')">💬</button>`;
      return `
      <tr style="${isMe ? "background:rgba(124,92,255,.15);" : ""}">
        <td>${medalIcon}</td>
        <td><a href="profile.html?user=${p.id}" class="flex gap-1" style="align-items:center;">
          <span style="font-size:20px;">${p.avatar_emoji}</span> ${escapeHtml(p.username)} ${isMe ? "(את/ה)" : ""}
        </a></td>
        <td><span style="color:${r.color}; font-weight:700;">${r.name}</span></td>
        <td><b>${p.rating}</b></td>
        <td>${p.points}</td>
        <td>${p.wins}/${p.losses}/${p.draws}</td>
        <td>${inviteBtn}</td>
      </tr>`;
    })
    .join("");
}
