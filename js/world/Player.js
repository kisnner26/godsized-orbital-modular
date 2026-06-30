import * as THREE from 'three';

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const cameraTarget = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Player {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;

    this.rig = new THREE.Group();
    this.rig.name = 'ORION_07_FLIGHT_RIG';
    this.rig.position.set(0, 0, 14);
    this.rig.add(camera);

    // Luz de inspección (solo en observación): ilumina la cara del planeta que
    // mira a la cámara, para que siempre se vea su textura aunque esté de noche.
    this.headlight = new THREE.PointLight(0xffffff, 0, 60, 1.2);
    this.camera.add(this.headlight);

    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.throttle = 0;       // 0..1, nivel de empuje actual (para llamas/audio)
    this.boosting = false;
    this.thrustScale = 0.35;
    this.maxSpeed = 120;
    this.speedMetersPerSecond = 0;
    this.o2 = 0.89;
    this.mode = 'cinematic';
    this.gameplayMode = 'solar';
    this.timer = 0;
    this.terrainProvider = null;
    this.altitudeMeters = 0;
    this.biome = 'ESPACIO';
    this.insideAtmosphere = false;
    this.hazard = 'none';
    this.hazardLevel = 0;
    this.hull = 1;
    this.flightStatus = 'ACTIVOS';
    this.statusEvent = '';
    this.collapseTimer = 0;
    this.collapseSample = null;
    this.groundClearance = 1.8;
    this.floatingOriginOffset = new THREE.Vector3();
    this.floatingOriginThreshold = 50000;

    this.shipYaw = 0;
    this.shipPitch = 0;
    this.shipRoll = 0;

    this.cinematicCam = new THREE.Vector3(0, 1.55, 1.28);
    this.chaseCam = new THREE.Vector3(0, 3.15, 15.5);
    this.chaseLook = new THREE.Vector3(0, 0.35, -3.5);
    this.explorationChaseCam = new THREE.Vector3(0, 4.9, 22.5);
    this.explorationChaseLook = new THREE.Vector3(0, 0.18, -2.2);

    this.firstPerson = false;                    // vista de cabina (FPS)
    this.fpCam = new THREE.Vector3(0, 1.55, -0.15); // posición del ojo del piloto

    this.approach = null;
    this.approachFinished = false;
    this.observation = null;
    this.preObservation = null;
  }

  update(dt) {
    if (this.mode === 'cinematic') this.updateCockpitCinematic(dt);
    else if (this.mode === 'intro') this.updateIntro(dt);
    else if (this.mode === 'approach') this.updateApproach(dt);
    else if (this.mode === 'observe') this.updateObservation(dt);
    else this.updateFlight(dt);

    this.speedMetersPerSecond = this.speed * 8;
    if (this.mode !== 'flight') this.updateTerrainTelemetry();
  }

  // Cinemática de abordaje en primera persona: el astronauta flota hacia la
  // Orion-07 (EVA), entra, y se sienta en la cabina antes del vuelo.
  startIntro(shipWorldPos) {
    this.mode = 'intro';
    this.timer = 0;
    this.introStage = 0;
    this.introFinished = false;
    this.introTarget = shipWorldPos.clone();
    this.introBaseAngle = 0.6;
    this.flightStartPos = new THREE.Vector3(0, 1.2, 52);
    this.rig.position.set(this.introTarget.x + 24, this.introTarget.y + 5, this.introTarget.z);
    this.rig.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
  }

  updateIntro(dt) {
    this.timer += dt;
    const t = this.timer;
    // 0: toma exterior orbital de la nave · 1: fundido · 2: sentarse en cabina · 3: fin
    const stage = t < 3.6 ? 0 : t < 4.3 ? 1 : t < 6.6 ? 2 : 3;
    this.introStage = stage;

    if (stage <= 1) {
      // Plano exterior: la cámara orbita la nave acercándose (sin manos: no surreal).
      const k = Math.min(t / 4.3, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const ang = this.introBaseAngle + e * 0.9;
      const rad = THREE.MathUtils.lerp(26, 15, e);
      this.rig.position.set(
        this.introTarget.x + Math.cos(ang) * rad,
        this.introTarget.y + 5 - e * 2.5,
        this.introTarget.z + Math.sin(ang) * rad
      );
      this.rig.rotation.set(0, 0, 0);
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(this.introTarget);
    } else {
      // Interior: el piloto se sienta (dolly continuo hacia el asiento).
      this.rig.position.copy(this.flightStartPos);
      this.rig.rotation.set(0, 0, 0);
      const s = Math.min((t - 4.3) / 2.3, 1);
      const e = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
      const startPos = tmp.set(0, 2.3, 2.4);
      const seat = tmp2.set(this.fpCam.x, this.fpCam.y, this.fpCam.z);
      this.camera.position.lerpVectors(startPos, seat, e);
      this.camera.rotation.set(THREE.MathUtils.lerp(-0.34, -0.16, e), 0, 0);
    }

    this.speed = 0;
    if (stage === 3 && !this.introFinished) this.introFinished = true;
  }

  updateCockpitCinematic(dt) {
    this.timer += dt;
    const t = this.timer;

    this.rig.position.set(0, 0, 14);
    this.rig.rotation.set(0, Math.sin(t * 0.12) * 0.04, 0);

    this.camera.position.set(
      Math.sin(t * 0.42) * 0.38,
      1.48 + Math.sin(t * 0.55) * 0.05,
      1.32 + Math.cos(t * 0.35) * 0.10
    );

    cameraTarget.set(
      Math.sin(t * 0.22) * 1.35,
      1.34 + Math.sin(t * 0.31) * 0.16,
      -5.2
    );
    this.camera.lookAt(cameraTarget);
    this.speed = 0;
  }

  startSimulation() {
    this.mode = 'flight';
    this.timer = 0;
    this.input.yaw = 0;
    this.input.pitch = -0.08;

    this.shipYaw = 0;
    this.shipPitch = -0.08;
    this.shipRoll = 0;

    this.rig.position.set(0, 1.2, 52);
    this.rig.rotation.set(0, 0, 0);
    this.vel.set(0, 0, -0.35);
    this.hull = Math.max(this.hull, 0.55);
    this.flightStatus = 'ACTIVOS';
    this.hazard = 'none';
    this.hazardLevel = 0;
    this.collapseTimer = 0;

    this.camera.position.copy(this.chaseCam);
    this.camera.lookAt(this.chaseLook);
  }

  // Secuencia CINEMATOGRÁFICA de ~5 s: la cámara hace una toma orbital del
  // sistema solar acercándose, sin la nave. Al terminar, se inicia la observación.
  beginSolarApproach(solarCenter) {
    if (this.mode !== 'flight') return;
    this.mode = 'approach';
    this.timer = 0;
    this.approachFinished = false;
    this.input.keys = {};
    this.throttle = 0;

    const start = this.rig.position.clone();
    const offset = start.clone().sub(solarCenter);
    const baseAngle = Math.atan2(offset.z, offset.x);
    const startRadius = Math.max(offset.length(), 70);

    this.approach = {
      center: solarCenter.clone(),
      baseAngle,
      startRadius,
      duration: 5.0
    };
    this.vel.set(0, 0, 0);
  }

  updateApproach(dt) {
    this.timer += dt;
    const a = this.approach;
    const k = Math.min(this.timer / a.duration, 1);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;  // easeInOut

    // Barrido orbital cinematográfico: gira alrededor del centro acercándose.
    const angle = a.baseAngle + e * 1.15;
    const radius = THREE.MathUtils.lerp(a.startRadius, 46, e);
    const height = THREE.MathUtils.lerp(26, 10, e) + Math.sin(this.timer * 0.5) * 1.5;

    this.rig.position.set(
      a.center.x + Math.cos(angle) * radius,
      a.center.y + height,
      a.center.z + Math.sin(angle) * radius
    );
    this.rig.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(a.center);
    this.speed = (1 - k) * 7.5;
    this.throttle = 0;

    if (k >= 1 && !this.approachFinished) {
      this.approachFinished = true;
    }
  }

  // Zoom de observación (acercar/alejar el cuerpo). 1 = distancia base.
  zoomObservation(factor) {
    this.observeZoom = THREE.MathUtils.clamp((this.observeZoom || 1) * factor, 0.28, 4.5);
  }

  startObservation(targetGetter, label='PLANETA', distance=10) {
    this.observeDistance = distance;
    this.observeZoom = 1;
    if (this.mode !== 'observe') {
      this.preObservation = {
        position: this.rig.position.clone(),
        quaternion: this.rig.quaternion.clone(),
        velocity: this.vel.clone(),
        yaw: this.shipYaw,
        pitch: this.shipPitch,
        roll: this.shipRoll
      };
    }

    this.mode = 'observe';
    this.timer = 0;
    this.observation = { targetGetter, label };
    this.vel.set(0, 0, 0);
    this.input.keys = {};

    // La cámara ahora se comporta como una sonda/cámara orbital, no como nave.
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);

    // Colocamos el rig ya cerca del cuerpo para no "viajar" a través del sistema.
    const t = targetGetter?.();
    if (t) this.rig.position.set(t.x + distance, t.y + distance * 0.32, t.z);

    // Encendemos la luz de inspección proporcional a la distancia de cámara.
    if (this.headlight) { this.headlight.intensity = 2.4; this.headlight.distance = distance * 3.2; }
  }

  exitObservation() {
    // Al salir SIEMPRE regresamos a la posición/orientación inicial de vuelo,
    // para volver a ver el sistema solar desde el inicio y con control total.
    // (Antes restauraba la pose previa y la nave podía quedar "bugueada".)
    this.mode = 'flight';
    this.timer = 0;
    this.preObservation = null;
    this.approach = null;
    this.approachFinished = false;
    if (this.headlight) this.headlight.intensity = 0;

    this.input.keys = {};
    this.input.yaw = 0;
    this.input.pitch = -0.08;
    this.shipYaw = 0;
    this.shipPitch = -0.08;
    this.shipRoll = 0;
    this.throttle = 0;

    this.rig.position.set(0, 1.2, 52);
    this.rig.rotation.set(0, 0, 0);
    const euler0 = new THREE.Euler(this.shipPitch, this.shipYaw, 0, 'YXZ');
    this.rig.quaternion.setFromEuler(euler0);
    this.vel.set(0, 0, -0.35);

    this.camera.position.copy(this.chaseCam);
    this.camera.lookAt(this.chaseLook);
  }

  updateObservation(dt) {
    this.timer += dt;
    const target = this.observation?.targetGetter?.() || tmp.set(0, 0, 0);
    const isComet = this.observation?.label === 'COMETA';
    const radius = (this.observeDistance || (isComet ? 14 : 10)) * (this.observeZoom || 1);
    const height = radius * 0.32;
    const a = this.timer * (isComet ? 0.16 : 0.12);

    const camPos = tmp2.set(
      target.x + Math.cos(a) * radius,
      target.y + height + Math.sin(a * 0.62) * 2.2,
      target.z + Math.sin(a) * radius
    );

    // El rig es solo la cámara. La nave desaparece en Cockpit.startObservation().
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.lerp(camPos, 0.12);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(target);
    this.speed = 0.0;
  }

  updateFlight(dt) {
    if (this.collapseTimer > 0) {
      this.updateCollapse(dt);
      return;
    }

    this.applyKeyboardSteering(dt);
    this.shipYaw = this.input.yaw;
    this.shipPitch = THREE.MathUtils.clamp(this.input.pitch, -0.82, 0.82);

    this.shipRoll = THREE.MathUtils.lerp(
      this.shipRoll,
      (this.input.keys.KeyA ? 0.22 : 0) + (this.input.keys.KeyD ? -0.22 : 0),
      0.07
    );

    euler.set(this.shipPitch, this.shipYaw, this.shipRoll, 'YXZ');
    this.rig.quaternion.setFromEuler(euler);

    const t = performance.now() * 0.001;
    if (this.firstPerson) {
      // Vista de cabina: el ojo del piloto, mirando hacia adelante (-Z del rig).
      const sway = Math.min(this.vel.length() * 0.0009, 0.018);
      this.camera.position.set(
        this.fpCam.x + Math.sin(t * 5.0) * sway,
        this.fpCam.y + Math.cos(t * 4.2) * sway,
        this.fpCam.z
      );
      // Mira ligeramente hacia abajo para esquivar la consola superior central.
      this.camera.rotation.set(-0.16, 0, 0);
    } else {
      const chaseCam = this.gameplayMode === 'free' ? this.explorationChaseCam : this.chaseCam;
      const chaseLook = this.gameplayMode === 'free' ? this.explorationChaseLook : this.chaseLook;
      const speedShake = Math.min(this.vel.length() * 0.0014, 0.035);
      this.camera.position.set(
        chaseCam.x + Math.sin(t * 7.0) * speedShake,
        chaseCam.y + Math.cos(t * 6.0) * speedShake,
        chaseCam.z
      );
      this.camera.lookAt(chaseLook);
    }

    forward.set(0, 0, -1).applyQuaternion(this.rig.quaternion).normalize();
    right.set(1, 0, 0).applyQuaternion(this.rig.quaternion).normalize();

    const accel = new THREE.Vector3();
    const boost = this.input.keys.ShiftLeft || this.input.keys.ShiftRight;
    const scale = this.thrustScale;
    const mainThrust = (boost ? 16 : 8) * scale;
    const reverseThrust = (boost ? 10 : 5) * scale;
    const sideThrust = (boost ? 9 : 4.5) * scale;

    // Controles estándar:
    // W = avanzar, S = retroceder, A = izquierda, D = derecha.
    if (this.input.keys.KeyW) accel.addScaledVector(forward, mainThrust);
    if (this.input.keys.KeyS) accel.addScaledVector(forward, -reverseThrust);
    if (this.input.keys.KeyA) accel.addScaledVector(right, -sideThrust);
    if (this.input.keys.KeyD) accel.addScaledVector(right, sideThrust);
    if (this.input.keys.Space) accel.y += sideThrust;
    if (this.input.keys.ControlLeft || this.input.keys.ControlRight) accel.y -= sideThrust;

    this.vel.addScaledVector(accel, dt);
    const v = this.vel.length();
    if (v > this.maxSpeed) this.vel.multiplyScalar(this.maxSpeed / v);
    this.vel.multiplyScalar(0.986);
    this.rig.position.addScaledVector(this.vel, dt);
    this.applyFloatingOriginIfNeeded();
    this.applyTerrainConstraint(dt);

    // Nivel de empuje para llamas y audio
    this.boosting = !!boost;
    const fwd = this.input.keys.KeyW ? 1 : 0;
    const anyThrust = accel.lengthSq() > 1e-6 ? 1 : 0;
    this.throttle = fwd ? (boost ? 1 : 0.72) : (anyThrust ? 0.4 : 0);

    this.speed = this.vel.length();
    this.speedMetersPerSecond = this.speed * 8;
    this.o2 = Math.max(0, this.o2 - dt * 0.000035);
  }

  applyKeyboardSteering(dt) {
    const turn = 1.55 * dt;
    const pitch = 1.05 * dt;
    if (this.input.keys.ArrowLeft) this.input.yaw += turn;
    if (this.input.keys.ArrowRight) this.input.yaw -= turn;
    if (this.input.keys.ArrowUp) this.input.pitch += pitch;
    if (this.input.keys.ArrowDown) this.input.pitch -= pitch;
    this.input.pitch = THREE.MathUtils.clamp(this.input.pitch, -1.20, 1.20);
  }

  updateCollapse(dt) {
    this.collapseTimer -= dt;
    this.vel.multiplyScalar(0.88);
    this.rig.position.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();
    this.speedMetersPerSecond = this.speed * 8;
    this.throttle = 0;
    this.flightStatus = 'COLAPSO';

    const t = performance.now() * 0.001;
    const shake = Math.max(0.02, this.collapseTimer * 0.012);
    this.camera.position.set(
      this.chaseCam.x + Math.sin(t * 28) * shake,
      this.chaseCam.y + Math.cos(t * 31) * shake,
      this.chaseCam.z
    );
    this.camera.lookAt(this.chaseLook);

    if (this.collapseTimer <= 0) {
      const safe = this.terrainProvider?.getSafeSpawnNear?.(this.collapseSample) || this.terrainProvider?.getSafeSpawn?.();
      if (safe) this.rig.position.copy(safe);
      this.vel.set(0, 0, -0.45);
      this.hull = 0.55;
      this.flightStatus = 'REINICIO';
      this.statusEvent = 'Nave recuperada en una orbita segura.';
      this.collapseSample = null;
      this.input.keys = {};
    }
  }

  setEngineTuning(thrustScale, maxSpeed) {
    this.thrustScale = THREE.MathUtils.clamp(Number(thrustScale) || 0.35, 0.10, 2.0);
    this.maxSpeed = THREE.MathUtils.clamp(Number(maxSpeed) || 18, 3, 600);
  }

  setTerrainProvider(provider) {
    this.terrainProvider = provider;
    this.updateTerrainTelemetry();
  }

  updateTerrainTelemetry() {
    if (!this.terrainProvider) {
      this.altitudeMeters = 0;
      this.biome = 'ESPACIO';
      this.insideAtmosphere = false;
      this.hazard = 'none';
      this.hazardLevel = 0;
      return null;
    }
    const sample = this.terrainProvider.getTelemetryFor(this.rig.position);
    this.altitudeMeters = sample.altitudeMeters;
    this.biome = sample.biome;
    this.insideAtmosphere = sample.insideAtmosphere;
    this.hazard = sample.hazard || 'none';
    this.hazardLevel = sample.hazardLevel || 0;
    return sample;
  }

  applyTerrainConstraint(dt = 0) {
    if (!this.terrainProvider) return;
    const sample = this.terrainProvider.sampleTerrain(this.rig.position);
    this.altitudeMeters = sample.altitudeMeters;
    this.biome = sample.biome;
    this.insideAtmosphere = sample.insideAtmosphere;
    this.hazard = sample.hazard || 'none';
    this.hazardLevel = sample.hazardLevel || 0;

    if (sample.fatal) {
      this.triggerCollapse(sample, sample.hazard === 'star' ? 'Entrada en fotosfera estelar.' : 'Presion atmosferica critica.');
      return;
    }

    if (sample.hazard === 'gas') {
      this.applyGasGiantForces(sample, dt);
      return;
    }

    if (sample.hazard === 'star') {
      this.applyStarForces(sample, dt);
      return;
    }

    if (sample.altitudeUnits >= this.groundClearance) {
      if (sample.insideAtmosphere) this.flightStatus = this.hull < 0.72 ? `DAÑO ${Math.round(this.hull * 100)}%` : 'ATMOSFERA';
      else this.flightStatus = this.hull < 0.72 ? `DAÑO ${Math.round(this.hull * 100)}%` : 'ACTIVOS';
      return;
    }

    const correctedRadius = sample.surfaceRadius + this.groundClearance;
    this.rig.position.copy(sample.center).addScaledVector(sample.normal, correctedRadius);

    const inwardSpeed = this.vel.dot(sample.normal);
    if (inwardSpeed < 0) {
      const impact = Math.abs(inwardSpeed);
      if (impact > 14) {
        this.hull = Math.max(0, this.hull - (impact - 14) * 0.012);
        this.statusEvent = `Impacto contra superficie rocosa. Integridad ${Math.round(this.hull * 100)} por ciento.`;
        if (this.hull <= 0.02) {
          this.triggerCollapse(sample, 'Impacto estructural contra superficie rocosa.');
          return;
        }
      }
      this.vel.addScaledVector(sample.normal, -inwardSpeed * 1.04);
      this.vel.multiplyScalar(0.72);
    }
    this.flightStatus = this.hull < 0.72 ? `DAÑO ${Math.round(this.hull * 100)}%` : 'CONTACTO';
    this.altitudeMeters = this.groundClearance * (sample.metersPerUnit || this.terrainProvider.metersPerUnit || 1000);
  }

  applyGasGiantForces(sample, dt) {
    const pressure = THREE.MathUtils.clamp(sample.hazardLevel || 0, 0, 1);
    if (pressure <= 0) {
      this.flightStatus = this.hull < 1 ? `DAÑO ${Math.round(this.hull * 100)}%` : 'ACTIVOS';
      return;
    }

    const inward = this.vel.dot(sample.normal);
    const drag = THREE.MathUtils.lerp(0.995, 0.72, pressure);
    this.vel.multiplyScalar(Math.pow(drag, Math.max(dt * 60, 1)));
    if (inward < 0) this.vel.addScaledVector(sample.normal, -inward * pressure * 0.18);
    this.hull = Math.max(0, this.hull - dt * pressure * pressure * 0.18);
    this.flightStatus = pressure > 0.72 ? 'PRESION CRITICA' : 'ATMOSFERA DENSA';
    if (this.hull <= 0.04) this.triggerCollapse(sample, 'La nave colapso por presion de gigante gaseoso.');
  }

  applyStarForces(sample, dt) {
    const heat = THREE.MathUtils.clamp(sample.hazardLevel || 0, 0, 1);
    if (heat <= 0) return;
    this.vel.addScaledVector(sample.normal, heat * dt * 1.8);
    this.hull = Math.max(0, this.hull - dt * (0.08 + heat * heat * 0.35));
    this.flightStatus = heat > 0.55 ? 'CALOR CRITICO' : 'RADIACION';
    if (this.hull <= 0.04) this.triggerCollapse(sample, 'La nave colapso por radiacion y calor estelar.');
  }

  triggerCollapse(sample, reason) {
    if (this.collapseTimer > 0) return;
    this.collapseTimer = 2.8;
    this.collapseSample = {
      center: sample.center?.clone?.() || new THREE.Vector3(),
      normal: sample.normal?.clone?.() || new THREE.Vector3(0, 1, 0),
      surfaceRadius: sample.surfaceRadius || 0
    };
    this.hull = 0;
    this.flightStatus = 'COLAPSO';
    this.statusEvent = reason;
    this.input.keys = {};
    const outward = sample.normal?.clone?.() || new THREE.Vector3(0, 1, 0);
    this.vel.addScaledVector(outward.normalize(), 8);
  }

  applyFloatingOriginIfNeeded() {
    if (!this.terrainProvider?.shiftOrigin) return;
    if (this.rig.position.lengthSq() < this.floatingOriginThreshold * this.floatingOriginThreshold) return;
    const shift = tmp.copy(this.rig.position);
    this.rig.position.sub(shift);
    this.floatingOriginOffset.add(shift);
    this.terrainProvider.shiftOrigin(shift);
  }
}
