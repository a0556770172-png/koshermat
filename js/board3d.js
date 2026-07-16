// ===================================================================
// Board3D — תצוגת שחמט תלת-ממדית פרימיום (Three.js)
// מודול עצמאי: מתרגם מצב משחק (chess.js) לסצנת Three.js, ומדווח בחזרה
// על קליקים על משבצות דרך callback. שום לוגיקת משחק לא כפולה כאן —
// כל האימות/חוקיות ממשיך לעבור דרך board.html הקיים (onSquareClick וכו').
// נטען ב"עצלות" (lazy) רק כשמשתמש לוחץ על כפתור התצוגה התלת-ממדית,
// כדי לא להכביד על טעינת העמוד הרגילה.
// ===================================================================
const Board3D = (function () {
  "use strict";

  let renderer = null,
    scene = null,
    camera = null,
    controls = null,
    composer = null,
    clock = null;
  let containerEl = null,
    active = false,
    rafId = null;
  let raycaster = null,
    mouseVec = null;
  let squareMeshes = {}; // squareName -> mesh
  let pieceGroups = {}; // squareName -> THREE.Group
  let prevLayout = {}; // squareName -> {type,color}
  let currentFlip = false;
  let onSquareClickCb = null;
  let hoveredSquare = null;
  let selectionMesh = null,
    legalMarkers = [],
    checkGlowMesh = null,
    checkmateSpot = null;
  let checkmateActive = false;
  let ambientLight = null,
    keyLight = null,
    fillLight = null;
  const BASE_AMBIENT = 0.55,
    BASE_KEY = 1.25,
    BASE_FILL = 0.4;
  let activeTweens = [];
  let resizeHandler = null;

  // רקעים / חלקיקים
  let backdropGroup = null;
  let currentTheme = "library";
  let flickerLight = null;
  let starfieldPoints = null;
  let snowPoints = null;
  let ambientParticles = null;
  let captureBursts = [];

  const FILES = "abcdefgh";
  const SQUARE_SIZE = 1.0;

  // ---------------- עזרים גיאומטריים ----------------
  function fileIndex(square) {
    return FILES.indexOf(square[0]);
  }
  function rankIndex(square) {
    return parseInt(square[1], 10) - 1;
  }
  function squareToWorld(square, flip) {
    let fx = fileIndex(square);
    let rk = rankIndex(square);
    if (flip) {
      fx = 7 - fx;
      rk = 7 - rk;
    }
    const x = (fx - 3.5) * SQUARE_SIZE;
    const z = (3.5 - rk) * SQUARE_SIZE;
    return { x, z };
  }
  function squareDistance(a, b) {
    const dx = fileIndex(a) - fileIndex(b);
    const dz = rankIndex(a) - rankIndex(b);
    return Math.sqrt(dx * dx + dz * dz);
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutBack(t) {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // ---------------- טקסטורות שיש פרוצדורליות ----------------
  function makeMarbleTexture(baseColor, veinColor, opts) {
    opts = opts || {};
    const size = opts.size || 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = veinColor;
    ctx.globalAlpha = opts.veinAlpha || 0.3;
    const veins = opts.veins || 5;
    for (let i = 0; i < veins; i++) {
      ctx.beginPath();
      let x = Math.random() * size;
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += size / 10) {
        x += (Math.random() - 0.5) * size * 0.22;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1 + Math.random() * 2.2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeGradientTexture(topColor, bottomColor, w, h) {
    w = w || 8;
    h = h || 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  function makeSoftDotTexture(color) {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  // ---------------- חומרים משותפים ----------------
  let MAT = null;
  function buildMaterials() {
    MAT = {
      whiteSquare: new THREE.MeshPhysicalMaterial({
        color: 0xf5f1e6,
        map: makeMarbleTexture("#f5f1e6", "#c9c2a8", { veins: 5, veinAlpha: 0.22 }),
        roughness: 0.35,
        metalness: 0.04,
        clearcoat: 0.45,
        clearcoatRoughness: 0.25,
      }),
      blackSquare: new THREE.MeshPhysicalMaterial({
        color: 0x111111,
        map: makeMarbleTexture("#111111", "#2b2b2b", { veins: 4, veinAlpha: 0.18 }),
        roughness: 0.16,
        metalness: 0.08,
        clearcoat: 0.7,
        clearcoatRoughness: 0.1,
      }),
      gold: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.6, metalness: 0.05 }),
      // ניגוד מקסימלי בין לבן לשחור: לבן = שנהב בהיר חם + זהב בוהק.
      // שחור = שחור עמוק כמעט טהור (לא אפרפר) + כסף/פלטינה קריר - שתי משפחות
      // צבע שונות לגמרי (חם/זהוב מול קריר/כסוף) כדי שאף פעם לא יהיה ספק מי שייך למי.
      whitePiece: new THREE.MeshPhysicalMaterial({
        color: 0xfaf6ea,
        roughness: 0.28,
        metalness: 0.04,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      }),
      blackPiece: new THREE.MeshPhysicalMaterial({
        color: 0x0a0a0a,
        roughness: 0.24,
        metalness: 0.06,
        clearcoat: 0.5,
        clearcoatRoughness: 0.18,
      }),
      goldAccent: new THREE.MeshStandardMaterial({ color: 0xe0bb4a, roughness: 0.25, metalness: 1 }),
      silverAccent: new THREE.MeshStandardMaterial({ color: 0xd6d6d6, roughness: 0.28, metalness: 1 }),
      kingGlowWhite: new THREE.MeshStandardMaterial({
        color: 0xe0bb4a,
        emissive: 0xd4af37,
        emissiveIntensity: 0.4,
        roughness: 0.22,
        metalness: 1,
      }),
      kingGlowBlack: new THREE.MeshStandardMaterial({
        color: 0xd6d6d6,
        emissive: 0x9fd6ff,
        emissiveIntensity: 0.4,
        roughness: 0.22,
        metalness: 1,
      }),
    };
  }

  function pieceBodyMat(color) {
    return color === "w" ? MAT.whitePiece : MAT.blackPiece;
  }
  function pieceAccentMat(color) {
    return color === "w" ? MAT.goldAccent : MAT.silverAccent;
  }
  function pieceKingGlowMat(color) {
    return color === "w" ? MAT.kingGlowWhite : MAT.kingGlowBlack;
  }

  // ---------------- בניית הלוח ----------------
  function buildBoard() {
    const boardGroup = new THREE.Group();
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const isLight = (f + r) % 2 === 0;
        const geo = new THREE.BoxGeometry(SQUARE_SIZE * 0.985, 0.12, SQUARE_SIZE * 0.985);
        const mesh = new THREE.Mesh(geo, isLight ? MAT.whiteSquare : MAT.blackSquare);
        const x = (f - 3.5) * SQUARE_SIZE;
        const z = (3.5 - r) * SQUARE_SIZE;
        mesh.position.set(x, -0.06, z);
        mesh.receiveShadow = true;
        const square = FILES[f] + (r + 1);
        mesh.userData.square = square;
        mesh.userData.isSquare = true;
        boardGroup.add(mesh);
        squareMeshes[square] = mesh;
      }
    }

    // מסגרת עץ כהה
    const frameThickness = 0.55;
    const outerSize = 8 + frameThickness * 2;
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-outerSize / 2, -outerSize / 2);
    frameShape.lineTo(outerSize / 2, -outerSize / 2);
    frameShape.lineTo(outerSize / 2, outerSize / 2);
    frameShape.lineTo(-outerSize / 2, outerSize / 2);
    frameShape.lineTo(-outerSize / 2, -outerSize / 2);
    const hole = new THREE.Path();
    hole.moveTo(-4, -4);
    hole.lineTo(4, -4);
    hole.lineTo(4, 4);
    hole.lineTo(-4, 4);
    hole.lineTo(-4, -4);
    frameShape.holes.push(hole);
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    frameGeo.rotateX(Math.PI / 2);
    const frameMesh = new THREE.Mesh(frameGeo, MAT.wood);
    frameMesh.position.y = -0.28;
    frameMesh.receiveShadow = true;
    frameMesh.castShadow = true;
    boardGroup.add(frameMesh);

    // סרט זהב על שפת הלוח
    const trimGeoH = new THREE.BoxGeometry(outerSize - 0.1, 0.05, 0.14);
    const trimGeoV = new THREE.BoxGeometry(0.14, 0.05, outerSize - 0.1);
    [4.03, -4.03].forEach((z) => {
      const m = new THREE.Mesh(trimGeoH, MAT.gold);
      m.position.set(0, -0.11, z);
      m.castShadow = true;
      boardGroup.add(m);
    });
    [4.03, -4.03].forEach((x) => {
      const m = new THREE.Mesh(trimGeoV, MAT.gold);
      m.position.set(x, -0.11, 0);
      m.castShadow = true;
      boardGroup.add(m);
    });

    // עיטורי פינות זהב
    const cornerGeo = new THREE.SphereGeometry(0.22, 20, 20);
    const half = outerSize / 2 - 0.32;
    [
      [-half, -half],
      [half, -half],
      [-half, half],
      [half, half],
    ].forEach(([x, z]) => {
      const m = new THREE.Mesh(cornerGeo, MAT.gold);
      m.position.set(x, -0.02, z);
      m.castShadow = true;
      boardGroup.add(m);
    });

    scene.add(boardGroup);
  }

  // ---------------- רקעים נושאיים (ספרייה/ארמון/חלל/הרי שלג) ----------------
  function clearBackdrop() {
    if (backdropGroup) {
      scene.remove(backdropGroup);
      backdropGroup = null;
    }
    scene.fog = null;
    flickerLight = null;
    starfieldPoints = null;
    snowPoints = null;
  }

  function buildBackdropLibrary() {
    backdropGroup = new THREE.Group();
    scene.background = new THREE.Color(0x1a120b);
    scene.fog = new THREE.Fog(0x1a120b, 10, 24);
    const wallTex = makeGradientTexture("#3c2a18", "#0d0904", 8, 256);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), new THREE.MeshBasicMaterial({ map: wallTex }));
    wall.position.set(0, 5, -8);
    backdropGroup.add(wall);
    const bookColors = [0x7a2e2e, 0x2e4a7a, 0x3c5e3c, 0x7a5a2e, 0x5a2e7a, 0x2e6e6e];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 14; i++) {
        const w = 0.18 + Math.random() * 0.12,
          h = 0.55 + Math.random() * 0.25;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 0.32),
          new THREE.MeshStandardMaterial({
            color: bookColors[Math.floor(Math.random() * bookColors.length)],
            roughness: 0.75,
          })
        );
        book.position.set(-6.5 + i * 1.0, 1.2 + row * 1.7, -7.4);
        backdropGroup.add(book);
      }
    }
    flickerLight = new THREE.PointLight(0xffa040, 1.3, 12, 2);
    flickerLight.position.set(-3.5, 1.4, -3);
    backdropGroup.add(flickerLight);
    scene.add(backdropGroup);
  }

  function buildBackdropPalace() {
    backdropGroup = new THREE.Group();
    scene.background = new THREE.Color(0xede6d6);
    scene.fog = new THREE.Fog(0xede6d6, 12, 30);
    const wallTex = makeGradientTexture("#fff8ea", "#e4d9bd", 8, 256);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({ map: wallTex }));
    wall.position.set(0, 6, -9);
    backdropGroup.add(wall);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.4, metalness: 0.05 });
    [-6.5, -3.5, 3.5, 6.5].forEach((x) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 20), colMat);
      col.position.set(x, 2.5, -7.5);
      col.castShadow = true;
      backdropGroup.add(col);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 20), MAT.gold);
      cap.position.set(x, 6.1, -7.5);
      backdropGroup.add(cap);
    });
    scene.add(backdropGroup);
  }

  function buildBackdropSpace() {
    backdropGroup = new THREE.Group();
    scene.background = new THREE.Color(0x02040a);
    const nebulaCanvas = document.createElement("canvas");
    nebulaCanvas.width = 512;
    nebulaCanvas.height = 256;
    const ctx = nebulaCanvas.getContext("2d");
    ctx.fillStyle = "#02040a";
    ctx.fillRect(0, 0, 512, 256);
    const blobColors = ["rgba(90,60,160,0.35)", "rgba(40,90,160,0.3)", "rgba(160,60,120,0.25)"];
    for (let i = 0; i < 18; i++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60 + Math.random() * 60);
      g.addColorStop(0, blobColors[i % blobColors.length]);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.translate(Math.random() * 512, Math.random() * 256);
      ctx.fillStyle = g;
      ctx.fillRect(-150, -150, 300, 300);
      ctx.restore();
    }
    const nebulaTex = new THREE.CanvasTexture(nebulaCanvas);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(40, 24, 16),
      new THREE.MeshBasicMaterial({ map: nebulaTex, side: THREE.BackSide })
    );
    backdropGroup.add(sky);
    const starCount = 500;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2,
        phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 2;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.14,
      transparent: true,
      opacity: 0.85,
      map: makeSoftDotTexture("rgba(255,255,255,1)"),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    starfieldPoints = new THREE.Points(starGeo, starMat);
    backdropGroup.add(starfieldPoints);
    scene.add(backdropGroup);
  }

  function buildBackdropMountain() {
    backdropGroup = new THREE.Group();
    scene.background = new THREE.Color(0xcfe0e8);
    scene.fog = new THREE.Fog(0xcfe0e8, 8, 24);
    const wallTex = makeGradientTexture("#e8f2f6", "#a9c4d2", 8, 256);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({ map: wallTex }));
    wall.position.set(0, 5, -9);
    backdropGroup.add(wall);
    const peakMat = new THREE.MeshStandardMaterial({ color: 0xe9f2f5, roughness: 0.9 });
    const farPeakMat = new THREE.MeshStandardMaterial({ color: 0xb9cdd6, roughness: 0.9 });
    [
      [-5, 3, -8, farPeakMat],
      [0, 4, -8.5, peakMat],
      [5, 3.2, -8, farPeakMat],
      [-2, 2.6, -7.6, peakMat],
    ].forEach(([x, h, z, mat]) => {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(2.2, h, 4), mat);
      peak.position.set(x, h / 2 - 0.3, z);
      peak.rotation.y = Math.PI / 4;
      backdropGroup.add(peak);
    });
    const snowCount = 220;
    const positions = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      map: makeSoftDotTexture("rgba(255,255,255,1)"),
      depthWrite: false,
    });
    snowPoints = new THREE.Points(snowGeo, snowMat);
    backdropGroup.add(snowPoints);
    scene.add(backdropGroup);
  }

  function setTheme(name) {
    currentTheme = name || "library";
    if (!scene) return;
    clearBackdrop();
    if (currentTheme === "palace") buildBackdropPalace();
    else if (currentTheme === "space") buildBackdropSpace();
    else if (currentTheme === "mountain") buildBackdropMountain();
    else buildBackdropLibrary();
  }

  // ---------------- חלקיקים: אבק/ניצוצות תמידיים + התפוצצות באכילה ----------------
  function buildAmbientParticles() {
    const count = 36;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = 0.3 + Math.random() * 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd4af37,
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      map: makeSoftDotTexture("rgba(255,235,180,1)"),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    ambientParticles = new THREE.Points(geo, mat);
    ambientParticles.userData.baseY = positions.slice();
    scene.add(ambientParticles);
  }

  function spawnCaptureBurst(square, flip) {
    if (!scene) return;
    const pos = squareToWorld(square, flip);
    const count = 16;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = 0.3;
      positions[i * 3 + 2] = pos.z;
      const ang = Math.random() * Math.PI * 2,
        speed = 0.6 + Math.random() * 0.9;
      velocities.push(new THREE.Vector3(Math.cos(ang) * speed, 1 + Math.random() * 1.5, Math.sin(ang) * speed));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd32f2f,
      size: 0.075,
      transparent: true,
      opacity: 0.9,
      map: makeSoftDotTexture("rgba(255,180,140,1)"),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    captureBursts.push({ points, velocities, elapsed: 0, duration: 550 });
  }

  function updateParticleSystems(dt, t) {
    if (flickerLight) {
      flickerLight.intensity = 1.1 + Math.sin(t * 7) * 0.15 + Math.sin(t * 13) * 0.08;
    }
    if (starfieldPoints) starfieldPoints.rotation.y += dt * 0.01;
    if (snowPoints) {
      const posAttr = snowPoints.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.array[i * 3 + 1] -= dt * 0.6;
        if (posAttr.array[i * 3 + 1] < -0.5) posAttr.array[i * 3 + 1] = 8;
      }
      posAttr.needsUpdate = true;
    }
    if (ambientParticles) {
      ambientParticles.rotation.y += dt * 0.03;
      const posAttr = ambientParticles.geometry.attributes.position;
      const base = ambientParticles.userData.baseY;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.6 + i) * 0.15;
      }
      posAttr.needsUpdate = true;
    }
    for (let i = captureBursts.length - 1; i >= 0; i--) {
      const b = captureBursts[i];
      b.elapsed += dt * 1000;
      const bt = b.elapsed / b.duration;
      const posAttr = b.points.geometry.attributes.position;
      for (let j = 0; j < b.velocities.length; j++) {
        b.velocities[j].y -= 2.5 * dt;
        posAttr.array[j * 3] += b.velocities[j].x * dt;
        posAttr.array[j * 3 + 1] += b.velocities[j].y * dt;
        posAttr.array[j * 3 + 2] += b.velocities[j].z * dt;
      }
      posAttr.needsUpdate = true;
      b.points.material.opacity = Math.max(0, 0.9 * (1 - bt));
      if (bt >= 1) {
        scene.remove(b.points);
        captureBursts.splice(i, 1);
      }
    }
  }

  // ---------------- בניית כלים (גיאומטריה מסוגננת ברמת פרימיום) ----------------
  function addBaseCollar(group, color, radius, y) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 10, 24), pieceAccentMat(color));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.castShadow = true;
    group.add(ring);
  }

  function buildPieceMesh(type, color) {
    const group = new THREE.Group();
    const body = pieceBodyMat(color);
    const accent = pieceAccentMat(color);

    function cyl(rt, rb, h, y, mat, segs) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs || 24), mat || body);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    }
    function sph(r, y, mat, segs) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, segs || 20, segs || 20), mat || body);
      m.position.y = y;
      m.castShadow = true;
      group.add(m);
      return m;
    }

    // בסיס משותף לכל הכלים
    cyl(0.27, 0.3, 0.09, 0.045);
    addBaseCollar(group, color, 0.29, 0.1);

    if (type === "p") {
      cyl(0.16, 0.2, 0.16, 0.17);
      cyl(0.08, 0.13, 0.2, 0.34);
      sph(0.15, 0.48);
    } else if (type === "r") {
      cyl(0.21, 0.24, 0.34, 0.26);
      const top = cyl(0.25, 0.21, 0.09, 0.47);
      top;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const cren = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), body);
        cren.position.set(Math.cos(ang) * 0.2, 0.565, Math.sin(ang) * 0.2);
        cren.castShadow = true;
        group.add(cren);
      }
      addBaseCollar(group, color, 0.22, 0.42);
    } else if (type === "b") {
      cyl(0.13, 0.21, 0.4, 0.29);
      addBaseCollar(group, color, 0.19, 0.44);
      sph(0.14, 0.53);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), accent);
      slit.position.y = 0.62;
      slit.rotation.z = 0.5;
      group.add(slit);
      sph(0.05, 0.7, accent, 10);
    } else if (type === "n") {
      // גוף/צוואר
      const neck = cyl(0.16, 0.22, 0.34, 0.28);
      neck.rotation.z = 0.18;
      // ראש (מוארך, מסוגנן)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.32), body);
      head.position.set(0.09, 0.52, 0.02);
      head.rotation.z = -0.15;
      head.castShadow = true;
      group.add(head);
      // חוטם
      const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.2), body);
      muzzle.position.set(0.15, 0.44, 0.14);
      muzzle.castShadow = true;
      group.add(muzzle);
      // אוזניים
      [-0.06, 0.06].forEach((dz) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 10), body);
        ear.position.set(0.05, 0.66, dz);
        ear.rotation.x = -0.2;
        ear.castShadow = true;
        group.add(ear);
      });
      // רעמה - טבעות זהב קטנות לאורך הגב
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.1 - i * 0.015, 0.018, 8, 16), accent);
        m.position.set(-0.05, 0.38 + i * 0.09, -0.08);
        m.rotation.y = Math.PI / 2;
        m.castShadow = true;
        group.add(m);
      }
      addBaseCollar(group, color, 0.2, 0.14);
    } else if (type === "q") {
      cyl(0.15, 0.22, 0.42, 0.31);
      addBaseCollar(group, color, 0.2, 0.51);
      const crownBase = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 12, 24), accent);
      crownBase.rotation.x = Math.PI / 2;
      crownBase.position.y = 0.58;
      crownBase.castShadow = true;
      group.add(crownBase);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 10), accent);
        spike.position.set(Math.cos(ang) * 0.16, 0.68, Math.sin(ang) * 0.16);
        spike.castShadow = true;
        group.add(spike);
      }
      sph(0.09, 0.72, body, 16);
    } else if (type === "k") {
      cyl(0.17, 0.24, 0.48, 0.33);
      addBaseCollar(group, color, 0.22, 0.57);
      const jewelBand = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 12, 24), accent);
      jewelBand.rotation.x = Math.PI / 2;
      jewelBand.position.y = 0.62;
      jewelBand.castShadow = true;
      group.add(jewelBand);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), pieceKingGlowMat(color));
        jewel.position.set(Math.cos(ang) * 0.2, 0.62, Math.sin(ang) * 0.2);
        group.add(jewel);
      }
      sph(0.1, 0.7, body, 16);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), pieceKingGlowMat(color));
      crossV.position.y = 0.86;
      group.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), pieceKingGlowMat(color));
      crossH.position.y = 0.82;
      group.add(crossH);
    }

    group.userData.pieceType = type;
    group.userData.pieceColor = color;
    group.userData.baseScale = { x: 1, y: 1, z: 1 };
    return group;
  }

  // ---------------- אורות + מצלמה + רינדור ----------------
  function buildLights() {
    ambientLight = new THREE.AmbientLight(0x404050, BASE_AMBIENT);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xfff2d9, BASE_KEY);
    keyLight.position.set(-5, 8, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0015;
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0x5e8bff, BASE_FILL);
    fillLight.position.set(6, 4, -5);
    scene.add(fillLight);
  }

  function buildComposer() {
    if (!window.THREE || !THREE.EffectComposer || !THREE.UnrealBloomPass) return null;
    const c = new THREE.EffectComposer(renderer);
    c.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(containerEl.clientWidth, containerEl.clientHeight),
      0.5,
      0.4,
      0.88
    );
    c.addPass(bloom);
    return c;
  }

  function ensureScene(container) {
    containerEl = container;
    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 8.6, 7.4);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (renderer.outputEncoding !== undefined && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    buildMaterials();
    buildLights();
    buildBoard();
    buildAmbientParticles();
    setTheme(currentTheme);

    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 6;
      controls.maxDistance = 14;
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = 1.15;
      controls.enablePan = false;
      controls.target.set(0, 0, 0);
    }

    composer = buildComposer();

    raycaster = new THREE.Raycaster();
    mouseVec = new THREE.Vector2();

    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);

    resizeHandler = function () {
      if (!active) return;
      const w = containerEl.clientWidth,
        h = containerEl.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
    };
    window.addEventListener("resize", resizeHandler);
  }

  // ---------------- קליקים / ריחוף ----------------
  function findSquareFromIntersect(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.square) return o.userData.square;
      o = o.parent;
    }
    return null;
  }

  function handleClick(ev) {
    if (!active) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length && onSquareClickCb) {
      const square = findSquareFromIntersect(intersects[0].object);
      if (square) onSquareClickCb(square);
    }
  }

  function handlePointerMove(ev) {
    if (!active) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseVec.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    let square = null;
    if (intersects.length) square = findSquareFromIntersect(intersects[0].object);
    if (square !== hoveredSquare) {
      if (hoveredSquare && pieceGroups[hoveredSquare]) {
        addTween(pieceGroups[hoveredSquare].position, "y", pieceGroups[hoveredSquare].position.y, 0, 150);
      }
      hoveredSquare = square;
      if (hoveredSquare && pieceGroups[hoveredSquare]) {
        addTween(pieceGroups[hoveredSquare].position, "y", pieceGroups[hoveredSquare].position.y, 0.1, 150);
      }
    }
  }

  // ---------------- מנוע טווין פשוט ----------------
  function addTween(obj, prop, from, to, duration, onComplete, ease) {
    activeTweens.push({ obj, prop, from, to, duration, elapsed: 0, ease: ease || easeInOutCubic, onComplete });
  }
  function addTweenVec(obj, propName, toVec, duration, onComplete, ease) {
    const from = obj[propName].clone();
    activeTweens.push({
      obj,
      propName,
      vecFrom: from,
      vecTo: toVec.clone(),
      duration,
      elapsed: 0,
      isVec: true,
      ease: ease || easeInOutCubic,
      onComplete,
    });
  }
  function updateTweens(dtMs) {
    for (let i = activeTweens.length - 1; i >= 0; i--) {
      const tw = activeTweens[i];
      tw.elapsed += dtMs;
      const t = Math.min(tw.elapsed / tw.duration, 1);
      const e = tw.ease(t);
      if (tw.isVec) {
        tw.obj[tw.propName].lerpVectors(tw.vecFrom, tw.vecTo, e);
      } else {
        tw.obj[tw.prop] = tw.from + (tw.to - tw.from) * e;
      }
      if (t >= 1) {
        activeTweens.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }
  }

  // ---------------- מיקום/עדכון כלים לפי מצב לוח ----------------
  function placeGroupAtSquare(group, square, flip) {
    const pos = squareToWorld(square, flip);
    group.position.set(pos.x, 0, pos.z);
  }

  function popInAt(square, piece, flip) {
    const g = buildPieceMesh(piece.type, piece.color);
    placeGroupAtSquare(g, square, flip);
    g.scale.set(0.001, 0.001, 0.001);
    scene.add(g);
    pieceGroups[square] = g;
    addTween(g.scale, "x", 0.001, 1, 320, null, easeOutBack);
    addTween(g.scale, "y", 0.001, 1, 320, null, easeOutBack);
    addTween(g.scale, "z", 0.001, 1, 320, null, easeOutBack);
  }

  function fadeOutAt(square) {
    const g = pieceGroups[square];
    if (!g) return;
    delete pieceGroups[square];
    spawnCaptureBurst(square, currentFlip);
    addTween(g.scale, "x", g.scale.x, 0.001, 260, () => scene.remove(g));
    addTween(g.scale, "y", g.scale.y, 0.001, 260);
    addTween(g.scale, "z", g.scale.z, 0.001, 260);
  }

  function animateSlide(fromSquare, toSquare, piece, flip) {
    const g = pieceGroups[fromSquare];
    if (!g) {
      popInAt(toSquare, piece, flip);
      return;
    }
    delete pieceGroups[fromSquare];
    pieceGroups[toSquare] = g;
    const targetPos = squareToWorld(toSquare, flip);
    addTweenVec(g, "position", new THREE.Vector3(targetPos.x, 0, targetPos.z), 250, null, easeInOutCubic);
    // קפיצה קלה בגובה תוך כדי תנועה
    addTween(g.position, "y", 0, 0.22, 125, () => {
      addTween(g.position, "y", 0.22, 0, 125);
    });
  }

  function pairAndAnimate(removed, added, flip) {
    const usedAdded = new Array(added.length).fill(false);
    removed.forEach((rem) => {
      let bestIdx = -1,
        bestDist = Infinity;
      added.forEach((add, idx) => {
        if (usedAdded[idx]) return;
        if (add.piece.type !== rem.piece.type || add.piece.color !== rem.piece.color) return;
        const d = squareDistance(rem.square, add.square);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      if (bestIdx >= 0) {
        usedAdded[bestIdx] = true;
        animateSlide(rem.square, added[bestIdx].square, added[bestIdx].piece, flip);
      } else {
        fadeOutAt(rem.square);
      }
    });
    added.forEach((add, idx) => {
      if (!usedAdded[idx]) popInAt(add.square, add.piece, flip);
    });
  }

  function rebuildAllPieces(layout, flip) {
    Object.keys(pieceGroups).forEach((sq) => scene.remove(pieceGroups[sq]));
    pieceGroups = {};
    Object.keys(layout).forEach((sq) => {
      const g = buildPieceMesh(layout[sq].type, layout[sq].color);
      placeGroupAtSquare(g, sq, flip);
      scene.add(g);
      pieceGroups[sq] = g;
    });
  }

  function applyLayout(layout, flip) {
    const flipChanged = flip !== currentFlip;
    currentFlip = flip;
    if (flipChanged) {
      rebuildAllPieces(layout, flip);
      prevLayout = JSON.parse(JSON.stringify(layout));
      return;
    }
    const removed = [],
      added = [];
    const allSquares = new Set(Object.keys(prevLayout).concat(Object.keys(layout)));
    allSquares.forEach((sq) => {
      const before = prevLayout[sq],
        after = layout[sq];
      const same = before && after && before.type === after.type && before.color === after.color;
      if (same) return;
      if (before) removed.push({ square: sq, piece: before });
      if (after) added.push({ square: sq, piece: after });
    });
    if (removed.length === 0 && added.length === 0) return;
    // אתחול ראשוני (אין מצב קודם) — בונים הכל בלי אנימציה
    if (Object.keys(prevLayout).length === 0) {
      rebuildAllPieces(layout, flip);
    } else {
      pairAndAnimate(removed, added, flip);
    }
    prevLayout = JSON.parse(JSON.stringify(layout));
  }

  // ---------------- הדגשות: בחירה / מהלכים חוקיים / שח / מט ----------------
  function clearHighlights() {
    if (selectionMesh) {
      scene.remove(selectionMesh);
      selectionMesh = null;
    }
    legalMarkers.forEach((m) => scene.remove(m));
    legalMarkers = [];
  }

  function updateHighlights(selectedSquare, legalTargets, flip) {
    clearHighlights();
    if (selectedSquare) {
      const pos = squareToWorld(selectedSquare, flip);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.045, 12, 32),
        new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          emissive: 0xd4af37,
          emissiveIntensity: 1,
          transparent: true,
          opacity: 0.9,
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pos.x, 0.03, pos.z);
      ring.userData.pulse = true;
      scene.add(ring);
      selectionMesh = ring;
    }
    (legalTargets || []).forEach((t) => {
      const pos = squareToWorld(t.to, flip);
      let marker;
      if (t.captured) {
        marker = new THREE.Mesh(
          new THREE.TorusGeometry(0.44, 0.045, 10, 28),
          new THREE.MeshStandardMaterial({
            color: 0xd32f2f,
            emissive: 0xd32f2f,
            emissiveIntensity: 0.9,
            transparent: true,
            opacity: 0.8,
          })
        );
        marker.rotation.x = Math.PI / 2;
        marker.position.set(pos.x, 0.04, pos.z);
      } else {
        marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 16, 16),
          new THREE.MeshPhysicalMaterial({
            color: 0x5e8bff,
            emissive: 0x5e8bff,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.55,
            roughness: 0.1,
            transmission: 0.25,
          })
        );
        marker.position.set(pos.x, 0.16, pos.z);
      }
      marker.userData.pulse = true;
      scene.add(marker);
      legalMarkers.push(marker);
    });
  }

  function clearCheckState() {
    if (checkGlowMesh) {
      scene.remove(checkGlowMesh);
      checkGlowMesh = null;
    }
    if (checkmateSpot) {
      scene.remove(checkmateSpot);
      checkmateSpot = null;
    }
    if (checkmateActive) {
      checkmateActive = false;
      addTween(ambientLight, "intensity", ambientLight.intensity, BASE_AMBIENT, 700);
      addTween(keyLight, "intensity", keyLight.intensity, BASE_KEY, 700);
      addTween(fillLight, "intensity", fillLight.intensity, BASE_FILL, 700);
    }
  }

  function findKingSquare(board2d, color) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = board2d[row][col];
        if (p && p.type === "k" && p.color === color) {
          return FILES[col] + (8 - row);
        }
      }
    }
    return null;
  }

  function updateCheckState(board2d, inCheck, turn, isCheckmate, flip) {
    if (!inCheck) {
      clearCheckState();
      return;
    }
    const kingSquare = findKingSquare(board2d, turn);
    if (!kingSquare) {
      clearCheckState();
      return;
    }
    const pos = squareToWorld(kingSquare, flip);

    if (!checkGlowMesh) {
      checkGlowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xd32f2f, transparent: true, opacity: 0.28 })
      );
      scene.add(checkGlowMesh);
    }
    checkGlowMesh.position.set(pos.x, 0.4, pos.z);
    checkGlowMesh.userData.pulse = true;

    if (isCheckmate && !checkmateActive) {
      checkmateActive = true;
      checkmateSpot = new THREE.SpotLight(0xfff2d9, 3.2, 12, Math.PI / 10, 0.4, 1.2);
      checkmateSpot.position.set(pos.x, 6, pos.z);
      checkmateSpot.target.position.set(pos.x, 0, pos.z);
      checkmateSpot.castShadow = true;
      scene.add(checkmateSpot);
      scene.add(checkmateSpot.target);
      addTween(ambientLight, "intensity", ambientLight.intensity, BASE_AMBIENT * 0.35, 800);
      addTween(keyLight, "intensity", keyLight.intensity, BASE_KEY * 0.3, 800);
      addTween(fillLight, "intensity", fillLight.intensity, BASE_FILL * 0.3, 800);
    } else if (!isCheckmate && checkmateActive) {
      clearCheckState();
    }
  }

  // ---------------- לולאת רינדור ----------------
  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const dtMs = dt * 1000;
    const t = clock.elapsedTime;

    updateTweens(dtMs);

    if (selectionMesh) {
      const s = 1 + Math.sin(t * 4) * 0.06;
      selectionMesh.scale.set(s, 1, s);
    }
    legalMarkers.forEach((m, i) => {
      const s = 1 + Math.sin(t * 3.5 + i) * 0.12;
      m.scale.set(s, s, s);
    });
    if (checkGlowMesh) {
      checkGlowMesh.material.opacity = 0.2 + Math.abs(Math.sin(t * 3.2)) * 0.28;
    }
    updateParticleSystems(dt, t);

    if (controls) controls.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  // ---------------- API ----------------
  function init(container, opts) {
    opts = opts || {};
    onSquareClickCb = opts.onSquareClick || null;
    if (opts.theme) currentTheme = opts.theme;
    ensureScene(container);
    active = true;
    prevLayout = {};
    clock.start();
    animate();
  }

  function destroy() {
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    if (renderer) {
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    composer = null;
    squareMeshes = {};
    pieceGroups = {};
    prevLayout = {};
    selectionMesh = null;
    legalMarkers = [];
    checkGlowMesh = null;
    checkmateSpot = null;
    checkmateActive = false;
    backdropGroup = null;
    flickerLight = null;
    starfieldPoints = null;
    snowPoints = null;
    ambientParticles = null;
    captureBursts = [];
  }

  function sync(state) {
    if (!active || !scene) return;
    const layout = {};
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = state.board[row][col];
        if (p) layout[FILES[col] + (8 - row)] = { type: p.type, color: p.color };
      }
    }
    applyLayout(layout, !!state.flip);
    updateHighlights(state.selectedSquare, state.legalTargets, !!state.flip);
    updateCheckState(state.board, state.inCheck, state.turn, state.checkmate, !!state.flip);
  }

  function isActive() {
    return active;
  }

  return { init, destroy, sync, isActive, setTheme };
})();
window.Board3D = Board3D;
