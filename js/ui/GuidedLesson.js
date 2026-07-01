// Lección guiada de física: recorre paso a paso el movimiento orbital real de
// la Tierra (posición, gravitación universal, segunda ley de Newton, velocidad
// tangencial, actualización de v y r) usando los mismos valores en vivo del
// simulador — no es una animación aparte, es la propia simulación narrada.
// Solo aplica a la Tierra: es el caso de referencia de la tarea (órbita casi
// circular, fácil de seguir sin las excentricidades del cometa o los
// escenarios exóticos).

const STEPS = [
  {
    title: 'Introducción',
    narration: 'Esta es la lección guiada del movimiento de la Tierra alrededor del Sol. Vamos a repasar, paso a paso, por qué la combinación de una fuerza y una velocidad la mantiene en órbita para siempre.',
    duration: 8000,
    zoom: 1.7,
    eq: null,
    focus: 'orbit',
    timeScale: 0.2
  },
  {
    title: 'Paso 1 · La posición',
    narration: 'Primero, la posición. La Tierra está a una distancia r del Sol: ahora mismo, casi exactamente una Unidad Astronómica, ciento cincuenta millones de kilómetros. Esa r es la línea del diagrama, y cambia todo el tiempo.',
    duration: 9000,
    zoom: 0.85,
    eq: 'eqR',
    focus: 'r',
    timeScale: 0.2
  },
  {
    title: 'Paso 2 · Gravitación universal',
    narration: 'La Ley de Gravitación Universal de Newton dice que dos masas se atraen con una fuerza F igual a la constante G, por las dos masas, dividido entre la distancia al cuadrado. Esa fuerza siempre apunta de la Tierra hacia el Sol.',
    duration: 9500,
    zoom: 0.85,
    eq: 'eqF',
    focus: 'f',
    timeScale: 0.2
  },
  {
    title: 'Paso 3 · Segunda ley de Newton',
    narration: 'Esa fuerza produce una aceleración: a es igual a F entre la masa, o lo que es lo mismo, G por la masa del Sol entre la distancia al cuadrado. La Tierra acelera hacia el Sol en todo momento, aunque muy poco.',
    duration: 9500,
    zoom: 0.85,
    eq: 'eqA',
    focus: 'f',
    timeScale: 0.2
  },
  {
    title: 'Paso 4 · Velocidad tangencial',
    narration: 'Si la Tierra estuviera quieta, esa aceleración la haría caer directo al Sol. Pero también se mueve de lado, casi treinta kilómetros por segundo. Esa velocidad tangencial es lo único que evita la caída.',
    duration: 9500,
    zoom: 1.0,
    eq: 'eqV',
    focus: 'v',
    timeScale: 0.2
  },
  {
    title: 'Paso 5 · Actualizando la velocidad',
    narration: 'En cada instante, la velocidad cambia un poco: v nueva es igual a v anterior más la aceleración por el tiempo transcurrido. Como la aceleración siempre apunta al Sol, la velocidad se va curvando hacia él, sin acercarse jamás.',
    duration: 10000,
    zoom: 1.0,
    eq: 'eqV',
    focus: 'v',
    timeScale: 0.2
  },
  {
    title: 'Paso 6 · Actualizando la posición',
    narration: 'Con esa nueva velocidad, la posición también se actualiza: r nueva es igual a r anterior más v por el tiempo. Repitiendo esto miles de veces por segundo en la simulación, se traza la curva completa de la órbita.',
    duration: 9500,
    zoom: 0.9,
    eq: 'eqR',
    focus: 'r',
    timeScale: 0.2
  },
  {
    title: 'Paso 7 · La órbita completa',
    narration: 'Repitamos el proceso muchas veces seguidas: fuerza, aceleración, velocidad, posición. Observa cómo la trayectoria se cierra sobre sí misma, formando la órbita elíptica real de la Tierra alrededor del Sol.',
    duration: 11000,
    zoom: 1.15,
    eq: null,
    focus: 'orbit',
    timeScale: 5,
    wide: true   // la cámara de observación normal orbita la Tierra, no el
                 // Sol: con el radio de la órbita (34 unidades visuales) muy
                 // por encima del zoom máximo posible sobre la Tierra, nunca
                 // se vería la elipse completa. Este paso re-encuadra la
                 // cámara hacia el Sol con una distancia base mayor para que
                 // quepa toda la órbita.
  },
  {
    title: 'Resumen',
    narration: 'En resumen: la gravedad tira de la Tierra hacia el Sol, pero su velocidad lateral evita que caiga. Ese equilibrio, descrito exactamente por las leyes de Newton, es lo que mantiene a la Tierra en órbita año tras año.',
    duration: 9000,
    zoom: 1.4,
    eq: null,
    focus: 'orbit',
    timeScale: 0.2
  }
];

