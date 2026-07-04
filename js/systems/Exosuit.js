// Exotraje (estilo No Man's Sky): soporte vital, protección contra peligros
// ambientales, combustible de la mochila propulsora y salud. Se drena al
// explorar a pie (más rápido bajo peligro ambiental) y se recarga con
// recursos del inventario o automáticamente al volver a la nave.

export class Exosuit {
  constructor(inventory) {
    this.inventory = inventory;
    this.health = 1;        // salud (impactos, asfixia, peligros extremos)
    this.lifeSupport = 1;   // soporte vital (O2/energía del traje)
    this.hazardProt = 1;    // protección contra peligros (frío/calor/toxicidad/radiación)
    this.jetpack = 1;       // combustible de la mochila propulsora
    this.hazardLabel = '';  // qué peligro está drenando ahora mismo (para el HUD)
    this.onWarning = null;  // (texto) => void — avisos de nivel bajo
    this.onDeath = null;    // () => void — el traje falló
    this._warned = { life: false, hazard: false };
  }

  // ctx: { onFoot, running, jetpacking, hazardLevel (0..1), hazardKind, inShip }
  update(dt, ctx) {
    if (ctx.inShip) {
      // A bordo la nave recicla el aire y recarga el traje completo.
      this.lifeSupport = Math.min(1, this.lifeSupport + dt * 0.10);
      this.hazardProt = Math.min(1, this.hazardProt + dt * 0.10);
      this.jetpack = Math.min(1, this.jetpack + dt * 0.5);
      this.health = Math.min(1, this.health + dt * 0.03);
      this.hazardLabel = '';
      this._warned.life = this._warned.hazard = false;
      return;
    }
    if (!ctx.onFoot) return;

    // Soporte vital: drenaje base lento (~7 min andando, como en NMS), mayor
    // al correr o usar la mochila propulsora.
    let drain = 0.0022;
    if (ctx.running) drain += 0.0026;
    if (ctx.jetpacking) drain += 0.004;
    this.lifeSupport = Math.max(0, this.lifeSupport - drain * dt);

    // Protección ambiental: solo se drena si el planeta es hostil (a mayor
    // peligro, menos minutos de protección — ~2.5 min con peligro 0.6).
    const hz = Math.max(0, ctx.hazardLevel || 0);
    if (hz > 0.01) {
      this.hazardProt = Math.max(0, this.hazardProt - hz * 0.011 * dt);
      this.hazardLabel = ctx.hazardKind || 'PELIGRO AMBIENTAL';
    } else {
      this.hazardLabel = '';
      this.hazardProt = Math.min(1, this.hazardProt + dt * 0.004);
    }

    // Mochila propulsora: se consume al volar, se regenera en tierra.
    if (ctx.jetpacking) this.jetpack = Math.max(0, this.jetpack - dt * 0.42);
    else if (ctx.grounded) this.jetpack = Math.min(1, this.jetpack + dt * 0.36);

    // Sin soporte vital o sin protección bajo peligro → la salud cae.
    if (this.lifeSupport <= 0) this.health = Math.max(0, this.health - dt * 0.055);
    if (this.hazardProt <= 0 && hz > 0.01) this.health = Math.max(0, this.health - dt * 0.05 * (0.5 + hz));

    if (this.lifeSupport < 0.25 && !this._warned.life) {
      this._warned.life = true;
      this.onWarning?.('Soporte vital bajo. Recarga con Carbono u Oxígeno (tecla R).');
    }
    if (this.lifeSupport > 0.5) this._warned.life = false;
    if (this.hazardProt < 0.25 && hz > 0.01 && !this._warned.hazard) {
      this._warned.hazard = true;
      this.onWarning?.('Protección contra peligros baja. Recarga con Sodio (tecla R).');
    }
    if (this.hazardProt > 0.5) this._warned.hazard = false;

    if (this.health <= 0) {
      this.health = 0;
      this.onDeath?.();
    }
  }

  // Recarga manual (tecla R): consume recursos del inventario en orden de
  // prioridad. Devuelve un resumen de lo recargado (o null si no había nada).
  recharge() {
    const inv = this.inventory;
    const used = [];
    if (this.lifeSupport < 0.99) {
      const need = Math.ceil((1 - this.lifeSupport) * 40);
      for (const id of ['oxigeno', 'carbono']) {
        if (this.lifeSupport >= 0.99) break;
        const got = inv.consume(id, need);
        if (got > 0) {
          this.lifeSupport = Math.min(1, this.lifeSupport + got / 40);
          used.push(`${got} ${id === 'oxigeno' ? 'O₂' : 'C'}`);
        }
      }
    }
    if (this.hazardProt < 0.99) {
      const got = inv.consume('sodio', Math.ceil((1 - this.hazardProt) * 30));
      if (got > 0) {
        this.hazardProt = Math.min(1, this.hazardProt + got / 30);
        used.push(`${got} Na`);
      }
    }
    return used.length ? used.join(' · ') : null;
  }

  takeDamage(amount, { hazard = 0, message = 'Daño recibido.' } = {}) {
    const dmg = Math.max(0, Number(amount) || 0);
    const hz = Math.max(0, Number(hazard) || 0);
    if (hz > 0) this.hazardProt = Math.max(0, this.hazardProt - hz);
    if (dmg > 0) this.health = Math.max(0, this.health - dmg);
    if (dmg > 0 || hz > 0) this.onWarning?.(message);
    if (this.health <= 0) {
      this.health = 0;
      this.onDeath?.();
    }
    return this.health > 0;
  }

  refill() {
    this.health = this.lifeSupport = this.hazardProt = this.jetpack = 1;
    this._warned.life = this._warned.hazard = false;
  }
}
