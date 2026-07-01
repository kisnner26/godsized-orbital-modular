import * as THREE from 'three';

function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,225,170,0.9)');
  g.addColorStop(0.6, 'rgba(255,140,40,0.35)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const GLOW_TEX = makeGlowTexture();

export class Cockpit {
  constructor(scene, loader) {
    this.scene = scene;
    this.loader = loader;
    this.cockpit = null;
    this.arms = null;
    this.ship = null;
    this.shipProxy = null;
    this.thrusters = null;
    this.flames = [];
    this.flightView = 'third';   // 'first' (cabina) | 'third' (nave externa)
  }

  // Aplica la vista actual en vuelo (mostrar cabina+brazos o nave externa).
  applyFlightView() {
    const first = this.flightView === 'first';
    if (this.cockpit) this.cockpit.visible = first;
    if (this.arms) this.arms.visible = first;
    if (this.ship) this.ship.visible = !first;
    // El proxy sólo se usa como respaldo si el modelo GLB real no llegó a
    // cargar; con él siempre visible se dibujaban dos naves superpuestas en
    // cada cuadro de 3ª persona (coste de render duplicado sin motivo, ya que
    // el botón de inicio no se habilita hasta que `ship` termina de cargar).
    if (this.shipProxy) this.shipProxy.visible = !first && !this.ship;
    if (this.thrusters) this.thrusters.visible = !first;  // las llamas no se ven desde dentro
    if (this.interiorLights) {
      const on = [2.4, 1.8, 1.2, 1.2];
      this.interiorLights.forEach((l, i) => { l.intensity = first ? on[i] : 0; });
    }
  }

  setFlightView(view) {
    this.flightView = view === 'first' ? 'first' : 'third';
    this.applyFlightView();
  }

  // ---- Cinemática de abordaje ----
  // Plano exterior: solo se ve la nave clonada en el mundo; nada del rig.
  setIntroEVA() {
    if (this.cockpit) this.cockpit.visible = false;
    if (this.ship) this.ship.visible = false;
    if (this.shipProxy) this.shipProxy.visible = false;
    if (this.thrusters) this.thrusters.visible = false;
    if (this.interiorLights) this.interiorLights.forEach(l => l.intensity = 0);
    if (this.arms) this.arms.visible = false;
  }

  // Clona la nave exterior y la coloca en el espacio (no en el rig) para verla.
  makeIntroShip(worldPos) {
    if (!this.ship) return null;
    const c = this.ship.clone(true);
    c.visible = true;
    c.position.copy(worldPos);
    c.scale.multiplyScalar(1.5);
    c.rotation.set(0.05, -Math.PI * 0.62, 0.04);
    this.scene.add(c);
    const key = new THREE.PointLight(0xdfeeff, 60, 90, 1.1);
    key.position.set(worldPos.x + 9, worldPos.y + 7, worldPos.z + 11);
    this.scene.add(key);
    const rim = new THREE.PointLight(0xff8a3a, 30, 80, 1.2);
    rim.position.set(worldPos.x - 9, worldPos.y - 3, worldPos.z - 13);
    this.scene.add(rim);
    const amb = new THREE.HemisphereLight(0x9fc4ff, 0x101018, 0.6);
    amb.position.copy(worldPos);
    this.scene.add(amb);
    this.introShip = c; this.introKey = key; this.introRim = rim; this.introAmb = amb;
    return c;
  }

  removeIntroShip() {
    for (const o of ['introShip', 'introKey', 'introRim', 'introAmb']) {
      if (this[o]) { this.scene.remove(this[o]); this[o] = null; }
    }
  }

  buildThrusters(shipRig) {
    const group = new THREE.Group();
    group.visible = false;

    const makeCone = (r, h, color, opacity) => {
      const g = new THREE.ConeGeometry(r, h, 20, 1, true);
      g.translate(0, h / 2, 0);                 // base en el origen, crece hacia +Y
      const m = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = Math.PI / 2;            // punta hacia atrás (+Z)
      return mesh;
    };

    // Posiciones aproximadas de las toberas traseras de la Orion-07
    const nozzles = [
      [0.55, -0.05, 1.05], [-0.55, -0.05, 1.05],
      [1.35, 0.02, 0.85], [-1.35, 0.02, 0.85]
    ];
    for (const [x, y, z] of nozzles) {
      const flame = new THREE.Group();
      flame.position.set(x, y, z);
      const outer = makeCone(0.22, 2.0, 0xff7a1e, 0.65);   // penacho naranja
      const inner = makeCone(0.11, 1.3, 0xbfe6ff, 0.95);   // núcleo azul-blanco
      flame.add(outer, inner);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: GLOW_TEX, color: 0xffae4d, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      glow.scale.set(1.4, 1.4, 1);
      glow.position.z = 0.5;
      flame.add(glow);
      group.add(flame);
      this.flames.push({ flame, outer, inner, glow });
    }

    const light = new THREE.PointLight(0xff7a2a, 0, 14, 1.4);
    light.position.set(0, 0, 1.3);
    group.add(light);
    this.thrusterLight = light;

    shipRig.add(group);
    this.thrusters = group;
  }

  // Estela del turbo: una línea que va guardando las posiciones recientes de
  // la nave en espacio de mundo (igual que el patrón de estela orbital de
  // SolarSystem.js). Crece mientras el turbo está activo y se retrae solo
  // cuando se apaga, en vez de desaparecer de golpe.
  buildTurboTrail() {
    this.turboTrailPoints = [];
    this.turboTrailMax = 40;
    this.turboTrail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x4fc3ff, transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    this.turboTrail.frustumCulled = false;
    this.turboTrail.visible = false;
    this.scene.add(this.turboTrail);
    this._turboScratch = new THREE.Vector3();
  }

  // El hueco del parabrisas en el modelo de la cabina está completamente
  // vacío (sin geometría ni material ahí, se ve directo al vacío). Medido
  // por raycasting contra el modelo: la abertura ocupa x∈[-0.57,0.56],
  // y∈[0.05,0.42], con el borde del marco alrededor de z≈0.45-0.5 (espacio
  // local del GLB, antes de aplicar la escala/posición de la cabina). Como
  // este cristal se agrega como hijo del propio modelo, hereda su escala,
  // posición y rotación automáticamente.
  buildWindshieldGlass(cockpitRoot) {
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbfefff,
      transparent: true,
      opacity: 0.14,
      roughness: 0.35,
      metalness: 0.0,
      emissive: 0x0a2a33,
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    // Posición/orientación medidas por raycasting desde el ojo real de la
    // cámara (fpCam) contra la malla de la cabina, transformadas al espacio
    // local de la cabina — así el cristal encaja en el hueco tal como se ve
    // desde dentro, sea cual sea la escala/posición/rotación que se le
    // aplique luego a la cabina completa.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.24, 8, 4), glassMat);
    glass.position.set(0, 0.2535, -0.7615);
    glass.rotation.x = -0.58;
    glass.renderOrder = 2;
    cockpitRoot.add(glass);

    // Canto con resplandor tipo fresnel para que se note el borde del vidrio.
    const rimMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Vector3(0.55, 0.9, 1.0) } },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vView;
        void main() {
          vNormalW = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormalW; varying vec3 vView;
        void main() {
          float fres = pow(1.0 - max(dot(normalize(vNormalW), vView), 0.0), 2.5);
          gl_FragColor = vec4(uColor, fres * 0.55);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(0.70, 0.26, 8, 4), rimMat);
    rim.position.copy(glass.position);
    rim.rotation.copy(glass.rotation);
    rim.renderOrder = 1;
    cockpitRoot.add(rim);
    this.windshieldGlass = glass;
  }

  async loadAll(shipRig, camera) {
    // Cabina de pod para PRIMERA PERSONA: tablero abajo, dosel arriba y
    // paneles laterales enmarcando la vista al frente. El parabrisas del
    // modelo es un hueco abierto (sin cristal); se lo agregamos aparte.
    const cockpit = await this.loader.load('cabina de pod', './assets/models/cockpit_fp.glb');
    this.loader.normalize(cockpit, 7.5);
    cockpit.scale.setScalar(7.5);
    cockpit.position.set(0, -2.3, -0.5);
    cockpit.rotation.set(0.42, 0, 0);
    this.buildWindshieldGlass(cockpit);
    shipRig.add(cockpit);
    this.cockpit = cockpit;

    // Manos del astronauta para PRIMERA PERSONA (modelo nuevo, otra textura)
    const arms = await this.loader.load('manos FPS', './assets/models/hands_fps.glb');
    this.loader.normalize(arms, 1.05);
    arms.position.set(0, -0.5, -0.85);
    arms.rotation.set(-0.25, Math.PI, 0);
    arms.traverse(o => {
      if (o.isMesh && o.material) {
        // Tinte de guante táctico (otra textura respecto a los brazos anteriores)
        o.material.color = new THREE.Color(0x8d9bb2);
        o.material.metalness = 0.35;
        o.material.roughness = 0.5;
        o.material.needsUpdate = true;
      }
    });
    camera.add(arms);
    this.arms = arms;

    const ship = await this.loader.load('nave completa Orion 07', './assets/models/orion07_starfighter.glb');
    this.loader.normalize(ship, 7.4);
    ship.name = 'ORION_07_PLAYER_SHIP_MODEL';
    ship.position.set(0, -0.2, 0);

    // Meshy entregó la nave con la nariz sobre el eje +X.
    // En Three.js nuestro frente de vuelo es el eje local -Z.
    // Para que la nariz mire hacia adelante y los propulsores queden atrás,
    // local -Z debe apuntar hacia +X: rotación -90° en Y.
    ship.rotation.set(0, -Math.PI / 2, 0);
    ship.visible = false;

    ship.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          obj.material.roughness = Math.min(obj.material.roughness ?? 0.7, 0.78);
          obj.material.metalness = Math.max(obj.material.metalness ?? 0.1, 0.18);
          obj.material.needsUpdate = true;
        }
      }
    });

    shipRig.add(ship);
    this.ship = ship;
    this.buildThirdPersonProxy(shipRig);

    this.buildThrusters(shipRig);
    this.buildInteriorLights(shipRig);
    this.buildTurboTrail();
  }

  buildThirdPersonProxy(shipRig) {
    const proxy = new THREE.Group();
    proxy.name = 'ORION_07_THIRD_PERSON_VISUAL_REFERENCE';
    proxy.visible = false;
    proxy.position.set(0, 0.02, 0);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xbfd3df,
      roughness: 0.42,
      metalness: 0.55,
      emissive: 0x102532,
      emissiveIntensity: 0.32
    });
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x7fe8ff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x314250,
      roughness: 0.5,
      metalness: 0.45,
      emissive: 0x07131a,
      emissiveIntensity: 0.18
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.38, 3.8), hullMat);
    body.position.z = -0.15;
    proxy.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.25, 4), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -2.65;
    proxy.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 12), glassMat);
    canopy.scale.set(0.8, 0.32, 1.05);
    canopy.position.set(0, 0.34, -0.78);
    proxy.add(canopy);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.05), wingMat);
    wings.position.set(0, -0.04, 0.22);
    proxy.add(wings);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.92, 0.85), wingMat);
    tail.position.set(0, 0.34, 1.55);
    proxy.add(tail);

    const navLeft = new THREE.PointLight(0x66ffcc, 1.4, 9, 1.2);
    navLeft.position.set(-1.95, 0.06, -0.12);
    const navRight = new THREE.PointLight(0xff7766, 1.4, 9, 1.2);
    navRight.position.set(1.95, 0.06, -0.12);
    proxy.add(navLeft, navRight);

    shipRig.add(proxy);
    this.shipProxy = proxy;
  }

  // Iluminación de cabina (solo en primera persona) para que se vea detallada.
  buildInteriorLights(shipRig) {
    this.interiorLights = [];
    const defs = [
      [0x7fc8ff, 0,  1.5, -1.8, 7],   // azul tablero (hacia el parabrisas)
      [0xff9a55, 0,  2.0,  2.2, 9],   // cálido detrás de la cabeza
      [0x9affe0, -1.3, 1.6, -0.4, 5], // acento izq
      [0x9affe0, 1.3, 1.6, -0.4, 5]   // acento der
    ];
    for (const [color, x, y, z, dist] of defs) {
      const l = new THREE.PointLight(color, 0, dist, 1.4);
      l.position.set(x, y, z);
      shipRig.add(l);
      this.interiorLights.push(l);
    }
  }

  startFlight() {
    this.applyFlightView();
  }

  startObservation() {
    // En observación la cámara deja de seguir a la nave: solo se ve el cuerpo celeste.
    if (this.cockpit) this.cockpit.visible = false;
    if (this.arms) this.arms.visible = false;
    if (this.ship) this.ship.visible = false;
    if (this.shipProxy) this.shipProxy.visible = false;
    if (this.thrusters) this.thrusters.visible = false;
    if (this.interiorLights) this.interiorLights.forEach(l => l.intensity = 0);
  }

  update(dt, player) {
    const t = performance.now();

    if (this.introShip) this.introShip.rotation.y += dt * 0.12;   // giro lento en la cinemática

    if (this.arms?.visible) {
      const bob = Math.sin(t * 0.004) * 0.006;
      this.arms.position.y = -0.55 + bob;
      this.arms.position.x = Math.sin(t * 0.002) * 0.012;
    }

    if (this.ship?.visible) {
      const shake = Math.min((player?.speed || 0) * 0.00016, 0.012);
      this.ship.position.y = -0.18 + Math.sin(t * 0.018) * shake;
      this.ship.rotation.z = Math.sin(t * 0.014) * shake;
    }
    if (this.shipProxy?.visible) {
      const shake = Math.min((player?.speed || 0) * 0.00016, 0.012);
      this.shipProxy.position.y = 0.02 + Math.sin(t * 0.018 + 0.4) * shake;
      this.shipProxy.rotation.z = Math.sin(t * 0.014) * shake * 0.8;
    }

    // Llamas de los propulsores según el empuje. Con el turbo activo (tecla M
    // / R3) se tiñen de azul y se alargan, para que se note a simple vista.
    const turbo = !!player?.turboActive;
    if (this.thrusters?.visible && this.flames.length) {
      const throttle = player?.throttle || 0;
      const ts = t * 0.001;
      const lenBoost = turbo ? 1.8 : 1;
      for (let i = 0; i < this.flames.length; i++) {
        const { flame, outer, inner, glow } = this.flames[i];
        const flick = 0.78 + Math.sin(ts * 38 + i * 1.7) * 0.22;
        const len = (0.12 + throttle * 1.25) * flick * lenBoost;
        const wid = (0.5 + throttle * 0.7);
        flame.scale.set(wid, len, wid);
        const op = throttle > 0.02 ? 1 : 0.18;
        outer.material.color.setHex(turbo ? 0x2f8fff : 0xff7a1e);
        inner.material.color.setHex(turbo ? 0xe8f8ff : 0xbfe6ff);
        glow.material.color.setHex(turbo ? 0x4fc3ff : 0xffae4d);
        outer.material.opacity = 0.6 * op;
        inner.material.opacity = 0.95 * op;
        glow.material.opacity = 0.55 * throttle * flick;
        glow.scale.setScalar(0.8 + throttle * 1.6 * flick);
      }
      if (this.thrusterLight) {
        this.thrusterLight.color.setHex(turbo ? 0x3fb8ff : 0xff7a2a);
        this.thrusterLight.intensity = throttle * (turbo ? 4.6 : 3.2);
      }
    }

    // Estela del turbo: crece en espacio de mundo mientras está activo y se
    // retrae sola cuando se apaga.
    if (this.turboTrail) {
      if (turbo && player?.mode === 'flight') {
        player.rig.getWorldPosition(this._turboScratch);
        this.turboTrailPoints.push(this._turboScratch.clone());
        if (this.turboTrailPoints.length > this.turboTrailMax) this.turboTrailPoints.shift();
      } else if (this.turboTrailPoints.length) {
        this.turboTrailPoints.shift();
      }
      if (this.turboTrailPoints.length > 1) {
        this.turboTrail.geometry.setFromPoints(this.turboTrailPoints);
        this.turboTrail.visible = true;
      } else {
        this.turboTrail.visible = false;
      }
    }
  }
}
