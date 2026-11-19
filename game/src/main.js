// SOLMAR HEAT — bootstrap, game loop, input, menus and state machine.
// Wires the city, traffic, pedestrians, player, police, combat, missions,
// HUD, audio and save systems together.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Wanted, Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);
// ?fx=low disables antialiasing + shadows for low-end devices (and headless tests)
const LOWFX = params.get('fx') === 'low';

const G = {
  time: 0,
  mode: 'menu',
  money: 0,
  input: { keys: new Set(), mouseDX: 0, mouseDY: 0, mouseDown: false },
};

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: !LOWFX, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(LOWFX ? 1 : Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
scene.fog = new THREE.Fog(0x9fc3dd, 180, 620);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(60, 40, 60);
G.scene = scene; G.camera = camera; G.renderer = renderer;

// --- sun + sky light ---
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 520;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x8a7a5a, 0.85));

// --- systems ---
const city = buildCity(scene);
G.city = city;
G.audio = new AudioSys();
G.hud = new HUD(G);
G.traffic = new Traffic(G, city);
G.peds = new Pedestrians(G, city);
G.player = new Player(G, city);
G.wanted = new Wanted(G);
G.police = new Police(G, city);
G.combat = new Combat(G);
G.missions = new Missions(G);
G.saveGame = () => saveGame(G);

// --- state transitions ---

