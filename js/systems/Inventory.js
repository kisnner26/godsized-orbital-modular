// Inventario del exotraje (estilo No Man's Sky): recursos apilables que se
// obtienen minando flora/minerales, más "unidades" (créditos) por descubrir
// planetas y escanear fauna. Persiste en localStorage entre sesiones.

export const RESOURCES = {
  carbono:  { name: 'Carbono',  sym: 'C',   color: '#7dff9e', desc: 'Elemento base de la vida. Recarga el soporte vital.' },
  oxigeno:  { name: 'Oxígeno',  sym: 'O₂',  color: '#ff6a6a', desc: 'Gas respirable. Recarga el soporte vital.' },
  ferrita:  { name: 'Ferrita',  sym: 'Fe',  color: '#c8cdd4', desc: 'Polvo metálico de rocas. Material de construcción.' },
  sodio:    { name: 'Sodio',    sym: 'Na',  color: '#ffd85e', desc: 'Recarga la protección contra peligros.' },
  cobalto:  { name: 'Cobalto',  sym: 'Co',  color: '#6ea8ff', desc: 'Cristales azules de cuevas y zonas oscuras.' },
  dioxita:  { name: 'Dioxita',  sym: 'CO₂', color: '#a8ecff', desc: 'CO₂ congelado de mundos helados.' },
  fosfato:  { name: 'Fosfato',  sym: 'P',   color: '#ffb066', desc: 'Sal mineral de mundos abrasadores.' },
  amoniaco: { name: 'Amoníaco', sym: 'NH₃', color: '#b6ff5e', desc: 'Compuesto volátil de mundos tóxicos.' },
  uranio:   { name: 'Uranio',   sym: 'U',   color: '#9dff3d', desc: 'Elemento radiactivo de mundos irradiados.' }
};

const STORE_KEY = 'orion7.inventory';

export class Inventory {
  constructor() {
    this.counts = {};
    this.units = 0;
    this.onPickup = null;   // (id, n, total) => void — toast de recogida
    this.onChange = null;   // () => void — refrescar panel
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      this.counts = raw.counts || {};
      this.units = raw.units || 0;
    } catch { this.counts = {}; this.units = 0; }
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ counts: this.counts, units: this.units })); }
    catch { /* sin persistencia */ }
  }

  count(id) { return this.counts[id] || 0; }

  add(id, n) {
    if (!RESOURCES[id] || n <= 0) return 0;
    this.counts[id] = (this.counts[id] || 0) + n;
    this.save();
    this.onPickup?.(id, n, this.counts[id]);
    this.onChange?.();
    return n;
  }

  // Consume hasta n del recurso; devuelve cuánto consumió realmente.
  consume(id, n) {
    const have = this.counts[id] || 0;
    const used = Math.min(have, n);
    if (used > 0) {
      this.counts[id] = have - used;
      this.save();
      this.onChange?.();
    }
    return used;
  }

  addUnits(n) {
    this.units += Math.max(0, Math.round(n));
    this.save();
    this.onChange?.();
  }
}
