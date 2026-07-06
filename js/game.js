// ==========================================================
// לוגיקת עמוד המשחק: לוח שחמט, חוקים, זמן, צ'אט, סיום משחק
// ==========================================================

const PIECE_UNICODE = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

let ME = null;
let GAME = null;
let MY_COLOR = null; // 'w' | 'b' | null (spectator)
let chess = null;
let selectedSquare = null;
let legalTargets = [];
let lastMoveSquares = [];
let gameEnded = false;
let timerInterval = null;
let pendingPromotion = null;

// מזהה המשחק נשמר בזיכרון הדפדפן (לא בכתובת) כדי שהכתובת תישאר נקייה
// (מותאם גם לרשתות עם סינון תוכן שחוסם כתובות עם מחרוזות מספרים ארוכות).
// יש גם תמיכה בקישורים ישנים (#id או ?id=) למקרה שמישהו כבר שמר כאלה.
const GAME_ID =
  sessionStorage.getItem("koshermat_game_id") ||
  decodeURIComponent(location.hash.slice(1)) ||
  new URLSearchParams(location.search).get("id");

(async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  ME = auth.profile;
  renderNav("", ME);

  if (!GAME_ID) {
    toast("לא נמצא משחק", "error");
    setTimeout(() => (location.href = "lobby.html"), 800);
    return;
  }

  await loadGame();
  if (!GAME) return;

  subscribeGame();
  await loadChat();
  subscribeChat();
  startTimerLoop();
  wireControls();
})();

async function loadGame() {
  const { data, error } = await sb
    .from("games")
    .select("*, white:white_id(id, username, rating, avatar_emoji), black:black_id(id, username, rating, avatar_emoji)")
    .eq("id", GAME_ID)
    .single();

  if (error || !data) {
    toast("המשחק לא נמצא", "error");
    setTimeout(() => (location.href = "lobby.html"), 800);
    return;
  }
  GAME = data;
  MY_COLOR = GAME.white_id === ME.id ? "w" : GAME.black_id === ME.id ? "b" : null;

  chess = new Chess();
  chess.load(GAME.fen);

  renderPlayers();
  renderBoard();
  renderMoveList();
  updateTimersDisplay();
  updateControlsVisibility();

  if (GAME.status !== "active") {
    showEndOverlay();
  }
}

function orientation() {
  return MY_COLOR === "b" ? "black" : "white";
}

function renderPlayers() {
  document.getElementById("white-name").textContent = `⚪ ${GAME.white?.username || "ממתין..."} (${GAME.white?.rating ?? "-"})`;
  document.getElementById("black-name").textContent = `⚫ ${GAME.black?.username || "ממתין..."} (${GAME.black?.rating ?? "-"})`;
}

// ---------------- Board rendering ----------------
function renderBoard() {
  const board = chess.board();
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";
  const flip = orientation() === "black";

  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const row = flip ? 7 - displayRow : displayRow;
      const col = flip ? 7 - displayCol : displayCol;
      const file = "abcdefgh"[col];
      const rank = 8 - row;
      const squareName = `${file}${rank}`;
      const piece = board[row][col];

      const sq = document.createElement("div");
      sq.className = "square " + ((row + col) % 2 === 0 ? "light" : "dark");
      sq.dataset.square = squareName;

      if (lastMoveSquares.includes(squareName)) sq.classList.add("last-move");
      if (selectedSquare === squareName) sq.classList.add("selected");
      if (legalTargets.some((t) => t.to === squareName)) {
        sq.classList.add(legalTargets.find((t) => t.to === squareName).captured ? "legal-capture" : "legal-move");
      }
      if (piece && piece.type === "k" && chess.in_check() && piece.color === chess.turn()) {
        sq.classList.add("in-check");
      }

      if (piece) {
        const span = document.createElement("span");
        span.className = "piece";
        span.textContent = PIECE_UNICODE[piece.color + piece.type.toUpperCase()];
        sq.appendChild(span);
      }

      sq.addEventListener("click", () => onSquareClick(squareName));
      boardEl.appendChild(sq);
    }
  }
}

