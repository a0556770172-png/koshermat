// ==========================================================
// גישת חירום - יצירת משתמש ללא הרשמה רגילה (למצבי חירום)
// ==========================================================

(function () {
  const form = document.getElementById("emergency-form");
  const statusBox = document.getElementById("emergency-status");
  const emailInput = document.getElementById("emergency-email");

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
      const { data, error } = await sb.rpc("submit_emergency_access_request", { p_email: email });

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
      toast("אין תגובה מהשרת - בדוק את החיבור לאינטרנט ונסה שוב", "error");
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
          const { data: fnData, error: fnError } = await sb.functions.invoke("emergency-login", {
            body: { request_id: id },
          });

          if (fnError || !fnData || fnData.error) {
            statusBox.innerHTML = `❌ שגיאה בהתחברות: ${escapeHtml(
              (fnData && fnData.error) || (fnError && fnError.message) || "שגיאה לא ידועה"
            )}`;
            return;
          }

          const { error: verifyError } = await sb.auth.verifyOtp({
            email: fnData.email,
            token_hash: fnData.token_hash,
            type: "magiclink",
          });

          sessionStorage.removeItem(ID_KEY);
          sessionStorage.removeItem(EMAIL_KEY);

          if (verifyError) {
            statusBox.innerHTML = `❌ שגיאה באימות הכניסה: ${escapeHtml(verifyError.message)}`;
            return;
          }

          statusBox.innerHTML = `✅ מחובר! מעביר אותך ללובי...`;
          setTimeout(() => (window.location.href = "lobby.html"), 500);
        } catch (err) {
          statusBox.innerHTML = `❌ שגיאה בהתחברות - נסה לרענן את הדף ולבדוק שוב`;
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
})();
