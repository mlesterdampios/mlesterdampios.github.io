/* -------------------------------------------------------
   Three-JS demo: loads a self-contained glTF / GLB
   • Rotates 180° around Y so the front faces the camera
   • Tilts -22.5° around X so the head/gaze looks up
   ----------------------------------------------------- */

   import * as THREE            from 'three';
   import { OrbitControls }     from 'three/addons/controls/OrbitControls.js';
   import { GLTFLoader }        from 'three/addons/loaders/GLTFLoader.js';
   
   let scene, camera, renderer;
   
   /* ---------- basic scene ---------- */
   scene   = new THREE.Scene();
   camera  = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
   camera.position.set(0, 1.4, 3);
   
   renderer = new THREE.WebGLRenderer({ antialias: true });
   renderer.setSize(innerWidth, innerHeight);
   renderer.outputEncoding = THREE.sRGBEncoding;
   document.body.appendChild(renderer.domElement);
   
   /* ---------- orbit controls ---------- */
   new OrbitControls(camera, renderer.domElement);
   
   /* ---------- lights ---------- */
   scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
   scene.add(new THREE.DirectionalLight(0xffffff, 1).position.set(5, 10, 7));
   
   /* ---------- load the GLB / glTF ---------- */
   const loader = new GLTFLoader();
   
   loader.load(
     '../assets/model/myModel.glb',                         // 🔁 Replace with your own file
     (gltf) => {
       const model = gltf.scene;
   
       // 1) Face the camera          2) Tilt head up ~22.5°
       model.rotation.set(-Math.PI / 8, Math.PI, 0);
   
       scene.add(model);
   
       // Sharpen textures at glancing angles
       model.traverse(obj => {
         if (obj.isMesh) {
           Object.values(obj.material)
                 .filter(tex => tex && tex.isTexture)
                 .forEach(tex => tex.anisotropy = renderer.capabilities.getMaxAnisotropy());
         }
       });
     },
     xhr => console.log(`Loading… ${(xhr.loaded / xhr.total * 100).toFixed(1)} %`),
     err => console.error('GLTF load error:', err)
   );
   
   /* ---------- main loop ---------- */
   function animate() {
     requestAnimationFrame(animate);
     renderer.render(scene, camera);
   }
   animate();
   
   /* ---------- resize handling ---------- */
   window.addEventListener('resize', () => {
     camera.aspect = innerWidth / innerHeight;
     camera.updateProjectionMatrix();
     renderer.setSize(innerWidth, innerHeight);
   });
   