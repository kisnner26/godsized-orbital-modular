// Mapa 2D del sistema solar A ESCALA (vista cenital tipo diagrama).
// Los 8 planetas se integran EN VIVO con la misma física que el cuerpo
// observado en 3D (F = G·M·m/r² + Euler semi-implícito) y las mismas
// constantes/convenio de tiempo (a 1× un segundo real ≈ un día simulado).
// Las DISTANCIAS son reales (AU): por eso los planetas interiores quedan
// apiñados junto al Sol y Neptuno lejísimos — ese vacío es el dato honesto
// que una vista "bonita" con órbitas comprimidas jamás enseña. Los tamaños
// de los puntos NO están a escala (a escala real serían subpíxeles).

const G = 6.67430e-11;
const AU = 1.496e11;
const M_SUN = 1.989e30;
const PHYS_STEP = 3600 * 6;        // mismo paso máximo que SolarSystem.js
const DAY = 86400;

// a (AU), e, longitud del perihelio (grados, aproximada — solo reparte los
// planetas por el plano con sus orientaciones reales de elipse), color, radio
// del punto en px, y radio real (km) para el rótulo.
const PLANETS = [
  { name: 'Mercurio', a: 0.387, e: 0.2056, peri: 77,  color: '#cdb9a5', dot: 3.0 },
  { name: 'Venus',    a: 0.723, e: 0.0068, peri: 131, color: '#e8c46a', dot: 4.2 },
  { name: 'Tierra',   a: 1.000, e: 0.0167, peri: 103, color: '#5f9bff', dot: 4.4 },
  { name: 'Marte',    a: 1.524, e: 0.0934, peri: 336, color: '#ff7a55', dot: 3.6 },
  { name: 'Júpiter',  a: 5.203, e: 0.0489, peri: 14,  color: '#e2b07f', dot: 8.0 },
  { name: 'Saturno',  a: 9.537, e: 0.0565, peri: 93,  color: '#e8d6a0', dot: 7.0, ring: true },
  { name: 'Urano',    a: 19.19, e: 0.0472, peri: 173, color: '#9fd9e8', dot: 5.6 },
  { name: 'Neptuno',  a: 30.07, e: 0.0086, peri: 48,  color: '#7292ff', dot: 5.6 },
];

const CSS = `
.map2d-btn{position:fixed;right:18px;top:172px;z-index:40;background:rgba(6,14,24,.82);
  border:1px solid rgba(126,224,255,.45);color:#cfeeff;font:600 11px/1 'Segoe UI',system-ui,sans-serif;
  letter-spacing:.14em;padding:10px 14px;border-radius:8px;cursor:pointer;backdrop-filter:blur(6px);}
.map2d-btn:hover{background:rgba(18,40,60,.9);border-color:#7ee0ff;}
.is-hud-collapsed .map2d-btn{display:none;}
.map2d{position:fixed;inset:0;z-index:75;background:#02060e;display:flex;flex-direction:column;}
.map2d.hidden{display:none;}
.map2d__head{display:flex;align-items:center;gap:14px;padding:10px 16px;
  border-bottom:1px solid rgba(126,224,255,.22);background:rgba(4,10,18,.9);flex-wrap:wrap;}
.map2d__title{color:#eaf6ff;font:700 13px/1.2 'Segoe UI',system-ui,sans-serif;letter-spacing:.16em;}
.map2d__sub{color:#7fa8c2;font:400 11px/1.2 'Segoe UI',system-ui,sans-serif;letter-spacing:.06em;}
.map2d__spacer{flex:1;}
.map2d__group{display:flex;gap:4px;align-items:center;}
.map2d__group span{color:#7fa8c2;font:600 10px/1 sans-serif;letter-spacing:.12em;margin-right:4px;}
.map2d__group button{background:rgba(10,22,36,.9);border:1px solid rgba(126,224,255,.3);color:#a8d8ef;
  font:600 11px/1 sans-serif;padding:7px 10px;border-radius:6px;cursor:pointer;}
.map2d__group button.on{background:rgba(35,90,120,.95);border-color:#7ee0ff;color:#eaffff;}
.map2d__close{background:none;border:1px solid rgba(255,120,120,.4);color:#ffb0b0;font:700 13px/1 sans-serif;
  width:32px;height:32px;border-radius:8px;cursor:pointer;}
.map2d__close:hover{background:rgba(90,20,20,.5);}
.map2d__canvas{flex:1;min-height:0;cursor:grab;touch-action:none;}
.map2d__canvas:active{cursor:grabbing;}
.map2d__foot{display:flex;gap:18px;align-items:center;padding:8px 16px;flex-wrap:wrap;
  border-top:1px solid rgba(126,224,255,.22);background:rgba(4,10,18,.9);
  color:#9fc3d8;font:400 11px/1.3 'Segoe UI',system-ui,sans-serif;}
.map2d__foot b{color:#dff2ff;font-weight:600;}
.map2d__chip{display:inline-flex;align-items:center;gap:6px;}
.map2d__chip i{width:14px;height:3px;border-radius:2px;display:inline-block;}
`;

