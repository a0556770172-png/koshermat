// ===================================================================
// Board3D loader + חיווט לכפתור התצוגה התלת-ממדית בעמוד המשחק.
// טוען את Three.js וההרחבות שלו מ-CDN רק כשלוחצים על הכפתור (lazy load),
// כדי לא להאט את טעינת עמוד המשחק הרגיל. במקרה של כשל רשת/WebGL —
// חוזרים בצורה חלקה ללוח ה-2D הרגיל (שממשיך לעבוד בדיוק כמו קודם).
// ===================================================================
(function () {
  "use strict";

  const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.128.0/";
  const THREE_FILES = [
    THREE_BASE + "build/three.min.js",
    THREE_BASE + "examples/js/shaders/CopyShader.js",
    THREE_BASE + "examples/js/shaders/LuminosityHighPassShader.js",
    THREE_BASE + "examples/js/postprocessing/Pass.js",
    THREE_BASE + "examples/js/postprocessing/EffectComposer.js",
    THREE_BASE + "examples/js/postprocessing/RenderPass.js",
    THREE_BASE + "examples/js/postprocessing/ShaderPass.js",
    THREE_BASE + "examples/js/postprocessing/UnrealBloomPass.js",
    THREE_BASE + "examples/js/controls/OrbitControls.js",
  ];

  let threeLoaded = false;
  let threeLoadingPromise = null;

  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) {
      return false;
    }
  }

  async function loadScriptText(url) {
    const resp = await fetchWithTimeout(url, {}, 20000);
    if (!resp.ok) throw new Error("HTTP " + resp.status + " עבור " + url);
    const code = await resp.text();
    const s = document.createElement("script");
    s.textContent = code;
    document.head.appendChild(s);
  }

  function ensureThreeLoaded() {
    if (threeLoaded) return Promise.resolve();
    if (threeLoadingPromise) return threeLoadingPromise;
    threeLoadingPromise = (async () => {
      for (const url of THREE_FILES) {
        await loadScriptText(url);
      }
      if (!window.THREE) throw new Error("THREE לא נטען כראוי");
      threeLoaded = true;
    })();
    return threeLoadingPromise;
  }

  function currentState3D() {
    return {
      board: chess.board(),
      selectedSquare,
      legalTargets,
      inCheck: chess.in_check(),
      turn: chess.turn(),
      lastMoveSquares,
      flip: orientation() === "black",
      gameEnded,
      checkmate: chess.in_checkmate(),
    };
  }

  // חיבור לתוך renderBoard הקיים — בלי לגעת בלוגיקת המשחק עצמה.
  // בכל פעם שהלוח ה-2D מתעדכן, אם מצב ה-3D פעיל, גם הוא מתעדכן לאותו מצב.
  const _origRenderBoard = renderBoard;
  renderBoard = function () {
    _origRenderBoard();
    if (window.Board3D && Board3D.isActive()) {
      Board3D.sync(currentState3D());
    }
  };

  const THEME_KEY = "koshermat_board3d_theme";

  function wireThemeBar() {
    const bar = document.getElementById("board3d-theme-bar");
    if (!bar) return;
    const saved = localStorage.getItem(THEME_KEY) || "library";
    bar.querySelectorAll(".board3d-theme-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.theme === saved);
      b.addEventListener("click", () => {
        const theme = b.dataset.theme;
        localStorage.setItem(THEME_KEY, theme);
        bar.querySelectorAll(".board3d-theme-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        if (window.Board3D && Board3D.isActive()) Board3D.setTheme(theme);
      });
    });
  }

  async function enable3D() {
    const btn = document.getElementById("toggle-3d-btn");
    const loading = document.getElementById("board3d-loading");
    const wrapOuter = document.getElementById("board3d-wrap-outer");
    const container = document.getElementById("board3d-container");
    const board2d = document.getElementById("board");
    if (!hasWebGL()) {
      toast("הדפדפן/המכשיר שלך לא תומך בתצוגה תלת-ממדית - נשארים בלוח הרגיל", "error");
      return;
    }
    loading.style.display = "flex";
    try {
      await ensureThreeLoaded();
      board2d.style.display = "none";
      wrapOuter.style.display = "block";
      loading.style.display = "none";
      const savedTheme = localStorage.getItem(THEME_KEY) || "library";
      Board3D.init(container, { onSquareClick, theme: savedTheme });
      Board3D.sync(currentState3D());
      btn.classList.add("active");
      sessionStorage.setItem("koshermat_board3d", "1");
    } catch (e) {
      loading.style.display = "none";
      toast("התצוגה התלת-ממדית לא נטענה - בדוק את החיבור לאינטרנט ונסה שוב", "error");
    }
  }

  function disable3D() {
    const btn = document.getElementById("toggle-3d-btn");
    const wrapOuter = document.getElementById("board3d-wrap-outer");
    const board2d = document.getElementById("board");
    Board3D.destroy();
    wrapOuter.style.display = "none";
    board2d.style.display = "grid";
    btn.classList.remove("active");
    sessionStorage.removeItem("koshermat_board3d");
  }

  function wireToggleButton() {
    const btn = document.getElementById("toggle-3d-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (window.Board3D && Board3D.isActive()) {
        disable3D();
      } else {
        enable3D();
      }
    });
  }
  // הכפתור כבר קיים ב-DOM בשלב הזה (הסקריפט טעון אחרי ה-HTML של העמוד),
  // לכן מחווטים ישירות בלי להמתין ל-DOMContentLoaded (שאולי כבר קרה).
  wireToggleButton();
  wireThemeBar();
})();