export class GuidedLesson {
  constructor({ player, solar, narrator, launchBtn, panel, titleEl, dotsEl, diagram, prevBtn, nextBtn, playPauseBtn, closeBtn, onStart, onStop }) {
    this.player = player;
    this.solar = solar;
    this.narrator = narrator;
    this.launchBtn = launchBtn;
    this.panel = panel;
    this.titleEl = titleEl;
    this.dotsEl = dotsEl;
    this.diagram = diagram;
    this.onStart = onStart;
    this.onStop = onStop;

    this.active = false;
    this.paused = false;
    this.index = -1;
    this.zoomTarget = 1;
    this.advanceTimer = null;
    this.pendingAdvance = false;

    dotsEl.innerHTML = STEPS.map(() => '<span></span>').join('');
    this.dots = [...dotsEl.children];

    launchBtn.addEventListener('click', () => this.start());
    prevBtn.addEventListener('click', () => this.goTo(this.index - 1));
    nextBtn.addEventListener('click', () => this.goTo(this.index + 1));
    closeBtn.addEventListener('click', () => this.stop());
    this.playPauseBtn = playPauseBtn;
    playPauseBtn.addEventListener('click', () => this.togglePause());
  }

  setEarthAvailable(isEarth) {
    if (!isEarth) {
      if (this.active) this.stop(true);
      this.launchBtn.classList.add('hidden');
      return;
    }
    if (!this.active) this.launchBtn.classList.remove('hidden');
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    document.body.classList.add('lesson-active');
    this.solar.trailPoints = [];
    // La cámara de observación normal sigue al cuerpo observado (la Tierra);
    // guardamos ese objetivo/distancia originales para poder restaurarlos
    // al salir del paso "wide" (que reencuadra hacia el Sol).
    this.earthTargetGetter = this.player.observation?.targetGetter;
    this.earthDistance = this.player.observeDistance;
    this.launchBtn.classList.add('hidden');
    this.panel.classList.remove('hidden');
    this.diagram.classList.remove('hidden');
    this.onStart?.();
    this.goTo(0);
  }

  stop(keepButtonHidden = false) {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.advanceTimer);
    this.pendingAdvance = false;
    document.body.classList.remove('lesson-active');
    this.restoreEarthTarget();
    this.panel.classList.add('hidden');
    this.diagram.classList.add('hidden');
    this.clearEqHighlight();
    this.solar.setTimeScale(1);
    if (!keepButtonHidden) this.launchBtn.classList.remove('hidden');
    this.onStop?.();
  }

  restoreEarthTarget() {
    if (this.player.observation && this.earthTargetGetter) {
      this.player.observation.targetGetter = this.earthTargetGetter;
    }
    if (this.earthDistance != null) this.player.observeDistance = this.earthDistance;
  }

  togglePause() {
    this.paused = !this.paused;
    this.playPauseBtn.textContent = this.paused ? '▶' : '❚❚';
    if (this.paused) {
      clearTimeout(this.advanceTimer);
    } else if (this.pendingAdvance) {
      // La narración ya había terminado mientras estaba en pausa.
      this.pendingAdvance = false;
      this.scheduleAdvance();
    }
  }

  clearEqHighlight() {
    document.querySelectorAll('.eq.lesson-highlight').forEach(el => el.classList.remove('lesson-highlight'));
  }

  // Se llama cuando la narración de un paso termina de leerse DE VERDAD
  // (evento real del navegador, no un cronómetro adivinado). `i` es el paso
  // que estaba activo cuando se pidió esa narración: si el usuario ya
  // avanzó/retrocedió manualmente mientras tanto, `i !== this.index` y no
  // hacemos nada (esa narración vieja ya fue interrumpida de todos modos).
  onNarrationEnd(i) {
    if (!this.active || i !== this.index) return;
    if (this.paused) { this.pendingAdvance = true; return; }
    this.scheduleAdvance();
  }

  // Pequeña pausa tras terminar de leer antes de avanzar — da tiempo a que
  // el paso "respire" en vez de saltar en el instante exacto en que calla.
  scheduleAdvance() {
    clearTimeout(this.advanceTimer);
    this.advanceTimer = setTimeout(() => {
      if (this.active && !this.paused) this.goTo(this.index + 1);
    }, 900);
  }

  goTo(i) {
    if (i < 0) i = 0;
    if (i >= STEPS.length) { this.stop(); return; }
    clearTimeout(this.advanceTimer);
    this.pendingAdvance = false;
    // Al cambiar de paso (incluso a mitad de una narración anterior, si el
    // usuario navegó a mano) se corta esa narración de inmediato en vez de
    // dejarla encolada — este paso siempre se lee desde el principio.
    this.narrator.interrupt();
    this.index = i;
    const step = STEPS[i];
    this.zoomTarget = step.zoom;

    this.titleEl.textContent = step.title;
    this.dots.forEach((d, k) => d.classList.toggle('active', k === i));
    this.clearEqHighlight();
    if (step.eq) document.getElementById(step.eq)?.classList.add('lesson-highlight');
    this.diagram.className = `lesson-diagram focus-${step.focus}`;
    this.solar.setTimeScale(step.timeScale);
    this.narrator.say(step.narration, step.duration, () => this.onNarrationEnd(i));

    if (step.wide && this.player.observation) {
      this.player.observation.targetGetter = () => this.solar.getSunWorldPosition();
      this.player.observeDistance = 40;
    } else {
      this.restoreEarthTarget();
    }
  }

  update(dt) {
    if (!this.active || this.paused) return;
    const cur = this.player.observeZoom || 1;
    this.player.observeZoom = cur + (this.zoomTarget - cur) * Math.min(1, dt * 1.5);
  }
}
