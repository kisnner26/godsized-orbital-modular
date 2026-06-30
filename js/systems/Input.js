// Control de cámara SIN Pointer Lock API.
// Así el navegador nunca muestra el aviso "tu puntero está oculto / pulsa Esc".
// La nave se dirige con el movimiento relativo del ratón (movementX/Y) y el
// cursor se oculta por CSS mientras se vuela.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.steering = false;   // true mientras se controla la nave en vuelo
    this.locked = false;     // compatibilidad con el resto del código
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.onKeyDown = null;
    this.onWheel = null;

    document.addEventListener('wheel', e => {
      if (this.onWheel) this.onWheel(e.deltaY);
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if (this.steering && e.code.startsWith('Arrow')) e.preventDefault();
      this.keys[e.code] = true;
      if (this.onKeyDown) this.onKeyDown(e.code);
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });

    document.addEventListener('mousemove', e => {
      if (!this.steering) return;
      this.yaw -= (e.movementX || 0) * this.sensitivity;
      this.pitch -= (e.movementY || 0) * this.sensitivity;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    });
  }

  // Activa el control de vuelo (oculta el cursor vía clase de body).
  lock() {
    this.steering = true;
    this.locked = true;
    document.body.classList.add('is-steering');
  }

  // Desactiva el control de vuelo (muestra el cursor de nuevo).
  unlock() {
    this.steering = false;
    this.locked = false;
    document.body.classList.remove('is-steering');
  }
}
