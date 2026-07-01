// Mapa 2D del sistema solar A ESCALA — mini "Universe Sandbox" (vista cenital).
//
// Física: N-BODY real. Cada cuerpo (Sol incluido) atrae a todos los demás con
// F = G·m_i·m_j/r², así que Júpiter perturba a Marte, una estrella añadida
// desestabiliza el sistema, etc. Integrador seleccionable: Leapfrog (KDK,
// simpléctico — conserva la energía a largo plazo) o Euler semi-implícito
// (el mismo de la tarea/vista 3D). Colisiones: fusión con conservación del
// momento lineal (m·v se suma; el radio crece como la raíz cúbica del
// volumen combinado).
//
// Las DISTANCIAS son reales (AU): los interiores quedan apiñados junto al
// Sol y Neptuno lejísimos — ese vacío es el dato honesto. Los tamaños de los
// puntos y los radios de colisión NO están a escala (a escala real serían
// subpíxeles y jamás chocaría nada).
//
// Interacción tipo sandbox: elige PLANETA/COMETA/ESTRELLA y arrastra sobre el
// mapa para lanzarlo — la dirección y longitud del arrastre fijan la velocidad
// inicial y una línea punteada predice la trayectoria (elipse, parábola o
// hipérbola según la energía: exactamente lo que pide la tarea). Clic sobre
// un cuerpo abre el inspector con sus datos orbitales en vivo, edición de
// masa (×10 / ÷10), seguimiento de cámara y borrado.

const G = 6.67430e-11;
const AU = 1.496e11;
const M_SUN = 1.989e30;
const M_EARTH = 5.972e24;
const PHYS_STEP = 3600 * 6;        // paso máximo de integración (6 h)
const DAY = 86400;
const SOFT2 = 1e8 * 1e8;           // suavizado ε² (evita singularidad r→0)
const MAX_BODIES = 40;
const TRAIL_MAX = 600;

// a (AU), e, longitud del perihelio (grados), masa (kg), color, punto (px).
// collR = radio de colisión en metros (inflado adrede para que las fusiones
// sean observables; ver nota de cabecera).
const PLANETS = [
  { name: 'Mercurio', a: 0.387, e: 0.2056, peri: 77,  mass: 3.301e23, color: '#cdb9a5', dot: 3.0, collR: 3e9 },
  { name: 'Venus',    a: 0.723, e: 0.0068, peri: 131, mass: 4.867e24, color: '#e8c46a', dot: 4.2, collR: 3e9 },
  { name: 'Tierra',   a: 1.000, e: 0.0167, peri: 103, mass: 5.972e24, color: '#5f9bff', dot: 4.4, collR: 3e9 },
  { name: 'Marte',    a: 1.524, e: 0.0934, peri: 336, mass: 6.417e23, color: '#ff7a55', dot: 3.6, collR: 3e9 },
  { name: 'Júpiter',  a: 5.203, e: 0.0489, peri: 14,  mass: 1.898e27, color: '#e2b07f', dot: 8.0, collR: 6e9 },
  { name: 'Saturno',  a: 9.537, e: 0.0565, peri: 93,  mass: 5.683e26, color: '#e8d6a0', dot: 7.0, collR: 6e9, ring: true },
  { name: 'Urano',    a: 19.19, e: 0.0472, peri: 173, mass: 8.681e25, color: '#9fd9e8', dot: 5.6, collR: 6e9 },
  { name: 'Neptuno',  a: 30.07, e: 0.0086, peri: 48,  mass: 1.024e26, color: '#7292ff', dot: 5.6, collR: 6e9 },
];

const SPAWN_TYPES = {
  planet: { label: 'Planeta', mass: M_EARTH,   color: '#6fb2ff', dot: 4.4, collR: 3e9 },
  comet:  { label: 'Cometa',  mass: 2.2e14,    color: '#aaddff', dot: 2.6, collR: 1.5e9 },
  star:   { label: 'Estrella', mass: 0.5 * M_SUN, color: '#ffd9a0', dot: 9.0, collR: 2.8e10 },
};

