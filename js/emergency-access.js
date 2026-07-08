// ==========================================================
// גישת חירום - יצירת משתמש ללא הרשמה רגילה (למצבי חירום), ובנוסף
// כניסת אורח מיידית עם קוד גישה קבוע שהמנהל מגדיר - בלי מייל,
// בלי שם משתמש, בלי אישור מנהל בכלל.
// ==========================================================

(function () {
  const form = document.getElementById("emergency-form");
  const statusBox = document.getElementById("emergency-status");
  const emailInput = document.getElementById("emergency-email");

  const tabRequest = document.getElementById("tab-request");
  const tabCode = document.getElementById("tab-code");
  const guestCodeForm = document.getElementById("guest-code-form");
  const guestCodeStatus = document.getElementById("guest-code-status");
  const guestCodeInput = document.getElementById("guest-code-input");

  // ---------------- מעבר בין הטאבים ----------------
  tabRequest.addEventListener("click", () => {
    tabRequest.classList.add("active");
    tabCode.classList.remove("active");
    form.classList.add("active");
    guestCodeForm.classList.remove("active");
    statusBox.style.display = existingId ? "block" : "none";
    guestCodeStatus.style.display = "none";
  });

  tabCode.addEventListener("click", () => {
    tabCode.classList.add("active");
    tabRequest.classList.remove("active");
    guestCodeForm.classList.add("active");
    form.classList.remove("active");
    statusBox.style.display = "none";
  });

  const ID_KEY = "koshermat_emergency_request_id";
  const EMAIL_KEY = "koshermat_emergency_request_email";
  let pollTimer = null;

  const existingId = sessionStorage.getItem(ID_KEY);
  if (existingId) {
    startPolling(existingId);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> שולח...`;

    try {
      const { data, error } = await withRetry(() =>
        sb.rpc("submit_emergency_access_request", { p_email: email })
      );

      if (error) {
        toast("שגיאה בשליחת הבקשה: " + error.message, "error");
        btn.disabled = false;
        btn.textContent = "שלח בקשה למנהל";
        return;
      }

      sessionStorage.setItem(ID_KEY, data);
      sessionStorage.setItem(EMAIL_KEY, email);
      startPolling(data);
    } catch (err) {
      toast(
        "אין תגובה מהשרת אחרי כמה ניסיונות - בדוק את החיבור לאינטרנט ונסה שוב: " +
          (err && err.message ? err.message : String(err)),
        "error"
      );
      btn.disabled = false;
      btn.textContent = "שלח בקשה למנהל";
    }
  });

  function startPolling(id) {
    form.style.display = "none";
    statusBox.style.display = "block";
    statusBox.innerHTML = `<span class="spinner"></span> הבקשה נשלחה למנהל האתר, ממתין לאישור...`;
    checkStatus(id);
    pollTimer = setInterval(() => checkStatus(id), 4000);
  }

  async function checkStatus(id) {
    try {
      const { data, error } = await sb.rpc("get_emergency_request_status", { p_id: id });
      if (error) return;
      const status = Array.isArray(data) ? data[0] : data;

      if (status === "approved") {
        clearInterval(pollTimer);
        statusBox.innerHTML = `<span class="spinner"></span> הבקשה אושרה! מתחבר אותך ישירות...`;

        try {
          const { data: fnData, error: fnError } = await withRetry(() =>
            sb.functions.invoke("emergency-login", { body: { request_id: id } })
          );

          if (fnError || !fnData || fnData.error) {
            statusBox.innerHTML = `❌ שגיאה בהתחברות: ${escapeHtml(
              (fnData && fnData.error) || (fnError && fnError.message) || "שגיאה לא ידועה"
            )}`;
            return;
          }

          const { error: verifyError } = await withRetry(() =>
            sb.auth.verifyOtp({
              email: fnData.email,
              token_hash: fnData.token_hash,
              type: "magiclink",
            })
          );

          sessionStorage.removeItem(ID_KEY);
          sessionStorage.removeItem(EMAIL_KEY);

          if (verifyError) {
            statusBox.innerHTML = `❌ שגיאה באימות הכניסה: ${escapeHtml(verifyError.message)}`;
            return;
          }

          statusBox.innerHTML = `✅ מחובר! מעביר אותך ללובי...`;
          setTimeout(() => (window.location.href = "lobby.html"), 500);
        } catch (err) {
          statusBox.innerHTML = `❌ שגיאה בהתחברות - נסה לרענן את הדף ולבדוק שוב: ${escapeHtml(
            (err && err.message) || String(err)
          )}`;
        }
      } else if (status === "rejected") {
        clearInterval(pollTimer);
        sessionStorage.removeItem(ID_KEY);
        sessionStorage.removeItem(EMAIL_KEY);
        statusBox.innerHTML = `❌ בקשת הגישה נדחתה על ידי הניהול.`;
      }
    } catch (err) {
      // מתעלמים משגיאת רשת חד-פעמית בפולינג - ננסה שוב בסבב הבא
    }
  }

  // ---------------- כניסת אורח מיידית עם קוד גישה ----------------
  guestCodeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = guestCodeInput.value.trim();
    if (!code) return;

    const btn = guestCodeForm.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> נכנס...`;
    guestCodeStatus.style.display = "block";
    guestCodeStatus.innerHTML = `<span class="spinner"></span> בודק את הקוד...`;

    try {
      const { data: fnData, error: fnError } = await withRetry(() =>
        sb.functions.invoke("guest-access", { body: { code } })
      );

      if (fnError || !fnData || fnData.error) {
        guestCodeStatus.innerHTML = `❌ ${escapeHtml(
          (fnData && fnData.error) || (fnError && fnError.message) || "קוד גישה שגוי"
        )}`;
        btn.disabled = false;
        btn.textContent = "כניסה מיידית";
        return;
      }

      const { error: verifyError } = await withRetry(() =>
        sb.auth.verifyOtp({
          email: fnData.email,
          token_hash: fnData.token_hash,
          type: "magiclink",
        })
      );

      if (verifyError) {
        guestCodeStatus.innerHTML = `❌ שגיאה בכניסה: ${escapeHtml(verifyError.message)}`;
        btn.disabled = false;
        btn.textContent = "כניסה מיידית";
        return;
      }

      guestCodeStatus.innerHTML = `✅ נכנסת בהצלחה! מעביר אותך ללובי...`;
      setTimeout(() => (window.location.href = "lobby.html"), 500);
    } catch (err) {
      guestCodeStatus.innerHTML = `❌ אין תגובה מהשרת - בדוק את החיבור לאינטרנט ונסה שוב: ${escapeHtml(
        (err && err.message) || String(err)
      )}`;
      btn.disabled = false;
      btn.textContent = "כניסה מיידית";
    }
  });
})();
