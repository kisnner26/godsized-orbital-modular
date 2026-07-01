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

// Datos físicos reales (no simulados): para los 8 planetas y el cometa son
// valores astronómicos medidos; para los 3 escenarios exóticos describen el
// objeto central real que da nombre a la escena (estrella masiva, púlsar o
// par binario), ya que el "cuerpo" simulado ahí es un planeta ficticio cuyo
// interés físico está en el astro que lo domina, no en él mismo.
const PLANET_FACTS = {
  'MERCURIO': { rows: [
    ['MASA', '3.30 × 10²³ kg'], ['RADIO', '2 440 km'], ['GRAVEDAD SUP.', '3.7 m/s²'],
    ['PERIODO ORBITAL', '88.0 días'], ['ROTACIÓN', '58.6 días'], ['LUNAS', '0'],
    ['TEMPERATURA', '-173°C a 167°C'], ['VEL. DE ESCAPE', '4.3 km/s']
  ], note: 'El planeta más pequeño del sistema solar; su núcleo metálico ocupa cerca del 85% de su radio total.' },
  'VENUS': { rows: [
    ['MASA', '4.87 × 10²⁴ kg'], ['RADIO', '6 052 km'], ['GRAVEDAD SUP.', '8.87 m/s²'],
    ['PERIODO ORBITAL', '224.7 días'], ['ROTACIÓN', '243 días (retrógrada)'], ['LUNAS', '0'],
    ['TEMPERATURA', '464°C (constante)'], ['VEL. DE ESCAPE', '10.36 km/s']
  ], note: 'Su atmósfera de CO₂ produce un efecto invernadero extremo: es el planeta más caliente, más que Mercurio.' },
  'TIERRA': { rows: [
    ['MASA', '5.97 × 10²⁴ kg'], ['RADIO', '6 371 km'], ['GRAVEDAD SUP.', '9.81 m/s²'],
    ['PERIODO ORBITAL', '365.25 días'], ['ROTACIÓN', '23.93 h'], ['LUNAS', '1'],
    ['TEMPERATURA', '15°C (media global)'], ['VEL. DE ESCAPE', '11.19 km/s']
  ], note: 'Único planeta conocido con agua líquida estable en superficie y tectónica de placas activa.' },
  'MARTE': { rows: [
    ['MASA', '6.42 × 10²³ kg'], ['RADIO', '3 390 km'], ['GRAVEDAD SUP.', '3.71 m/s²'],
    ['PERIODO ORBITAL', '687 días (1.88 años)'], ['ROTACIÓN', '24.6 h'], ['LUNAS', '2 (Fobos y Deimos)'],
    ['TEMPERATURA', '-63°C (media)'], ['VEL. DE ESCAPE', '5.03 km/s']
  ], note: 'El Monte Olimpo marciano es un volcán de ≈21 km de altura, el más alto del sistema solar.' },
  'JÚPITER': { rows: [
    ['MASA', '1.898 × 10²⁷ kg'], ['RADIO', '69 911 km'], ['GRAVEDAD SUP.', '24.79 m/s²'],
    ['PERIODO ORBITAL', '11.86 años'], ['ROTACIÓN', '9.93 h'], ['LUNAS', '95 confirmadas'],
    ['TEMPERATURA', '-108°C (cima de nubes)'], ['VEL. DE ESCAPE', '59.5 km/s']
  ], note: 'Su Gran Mancha Roja es una tormenta anticiclónica más grande que la Tierra, activa desde hace siglos.' },
  'SATURNO': { rows: [
    ['MASA', '5.68 × 10²⁶ kg'], ['RADIO', '58 232 km'], ['GRAVEDAD SUP.', '10.44 m/s²'],
    ['PERIODO ORBITAL', '29.5 años'], ['ROTACIÓN', '10.7 h'], ['LUNAS', '146 confirmadas'],
    ['TEMPERATURA', '-139°C'], ['VEL. DE ESCAPE', '35.5 km/s']
  ], note: 'Es el único planeta menos denso que el agua (0.69 g/cm³): flotaría en un océano lo bastante grande.' },
  'URANO': { rows: [
    ['MASA', '8.68 × 10²⁵ kg'], ['RADIO', '25 362 km'], ['GRAVEDAD SUP.', '8.69 m/s²'],
    ['PERIODO ORBITAL', '84.0 años'], ['ROTACIÓN', '17.2 h (retrógrada)'], ['LUNAS', '27'],
    ['TEMPERATURA', '-197°C'], ['VEL. DE ESCAPE', '21.3 km/s']
  ], note: 'Gira prácticamente acostado: su eje está inclinado 98° respecto al plano orbital.' },
  'NEPTUNO': { rows: [
    ['MASA', '1.024 × 10²⁶ kg'], ['RADIO', '24 622 km'], ['GRAVEDAD SUP.', '11.15 m/s²'],
    ['PERIODO ORBITAL', '164.8 años'], ['ROTACIÓN', '16.1 h'], ['LUNAS', '14'],
    ['TEMPERATURA', '-201°C'], ['VEL. DE ESCAPE', '23.5 km/s']
  ], note: 'Tiene los vientos más rápidos del sistema solar: ráfagas medidas de hasta 2 100 km/h.' },
  'COMETA': { rows: [
    ['MASA', '≈2.2 × 10¹⁴ kg'], ['NÚCLEO', '≈5-8 km (irregular)'], ['GRAVEDAD SUP.', '≈0.0001 m/s²'],
    ['PERIODO ORBITAL', 'variable (Halley: 76 años)'], ['COMPOSICIÓN', 'hielo + polvo ("bola de nieve sucia")'],
    ['VEL. DE ESCAPE', 'unos pocos m/s']
  ], note: 'El calor solar sublima su hielo y libera gas y polvo: así se forma la cola, siempre apuntando lejos del Sol.' },
  'ESTRELLA MASIVA': { rows: [
    ['MASA (ESTRELLA)', '12 M☉ ≈ 2.39 × 10³¹ kg'], ['RADIO (ESTRELLA)', '≈5.5 R☉ (≈3.8 millones km)'],
    ['GRAVEDAD SUP.', '≈800 m/s² (≈80 g terrestres)'], ['TIPO ESPECTRAL', 'O/B — azul, muy caliente y luminosa'],
    ['ESPERANZA DE VIDA', '≈15-20 millones de años'], ['DESTINO FINAL', 'supernova → estrella de neutrones o agujero negro']
  ], note: 'Cuanto más masiva es una estrella, más rápido agota su combustible: vive mucho menos que el Sol.' },
  'PÚLSAR': { rows: [
    ['MASA', '1.4 M☉ ≈ 2.8 × 10³⁰ kg'], ['RADIO', '≈10-12 km (el tamaño de una ciudad)'],
    ['DENSIDAD', '≈10¹⁷ kg/m³'], ['ROTACIÓN', 'milisegundos a segundos por vuelta'],
    ['CAMPO MAGNÉTICO', '≈10⁸ T (cientos de millones de veces el terrestre)'], ['ORIGEN', 'remanente colapsado de una supernova']
  ], note: 'Emite haces de radiación desde sus polos magnéticos; si barren la Tierra al girar, se detectan como pulsos regulares.' },
  'BINARIO': { rows: [
    ['MASA DE CADA ESTRELLA', '2 M☉ ≈ 4.0 × 10³⁰ kg'], ['SEPARACIÓN', '6 AU (≈898 millones km)'],
    ['TIPO DE SISTEMA', 'binario estelar (órbita mutua)'], ['FRECUENCIA EN LA GALAXIA', '≈50% de las estrellas tienen compañera'],
    ['EJEMPLO REAL', 'Alfa Centauri A/B']
  ], note: 'Cada estrella orbita el centro de masa común del par, igual que el planeta ficticio de esta escena orbita a ambas.' },
  'SOL': { rows: [
    ['MASA', '1.989 × 10³⁰ kg'], ['RADIO', '696 000 km'], ['GRAVEDAD SUP.', '274 m/s²'],
    ['PERIODO DE BAMBOLEO', '≈11.86 años (el de Júpiter)'], ['ROTACIÓN', '≈25-35 días (diferencial)'], ['PLANETAS', '8'],
    ['TEMPERATURA SUP.', '≈5 505°C'], ['VEL. DE ESCAPE', '617.5 km/s']
  ], note: 'El Sol tampoco está quieto: la gravedad conjunta de los planetas, sobre todo Júpiter, lo desplaza en un pequeño círculo de radio similar al suyo propio alrededor del centro de masa del sistema solar.' }
};