const CSS = `
.map2d-btn{position:fixed;right:18px;top:172px;z-index:40;background:rgba(6,14,24,.82);
  border:1px solid rgba(126,224,255,.45);color:#cfeeff;font:600 11px/1 'Segoe UI',system-ui,sans-serif;
  letter-spacing:.14em;padding:10px 14px;border-radius:8px;cursor:pointer;backdrop-filter:blur(6px);}
.map2d-btn:hover{background:rgba(18,40,60,.9);border-color:#7ee0ff;}
.is-hud-collapsed .map2d-btn{display:none;}
.map2d{position:fixed;inset:0;z-index:75;background:#02060e;display:flex;flex-direction:column;}
.map2d.hidden{display:none;}
.map2d__head{display:flex;align-items:center;gap:12px;padding:8px 16px;
  border-bottom:1px solid rgba(126,224,255,.22);background:rgba(4,10,18,.9);flex-wrap:wrap;}
.map2d__title{color:#eaf6ff;font:700 13px/1.2 'Segoe UI',system-ui,sans-serif;letter-spacing:.16em;}
.map2d__sub{color:#7fa8c2;font:400 11px/1.2 'Segoe UI',system-ui,sans-serif;letter-spacing:.06em;}
.map2d__spacer{flex:1;}
.map2d__group{display:flex;gap:4px;align-items:center;}
.map2d__group span{color:#7fa8c2;font:600 10px/1 sans-serif;letter-spacing:.12em;margin-right:4px;}
.map2d__group button{background:rgba(10,22,36,.9);border:1px solid rgba(126,224,255,.3);color:#a8d8ef;
  font:600 11px/1 sans-serif;padding:7px 10px;border-radius:6px;cursor:pointer;}
.map2d__group button.on{background:rgba(35,90,120,.95);border-color:#7ee0ff;color:#eaffff;}
.map2d__group button.warn{border-color:rgba(255,170,120,.45);color:#ffcbaa;}
.map2d__close{background:none;border:1px solid rgba(255,120,120,.4);color:#ffb0b0;font:700 13px/1 sans-serif;
  width:32px;height:32px;border-radius:8px;cursor:pointer;}
.map2d__close:hover{background:rgba(90,20,20,.5);}
.map2d__stage{position:relative;flex:1;min-height:0;}
.map2d__canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none;}
.map2d__canvas:active{cursor:grabbing;}
.map2d__canvas.tool{cursor:crosshair;}
.map2d__foot{display:flex;gap:14px;align-items:center;padding:8px 16px;flex-wrap:wrap;
  border-top:1px solid rgba(126,224,255,.22);background:rgba(4,10,18,.9);
  color:#9fc3d8;font:400 11px/1.3 'Segoe UI',system-ui,sans-serif;}
.map2d__foot b{color:#dff2ff;font-weight:600;}
.map2d__chip{display:inline-flex;align-items:center;gap:6px;}
.map2d__chip i{width:14px;height:3px;border-radius:2px;display:inline-block;}
.map2d__tgl{background:rgba(10,22,36,.9);border:1px solid rgba(126,224,255,.25);color:#7fa8c2;
  font:600 10px/1 sans-serif;letter-spacing:.1em;padding:6px 9px;border-radius:6px;cursor:pointer;}
.map2d__tgl.on{color:#dffaff;border-color:rgba(126,224,255,.6);background:rgba(25,60,85,.9);}
.map2d__insp{position:absolute;right:14px;top:14px;width:250px;padding:14px;border-radius:10px;
  background:rgba(5,12,22,.94);border:1px solid rgba(126,224,255,.35);backdrop-filter:blur(8px);
  color:#cfe6f5;font:400 11px/1.5 'Segoe UI',system-ui,sans-serif;}
.map2d__insp.hidden{display:none;}
.map2d__insp h3{margin:0 0 2px;color:#eaf6ff;font:700 14px/1.2 sans-serif;letter-spacing:.1em;}
.map2d__insp .tp{color:#7fa8c2;font-size:10px;letter-spacing:.16em;margin-bottom:8px;}
.map2d__insp table{width:100%;border-collapse:collapse;}
.map2d__insp td{padding:2px 0;vertical-align:top;}
.map2d__insp td:first-child{color:#7fa8c2;padding-right:8px;white-space:nowrap;}
.map2d__insp td:last-child{color:#e6f4ff;text-align:right;font-family:ui-monospace,monospace;font-size:10.5px;}
.map2d__insp .row{display:flex;gap:6px;margin-top:10px;}
.map2d__insp .row button{flex:1;background:rgba(10,22,36,.9);border:1px solid rgba(126,224,255,.3);
  color:#a8d8ef;font:600 10px/1 sans-serif;padding:7px 4px;border-radius:6px;cursor:pointer;}
.map2d__insp .row button.on{background:rgba(35,90,120,.95);color:#eaffff;}
.map2d__insp .row button.del{border-color:rgba(255,120,120,.4);color:#ffb0b0;}
.map2d__inspclose{position:absolute;right:8px;top:8px;background:none;border:none;color:#7fa8c2;
  font:700 14px/1 sans-serif;cursor:pointer;}
`;

