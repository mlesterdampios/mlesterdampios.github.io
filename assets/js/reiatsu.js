'use strict';
/*
 * reiatsu.js — Bleach-style spiritual pressure with GLITCH ⚡
 *
 * New in this build:
 *  - Real glitch slices + scanlines (GlitchFilter + CRT)
 *  - Micro/Macro glitch bursts, RGB jitter, frame stutter
 *  - Lightning arcs (spiritual cracks) that flicker in and out
 *  - Stronger shockwave + white flash
 *  - Tunable via Reiatsu.setGlitch(intensity) / Reiatsu.pulseGlitch()
 *
 * Usage:
 *   <script src="/path/to/reiatsu.js"></script>
 *   <script>
 *     Reiatsu.init({ intensity: 1.1, glitch: 1.0, color: '#7cc8ff' });
 *   </script>
 */
(function (global) {
  const CDN = {
    pixi: 'assets/js/pixi.min.js',
    filters: 'assets/js/pixi-filters.min.js'
  };

  const DEFAULTS = {
    color: ['#7cc8ff', '#2b58ff'],
    intensity: 0.5,     // aura power (0–1.5)
    grain: 0.35,        // shimmer/noise
    particles: true,
    shake: true,
    autoClickBurst: true,
    glitch: 0.9,        // glitch power (0–2)
    scanlines: true,
    arcs: false
  };

  const STATE = {
    app: null,
    stage: null,
    overlay: null,
    filters: {},
    shockwaves: [],
    gradientSprite: null,
    noiseSprite: null,
    particleLayer: null,
    arcLayer: null,
    options: { ...DEFAULTS },
    running: false,
    lowPower: false,
    perf: { fpsAvg: 60, frameCount: 0, lastCheck: performance.now() },
    timers: { nextMicro: 0, nextMacro: 0, holdUntil: 0 },
    whiteFlash: null
  };

  /* Utils */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function hasWebGL() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch { return false; }
  }
  function hexToRgb(hex) {
    const n = hex.replace('#','');
    const s = n.length===3 ? n.split('').map(ch=>ch+ch).join('') : n;
    const v = parseInt(s,16);
    return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 };
  }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  /* Fallback (no WebGL) */
  function initFallback() {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-reiatsu','fallback');
    Object.assign(overlay.style, { position:'fixed', inset:0, zIndex:2147483647, pointerEvents:'none', mixBlendMode:'screen', background:'radial-gradient(60% 60% at 50% 50%, rgba(124,200,255,0.28) 0%, rgba(43,88,255,0.16) 40%, rgba(0,0,0,0) 70%)' });
    const noise = document.createElement('div');
    Object.assign(noise.style, { position:'absolute', inset:'-20%', backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.08\'/></svg>")', animation:'reiatsuGrain 0.6s steps(2) infinite', opacity:'0.9' });
    const style = document.createElement('style');
    style.textContent = `@keyframes reiatsuGrain{0%{transform:translate(0,0)}100%{transform:translate(-20px,-12px)}}`;
    overlay.appendChild(noise); document.head.appendChild(style); document.body.appendChild(overlay);
    STATE.overlay = overlay; STATE.running = true;
  }

  /* Canvas helpers */
  function makeRadialGradientTexture(inner, outer, size=1024){
    const cvs=document.createElement('canvas'); cvs.width=cvs.height=size; const ctx=cvs.getContext('2d');
    const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2); g.addColorStop(0,inner); g.addColorStop(1,outer);
    ctx.fillStyle=g; ctx.fillRect(0,0,size,size); return cvs;
  }
  function makeNoiseTexture(size=256){
    const c=document.createElement('canvas'); c.width=c.height=size; const ctx=c.getContext('2d'); const img=ctx.createImageData(size,size);
    for(let i=0;i<img.data.length;i+=4){ const v=(Math.random()*255)|0; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255; }
    ctx.putImageData(img,0,0); return c;
  }
  function makeScanlineTexture(){
    const c=document.createElement('canvas'); c.width=2; c.height=2; const x=c.getContext('2d');
    x.fillStyle='rgba(0,0,0,0.0)'; x.fillRect(0,0,2,2); x.fillStyle='rgba(255,255,255,0.06)'; x.fillRect(0,1,2,1); return c;
  }

  /* Particles */
  function createParticles(PIXI,count){
    const container=new PIXI.ParticleContainer(count,{scale:true,position:true,alpha:true,rotation:false});
    const g=new PIXI.Graphics(); g.beginFill(0xffffff).drawCircle(0,0,2).endFill();
    const tex=STATE.app.renderer.generateTexture(g);
    function reset(s,randY){ s.alpha=0.08+Math.random()*0.35*STATE.options.intensity; const spread=60+200*STATE.options.intensity; s.x=Math.random()*innerWidth; s.y=randY?Math.random()*innerHeight:innerHeight+Math.random()*40; s.vx=(Math.random()-0.5)*0.2; s.vy=-(0.35+Math.random()*(1.4+STATE.options.intensity)); s.scale.set(0.6+Math.random()*2.4); s.blendMode=PIXI.BLEND_MODES.ADD; s.hw=spread; }
    for(let i=0;i<count;i++){ const s=new PIXI.Sprite(tex); reset(s,true); container.addChild(s); }
    container.tick=(dt)=>{ const t=performance.now()*0.001; for(let i=0;i<container.children.length;i++){ const s=container.children[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.x+=Math.sin((t+i)*2.2)*0.14; if(s.y<-20) reset(s,false);} };
    return container;
  }

  /* Lightning arcs */
  function createArcs(PIXI, count){
    const layer=new PIXI.Container(); layer.blendMode=PIXI.BLEND_MODES.ADD; layer.arcs=[];
    function spawn(){
      const g=new PIXI.Graphics();
      const cx=innerWidth*0.5 + (Math.random()-0.5)*innerWidth*0.2;
      const cy=innerHeight*0.55 + (Math.random()-0.5)*innerHeight*0.2;
      const len=120+Math.random()*300; const ang=Math.random()*Math.PI*2; const seg=6+Math.floor(Math.random()*6);
      const amp=10+Math.random()*30;
      g.lineStyle(2.2+Math.random()*1.8, 0x9fd1ff, 0.85);
      g.moveTo(cx,cy);
      for(let i=1;i<=seg;i++){
        const t=i/seg; const r=len*t; const jitter=(Math.random()-0.5)*amp; const x=cx+Math.cos(ang)*r + Math.cos(t*20)*jitter; const y=cy+Math.sin(ang)*r + Math.sin(t*20)*jitter; g.lineTo(x,y);
      }
      g.alpha=0.0; g.life=200+Math.random()*200; g.fadeIn=40; g.fadeOut=120; g.t=0;
      layer.addChild(g); layer.arcs.push(g);
    }
    for(let i=0;i<count;i++) spawn();
    layer.tick=(dt)=>{
      for(let i=layer.arcs.length-1;i>=0;i--){ const g=layer.arcs[i]; g.t+=dt*16; const a = g.t<g.fadeIn ? g.t/g.fadeIn : 1 - Math.max(0,(g.t-g.life+g.fadeOut))/g.fadeOut; g.alpha=Math.max(0, Math.min(1,a))* (0.6+0.6*STATE.options.intensity);
        if(g.t>g.life){ layer.removeChild(g); layer.arcs.splice(i,1); }
      }
      // Keep a target amount of arcs based on intensity
      while(layer.arcs.length < Math.round(6*STATE.options.intensity+4)){
        // spawn with some randomness to avoid uniformity
        if(Math.random()<0.4) { const cx=innerWidth*Math.random(), cy=innerHeight*Math.random(); }
        const gcount=1+Math.floor(Math.random()*2); for(let k=0;k<gcount;k++) (function(){ const s=spawn; s(); })();
      }
    };
    return layer;
  }

  function fitRenderer(){ if(!STATE.app) return; const w=innerWidth, h=innerHeight; STATE.app.renderer.resize(w,h); if(STATE.gradientSprite){ STATE.gradientSprite.width=w; STATE.gradientSprite.height=h; } if(STATE.noiseSprite){ STATE.noiseSprite.width=w; STATE.noiseSprite.height=h; } if(STATE.whiteFlash){ STATE.whiteFlash.width=w; STATE.whiteFlash.height=h; } }

  function setupPixi(){
    const PIXI=global.PIXI; const F=PIXI.filters || {};

    // overlay container
    const el=document.createElement('div'); el.id='reiatsu-overlay'; Object.assign(el.style,{position:'fixed',inset:0,zIndex:2147483647,pointerEvents:'none',mixBlendMode:'screen',contain:'strict'}); document.body.appendChild(el); STATE.overlay=el;

    const app=new PIXI.Application({ antialias:true, backgroundAlpha:0, powerPreference:'high-performance', resizeTo: el }); el.appendChild(app.view);
    STATE.app=app; STATE.stage=app.stage;

    // gradient aura
    const gradTex = PIXI.Texture.from(makeRadialGradientTexture(Array.isArray(STATE.options.color)?STATE.options.color[0]:STATE.options.color, Array.isArray(STATE.options.color)?STATE.options.color[1]:(()=>{const{r,g,b}=hexToRgb(STATE.options.color); return `rgba(${r},${g},${b},0)`})(), 1024));
    const gradient = new PIXI.Sprite(gradTex); gradient.anchor.set(0.5); gradient.x=app.renderer.width/2; gradient.y=app.renderer.height/2; gradient.width=app.renderer.width*1.35; gradient.height=app.renderer.height*1.35; gradient.alpha=0.52*STATE.options.intensity; gradient.blendMode=PIXI.BLEND_MODES.SCREEN; STATE.gradientSprite=gradient; app.stage.addChild(gradient);

    // noise sprite (for displacement)
    const noiseTex = PIXI.Texture.from(makeNoiseTexture(256)); const noise = new PIXI.TilingSprite(noiseTex, app.renderer.width, app.renderer.height); noise.tileScale.set(3); noise.alpha=0.22+0.55*STATE.options.grain*STATE.options.intensity; STATE.noiseSprite=noise; app.stage.addChild(noise);

    // particles
    if(STATE.options.particles){ const p=createParticles(PIXI, Math.round(220*STATE.options.intensity+160)); STATE.particleLayer=p; app.stage.addChild(p); }
    // arcs
    if(STATE.options.arcs){ const a=createArcs(PIXI, 6); STATE.arcLayer=a; app.stage.addChild(a); }

    // white flash overlay
    const flash = new PIXI.Graphics(); flash.beginFill(0xffffff).drawRect(0,0,app.renderer.width,app.renderer.height).endFill(); flash.alpha=0; app.stage.addChild(flash); STATE.whiteFlash=flash;

    // filters
    const disp = new F.DisplacementFilter(noise); disp.scale.x=18*STATE.options.intensity; disp.scale.y=34*STATE.options.intensity;
    const bloom = new F.AdvancedBloomFilter({ threshold:0.28, bloomScale:1.8+1.7*STATE.options.intensity, brightness:1.25+0.45*STATE.options.intensity, blur:7+7*STATE.options.intensity, quality:4 });
    const rgb = new F.RGBSplitFilter([0,0],[0,0],[0,0]);
    const god = new F.GodrayFilter({ lacunarity:1.8, gain:0.65, parallel:false, angle:30*Math.PI/180, alpha:0.28*STATE.options.intensity, time:0 });
    const glitch = new F.GlitchFilter({ slices: 8, offset: 20, direction: 0, fillMode: 2, average: true, seed: Math.random() });
    glitch.red = [0,0]; glitch.green=[0,0]; glitch.blue=[0,0];
    const crt = STATE.options.scanlines ? new F.CRTFilter({ curvature:0, lineWidth:1.0, lineContrast:0.25, noise:0.02, noiseSize:1.0, vignetting:0.35, vignettingAlpha:0.22 }) : null;

    const stageFilters = [disp, bloom, rgb, god, glitch];
    if (crt) stageFilters.push(crt);
    app.stage.filters = stageFilters;

    STATE.filters = { disp, bloom, rgb, god, glitch, crt };

    // ticker
    app.ticker.add((delta)=>{
      const now = performance.now();
      // perf sample
      STATE.perf.frameCount++; if (now-STATE.perf.lastCheck>1000){ STATE.perf.fpsAvg = STATE.perf.frameCount*1000/(now-STATE.perf.lastCheck); STATE.perf.frameCount=0; STATE.perf.lastCheck=now; if(STATE.perf.fpsAvg<30 && !STATE.lowPower) degrade(); }

      // optional frame hold (stutter)
      if (now < STATE.timers.holdUntil) return; // skip updates to stutter

      // animate base layers
      noise.tilePosition.x += 0.8*delta; noise.tilePosition.y -= 1.0*delta;
      const t = now*0.001;
      const pulse = 1.0 + Math.sin(t*2.6)*0.03*STATE.options.intensity;
      gradient.scale.set(pulse);
      god.angle += 0.003*delta; god.time += 0.005*delta;

      // RGB jitter baseline
      const splitBase = 0.6 + 2.4*STATE.options.intensity*(0.5+0.5*Math.sin(t*3.3));
      STATE.filters.rgb.red = [ splitBase, 0 ];
      STATE.filters.rgb.green = [ 0, -splitBase*0.45 ];
      STATE.filters.rgb.blue = [ -splitBase, 0 ];

      // particles & arcs
      if (STATE.particleLayer && STATE.particleLayer.tick) STATE.particleLayer.tick(delta);
      if (STATE.arcLayer && STATE.arcLayer.tick) STATE.arcLayer.tick(delta);

      // micro glitch every ~1.5–3.5s
      if (now > STATE.timers.nextMicro){ microGlitch(140 + Math.random()*180); STATE.timers.nextMicro = now + 1500 + Math.random()*2000; }
      // macro glitch every ~6–12s
      if (now > STATE.timers.nextMacro){ macroGlitch(260 + Math.random()*320); STATE.timers.nextMacro = now + 6000 + Math.random()*6000; }

      // subtle camera shake
      if (STATE.options.shake){ const amp = 0.6 + 1.8*STATE.options.intensity; app.stage.x = Math.sin(t*25.0)*amp; app.stage.y = Math.cos(t*23.0)*amp; }

      // decay white flash
      if (STATE.whiteFlash.alpha>0){ STATE.whiteFlash.alpha = Math.max(0, STATE.whiteFlash.alpha - 0.08*delta); }
    });

    window.addEventListener('resize', fitRenderer); fitRenderer();

    // mouse center follow
    const moveCenter=(x,y)=>{ gradient.x=x; gradient.y=y; STATE.filters.god.center=[ x/app.renderer.width, y/app.renderer.height ]; };
    window.addEventListener('mousemove', (e)=> moveCenter(e.clientX, e.clientY), { passive:true }); moveCenter(app.renderer.width*0.5, app.renderer.height*0.55);

    if (STATE.options.autoClickBurst) window.addEventListener('click', (e)=>{ const r=el.getBoundingClientRect(); burst(e.clientX-r.left, e.clientY-r.top); });

    // hotkeys for dev
    window.addEventListener('keydown', (e)=>{ if(e.key==='g') API.pulseGlitch(); if(e.key==='b') API.burst(); });

    STATE.running=true;
  }

  function degrade(){ STATE.lowPower=true; const { bloom, rgb, god, disp, glitch, crt } = STATE.filters; if(bloom){ bloom.bloomScale*=0.7; bloom.blur*=0.7; bloom.brightness*=0.85; } if(rgb){ rgb.red=[0.5,0]; rgb.blue=[-0.5,0]; } if(god){ god.alpha*=0.7; } if(disp){ disp.scale.x*=0.7; disp.scale.y*=0.7; } if(glitch){ glitch.slices = Math.max(4, glitch.slices*0.7); glitch.offset = Math.max(8, glitch.offset*0.7); } if(crt){ crt.lineWidth*=0.8; crt.lineContrast*=0.8; } }

  /* Glitch routines */
  function microGlitch(durationMs){ if(!STATE.filters.glitch) return; const g=STATE.filters.glitch; const base = clamp(STATE.options.glitch,0,2); const boost = 1 + base*0.8; const end = performance.now()+durationMs;
    const id = requestAnimationFrame(function tick(){ const now=performance.now(); const k=(Math.sin(now*0.04)+1)*0.5; g.seed=Math.random(); g.slices = 6 + Math.floor(10*boost*k); g.offset = 12 + 36*boost*Math.random(); g.red=[(Math.random()*6)|0,0]; g.green=[0,-((Math.random()*4)|0)]; g.blue=[-((Math.random()*6)|0),0]; if(now<end){ requestAnimationFrame(tick); } else { resetGlitch(); } });
  }
  function macroGlitch(durationMs){ if(!STATE.filters.glitch) return; const g=STATE.filters.glitch; const base = clamp(STATE.options.glitch,0,2); const boost = 1.6 + base*1.2; // bigger
    // brief white flash + stutter
    if(STATE.whiteFlash) STATE.whiteFlash.alpha = 0.8;
    STATE.timers.holdUntil = performance.now() + 80 + Math.random()*120;
    const end = performance.now()+durationMs; const id = requestAnimationFrame(function tick(){ const now=performance.now(); const k=(Math.sin(now*0.09)+1)*0.5; g.seed=Math.random(); g.slices = 10 + Math.floor(26*boost*k); g.offset = 24 + 64*boost*Math.random(); if(STATE.filters.crt){ STATE.filters.crt.noise = 0.06 + 0.18*Math.random(); }
      // spike displacement too
      if(STATE.filters.disp){ STATE.filters.disp.scale.x = 22*STATE.options.intensity + Math.random()*20; STATE.filters.disp.scale.y = 38*STATE.options.intensity + Math.random()*28; }
      // extra rgb shake
      if(STATE.filters.rgb){ const s=2+6*base*Math.random(); STATE.filters.rgb.red=[ s,0 ]; STATE.filters.rgb.green=[0, -s*0.5 ]; STATE.filters.rgb.blue=[ -s, 0 ]; }
      if(now<end){ requestAnimationFrame(tick); } else { resetGlitch(); }
    });
  }
  function resetGlitch(){ if(!STATE.filters.glitch) return; const g=STATE.filters.glitch; g.slices=8; g.offset=20; g.red=g.green=g.blue=[0,0]; if(STATE.filters.crt){ STATE.filters.crt.noise = 0.02; } if(STATE.filters.disp){ STATE.filters.disp.scale.x=18*STATE.options.intensity; STATE.filters.disp.scale.y=34*STATE.options.intensity; } }

  /* Shockwave burst */
  function burst(x,y){ if(!STATE.app || !global.PIXI || !global.PIXI.filters) return; const F=global.PIXI.filters; const shock = new F.ShockwaveFilter([x/STATE.app.renderer.width, y/STATE.app.renderer.height], { amplitude: 36*STATE.options.intensity, wavelength: 120, brightness: 1.0, radius: -1, speed: 380 }, 0);
    STATE.stage.filters = [...STATE.stage.filters, shock]; STATE.shockwaves.push({ filter: shock, time: 0 }); if(STATE.whiteFlash) STATE.whiteFlash.alpha = 0.6; // flash
    // cleanup driven by ticker (see old impl)
  }

  /* API */
  const API = {
    init(opts={}){
      if(STATE.running) return API; STATE.options={...DEFAULTS,...opts};
      // normalize color
      if(typeof STATE.options.color==='string'){ const inner=STATE.options.color; const {r,g,b}=hexToRgb(inner); const outer=`rgba(${r},${g},${b},0)`; STATE.options.color=[inner, outer]; }
      if(!hasWebGL()){ initFallback(); console.warn('[Reiatsu] WebGL not available; using CSS fallback.'); return API; }
      const needPixi = typeof global.PIXI==='undefined'; const needFilters = !(global.PIXI && global.PIXI.filters);
      const loaders=[]; if(needPixi) loaders.push(loadScript(CDN.pixi));
      Promise.all(loaders).then(()=> needFilters ? loadScript(CDN.filters) : null).then(()=> setupPixi()).catch(e=>{ console.error('[Reiatsu] Failed to init WebGL pipeline:', e); initFallback(); });
      return API;
    },
    start(){ if(!STATE.overlay) return API.init(); if(STATE.overlay) STATE.overlay.style.display=''; if(STATE.app) STATE.app.start(); STATE.running=true; return API; },
    stop(){ if(STATE.app) STATE.app.stop(); if(STATE.overlay) STATE.overlay.style.display='none'; STATE.running=false; return API; },
    destroy(){ if(STATE.app){ STATE.app.destroy(true,{children:true,texture:true,baseTexture:true}); STATE.app=null; } if(STATE.overlay&&STATE.overlay.parentNode) STATE.overlay.parentNode.removeChild(STATE.overlay); STATE.overlay=null; STATE.running=false; STATE.lowPower=false; STATE.shockwaves.length=0; },
    setIntensity(v){ v=clamp(v,0,1.5); STATE.options.intensity=v; const { bloom, disp }=STATE.filters; if(bloom){ bloom.bloomScale=1.8+1.7*v; bloom.brightness=1.25+0.45*v; bloom.blur=7+7*v; } if(disp){ disp.scale.x=18*v; disp.scale.y=34*v; } if(STATE.gradientSprite) STATE.gradientSprite.alpha=0.52*v; return API; },
    setColor(c){ const inner=Array.isArray(c)?c[0]:c; const outer=Array.isArray(c)?c[1]:(()=>{ const{r,g,b}=hexToRgb(c); return `rgba(${r},${g},${b},0)`; })(); STATE.options.color=[inner,outer]; if(STATE.app){ const PIXI=global.PIXI; const tex=PIXI.Texture.from(makeRadialGradientTexture(inner,outer,1024)); STATE.gradientSprite.texture=tex; } return API; },
    setGlitch(v){ v=clamp(v,0,2); STATE.options.glitch=v; return API; },
    pulseGlitch(){ macroGlitch(420); return API; },
    burst(x,y){ if(!STATE.app) return API; if(typeof x!=='number'||typeof y!=='number'){ x=STATE.app.renderer.width/2; y=STATE.app.renderer.height/2; } burst(x,y); return API; },
    isRunning(){ return !!STATE.running; }
  };

  // cleanup of shockwaves each frame via monkey-patch ticker on start
  const _oldInit = API.init;

  // Auto-init via data attribute
  if (document.currentScript && document.currentScript.hasAttribute('data-reiatsu')) {
    const attr=document.currentScript.getAttribute('data-reiatsu');
    try { const opts = attr && attr.trim() ? JSON.parse(attr) : {}; API.init(opts); } catch { API.init(); }
  }

  global.Reiatsu = API;
})(window);
