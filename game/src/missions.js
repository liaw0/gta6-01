// Story + missions: Rook Vega owes $50,000 to the Marlin Club. Fixer Delia
// Vane gives him five jobs. Each mission is a list of steps; the waypoint
// beacon and the minimap blip always show where to go next.
import * as THREE from 'three';
import { dist2, money } from './util.js';
import { BLOCK } from './city.js';
import { createCarMesh } from './vehicles.js';

const L = (name) => (G) => G.city.landmarks[name];

export const MISSION_DEFS = [
  {
    id: 1, title: 'FIRST FARE', pay: 8000,
    brief: 'Delia: "Rook. Package at the docks, deliver it to the Marlin Club. No detours, no cops, no questions."',
    steps: [
      { type: 'goto', at: L('docks'), radius: 10, text: 'Pick up the package at the DOCKS' },
      { type: 'goto', at: L('marlin'), radius: 10, text: 'Deliver the package to the MARLIN CLUB' },
    ],
  },
  {
    id: 2, title: 'HOT WHEELS', pay: 12000,
    brief: 'Delia: "A Comet GT is sitting in the marina lot. Bring it to the chop shop. The owner will notice. The cops will too."',
    steps: [
      { type: 'goto', at: L('marina'), radius: 12, text: 'Find the Comet GT at the MARINA' },
      { type: 'steal', text: 'Steal the Comet GT — press E to get in' },
      { type: 'deliverCar', at: L('garage'), radius: 10, text: 'Deliver the Comet GT to the CHOP SHOP' },
    ],
  },
  {
    id: 3, title: 'THE DROP', pay: 10000,
    brief: 'Delia: "The bank job left heat on you. Make the drop at the hospital roof lot, then lose the cops. Stay out of sight and the stars fade."',
    steps: [
      { type: 'goto', at: L('hospital'), radius: 10, text: 'Make the drop at SOLMAR GENERAL' },
      { type: 'loseCops', text: 'Lose the cops — get your wanted level to zero' },
    ],
  },
  {
    id: 4, title: 'PAYDAY RUN', pay: 14000,
    brief: 'Delia: "The bank courier leaves at noon with the weekend take. Take the van, bring it to the docks. This one pays big — and the whole city will be looking."',
    steps: [
      { type: 'goto', at: L('bank'), radius: 12, text: 'Intercept the courier at SOLMAR BANK' },
      { type: 'steal', text: 'Take the courier van — press E to get in' },
      { type: 'deliverCar', at: L('docks'), radius: 10, text: 'Deliver the van to the DOCKS' },
    ],
  },
  {
    id: 5, title: 'SQUARE ONE', pay: 6000,
    brief: 'Delia: "Last one, Rook. Bring the final payment to the Marlin Club and your debt is done. After that, Solmar is yours."',
    steps: [
      { type: 'goto', at: L('marlin'), radius: 10, text: 'Bring the final payment to the MARLIN CLUB' },
    ],
  },
];

export class Missions {
  constructor(G) {
    this.G = G;
    this.index = 0;            // current mission (0-based)
    this.step = 0;
    this.active = null;        // current mission def
    this.target = null;        // {x, z} current waypoint
    this.targetCar = null;
    this.done = false;
    this.beacon = null;
    this.beaconLight = null;
    this.buildBeacon();
  }

  buildBeacon() {
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 90, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 45;
    this.beacon.visible = false;
    this.G.scene.add(this.beacon);
    this.beaconLight = new THREE.PointLight(0xffd166, 60, 40);
    this.beaconLight.position.y = 6;
    this.beaconLight.visible = false;
    this.G.scene.add(this.beaconLight);
  }

  start(i) {
    const G = this.G;
    this.index = i;
    this.step = 0;
    this.active = MISSION_DEFS[i];
    this.done = false;
    G.hud.setMission(`JOB ${this.active.id}/5 · ${this.active.title}`);
    G.hud.feed(this.active.brief);
    G.hud.toast(`JOB ${this.active.id} — ${this.active.title}`);
    G.audio.jingle();
    this.updateTarget();
  }

