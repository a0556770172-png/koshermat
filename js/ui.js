// ==========================================================
// עזרי ממשק משותפים: טוסטים, קונפטי, דרגות, ניווט
// ==========================================================

function toast(message, type = "") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    el.style.transition = "all .3s ease";
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

const RANKS = [
  { min: 0,    name: "מתחיל",              color: "#8a97b8" },
  { min: 1000, name: "חובב",               color: "#7fd4ff" },
  { min: 1200, name: "שחקן מועדון",         color: "#00e5c7" },
  { min: 1400, name: "מומחה",               color: "#4ade80" },
  { min: 1600, name: "מומחה מתקדם",         color: "#ffc94a" },
  { min: 1800, name: "רב-אמן מקומי",        color: "#ff9d4a" },
  { min: 2000, name: "רב-אמן בין-לאומי",    color: "#ff5c8a" },
  { min: 2200, name: "גרנדמאסטר",           color: "#c084fc" },
];

function getRank(rating) {
  let r = RANKS[0];
  for (const tier of RANKS) {
    if (rating >= tier.min) r = tier;
  }
  return r;
}

function rankBadgeHtml(rating) {
  const r = getRank(rating);
  return `<span class="rank-badge" style="color:${r.color}">🏵️ ${r.name} · ${rating}</span>`;
}

function formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "עכשיו";
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שעות`;
  return `לפני ${Math.floor(diff / 86400)} ימים`;
}

// ---------------- Confetti ----------------
function launchConfetti() {
  let canvas = document.getElementById("confetti-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    document.body.appendChild(canvas);
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  const colors = ["#7c5cff", "#00e5c7", "#ff5c8a", "#ffc94a", "#4ade80"];
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    r: 4 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    rot: Math.random() * 360,
    vrot: -8 + Math.random() * 16,
  }));
  let frame = 0;
  function draw() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6);
      ctx.restore();
    });
    if (frame < 220) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

// ---------------- Floating background pieces (used on index) ----------------
function spawnFloatingPieces(container, count = 14) {
  const symbols = ["♟", "♞", "♝", "♜", "♛", "♚"];
  for (let i = 0; i < count; i++) {
    const span = document.createElement("span");
    span.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    span.style.left = Math.random() * 100 + "%";
    span.style.animationDuration = 10 + Math.random() * 14 + "s";
    span.style.animationDelay = Math.random() * 10 + "s";
    span.style.fontSize = 20 + Math.random() * 30 + "px";
    container.appendChild(span);
  }
}

// ---------------- Auth guard + nav ----------------
async function requireAuth(redirectIfBanned = true) {
  // בטעינה ישירה של דף (למשל קישור למשחק) לפעמים ה-session עדיין
  // לא סיים להיטען מהאחסון המקומי ברגע הבדיקה הראשונה - מנסים כמה פעמים
  // בהפרשי זמן קצרים לפני שקובעים שאין התחברות.
  let session = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (session) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!session) {
    window.location.href = "auth.html";
    return null;
  }
  const { data: profile, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    window.location.href = "auth.html";
    return null;
  }
  if (profile.is_banned && redirectIfBanned) {
    // לא מתנתקים מיד - מעבירים למסך חסימה ייעודי שמציג את הסיבה
    // ומאפשר לשלוח ערעור, כדי שהמשתמש יידע בדיוק למה נחסם ולא רק "נזרק" החוצה
    window.location.href = "banned.html";
    return null;
  }

  listenForGameInvites(profile.id);
  initPresence(profile.id);

  return { session, profile };
}

// ---------------- נוכחות אונליין (מי מחובר כרגע לאתר) ----------------
// ערוץ Presence משותף לכל האתר - כל דף מחובר (לובי, פרופיל, הודעות וכו')
// "מדווח" שהוא מחובר, כדי שרשימת "שחקנים מחוברים" תהיה מדויקת ולא
// תסתמך רק על מי שנמצא כרגע בדף הלובי הספציפי.
let presenceChannel = null;
const onlineUserIds = new Set();

function initPresence(userId) {
  if (presenceChannel || !userId) return;
  try {
    presenceChannel = sb.channel("online-users", {
      config: { presence: { key: userId } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        onlineUserIds.clear();
        Object.keys(state).forEach((id) => onlineUserIds.add(id));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await presenceChannel.track({ online_at: new Date().toISOString() });
          } catch (e) { /* לא קריטי אם המעקב נכשל */ }
        }
      });
  } catch (e) {
    // לא קריטי - אם Presence נכשל, פשוט לא תהיה רשימת "מחוברים" מדויקת
  }
}
window.getOnlineUserIds = () => onlineUserIds;

// ---------------- ניווט למשחק בלי מזהה בכתובת ----------------
// כדי שהכתובת תישאר נקייה (game.html בלבד, בלי id/# עם מספרים) -
// שומרים את מזהה המשחק בזיכרון הדפדפן (sessionStorage) ולא בכתובת עצמה.
function goToGame(gameId) {
  // חשוב: מנקים הגדרות משחק-נגד-מחשב ישנות אם היו, אחרת דף המשחק
  // עלול "לחשוב" בטעות שזה עדיין משחק AI ולהתעלם ממזהה המשחק האמיתי
  sessionStorage.removeItem("koshermat_ai_config");
  sessionStorage.setItem("koshermat_game_id", gameId);
  location.href = "board.html";
}
window.goToGame = goToGame;

// ---------------- ניווט למשחק נגד המחשב ----------------
function goToAiGame(level, color, timeControlMs) {
  sessionStorage.removeItem("koshermat_game_id");
  sessionStorage.setItem(
    "koshermat_ai_config",
    JSON.stringify({ level, color, timeControlMs: timeControlMs || 600000 })
  );
  location.href = "board.html";
}
window.goToAiGame = goToAiGame;

// ---------------- ניווט להודעה פרטית עם משתמש (בלי מזהה בכתובת) ----------------
function openDM(userId, username) {
  sessionStorage.setItem("koshermat_dm_user_id", userId);
  sessionStorage.setItem("koshermat_dm_username", username || "");
  location.href = "messages.html";
}
window.openDM = openDM;

// ---------------- בחירת זמן משחק (משותף למשחק מהיר ולאתגרים) ----------------
const TIME_CONTROLS = [
  { ms: 180000, label: "3 דקות", sub: "בזק" },
  { ms: 300000, label: "5 דקות", sub: "מהיר" },
  { ms: 600000, label: "10 דקות", sub: "רגיל" },
  { ms: 900000, label: "15 דקות", sub: "נינוח" },
  { ms: 1800000, label: "30 דקות", sub: "ארוך" },
];

function openTimeControlModal(onChoose) {
  let overlay = document.getElementById("time-control-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "time-control-overlay";
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="card" style="max-width:380px;">
      <div class="section-title" style="font-size:17px; margin-bottom:4px;">⏱️ בחר זמן למשחק</div>
      <p class="muted" style="font-size:13px; margin-bottom:14px;">כל שחקן יקבל את הזמן הזה לכל המשחק</p>
      <div class="time-control-grid">
        ${TIME_CONTROLS.map(
          (tc) => `<button class="time-control-btn" data-ms="${tc.ms}">
            <span class="tc-label">${tc.label}</span>
            <span class="tc-sub">${tc.sub}</span>
          </button>`
        ).join("")}
      </div>
      <button class="btn btn-ghost btn-block mt-2" id="time-control-cancel">ביטול</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll(".time-control-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ms = parseInt(btn.dataset.ms, 10);
      overlay.remove();
      onChoose(ms);
    });
  });
  document.getElementById("time-control-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
window.openTimeControlModal = openTimeControlModal;

// ---------------- אתגר משחק אישי (הזמנות) ----------------
async function sendGameInvite(myId, targetId, targetName, timeControlMs) {
  if (myId === targetId) {
    toast("אי אפשר לאתגר את עצמך", "error");
    return;
  }
  const { data: existingInvite } = await sb
    .from("game_invites")
    .select("id")
    .eq("from_user", myId)
    .eq("to_user", targetId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    toast(`כבר שלחת הזמנה ל${targetName}, ממתין לתגובה`, "error");
    return;
  }

  const { error } = await sb.from("game_invites").insert({
    from_user: myId,
    to_user: targetId,
    time_control_ms: timeControlMs || 600000,
  });
  if (error) {
    toast("שגיאה בשליחת האתגר: " + error.message, "error");
    return;
  }
  toast(`אתגר נשלח ל${targetName}! ⚔️`, "success");
}

// עוטף את sendGameInvite בבחירת זמן משחק תחילה - זו הפונקציה שנקראת
// מכפתורי "אתגר" בפרופיל ובטבלת הדירוג
function challengeWithTimeControl(myId, targetId, targetName) {
  openTimeControlModal((ms) => sendGameInvite(myId, targetId, targetName, ms));
}
window.challengeWithTimeControl = challengeWithTimeControl;

// ---------------- בחירת יריב: שחקן אמיתי או מחשב ----------------
function openFindOpponentModal(myProfile) {
  const old = document.getElementById("find-opponent-overlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "find-opponent-overlay";
  overlay.innerHTML = `
    <div class="card text-center" style="max-width:460px;">
      <div class="section-title" style="margin-bottom:4px;">🎮 איך תרצה לשחק?</div>
      <p class="muted" style="font-size:13px; margin-bottom:16px;">בחר נגד מי לשחק הפעם</p>
      <div class="opponent-choice-grid">
        <button class="opponent-choice-card" id="choice-real-player">
          <span class="opponent-choice-icon">🧑</span>
          <span class="opponent-choice-title">שחקן אמיתי</span>
          <span class="opponent-choice-sub">אתגר שחקנים מחוברים או לא מחוברים</span>
        </button>
        <button class="opponent-choice-card" id="choice-vs-ai">
          <span class="opponent-choice-icon">🤖</span>
          <span class="opponent-choice-title">נגד המחשב</span>
          <span class="opponent-choice-sub">מנוע שחמט אמיתי, 20 רמות קושי</span>
        </button>
      </div>
      <button class="btn btn-ghost btn-block mt-2" id="find-opponent-cancel">ביטול</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("find-opponent-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById("choice-real-player").addEventListener("click", () => {
    overlay.remove();
    openRealPlayerModal(myProfile);
  });
  document.getElementById("choice-vs-ai").addEventListener("click", () => {
    overlay.remove();
    openAiDifficultyModal(myProfile);
  });
}
window.openFindOpponentModal = openFindOpponentModal;

