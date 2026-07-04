import * as THREE from 'three';
import STARS_VERT from '../shaders/stars.vert.glsl';
import STARS_FRAG from '../shaders/stars.frag.glsl';

const tmpHead = new THREE.Vector3();
const tmpTail = new THREE.Vector3();

export function buildSpaceEnvironment(scene) {
  const hemi = new THREE.HemisphereLight(0x9fbfff, 0x020305, 0.38);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(-10, 15, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048,2048);
  scene.add(key);
  const fill = new THREE.PointLight(0x5fc8ff, 0.65, 18);
  fill.position.set(0, 2.2, 2.5);
  scene.add(fill);

  // El cielo (estrellas + vía láctea + nebulosas) va en un grupo que SIGUE a la
  // cámara, como un skybox. Así nunca te acercas a una nebulosa aunque vueles
  // lejísimos (p. ej. al observar Neptuno).
  const sky = new THREE.Group();
  scene.add(sky);

  // Escala planetaria: los planetas orbitan a millones de unidades (1 AU =
  // 300.000 u). El cielo (estrellas, vía láctea, nebulosas, galaxias) debe
  // quedar MÁS LEJOS que el planeta más externo del sistema (~9e6) o su
  // esfera translúcida se dibujaría por delante de los planetas lejanos. Todo
  // el firmamento se aleja ×SKY_SCALE; sigue a la cámara (skybox), así que su
  // radio absoluto solo importa para el orden de dibujo, no para el paralaje.
  const SKY_SCALE = 1;

  const N = 80000;
  const pos = new Float32Array(N*3);
  const col = new Float32Array(N*3);
  const phase = new Float32Array(N);
  const size = new Float32Array(N);
  const color = new THREE.Color();
  for (let i=0;i<N;i++) {
    const r = (900 + Math.random()*2500) * SKY_SCALE;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    pos[i*3] = r*Math.sin(phi)*Math.cos(theta);
    pos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    pos[i*3+2] = r*Math.cos(phi);
    color.setHSL(0.56 + Math.random()*0.12, 0.25 + Math.random()*0.25, 0.72 + Math.random()*0.28);
    col[i*3]=color.r; col[i*3+1]=color.g; col[i*3+2]=color.b;
    phase[i] = Math.random()*62.8;
    size[i] = 0.8 + Math.random()*1.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color', new THREE.BufferAttribute(col,3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase,1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size,1));

  // Estrellas con parpadeo sutil (shaders en js/shaders/stars.*.glsl). uFade
  // las funde con el cielo al descender a un planeta iluminado.
  // uPointScale: tamaño aparente en px = aSize·uPointScale/(-z). Con el cielo
  // a z≈SKY_SCALE·2000 hace falta un factor grande para que la estrella no
  // caiga a sub-píxel. Se calibra para ~1.5-3 px por estrella.
  const starUniforms = { uTime: { value: 0 }, uFade: { value: 0 }, uPointScale: { value: 300 } };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STARS_VERT,
    fragmentShader: STARS_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const stars = new THREE.Points(geo, starMat);
  stars.userData.uniforms = starUniforms;
  sky.add(stars);

  const milky = new THREE.Mesh(
    new THREE.SphereGeometry(3600 * SKY_SCALE, 64, 32),
    new THREE.MeshBasicMaterial({
      map: makeMilkyTexture(), side: THREE.BackSide, transparent:true, opacity:.42, depthWrite:false
    })
  );
  milky.rotation.set(0.55,0.2,-0.3);
  sky.add(milky);

  // Nebulosas de color muy lejanas (textura con desvanecido radial: sin bordes duros)
  const nebTex = makeNebulaTexture();
  const nebColors = [0x5566ff, 0xff4488, 0x33ddbb, 0x8844ff, 0xff8844, 0x2ad4ff, 0xff2f6e, 0x8cff5c];
  for (let i=0;i<nebColors.length;i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebTex, color: nebColors[i], transparent:true, opacity:0.11 + Math.random()*0.07,
      blending: THREE.AdditiveBlending, depthWrite:false
    }));
    const r = 3000 * SKY_SCALE;
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
    spr.position.set(r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th)*0.6, r*Math.cos(ph));
    const s = (1300 + Math.random()*1500) * SKY_SCALE;
    spr.scale.set(s, s, 1);
    sky.add(spr);
  }

  const constellations = makeConstellations(SKY_SCALE);
  sky.add(constellations);

  makeGalaxies(sky, SKY_SCALE);
  const shootingStars = makeShootingStars(sky, SKY_SCALE);

  // Desvanecimiento atmosférico del cielo profundo: al descender a un planeta
  // iluminado, estrellas, vía láctea, nebulosas, galaxias y constelaciones se
  // funden tras el cielo (0 = espacio pleno, 1 = ocultas). Se cachea la
  // opacidad base de cada material para poder escalarla sin acumulación.
  const shootingLines = new Set(shootingStars.map(s => s.line));
  const fadeTargets = [];
  sky.traverse(o => {
    if (!o.material || o === stars || shootingLines.has(o)) return;
    if (o.material.transparent && typeof o.material.opacity === 'number') {
      fadeTargets.push({ material: o.material, base: o.material.opacity });
    }
  });
  let skyFade = 0;

  return {
    sky, stars, milky, constellations,
    setFade(f) {
      f = THREE.MathUtils.clamp(f, 0, 1);
      if (Math.abs(f - skyFade) < 0.002) return;
      skyFade = f;
      starUniforms.uFade.value = f;
      for (const t of fadeTargets) t.material.opacity = t.base * (1 - f);
    },
    update(dt) { updateShootingStars(shootingStars, dt, skyFade); }
  };
}

