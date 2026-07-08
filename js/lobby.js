// ==========================================================
// לוגיקת הלובי: פרופיל, שידוך יריבים, משחקים חיים, תצוגת הודעות פרטיות
// ==========================================================

let ME = null;
let searching = false;
let queueChannel = null;

(async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  ME = auth.profile;

  renderNav("lobby", ME);
  renderProfileCard(ME);
  await loadMedals(ME);
  await checkExistingQueue();
  await loadLiveGames();
  subscribeLiveGames();
  await loadDmPreview();
  subscribeDmPreview();

  document.getElementById("find-btn").addEventListener("click", toggleSearch);
})();

function renderProfileCard(p) {
  document.getElementById("profile-card").innerHTML = `
    <div class="text-center">
      <div style="font-size:48px;">${p.avatar_emoji}</div>
      <div style="font-size:19px; font-weight:800; margin-top:6px;">${escapeHtml(p.username)}</div>
      <div class="mt-1">${rankBadgeHtml(p.rating)}</div>
    </div>
    <div class="mt-2">
      <div class="stat-row"><span>נקודות</span><b>${p.points}</b></div>
      <div class="stat-row"><span>נצחונות</span><b>${p.wins}</b></div>
      <div class="stat-row"><span>הפסדים</span><b>${p.losses}</b></div>
      <div class="stat-row"><span>תיקו</span><b>${p.draws}</b></div>
      <div class="stat-row"><span>רצף נוכחי</span><b>${p.win_streak} 🔥</b></div>
      <div class="stat-row"><span>רצף שיא</span><b>${p.best_streak}</b></div>
    </div>
  `;
}

async function loadMedals(p) {
  const { data: allMedals } = await sb.from("medals").select("*").order("id");
  const { data: mine } = await sb.from("user_medals").select("medal_id").eq("user_id", p.id);
  const mineSet = new Set((mine || []).map((m) => m.medal_id));
  const grid = document.getElementById("medal-grid");
  grid.innerHTML = (allMedals || [])
    .map((m) => {
      const unlocked = mineSet.has(m.id);
      return `<div class="medal ${unlocked ? "" : "locked"}">
        ${m.icon}
        <div class="tooltip">${escapeHtml(m.name)}${unlocked ? "" : " (נעול)"}</div>
      </div>`;
    })
    .join("");
}

// ---------------- Matchmaking ----------------
async function checkExistingQueue() {
  const { data } = await sb.from("matchmaking_queue").select("*").eq("user_id", ME.id).maybeSingle();
  if (data) {
    startSearchingUI();
    watchForMatch();
  }
}

async function toggleSearch() {
  if (searching) {
    await sb.from("matchmaking_queue").delete().eq("user_id", ME.id);
    stopSearchingUI();
  } else {
    openTimeControlModal(async (timeControlMs) => {
      const { error } = await sb.from("matchmaking_queue").upsert({
        user_id: ME.id,
        rating: ME.rating,
        time_control_ms: timeControlMs,
      });
      if (error) {
        toast("שגיאה בהצטרפות לתור: " + error.message, "error");
        return;
      }
      startSearchingUI();
      watchForMatch();
    });
  }
}

function startSearchingUI() {
  searching = true;
  const btn = document.getElementById("find-btn");
  btn.textContent = "❌ בטל חיפוש";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-danger");
  document.getElementById("pulse-ring").classList.add("searching");
  document.getElementById("search-status").textContent = "מחפש יריב מתאים...";
}

function stopSearchingUI() {
  searching = false;
  const btn = document.getElementById("find-btn");
  btn.textContent = "🎮 מצא יריב";
  btn.classList.remove("btn-danger");
  btn.classList.add("btn-primary");
  document.getElementById("pulse-ring").classList.remove("searching");
  document.getElementById("search-status").textContent = "לחץ כדי להתחיל משחק חדש";
  if (queueChannel) {
    sb.removeChannel(queueChannel);
    queueChannel = null;
  }
}

let matchFound = false;
let matchPollInterval = null;

