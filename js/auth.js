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

  // עוטפים ב-try/catch כדי שהכפתור לעולם לא יישאר תקוע אם הבקשה נכשלת
  // באופן לא צפוי (כולל timeout של הרשת שהוגדר ב-supabaseClient.js)
  try {
    const { data, error } = await withRetry(() =>
      sb.auth.signUp({
        email,
        password,
        options: { data: { username } },
      })
    );

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
  } catch (err) {
    toast("אין תגובה מהשרת - בדוק את החיבור לאינטרנט ונסה שוב: " + (err && err.message ? err.message : String(err)), "error");
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

  try {
    const { error } = await withRetry(() => sb.auth.signInWithPassword({ email, password }));

    if (error) {
      toast("שגיאה בהתחברות: " + error.message, "error");
      btn.disabled = false;
      btn.textContent = "התחבר";
      return;
    }

    toast("התחברת בהצלחה!", "success");
    setTimeout(() => (window.location.href = "lobby.html"), 500);
  } catch (err) {
    toast("אין תגובה מהשרת - בדוק את החיבור לאינטרנט ונסה שוב: " + (err && err.message ? err.message : String(err)), "error");
    btn.disabled = false;
    btn.textContent = "התחבר";
  }
});

document.getElementById("forgot-password-link").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    toast("קודם תכתוב את כתובת האימייל שלך בשדה למעלה", "error");
    return;
  }
  try {
    const { error } = await withRetry(() =>
      sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname.replace(/auth\.html$/, "reset-password.html"),
      })
    );
    if (error) {
      toast("שגיאה: " + error.message, "error");
      return;
    }
    toast("נשלח מייל לאיפוס סיסמה - בדוק את תיבת הדואר שלך", "success");
  } catch (err) {
    toast("אין תגובה מהשרת - בדוק את החיבור לאינטרנט ונסה שוב: " + (err && err.message ? err.message : String(err)), "error");
  }
});