// Galaxias lejanas: manchas con núcleo brillante + brazos espirales de puntos,
// distintas de las nebulosas (más estructuradas, dan sensación de escala
// verdaderamente cósmica más allá del propio sistema).
function makeGalaxyTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const cx = 256, cy = 256;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
  core.addColorStop(0, 'rgba(255,250,230,.95)');
  core.addColorStop(0.35, 'rgba(255,220,180,.5)');
  core.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 512, 512);
  for (let arm = 0; arm < 2; arm++) {
    const offset = arm * Math.PI;
    for (let i = 0; i < 480; i++) {
      const t = i / 480;
      const ang = t * Math.PI * 3.4 + offset;
      const rad = 20 + t * 220;
      const x = cx + Math.cos(ang) * rad + (Math.random() - 0.5) * 14;
      const y = cy + Math.sin(ang) * rad * 0.5 + (Math.random() - 0.5) * 14;
      const a = (1 - t) * 0.5 * Math.random();
      ctx.fillStyle = `rgba(255,240,220,${a})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }
  ctx.globalCompositeOperation = 'destination-in';
  const vg = ctx.createRadialGradient(cx, cy, 40, cx, cy, 256);
  vg.addColorStop(0, 'rgba(255,255,255,1)');
  vg.addColorStop(0.75, 'rgba(255,255,255,.5)');
  vg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGalaxies(sky, skyScale = 1) {
  const tex = makeGalaxyTexture();
  const colors = [0xffe6c2, 0xbcd6ff, 0xffd0e8, 0xd8ffea];
  for (let i = 0; i < 4; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: colors[i], transparent: true, opacity: 0.4 + Math.random() * 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI * 2
    }));
    const r = 3450 * skyScale;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    spr.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.5, r * Math.cos(ph));
    const s = (480 + Math.random() * 380) * skyScale;
    spr.scale.set(s, s, 1);
    sky.add(spr);
  }
}

// Estrellas fugaces: destellos breves y rápidos (a diferencia de los cometas,
// lentos y en órbita) para que el cielo nunca se sienta del todo quieto. El
// bloom del compositor ya existente hace que incluso una línea fina brille.
function makeShootingStars(sky, skyScale = 1) {
  const POOL = 5;
  const stars = [];
  for (let i = 0; i < POOL; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xdff2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    sky.add(line);
    stars.push({ line, timer: Math.random() * 4, active: false, t: 0, start: new THREE.Vector3(), end: new THREE.Vector3() });
  }
  stars.skyScale = skyScale;
  return stars;
}

function updateShootingStars(list, dt, skyFade = 0) {
  const skyScale = list.skyScale || 1;
  for (const s of list) {
    if (!s.active) {
      s.timer -= dt;
      if (s.timer > 0) continue;
      const r = 2500 * skyScale;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 1.1 - 0.55);
      const travel = Math.random() * Math.PI * 2;
      const len = (130 + Math.random() * 200) * skyScale;
      s.start.set(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
      s.end.copy(s.start).add(new THREE.Vector3(Math.cos(travel) * len, (Math.random() - 0.5) * len * 0.5, Math.sin(travel) * len));
      s.active = true;
      s.t = 0;
      s.line.visible = true;
      continue;
    }
    s.t += dt;
    const dur = 0.5;
    if (s.t >= dur) {
      s.active = false;
      s.line.visible = false;
      s.timer = 2.5 + Math.random() * 8;
      continue;
    }
    const k = s.t / dur;
    const headT = Math.min(1, k * 1.5);
    const tailT = Math.max(0, k * 1.5 - 0.4);
    tmpHead.copy(s.start).lerp(s.end, headT);
    tmpTail.copy(s.start).lerp(s.end, tailT);
    const pos = s.line.geometry.attributes.position;
    pos.setXYZ(0, tmpTail.x, tmpTail.y, tmpTail.z);
    pos.setXYZ(1, tmpHead.x, tmpHead.y, tmpHead.z);
    pos.needsUpdate = true;
    s.line.material.opacity = Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * (1 - Math.max(0, k - 0.7) / 0.3) * (1 - skyFade);
  }
}

// Constelaciones estilizadas (Orión, Osa Mayor, Casiopea, Cisne) dibujadas
// como líneas + estrellas brillantes muy lejanas, siguiendo a la cámara igual
// que el resto del cielo. Guiño temático: la nave se llama Orion-07.
const CONSTELLATION_SHAPES = {
  Orion: [[[-1.4,2.0],[-0.5,0.2]],[[1.3,2.1],[0.5,0.1]],[[-0.5,0.2],[0,0.15]],[[0,0.15],[0.5,0.1]],[[-0.5,0.2],[-1.1,-2.0]],[[0.5,0.1],[1.2,-2.1]]],
  'Osa Mayor': [[[-2.2,0.6],[-1.3,0.9]],[[-1.3,0.9],[-0.4,0.75]],[[-0.4,0.75],[0.5,0.4]],[[0.5,0.4],[-2.2,0.6]],[[0.5,0.4],[1.4,0.9]],[[1.4,0.9],[2.3,1.5]],[[2.3,1.5],[3.0,1.0]]],
  Casiopea: [[[-2,0],[-1,1]],[[-1,1],[0,0.2]],[[0,0.2],[1,1.1]],[[1,1.1],[2,0.1]]],
  Cisne: [[[0,2],[0,0]],[[0,0],[0,-2]],[[-1.6,0],[0,0]],[[0,0],[1.6,0]]]
};

function makeConstellations(skyScale = 1) {
  const group = new THREE.Group();
  const R = 3400 * skyScale;
  const scale = 90 * skyScale;
  const lineMat = new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent:true, opacity:0.24, blending:THREE.AdditiveBlending, depthWrite:false });
  const starTex = makeDotTexture();
  const names = Object.keys(CONSTELLATION_SHAPES);
  const up0 = new THREE.Vector3(0,1,0);

  names.forEach((name, i) => {
    const segs = CONSTELLATION_SHAPES[name];
    const theta = (i / names.length) * Math.PI * 2 + Math.random() * 0.5;
    const phi = Math.PI * 0.26 + Math.random() * Math.PI * 0.48;
    const dir = new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
    const right = new THREE.Vector3().crossVectors(Math.abs(dir.y) > 0.98 ? new THREE.Vector3(1,0,0) : up0, dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const base = dir.clone().multiplyScalar(R);

    const project = (x, y) => base.clone().addScaledVector(right, x*scale).addScaledVector(up, y*scale).normalize().multiplyScalar(R);

    const pts = [];
    for (const [[x1,y1],[x2,y2]] of segs) pts.push(project(x1,y1), project(x2,y2));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    group.add(new THREE.LineSegments(geo, lineMat));

    const uniquePts = [];
    for (const p of pts) if (!uniquePts.some(q => q.distanceToSquared(p) < skyScale*skyScale)) uniquePts.push(p);
    for (const p of uniquePts) {
      const star = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTex, color: 0xeaf6ff, transparent:true, opacity:0.8 + Math.random()*0.15,
        blending: THREE.AdditiveBlending, depthWrite:false
      }));
      star.position.copy(p);
      const s = (13 + Math.random()*11) * skyScale;
      star.scale.set(s, s, 1);
      group.add(star);
    }
  });

  return group;
}

function makeDotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(210,235,255,.6)');
  g.addColorStop(1, 'rgba(210,235,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,64,64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNebulaTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  for (let i=0;i<340;i++) {
    const x = Math.random()*512, y = Math.random()*512;
    const r = 20 + Math.random()*120;
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    const a = 0.02 + Math.random()*0.05;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  // Desvanecido radial: el sprite siempre llega transparente a los bordes (sin cuadro).
  ctx.globalCompositeOperation = 'destination-in';
  const vg = ctx.createRadialGradient(256,256,40,256,256,256);
  vg.addColorStop(0, 'rgba(255,255,255,1)');
  vg.addColorStop(0.7, 'rgba(255,255,255,0.6)');
  vg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vg;
  ctx.fillRect(0,0,512,512);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMilkyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 1024;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,cv.width,cv.height);
  for (let i=0;i<6500;i++) {
    const x = Math.random()*cv.width;
    const band = cv.height*.48 + Math.sin(x*.008)*80;
    const y = band + (Math.random()-.5)*180*Math.random();
    const a = Math.random()*.16;
    ctx.fillStyle = `rgba(${120+Math.random()*90},${150+Math.random()*80},${255},${a})`;
    ctx.beginPath(); ctx.arc(x,y,Math.random()*2.5,0,Math.PI*2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
