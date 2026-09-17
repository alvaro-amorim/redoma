import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { LotteryPhysics, DT, B, R, SPEC, BLADES, globeProfile, surfaceOfRevolution, validateConfig } from './physics.js';

const $ = id => document.getElementById(id);
const sim = new LotteryPhysics();
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
viewport.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'Simulação 3D de um globo mecânico de sorteio');
renderer.domElement.setAttribute('role', 'img');
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture;
room.dispose(); pmrem.dispose();
const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.enablePan = false;
controls.minDistance = 8; controls.maxDistance = 24;
controls.minPolarAngle = .35; controls.maxPolarAngle = Math.PI * .64;
function resetCamera() {
  const extra = Math.max(0, (sim.layout.top - .62) * 8);
  camera.position.set(7, 3.5, (innerWidth < 760 ? 17 : 15) + extra);
  controls.target.set(0, Math.max(0, (sim.layout.top - .62) * 5), 0);
  controls.update();
}
scene.add(new THREE.HemisphereLight('#daedff', '#45505e', 2));
const key = new THREE.DirectionalLight('#fff3df', 4.5);
key.position.set(-4, 8, 6); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 8, bottom: -8 });
key.shadow.normalBias = .025; scene.add(key);
const rim = new THREE.DirectionalLight('#73b9ed', 3);
rim.position.set(5, 2, -5); scene.add(rim);
const accentLight = new THREE.PointLight('#c9f36b', 5, 10);
accentLight.position.set(0, -3.5, 1.5); scene.add(accentLight);
const machine = new THREE.Group(); machine.scale.setScalar(10); scene.add(machine);
const steel = new THREE.MeshStandardMaterial({ color: '#93a6b0', metalness: .85, roughness: .25 });
const dark = new THREE.MeshStandardMaterial({ color: '#223641', metalness: .75, roughness: .34 });
const accent = new THREE.MeshStandardMaterial({ color: '#c9f36b', emissive: '#78992d', emissiveIntensity: .3, roughness: .4 });
const glass = new THREE.MeshPhysicalMaterial({ color: '#dbf2fa', roughness: .06,
  transmission: 1, thickness: .005, ior: 1.46, transparent: true, opacity: .32,
  side: THREE.DoubleSide, depthWrite: false });
const paddleMaterial = new THREE.MeshStandardMaterial({ color: '#75bbc7', metalness: .35,
  roughness: .25, side: THREE.DoubleSide, transparent: true, opacity: .62 });
const moving = new THREE.Group(); machine.add(moving);
function mesh(geometry, material, x=0, y=0, z=0, parent=machine) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x,y,z);
  object.castShadow = material !== glass; object.receiveShadow = material !== glass;
  parent.add(object); return object;
}
function cylinder(radius, height, material, x=0,y=0,z=0,parent=machine) {
  return mesh(new THREE.CylinderGeometry(radius,radius,height,64), material,x,y,z,parent);
}
function ring(radius, thickness, material, y=0, parent=machine) {
  const object=mesh(new THREE.TorusGeometry(radius,thickness,10,96),material,0,y,0,parent);
  object.rotation.x=Math.PI/2; return object;
}
function bar(start,end,radius,material,parent=machine) {
  const a=new THREE.Vector3(...start), b=new THREE.Vector3(...end), delta=b.clone().sub(a);
  const object=cylinder(radius,delta.length(),material,0,0,0,parent);
  object.position.copy(a.add(b).multiplyScalar(.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  return object;
}
function geometryOf(data) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data.vertices,3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices,1));
  geometry.computeVertexNormals(); return geometry;
}
function surface(profile,material=glass,x=0,z=0,parent=machine) {
  return mesh(geometryOf(surfaceOfRevolution(profile)),material,x,0,z,parent);
}
surface(globeProfile);
surface([[.14,SPEC.topY],[.14,.322]]);
surface([[SPEC.tubeRadius,SPEC.bottomY],[SPEC.tubeRadius,SPEC.tubeEnd]]);
ring(.14,.0025,steel,SPEC.topY);
ring(SPEC.tubeRadius,.002,steel,SPEC.bottomY);
ring(SPEC.tubeRadius,.002,steel,SPEC.tubeEnd);
ring(R+.001,.0015,steel);
const rotorGroup=new THREE.Group();machine.add(rotorGroup);
for(const blade of BLADES) {
  const paddle=mesh(geometryOf(blade),paddleMaterial,0,0,0,rotorGroup);
  paddle.rotation.z=blade.angle;
}
mesh(new THREE.SphereGeometry(.025,24,16),steel,0,0,0,rotorGroup);
bar([0,0,-.35],[0,0,.30],.008,steel);
const motor=cylinder(.065,.095,dark,0,0,-.36);motor.rotation.x=Math.PI/2;
const upperGate=mesh(new THREE.BoxGeometry(.1,.004,.086),accent,0,SPEC.upperY,0);
const lowerGate=mesh(new THREE.BoxGeometry(.1,.004,.086),accent,0,SPEC.lowerY,0);
const hopperGate=mesh(new THREE.BoxGeometry(.3,.004,.08),steel,0,.322,0);
for(const y of [SPEC.upperY,SPEC.lowerY]) {
  bar([.04,y,0],[.16,y,0],.004,steel);
  mesh(new THREE.BoxGeometry(.04,.018,.035),dark,.15,y,0);
}
const floor=mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.2}),0,-.611,0);
floor.rotation.x=-Math.PI/2;floor.castShadow=false;floor.receiveShadow=true;
const grid=new THREE.GridHelper(32,32,'#293f4a','#1b2d39');grid.position.y=-6.1;
grid.material.transparent=true;grid.material.opacity=.4;scene.add(grid);