// ---------------- רשימת שחקנים (מחוברים/לא מחוברים) לאתגור ----------------
async function openRealPlayerModal(myProfile) {
  const old = document.getElementById("real-player-overlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "real-player-overlay";
  overlay.innerHTML = `
    <div class="card" style="max-width:480px; max-height:82vh; overflow-y:auto; text-align:right;">
      <div class="flex" style="justify-content:space-between; align-items:center;">
        <div class="section-title" style="margin:0;">🧑 שחק נגד שחקן אמיתי</div>
        <button class="btn btn-ghost" id="real-player-back" style="padding:6px 12px; font-size:12px;">→ חזרה</button>
      </div>
      <button class="btn btn-primary btn-block mt-2" id="quick-match-btn">🎲 התאמה אוטומטית מהירה</button>
      <div class="mt-2">
        <div class="section-title" style="font-size:14px;">🟢 מחוברים כרגע</div>
        <div id="online-players-list" class="flex flex-col gap-1"><p class="muted text-center" style="font-size:12px;">טוען...</p></div>
      </div>
      <div class="mt-2">
        <div class="section-title" style="font-size:14px;">⚪ לא מחוברים</div>
        <div id="offline-players-list" class="flex flex-col gap-1"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("real-player-back").addEventListener("click", () => {
    overlay.remove();
    openFindOpponentModal(myProfile);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById("quick-match-btn").addEventListener("click", () => {
    overlay.remove();
    if (window.toggleSearch) window.toggleSearch();
  });

  const { data, error } = await sb
    .from("profiles")
    .select("id, username, avatar_emoji, rating")
    .neq("id", myProfile.id)
    .eq("is_banned", false)
    .order("rating", { ascending: false })
    .limit(200);

  if (error) {
    toast("שגיאה בטעינת רשימת השחקנים: " + error.message, "error");
    return;
  }

  const players = data || [];
  const online = window.getOnlineUserIds ? window.getOnlineUserIds() : new Set();
  const onlinePlayers = players.filter((p) => online.has(p.id));
  const offlinePlayers = players.filter((p) => !online.has(p.id));

  renderPlayerChallengeList("online-players-list", onlinePlayers, myProfile, "אין כרגע שחקנים אחרים מחוברים");
  renderPlayerChallengeList("offline-players-list", offlinePlayers, myProfile, "כל השחקנים הרשומים מחוברים כרגע!");
}
window.openRealPlayerModal = openRealPlayerModal;

function renderPlayerChallengeList(elementId, players, myProfile, emptyMsg) {
  const box = document.getElementById(elementId);
  if (!box) return;
  if (!players.length) {
    box.innerHTML = `<p class="muted text-center" style="font-size:12px;">${emptyMsg}</p>`;
    return;
  }
  box.innerHTML = players
    .map(
      (p) => `
    <div class="game-list-item">
      <span>${p.avatar_emoji || "♟️"} <b>${escapeHtml(p.username)}</b> <span class="muted" style="font-size:12px;">(${p.rating})</span></span>
      <button class="btn btn-ghost" style="padding:5px 12px; font-size:12px;" onclick="challengeWithTimeControl('${myProfile.id}','${p.id}','${escapeHtml(p.username)}')">⚔️ אתגר</button>
    </div>`
    )
    .join("");
}

// ---------------- בחירת רמת קושי + צבע למשחק נגד המחשב ----------------
function openAiDifficultyModal(myProfile) {
  const old = document.getElementById("ai-difficulty-overlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "ai-difficulty-overlay";
  overlay.innerHTML = `
    <div class="card text-center" style="max-width:440px;">
      <div class="flex" style="justify-content:space-between; align-items:center;">
        <div class="section-title" style="margin:0;">🤖 נגד המחשב</div>
        <button class="btn btn-ghost" id="ai-modal-back" style="padding:6px 12px; font-size:12px;">→ חזרה</button>
      </div>
      <p class="muted" style="font-size:13px; margin:10px 0;">מנוע שחמט אמיתי - לא סימולציה. רמה 20 היא כמעט בלתי אפשרית לניצחון.</p>
      <div class="ai-level-display" id="ai-level-display">רמה 10</div>
      <div class="muted" id="ai-level-tier" style="font-size:13px; margin-bottom:10px;"></div>
      <input type="range" min="0" max="20" value="10" id="ai-level-slider" class="ai-level-slider" />
      <div class="flex" style="justify-content:space-between; font-size:11px; color:var(--text-dim); margin-top:4px;">
        <span>קל</span><span>בלתי אפשרי</span>
      </div>
      <div class="section-title" style="font-size:14px; margin-top:18px;">באיזה צבע תרצה לשחק?</div>
      <div class="ai-color-grid" id="ai-color-grid">
        <button class="ai-color-btn active" type="button" data-color="w">⚪ לבן</button>
        <button class="ai-color-btn" type="button" data-color="b">⚫ שחור</button>
        <button class="ai-color-btn" type="button" data-color="random">🎲 אקראי</button>
      </div>
      <button class="btn btn-primary btn-block mt-2" id="ai-start-btn">התחל משחק</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("ai-modal-back").addEventListener("click", () => {
    overlay.remove();
    openFindOpponentModal(myProfile);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const tierOf = (lvl) => {
    if (lvl <= 4) return "🟢 קל";
    if (lvl <= 9) return "🟡 בינוני";
    if (lvl <= 14) return "🟠 קשה";
    if (lvl <= 18) return "🔴 מומחה";
    return "⚫ כמעט בלתי אפשרי";
  };

  const slider = document.getElementById("ai-level-slider");
  const display = document.getElementById("ai-level-display");
  const tierEl = document.getElementById("ai-level-tier");
  const updateLevel = () => {
    display.textContent = `רמה ${slider.value}`;
    tierEl.textContent = tierOf(parseInt(slider.value, 10));
  };
  updateLevel();
  slider.addEventListener("input", updateLevel);

  let selectedColor = "w";
  overlay.querySelectorAll(".ai-color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColor = btn.dataset.color;
      overlay.querySelectorAll(".ai-color-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.getElementById("ai-start-btn").addEventListener("click", () => {
    const level = parseInt(slider.value, 10);
    overlay.remove();
    openTimeControlModal((ms) => {
      goToAiGame(level, selectedColor, ms);
    });
  });
}
window.openAiDifficultyModal = openAiDifficultyModal;

const handledInviteUpdates = new Set();

function listenForGameInvites(myId) {
  loadPendingInvitesForMe(myId);
  sb.channel("invites-" + myId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "game_invites" },
      (payload) => {
        if (payload.new.to_user === myId && payload.new.status === "pending") {
          showInviteBanner(payload.new);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "game_invites" },
      (payload) => handleAcceptedInvite(myId, payload.new)
    )
    .subscribe();

  // גיבוי: בדיקה יזומה כל 3 שניות למקרה שההתראה בזמן-אמת לא הגיעה
  // (בין אם הזמנה חדשה שהתקבלה, ובין אם הזמנה ששלחתי אושרה)
  setInterval(async () => {
    const { data: incoming } = await sb
      .from("game_invites")
      .select("*, from:from_user(username, avatar_emoji)")
      .eq("to_user", myId)
      .eq("status", "pending");
    (incoming || []).forEach((inv) => showInviteBanner(inv));

    const { data: sent } = await sb
      .from("game_invites")
      .select("*")
      .eq("from_user", myId)
      .eq("status", "accepted");
    (sent || []).forEach((inv) => handleAcceptedInvite(myId, inv));
  }, 3000);
}

async function handleAcceptedInvite(myId, invite) {
  if (invite.from_user === myId && invite.status === "accepted" && invite.game_id) {
    if (handledInviteUpdates.has(invite.id)) return;
    handledInviteUpdates.add(invite.id);
    toast("האתגר התקבל! מעביר אותך למשחק...", "success");
    // מסמנים את ההזמנה כ"מטופלת" בבסיס הנתונים כדי שלא תמשיך "לתפוס" אותנו
    // שוב בכל בדיקת polling/טעינת דף עתידית - זו הסיבה שהדף היה "מתרענן"
    // שוב ושוב: הזמנה ישנה שכבר טופלה המשיכה לחזור ולהכריח ניתוב מחדש.
    try {
      await sb.from("game_invites").update({ status: "used" }).eq("id", invite.id).eq("status", "accepted");
    } catch (e) { /* ignore - ננווט בכל מקרה */ }
    setTimeout(() => goToGame(invite.game_id), 400);
  }
}

async function loadPendingInvitesForMe(myId) {
  const { data } = await sb
    .from("game_invites")
    .select("*, from:from_user(username, avatar_emoji)")
    .eq("to_user", myId)
    .eq("status", "pending");
  (data || []).forEach((inv) => showInviteBanner(inv));
}

async function showInviteBanner(inv) {
  if (document.getElementById("invite-" + inv.id)) return;

  let fromName = inv.from?.username;
  let fromAvatar = inv.from?.avatar_emoji;
  if (!fromName) {
    const { data } = await sb.from("profiles").select("username, avatar_emoji").eq("id", inv.from_user).single();
    fromName = data?.username || "שחקן";
    fromAvatar = data?.avatar_emoji || "♟️";
  }

  let container = document.getElementById("invite-banner-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "invite-banner-container";
    container.style.cssText =
      "position:fixed; top:80px; left:50%; transform:translateX(-50%); z-index:600; display:flex; flex-direction:column; gap:10px; width:min(340px,90vw);";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.id = "invite-" + inv.id;
  el.className = "card";
  el.style.cssText = "animation: popIn .4s cubic-bezier(.2,1.4,.5,1) both;";
  el.innerHTML = `
    <div class="flex gap-1" style="align-items:center;">
      <span style="font-size:28px;">${fromAvatar || "♟️"}</span>
      <div><b>${escapeHtml(fromName)}</b> אתגר/ה אותך למשחק! ⚔️</div>
    </div>
    <div class="flex gap-1 mt-2">
      <button class="btn btn-accent" style="flex:1;" id="accept-inv-${inv.id}">✔️ קבל</button>
      <button class="btn btn-ghost" style="flex:1;" id="decline-inv-${inv.id}">✖️ דחה</button>
    </div>
  `;
  container.appendChild(el);

  document.getElementById(`accept-inv-${inv.id}`).addEventListener("click", async () => {
    el.remove();
    const { data, error } = await sb.rpc("accept_game_invite", { p_invite_id: inv.id });
    if (error) {
      toast("שגיאה: " + error.message, "error");
      return;
    }
    toast("האתגר התקבל! מעביר אותך למשחק...", "success");
    setTimeout(() => goToGame(data), 500);
  });

  document.getElementById(`decline-inv-${inv.id}`).addEventListener("click", async () => {
    el.remove();
    await sb.from("game_invites").update({ status: "declined" }).eq("id", inv.id);
  });
}

function renderNav(activePage, profile) {
  const nav = document.getElementById("navbar");
  if (!nav) return;
  const adminLink = profile && profile.is_admin
    ? `<a href="admin.html" class="${activePage === "admin" ? "active" : ""}">🛡️ ניהול</a>`
    : "";
  nav.innerHTML = `
    <a href="lobby.html" class="brand">
      <span class="logo-piece">♞</span>
      <span class="brand-text">כושרמט</span>
    </a>
    <div class="nav-links">
      <a href="lobby.html" class="${activePage === "lobby" ? "active" : ""}">לובי</a>
      <a href="leaderboard.html" class="${activePage === "leaderboard" ? "active" : ""}">דירוג</a>
      <a href="messages.html" class="${activePage === "messages" ? "active" : ""}">📨 הודעות</a>
      <a href="profile.html" class="${activePage === "profile" ? "active" : ""}">הפרופיל שלי</a>
      ${adminLink}
    </div>
    <div class="flex gap-1" style="align-items:center;">
      ${profile ? `
        <a href="profile.html" class="profile-chip">
          <span class="avatar">${profile.avatar_emoji}</span>
          <span>
            <div style="font-weight:700;font-size:13px;">${escapeHtml(profile.username)}</div>
            <div style="font-size:11px;color:var(--text-dim)">${getRank(profile.rating).name} · ${profile.rating}</div>
          </span>
        </a>
        <button class="linklike" id="nav-logout" title="התנתק">🚪</button>
      ` : ""}
    </div>
  `;
  const logoutBtn = document.getElementById("nav-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "auth.html";
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