// Pointer lock needs a user gesture; in headless/test contexts it rejects
// asynchronously, so swallow the promise rejection as well as sync throws.
function lockPointer() {
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

G.startGame = (mode, save) => {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('busted').classList.add('hidden');
  document.getElementById('wasted').classList.add('hidden');
  document.getElementById('complete').classList.add('hidden');
  G.hud.show();
  G.mode = 'playing';
  G.audio.init();
  if (save) {
    G.money = save.money;
    G.player.pos.set(save.x, 0, save.z);
    G.player.health = save.health || 100;
    if (save.missionDone) {
      G.missions.done = true;
      G.missions.index = 5;
      G.hud.setMission('FREE ROAM · DEBT PAID');
      G.hud.setObjective('Solmar City is yours. Keep driving.');
    } else {
      G.missions.start(save.missionIndex);
    }
  } else if (mode === 'story') {
    G.money = 0;
    G.missions.start(0);
  } else {
    G.money = 250;
    G.hud.setMission('FREE ROAM');
    G.hud.setObjective('Explore Solmar City — steal a car, lose the cops, have fun.');
  }
  lockPointer();
};

G.busted = () => {
  if (G.mode !== 'playing') return;
  G.mode = 'busted';
  const fine = Math.min(500, Math.max(50, Math.round(G.money * 0.1)));
  G.money = Math.max(0, G.money - fine);
  document.getElementById('busted-fine').textContent = '$' + fine.toLocaleString('en-US');
  document.getElementById('busted').classList.remove('hidden');
  document.exitPointerLock?.();
  G.wanted.clear();
  G.audio.siren(false);
};

G.wasted = () => {
  if (G.mode !== 'playing') return;
  G.mode = 'wasted';
  G.money = Math.max(0, G.money - 300);
  document.getElementById('wasted').classList.remove('hidden');
  document.exitPointerLock?.();
  G.wanted.clear();
  G.audio.siren(false);
};

G.respawn = () => {
  const hosp = city.landmarks.hospital;
  G.player.reset({ x: hosp.x + 30, z: hosp.z });
  G.player.invuln = 3;
  document.getElementById('busted').classList.add('hidden');
  document.getElementById('wasted').classList.add('hidden');
  G.mode = 'playing';
  lockPointer();
};

G.storyComplete = () => {
  document.getElementById('complete-text').textContent =
    `Five jobs, ${'$' + (8000 + 12000 + 10000 + 14000 + 6000).toLocaleString('en-US')} earned, one debt gone. Delia Vane shakes your hand.`;
  document.getElementById('complete').classList.remove('hidden');
  document.exitPointerLock?.();
  G.mode = 'complete';
};

G.pauseGame = () => {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  G.saveGame(); // checkpoint progress so quitting from pause never loses a job
  document.getElementById('pause-stats').textContent =
    `Money $${G.money.toLocaleString('en-US')} · ${G.missions.done ? 'Story complete' : 'Job ' + (G.missions.index + 1) + ' of 5'} · Wanted ${G.wanted.stars}★`;
  document.getElementById('pause').classList.remove('hidden');
  document.exitPointerLock?.();
};

G.resumeGame = () => {
  document.getElementById('pause').classList.add('hidden');
  G.mode = 'playing';
  lockPointer();
};

// --- input ---
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { G.audio.setMuted(!G.audio.muted); return; }
  G.input.keys.add(e.code);
  if (e.code === 'KeyE' && G.mode === 'playing') {
    const p = G.player;
    if (p.inCar) { p.exitCar(); return; }
    const car = G.traffic.nearestCar(p.x, p.z, 4.5, (c) => c.isParked || c.isMission);
    if (car) {
      const wasStealable = car.isMission || car.isParked; // read before enterCar clears isParked
      p.enterCar(car);
      if (wasStealable) {
        // stealing a parked car is a crime (unless it's your own mission car you already own — keep it simple: always heat)
        G.wanted.addCrime(0.6);
        G.hud.feed('You stole a car! Someone called it in.');
      }
    }
  }
  if (e.code === 'KeyR' && G.mode === 'playing') G.combat.reload();
  if (e.code === 'Escape' && G.mode === 'playing') G.pauseGame();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => G.input.keys.delete(e.code));
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    G.input.mouseDX += e.movementX;
    G.input.mouseDY += e.movementY;
  }
});
addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  G.input.mouseDown = true;
  if (G.mode === 'playing' && !G.player.inCar) G.combat.shoot();
});
addEventListener('mouseup', () => { G.input.mouseDown = false; });
renderer.domElement.addEventListener('click', () => {
  if (G.mode === 'playing' && document.pointerLockElement !== renderer.domElement) {
    lockPointer();
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && G.mode === 'playing' && !SHOT) {
    G.pauseGame();
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- menu buttons ---
const saved = hasSave() ? loadGame() : null;
if (saved) {
  const btn = document.getElementById('btn-continue');
  btn.classList.remove('hidden');
  document.getElementById('continue-info').textContent =
    `$${saved.money.toLocaleString('en-US')} · Job ${saved.missionDone ? 'done' : (saved.missionIndex + 1) + '/5'}`;
}
document.getElementById('btn-start').addEventListener('click', () => { clearSave(); G.startGame('story'); });
document.getElementById('btn-continue').addEventListener('click', () => { if (saved) G.startGame('story', saved); });
document.getElementById('btn-freeroam').addEventListener('click', () => G.startGame('freeroam'));
document.getElementById('btn-resume').addEventListener('click', () => G.resumeGame());
document.getElementById('btn-savequit').addEventListener('click', () => {
  saveGame(G);
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  G.hud.hide();
  G.mode = 'menu';
});
document.getElementById('btn-busted').addEventListener('click', () => G.respawn());
document.getElementById('btn-wasted').addEventListener('click', () => G.respawn());
document.getElementById('btn-complete').addEventListener('click', () => {
  document.getElementById('complete').classList.add('hidden');
  G.mode = 'playing';
  lockPointer();
});

// --- interact prompt ---
function updateInteract() {
  const p = G.player;
  if (G.mode !== 'playing') { G.hud.hideInteract(); return; }
  if (p.inCar) { G.hud.showInteract('exit the car'); return; }
  const car = G.traffic.nearestCar(p.x, p.z, 4.5, (c) => c.isParked || c.isMission);
  if (car) G.hud.showInteract(car.isMission ? 'take the mission car' : `steal the ${car.kind === 'sport' ? 'sports car' : 'car'}`);
  else G.hud.hideInteract();
}

// --- main loop ---
let menuAngle = 0;
let lastT = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  G.time += dt;
  if (G.mode === 'menu') {
    // cinematic orbit over the city behind the title screen
    menuAngle += dt * 0.03;
    const r = 190;
    camera.position.set(Math.cos(menuAngle) * r, 95, Math.sin(menuAngle) * r);
    camera.lookAt(0, 0, 20);
    G.traffic.update(dt);
    G.peds.update(dt);
  } else if (G.mode === 'playing') {
    G.player.update(dt);
    G.traffic.update(dt);
    G.peds.update(dt);
    G.police.update(dt);
    G.wanted.update(dt);
    G.combat.update(dt);
    G.missions.update(dt);
    G.hud.update(dt);
    updateInteract();
    // sun shadow follows the player
    sun.position.set(G.player.x + 120, 180, G.player.z + 60);
    sun.target.position.set(G.player.x, 0, G.player.z);
    sun.target.updateMatrixWorld();
    if (G.player.dead) G.wasted();
  }
  renderer.render(scene, camera);
}
animate();

// --- screenshot mode: jump straight into a scenario ---
if (SHOT) {
  document.getElementById('menu').classList.add('hidden');
  applyShot(G, SHOT);
}

// expose a tiny debug handle for automated tests
window.__game = G;
window.__shotReady = false;
