// Soporte de mando (PS4 DualShock 4 vía Bluetooth y compatibles "standard").
// Escribe en el mismo `input` que el teclado/ratón para reutilizar la lógica
// de vuelo, y dispara callbacks para acciones discretas (salir, cambiar cuerpo…).

const DEAD = 0.18;
function dz(v) { return Math.abs(v) < DEAD ? 0 : v; }

export class GamepadController {
  constructor(input, actions = {}) {
    this.input = input;
    this.actions = actions;
    this.index = null;
    this.id = '';
    this.connected = false;
    this.prev = [];          // estado previo de botones (flanco)
    this.mappedKeys = ['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft','ShiftLeft'];

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
      // Sticks → orientación de la nave
      const lx = dz(gp.axes[0] || 0);
      const ly = dz(gp.axes[1] || 0);
      const rx = dz(gp.axes[2] || 0);
      this.input.yaw   -= (lx + rx) * 2.2 * dt;
      this.input.pitch -= ly * 1.8 * dt;
      this.input.pitch = Math.max(-1.35, Math.min(1.35, this.input.pitch));

      // Botones → empuje (mapeo standard)
      k.KeyW = this.pressed(gp, 7) || this.pressed(gp, 0);   // R2 / X
      k.KeyS = this.pressed(gp, 6) || this.pressed(gp, 1);   // L2 / O
      k.KeyA = this.pressed(gp, 4);                          // L1
      k.KeyD = this.pressed(gp, 5);                          // R1
      k.Space = this.pressed(gp, 3);                         // Triángulo (subir)
      k.ControlLeft = this.pressed(gp, 2);                   // Cuadrado (bajar)
      k.ShiftLeft = this.pressed(gp, 10);                    // L3 (impulso)

      if (this.edge(gp, 11)) this.actions.toggleTurbo?.();   // R3 (turbo x3)
      if (this.edge(gp, 12)) this.actions.speedUp?.();       // D-pad arriba
      if (this.edge(gp, 13)) this.actions.speedDown?.();     // D-pad abajo
      if (this.edge(gp, 9)) this.actions.togglePanel?.();    // Options
    } else {
      // En observación no se pilota: liberamos las teclas de empuje.
      for (const key of this.mappedKeys) k[key] = false;
    }

    if (mode === 'observe') {
      if (this.edge(gp, 14)) this.actions.cycleBody?.(-1);   // D-pad izquierda
      if (this.edge(gp, 15)) this.actions.cycleBody?.(1);    // D-pad derecha
      if (this.edge(gp, 1)) this.actions.exitObserve?.();    // Círculo
      // Zoom: R2 aleja, L2 acerca (continuo) + stick derecho
      if (this.pressed(gp, 7)) this.actions.zoom?.(1.04);
      if (this.pressed(gp, 6)) this.actions.zoom?.(0.96);
      const ry = dz(gp.axes[3] || 0);
      if (ry) this.actions.zoom?.(1 + ry * 0.04);
    }

    // Guardar estado para detección de flancos
    this.prev = gp.buttons.map(b => b.pressed);
  }
}