function onSquareClick(squareName) {
  if (gameEnded || GAME.status !== "active") return;
  if (!MY_COLOR || chess.turn() !== MY_COLOR) return;

  if (selectedSquare) {
    const move = legalTargets.find((t) => t.to === squareName);
    if (move) {
      if (move.promotion) {
        pendingPromotion = { from: selectedSquare, to: squareName };
        showPromotionModal();
        return;
      }
      makeMove(selectedSquare, squareName);
      return;
    }
    // בחירה מחדש או ביטול
    selectedSquare = null;
    legalTargets = [];
    const piece = chess.get(squareName);
    if (piece && piece.color === MY_COLOR) {
      selectSquare(squareName);
    } else {
      renderBoard();
    }
    return;
  }

  const piece = chess.get(squareName);
  if (piece && piece.color === MY_COLOR) {
    selectSquare(squareName);
  }
}

function selectSquare(squareName) {
  selectedSquare = squareName;
  const moves = chess.moves({ square: squareName, verbose: true });
  legalTargets = moves.map((m) => ({ to: m.to, captured: !!m.captured, promotion: !!m.promotion }));
  renderBoard();
}

function showPromotionModal() {
  const overlay = document.getElementById("promo-overlay");
  overlay.style.display = "flex";
  const color = MY_COLOR;
  const options = ["q", "r", "b", "n"];
  const wrap = document.getElementById("promo-choices");
  wrap.innerHTML = options
    .map((p) => `<button data-p="${p}">${PIECE_UNICODE[color + p.toUpperCase()]}</button>`)
    .join("");
  wrap.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      overlay.style.display = "none";
      makeMove(pendingPromotion.from, pendingPromotion.to, btn.dataset.p);
      pendingPromotion = null;
    };
  });
}

// ---------------- Making moves ----------------
async function makeMove(from, to, promotion) {
  const move = chess.move({ from, to, promotion });
  if (!move) return;

  selectedSquare = null;
  legalTargets = [];
  lastMoveSquares = [from, to];
  renderBoard();
  renderMoveList();

  const now = Date.now();
  const lastMoveAt = new Date(GAME.last_move_at).getTime();
  const elapsed = now - lastMoveAt;

  let whiteMs = GAME.white_time_ms;
  let blackMs = GAME.black_time_ms;
  if (move.color === "w") whiteMs = Math.max(0, whiteMs - elapsed);
  else blackMs = Math.max(0, blackMs - elapsed);

  const update = {
    fen: chess.fen(),
    pgn: chess.pgn(),
    turn: chess.turn(),
    last_move: move.san,
    last_move_at: new Date().toISOString(),
    white_time_ms: whiteMs,
    black_time_ms: blackMs,
    draw_offered_by: null,
  };

  const { error } = await sb.from("games").update(update).eq("id", GAME_ID);
  if (error) {
    toast("שגיאה בשליחת המהלך", "error");
    return;
  }
  Object.assign(GAME, update);

  if (chess.in_checkmate()) {
    const winnerId = move.color === "w" ? GAME.white_id : GAME.black_id;
    await finishGame("checkmate", winnerId);
  } else if (chess.in_draw() || chess.in_stalemate() || chess.in_threefold_repetition()) {
    await finishGame("draw", null);
  }
}

async function finishGame(status, winnerId) {
  if (gameEnded) return;
  gameEnded = true;
  await sb.rpc("finish_game", { p_game_id: GAME_ID, p_status: status, p_winner_id: winnerId });
}