  currentStep() {
    return this.active ? this.active.steps[this.step] : null;
  }

  updateTarget() {
    const G = this.G;
    const s = this.currentStep();
    this.targetCar = null;
    if (!s) { this.target = null; this.beacon.visible = false; this.beaconLight.visible = false; return; }
    if (s.type === 'steal') {
      // find or spawn the mission car near the previous waypoint
      const prev = this.active.steps[this.step - 1];
      const at = prev.at(G);
      const car = this.spawnMissionCar(s, at);
      this.targetCar = car;
      this.target = { x: car.mesh.position.x, z: car.mesh.position.z };
    } else if (s.at) {
      const at = s.at(G);
      this.target = { x: at.x, z: at.z };
    } else {
      this.target = null;
    }
    G.hud.setObjective(s.text);
    if (this.target) {
      this.beacon.position.x = this.target.x;
      this.beacon.position.z = this.target.z;
      this.beacon.visible = true;
      this.beaconLight.position.x = this.target.x;
      this.beaconLight.position.z = this.target.z;
      this.beaconLight.visible = true;
    } else {
      this.beacon.visible = false;
      this.beaconLight.visible = false;
    }
  }

  spawnMissionCar(step, near) {
    const G = this.G;
    const isVan = this.active.id === 4;
    const color = isVan ? 0x2e6bc2 : 0xc23b2e;
    const kind = isVan ? 'sedan' : 'sport';
    const mesh = createCarMesh(color, kind);
    // park it on the nearest street lane beside the landmark, never inside a building
    const sx = Math.round(near.x / BLOCK) * BLOCK + 3.2;
    const x = sx, z = near.z;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.PI / 2;
    G.scene.add(mesh);
    const car = {
      mesh, kind, heading: Math.PI / 2, speed: 0,
      maxSpeed: kind === 'sport' ? 44 : 30, isMission: true,
      isParked: true, length: mesh.userData.length, health: 100, smoke: null,
    };
    G.traffic.cars.push(car);
    return car;
  }

  completeMission() {
    const G = this.G;
    const pay = this.active.pay;
    G.money += pay;
    G.hud.feed(`Job complete — paid ${money(pay)}.`);
    G.hud.toast(`+$${pay.toLocaleString('en-US')}`);
    G.audio.jingle();
    G.saveGame();
    if (this.targetCar) {
      // mission car stays in the world as a normal parked car
      this.targetCar.isMission = false;
      this.targetCar = null;
    }
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.active = null;
      this.done = true;
      this.beacon.visible = false;
      this.beaconLight.visible = false;
      G.hud.setMission('FREE ROAM · DEBT PAID');
      G.hud.setObjective('Solmar City is yours. Keep driving.');
      G.storyComplete();
    } else {
      this.start(this.index);
    }
  }

  advance() {
    this.step += 1;
    if (this.step >= this.active.steps.length) this.completeMission();
    else this.updateTarget();
  }

  update(dt) {
    const G = this.G;
    if (!this.active) return;
    // beacon pulse
    if (this.beacon.visible) {
      this.beacon.rotation.y += dt * 0.8;
      this.beacon.material.opacity = 0.28 + 0.14 * Math.sin(G.time * 3);
    }
    const s = this.currentStep();
    if (!s) return;
    const p = G.player;
    if (s.type === 'goto' || s.type === 'deliverCar') {
      const t = this.target;
      if (!t) return;
      const needCar = s.type === 'deliverCar';
      const ok = needCar
        ? (p.inCar && dist2(p.inCar.mesh.position.x, p.inCar.mesh.position.z, t.x, t.z) < s.radius)
        : dist2(p.x, p.z, t.x, t.z) < s.radius;
      if (ok) this.advance();
    } else if (s.type === 'steal') {
      if (p.inCar === this.targetCar) {
        G.hud.feed('You took the car. Get out of here!');
        if (this.active.id === 2 || this.active.id === 4) G.wanted.addCrime(1);
        this.advance();
      }
    } else if (s.type === 'loseCops') {
      if (G.wanted.stars === 0) this.advance();
    }
  }
}
