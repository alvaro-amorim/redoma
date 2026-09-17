import RAPIER from './vendor/rapier.mjs';
await RAPIER.init();
export { RAPIER };

// SI units: metres, kilograms, seconds.
export const R = 0.30, B = 0.025, MASS = 0.066, DT = 1 / 240, G = 9.81;
export const MAX_BALLS = 100;
export const DEFAULT_CONFIG = Object.freeze({ totalBalls: 25, drawCount: 15 });
export const SPEC = Object.freeze({
  radius: R, ballRadius: B, ballMass: MASS,
  topY: Math.sqrt(R * R - 0.14 ** 2),
  bottomY: -Math.sqrt(R * R - 0.036 ** 2),
  tubeRadius: 0.036, tubeEnd: -0.425,
  upperY: -0.306, lowerY: -0.371,
  trayY: -0.555, rpm: 62
});
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const qz = a => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });

export function validateConfig(config) {
  const { totalBalls, drawCount } = config || {};
  if (!Number.isInteger(totalBalls) || totalBalls < 1 || totalBalls > MAX_BALLS)
    throw new RangeError('O total deve ser um inteiro entre 1 e ' + MAX_BALLS + '.');
  if (!Number.isInteger(drawCount) || drawCount < 1 || drawCount > totalBalls)
    throw new RangeError('A quantidade sorteada deve ser um inteiro entre 1 e o total de bolas.');
  return { totalBalls, drawCount };
}

export function loadingLayout(total) {
  const positions = [];
  if (total <= 25) {
    const count = Math.min(total, 5);
    for (let i = 0; i < count; i++) positions.push([(i - (count - 1) / 2) * 0.055, 0]);
  } else {
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        if (x * x + z * z <= 4) positions.push([x * 0.055, z * 0.055]);
  }
  return {
    positions, halfDepth: total <= 25 ? 0.04 : 0.15,
    top: Math.max(0.42, 0.350 + (Math.ceil(total / positions.length) - 1) * 0.052 + 0.055)
  };
}

