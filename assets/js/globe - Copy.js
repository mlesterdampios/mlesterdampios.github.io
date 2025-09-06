/* assets/js/globe.js ------------------------------------------------------ */
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

/* ----------  Scene setup ---------- */
const container = document.getElementById('globe-container');

const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0, 60);                    // unchanged

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
const BASE_YAW   =  Math.PI;                       //  face camera
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

    // CHG  scale to globe-size
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

/* ----------  Pointer-move listener  (NEW) ---------- */
addEventListener('pointermove', (e) => {
  // Normalised cursor position in range [-1, 1]
  const nx =  (e.clientX / innerWidth ) * 2 - 1;
  const ny = -(e.clientY / innerHeight) * 2 + 1;   // flip so up=positive

  tgtYaw   =  nx * MAX_YAW;                        // left/right
  tgtPitch =  -ny * MAX_PITCH;                      // up/down
});

/* ----------  Render loop  (CHG) ---------- */
function animate() {
  requestAnimationFrame(animate);

  if (model) {
    // smooth interpolation toward cursor-target angles
    curYaw   += (tgtYaw   - curYaw)   * SMOOTH;
    curPitch += (tgtPitch - curPitch) * SMOOTH;

    model.rotation.set(BASE_PITCH + curPitch,
                       BASE_YAW   + curYaw,
                       0);
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

    container.classList.remove('globe-left', 'globe-right');

    if (e.target === about) {
      container.classList.add('globe-left');
    } else if (e.target === team) {
      container.classList.add('globe-right');
    }
    // hero or anything else → center
  });
}, { threshold: 0.5 });

[hero, about, team].forEach(section => io.observe(section));