// A qué apunta el vector de aceleración/fuerza según el escenario (el texto
// "hacia el Sol" sería incorrecto o confuso, p. ej., al observar el propio Sol).
const ATTRACTOR_LABEL = {
  solar: 'el Sol', massive: 'la estrella masiva', pulsar: 'el púlsar',
  sunwobble: 'Júpiter', binary: 'el centro de masa'
};

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
    this.factsGrid = document.getElementById('phFactsGrid');
    this.factNote = document.getElementById('phFactNote');

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
    this.renderFacts(label);
  }

  renderFacts(label) {
    const data = PLANET_FACTS[label];
    if (this.factsGrid) {
      this.factsGrid.innerHTML = data
        ? data.rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('')
        : '';
    }
    if (this.factNote) this.factNote.textContent = data?.note || '';
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
    const towardLabel = ATTRACTOR_LABEL[this.solar.scenario] || 'el Sol';
    if (this.eqF) this.eqF.innerHTML =
      `F = G·M·m / r² = (6.674e-11)(${Mtxt})(${fmt(m,1)}) / (${fmt(s.r,2)})² = <b>${fmt(s.F,2)} N</b>`;
    if (this.eqA) this.eqA.innerHTML =
      `a = F / m = G·M / r² = <b>${fmt(s.aMag,3)} m/s²</b>  (hacia ${towardLabel})`;
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
