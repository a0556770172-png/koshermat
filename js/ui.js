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
    toast("חשבונך הושעה: " + (profile.banned_reason || "הפרת כללי הקהילה"), "error");
    await sb.auth.signOut();
    window.location.href = "auth.html";
    return null;
  }

  listenForGameInvites(profile.id);

  return { session, profile };
}

// ---------------- ניווט למשחק בלי מזהה בכתובת ----------------
// כדי שהכתובת תישאר נקייה (game.html בלבד, בלי id/# עם מספרים) -
// שומרים את מזהה המשחק בזיכרון הדפדפן (sessionStorage) ולא בכתובת עצמה.
function goToGame(gameId) {
  sessionStorage.setItem("koshermat_game_id", gameId);
  location.href = "board.html";
}
window.goToGame = goToGame;

// ---------------- אתגר משחק אישי (הזמנות) ----------------
async function sendGameInvite(myId, targetId, targetName) {
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

  const { error } = await sb.from("game_invites").insert({ from_user: myId, to_user: targetId });
  if (error) {
    toast("שגיאה בשליחת האתגר: " + error.message, "error");
    return;
  }
  toast(`אתגר נשלח ל${targetName}! ⚔️`, "success");
}

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
