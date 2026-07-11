/* ============================================================
   翰林斉家 — procedural Osaka at night (Three.js)
   instanced buildings / shader window-lights / wet-ground
   reflection / horizon glow / vermillion beacon
   ============================================================ */
import * as THREE from "three";

const canvas = document.getElementById("city");
const hero = document.getElementById("hero");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && hero) init();

function init() {

/* ---------- deterministic rng (stable city between reloads) ---------- */
let seed = 20260710;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/* ---------- renderer / scene / camera ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
const INK = new THREE.Color("#0b0e13");
renderer.setClearColor(INK, 1);

const scene = new THREE.Scene();
const FOG_BASE = 0.0092;
scene.fog = new THREE.FogExp2(INK, FOG_BASE);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
camera.position.set(0, 24, 96);

scene.add(new THREE.AmbientLight(0x3a4358, 0.9));
const moon = new THREE.DirectionalLight(0x8fa3c8, 0.55);
moon.position.set(-40, 80, 30);
scene.add(moon);

/* ---------- city layout ---------- */
const CELL = 7.4;
const GRID_X = 42;        // columns (x)
const GRID_Z = 30;        // rows (z, away from camera)
const cityBuildings = [];

for (let ix = 0; ix < GRID_X; ix++) {
  for (let iz = 0; iz < GRID_Z; iz++) {
    // streets
    if (ix % 6 === 2 || iz % 5 === 3) continue;
    if (rand() < 0.16) continue; // vacant lots

    const x = (ix - GRID_X / 2) * CELL + (rand() - 0.5) * 1.6;
    const z = -iz * CELL - 14 + (rand() - 0.5) * 1.6;

    // taller downtown cluster, off-center left
    const dx = (x + 16) / 70;
    const dz = (z + 96) / 80;
    const core = Math.max(0, 1 - (dx * dx + dz * dz));
    let h = 3 + rand() * 7 + core * core * (26 + rand() * 22);
    const w = CELL * (0.42 + rand() * 0.3);
    const d = CELL * (0.42 + rand() * 0.3);
    cityBuildings.push({ x, z, w, d, h });
  }
}

/* ---------- instanced building meshes ---------- */
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const buildingMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const buildings = new THREE.InstancedMesh(boxGeo, buildingMat, cityBuildings.length);
const dummy = new THREE.Object3D();
const shade = new THREE.Color();

cityBuildings.forEach((b, i) => {
  dummy.position.set(b.x, b.h / 2, b.z);
  dummy.scale.set(b.w, b.h, b.d);
  dummy.updateMatrix();
  buildings.setMatrixAt(i, dummy.matrix);
  const tone = 0.05 + rand() * 0.05;
  shade.setRGB(tone * 0.92, tone, tone * 1.28);
  buildings.setColorAt(i, shade);
});
buildings.instanceMatrix.needsUpdate = true;
scene.add(buildings);

/* ---------- window lights (shader points) ---------- */
const positions = [];
const colors = [];
const phases = [];
const sizes = [];
const warm = new THREE.Color("#ffb45c");
const warm2 = new THREE.Color("#ffd9a0");
const cool = new THREE.Color("#9fb8ff");
const shu = new THREE.Color("#ff5a3c");

cityBuildings.forEach((b) => {
  const floors = Math.floor(b.h / 1.15);
  const colsX = Math.max(2, Math.floor(b.w / 0.85));
  const colsZ = Math.max(2, Math.floor(b.d / 0.85));
  const litRatio = 0.19 + rand() * 0.14;

  for (let f = 1; f < floors; f++) {
    const y = f * 1.15;
    // front/back faces (z)
    for (let c = 0; c < colsX; c++) {
      if (rand() < litRatio) {
        const wx = b.x - b.w / 2 + ((c + 0.5) / colsX) * b.w;
        positions.push(wx, y, b.z + b.d / 2 + 0.05);
        pushColor();
      }
      if (rand() < litRatio * 0.6) {
        const wx = b.x - b.w / 2 + ((c + 0.5) / colsX) * b.w;
        positions.push(wx, y, b.z - b.d / 2 - 0.05);
        pushColor();
      }
    }
    // side faces (x)
    for (let c = 0; c < colsZ; c++) {
      if (rand() < litRatio * 0.75) {
        const wz = b.z - b.d / 2 + ((c + 0.5) / colsZ) * b.d;
        const side = rand() < 0.5 ? 1 : -1;
        positions.push(b.x + side * (b.w / 2 + 0.05), y, wz);
        pushColor();
      }
    }
  }
});

function pushColor() {
  const r = rand();
  const c = r < 0.72 ? warm : r < 0.9 ? warm2 : r < 0.985 ? cool : shu;
  colors.push(c.r, c.g, c.b);
  phases.push(rand() * Math.PI * 2, 0.4 + rand() * 1.2); // phase, speed
  sizes.push(1.05 + rand() * 1.25);
}

const winGeo = new THREE.BufferGeometry();
winGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
winGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
winGeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 2));
winGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));