// Exactly the same triangulated surfaces are used by the renderer and collider.
export function surfaceOfRevolution(profile, segments = 96) {
  const vertices = [], indices = [];
  for (const [radius, y] of profile)
    for (let j = 0; j < segments; j++) {
      const angle = 2 * Math.PI * j / segments;
      vertices.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
    }
  for (let i = 0; i < profile.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j, b = i * segments + (j + 1) % segments;
      const c = a + segments, d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export const globeProfile = Array.from({ length: 81 }, (_, i) => {
  const start = Math.acos(SPEC.topY / R), end = Math.acos(SPEC.bottomY / R);
  const angle = start + (end - start) * i / 80;
  return [R * Math.sin(angle), R * Math.cos(angle)];
});
const outline = [[0.025, -0.19]];
for (let i = 0; i <= 16; i++) {
  const z = -0.19 + 0.38 * i / 16;
  outline.push([Math.sqrt(0.270 ** 2 - z * z), z]);
}
outline.push([0.025, 0.19]);
const bladeVertices = [], bladeIndices = [], N = outline.length;
for (const y of [-0.006, 0.006]) for (const [x, z] of outline) bladeVertices.push(x, y, z);
for (let i = 1; i < N - 1; i++) bladeIndices.push(0, i + 1, i, N, N + i, N + i + 1);
for (let i = 0; i < N; i++) {
  const j = (i + 1) % N;
  bladeIndices.push(i, j, N + i, j, N + j, N + i);
}
export const BLADES = Array.from({ length: 3 }, (_, k) => ({
  angle: k * Math.PI * 2 / 3,
  vertices: new Float32Array(bladeVertices), indices: new Uint32Array(bladeIndices)
}));
function entropy() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export class LotteryPhysics {
  constructor(random = entropy, config = DEFAULT_CONFIG) {
    this.random = random;
    this.reset(config);
  }

  reset(config = this.config) {
    const validated = validateConfig(config); // Reject before destroying the current run.
    this.world?.free();
    this.config = Object.freeze(validated);
    this.layout = loadingLayout(validated.totalBalls);
    this.trayRadius = Math.max(0.20, 0.20 * Math.sqrt(validated.drawCount / 25));
    this.world = new RAPIER.World(v(0, -G, 0));
    this.world.timestep = DT;
    this.world.numSolverIterations = 12;
    this.world.integrationParameters.maxCcdSubsteps = 4;
    this.world.integrationParameters.lengthUnit = 0.1;
    Object.assign(this, {
      time: 0, phaseTime: 0, phase: 'ready', paused: false,
      drawn: [], events: [], bodies: [], fault: null, loaded: 0,
      upper: 0, lower: 0, hopper: 0, motorTarget: 0, motorWork: 0, lastTorque: 0
    });

    // Group 1: stationary surfaces and sliders. Group 2: balls. Group 4: rotor.
    // The rotor's swept envelope never intersects the shell or closed sliders.
    // Filtering those disjoint pairs avoids unnecessary rotating-trimesh CCD.
    const fixed = desc => this.world.createCollider(desc
      .setCollisionGroups(0x00010002).setFriction(0.32).setRestitution(0.35));
    const shell = profile => {
      const { vertices, indices } = surfaceOfRevolution(profile);
      return RAPIER.ColliderDesc.trimesh(vertices, indices);
    };
    fixed(shell(globeProfile));
    fixed(shell([[0.14, SPEC.topY], [0.14, 0.322]]));
    fixed(shell([[SPEC.tubeRadius, SPEC.bottomY], [SPEC.tubeRadius, SPEC.tubeEnd]]));
    for (const [x, z] of this.layout.positions)
      fixed(shell([[0.0275, 0.315], [0.0275, this.layout.top]]).setTranslation(x, 0, z));

    this.rotor = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .enabledTranslations(false, false, false).enabledRotations(false, false, true)
      .setCanSleep(false).setCcdEnabled(true));
    for (const blade of BLADES)
      this.world.createCollider(RAPIER.ColliderDesc.convexHull(blade.vertices)
        .setRotation(qz(blade.angle)).setCollisionGroups(0x00040002)
        .setMass(0.165).setFriction(0.12).setRestitution(0.28), this.rotor);
    this.world.createCollider(RAPIER.ColliderDesc.ball(0.025)
      .setMass(0.15).setCollisionGroups(0x00040002), this.rotor);
    const slider = (y, hx, hz) => {
      const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, y, 0));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.002, hz)
        .setCollisionGroups(0x00010002).setFriction(0.22).setRestitution(0.1), rb);
      return rb;
    };
    this.hopperBody = slider(0.322, 0.15, this.layout.halfDepth);
    this.upperBody = slider(SPEC.upperY, 0.05, 0.043);
    this.lowerBody = slider(SPEC.lowerY, 0.05, 0.043);
    fixed(RAPIER.ColliderDesc.cylinder(0.008, this.trayRadius).setTranslation(0, SPEC.trayY - 0.008, 0));
    fixed(shell([[this.trayRadius, SPEC.trayY], [this.trayRadius, -0.462]]));

    for (let i = 0; i < validated.totalBalls; i++) {
      const slot = this.layout.positions[i % this.layout.positions.length];
      const x = slot[0] + (this.random() - 0.5) * 0.001;
      const z = slot[1] + (this.random() - 0.5) * 0.001;
      const y = 0.350 + Math.floor(i / this.layout.positions.length) * 0.052;
      const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z).setCcdEnabled(true).setCanSleep(true));
      this.world.createCollider(RAPIER.ColliderDesc.ball(B).setMass(MASS)
        .setCollisionGroups(0x00020007).setFriction(0.48).setRestitution(0.57)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min), rb);
      const angle = this.random() * Math.PI * 2;
      rb.setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }, true);
      this.bodies.push({ id: i + 1, rb, active: true, entered: false,
        p: [x, y, z], prev: [x, y, z], v: [0, 0, 0], w: [0, 0, 0], q: [0, 0, 0, 1] });
    }
    this.sync();
  }

  start() { if (this.phase === 'ready' && !this.fault) this.change('loading'); }
  change(phase) { this.phase = phase; this.phaseTime = 0; }
  moveSlider(body, current, target, y, travel) {
    const next = current + clamp(target - current, -DT * 5, DT * 5);
    body.setNextKinematicTranslation(v(next * travel, y, 0));
    return next;
  }
  sync() {
    for (const b of this.bodies) {
      const p = b.rb.translation(), q = b.rb.rotation(), vel = b.rb.linvel(), w = b.rb.angvel();
      b.p = [p.x, p.y, p.z]; b.q = [q.x, q.y, q.z, q.w];
      b.v = [vel.x, vel.y, vel.z]; b.w = [w.x, w.y, w.z];
    }
  }
  step() {
    if (this.paused || this.fault) return;
    this.time += DT; this.phaseTime += DT;
    let upperTarget = 0, lowerTarget = 0, hopperTarget = this.phase === 'loading' ? 1 : 0;
    if (this.phase === 'loading' && this.loaded === this.config.totalBalls) {
      this.change('mixing'); hopperTarget = 0;
    }
    if (this.phase === 'mixing' && this.phaseTime >= 8) this.change('feeding');
    if (this.phase === 'between' && this.phaseTime >= 3) this.change('feeding');
    if (this.phase === 'feeding') upperTarget = 1;
    if (this.phase === 'isolating' && this.upper < 0.001 && this.phaseTime > 0.23) this.change('releasing');
    if (this.phase === 'releasing') lowerTarget = 1;
    this.hopper = this.moveSlider(this.hopperBody, this.hopper, hopperTarget, 0.322, 0.32);
    this.upper = this.moveSlider(this.upperBody, this.upper, upperTarget, SPEC.upperY, 0.105);
    this.lower = this.moveSlider(this.lowerBody, this.lower, lowerTarget, SPEC.lowerY, 0.105);
    this.motorTarget = ['mixing', 'feeding', 'isolating', 'releasing', 'between'].includes(this.phase)
      ? SPEC.rpm * Math.PI / 30 : 0;
    const omega = this.rotor.angvel().z;
    const torque = clamp((this.motorTarget - omega) * 2, -10, 10);
    this.rotor.resetTorques(true);
    this.rotor.addTorque(v(0, 0, torque), true);
    this.lastTorque = torque; this.motorWork += torque * omega * DT;
    for (const b of this.bodies) {
      b.prev = [...b.p];
      b.rb.resetForces(false);
      const speed = Math.hypot(...b.v);
      const drag = 0.5 * 1.225 * 0.47 * Math.PI * B * B * speed;
      b.rb.addForce(v(-drag * b.v[0], -drag * b.v[1], -drag * b.v[2]), false);
    }
    this.world.step();
    this.sync();
    for (const b of this.bodies)
      if (!b.entered && b.p[1] + B < SPEC.topY) b.entered = true;
    this.loaded = this.bodies.filter(b => b.entered).length;
    if (this.phase === 'feeding' && this.bodies.some(b => b.active &&
      b.p[1] + B < SPEC.upperY - 0.003 && b.p[1] > SPEC.lowerY)) this.change('isolating');

    // Geometric full-exit crossing; labels never participate in the mechanics.
    const exits = this.bodies.filter(b => b.active && b.prev[1] + B >= SPEC.tubeEnd &&
      b.p[1] + B < SPEC.tubeEnd && b.v[1] < 0)
      .map(b => ({ b, fraction: (b.prev[1] + B - SPEC.tubeEnd) / (b.prev[1] - b.p[1]) }))
      .sort((a, b) => a.fraction - b.fraction);
    for (const { b, fraction } of exits) {
      if (this.phase !== 'releasing' || this.loaded !== this.config.totalBalls ||
        this.drawn.length >= this.config.drawCount) {
        this.fault = 'Saída fora do ciclo mecânico. Inicie um novo sorteio.'; break;
      }
      b.active = false;
      this.drawn.push(b.id);
      this.events.push({ id: b.id, time: this.time - DT + fraction * DT,
        p: [...b.p], v: [...b.v], fullExit: b.p[1] + B < SPEC.tubeEnd });
      this.change(this.drawn.length === this.config.drawCount ? 'complete' : 'between');
    }
    if (this.bodies.some(b => b.p.some(n => !Number.isFinite(n)) ||
      Math.abs(b.p[0]) > 0.7 || Math.abs(b.p[2]) > 0.7 ||
      b.p[1] < -0.7 || b.p[1] > this.layout.top + 0.2))
      this.fault = 'Falha de confinamento físico. Inicie um novo sorteio.';
  }
  dispose() { this.world.free(); }
}
