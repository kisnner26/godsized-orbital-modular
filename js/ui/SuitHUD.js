import { RESOURCES } from '../systems/Inventory.js';

// HUD del exotraje (estilo No Man's Sky): barras de salud/soporte vital/
// protección/mochila abajo a la izquierda, toasts de recogida a la derecha,
// banner central de descubrimiento y tarjeta de datos del planeta.

export class SuitHUD {
  constructor(inventory, exosuit) {
    this.inventory = inventory;
    this.exosuit = exosuit;

    this.panel = document.getElementById('suitPanel');
    this.bars = {
      health: document.getElementById('barHealth'),
      life: document.getElementById('barLife'),
      hazard: document.getElementById('barHazard'),
      jetpack: document.getElementById('barJetpack')
    };
    this.hazardTag = document.getElementById('suitHazardTag');
    this.toastsEl = document.getElementById('toasts');
    this.discoveryEl = document.getElementById('discovery');
    this.planetCardEl = document.getElementById('planetCard');
    this.invPanel = document.getElementById('invPanel');
    this.invGrid = document.getElementById('invGrid');
    this.invUnits = document.getElementById('invUnits');

    this._discoveryTimer = null;
    this._cardTimer = null;
    this._pickupAgg = {};   // agrupa recogidas rápidas en un solo toast

    inventory.onPickup = (id, n) => this.pickupToast(id, n);
    inventory.onChange = () => { if (!this.invPanel.classList.contains('hidden')) this.renderInventory(); };
  }

  setVisible(visible) {
    this.panel.classList.toggle('hidden', !visible);
  }

  update() {
    const s = this.exosuit;
    this.setBar(this.bars.health, s.health, '#ff5a5a');
    this.setBar(this.bars.life, s.lifeSupport, '#7dffda');
    this.setBar(this.bars.hazard, s.hazardProt, '#ffd85e');
    this.setBar(this.bars.jetpack, s.jetpack, '#8fb8ff');
    if (this.hazardTag) {
      this.hazardTag.textContent = s.hazardLabel || '';
      this.hazardTag.classList.toggle('hidden', !s.hazardLabel);
    }
  }

  setBar(el, value, color) {
    if (!el) return;
    const v = Math.max(0, Math.min(1, value));
    el.style.width = `${(v * 100).toFixed(1)}%`;
    el.style.background = color;
    el.parentElement.classList.toggle('is-low', v < 0.25);
  }

  // ---- Toasts (recogidas, avisos) ----

  pickupToast(id, n) {
    // Agrega cantidades en ráfaga (el láser da varios ticks/segundo).
    const res = RESOURCES[id];
    if (!res) return;
    const agg = this._pickupAgg[id];
    if (agg) {
      agg.total += n;
      agg.el.querySelector('.toast__qty').textContent = `+${agg.total}`;
      clearTimeout(agg.timer);
      agg.timer = setTimeout(() => this.endPickup(id), 900);
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast toast--pickup';
    el.innerHTML = `<span class="toast__sym" style="--c:${res.color}">${res.sym}</span>`
      + `<span class="toast__name">${res.name}</span><span class="toast__qty">+${n}</span>`;
    this.toastsEl.appendChild(el);
    this._pickupAgg[id] = { el, total: n, timer: setTimeout(() => this.endPickup(id), 900) };
    this.trimToasts();
  }

  endPickup(id) {
    const agg = this._pickupAgg[id];
    if (!agg) return;
    delete this._pickupAgg[id];
    agg.el.classList.add('is-out');
    setTimeout(() => agg.el.remove(), 700);
  }

  toast(html, cls = '', duration = 4200) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    this.toastsEl.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 700);
    }, duration);
    this.trimToasts();
  }

  trimToasts() {
    while (this.toastsEl.children.length > 7) this.toastsEl.firstChild.remove();
  }

  // ---- Banner de descubrimiento (primera visita a un mundo) ----

  showDiscovery(eyebrow, title, sub) {
    const el = this.discoveryEl;
    el.querySelector('.discovery__eyebrow').textContent = eyebrow;
    el.querySelector('h2').textContent = title;
    el.querySelector('p').textContent = sub;
    el.classList.remove('hidden');
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    clearTimeout(this._discoveryTimer);
    this._discoveryTimer = setTimeout(() => el.classList.add('hidden'), 6200);
  }

  // ---- Tarjeta de datos del planeta (al entrar en su atmósfera) ----

  showPlanetCard(body) {
    const el = this.planetCardEl;
    const res = (body.resources || [])
      .map(id => {
        const r = RESOURCES[id];
        return r ? `<span class="pc__res" style="--c:${r.color}">${r.sym}</span>` : '';
      }).join('');
    el.innerHTML = `
      <span class="pc__eyebrow">ANÁLISIS PLANETARIO</span>
      <h3>${body.name}</h3>
      <div class="pc__row"><span>BIOMA</span><strong>${body.biomeLabel || '—'}</strong></div>
      <div class="pc__row"><span>CLIMA</span><strong>${body.weather || '—'}</strong></div>
      <div class="pc__row"><span>PELIGRO</span><strong>${body.hazardKind || 'NINGUNO'}</strong></div>
      <div class="pc__row"><span>FAUNA</span><strong>${body.fauna ? 'PRESENTE' : 'AUSENTE'}</strong></div>
      <div class="pc__row"><span>GRAVEDAD</span><strong>${(body.gravity ?? 1).toFixed(2)} g</strong></div>
      <div class="pc__row pc__row--res"><span>RECURSOS</span><strong>${res}</strong></div>`;
    el.classList.remove('hidden');
    clearTimeout(this._cardTimer);
    this._cardTimer = setTimeout(() => el.classList.add('hidden'), 10000);
  }

  hidePlanetCard() {
    clearTimeout(this._cardTimer);
    this.planetCardEl.classList.add('hidden');
  }

  // ---- Panel de inventario (tecla I) ----

  toggleInventory() {
    const show = this.invPanel.classList.contains('hidden');
    this.invPanel.classList.toggle('hidden', !show);
    if (show) this.renderInventory();
    return show;
  }

  renderInventory() {
    this.invUnits.textContent = `${this.inventory.units.toLocaleString('es')} unidades`;
    const ids = Object.keys(RESOURCES);
    this.invGrid.innerHTML = ids.map(id => {
      const r = RESOURCES[id];
      const n = this.inventory.count(id);
      return `<div class="inv__slot ${n ? '' : 'is-empty'}" title="${r.desc}">
        <span class="inv__sym" style="--c:${r.color}">${r.sym}</span>
        <span class="inv__name">${r.name}</span>
        <span class="inv__qty">${n}</span>
      </div>`;
    }).join('');
  }
}
