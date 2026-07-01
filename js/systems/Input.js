// Control de cámara SIN Pointer Lock API.
// Así el navegador nunca muestra el aviso "tu puntero está oculto / pulsa Esc".
// La nave se dirige exclusivamente con las flechas del teclado (o el stick del
// mando); el ratón/touchpad ya no mueve la cámara, porque sin Pointer Lock el
// movementX/Y de un touchpad es errático (saltos y valores inconsistentes al
// llegar al borde de la pantalla) y eso provocaba bugs de cámara en vuelo.
// El cursor se sigue ocultando por CSS mientras se vuela.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.steering = false;   // true mientras se controla la nave en vuelo
    this.locked = false;     // compatibilidad con el resto del código
    this.yaw = 0;
    this.pitch = 0;
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