export class SystemMap2D {
  constructor() {
    this.visible = false;
    this.timeMult = 1;          // multiplicador local (×1/×10/×100)
    this.elapsedDays = 0;
    this.zoom = 1;              // px por AU (se fija con fitTo)
    this.panX = 0; this.panY = 0;
    this.onToggle = null;       // aviso a main.js (narración)

    // Estado físico: SI (metros, m/s), plano XY, antihorario visto "desde el norte".
    this.bodies = PLANETS.map(p => {
      const w = p.peri * Math.PI / 180;
      const rp = p.a * (1 - p.e) * AU;                       // perihelio
      const vp = Math.sqrt(G * M_SUN * (1 + p.e) / (p.a * AU * (1 - p.e))); // vis-viva
      // Órbita analítica para dibujar la elipse real (en AU)
      const path = [];
      for (let i = 0; i <= 180; i++) {
        const nu = i / 180 * Math.PI * 2;
        const r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(nu));
        path.push([r * Math.cos(nu + w), r * Math.sin(nu + w)]);
      }
      return {
        ...p,
        x: rp * Math.cos(w), y: rp * Math.sin(w),
        vx: -vp * Math.sin(w), vy: vp * Math.cos(w),
        path,
      };
    });

    // Estrellas de fondo fijas en pantalla (decorativas, con parpadeo suave)
    this.stars = Array.from({ length: 130 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.1 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
    this.t = 0;

    this.buildDom();
  }

  buildDom() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.btn = document.createElement('button');
    this.btn.className = 'map2d-btn hidden';
    this.btn.textContent = '🗺 MAPA 2D A ESCALA';
    this.btn.title = 'Vista 2D del sistema completo (tecla 2 / R3)';
    this.btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.btn);

    this.root = document.createElement('div');
    this.root.className = 'map2d hidden';
    this.root.innerHTML = `
      <div class="map2d__head">
        <div>
          <div class="map2d__title">MAPA 2D — SISTEMA SOLAR A ESCALA</div>
          <div class="map2d__sub">Distancias reales en AU · los 8 planetas integrados en vivo con F = G·M·m/r²</div>
        </div>
        <div class="map2d__spacer"></div>
        <div class="map2d__group" data-g="zoom">
          <span>VISTA</span>
          <button data-fit="inner">INTERIOR</button>
          <button data-fit="full" class="on">COMPLETO</button>
        </div>
        <div class="map2d__group" data-g="time">
          <span>TIEMPO</span>
          <button data-mult="1" class="on">×1</button>
          <button data-mult="10">×10</button>
          <button data-mult="100">×100</button>
        </div>
        <button class="map2d__close" title="Cerrar (2 / Esc)">×</button>
      </div>
      <canvas class="map2d__canvas"></canvas>
      <div class="map2d__foot">
        <span class="map2d__chip"><i style="background:#57ff8f"></i> velocidad (km/s)</span>
        <span class="map2d__chip"><i style="background:#ff5a5a"></i> aceleración → Sol</span>
        <span class="map2d__chip"><i style="background:rgba(160,200,255,.5)"></i> órbita real (elipse)</span>
        <span>t = <b data-t>0 días</b></span>
        <span>1 AU = 149,6 millones de km</span>
        <span class="map2d__spacer"></span>
        <span>Rueda: zoom · Arrastrar: mover</span>
      </div>`;
    document.body.appendChild(this.root);

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tLabel = this.root.querySelector('[data-t]');
    this.root.querySelector('.map2d__close').addEventListener('click', () => this.hide());

