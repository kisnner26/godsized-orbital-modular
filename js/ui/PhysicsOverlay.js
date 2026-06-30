// Overlay físico-educativo: muestra dentro del simulador las ecuaciones del
// movimiento (gravitación universal + leyes de Newton) con valores en vivo,
// vectores y gráficos de la trayectoria observada.

const G = 6.67430e-11;
const M_SUN = 1.989e30;

function fmt(x, d = 2) {
  if (!isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-2 || a >= 1e5)) return x.toExponential(d);
  return x.toFixed(d);
}

export class PhysicsOverlay {
  constructor(solar) {
    this.solar = solar;
    this.el = document.getElementById('physics');
    this.title = document.getElementById('phTitle');
    this.orbit = document.getElementById('phOrbit');
    this.eqF = document.getElementById('eqF');
    this.eqA = document.getElementById('eqA');
    this.eqV = document.getElementById('eqV');
    this.eqR = document.getElementById('eqR');
    this.readR = document.getElementById('phR');
    this.readV = document.getElementById('phV');
    this.readA = document.getElementById('phA');
    this.readFv = document.getElementById('phFval');
    this.readE = document.getElementById('phE');
    this.canvas = document.getElementById('phGraph');
    this.ctx = this.canvas?.getContext('2d');

    this.history = [];      // { t, v, r }
    this.t = 0;
    this.acc = 0;
    this.visible = false;
  }

  show(label) {
    this.visible = true;
    this.history = [];
    this.t = 0;
    this.el?.classList.remove('hidden');
    if (this.title) this.title.textContent = label || 'CUERPO';
  }

  hide() {
    this.visible = false;
    this.el?.classList.add('hidden');
  }

  update(dt) {
    if (!this.visible) return;
    const s = this.solar.getPhysicsState();
    if (!s) return;

    this.t += dt;
    // Muestreo del historial para el gráfico (~20 Hz)
    this.acc += dt;
    if (this.acc >= 0.05) {
      this.acc = 0;
      this.history.push({ t: this.t, v: s.speedKms, r: s.rAU });
      if (this.history.length > 320) this.history.shift();
    }

    // ----- Ecuaciones con valores sustituidos -----
    const m = s.mass;
    const Mtxt = s.nAttractors > 1 ? `${fmt(s.M,2)}*` : fmt(s.M,2);  // * = masa total (binario)
    if (this.eqF) this.eqF.innerHTML =
      `F = G·M·m / r² = (6.674e-11)(${Mtxt})(${fmt(m,1)}) / (${fmt(s.r,2)})² = <b>${fmt(s.F,2)} N</b>`;
    if (this.eqA) this.eqA.innerHTML =
      `a = F / m = G·M / r² = <b>${fmt(s.aMag,3)} m/s²</b>  (hacia el Sol)`;
    if (this.eqV) this.eqV.innerHTML =
      `v = v₀ + a·Δt  →  |v| = <b>${fmt(s.speedKms,2)} km/s</b>`;
    if (this.eqR) this.eqR.innerHTML =
      `r = r₀ + v·Δt  →  |r| = <b>${fmt(s.rAU,3)} AU</b>`;

    // ----- Lecturas -----
    if (this.readR) this.readR.textContent = `${fmt(s.rAU,3)} AU`;
    if (this.readV) this.readV.textContent = `${fmt(s.speedKms,2)} km/s`;
    if (this.readA) this.readA.textContent = `${fmt(s.aMag,3)} m/s²`;
    if (this.readFv) this.readFv.textContent = `${fmt(s.F,2)} N`;
    if (this.readE) this.readE.textContent = `${fmt(s.eps,2)} J/kg`;
    if (this.orbit) this.orbit.textContent = `ÓRBITA ${s.orbit.toUpperCase()}`;

    this.drawGraph();
  }

  drawGraph() {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // marco
    ctx.strokeStyle = 'rgba(120,255,230,.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    // grid
    ctx.strokeStyle = 'rgba(120,255,230,.07)';
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (this.history.length < 2) return;
    const vs = this.history.map(h => h.v);
    const rs = this.history.map(h => h.r);
    const vMax = Math.max(...vs) * 1.1 || 1;
    const rMax = Math.max(...rs) * 1.1 || 1;
    const n = this.history.length;

    const line = (arr, max, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * (W - 2) + 1;
        const y = H - 2 - (arr[i] / max) * (H - 4);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    line(rs, rMax, 'rgba(95,200,255,.95)');   // distancia (cian)
    line(vs, vMax, 'rgba(95,255,150,.95)');   // velocidad (verde)
  }
}
