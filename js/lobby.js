// ==========================================================
// לוגיקת הלובי: פרופיל, שידוך יריבים, משחקים חיים, צ'אט גלובלי
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
  await loadGlobalChat();
  subscribeGlobalChat();

  document.getElementById("find-btn").addEventListener("click", toggleSearch);

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    const { error } = await sb.from("chat_messages").insert({
      game_id: null,
      sender_id: ME.id,
      message: msg,
    });
    if (error) toast("שגיאה בשליחת הודעה", "error");
  });
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
    const { error } = await sb.from("matchmaking_queue").upsert({
      user_id: ME.id,
      rating: ME.rating,
    });
    if (error) {
      toast("שגיאה בהצטרפות לתור: " + error.message, "error");
      return;
    }
    startSearchingUI();
    watchForMatch();
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

function watchForMatch() {
  if (queueChannel) return;
  queueChannel = sb
    .channel("queue-watch-" + ME.id)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "games" },
      (payload) => {
        const g = payload.new;
        if (g.white_id === ME.id || g.black_id === ME.id) {
          toast("נמצא יריב! מעביר אותך למשחק...", "success");
          setTimeout(() => (window.location.href = "game.html#" + g.id), 700);
        }
      }
    )
    .subscribe();
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
      <div class="game-list-item" onclick="location.href='game.html#${g.id}'">
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
}

// ---------------- Global chat ----------------
async function loadGlobalChat() {
  const { data } = await sb
    .from("chat_messages")
    .select("id, message, created_at, sender_id, sender:sender_id(username)")
    .is("game_id", null)
    .order("created_at", { ascending: false })
    .limit(40);
  const box = document.getElementById("chat-messages");
  box.innerHTML = "";
  (data || [])
    .reverse()
    .forEach((m) => appendChatMessage(m));
  box.scrollTop = box.scrollHeight;
}

function appendChatMessage(m) {
  const box = document.getElementById("chat-messages");
  const mine = m.sender_id === ME.id;
  const div = document.createElement("div");
  div.className = "chat-msg" + (mine ? " me" : "");
  div.innerHTML = `<span class="sender">${escapeHtml(m.sender?.username || "משתמש")}</span>${escapeHtml(m.message)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function subscribeGlobalChat() {
  sb.channel("global-chat")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      async (payload) => {
        if (payload.new.game_id !== null) return; // רק צ'אט גלובלי
        const { data: sender } = await sb.from("profiles").select("username").eq("id", payload.new.sender_id).single();
        appendChatMessage({ ...payload.new, sender });
      }
    )
    .subscribe();
}
