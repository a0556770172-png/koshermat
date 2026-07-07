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
        const email = sessionStorage.getItem(EMAIL_KEY);
        statusBox.innerHTML = `<span class="spinner"></span> הבקשה אושרה! שולח קישור כניסה למייל שלך...`;

        const { error: otpError } = await sb.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo:
              window.location.origin +
              window.location.pathname.replace(/emergency-access\.html$/, "lobby.html"),
          },
        });

        sessionStorage.removeItem(ID_KEY);
        sessionStorage.removeItem(EMAIL_KEY);

        if (otpError) {
          statusBox.innerHTML = `❌ שגיאה בשליחת קישור הכניסה: ${escapeHtml(otpError.message)}`;
          return;
        }

        statusBox.innerHTML = `✅ הבקשה אושרה! שלחנו קישור כניסה למייל <b>${escapeHtml(
          email
        )}</b> - פתח את תיבת הדואר שלך ולחץ על הקישור כדי להיכנס ישירות, ללא הרשמה נוספת.`;
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
