import * as THREE from 'three';

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

  const N = 80000;
  const pos = new Float32Array(N*3);
  const col = new Float32Array(N*3);
  const phase = new Float32Array(N);
  const size = new Float32Array(N);
  const color = new THREE.Color();
  for (let i=0;i<N;i++) {
    const r = 900 + Math.random()*2500;
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

  // Estrellas con parpadeo sutil: cada una tiene su propia fase (aPhase), así
  // el brillo y el tamaño oscilan de forma independiente en vez de latir todas
  // a la vez. El tamaño en pantalla usa la misma atenuación por distancia que
  // THREE.PointsMaterial (300 / -z) para que se vea igual que antes al volar.
  const starUniforms = { uTime: { value: 0 } };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: `
      attribute vec3 color;
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        float tw = sin(uTime * (1.4 + fract(aPhase) * 1.6) + aPhase * 3.0) * 0.5 + 0.5;
        vTwinkle = 0.5 + tw * 0.7;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * vTwinkle * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float alpha = smoothstep(0.5, 0.0, length(uv));
        gl_FragColor = vec4(vColor * vTwinkle, alpha * 0.92);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const stars = new THREE.Points(geo, starMat);
  stars.userData.uniforms = starUniforms;
  sky.add(stars);

  const milky = new THREE.Mesh(
    new THREE.SphereGeometry(3600, 64, 32),
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
    const r = 3000;
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
    spr.position.set(r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th)*0.6, r*Math.cos(ph));
    const s = 1300 + Math.random()*1500;
    spr.scale.set(s, s, 1);
    sky.add(spr);
  }

  const constellations = makeConstellations();
  sky.add(constellations);

  return { sky, stars, milky, constellations };
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

function makeConstellations() {
  const group = new THREE.Group();
  const R = 3400;
  const scale = 90;
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
    for (const p of pts) if (!uniquePts.some(q => q.distanceToSquared(p) < 1)) uniquePts.push(p);
    for (const p of uniquePts) {
      const star = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTex, color: 0xeaf6ff, transparent:true, opacity:0.8 + Math.random()*0.15,
        blending: THREE.AdditiveBlending, depthWrite:false
      }));
      star.position.copy(p);
      const s = 13 + Math.random()*11;
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
