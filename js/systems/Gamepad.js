// Soporte de mando (PS4 DualShock 4 vía Bluetooth y compatibles "standard").
// Escribe en el mismo `input` que el teclado/ratón para reutilizar la lógica
// de vuelo, y dispara callbacks para acciones discretas (salir, cambiar cuerpo…).

const DEAD = 0.16;
// Zona muerta + curva cuadrática: sin esto, el valor salta de 0 a ~DEAD en
// cuanto se sale de la zona muerta y luego responde lineal, lo que se siente
// brusco/tembloroso para ajustes finos. Reescalar desde el borde de la zona
// muerta (arranca en 0 limpio) y elevar al cuadrado (conservando el signo) da
// mucha más precisión a media pulsación sin perder autoridad a fondo de stick.
function axis(v) {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  const t = (a - DEAD) / (1 - DEAD);
  return Math.sign(v) * t * t;
}

export class GamepadController {
  constructor(input, actions = {}) {
    this.input = input;
    this.actions = actions;
    this.index = null;
    this.id = '';
    this.connected = false;
    this.prev = [];          // estado previo de botones (flanco)
    this.mappedKeys = ['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft','ShiftLeft','KeyM'];

    window.addEventListener('gamepadconnected', (e) => {
      const gp = e.gamepad;
      if (this.index === null) {
        this.index = gp.index;
        this.id = gp.id;
        this.connected = true;
        this.actions.onConnect?.(this.prettyName(gp.id));
      }
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) {
        this.index = null;
        this.connected = false;
        this.actions.onDisconnect?.();
      }
    });
  }

  prettyName(id) {
    if (/054c|dualshock|dualsense|wireless controller|ps4|ps5/i.test(id)) return 'Mando PlayStation';
    if (/xbox|045e/i.test(id)) return 'Mando Xbox';
    return 'Mando';
  }

  // Asegura detección aunque el evento se perdiera (algunos navegadores).
  poll() {
    if (this.index !== null) return navigator.getGamepads?.()[this.index] || null;
    const pads = navigator.getGamepads?.() || [];
    for (const gp of pads) {
      if (gp) {
        this.index = gp.index; this.id = gp.id; this.connected = true;
        this.actions.onConnect?.(this.prettyName(gp.id));
        return gp;
      }
    }
    return null;
  }

  pressed(gp, i) { return !!(gp.buttons[i] && gp.buttons[i].pressed); }
  edge(gp, i) { return this.pressed(gp, i) && !this.prev[i]; }

  update(dt, mode) {
    const gp = this.poll();
    if (!gp) return;

    const k = this.input.keys;

    // Select / Share (botón 8) → abre/cierra el menú de pausa en cualquier modo.
    if (this.edge(gp, 8)) {
      this.actions.togglePause?.();
      this.prev = gp.buttons.map(b => b.pressed);
      return;
    }

    if (mode === 'flight') {
      // Sticks → orientación de la nave. Solo el stick IZQUIERDO gira la
      // nave: antes el stick derecho sumaba el mismo yaw que el izquierdo
      // (this.input.yaw -= (lx + rx) * ...), así que tocar sin querer el
      // stick derecho mientras se sujeta el mando aceleraba o incluso
      // invertía el giro sin motivo — el origen principal de "se siente
      // raro". El stick derecho queda libre en vuelo (igual que ya estaba
      // en observación, donde solo se usa para el zoom).
      const lx = axis(gp.axes[0] || 0);
      const ly = axis(gp.axes[1] || 0);
      this.input.yaw   -= lx * 2.2 * dt;
      this.input.pitch -= ly * 1.8 * dt;
      this.input.pitch = Math.max(-1.35, Math.min(1.35, this.input.pitch));

      // Gatillos analógicos: antes solo se leía `.pressed` (on/off), así que
      // el empuje era todo-o-nada y no se podía maniobrar con precisión. Los
      // gatillos "estándar" del Gamepad API exponen `.value` 0..1 según la
      // presión; con fallback a pressed=1 por si el navegador no lo expone.
      const r2 = gp.buttons[7] ? (gp.buttons[7].value ?? (gp.buttons[7].pressed ? 1 : 0)) : 0;
      const l2 = gp.buttons[6] ? (gp.buttons[6].value ?? (gp.buttons[6].pressed ? 1 : 0)) : 0;
      this.input.thrustFwd = Math.max(r2, this.pressed(gp, 0) ? 1 : 0);  // R2 / X
      this.input.thrustRev = Math.max(l2, this.pressed(gp, 1) ? 1 : 0);  // L2 / O
      k.KeyW = this.input.thrustFwd > 0.02;
      k.KeyS = this.input.thrustRev > 0.02;
      k.KeyA = this.pressed(gp, 4);                          // L1
      k.KeyD = this.pressed(gp, 5);                          // R1
      k.Space = this.pressed(gp, 3);                         // Triángulo (subir)
      k.ControlLeft = this.pressed(gp, 2);                   // Cuadrado (bajar)
      k.ShiftLeft = this.pressed(gp, 10);                    // L3 (impulso)
      k.KeyM = this.pressed(gp, 11);                         // R3 (turbo x5, mantener)

      if (this.edge(gp, 12)) this.actions.speedUp?.();       // D-pad arriba
      if (this.edge(gp, 13)) this.actions.speedDown?.();     // D-pad abajo
      if (this.edge(gp, 9)) this.actions.togglePanel?.();    // Options
      if (this.edge(gp, 15)) this.actions.toggleView?.();    // D-pad derecha
    } else if (mode === 'onfoot') {
      // A pie: stick izquierdo mueve, stick derecho mira (antes el mando no
      // hacía absolutamente nada en este modo — solo funcionaba el teclado).
      const lx = axis(gp.axes[0] || 0);
      const ly = axis(gp.axes[1] || 0);
      k.KeyD = lx > 0;
      k.KeyA = lx < 0;
      k.KeyS = ly > 0;
      k.KeyW = ly < 0;
      k.ShiftLeft = this.pressed(gp, 4);                     // L1 (correr)
      k.Space = this.pressed(gp, 0);                         // X (saltar / mantener = mochila)

      const rx = axis(gp.axes[2] || 0);
      const ry = axis(gp.axes[3] || 0);
      this.input.gpYaw = -rx * 2.0;
      this.input.gpPitch = -ry * 1.6;

      if (this.edge(gp, 3)) this.actions.interact?.();       // Triángulo (subir a la nave)
      if (this.edge(gp, 2)) this.actions.toggleView?.();     // Cuadrado (1ª / 3ª persona)
      if (this.edge(gp, 6)) this.actions.scan?.();           // L2 (escáner de pulso)
      if (this.edge(gp, 1)) this.actions.recharge?.();       // Círculo (recargar traje)
      // R2 analógico = láser de minado (mantener), leído como thrustFwd.
      const r2 = gp.buttons[7] ? (gp.buttons[7].value ?? (gp.buttons[7].pressed ? 1 : 0)) : 0;
      this.input.thrustFwd = r2;
      this.input.thrustRev = 0;
    } else {
      // En observación (u otros modos) no se pilota: liberamos las teclas.
      for (const key of this.mappedKeys) k[key] = false;
      this.input.thrustFwd = 0;
      this.input.thrustRev = 0;
      this.input.gpYaw = 0;
      this.input.gpPitch = 0;
    }

    if (mode === 'observe') {
      if (this.edge(gp, 14)) this.actions.cycleBody?.(-1);   // D-pad izquierda
      if (this.edge(gp, 15)) this.actions.cycleBody?.(1);    // D-pad derecha
      if (this.edge(gp, 1)) this.actions.exitObserve?.();    // Círculo
      if (this.edge(gp, 11)) this.actions.toggleMap?.();     // R3 (mapa 2D)
      // Zoom: R2 aleja, L2 acerca (continuo) + stick derecho
      if (this.pressed(gp, 7)) this.actions.zoom?.(1.04);
      if (this.pressed(gp, 6)) this.actions.zoom?.(0.96);
      const ry = axis(gp.axes[3] || 0);
      if (ry) this.actions.zoom?.(1 + ry * 0.04);
    }

    // Guardar estado para detección de flancos
    this.prev = gp.buttons.map(b => b.pressed);
  }
}
