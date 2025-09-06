/* assets/js/sakura.js ------------------------------------------------------ */
import * as THREE from './three.module.js';

/* ---------- scene + camera --------------------------------------------- */
const scene = new THREE.Scene();
const VIEW_H = 12;
let aspect = innerWidth / innerHeight;

const camera = new THREE.OrthographicCamera(
  -VIEW_H * aspect / 2, VIEW_H * aspect / 2,
   VIEW_H / 2,        -VIEW_H / 2,
  -100, 100
);
camera.position.z = 15;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.id = 'sakuraCanvas';
document.body.prepend(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, .6));
const dir = new THREE.DirectionalLight(0xffffff, .8); dir.position.set(0, 1, .5);
scene.add(dir);

/* ---------- petals ------------------------------------------------------ */
const COUNT = 50, RANGE = { x: 18, y: 12, z: 10 };
const SPEED_MIN = .001, SPEED_MAX = .01, SWAY = .02;

const posX = new Float32Array(COUNT), posY = new Float32Array(COUNT),
      posZ = new Float32Array(COUNT), rotX = new Float32Array(COUNT),
      rotY = new Float32Array(COUNT), speed = new Float32Array(COUNT),
      phase = new Float32Array(COUNT);

const tex = new THREE.TextureLoader().load('assets/img/petal.png');
const geom = new THREE.PlaneGeometry(.6, .6);
const mat  = new THREE.MeshLambertMaterial({
  map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false
});
const petals = new THREE.InstancedMesh(geom, mat, COUNT);
petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(petals);

const o = new THREE.Object3D();
for (let i = 0; i < COUNT; i++) initPetal(i, true);

function initPetal(i, freshY) {
  posX[i] = THREE.MathUtils.randFloatSpread(RANGE.x);
  posY[i] = freshY ? THREE.MathUtils.randFloatSpread(RANGE.y) : RANGE.y / 2;
  posZ[i] = THREE.MathUtils.randFloatSpread(RANGE.z);
  rotX[i] = Math.random() * Math.PI;
  rotY[i] = Math.random() * Math.PI;
  speed[i] = THREE.MathUtils.randFloat(SPEED_MIN, SPEED_MAX);
  phase[i] = Math.random() * Math.PI * 2;
}

/* ---------- wind-gust logic -------------------------------------------- */
let wind = 0;
const WIND_STRENGTH = .2;
const DECAY = .93;

/*  ↓↓↓  EXPORTABLE helper  ↓↓↓  */
export function blow(dir) { return; wind = dir * WIND_STRENGTH; }
export const gustLeft  = () => blow(-1);
export const gustRight = () => blow(+1);

/* ---------- resize ------------------------------------------------------ */
addEventListener('resize', () => {
  aspect = innerWidth / innerHeight;
  camera.left = -VIEW_H * aspect / 2;
  camera.right =  VIEW_H * aspect / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- animation --------------------------------------------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  for (let i = 0; i < COUNT; i++) {
    posY[i] -= speed[i];
    posX[i] += Math.sin(t + phase[i]) * SWAY + wind;

    if (posY[i] < -RANGE.y / 2) initPetal(i, false);

    rotX[i] += 0.005; rotY[i] += 0.006;

    o.position.set(posX[i], posY[i], posZ[i]);
    o.rotation.set(rotX[i], rotY[i], 0);
    o.updateMatrix();
    petals.setMatrixAt(i, o.matrix);
  }
  petals.instanceMatrix.needsUpdate = true;

  wind *= DECAY; if (Math.abs(wind) < .001) wind = 0;
  renderer.render(scene, camera);
}
animate();
