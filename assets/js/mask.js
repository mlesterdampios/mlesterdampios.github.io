/* assets/js/mask.js ------------------------------------------------------ */
import * as THREE from './three.module.js';
import { GLTFLoader } from './GLTFLoader.js';

/* ----------  Scene setup ---------- */
const container = document.getElementById('mask-container');

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0, 50);                    // unchanged

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

/* resize handler */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ----------  Lighting ---------- */
scene.add(new THREE.AmbientLight(0x888888));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 2, 10);
scene.add(dir);

/* ----------  Load GLB model ---------- */
const loader = new GLTFLoader();
let model;                                         // will hold the imported scene

// -- orientation baseline (slight upward tilt) ----------
const BASE_PITCH = -Math.PI / 8;                   //  ≈-22.5°
const BASE_YAW   =  0;                       //  face camera
// -- dynamic offsets we’ll animate toward ---------------
let curPitch = 0, curYaw = 0;                      // current extra rotation
let tgtPitch = 0, tgtYaw = 0;                      // target   ”       ”

// -- cursor → target angle mapping constants ------------
const MAX_PITCH = Math.PI / 6;     // 30° up/down
const MAX_YAW   = Math.PI / 6;     // 30° left/right
const SMOOTH    = 0.1;             // 0-1 lerp factor per frame

loader.load(
  '../assets/model/myModel.glb',                   // 🔁 adjust path if needed
  (gltf) => {
    model = gltf.scene;

    // CHG  scale to mask-size
    model.scale.setScalar(20);

    // initial orientation
    model.rotation.set(BASE_PITCH, BASE_YAW, 0);

    scene.add(model);

    // texture sharpness
    model.traverse(obj => {
      if (obj.isMesh) {
        Object
          .values(obj.material)
          .filter(tex => tex && tex.isTexture)
          .forEach(tex => {
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          });
      }
    });
  },
  (xhr) => console.log(`Model loading… ${(xhr.loaded / xhr.total * 100).toFixed(1)} %`),
  (err) => console.error('GLB load error:', err)
);

// --- constants (ADD) ---
const TAP_SMOOTH = 0.04;   // slower glide right after a tap
let ease = SMOOTH;         // current smoothing factor
let easeResetAt = 0;       // when to restore normal smoothing
const clock = new THREE.Clock(); // for framerate-independent easing

/* ---------- helper: map screen XY -> target angles (ADD) ---------- */
function setTargetFromXY(x, y) {
  const nx =  (x / innerWidth ) * 2 - 1;
  const ny = -(y / innerHeight) * 2 + 1;   // up is positive
  tgtYaw   =  nx * MAX_YAW;
  tgtPitch = -ny * MAX_PITCH;
}

/* ---------- pointer move (EDIT) ---------- */
addEventListener('pointermove', (e) => {
  ease = SMOOTH; // normal tracking while moving
  setTargetFromXY(e.clientX, e.clientY);
});

/* ---------- tap/click: glide slowly toward tap (ADD) ---------- */
addEventListener('pointerdown', (e) => {
  ease = TAP_SMOOTH;                       // temporarily slower
  easeResetAt = performance.now() + 400;   // ~0.4s slow-glide window
  setTargetFromXY(e.clientX, e.clientY);   // NO SNAP
});

// optional fallback for very old iOS that lacks Pointer Events
if (!('onpointerdown' in window)) {
  addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    ease = TAP_SMOOTH;
    easeResetAt = performance.now() + 400;
    setTargetFromXY(t.clientX, t.clientY);
  }, { passive: true });
}

/* ----------  Render loop (EDIT) ---------- */
function animate() {
  requestAnimationFrame(animate);

  if (model) {
    // time-based smoothing: same feel across devices
    const dt = clock.getDelta();                     // seconds since last frame
    const a  = 1 - Math.pow(1 - ease, dt * 60);      // normalize to 60fps

    curYaw   += (tgtYaw   - curYaw)   * a;
    curPitch += (tgtPitch - curPitch) * a;

    // restore normal smoothing after the tap window
    if (easeResetAt && performance.now() > easeResetAt) ease = SMOOTH;

    model.rotation.set(
      BASE_PITCH + curPitch,
      BASE_YAW   + curYaw,
      0
    );
  }

  renderer.render(scene, camera);
}

animate();

/* ----------  Scroll-triggered positioning (unchanged) ---------- */
const hero  = document.querySelector('#hero');
const about = document.querySelector('#about');
const team  = document.querySelector('#team');

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    if (matchMedia('(max-width:991px)').matches) return; // mobile: do nothing

    container.classList.remove('mask-left', 'mask-right');

    if (e.target === about) {
      container.classList.add('mask-left');
    } else if (e.target === team) {
      container.classList.add('mask-right');
    }
    // hero or anything else → center
  });
}, { threshold: 0.5 });

[hero, about, team].forEach(section => io.observe(section));