const makeWinMat = (mirror) => new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uMirror: { value: mirror ? 1.0 : 0.0 },
    uOpacity: { value: mirror ? 0.2 : 1.0 },
    uFog: { value: INK },
    uDpr: { value: Math.min(devicePixelRatio, 1.6) },
  },
  vertexShader: /* glsl */ `
    attribute vec3 aColor;
    attribute vec2 aPhase;
    attribute float aSize;
    uniform float uTime;
    uniform float uMirror;
    uniform float uDpr;
    varying vec3 vColor;
    varying float vTwinkle;
    varying float vDepth;
    void main() {
      vec3 p = position;
      if (uMirror > 0.5) {
        p.y = -p.y;
        p.x += sin(p.y * 0.7 + uTime * 1.4 + aPhase.x) * 0.28;
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float tw = 0.78 + 0.22 * sin(uTime * aPhase.y + aPhase.x);
      // occasional near-off dip
      tw *= smoothstep(-0.98, -0.9, sin(uTime * aPhase.y * 0.23 + aPhase.x * 3.1)) * 0.35 + 0.65;
      vTwinkle = tw;
      vColor = aColor;
      vDepth = -mv.z;
      gl_PointSize = aSize * uDpr * (230.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uFog;
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vTwinkle;
    varying float vDepth;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float d = length(uv);
      float a = smoothstep(0.5, 0.06, d);
      float fogF = 1.0 - clamp((vDepth - 70.0) / 380.0, 0.0, 0.72);
      vec3 col = mix(uFog, vColor * vTwinkle, fogF);
      gl_FragColor = vec4(col, a * uOpacity * (0.3 + 0.7 * fogF));
    }
  `,
});

const windows = new THREE.Points(winGeo, makeWinMat(false));
scene.add(windows);
const windowsMirror = new THREE.Points(winGeo, makeWinMat(true));
scene.add(windowsMirror);

/* ---------- ground sheen (very dark, lets mirror read as wet asphalt) ---------- */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 700),
  new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.82, depthWrite: false })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.01;
ground.renderOrder = 1;
scene.add(ground);
windows.renderOrder = 2;
windowsMirror.renderOrder = 0;

/* ---------- horizon glow ---------- */
function gradientTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 96, 6, 128, 96, 120);
  grad.addColorStop(0, "rgba(255, 168, 92, 0.75)");
  grad.addColorStop(0.4, "rgba(216, 100, 60, 0.28)");
  grad.addColorStop(1, "rgba(216, 100, 60, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  return new THREE.CanvasTexture(c);
}
const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(460, 120),
  new THREE.MeshBasicMaterial({
    map: gradientTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.8,
  })
);
glow.position.set(-10, 22, -232);
scene.add(glow);

/* ---------- landmark tower + beacon ---------- */
const towerH = 52;
const tower = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 2.6, towerH, 6, 1, true),
  new THREE.MeshLambertMaterial({ color: 0x2a3242, wireframe: true })
);
tower.position.set(26, towerH / 2, -58);
scene.add(tower);

const beacon = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xd8442e, fog: false })
);
beacon.position.set(26, towerH + 1.4, -58);
scene.add(beacon);

const beaconHalo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: gradientTexture(), color: 0xd8442e, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.5,
}));
beaconHalo.scale.set(14, 8, 1);
beaconHalo.position.copy(beacon.position);
scene.add(beaconHalo);

/* ---------- interaction state ---------- */
let mouseX = 0, mouseY = 0;
let smX = 0, smY = 0;
addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / innerWidth) * 2 - 1;
  mouseY = (e.clientY / innerHeight) * 2 - 1;
}, { passive: true });

let running = true;
const vis = new IntersectionObserver(([en]) => {
  running = en.isIntersecting;
}, { threshold: 0.02 });
vis.observe(hero);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) prevT = performance.now();
});

/* ---------- resize (recomputes DPR for monitor/zoom changes) ---------- */
function resize() {
  const w = hero.clientWidth;
  const h = hero.clientHeight;
  const dpr = Math.min(devicePixelRatio, 1.6);
  renderer.setPixelRatio(dpr);
  windows.material.uniforms.uDpr.value = dpr;
  windowsMirror.material.uniforms.uDpr.value = dpr;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (reduceMotion) renderer.render(scene, camera);
}
addEventListener("resize", resize);
resize();

/* ---------- context loss (sleep/wake, GPU resets) ---------- */
canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
canvas.addEventListener("webglcontextrestored", () => resize());

/* ---------- loop ---------- */
const lookAt = new THREE.Vector3();
let prevT = performance.now();
let t = 0;
let firstFrame = true;

const announceFrame = () => {
  if (!firstFrame) return;
  firstFrame = false;
  window.__hanlinCityFrame = true; // flag survives even if the event fires before listeners attach
  dispatchEvent(new Event("hanlin:cityframe"));
};

function frame(now) {
  requestAnimationFrame(frame);
  if (!running || document.hidden) { prevT = now; return; }
  const dt = Math.min((now - prevT) / 1000, 0.05);
  prevT = now;
  t += dt;

  const k = 1 - Math.pow(0.96, dt * 60); // dt-normalized low-pass
  smX = smX + (mouseX - smX) * k;
  smY = smY + (mouseY - smY) * k;

  const scrollP = Math.min(scrollY / Math.max(innerHeight, 1), 1);

  camera.position.x = Math.sin(t * 0.18) * 4.2 + smX * 5;
  camera.position.y = 24 + smY * -3 + scrollP * 14;
  camera.position.z = 96 - 6 * (1 - Math.exp(-t / 14)) - scrollP * 8;
  lookAt.set(smX * 6, 10 + scrollP * 6, -60);
  camera.lookAt(lookAt);

  scene.fog.density = FOG_BASE * (1 + 0.09 * Math.sin(t * 0.3));

  windows.material.uniforms.uTime.value = t;
  windowsMirror.material.uniforms.uTime.value = t;

  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  beacon.scale.setScalar(0.85 + pulse * 0.35);
  beaconHalo.material.opacity = 0.28 + pulse * 0.4;

  glow.material.opacity = 0.86 + Math.sin(t * 0.6) * 0.08;

  renderer.render(scene, camera);
  announceFrame();
}

if (reduceMotion) {
  windows.material.uniforms.uTime.value = 3;
  windowsMirror.material.uniforms.uTime.value = 3;
  renderer.render(scene, camera);
  announceFrame();
} else {
  requestAnimationFrame(frame);
}

} /* end init() */