// ---------------- Realtime sync ----------------
function subscribeGame() {
  sb.channel("game-" + GAME_ID)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${GAME_ID}` },
      (payload) => {
        const newRow = payload.new;
        const wasActive = GAME.status === "active";
        Object.assign(GAME, newRow);
        chess.load(newRow.fen);
        if (newRow.last_move) {
          try {
            const verboseHistory = chess.history({ verbose: true });
            const lm = verboseHistory[verboseHistory.length - 1];
            lastMoveSquares = lm ? [lm.from, lm.to] : [];
          } catch (e) { /* ignore */ }
        }
        selectedSquare = null;
        legalTargets = [];
        renderBoard();
        renderMoveList();
        renderDrawBanner();
        updateTimersDisplay();

        if (wasActive && newRow.status !== "active") {
          gameEnded = true;
          showEndOverlay();
        }
      }
    )
    .subscribe();
}

// ---------------- Move list ----------------
function renderMoveList() {
  const history = chess.history();
  let html = "";
  for (let i = 0; i < history.length; i += 2) {
    const num = i / 2 + 1;
    html += `<div>${num}. ${history[i] || ""} ${history[i + 1] || ""}</div>`;
  }
  document.getElementById("move-list").innerHTML = html || `<span class="muted">טרם בוצעו מהלכים</span>`;
  const list = document.getElementById("move-list");
  list.scrollTop = list.scrollHeight;
}

// ---------------- Timers ----------------
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    updateTimersDisplay();
    if (GAME.status !== "active" || gameEnded) return;
    if (!GAME.white_id || !GAME.black_id) return;

    const now = Date.now();
    const lastMoveAt = new Date(GAME.last_move_at).getTime();
    const elapsed = now - lastMoveAt;
    const sideToMove = GAME.turn;
    const remaining = (sideToMove === "w" ? GAME.white_time_ms : GAME.black_time_ms) - elapsed;

    if (remaining <= 0 && MY_COLOR) {
      const winnerId = sideToMove === "w" ? GAME.black_id : GAME.white_id;
      await finishGame("timeout", winnerId);
    }
  }, 400);
}

function updateTimersDisplay() {
  const now = Date.now();
  const lastMoveAt = new Date(GAME.last_move_at).getTime();
  const elapsed = GAME.status === "active" ? now - lastMoveAt : 0;

  let whiteRemaining = GAME.white_time_ms;
  let blackRemaining = GAME.black_time_ms;
  if (GAME.status === "active") {
    if (GAME.turn === "w") whiteRemaining -= elapsed;
    else blackRemaining -= elapsed;
  }
  whiteRemaining = Math.max(0, whiteRemaining);
  blackRemaining = Math.max(0, blackRemaining);

  const whiteEl = document.getElementById("white-timer");
  const blackEl = document.getElementById("black-timer");
  whiteEl.textContent = formatTime(whiteRemaining);
  blackEl.textContent = formatTime(blackRemaining);

  whiteEl.parentElement.classList.toggle("active", GAME.turn === "w" && GAME.status === "active");
  blackEl.parentElement.classList.toggle("active", GAME.turn === "b" && GAME.status === "active");
  whiteEl.parentElement.classList.toggle("low", whiteRemaining < 20000);
  blackEl.parentElement.classList.toggle("low", blackRemaining < 20000);
}

// ---------------- Controls: resign / draw ----------------
function updateControlsVisibility() {
  const controls = document.getElementById("game-controls");
  controls.style.display = MY_COLOR && GAME.status === "active" ? "flex" : "none";
  renderDrawBanner();
}

function renderDrawBanner() {
  const banner = document.getElementById("draw-banner");
  if (!MY_COLOR || GAME.status !== "active" || !GAME.draw_offered_by) {
    banner.style.display = "none";
    return;
  }
  if (GAME.draw_offered_by === ME.id) {
    banner.style.display = "flex";
    banner.innerHTML = `<span>הצעת תיקו נשלחה, ממתין לתגובת היריב...</span>`;
  } else {
    banner.style.display = "flex";
    banner.innerHTML = `
      <span>היריב הציע תיקו</span>
      <div class="flex gap-1">
        <button class="btn btn-accent" id="accept-draw" style="padding:6px 14px;font-size:13px;">✔️ קבל</button>
        <button class="btn btn-ghost" id="decline-draw" style="padding:6px 14px;font-size:13px;">✖️ דחה</button>
      </div>`;
    document.getElementById("accept-draw").onclick = async () => {
      await finishGame("draw", null);
    };
    document.getElementById("decline-draw").onclick = async () => {
      await sb.from("games").update({ draw_offered_by: null }).eq("id", GAME_ID);
    };
  }
}

function wireControls() {
  document.getElementById("resign-btn").addEventListener("click", async () => {
    if (!confirm("האם אתה בטוח שברצונך להיכנע?")) return;
    const winnerId = MY_COLOR === "w" ? GAME.black_id : GAME.white_id;
    await finishGame("resigned", winnerId);
  });

  document.getElementById("draw-btn").addEventListener("click", async () => {
    await sb.from("games").update({ draw_offered_by: ME.id }).eq("id", GAME_ID);
  });

  document.getElementById("report-btn").addEventListener("click", async () => {
    const opponentId = MY_COLOR === "w" ? GAME.black_id : GAME.white_id;
    if (!opponentId) return;
    const reason = prompt("תאר בקצרה את הבעיה שברצונך לדווח עליה:");
    if (!reason) return;
    const { error } = await sb.from("reports").insert({
      reporter_id: ME.id,
      reported_id: opponentId,
      game_id: GAME_ID,
      reason,
    });
    toast(error ? "שגיאה בשליחת הדיווח" : "הדיווח נשלח לצוות הניהול", error ? "error" : "success");
  });

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    await sb.from("chat_messages").insert({ game_id: GAME_ID, sender_id: ME.id, message: msg });
  });
}

// ---------------- End overlay ----------------
function showEndOverlay() {
  clearInterval(timerInterval);
  const overlay = document.getElementById("end-overlay");
  overlay.style.display = "flex";

  let title, subtitle, emoji;
  const iAmWinner = GAME.winner_id && GAME.winner_id === ME.id;
  const isDraw = GAME.status === "draw";

  switch (GAME.status) {
    case "checkmate": title = "שח-מט!"; emoji = "♚"; break;
    case "resigned": title = "המשחק הסתיים בכניעה"; emoji = "🏳️"; break;
    case "timeout": title = "נגמר הזמן!"; emoji = "⏱️"; break;
    case "draw": title = "המשחק הסתיים בתיקו"; emoji = "🤝"; break;
    default: title = "המשחק הסתיים"; emoji = "♟️";
  }

  if (isDraw) {
    subtitle = "תיקו הוגן — כל הכבוד לשני הצדדים";
  } else if (!MY_COLOR) {
    const winnerName = GAME.winner_id === GAME.white_id ? GAME.white?.username : GAME.black?.username;
    subtitle = `${winnerName || "שחקן"} ניצח/ה במשחק`;
  } else if (iAmWinner) {
    subtitle = "ניצחת! הדירוג והנקודות שלך עודכנו 🎉";
  } else {
    subtitle = "הפסדת הפעם — נסה שוב!";
  }

  document.getElementById("end-title").textContent = `${emoji} ${title}`;
  document.getElementById("end-subtitle").textContent = subtitle;

  if (MY_COLOR && iAmWinner) launchConfetti();

  document.getElementById("game-controls").style.display = "none";
  document.getElementById("draw-banner").style.display = "none";
}

// ---------------- In-game chat ----------------
async function loadChat() {
  const { data } = await sb
    .from("chat_messages")
    .select("id, message, created_at, sender_id, sender:sender_id(username)")
    .eq("game_id", GAME_ID)
    .order("created_at", { ascending: true })
    .limit(100);
  const box = document.getElementById("chat-messages");
  box.innerHTML = "";
  (data || []).forEach((m) => appendChatMessage(m));
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

function subscribeChat() {
  sb.channel("game-chat-" + GAME_ID)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${GAME_ID}` },
      async (payload) => {
        const { data: sender } = await sb.from("profiles").select("username").eq("id", payload.new.sender_id).single();
        appendChatMessage({ ...payload.new, sender });
      }
    )
    .subscribe();
}