    this.root.querySelectorAll('[data-mult]').forEach(b => b.addEventListener('click', () => {
      this.timeMult = Number(b.dataset.mult);
      this.root.querySelectorAll('[data-mult]').forEach(x => x.classList.toggle('on', x === b));
    }));
    this.root.querySelectorAll('[data-fit]').forEach(b => b.addEventListener('click', () => {
      this.fitTo(b.dataset.fit === 'inner' ? 2.0 : 31.5);
      this.root.querySelectorAll('[data-fit]').forEach(x => x.classList.toggle('on', x === b));
    }));

    // Zoom con rueda centrado en el cursor; arrastrar para desplazar.
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
    let drag = null;
    this.canvas.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      this.panX += e.clientX - drag.x;
      this.panY += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', () => { drag = null; });

    document.addEventListener('keydown', e => {
      if (this.visible && e.code === 'Escape') this.hide();
    });
    window.addEventListener('resize', () => { if (this.visible) this.resize(); });
  }

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

  // Ajusta el zoom para que quepa un radio dado en AU.
  fitTo(radiusAU) {
    this.zoom = Math.min(this.w, this.h) * 0.46 / radiusAU;
    this.panX = 0; this.panY = 0;
  }

  // mundo (AU, y hacia el norte) → pantalla (px, y hacia abajo)
  sx(xAU) { return this.w / 2 + this.panX + xAU * this.zoom; }
  sy(yAU) { return this.h / 2 + this.panY - yAU * this.zoom; }

  update(dt, timeScale) {
    if (!this.visible || !this.w) return;
    this.t += dt;

    // Mismo convenio que la vista 3D: a 1× un segundo real = un día simulado;
    // el deslizador de velocidad del sistema y el ×1/×10/×100 local multiplican.
    let simDt = Math.min(dt, 0.1) * DAY * (timeScale || 1) * this.timeMult;
    this.elapsedDays += simDt / DAY;
    let steps = Math.min(600, Math.ceil(simDt / PHYS_STEP));
    const h = simDt / steps;
    for (let s = 0; s < steps; s++) {
      for (const b of this.bodies) {
        const r2 = b.x * b.x + b.y * b.y;
        const r = Math.sqrt(r2);
        const a = G * M_SUN / r2;              // ley de gravitación universal
        b.vx += a * (-b.x / r) * h;            // 2ª ley de Newton (a = F/m)
        b.vy += a * (-b.y / r) * h;
        b.x += b.vx * h;                       // Euler semi-implícito
        b.y += b.vy * h;
      }
    }

    this.draw();
    const d = this.elapsedDays;
    this.tLabel.textContent = d < 365
      ? `${d.toFixed(0)} días`
      : `${d.toFixed(0)} días (${(d / 365.25).toFixed(1)} años)`;
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Fondo estrellado sutil con parpadeo
    for (const s of this.stars) {
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 1.3 + s.tw));
      ctx.fillStyle = '#bcd6ff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Anillos de distancia (AU) con etiqueta
    ctx.font = '10px sans-serif';
    for (const rAU of [1, 5, 10, 20, 30]) {
      const rPx = rAU * this.zoom;
      if (rPx < 8 || rPx > Math.max(w, h) * 1.5) continue;
      ctx.strokeStyle = 'rgba(110,160,200,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.sx(0), this.sy(0), rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(140,190,225,0.5)';
      ctx.fillText(`${rAU} AU`, this.sx(0) + rPx * 0.7071 + 4, this.sy(0) - rPx * 0.7071 - 4);
    }

    // Órbitas reales (elipses analíticas, teñidas por planeta)
    for (const b of this.bodies) {
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

    // Sol con halo pulsante
    const sunX = this.sx(0), sunY = this.sy(0);
    const pulse = 1 + Math.sin(this.t * 2.1) * 0.08;
    const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 26 * pulse);
    halo.addColorStop(0, 'rgba(255,235,170,0.95)');
    halo.addColorStop(0.35, 'rgba(255,170,60,0.5)');
    halo.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sunX, sunY, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c8';
    ctx.beginPath(); ctx.arc(sunX, sunY, 5, 0, Math.PI * 2); ctx.fill();

    // Planetas: punto + halo + anillo (Saturno) + vectores + rótulos.
    // Con distancias A ESCALA los 4 interiores caben en un puñado de píxeles
    // en la vista COMPLETO: si su órbita ocupa poco en pantalla se omiten
    // vectores y rótulos (solo el punto) para no amontonar texto ilegible —
    // la vista INTERIOR existe justo para estudiarlos con detalle.
    for (const b of this.bodies) {
      const xAU = b.x / AU, yAU = b.y / AU;
      const px = this.sx(xAU), py = this.sy(yAU);
      if (px < -60 || px > w + 60 || py < -60 || py > h + 60) continue;
      const rPx = Math.hypot(px - sunX, py - sunY);   // radio orbital en pantalla

      const glow = ctx.createRadialGradient(px, py, 0, px, py, b.dot * 3.2);
      glow.addColorStop(0, b.color + 'aa');
      glow.addColorStop(1, b.color + '00');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(px, py, b.dot * 3.2, 0, Math.PI * 2); ctx.fill();

      if (b.ring) {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(px, py, b.dot * 2.1, b.dot * 0.8, -0.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(px, py, b.dot, 0, Math.PI * 2); ctx.fill();

      if (rPx < 30) continue;                          // apiñado junto al Sol

      // Los vectores no deben cruzar medio sistema: tope relativo a la órbita.
      const maxLen = Math.max(16, rPx * 0.6);
      // Vector velocidad (verde, tangente): longitud ∝ rapidez real.
      const vk = Math.hypot(b.vx, b.vy) / 1000;        // km/s
      this.arrow(px, py, b.vx, -b.vy, Math.min(10 + vk * 1.05, maxLen), '#57ff8f');
      // Vector aceleración (rojo, siempre hacia el Sol): a = G·M/r² varía
      // ×10⁴ entre Mercurio y Neptuno, así que la longitud usa raíz cúbica
      // (escala comprimida) para que ambos extremos sigan siendo visibles.
      const r2 = b.x * b.x + b.y * b.y;
      const acc = G * M_SUN / r2;
      this.arrow(px, py, -b.x, b.y, Math.min(8 + 44 * Math.cbrt(acc / 0.066), maxLen), '#ff5a5a');

      ctx.fillStyle = '#e8f4ff';
      ctx.font = '600 11px sans-serif';
      ctx.fillText(b.name, px + b.dot + 5, py - 4);
      if (rPx > 90) {
        ctx.fillStyle = 'rgba(150,195,225,0.85)';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${Math.hypot(xAU, yAU).toFixed(2)} AU · ${vk.toFixed(1)} km/s`, px + b.dot + 5, py + 9);
      }
    }
  }

  // Flecha con punta desde (x,y) en la dirección (dx,dy) de pantalla.
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
