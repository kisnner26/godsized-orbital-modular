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
    this.despawnMeteor();
  }

  // Meteoro que cruza cerca de la nave durante el abordaje. La trayectoria es
  // una recta cuyo punto de máxima aproximación queda deliberadamente a ~9.7
  // unidades del centro de la nave: la Orion-07 clonada en la intro mide como
  // mucho 7.4*1.5=11.1 unidades en su eje más largo (radio ≈5.55), así que el
  // meteoro pasa con un margen amplio y jamás llega a tocarla.
  spawnMeteorFlyby(shipWorldPos) {
    this.despawnMeteor();

    const rockGeo = new THREE.IcosahedronGeometry(0.85, 1);
    const posAttr = rockGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const n = 1 + (Math.random() - 0.5) * 0.4;
      posAttr.setXYZ(i, posAttr.getX(i) * n, posAttr.getY(i) * n, posAttr.getZ(i) * n);
    }
    posAttr.needsUpdate = true;
    rockGeo.computeVertexNormals();

    const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({
      color: 0x3a2a22, roughness: 0.92, metalness: 0.08,
      emissive: 0xff5a1e, emissiveIntensity: 1.5
    }));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: 0xffb066, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(4.4, 4.4, 1);

    const group = new THREE.Group();
    group.add(rock, glow);
    group.visible = false;
    this.scene.add(group);

    const light = new THREE.PointLight(0xff9a4a, 9, 45, 1.4);
    group.add(light);

    const trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xff9a4a, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    trail.frustumCulled = false;
    this.scene.add(trail);

    const closest = shipWorldPos.clone().add(new THREE.Vector3(3, 6, -7));
    const dir = new THREE.Vector3(1, -0.1, 0.05).normalize();
    const half = 45;

    this.meteor = {
      group, rock, trail,
      start: closest.clone().addScaledVector(dir, -half),
      end: closest.clone().addScaledVector(dir, half),
      delay: 0.8, duration: 2.4, elapsed: 0,
      trailPoints: []
    };
  }

  despawnMeteor() {
    if (!this.meteor) return;
    const m = this.meteor;
    this.scene.remove(m.group);
    this.scene.remove(m.trail);
    m.rock.geometry.dispose();
    m.rock.material.dispose();
    m.trail.geometry.dispose();
    m.trail.material.dispose();
    this.meteor = null;
  }

  updateMeteor(dt) {
    const m = this.meteor;
    if (!m) return;
    m.elapsed += dt;
    const localT = m.elapsed - m.delay;
    if (localT < 0) return;
    if (localT > m.duration) { this.despawnMeteor(); return; }

    m.group.visible = true;
    const k = localT / m.duration;
    m.group.position.lerpVectors(m.start, m.end, k);
    m.rock.rotation.x += dt * 3.2;
    m.rock.rotation.y += dt * 2.1;
    m.trailPoints.push(m.group.position.clone());
    if (m.trailPoints.length > 14) m.trailPoints.shift();
    m.trail.geometry.setFromPoints(m.trailPoints);
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
  // vacío (sin geometría ni material ahí, se ve directo al vacío) y tiene
  // forma de cúpula: ancho a media altura y estrecho arriba/abajo. Medido
  // por barrido de raycasting (pitch -10°..22°, yaw ±38° desde la cámara
  // real) contra la única malla sólida de la cabina: en espacio local del
  // GLB la abertura ocupa x∈[-0.49,0.49], y∈[-0.05,0.42] (centro≈0.185,
  // ancho≈0.99, alto≈0.46) — el doble de alto que la primera medición, que
  // dejaba un hueco visible arriba. El cristal es un plano recto (no la
  // cúpula real), así que se agranda un ~7-12% sobre lo medido: donde sobra,
  // la propia cúpula del marco (más cerca de la cámara en las esquinas
  // altas) lo tapa por delante gracias al depth test normal. Verificado a
  // pixel comparando renders con/sin cristal en toda la abertura: cobertura
  // completa salvo un puñado de píxeles a <1/255 de diferencia justo en el
  // borde superior (ruido de muestreo, no hueco real). Agrandar aún más el
  // plano (probado hasta +24%/+38%) no cambió ese resultado, así que si el
  // hueco se sigue viendo, el problema no es el tamaño de este cristal.
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
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.52, 12, 6), glassMat);
    glass.position.set(0, 0.185, -0.78);
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
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.54, 12, 6), rimMat);
    rim.position.copy(glass.position);
    rim.rotation.copy(glass.rotation);
    rim.renderOrder = 1;
    cockpitRoot.add(rim);
    this.windshieldGlass = glass;
  }

  // El export de Meshy trae, fusionado en la misma malla única de la cabina,
  // un soporte/caja de equipo que cuelga justo en el hueco del parabrisas
  // (centro-arriba). Al ser una sola malla sin sub-objetos ni grupos de
  // materiales no se puede ocultar con visible=false ni por material aparte;
  // en su lugar se descartan sus fragmentos en el shader según su posición
  // local (caja medida por barrido de raycasting: x∈[-0.19,0.17],
  // y∈[0.39,0.54], z∈[-0.57,-0.29]). Detrás no queda vacío: ahí mismo pasa
  // el cristal del parabrisas, así que el hueco se ve como más ventana, no
  // como un agujero — confirmado comparando renders con/sin este parche.
  maskInteriorObstruction(cockpitRoot) {
    let hull = null;
    cockpitRoot.traverse(o => { if (o.isMesh && o.geometry?.type !== 'PlaneGeometry') hull = o; });
    if (!hull) return;
    hull.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
        .replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n' +
          'if (vLocalPos.x > -0.19 && vLocalPos.x < 0.17 && vLocalPos.y > 0.39 && vLocalPos.y < 0.54 && ' +
          'vLocalPos.z > -0.57 && vLocalPos.z < -0.29) discard;');
    };
    hull.material.needsUpdate = true;
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
    this.maskInteriorObstruction(cockpit);
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
    await this.loadAstronaut(shipRig);
  }

  // Astronauta a pie (tercera persona): mismo rig que la nave (Player usa un
  // único this.rig tanto para volar como para caminar), así que basta con
  // colgarlo del mismo shipRig y alternar su visibilidad. En primera persona
  // a pie no debe verse nada del cuerpo (solo la cámara), así que este
  // modelo se oculta por completo en ese caso — ver Player.updateOnFoot.
  async loadAstronaut(shipRig) {
    try {
      const astro = await this.loader.load('astronauta EVA', './assets/models/astronaut_avatar.glb');
      this.loader.normalize(astro, 0.42);
      astro.name = 'ONFOOT_ASTRONAUT_MODEL';
      astro.position.set(0, -0.34, 0);
      astro.visible = false;
      astro.traverse(o => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      shipRig.add(astro);
      this.astronaut = astro;
    } catch (err) {
      console.warn('No se pudo cargar el modelo del astronauta a pie:', err);
    }
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

  // Marcador de "nave aparcada": un clon de la nave real (comparte geometría
  // y materiales, así que clonarla es barato) colocado en un punto fijo del
  // mundo mientras el jugador explora a pie — se ve la Orion-07 tal cual,
  // esperando exactamente donde aterrizó, en vez de un marcador genérico.
  showLandedMarker(position, quaternion) {
    if (!this.landedMarker && this.ship) {
      this.landedMarker = this.ship.clone(true);
      this.landedMarker.name = 'ORION_07_LANDED_MARKER';
      this.landedMarker.traverse(o => { if (o.isLight) o.intensity *= 0.6; });
      this.scene.add(this.landedMarker);
    }
    if (!this.landedMarker) return;
    this.landedMarker.position.copy(position);
    this.landedMarker.quaternion.copy(quaternion);
    this.landedMarker.visible = true;
  }

  hideLandedMarker() {
    if (this.landedMarker) this.landedMarker.visible = false;
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

  // A pie: la cámara ya no es la nave, así que se ocultan cabina, brazos,
  // nave y toberas — solo queda visible el marcador de nave aparcada (y,
  // en tercera persona, el astronauta).
  startOnFoot() {
    if (this.cockpit) this.cockpit.visible = false;
    if (this.arms) this.arms.visible = false;
    if (this.ship) this.ship.visible = false;
    if (this.shipProxy) this.shipProxy.visible = false;
    if (this.thrusters) this.thrusters.visible = false;
    if (this.interiorLights) this.interiorLights.forEach(l => l.intensity = 0);
    this.onFoot = true;
  }

  // Primera persona a pie: solo la cámara, nada de cuerpo a la vista (ni
  // manos ni nada). Tercera persona: se ve el modelo 3D completo del
  // astronauta, que ya cuelga del mismo rig que controla Player.
  applyFootView(firstPerson) {
    if (this.astronaut) this.astronaut.visible = !!this.onFoot && !firstPerson;
  }

  update(dt, player) {
    const t = performance.now();

    if (this.introShip) this.introShip.rotation.y += dt * 0.12;   // giro lento en la cinemática
    this.updateMeteor(dt);

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
