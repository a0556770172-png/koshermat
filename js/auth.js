// ==========================================================
// לוגיקת הרשמה / התחברות
// ==========================================================

(async function initAuthPage() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = "lobby.html";
    return;
  }
})();

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const formLogin = document.getElementById("form-login");
const formSignup = document.getElementById("form-signup");

function switchTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabSignup.classList.toggle("active", !isLogin);
  formLogin.classList.toggle("active", isLogin);
  formSignup.classList.toggle("active", !isLogin);
}
tabLogin.addEventListener("click", () => switchTab("login"));
tabSignup.addEventListener("click", () => switchTab("signup"));

formSignup.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = formSignup.querySelector("button[type=submit]");
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  if (username.length < 3) {
    toast("שם המשתמש חייב להכיל לפחות 3 תווים", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> נרשם...`;

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    toast("שגיאה בהרשמה: " + error.message, "error");
    btn.disabled = false;
    btn.textContent = "צור חשבון";
    return;
  }

  if (data.session) {
    toast("נרשמת בהצלחה! מעביר אותך ללובי...", "success");
    setTimeout(() => (window.location.href = "lobby.html"), 900);
  } else {
    toast("נרשמת! אם נדרש אימות מייל, בדוק את תיבת הדואר שלך.", "success");
    btn.disabled = false;
    btn.textContent = "צור חשבון";
  }
});

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = formLogin.querySelector("button[type=submit]");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> מתחבר...`;

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    toast("שגיאה בהתחברות: " + error.message, "error");
    btn.disabled = false;
    btn.textContent = "התחבר";
    return;
  }

  toast("התחברת בהצלחה!", "success");
  setTimeout(() => (window.location.href = "lobby.html"), 500);
});
