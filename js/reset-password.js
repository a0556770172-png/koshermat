// ==========================================================
// דף איפוס סיסמה - מטפל בקישור שמגיע מהמייל ומאפשר הגדרת סיסמה חדשה
// ==========================================================

let recoveryReady = false;

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recoveryReady = true;
    showForm();
  }
});

(async function init() {
  // גיבוי: לפעמים האירוע PASSWORD_RECOVERY לא נתפס בזמן (תלוי בטיימינג של
  // עיבוד הקישור מהמייל) - בודקים גם ישירות אם כבר יש session פעיל
  for (let i = 0; i < 8 && !recoveryReady; i++) {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      recoveryReady = true;
      showForm();
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!recoveryReady) {
    document.getElementById("reset-status").textContent = "הקישור לא תקין או שפג תוקפו. בקש קישור חדש מדף ההתחברות.";
  }
})();

function showForm() {
  document.getElementById("reset-status").style.display = "none";
  document.getElementById("reset-form").style.display = "flex";
}

document.getElementById("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("new-password").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> מעדכן...`;

  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    toast("שגיאה: " + error.message, "error");
    btn.disabled = false;
    btn.textContent = "עדכן סיסמה";
    return;
  }
  toast("הסיסמה עודכנה בהצלחה! מעביר אותך ללובי...", "success");
  setTimeout(() => (location.href = "lobby.html"), 1000);
});
