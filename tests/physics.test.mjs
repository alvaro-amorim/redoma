import test from 'node:test';
import assert from 'node:assert/strict';
import { LotteryPhysics, RAPIER, DT, G, B, R, MASS, SPEC, BLADES, validateConfig } from '../public/physics.js';
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
test('configuration rejects invalid quantities and preserves current world', () => {
  for (const config of [
    {totalBalls:0,drawCount:1}, {totalBalls:101,drawCount:15},
    {totalBalls:25.5,drawCount:15}, {totalBalls:25,drawCount:26},
    {totalBalls:25,drawCount:0}, {totalBalls:25,drawCount:1.5},
    {totalBalls:NaN,drawCount:1}, {totalBalls:25,drawCount:Infinity},
    {totalBalls:'25',drawCount:15}, null
  ]) assert.throws(() => validateConfig(config), RangeError);
  const sim = new LotteryPhysics(seeded(42));
  try {
    const world = sim.world;
    assert.throws(() => sim.reset({totalBalls:1,drawCount:2}));
    assert.equal(sim.world, world);
    for (const totalBalls of [1, 25, 26, 60, 100, 10]) {
      sim.reset({ totalBalls, drawCount: totalBalls });
      assert.equal(sim.bodies.length, totalBalls);
      assert.equal(sim.phase, 'ready');
      for (let i = 0; i < sim.bodies.length; i++) {
        assert.ok(sim.bodies[i].p[1] + B < sim.layout.top);
        for (let j = i + 1; j < sim.bodies.length; j++)
          assert.ok(Math.hypot(...sim.bodies[i].p.map((p,k) => p-sim.bodies[j].p[k])) >= 2*B);
      }
    }
  } finally { sim.dispose(); }
});
test('freefall agrees with analytical gravity and configured mass', () => {
  const world = new RAPIER.World({x:0,y:-G,z:0}); world.timestep = DT;
  try {
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(B).setMass(MASS), rb);
    for (let i=0;i<120;i++) world.step();
    assert.ok(Math.abs(rb.linvel().y + G * .5) < .003);
    assert.ok(Math.abs(rb.translation().y - (1 - .5 * G * .5 ** 2)) < .012);
    assert.ok(Math.abs(rb.mass() - MASS) < 1e-7);
  } finally { world.free(); }
});
test('elastic equal-mass collision transfers velocity and conserves momentum', () => {
  const world = new RAPIER.World({x:0,y:0,z:0}); world.timestep=DT;
  try {
    const a=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-.1,0,0).setLinvel(1,0,0));
    const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(.1,0,0));
    for (const rb of [a,b]) world.createCollider(RAPIER.ColliderDesc.ball(B).setMass(MASS).setRestitution(1).setFriction(0),rb);
    for(let i=0;i<96;i++) world.step();
    assert.ok(Math.abs(a.linvel().x)<.01);
    assert.ok(Math.abs(b.linvel().x-1)<.01);
    assert.ok(Math.abs(MASS*(a.linvel().x+b.linvel().x)-MASS)<1e-6);
  } finally {world.free();}
});
test('rotor swept volume has clearance from shell', () => {
  for(const blade of BLADES) for(let i=0;i<blade.vertices.length;i+=3)
    assert.ok(Math.hypot(...blade.vertices.slice(i,i+3)) < R-.005);
});
for (const [totalBalls, drawCount, seed] of [[25,15,1701],[25,15,7204],[1,1,901],[10,10,902],[60,6,903],[100,100,904]]) {
  test('complete physical draw '+totalBalls+'/'+drawCount+' seed '+seed, {timeout:240000}, () => {
    const sim = new LotteryPhysics(seeded(seed), {totalBalls,drawCount});
    const recorded=[];
    try {
      sim.start();
      for(let i=0;i<1600/DT && sim.phase!=='complete';i++) {
        sim.step();
        assert.equal(sim.fault,null,JSON.stringify({phase:sim.phase,time:sim.time,loaded:sim.loaded,drawn:sim.drawn,fault:sim.fault}));
        recorded.push(...sim.events.splice(0));
        if (i>0 && i % (60/DT) === 0)
          console.log(JSON.stringify({totalBalls,drawCount,time:sim.time,phase:sim.phase,loaded:sim.loaded,drawn:sim.drawn.length}));
      }
      assert.equal(sim.phase,'complete',JSON.stringify({phase:sim.phase,time:sim.time,loaded:sim.loaded,drawn:sim.drawn}));
      assert.equal(sim.drawn.length,drawCount);
      assert.equal(new Set(sim.drawn).size,drawCount);
      assert.ok(sim.drawn.every(id=>Number.isInteger(id)&&id>=1&&id<=totalBalls));
      assert.equal(recorded.length,drawCount);
      assert.ok(recorded.every(e=>e.fullExit&&e.p[1]+B<SPEC.tubeEnd&&e.v[1]<0));
      assert.ok(recorded.every((e,i)=>i===0||e.time>recorded[i-1].time));
      assert.equal(sim.bodies.filter(b=>b.active).length,totalBalls-drawCount);
      for(let i=0;i<8/DT;i++) sim.step();
      assert.equal(sim.fault,null);
      assert.equal(sim.drawn.length,drawCount);
      assert.equal(sim.events.length,0);
      assert.ok(sim.bodies.filter(b=>!b.active).every(b=>b.p[1]>=SPEC.trayY+B-.004));
      sim.paused=true;
      const before=JSON.stringify({time:sim.time,positions:sim.bodies.map(b=>b.p)});
      for(let i=0;i<240;i++) sim.step();
      assert.equal(JSON.stringify({time:sim.time,positions:sim.bodies.map(b=>b.p)}),before);
      console.log(JSON.stringify({passed:true,totalBalls,drawCount,seconds:sim.time}));
      sim.reset();
      assert.deepEqual(sim.config,{totalBalls,drawCount});
      assert.equal(sim.drawn.length,0);
      assert.equal(sim.phase,'ready');
    } finally {sim.dispose();}
  });
}
test('renaming balls cannot change their trajectories or extraction order', {timeout:120000}, () => {
  const a=new LotteryPhysics(seeded(57)), b=new LotteryPhysics(seeded(57));
  try {
    for(const ball of b.bodies) ball.id=26-ball.id;
    a.start();b.start();
    for(let i=0;i<30/DT;i++){a.step();b.step();}
    assert.equal(a.fault,null);assert.equal(b.fault,null);
    assert.deepEqual(a.bodies.map(ball=>ball.p),b.bodies.map(ball=>ball.p));
    assert.ok(a.drawn.length>0);
    assert.deepEqual(a.drawn.map(id=>26-id),b.drawn);
  } finally {a.dispose();b.dispose();}
});
