// ==========================================================
// עמוד הודעות פרטיות: רשימת שיחות + שיחה פעילה
// ==========================================================

let ME = null;
let ACTIVE_USER_ID = null;
let ACTIVE_USERNAME = null;
const seenMsgIds = new Set();

(async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  ME = auth.profile;
  renderNav("messages", ME);

  // אם הגענו לכאן דרך openDM() (למשל מכפתור "הודעה פרטית" בפרופיל) -
  // נשמר מזהה משתמש בזיכרון הדפדפן, לא בכתובת עצמה
  const pendingUserId = sessionStorage.getItem("koshermat_dm_user_id");
  const pendingUsername = sessionStorage.getItem("koshermat_dm_username");
  sessionStorage.removeItem("koshermat_dm_user_id");
  sessionStorage.removeItem("koshermat_dm_username");

  await loadConversations();
  subscribeConversationsList();

  if (pendingUserId) {
    await selectConversation(pendingUserId, pendingUsername);
  }

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ACTIVE_USER_ID) return;
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";
    const { error } = await sb.from("direct_messages").insert({
      sender_id: ME.id,
      recipient_id: ACTIVE_USER_ID,
      message: msg,
    });
    if (error) toast("שגיאה בשליחת ההודעה: " + error.message, "error");
  });
})();

// ---------------- רשימת שיחות ----------------
async function loadConversations() {
  const { data } = await sb
    .from("direct_messages")
    .select("id, message, created_at, sender_id, recipient_id, read_at, sender:sender_id(username, avatar_emoji), recipient:recipient_id(username, avatar_emoji)")
    .or(`sender_id.eq.${ME.id},recipient_id.eq.${ME.id}`)
    .order("created_at", { ascending: false })
    .limit(200);

  const seen = new Set();
  const conversations = [];
  for (const m of data || []) {
    const otherId = m.sender_id === ME.id ? m.recipient_id : m.sender_id;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const other = m.sender_id === ME.id ? m.recipient : m.sender;
    const unread = m.recipient_id === ME.id && !m.read_at;
    conversations.push({ otherId, other, message: m.message, unread });
  }
  renderConversations(conversations);
}

function renderConversations(conversations) {
  const list = document.getElementById("conversations-list");
  if (!conversations.length) {
    list.innerHTML = `<p class="muted text-center" style="font-size:13px;">אין עדיין שיחות. אפשר להתחיל שיחה חדשה מהפרופיל של שחקן אחר או מטבלת הדירוג.</p>`;
    return;
  }
  list.innerHTML = conversations
    .map(
      (c) => `
      <div class="conversation-item ${ACTIVE_USER_ID === c.otherId ? "active" : ""}" onclick="selectConversation('${c.otherId}', '${escapeHtml(c.other?.username || "שחקן")}')">
        <span>${c.other?.avatar_emoji || "♟️"} <b>${escapeHtml(c.other?.username || "שחקן")}</b></span>
        ${c.unread ? `<span class="badge open">חדש</span>` : ""}
      </div>`
    )
    .join("");
}

function subscribeConversationsList() {
  sb.channel("dm-list-" + ME.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, (payload) => {
      const row = payload.new || payload.old;
      if (row && (row.sender_id === ME.id || row.recipient_id === ME.id)) loadConversations();
    })
    .subscribe();

  // גיבוי: רענון יזום כל 5 שניות למקרה שההתראה בזמן-אמת לא הגיעה
  setInterval(loadConversations, 5000);
}

// ---------------- שיחה פעילה ----------------
async function selectConversation(userId, username) {
  ACTIVE_USER_ID = userId;
  ACTIVE_USERNAME = username;
  seenMsgIds.clear();

  document.getElementById("conversation-title").textContent = "💬 " + username;
  document.getElementById("chat-form").style.display = "flex";
  document.querySelectorAll(".conversation-item").forEach((el) => el.classList.remove("active"));

  await loadConversationMessages();
  await markConversationRead();
  await loadConversations();
}
window.selectConversation = selectConversation;

async function loadConversationMessages() {
  const { data } = await sb
    .from("direct_messages")
    .select("id, message, created_at, sender_id, recipient_id")
    .or(
      `and(sender_id.eq.${ME.id},recipient_id.eq.${ACTIVE_USER_ID}),and(sender_id.eq.${ACTIVE_USER_ID},recipient_id.eq.${ME.id})`
    )
    .order("created_at", { ascending: true })
    .limit(200);

  const box = document.getElementById("chat-messages");
  box.innerHTML = "";
  seenMsgIds.clear();
  (data || []).forEach((m) => appendMessage(m));
  box.scrollTop = box.scrollHeight;
}

function appendMessage(m) {
  if (seenMsgIds.has(m.id)) return;
  seenMsgIds.add(m.id);
  const box = document.getElementById("chat-messages");
  const mine = m.sender_id === ME.id;
  const div = document.createElement("div");
  div.className = "chat-msg" + (mine ? " me" : "");
  div.innerHTML = escapeHtml(m.message);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function markConversationRead() {
  await sb
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", ME.id)
    .eq("sender_id", ACTIVE_USER_ID)
    .is("read_at", null);
}

function subscribeActiveConversation() {
  setInterval(async () => {
    if (!ACTIVE_USER_ID) return;
    const { data } = await sb
      .from("direct_messages")
      .select("id, message, created_at, sender_id, recipient_id")
      .or(
        `and(sender_id.eq.${ME.id},recipient_id.eq.${ACTIVE_USER_ID}),and(sender_id.eq.${ACTIVE_USER_ID},recipient_id.eq.${ME.id})`
      )
      .order("created_at", { ascending: true })
      .limit(200);
    (data || []).forEach((m) => appendMessage(m));
    await markConversationRead();
  }, 2500);
}
subscribeActiveConversation();
