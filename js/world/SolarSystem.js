import * as THREE from 'three';

const G = 6.67430e-11;
const AU = 1.496e11;
const M_SUN = 1.989e30;
const M_EARTH = 5.972e24;
const M_COMET = 2.2e14;
const VISUAL_AU = 34;
const PHYS_STEP = 3600 * 6;

// ---------- Shaders ----------
const NOISE_GLSL = `
float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.02; a*=0.5; } return v; }
`;

const SUN_VERT = `
varying vec3 vPos; varying vec3 vNormalW; varying vec3 vView;
void main(){
  vPos = position;
  vNormalW = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SUN_FRAG = `
uniform float uTime;
varying vec3 vPos; varying vec3 vNormalW; varying vec3 vView;
${NOISE_GLSL}
void main(){
  vec3 p = normalize(vPos);
  float t = uTime * 0.06;
  // Granulación convectiva + filamentos
  float n  = fbm(p*3.2 + vec3(0.0, t, 0.0));
  float n2 = fbm(p*7.5 - vec3(t*1.3));
  float n3 = fbm(p*16.0 + vec3(t*2.1));
  float h = n*0.55 + n2*0.32 + n3*0.13;

  vec3 cold = vec3(0.62, 0.10, 0.0);
  vec3 mid  = vec3(1.0, 0.45, 0.06);
  vec3 hot  = vec3(1.0, 0.92, 0.55);
  vec3 col = mix(cold, mid, smoothstep(0.20, 0.52, h));
  col = mix(col, hot, smoothstep(0.55, 0.92, h));

  // Manchas solares (oscuras y frías)
  float spot = smoothstep(0.86, 0.93, fbm(p*2.1 + 11.0));
  col = mix(col, vec3(0.25,0.06,0.0), spot*0.7);

  // Oscurecimiento de limbo + borde incandescente
  float ndv = max(dot(normalize(vNormalW), vView), 0.0);
  col *= mix(0.55, 1.15, ndv);
  float rim = pow(1.0 - ndv, 3.0);
  col += vec3(1.0,0.55,0.18) * rim * 1.4;

  gl_FragColor = vec4(col * 1.7, 1.0);
}`;

const CORONA_VERT = `
varying vec3 vNormalW; varying vec3 vView;
void main(){
  vNormalW = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const CORONA_FRAG = `
uniform float uTime;
varying vec3 vNormalW; varying vec3 vView;
void main(){
  float ndv = abs(dot(normalize(vNormalW), vView));
  float glow = pow(1.0 - ndv, 2.6);
  float flick = 0.85 + 0.15*sin(uTime*2.0);
  vec3 col = mix(vec3(1.0,0.45,0.07), vec3(1.0,0.78,0.3), glow);
  gl_FragColor = vec4(col, glow * 0.9 * flick);
}`;

// Atmósfera/halo fresnel para planetas (scattering simple)
const ATMO_VERT = `
varying vec3 vNormalW; varying vec3 vView;
void main(){
  vNormalW = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ATMO_FRAG = `
uniform vec3 uColor; uniform float uPower; uniform float uStrength;
varying vec3 vNormalW; varying vec3 vView;
void main(){
  float ndv = max(dot(normalize(vNormalW), vView), 0.0);
  float fres = pow(1.0 - ndv, uPower);
  gl_FragColor = vec4(uColor, fres * uStrength);
}`;

function makeOrbit(radius, color=0x39535d, opacity=0.18) {
  const pts = [];
  for (let i=0;i<=384;i++) {
    const a = i / 384 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a)*radius, 0, Math.sin(a)*radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent:true, opacity, depthWrite:false }));
}

function seededNoise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeRadialSpriteTexture(colorA='rgba(255,210,90,1)', colorB='rgba(255,80,0,0)') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(512,512,0,512,512,512);
  g.addColorStop(0, colorA);
  g.addColorStop(0.22, 'rgba(255,190,60,.75)');
  g.addColorStop(0.55, 'rgba(255,90,0,.22)');
  g.addColorStop(1, colorB);
  ctx.fillStyle = g;
  ctx.fillRect(0,0,1024,1024);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePlanetCanvas(name, palette) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const ctx = cv.getContext('2d');
  const rnd = seededNoise(name.split('').reduce((a,c)=>a+c.charCodeAt(0), 0) * 999);

  const base = ctx.createLinearGradient(0,0,2048,1024);
  base.addColorStop(0, palette[0]);
  base.addColorStop(0.5, palette[1] || palette[0]);
  base.addColorStop(1, palette[2] || palette[0]);
  ctx.fillStyle = base;
  ctx.fillRect(0,0,2048,1024);

  if (['Jupiter','Saturno','Urano','Neptuno'].includes(name)) {
    for (let y=0; y<1024; y++) {
      const band = Math.sin(y * 0.035 + rnd()*4) * 0.5 + 0.5;
      const alpha = 0.10 + band * 0.20;
      ctx.fillStyle = y % 90 < 45 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha*0.55})`;
      ctx.fillRect(0, y, 2048, 1 + Math.floor(rnd()*5));
    }
    if (name === 'Jupiter') {
      ctx.fillStyle = 'rgba(150,60,34,.78)';
      ctx.beginPath(); ctx.ellipse(1280, 590, 190, 72, -0.08, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(240,185,130,.45)';
      ctx.beginPath(); ctx.ellipse(1280, 590, 120, 44, -0.08, 0, Math.PI*2); ctx.fill();
    }
  } else if (name === 'Tierra') {
    // Océano + continentes + nubes para fallback sin internet.
    ctx.fillStyle = '#0b2b64'; ctx.fillRect(0,0,2048,1024);
    for (let i=0;i<26;i++) {
      ctx.fillStyle = `rgba(${60+rnd()*60},${95+rnd()*90},${55+rnd()*50},.92)`;
      ctx.beginPath();
      const cx = rnd()*2048, cy = 160 + rnd()*700;
      const rx = 80 + rnd()*260, ry = 35 + rnd()*135;
      ctx.ellipse(cx, cy, rx, ry, rnd()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
    for (let i=0;i<150;i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05+rnd()*0.14})`;
      ctx.beginPath();
      ctx.ellipse(rnd()*2048, rnd()*1024, 20+rnd()*130, 5+rnd()*30, rnd()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
  } else {
    for (let i=0;i<4500;i++) {
      const x = rnd()*2048, y = rnd()*1024, r = rnd()*3.5;
      ctx.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.08)';
      ctx.fillRect(x,y,r,r);
    }
    for (let i=0;i<70;i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.04+rnd()*0.08})`;
      ctx.lineWidth = 1 + rnd()*3;
      ctx.beginPath();
      ctx.moveTo(rnd()*2048, rnd()*1024);
      ctx.bezierCurveTo(rnd()*2048, rnd()*1024, rnd()*2048, rnd()*1024, rnd()*2048, rnd()*1024);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 12;
  return tex;
}

function makeSunTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const ctx = cv.getContext('2d');
  const rnd = seededNoise(777);
  const grd = ctx.createLinearGradient(0,0,2048,1024);
  grd.addColorStop(0,'#ff6b00'); grd.addColorStop(.45,'#ffd15b'); grd.addColorStop(1,'#ff3b00');
  ctx.fillStyle = grd; ctx.fillRect(0,0,2048,1024);
  for (let i=0;i<9000;i++) {
    const x = rnd()*2048, y = rnd()*1024;
    const a = 0.035 + rnd()*0.16;
    ctx.fillStyle = rnd() > .5 ? `rgba(255,255,220,${a})` : `rgba(170,30,0,${a})`;
    ctx.beginPath(); ctx.arc(x,y, rnd()*5+0.5, 0, Math.PI*2); ctx.fill();
  }
  for (let i=0;i<120;i++) {
    ctx.strokeStyle = `rgba(255,240,120,${0.08+rnd()*0.18})`;
    ctx.lineWidth = 2 + rnd()*10;
    ctx.beginPath();
    const y = rnd()*1024;
    ctx.moveTo(0,y);
    ctx.bezierCurveTo(500+rnd()*200, y-200+rnd()*400, 1200+rnd()*300, y-180+rnd()*360, 2048, y-120+rnd()*240);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

export class SolarSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(0, -9, -120);
    this.scene.add(this.group);
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.setCrossOrigin('anonymous');
    this.sim = null;
    this.trail = null;
    this.trailPoints = [];
    this.sunCore = null;
    this.sunCorona = [];
    this.time = 0;
    this.timeScale = 1;   // velocidad global del sistema (ajustable en observación)

    // Atractores gravitatorios (por defecto: el Sol en el origen). Otros
    // escenarios (estrella masiva, púlsar, binario) cambian esta lista.
    this.attractors = [{ mass: M_SUN, x: 0, y: 0, z: 0 }];
    this.scenario = 'solar';
    this.scenarioVisuals = {};   // grupos de visuales por escenario (lazy)
  }

  setTimeScale(s) {
    this.timeScale = THREE.MathUtils.clamp(Number(s) || 1, 0.1, 5);
  }

  tex(url, fallback) {
    const t = fallback;
    t.anisotropy = 16;
    this.textureLoader.load(url, loaded => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 16;
      loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
      t.image = loaded.image;
      t.needsUpdate = true;
    }, undefined, () => {
      // Fallback procedural ya aplicado.
    });
    return t;
  }

  makeAtmosphere(radius, color, opacity=0.12, scale=1.05) {
    const c = new THREE.Color(color);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uPower: { value: 3.0 },
        uStrength: { value: Math.min(opacity * 6.5, 1.6) }
      },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 96, 96), mat);
  }

  buildSun() {
    // Radio reducido: antes (13.5) era mayor que la órbita visual de Mercurio
    // (0.39 AU × 34 = 13.26), por eso Mercurio lo "atravesaba". Ahora cabe fuera.
    const R = 7.5;

    // --- Superficie del Sol: shader de plasma animado (granulación + manchas) ---
    this.sunUniforms = { uTime: { value: 0 } };
    const surfMat = new THREE.ShaderMaterial({
      uniforms: this.sunUniforms,
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      toneMapped: false
    });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 256), surfMat);
    sun.name = 'REALISTIC_VOLUMETRIC_SUN';
    this.group.add(sun);
    this.sunCore = sun;

    // --- Corona de borde (fresnel) que solo brilla en el limbo ---
    const coronaMat = new THREE.ShaderMaterial({
      uniforms: this.sunUniforms,
      vertexShader: CORONA_VERT,
      fragmentShader: CORONA_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false
    });
    const corona = new THREE.Mesh(new THREE.SphereGeometry(R * 1.35, 128, 128), coronaMat);
    sun.add(corona);

    // --- Halo volumétrico (sprites aditivos en capas) ---
    const haloTex = makeRadialSpriteTexture();
    for (const [scale, opacity, color] of [
      [40, 0.5, 0xffcf72], [72, 0.22, 0xff8a2a], [128, 0.1, 0xff4d12]
    ]) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      sprite.scale.set(scale, scale, 1);
      sun.add(sprite);
    }

    // Capas de corona difusa (esferas aditivas) para volumen
    for (const [scale, opacity, color] of [
      [1.15, .13, 0xffb02e], [1.4, .055, 0xff6a00], [1.7, .025, 0xff3200]
    ]) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(R * scale, 96, 96),
        new THREE.MeshBasicMaterial({ color, transparent:true, opacity, side:THREE.BackSide, depthWrite:false, blending:THREE.AdditiveBlending })
      );
      sun.add(shell);
      this.sunCorona.push(shell);
    }

    const sunLight = new THREE.PointLight(0xffe6c0, 22, 3000, 1.1);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sun.add(sunLight);

    const fill = new THREE.HemisphereLight(0x29405f, 0x050505, 0.32);
    this.group.add(fill);
  }

  build() {
    this.solarExtra = [];   // órbitas + asteroides (para ocultar en otros escenarios)
    this.buildSun();

    const planets = [
      {name:'Mercurio', au:0.39, radius:.48, url:'https://threejs.org/examples/textures/planets/mercury.jpg', colors:['#918477','#554b42','#b0a090'], rough:.92},
      {name:'Venus', au:.72, radius:.86, url:'https://threejs.org/examples/textures/planets/venus.jpg', colors:['#d39c57','#8a5527','#f2c987'], rough:.86, atmo:0xffbc65},
      {name:'Tierra', au:1.0, radius:1.0, url:'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', colors:['#083777','#1e6a4e','#9cc5ff'], rough:.56, atmo:0x63b8ff},
      {name:'Marte', au:1.52, radius:.65, url:'https://threejs.org/examples/textures/planets/mars_1k_color.jpg', colors:['#b45128','#6a2e19','#d17b48'], rough:.9},
      {name:'Jupiter', au:5.2, radius:3.25, url:'https://threejs.org/examples/textures/planets/jupiter.jpg', colors:['#b17a4d','#e1c08e','#6d4b35'], rough:.74},
      {name:'Saturno', au:9.58, radius:2.75, url:'https://threejs.org/examples/textures/planets/saturn.jpg', colors:['#c7a876','#f1d6a2','#69533a'], rough:.77},
      {name:'Urano', au:19.2, radius:1.78, url:'https://threejs.org/examples/textures/planets/uranus.jpg', colors:['#81d2d1','#386d79','#b3ffff'], rough:.62, atmo:0x80f2ff},
      {name:'Neptuno', au:30.1, radius:1.72, url:'https://threejs.org/examples/textures/planets/neptune.jpg', colors:['#21458e','#466fe6','#101c54'], rough:.65, atmo:0x4f87ff}
    ];

    this.planets = [];
    for (const p of planets) {
      const pivot = new THREE.Group();
      this.group.add(pivot);

      const fallback = makePlanetCanvas(p.name, p.colors);
      const material = new THREE.MeshStandardMaterial({
        map:this.tex(p.url, fallback),
        roughness:p.rough,
        metalness:0.0,
        emissive:0x000000,
        envMapIntensity:0.65
      });

      if (p.name === 'Tierra') {
        material.normalMap = this.tex('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg', makePlanetCanvas('EarthNormal', ['#8080ff','#8d8dff','#7373e8']));
        material.normalScale = new THREE.Vector2(0.36, 0.36);
        material.roughnessMap = this.tex('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg', makePlanetCanvas('EarthSpec', ['#222','#777','#111']));
        // Luces de ciudades en la cara nocturna
        material.emissive = new THREE.Color(0xffd27a);
        material.emissiveIntensity = 1.1;
        material.emissiveMap = this.tex('https://threejs.org/examples/textures/planets/earth_lights_2048.png', makePlanetCanvas('EarthLights', ['#000','#000','#000']));
      }
      if (p.name === 'Marte') {
        material.normalMap = this.tex('https://threejs.org/examples/textures/planets/mars_1k_normal.jpg', makePlanetCanvas('MarsNormal', ['#8080ff','#8888ff','#7777e8']));
        material.normalScale = new THREE.Vector2(0.55, 0.55);
      }

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 192, 192), material);
      const dist = p.au * VISUAL_AU;
      mesh.position.set(dist, 0, 0);
      mesh.userData.name = p.name;
      pivot.userData = { au:p.au, speed: 0.052 / Math.pow(p.au, 1.5), offset: Math.random()*Math.PI*2 };
      pivot.rotation.y = pivot.userData.offset;
      pivot.add(mesh);

      // Halo atmosférico: marcado en los que tienen atmósfera, sutil en el resto.
      const atmoColor = p.atmo || 0x6fa8ff;
      mesh.add(this.makeAtmosphere(p.radius, atmoColor, p.atmo ? (p.name === 'Tierra' ? 0.22 : 0.13) : 0.05, p.atmo ? 1.06 : 1.03));

      if (p.name === 'Tierra') {
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 1.014, 160, 160),
          new THREE.MeshLambertMaterial({
            map:this.tex('https://threejs.org/examples/textures/planets/earth_clouds_1024.png', makePlanetCanvas('Clouds', ['#ffffff','#cccccc','#ffffff'])),
            transparent:true, opacity:0.42, depthWrite:false
          })
        );
        mesh.add(clouds);
        mesh.userData.clouds = clouds;

        // Luna orbitando la Tierra (da vida al sistema)
        const moon = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 0.27, 64, 64),
          new THREE.MeshStandardMaterial({
            map: this.tex('https://threejs.org/examples/textures/planets/moon_1024.jpg', makePlanetCanvas('Luna', ['#9a958f','#5a554f','#c4c0b8'])),
            roughness: 0.95, metalness: 0.0
          })
        );
        const moonPivot = new THREE.Group();
        moon.position.set(p.radius * 2.6, 0, 0);
        moonPivot.add(moon);
        moonPivot.rotation.x = 0.09;
        mesh.add(moonPivot);
        mesh.userData.moonPivot = moonPivot;
      }

      if (p.name === 'Saturno') {
        const ringTex = this.tex('https://threejs.org/examples/textures/planets/saturnringcolor.jpg', makePlanetCanvas('SaturnRing', ['#372b1e','#c5aa80','#f1d4a4']));
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.radius*1.35, p.radius*2.75, 256),
          new THREE.MeshBasicMaterial({ map:ringTex, side:THREE.DoubleSide, transparent:true, opacity:.94, depthWrite:false })
        );
        ring.rotation.x = Math.PI / 2.12;
        mesh.add(ring);
      }

      if (p.name === 'Urano') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.radius*1.45, p.radius*2.05, 160),
          new THREE.MeshBasicMaterial({ color:0x9ed8e8, side:THREE.DoubleSide, transparent:true, opacity:.18, depthWrite:false })
        );
        ring.rotation.x = Math.PI / 2.05;
        mesh.add(ring);
      }

      const orbit = makeOrbit(dist, 0x2a5a70, p.au < 2 ? 0.21 : 0.13);
      this.group.add(orbit);
      this.solarExtra.push(orbit);
      this.planets.push({ pivot, mesh, data:p });
    }

    this.makeAsteroids();
    this.makeSimBody('planet', 1, 0, 0, 0, 29.8, 0);
  }

  makeAsteroids() {
    const count = 2200;
    const geo = new THREE.IcosahedronGeometry(.10, 2);
    const mat = new THREE.MeshStandardMaterial({ color:0x8a735d, roughness:.96, metalness:.02 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i=0;i<count;i++) {
      const r = (2.05 + Math.random()*1.35) * VISUAL_AU;
      const a = Math.random()*Math.PI*2;
      const s = Math.random()*0.72+0.16;
      q.setFromEuler(new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI));
      m.compose(new THREE.Vector3(Math.cos(a)*r, (Math.random()-.5)*5.4, Math.sin(a)*r), q, new THREE.Vector3(s,s*(0.5+Math.random()),s));
      inst.setMatrixAt(i,m);
    }
    this.group.add(inst);
    if (this.solarExtra) this.solarExtra.push(inst);
  }

  // ---------- Escenarios alternativos (estrella masiva, púlsar, binario) ----------
  makeGlowStar(radius, coreColor, haloColor, lightI = 30) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 64),
      new THREE.MeshBasicMaterial({ color: coreColor, toneMapped: false })
    );
    g.add(core);
    const haloTex = makeRadialSpriteTexture();
    for (const [s, o] of [[radius * 6, 0.5], [radius * 11, 0.22], [radius * 20, 0.1]]) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: haloColor, transparent: true, opacity: o,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      spr.scale.set(s, s, 1);
      g.add(spr);
    }
    g.add(new THREE.PointLight(coreColor, lightI, 5000, 1.0));
    g.userData.core = core;
    return g;
  }

  makePulsar() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xcfe6ff, toneMapped: false })
    );
    g.add(core);
    // Haces (lighthouse) que barren al girar
    const beams = new THREE.Group();
    const beamGeo = new THREE.ConeGeometry(3.4, 70, 28, 1, true);
    beamGeo.translate(0, 35, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x9fd0ff, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.x = Math.PI;
    beams.add(b1, b2);
    beams.rotation.z = 0.6;
    g.add(beams);
    const haloTex = makeRadialSpriteTexture('rgba(200,235,255,1)', 'rgba(90,160,255,0)');
    for (const [s, o] of [[10, 0.55], [22, 0.22]]) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: 0xbfe0ff, transparent: true, opacity: o,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      spr.scale.set(s, s, 1);
      g.add(spr);
    }
    g.add(new THREE.PointLight(0xbfe0ff, 24, 3000, 1.0));
    g.userData.beams = beams; g.userData.core = core;
    return g;
  }

  buildScenarioVisual(name) {
    if (name === 'massive') return this.makeGlowStar(11, 0xaaccff, 0x88aaff, 45);
    if (name === 'pulsar') return this.makePulsar();
    if (name === 'binary') {
      const g = new THREE.Group();
      const a = this.makeGlowStar(3.2, 0xfff0c0, 0xffcf72, 22);
      const b = this.makeGlowStar(3.2, 0xcfe0ff, 0x9fc0ff, 22);
      g.add(a, b);
      g.userData.starA = a; g.userData.starB = b;
      return g;
    }
    return new THREE.Group();
  }

  setScenario(name) {
    this.scenario = name;
    const solar = name === 'solar';
    if (this.sunCore) this.sunCore.visible = solar;
    if (this.planets) this.planets.forEach(p => p.pivot.visible = solar);
    if (this.solarExtra) this.solarExtra.forEach(o => o.visible = solar);
    for (const k in this.scenarioVisuals) this.scenarioVisuals[k].visible = false;

    if (solar) {
      this.attractors = [{ mass: M_SUN, x: 0, y: 0, z: 0 }];
      this.binary = null;
      return;
    }

    let vis = this.scenarioVisuals[name];
    if (!vis) { vis = this.buildScenarioVisual(name); this.scenarioVisuals[name] = vis; this.group.add(vis); }
    vis.visible = true;

    if (name === 'massive') {
      this.attractors = [{ mass: 12 * M_SUN, x: 0, y: 0, z: 0 }];
      this.binary = null;
    } else if (name === 'pulsar') {
      this.attractors = [{ mass: 1.4 * M_SUN, x: 0, y: 0, z: 0 }];
      this.binary = null;
    } else if (name === 'binary') {
      const m = 2 * M_SUN, sep = 6 * AU;
      this.attractors = [{ mass: m, x: sep / 2, y: 0, z: 0 }, { mass: m, x: -sep / 2, y: 0, z: 0 }];
      this.binary = { mass: m, sep, angle: 0, omega: Math.sqrt(G * 2 * m / (sep * sep * sep)) };
    }
  }

  // Libera geometrías/materiales/texturas de un objeto y sus hijos. Sin esto,
  // cada vez que se observa un cuerpo distinto (makeSimBody se llama de nuevo)
  // la malla, textura y flechas anteriores quedaban huérfanas en memoria de la
  // GPU: en una máquina de 8 GB, ciclar entre los 12 cuerpos varias veces
  // acumulaba decenas de texturas 2048×1024 nunca liberadas.
  disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) {
            if (m[key]) m[key].dispose();
          }
          m.dispose();
        }
      }
    });
  }

  makeSimBody(type, xAU, yAU, zAU, vxKm, vyKm, vzKm, look = {}) {
    if (this.sim?.mesh) { this.group.remove(this.sim.mesh); this.disposeObject3D(this.sim.mesh); }
    if (this.trail) { this.group.remove(this.trail); this.disposeObject3D(this.trail); }
    if (this.velArrow) { this.group.remove(this.velArrow); this.disposeObject3D(this.velArrow); }
    if (this.accArrow) { this.group.remove(this.accArrow); this.disposeObject3D(this.accArrow); }
    if (this.cometTail) { this.group.remove(this.cometTail); this.disposeObject3D(this.cometTail); }
    this.trailPoints = [];

    const radius = look.radius || (type === 'comet' ? .42 : .9);
    let mat;
    if (type === 'comet') {
      mat = new THREE.MeshStandardMaterial({ color:0xcfeeff, emissive:0x5c9fff, emissiveIntensity:.6, roughness:.4 });
    } else {
      // Textura real del planeta (con respaldo procedural si no hay internet)
      const fallback = makePlanetCanvas(look.fallbackName || 'SimBody', look.colors || ['#083777','#1e6a4e','#9cc5ff']);
      const map = look.url ? this.tex(look.url, fallback) : fallback;
      mat = new THREE.MeshStandardMaterial({
        map, roughness: look.rough ?? 0.7, metalness: 0.0
      });
      if (look.name === 'Tierra' && look.url) {
        // Tierra: luces de ciudades en la cara nocturna
        mat.emissive = new THREE.Color(0xffd27a);
        mat.emissiveIntensity = 0.9;
        mat.emissiveMap = this.tex('https://threejs.org/examples/textures/planets/earth_lights_2048.png', makePlanetCanvas('EL', ['#000','#000','#000']));
      } else {
        // El resto: emisividad suave de su propia textura, para que la cara
        // nocturna nunca quede totalmente negra y se vea el planeta real.
        mat.emissive = new THREE.Color(0x999999);
        mat.emissiveMap = map;
        mat.emissiveIntensity = 0.4;
      }
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), mat);

    if (type !== 'comet') {
      mesh.add(this.makeAtmosphere(radius, look.atmo || 0x63b8ff, look.atmo ? 0.2 : 0.06, 1.06));
    }
    // Anillos (Saturno / Urano)
    if (look.ring) {
      const ringTex = this.tex(look.ringUrl || 'https://threejs.org/examples/textures/planets/saturnringcolor.jpg',
        makePlanetCanvas('Ring', ['#372b1e','#c5aa80','#f1d4a4']));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.4, radius * 2.4, 128),
        new THREE.MeshBasicMaterial({ map: ringTex, color: look.ringColor || 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: look.ringOpacity ?? 0.9, depthWrite: false })
      );
      ring.rotation.x = Math.PI / 2.15;
      mesh.add(ring);
    }
    // Posición visual inicial inmediata (para que la cámara pueda enfocarlo ya).
    mesh.position.set(xAU * VISUAL_AU, yAU * VISUAL_AU, zAU * VISUAL_AU);
    this.group.add(mesh);
    this.sim = {
      type, mesh, mass: type === 'comet' ? M_COMET : M_EARTH,
      x:xAU*AU, y:yAU*AU, z:zAU*AU, vx:vxKm*1000, vy:vyKm*1000, vz:vzKm*1000
    };

    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: type==='comet'?0x9adfff:0x59b9ff, transparent:true, opacity:.7 }));
    this.group.add(this.trail);

    // Vectores físicos: velocidad (verde) y aceleración/fuerza hacia el Sol (rojo)
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(), 6, 0x57ff8f, 1.4, 0.8);
    this.accArrow = new THREE.ArrowHelper(new THREE.Vector3(-1,0,0), new THREE.Vector3(), 6, 0xff5a5a, 1.4, 0.8);
    this.velArrow.visible = this._vectorsVisible || false;
    this.accArrow.visible = this._vectorsVisible || false;
    this.group.add(this.velArrow);
    this.group.add(this.accArrow);

    if (type === 'comet') {
      const tail = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeRadialSpriteTexture('rgba(180,235,255,1)','rgba(90,160,255,0)'),
        color: 0xbfe8ff, transparent:true, opacity:0.7, blending:THREE.AdditiveBlending, depthWrite:false
      }));
      tail.scale.set(7, 7, 1);
      this.cometTail = tail;
      this.group.add(tail);
    }
  }

  setVectorsVisible(v) {
    this._vectorsVisible = v;
    if (this.velArrow) this.velArrow.visible = v;
    if (this.accArrow) this.accArrow.visible = v;
  }

  getPhysicsState() {
    const b = this.sim;
    if (!b) return null;
    // Aceleración neta de todos los atractores + centro de masa.
    let ax = 0, ay = 0, az = 0, totM = 0, cx = 0, cy = 0, cz = 0;
    for (const at of this.attractors) {
      totM += at.mass; cx += at.mass * at.x; cy += at.mass * at.y; cz += at.mass * at.z;
      const dx = at.x - b.x, dy = at.y - b.y, dz = at.z - b.z;
      const r2 = dx*dx + dy*dy + dz*dz + 1e14;
      const r = Math.sqrt(r2);
      const a = G * at.mass / r2;
      ax += a * dx / r; ay += a * dy / r; az += a * dz / r;
    }
    cx /= totM; cy /= totM; cz /= totM;
    const aMag = Math.sqrt(ax*ax + ay*ay + az*az);
    const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy + b.vz*b.vz);
    const dcx = b.x - cx, dcy = b.y - cy, dcz = b.z - cz;
    const r = Math.sqrt(dcx*dcx + dcy*dcy + dcz*dcz);
    const F = b.mass * aMag;
    const eps = speed*speed/2 - G*totM/r;   // energía orbital específica
    const orbit = eps < -1 ? 'elíptica (ligada)' : eps > 1 ? 'hiperbólica (de escape)' : 'parabólica';
    return {
      type: b.type, mass: b.mass, M: totM, nAttractors: this.attractors.length,
      r, rAU: r/AU, speed, speedKms: speed/1000,
      aMag, F, eps, orbit,
      pos: [b.x/AU, b.y/AU, b.z/AU],
      vel: [b.vx/1000, b.vy/1000, b.vz/1000]
    };
  }


  getSystemCenterWorld() {
    const v = new THREE.Vector3();
    this.group.getWorldPosition(v);
    return v;
  }

  getSimBodyWorldPosition() {
    const v = new THREE.Vector3();
    if (this.sim?.mesh) this.sim.mesh.getWorldPosition(v);
    else this.group.getWorldPosition(v);
    return v;
  }

  getSunWorldPosition() {
    const v = new THREE.Vector3();
    if (this.sunCore) this.sunCore.getWorldPosition(v);
    else this.group.getWorldPosition(v);
    return v;
  }

  physicsStep(dt) {
    const b = this.sim;
    let ax = 0, ay = 0, az = 0;
    for (const at of this.attractors) {
      const dx = at.x - b.x, dy = at.y - b.y, dz = at.z - b.z;
      const r2 = dx*dx + dy*dy + dz*dz + 1e14;
      const r = Math.sqrt(r2);
      const a = G * at.mass / r2;
      ax += a * dx / r; ay += a * dy / r; az += a * dz / r;
    }
    b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  }

  update(dt) {
    this.time += dt;
    if (this.sunUniforms) this.sunUniforms.uTime.value = this.time;
    if (this.sunCore) {
      this.sunCore.rotation.y += dt * 0.012;
      this.sunCorona.forEach((c, i) => {
        c.rotation.y -= dt * (0.010 + i*0.005);
        c.material.opacity = [0.14,0.06,0.03][i] * (0.82 + Math.sin(this.time*1.2 + i)*0.18);
      });
    }
    const ts = this.timeScale;
    if (this.planets) {
      for (const p of this.planets) {
        p.pivot.rotation.y += p.pivot.userData.speed * dt * ts;
        p.mesh.rotation.y += dt * ts * (p.data.name === 'Jupiter' ? 0.12 : 0.075);
        if (p.mesh.userData.clouds) p.mesh.userData.clouds.rotation.y += dt * ts * 0.045;
        if (p.mesh.userData.moonPivot) p.mesh.userData.moonPivot.rotation.y += dt * ts * 0.35;
      }
    }
    // Animación de los visuales de escenario
    if (this.scenario === 'pulsar' && this.scenarioVisuals.pulsar) {
      this.scenarioVisuals.pulsar.userData.beams.rotation.y += dt * 4.0 * ts;
      this.scenarioVisuals.pulsar.userData.core.rotation.y += dt * 2.0 * ts;
    }

    if (!this.sim) return;
    // La velocidad de la simulación física también sigue al timeScale.
    const steps = ts >= 1 ? Math.min(48, Math.round(4 * ts)) : 4;
    const stepDt = ts >= 1 ? PHYS_STEP : PHYS_STEP * ts;
    const physDt = stepDt * steps;

    // Las dos estrellas del binario orbitan su centro de masa (mueven sus atractores).
    if (this.scenario === 'binary' && this.binary) {
      this.binary.angle += this.binary.omega * physDt;
      const rx = Math.cos(this.binary.angle) * this.binary.sep / 2;
      const rz = Math.sin(this.binary.angle) * this.binary.sep / 2;
      this.attractors[0].x = rx;  this.attractors[0].z = rz;
      this.attractors[1].x = -rx; this.attractors[1].z = -rz;
      const vis = this.scenarioVisuals.binary;
      if (vis) {
        const sc = VISUAL_AU / AU;
        vis.userData.starA.position.set(rx * sc, 0, rz * sc);
        vis.userData.starB.position.set(-rx * sc, 0, -rz * sc);
      }
    }

    for (let i = 0; i < steps; i++) this.physicsStep(stepDt);
    const b = this.sim;
    const pos = new THREE.Vector3(b.x/AU*VISUAL_AU, b.y/AU*VISUAL_AU, b.z/AU*VISUAL_AU);
    b.mesh.position.copy(pos);
    b.mesh.rotation.y += dt * .5 * ts;
    this.trailPoints.push(pos.clone());
    if (this.trailPoints.length > 700) this.trailPoints.shift();
    this.trail.geometry.setFromPoints(this.trailPoints);

    // Vectores físicos en vivo
    if (this.velArrow) {
      const vdir = new THREE.Vector3(b.vx, b.vy, b.vz);
      const vlen = vdir.length();
      if (vlen > 0) {
        this.velArrow.position.copy(pos);
        this.velArrow.setDirection(vdir.normalize());
        this.velArrow.setLength(THREE.MathUtils.clamp(vlen / 6000, 3, 12), 1.4, 0.8);
      }
      const adir = pos.clone().multiplyScalar(-1);
      if (adir.length() > 0) {
        this.accArrow.position.copy(pos);
        this.accArrow.setDirection(adir.normalize());
        this.accArrow.setLength(THREE.MathUtils.clamp((G*M_SUN/(b.x*b.x+b.y*b.y+b.z*b.z+1)) * 4e6, 2, 10), 1.4, 0.8);
      }
    }
    if (this.cometTail) {
      // La cola apunta en dirección contraria al Sol (viento solar)
      const dir = pos.clone().normalize().multiplyScalar(4.5);
      this.cometTail.position.copy(pos).add(dir);
      this.cometTail.scale.setScalar(6 + Math.sin(this.time*3)*0.6);
    }
  }
}