function watchForMatch() {
  matchFound = false;
  if (!queueChannel) {
    queueChannel = sb
      .channel("queue-watch-" + ME.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "games" },
        (payload) => {
          const g = payload.new;
          if (g.white_id === ME.id || g.black_id === ME.id) {
            onMatchFound(g.id);
          }
        }
      )
      .subscribe();
  }

  // גיבוי: בדיקה יזומה כל 2 שניות למקרה שההתראה בזמן-אמת לא הגיעה
  if (!matchPollInterval) {
    matchPollInterval = setInterval(async () => {
      if (matchFound || !searching) return;
      const { data } = await sb
        .from("games")
        .select("id, created_at")
        .or(`white_id.eq.${ME.id},black_id.eq.${ME.id}`)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length) onMatchFound(data[0].id);
    }, 2000);
  }
}

function onMatchFound(gameId) {
  if (matchFound) return;
  matchFound = true;
  toast("נמצא יריב! מעביר אותך למשחק...", "success");
  setTimeout(() => goToGame(gameId), 700);
}

// ---------------- Live games ----------------
async function loadLiveGames() {
  const { data } = await sb
    .from("games")
    .select("id, white_id, black_id, status, created_at, white:white_id(username, rating), black:black_id(username, rating)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);
  renderLiveGames(data || []);
}

function renderLiveGames(games) {
  const list = document.getElementById("live-games-list");
  if (!games.length) {
    list.innerHTML = `<p class="muted text-center">אין כרגע משחקים חיים. תהיה הראשון!</p>`;
    return;
  }
  list.innerHTML = games
    .map(
      (g) => `
      <div class="game-list-item" onclick="goToGame('${g.id}')">
        <span>${g.white?.username || "?"} (${g.white?.rating ?? "-"}) ⚔️ ${g.black?.username || "?"} (${g.black?.rating ?? "-"})</span>
        <span class="btn btn-ghost" style="padding:6px 12px; font-size:12px;">👁️ צפייה</span>
      </div>`
    )
    .join("");
}

function subscribeLiveGames() {
  sb.channel("lobby-games")
    .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => {
      loadLiveGames();
    })
    .subscribe();

  // גיבוי: רענון יזום כל 5 שניות למקרה שההתראה בזמן-אמת לא הגיעה
  setInterval(loadLiveGames, 5000);
}

// ---------------- תצוגה מקדימה של הודעות פרטיות ----------------
async function loadDmPreview() {
  const { data } = await sb
    .from("direct_messages")
    .select("id, message, created_at, sender_id, recipient_id, read_at, sender:sender_id(username, avatar_emoji), recipient:recipient_id(username, avatar_emoji)")
    .or(`sender_id.eq.${ME.id},recipient_id.eq.${ME.id}`)
    .order("created_at", { ascending: false })
    .limit(50);
  renderDmPreview(data || []);
}

function renderDmPreview(messages) {
  const seen = new Set();
  const conversations = [];
  for (const m of messages) {
    const otherId = m.sender_id === ME.id ? m.recipient_id : m.sender_id;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const other = m.sender_id === ME.id ? m.recipient : m.sender;
    const unread = m.recipient_id === ME.id && !m.read_at;
    conversations.push({ otherId, other, message: m.message, unread });
  }

  const list = document.getElementById("dm-preview-list");
  if (!conversations.length) {
    list.innerHTML = `<p class="muted text-center" style="font-size:13px;">אין עדיין הודעות. אפשר לשלוח הודעה פרטית מהפרופיל של שחקן אחר או מטבלת הדירוג.</p>`;
    return;
  }
  list.innerHTML = conversations
    .slice(0, 6)
    .map(
      (c) => `
      <div class="game-list-item" onclick="openDM('${c.otherId}', '${escapeHtml(c.other?.username || "שחקן")}')">
        <span>${c.other?.avatar_emoji || "♟️"} <b>${escapeHtml(c.other?.username || "שחקן")}</b>${c.unread ? ` <span class="badge open">חדש</span>` : ""}</span>
        <span class="muted" style="font-size:12px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.message)}</span>
      </div>`
    )
    .join("");
}

function subscribeDmPreview() {
  sb.channel("dm-preview-" + ME.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
      const row = payload.new || payload.old;
      if (row && (row.sender_id === ME.id || row.recipient_id === ME.id)) loadDmPreview();
    })
    .subscribe();

  // גיבוי: רענון יזום כל 5 שניות למקרה שההתראה בזמן-אמת לא הגיעה
  setInterval(loadDmPreview, 5000);
}