export class SystemMap2D {
  constructor() {
    this.visible = false;
    this.paused = false;
    this.timeMult = 1;
    this.integrator = 'leapfrog';   // 'leapfrog' | 'euler'
    this.elapsedDays = 0;
    this.zoom = 1;
    this.panX = 0; this.panY = 0;
    this.onToggle = null;

    this.layers = { orbits: true, vectors: true, trails: true, bary: false };
    this.tool = null;               // 'planet' | 'comet' | 'star' | null
    this.selected = null;
    this.followBody = null;
    this.launch = null;             // {x0,y0 (AU), sx,sy, dxPx,dyPx, v, preview:[]}
    this.fx = [];                   // efectos de fusión {x,y (AU), t, text}
    this.spawnCount = 0;

    this.bodies = this.buildInitialBodies();

    this.stars = Array.from({ length: 130 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.1 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
    this.t = 0;

    this.buildDom();
  }

  // ---------- estado inicial ----------

  buildInitialBodies() {
    const bodies = [{
      name: 'Sol', type: 'star', mass: M_SUN, color: '#ffd27f', dot: 7,
      collR: 2.8e10, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, trail: [],
    }];
    for (const p of PLANETS) {
      const w = p.peri * Math.PI / 180;
      const rp = p.a * (1 - p.e) * AU;
      const vp = Math.sqrt(G * M_SUN * (1 + p.e) / (p.a * AU * (1 - p.e)));
      const path = [];
      for (let i = 0; i <= 180; i++) {
        const nu = i / 180 * Math.PI * 2;
        const r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(nu));
        path.push([r * Math.cos(nu + w), r * Math.sin(nu + w)]);
      }
      bodies.push({
        name: p.name, type: 'planet', mass: p.mass, color: p.color, dot: p.dot,
        ring: p.ring, collR: p.collR, path,
        x: rp * Math.cos(w), y: rp * Math.sin(w),
        vx: -vp * Math.sin(w), vy: vp * Math.cos(w),
        ax: 0, ay: 0, trail: [],
      });
    }
    // Momento total a cero: sin esto el sistema entero deriva lentamente
    // (el Sol arranca quieto pero recibe el tirón de todos los planetas).
    let px = 0, py = 0, M = 0;
    for (const b of bodies) { px += b.mass * b.vx; py += b.mass * b.vy; M += b.mass; }
    for (const b of bodies) { b.vx -= px / M; b.vy -= py / M; }
    this.computeAccels(bodies);
    return bodies;
  }

  reset() {
    this.bodies = this.buildInitialBodies();
    this.selected = null;
    this.followBody = null;
    this.launch = null;
    this.fx = [];
    this.elapsedDays = 0;
    this.spawnCount = 0;
    this.inspEl.classList.add('hidden');
  }

  // ---------- física N-body ----------

  // Aceleración de cada cuerpo por atracción de TODOS los demás:
  // a_i = Σ_j G·m_j·(r_j−r_i)/(|r_j−r_i|²+ε²)^(3/2)
  computeAccels(bodies) {
    for (const b of bodies) { b.ax = 0; b.ay = 0; }
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d2 = dx * dx + dy * dy + SOFT2;
        const inv = 1 / (d2 * Math.sqrt(d2));
        const fA = G * B.mass * inv, fB = G * A.mass * inv;
        A.ax += fA * dx; A.ay += fA * dy;
        B.ax -= fB * dx; B.ay -= fB * dy;
      }
    }
  }

  step(h) {
    const bodies = this.bodies;
    if (this.integrator === 'leapfrog') {
      // KDK (kick-drift-kick), simpléctico: media patada con a(t) cacheada,
      // deriva, recálculo de aceleraciones y media patada final.
      for (const b of bodies) { b.vx += b.ax * h / 2; b.vy += b.ay * h / 2; }
      for (const b of bodies) { b.x += b.vx * h; b.y += b.vy * h; }
      this.computeAccels(bodies);
      for (const b of bodies) { b.vx += b.ax * h / 2; b.vy += b.ay * h / 2; }
    } else {
      // Euler semi-implícito (el mismo de la tarea y de la vista 3D)
      this.computeAccels(bodies);
      for (const b of bodies) {
        b.vx += b.ax * h; b.vy += b.ay * h;
        b.x += b.vx * h; b.y += b.vy * h;
      }
    }
  }

  // Fusión por conservación del momento: m·v se suma, el volumen también
  // (el radio visual crece como cbrt) y sobrevive el nombre del más masivo.
  // Tras cada fusión se reinicia el barrido completo: es O(n²) otra vez, pero
  // las colisiones son rarísimas y n ≤ 40, y así no hay índices colgando
  // sobre una lista recién mutada.
  handleCollisions() {
    const bodies = this.bodies;
    let merged = true;
    while (merged) {
      merged = false;
      outer:
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const A = bodies[i], B = bodies[j];
          const dx = B.x - A.x, dy = B.y - A.y;
          const rr = A.collR + B.collR;
          if (dx * dx + dy * dy > rr * rr) continue;

          const [big, small] = A.mass >= B.mass ? [A, B] : [B, A];
          const m = A.mass + B.mass;
          big.vx = (A.mass * A.vx + B.mass * B.vx) / m;
          big.vy = (A.mass * A.vy + B.mass * B.vy) / m;
          big.x = (A.mass * A.x + B.mass * B.x) / m;
          big.y = (A.mass * A.y + B.mass * B.y) / m;
          big.mass = m;
          big.dot = Math.min(26, Math.cbrt(big.dot ** 3 + small.dot ** 3));
          big.collR = Math.cbrt(big.collR ** 3 + small.collR ** 3);
          big.path = null;   // su órbita teórica ya no vale: que hable la traza

          this.fx.push({ x: big.x / AU, y: big.y / AU, t: 0, text: `${A.name} + ${B.name}` });
          if (this.selected === small) this.selected = big;
          if (this.followBody === small) this.followBody = big;
          bodies.splice(bodies.indexOf(small), 1);
          this.computeAccels(bodies);
          merged = true;
          break outer;
        }
      }
    }
  }

  central() {
    let c = this.bodies[0];
    for (const b of this.bodies) if (b.mass > (c?.mass || 0)) c = b;
    return c || null;
  }

  // ---------- DOM / UI ----------

  buildDom() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.btn = document.createElement('button');
    this.btn.className = 'map2d-btn hidden';
    this.btn.textContent = '🗺 MAPA 2D A ESCALA';
    this.btn.title = 'Vista 2D del sistema completo (tecla M / R3)';
    this.btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.btn);

    this.root = document.createElement('div');
    this.root.className = 'map2d hidden';
    this.root.innerHTML = `
      <div class="map2d__head">
        <div>
          <div class="map2d__title">MAPA 2D — SISTEMA SOLAR A ESCALA</div>
          <div class="map2d__sub">N-body real: todos los cuerpos se atraen entre sí · F = G·m·m/r²</div>
        </div>
        <div class="map2d__spacer"></div>
        <div class="map2d__group">
          <span>VISTA</span>
          <button data-fit="inner">INTERIOR</button>
          <button data-fit="full" class="on">COMPLETO</button>
        </div>
        <div class="map2d__group">
          <span>TIEMPO</span>
          <button data-pause title="Pausa (Espacio)">❚❚</button>
          <button data-mult="1" class="on">×1</button>
          <button data-mult="10">×10</button>
          <button data-mult="100">×100</button>
          <button data-mult="1000">×1000</button>
        </div>
        <div class="map2d__group">
          <span>AÑADIR</span>
          <button data-tool="planet">PLANETA</button>
          <button data-tool="comet">COMETA</button>
          <button data-tool="star">ESTRELLA</button>
        </div>
        <div class="map2d__group">
          <button data-integ title="Leapfrog conserva mejor la energía; Euler es el de la tarea">LEAPFROG</button>
          <button data-reset class="warn" title="Restaurar los 8 planetas">REINICIAR</button>
        </div>
        <button class="map2d__close" title="Cerrar (M / Esc)">×</button>
      </div>
      <div class="map2d__stage">
        <canvas class="map2d__canvas"></canvas>
        <div class="map2d__insp hidden">
          <button class="map2d__inspclose">×</button>
          <h3 data-i="name"></h3>
          <div class="tp" data-i="type"></div>
          <table>
            <tr><td>Masa</td><td data-i="mass"></td></tr>
            <tr><td>Distancia r</td><td data-i="r"></td></tr>
            <tr><td>Rapidez |v|</td><td data-i="v"></td></tr>
            <tr><td>Aceleración |a|</td><td data-i="a"></td></tr>
            <tr><td>Fuerza F</td><td data-i="F"></td></tr>
            <tr><td>Energía ε</td><td data-i="eps"></td></tr>
            <tr><td>Excentricidad e</td><td data-i="ecc"></td></tr>
            <tr><td>Órbita</td><td data-i="orbit"></td></tr>
            <tr><td>Periodo T</td><td data-i="T"></td></tr>
          </table>
          <div class="row">
            <button data-i="m10" title="Multiplicar la masa ×10">MASA ×10</button>
            <button data-i="d10" title="Dividir la masa ÷10">MASA ÷10</button>
          </div>
          <div class="row">
            <button data-i="follow">SEGUIR</button>
            <button data-i="del" class="del">BORRAR</button>
          </div>
        </div>
      </div>
      <div class="map2d__foot">
        <span class="map2d__chip"><i style="background:#57ff8f"></i> velocidad</span>
        <span class="map2d__chip"><i style="background:#ff5a5a"></i> aceleración</span>
        <button class="map2d__tgl on" data-t="orbits">ÓRBITAS</button>
        <button class="map2d__tgl on" data-t="trails">TRAZAS</button>
        <button class="map2d__tgl on" data-t="vectors">VECTORES</button>
        <button class="map2d__tgl" data-t="bary">BARICENTRO</button>
        <span>t = <b data-t-label>0 días</b></span>
        <span><b data-n-label>9</b> cuerpos</span>
        <span class="map2d__spacer"></span>
        <span>Arrastra con AÑADIR activo para lanzar un cuerpo · Clic: inspeccionar · Rueda: zoom</span>
      </div>`;
    document.body.appendChild(this.root);

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tLabel = this.root.querySelector('[data-t-label]');
    this.nLabel = this.root.querySelector('[data-n-label]');
    this.inspEl = this.root.querySelector('.map2d__insp');
    this.insp = {};
    this.inspEl.querySelectorAll('[data-i]').forEach(el => this.insp[el.dataset.i] = el);

    this.root.querySelector('.map2d__close').addEventListener('click', () => this.hide());
    this.root.querySelector('.map2d__inspclose').addEventListener('click', () => {
      this.selected = null; this.inspEl.classList.add('hidden');
    });

    // — controles de cabecera —
    this.root.querySelectorAll('[data-mult]').forEach(b => b.addEventListener('click', () => {
      this.timeMult = Number(b.dataset.mult);
      this.root.querySelectorAll('[data-mult]').forEach(x => x.classList.toggle('on', x === b));
    }));
    this.root.querySelectorAll('[data-fit]').forEach(b => b.addEventListener('click', () => {
      this.followBody = null;
      this.fitTo(b.dataset.fit === 'inner' ? 2.0 : 31.5);
      this.root.querySelectorAll('[data-fit]').forEach(x => x.classList.toggle('on', x === b));
    }));
    this.pauseBtn = this.root.querySelector('[data-pause]');
    this.pauseBtn.addEventListener('click', () => this.setPaused(!this.paused));
    this.integBtn = this.root.querySelector('[data-integ]');
    this.integBtn.addEventListener('click', () => {
      this.integrator = this.integrator === 'leapfrog' ? 'euler' : 'leapfrog';
      this.integBtn.textContent = this.integrator.toUpperCase();
      this.computeAccels(this.bodies);
    });
    this.root.querySelector('[data-reset]').addEventListener('click', () => this.reset());
    this.toolBtns = [...this.root.querySelectorAll('[data-tool]')];
    this.toolBtns.forEach(b => b.addEventListener('click', () => {
      this.setTool(this.tool === b.dataset.tool ? null : b.dataset.tool);
    }));

    // — chips del pie —
    this.root.querySelectorAll('[data-t]').forEach(b => {
      if (!b.dataset.t) return;
      b.addEventListener('click', () => {
        this.layers[b.dataset.t] = !this.layers[b.dataset.t];
        b.classList.toggle('on', this.layers[b.dataset.t]);
      });
    });

    // — inspector —
    this.insp.m10.addEventListener('click', () => this.scaleMass(10));
    this.insp.d10.addEventListener('click', () => this.scaleMass(0.1));
    this.insp.follow.addEventListener('click', () => {
      this.followBody = this.followBody === this.selected ? null : this.selected;
    });
    this.insp.del.addEventListener('click', () => {
      if (!this.selected) return;
      const i = this.bodies.indexOf(this.selected);
      if (i >= 0) this.bodies.splice(i, 1);
      if (this.followBody === this.selected) this.followBody = null;
      this.selected = null;
      this.inspEl.classList.add('hidden');
      this.computeAccels(this.bodies);
    });

    this.bindPointer();

    document.addEventListener('keydown', e => {
      if (!this.visible) return;
      if (e.code === 'Escape') {
        if (this.tool) this.setTool(null);
        else if (this.selected) { this.selected = null; this.inspEl.classList.add('hidden'); }
        else this.hide();
      }
      if (e.code === 'Space') { e.preventDefault(); this.setPaused(!this.paused); }
    });
    window.addEventListener('resize', () => { if (this.visible) this.resize(); });
  }

  setPaused(p) {
    this.paused = p;
    this.pauseBtn.textContent = p ? '▶' : '❚❚';
    this.pauseBtn.classList.toggle('on', p);
  }

  setTool(t) {
    this.tool = t;
    this.launch = null;
    this.toolBtns.forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    this.canvas.classList.toggle('tool', !!t);
  }

  scaleMass(f) {
    const b = this.selected;
    if (!b) return;
    b.mass *= f;
    b.dot = Math.min(26, Math.max(2, b.dot * Math.cbrt(f) ** 0.5));
    b.collR *= Math.cbrt(f);
    b.path = null;               // su órbita teórica de 2 cuerpos ya no aplica
    this.computeAccels(this.bodies);
  }

  // ---------- puntero: seleccionar / pan / lanzar ----------

  bindPointer() {
    let start = null, mode = null;
    this.canvas.addEventListener('pointerdown', e => {
      const r = this.canvas.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (this.tool) {
        mode = 'launch';
        this.launch = {
          x0: this.wx(start.x), y0: this.wy(start.y),
          sx: start.x, sy: start.y, dx: 0, dy: 0, v: 0, preview: [],
        };
        this.updateLaunchPreview();
      } else {
        mode = 'maybe-pan';
      }
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!start) return;
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (mode === 'launch' && this.launch) {
        this.launch.dx = x - this.launch.sx;
        this.launch.dy = y - this.launch.sy;
        this.updateLaunchPreview();
      } else if (mode === 'maybe-pan' && Math.hypot(x - start.x, y - start.y) > 5) {
        mode = 'pan';
        this.followBody = null;
      }
      if (mode === 'pan') {
        this.panX += x - start.x;
        this.panY += y - start.y;
        start = { x, y };
      }
    });
    this.canvas.addEventListener('pointerup', e => {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (mode === 'launch' && this.launch) {
        this.spawnFromLaunch();
      } else if (mode === 'maybe-pan') {
        this.selectAt(x, y);
      }
      start = null; mode = null; this.launch = null;
    });

    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1 / 1.14 : 1.14;
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2 - this.panX;
      const my = e.clientY - r.top - r.height / 2 - this.panY;
      this.panX -= mx * (f - 1);
      this.panY -= my * (f - 1);
      this.zoom *= f;
    }, { passive: false });
  }

  selectAt(sx, sy) {
    let best = null, bestD = 1e9;
    for (const b of this.bodies) {
      const d = Math.hypot(this.sx(b.x / AU) - sx, this.sy(b.y / AU) - sy);
      if (d < Math.max(12, b.dot + 6) && d < bestD) { best = b; bestD = d; }
    }
    this.selected = best;
    this.inspEl.classList.toggle('hidden', !best);
  }

  // La velocidad de lanzamiento se fija en PANTALLA (px de arrastre → km/s):
  // así el gesto se siente igual en cualquier zoom, como en Universe Sandbox.
  launchVelocity() {
    const L = this.launch;
    const px = Math.hypot(L.dx, L.dy);
    const v = Math.min(px * 0.35, 300) * 1000;         // m/s (tope 300 km/s)
    const m = px || 1;
    return { vx: L.dx / m * v, vy: -L.dy / m * v, v }; // y de pantalla invertida
  }

  // Predicción de trayectoria: partícula de prueba integrada contra los
  // cuerpos actuales CONGELADOS (suficiente para ver elipse/parábola/hipérbola).
  updateLaunchPreview() {
    const L = this.launch;
    const { vx, vy, v } = this.launchVelocity();
    L.v = v;
    let x = L.x0 * AU, y = L.y0 * AU, pvx = vx, pvy = vy;
    const h = PHYS_STEP * 8;
    const pts = [];
    for (let i = 0; i < 1200; i++) {
      let ax = 0, ay = 0;
      for (const b of this.bodies) {
        const dx = b.x - x, dy = b.y - y;
        const d2 = dx * dx + dy * dy + SOFT2;
        const inv = G * b.mass / (d2 * Math.sqrt(d2));
        ax += inv * dx; ay += inv * dy;
      }
      pvx += ax * h; pvy += ay * h;
      x += pvx * h; y += pvy * h;
      if (i % 4 === 0) pts.push([x / AU, y / AU]);
      if (x * x + y * y > (45 * AU) ** 2) break;
      let hit = false;
      for (const b of this.bodies) {
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < b.collR * b.collR) { hit = true; break; }
      }
      if (hit) { L.impact = [x / AU, y / AU]; break; }
      L.impact = null;
    }
    L.preview = pts;
  }

  spawnFromLaunch() {
    if (this.bodies.length >= MAX_BODIES) return;
    const spec = SPAWN_TYPES[this.tool];
    const { vx, vy } = this.launchVelocity();
    this.spawnCount++;
    this.bodies.push({
      name: `${spec.label} ${this.spawnCount}`, type: this.tool,
      mass: spec.mass, color: spec.color, dot: spec.dot, collR: spec.collR,
      x: this.launch.x0 * AU, y: this.launch.y0 * AU,
      vx, vy, ax: 0, ay: 0, trail: [],
    });
    this.computeAccels(this.bodies);
  }

  // ---------- ciclo de vida ----------

  setButtonVisible(v) { this.btn.classList.toggle('hidden', !v); }
  toggle() { this.visible ? this.hide() : this.show(); }

  show() {
    this.visible = true;
    this.root.classList.remove('hidden');
    this.resize();
    this.fitTo(31.5);
    this.onToggle?.(true);
  }

  hide() {
    this.visible = false;
    this.root.classList.add('hidden');
    this.setTool(null);
    this.onToggle?.(false);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
  }

  fitTo(radiusAU) {
    this.zoom = Math.min(this.w, this.h) * 0.46 / radiusAU;
    this.panX = 0; this.panY = 0;
  }

  // mundo (AU, y hacia el norte) ↔ pantalla (px, y hacia abajo)
  sx(xAU) { return this.w / 2 + this.panX + xAU * this.zoom; }
  sy(yAU) { return this.h / 2 + this.panY - yAU * this.zoom; }
  wx(sxPx) { return (sxPx - this.w / 2 - this.panX) / this.zoom; }
  wy(syPx) { return -(syPx - this.h / 2 - this.panY) / this.zoom; }

  // ---------- bucle ----------

  update(dt, timeScale) {
    if (!this.visible || !this.w) return;
    this.t += dt;
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < 1.1);

    if (!this.paused && this.bodies.length) {
      // Mismo convenio que la vista 3D: a 1× un segundo real = un día simulado.
      const simDt = Math.min(dt, 0.1) * DAY * (timeScale || 1) * this.timeMult;
      this.elapsedDays += simDt / DAY;
      const steps = Math.min(600, Math.max(1, Math.ceil(simDt / PHYS_STEP)));
      const h = simDt / steps;
      for (let s = 0; s < steps; s++) this.step(h);
      this.handleCollisions();

      this.trailTick = (this.trailTick || 0) + 1;
      if (this.trailTick % 4 === 0) {
        for (const b of this.bodies) {
          b.trail.push(b.x / AU, b.y / AU);
          if (b.trail.length > TRAIL_MAX * 2) b.trail.splice(0, 2);
        }
      }
    }

    if (this.followBody) {
      this.panX = -this.followBody.x / AU * this.zoom;
      this.panY = this.followBody.y / AU * this.zoom;
    }

    this.draw();
    this.updateInspector();
    const d = this.elapsedDays;
    this.tLabel.textContent = d < 365
      ? `${d.toFixed(0)} días`
      : `${d.toFixed(0)} días (${(d / 365.25).toFixed(1)} años)`;
    this.nLabel.textContent = this.bodies.length;
  }

  // ---------- inspector ----------

  updateInspector() {
    const b = this.selected;
    if (!b || this.inspEl.classList.contains('hidden')) return;
    const c = this.central();
    const I = this.insp;
    I.name.textContent = b.name;
    I.type.textContent = ({ star: 'ESTRELLA', planet: 'PLANETA', comet: 'COMETA' })[b.type] || 'CUERPO';
    I.mass.textContent = this.fmtMass(b.mass);
    I.a.textContent = `${Math.hypot(b.ax, b.ay).toExponential(2)} m/s²`;
    I.follow.classList.toggle('on', this.followBody === b);

    if (c && c !== b) {
      // Datos orbitales respecto al cuerpo más masivo (normalmente el Sol)
      const rx = b.x - c.x, ry = b.y - c.y;
      const vx = b.vx - c.vx, vy = b.vy - c.vy;
      const r = Math.hypot(rx, ry), v = Math.hypot(vx, vy);
      const mu = G * (c.mass + b.mass);
      const eps = v * v / 2 - mu / r;                    // energía específica
      const rv = rx * vx + ry * vy;
      const ex = ((v * v - mu / r) * rx - rv * vx) / mu; // vector excentricidad
      const ey = ((v * v - mu / r) * ry - rv * vy) / mu;
      const ecc = Math.hypot(ex, ey);
      const F = G * c.mass * b.mass / (r * r);

      I.r.textContent = `${(r / AU).toFixed(3)} AU`;
      I.v.textContent = `${(v / 1000).toFixed(2)} km/s`;
      I.F.textContent = `${F.toExponential(2)} N`;
      I.eps.textContent = `${eps.toExponential(2)} J/kg`;
      I.ecc.textContent = ecc.toFixed(3);
      I.orbit.textContent = eps < 0
        ? (ecc < 0.01 ? 'circular (ligada)' : 'elíptica (ligada)')
        : (Math.abs(eps) < 1e6 ? 'parabólica' : 'hiperbólica (escape)');
      if (eps < 0) {
        const aOrb = -mu / (2 * eps);
        const T = 2 * Math.PI * Math.sqrt(aOrb ** 3 / mu) / DAY;
        I.T.textContent = T < 800 ? `${T.toFixed(1)} días` : `${(T / 365.25).toFixed(1)} años`;
      } else {
        I.T.textContent = '— (no vuelve)';
      }
    } else {
      I.r.textContent = I.v.textContent = I.F.textContent =
      I.eps.textContent = I.ecc.textContent = I.T.textContent = '—';
      I.orbit.textContent = 'cuerpo central';
    }
  }

  fmtMass(kg) {
    if (kg >= 0.05 * M_SUN) return `${(kg / M_SUN).toFixed(2)} M☉`;
    if (kg >= 0.001 * M_EARTH) return `${(kg / M_EARTH).toFixed(2)} M⊕`;
    return `${kg.toExponential(2)} kg`;
  }

  // ---------- dibujo ----------

  draw() {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    for (const s of this.stars) {
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 1.3 + s.tw));
      ctx.fillStyle = '#bcd6ff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const c = this.central();
    const cX = c ? this.sx(c.x / AU) : this.sx(0);
    const cY = c ? this.sy(c.y / AU) : this.sy(0);

    // Anillos de distancia (AU) centrados en el cuerpo central
    ctx.font = '10px sans-serif';
    for (const rAU of [1, 5, 10, 20, 30]) {
      const rPx = rAU * this.zoom;
      if (rPx < 8 || rPx > Math.max(w, h) * 1.5) continue;
      ctx.strokeStyle = 'rgba(110,160,200,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cX, cY, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(140,190,225,0.5)';
      ctx.fillText(`${rAU} AU`, cX + rPx * 0.7071 + 4, cY - rPx * 0.7071 - 4);
    }

    // Órbitas teóricas de 2 cuerpos (solo mientras el cuerpo siga "de fábrica")
    if (this.layers.orbits) {
      for (const b of this.bodies) {
        if (!b.path) continue;
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < b.path.length; i++) {
          const [px, py] = b.path[i];
          i === 0 ? ctx.moveTo(this.sx(px), this.sy(py)) : ctx.lineTo(this.sx(px), this.sy(py));
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Trazas (la trayectoria REAL integrada, con fundido hacia atrás)
    if (this.layers.trails) {
      for (const b of this.bodies) {
        const n = b.trail.length / 2;
        if (n < 2) continue;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.2;
        for (let i = 1; i < n; i++) {
          ctx.globalAlpha = 0.5 * (i / n);
          ctx.beginPath();
          ctx.moveTo(this.sx(b.trail[(i - 1) * 2]), this.sy(b.trail[(i - 1) * 2 + 1]));
          ctx.lineTo(this.sx(b.trail[i * 2]), this.sy(b.trail[i * 2 + 1]));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Baricentro del sistema (centro de masas)
    if (this.layers.bary && this.bodies.length) {
      let mx = 0, my = 0, M = 0;
      for (const b of this.bodies) { mx += b.mass * b.x; my += b.mass * b.y; M += b.mass; }
      const bx = this.sx(mx / M / AU), by = this.sy(my / M / AU);
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - 7, by); ctx.lineTo(bx + 7, by);
      ctx.moveTo(bx, by - 7); ctx.lineTo(bx, by + 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,224,138,0.8)';
      ctx.font = '9px sans-serif';
      ctx.fillText('baricentro', bx + 9, by - 5);
    }

    // Efectos de colisión: anillo expansivo + rótulo de la fusión
    for (const f of this.fx) {
      const px = this.sx(f.x), py = this.sy(f.y);
      const k = f.t / 1.1;
      ctx.strokeStyle = `rgba(255,210,140,${1 - k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6 + k * 70, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,235,190,${1 - k})`;
      ctx.font = '600 11px sans-serif';
      ctx.fillText(f.text, px + 12, py - 12);
    }

    // Cuerpos
    for (const b of this.bodies) {
      const xAU = b.x / AU, yAU = b.y / AU;
      const px = this.sx(xAU), py = this.sy(yAU);
      if (px < -80 || px > w + 80 || py < -80 || py > h + 80) continue;
      const isCentral = b === c;
      const rPx = Math.hypot(px - cX, py - cY);

      if (b.type === 'star') {
        const R = b.dot * 3.6 * (1 + Math.sin(this.t * 2.1) * 0.06);
        const halo = ctx.createRadialGradient(px, py, 0, px, py, R);
        halo.addColorStop(0, 'rgba(255,235,170,0.95)');
        halo.addColorStop(0.35, 'rgba(255,170,60,0.5)');
        halo.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
      } else {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, b.dot * 3.2);
        glow.addColorStop(0, b.color + 'aa');
        glow.addColorStop(1, b.color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(px, py, b.dot * 3.2, 0, Math.PI * 2); ctx.fill();
      }

      if (b.ring) {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(px, py, b.dot * 2.1, b.dot * 0.8, -0.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = b.type === 'star' ? '#fff3c8' : b.color;
      ctx.beginPath(); ctx.arc(px, py, b.dot, 0, Math.PI * 2); ctx.fill();

      if (b === this.selected) {
        ctx.strokeStyle = '#7ee0ff';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(px, py, b.dot + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Con distancias a escala los interiores caben en un puñado de píxeles
      // en la vista COMPLETO: si orbitan muy cerca del centro en pantalla se
      // omiten vectores y rótulos para no amontonar texto ilegible.
      if (!isCentral && rPx < 30) continue;

      if (this.layers.vectors && !isCentral) {
        const maxLen = Math.max(16, rPx * 0.6);
        const vk = Math.hypot(b.vx, b.vy) / 1000;
        this.arrow(px, py, b.vx, -b.vy, Math.min(10 + vk * 1.05, maxLen), '#57ff8f');
        // Aceleración NETA real (cacheada del integrador): con N-body incluye
        // las perturbaciones de los demás planetas, no solo el tirón del Sol.
        const am = Math.hypot(b.ax, b.ay);
        this.arrow(px, py, b.ax, -b.ay, Math.min(8 + 44 * Math.cbrt(am / 0.066), maxLen), '#ff5a5a');
      }

      ctx.fillStyle = '#e8f4ff';
      ctx.font = '600 11px sans-serif';
      ctx.fillText(b.name, px + b.dot + 5, py - 4);
      if (rPx > 90 || isCentral) {
        ctx.fillStyle = 'rgba(150,195,225,0.85)';
        ctx.font = '10px sans-serif';
        const vk = Math.hypot(b.vx, b.vy) / 1000;
        ctx.fillText(
          isCentral
            ? this.fmtMass(b.mass)
            : `${(Math.hypot(b.x - c.x, b.y - c.y) / AU).toFixed(2)} AU · ${vk.toFixed(1)} km/s`,
          px + b.dot + 5, py + 9
        );
      }
    }

    // Lanzamiento en curso: flecha de velocidad + trayectoria prevista
    if (this.launch) {
      const L = this.launch;
      const px = this.sx(L.x0), py = this.sy(L.y0);
      const spec = SPAWN_TYPES[this.tool] || SPAWN_TYPES.planet;

      if (L.preview.length > 1) {
        ctx.strokeStyle = 'rgba(126,224,255,0.7)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for (let i = 0; i < L.preview.length; i++) {
          const [ax, ay] = L.preview[i];
          i === 0 ? ctx.moveTo(this.sx(ax), this.sy(ay)) : ctx.lineTo(this.sx(ax), this.sy(ay));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (L.impact) {
          const ix = this.sx(L.impact[0]), iy = this.sy(L.impact[1]);
          ctx.strokeStyle = '#ff8a6a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ix - 6, iy - 6); ctx.lineTo(ix + 6, iy + 6);
          ctx.moveTo(ix + 6, iy - 6); ctx.lineTo(ix - 6, iy + 6);
          ctx.stroke();
        }
      }

      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.arc(px, py, spec.dot, 0, Math.PI * 2); ctx.fill();
      if (Math.hypot(L.dx, L.dy) > 3) {
        this.arrow(px, py, L.dx, L.dy, Math.hypot(L.dx, L.dy), '#7ee0ff');
      }
      ctx.fillStyle = '#dffaff';
      ctx.font = '600 11px sans-serif';
      ctx.fillText(`v = ${(L.v / 1000).toFixed(1)} km/s`, px + 12, py - 12);
    }
  }

  arrow(x, y, dx, dy, len, color) {
    const m = Math.hypot(dx, dy);
    if (m < 1e-12) return;
    const ux = dx / m, uy = dy / m;
    const ex = x + ux * len, ey = y + uy * len;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + ux * 6, ey + uy * 6);
    ctx.lineTo(ex - uy * 3.2, ey + ux * 3.2);
    ctx.lineTo(ex + uy * 3.2, ey - ux * 3.2);
    ctx.closePath(); ctx.fill();
  }
}