function rebuildMachine() {
  for(const child of [...moving.children]) {moving.remove(child);child.geometry?.dispose();}
  hopperGate.geometry.dispose();
  hopperGate.geometry=new THREE.BoxGeometry(.30,.004,sim.layout.halfDepth*2);
  for(const [x,z] of sim.layout.positions) {
    surface([[.0275,.315],[.0275,sim.layout.top]],glass,x,z,moving);
    const rim=ring(.0275,.0015,steel,sim.layout.top,moving);
    rim.position.x=x;rim.position.z=z;
  }
  const base=Math.max(.37,sim.trayRadius+.035), supportX=Math.max(.325,sim.trayRadius+.04);
  for(const sign of [-1,1]) {
    bar([sign*supportX,-.57,0],[sign*supportX,0,0],.012,dark,moving);
    bar([sign*.29,0,0],[sign*supportX,0,0],.015,steel,moving);
  }
  cylinder(base,.025,dark,0,-.585,0,moving);
  ring(base+.01,.002,accent,-.586,moving);
  cylinder(sim.trayRadius,.016,steel,0,SPEC.trayY-.008,0,moving);
  surface([[sim.trayRadius,SPEC.trayY],[sim.trayRadius,-.462]],glass,0,0,moving);
  ring(sim.trayRadius,.003,steel,-.462,moving);
}
const colors=['#efeee6','#cd292c','#f4d330','#278b46','#815439','#2862c9','#ed89b2','#171a20','#8f969b','#ed8228'];
const ballGeometry=new THREE.SphereGeometry(B,32,24);
const balls=[];
function textureFor(id) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.scale(.5,.5);
  ctx.fillStyle=colors[id%10];ctx.fillRect(0,0,1024,512);
  for(let i=0;i<4;i++) {
    const x=128+256*i;
    ctx.fillStyle='#fffdf0';ctx.beginPath();ctx.arc(x,256,94,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#16212a';ctx.font='bold 110px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(id).padStart(2,'0'),x,261);
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return texture;
}
function rebuildBalls() {
  for(const ball of balls) {machine.remove(ball);ball.material.map.dispose();ball.material.dispose();}
  balls.length=0;
  for(const body of sim.bodies) {
    const ball=mesh(ballGeometry,new THREE.MeshStandardMaterial({map:textureFor(body.id),roughness:.63}));
    ball.position.fromArray(body.p);ball.quaternion.fromArray(body.q);balls.push(ball);
  }
}
let session=1, accumulator=0, previous=null, lastUI=0;
const phaseNames={ready:'Aguardando início',loading:'Carregando as bolas',mixing:'Misturando',feeding:'Aguardando uma bola',
  isolating:'Isolando a bola',releasing:'Extraindo',between:'Misturando novamente',complete:'Sorteio concluído'};
function dirty() {
  return Number($('total-balls').value)!==sim.config.totalBalls || Number($('draw-count').value)!==sim.config.drawCount;
}
function rebuildSlots() {
  $('results').replaceChildren();
  for(let i=0;i<sim.config.drawCount;i++) {
    const item=document.createElement('li');item.textContent='·';
    item.setAttribute('aria-label','Extração '+(i+1)+': aguardando');
    $('results').appendChild(item);
  }
}
function feedback(message,error=false) {
  $('config-message').textContent=message;
  $('config-message').classList.toggle('error',error);
}
function updateUI() {
  const {totalBalls,drawCount}=sim.config, count=sim.drawn.length;
  const active=!['ready','complete'].includes(sim.phase)&&!sim.fault;
  $('count').textContent=String(count).padStart(2,'0');
  $('target').textContent=drawCount;
  $('progress').max=drawCount;$('progress').value=count;
  $('latest').textContent=count?String(sim.drawn.at(-1)).padStart(2,'0'):'—';
  $('phase').textContent=sim.fault || (sim.paused?'Pausado':phaseNames[sim.phase]);
  $('status').textContent=sim.fault?'Falha na simulação':sim.paused?'Simulação pausada':phaseNames[sim.phase];
  $('remaining').textContent=sim.phase==='loading'?sim.loaded+'/'+totalBalls+' carregadas':(totalBalls-count)+' na máquina';
  $('start').disabled=sim.phase!=='ready'||!!sim.fault||dirty();
  $('pause').disabled=!active;
  $('pause').textContent=sim.paused?'Continuar':'Pausar';
  $('total-balls').disabled=active;$('draw-count').disabled=active;$('apply-config').disabled=active;
  $('rpm').textContent=Math.round(Math.abs(sim.rotor.angvel().z)*30/Math.PI);
  $('session').textContent='SESSÃO '+String(session).padStart(2,'0');
  $('format').textContent=totalBalls+' bolas · '+drawCount+' extrações';
}
function consumeEvents() {
  for(const event of sim.events.splice(0)) {
    const index=sim.drawn.indexOf(event.id), item=$('results').children[index];
    const order=document.createElement('small');order.textContent=index+1;
    item.replaceChildren(order,document.createTextNode(String(event.id).padStart(2,'0')));
    item.className='extracted';item.style.setProperty('--ball',colors[event.id%10]);
    item.setAttribute('aria-label','Extração '+(index+1)+': número '+event.id);
    $('results').scrollTop=Math.max(0,item.offsetTop-$('results').offsetTop-$('results').clientHeight+item.offsetHeight);
    $('announcement').textContent='Número '+event.id+'. '+sim.drawn.length+' de '+sim.config.drawCount+' extraídos.';
  }
}
function prepare(config) {
  sim.reset(config);accumulator=0;previous=null;session++;
  rebuildMachine();rebuildBalls();rebuildSlots();resetCamera();
  $('total-balls').value=sim.config.totalBalls;$('draw-count').value=sim.config.drawCount;
  $('draw-count').max=sim.config.totalBalls;
  feedback(sim.config.totalBalls+' bolas · '+sim.config.drawCount+' extrações, sem reposição.');
  $('announcement').textContent='Novo sorteio preparado.';
  updateUI();
}
$('configuration').addEventListener('submit',event=>{
  event.preventDefault();
  try {prepare(validateConfig({totalBalls:Number($('total-balls').value),drawCount:Number($('draw-count').value)}));}
  catch(error){feedback(error.message,true);}
});
for(const id of ['total-balls','draw-count']) $(id).addEventListener('input',()=>{
  const total=Number($('total-balls').value);
  $('draw-count').max=Number.isInteger(total)&&total>=1&&total<=100?total:100;
  feedback(dirty()?'Clique em Aplicar e preparar para usar as novas quantidades.':'Configuração aplicada.');
  updateUI();
});
$('start').addEventListener('click',()=>{sim.start();updateUI();});
$('pause').addEventListener('click',()=>{sim.paused=!sim.paused;accumulator=0;previous=null;updateUI();});
$('reset').addEventListener('click',()=>prepare(sim.config));
$('camera').addEventListener('click',resetCamera);
$('speed').addEventListener('input',()=>{$('speed-value').textContent=Number($('speed').value).toLocaleString('pt-BR')+'×';});
document.addEventListener('visibilitychange',()=>{previous=null;accumulator=0;});
new ResizeObserver(()=>{
  const width=viewport.clientWidth,height=viewport.clientHeight;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
}).observe(viewport);
rebuildMachine();rebuildBalls();rebuildSlots();resetCamera();updateUI();
$('loading').hidden=true;
renderer.setAnimationLoop(now=>{
  const elapsed=previous===null?0:Math.min(.1,(now-previous)/1000);previous=now;
  if(!document.hidden&&!sim.paused&&!sim.fault) {
    accumulator+=elapsed*Number($('speed').value);
    let steps=0;
    while(accumulator>=DT&&steps<96) {sim.step();accumulator-=DT;steps++;}
    // Overloaded devices slow playback instead of enlarging the integration step.
    if(steps===96) accumulator=Math.min(accumulator,DT);
    consumeEvents();
  }
  const alpha=sim.paused||sim.fault?1:accumulator/DT;
  sim.bodies.forEach((body,i)=>{
    balls[i].position.set(...body.p.map((p,k)=>body.prev[k]+(p-body.prev[k])*alpha));
    balls[i].quaternion.fromArray(body.q);
  });
  const rotation=sim.rotor.rotation();rotorGroup.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);
  upperGate.position.x=sim.upper*.105;lowerGate.position.x=sim.lower*.105;hopperGate.position.x=sim.hopper*.32;
  if(now-lastUI>100){updateUI();lastUI=now;}
  controls.update();renderer.render(scene,camera);
});
