// Pedestrians: sidewalk walkers who stroll, chat, and flee from gunfire,
// speeding cars and police chases.
import * as THREE from 'three';
import { mulberry32, rand, randInt, pick, clamp, dist2 } from './util.js';
import { BLOCK, GRID } from './city.js';

const SHIRTS = [0xe86a5a, 0x5a8ae8, 0x6ab86a, 0xe8c832, 0x9a5ae8, 0xe8e8e8, 0x2e2e34, 0xd87a2e, 0x3aa655, 0xc23b6a, 0x7a4fb5, 0x2eb8a6];
const PANTS = [0x2e3a4a, 0x4a3a2e, 0x222226, 0x5a6b7a, 0x6b4a5a, 0x3a4a2e];

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(rng, PANTS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0, 0x6b4226, 0xd8a878]), roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.26), pants);
  legs.position.y = 0.39; legs.castShadow = true; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
  torso.position.y = 1.09; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.56; head.castShadow = true; g.add(head);
  // one in three pedestrians wears a hat or cap, in a random color
  if (rng() < 0.34) {
    const hatMat = new THREE.MeshStandardMaterial({ color: pick(rng, [0xc23b2e, 0x2e6bc2, 0xe8c832, 0x222226, 0xe8e8e8, 0x3aa655]), roughness: 0.85 });
    if (rng() < 0.5) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), hatMat);
      cap.position.y = 1.76; g.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.16), hatMat);
      brim.position.set(0, 1.72, 0.22); g.add(brim);
    } else {
      const brimHat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), hatMat);
      brimHat.position.y = 1.74; g.add(brimHat);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 10), hatMat);
      crown.position.y = 1.82; g.add(crown);
    }
  }
  // vary height a little so the crowd does not look cloned
  g.scale.y = 0.92 + rng() * 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), shirt);
  armL.position.set(-0.33, 1.08, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.33; g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  g.userData.isPedRoot = true;
  return g;
}

export class Pedestrians {
  constructor(G, city) {
    this.G = G; this.city = city;
    this.rng = mulberry32(4242);
    this.peds = [];
    for (let i = 0; i < 40; i++) this.spawn();
  }

  randomSidewalkSpot() {
    const rng = this.rng;
    const i = randInt(rng, -GRID, GRID), j = randInt(rng, -GRID, GRID);
    const horizontal = rng() < 0.5;
    const x = horizontal ? rand(rng, -GRID * BLOCK, GRID * BLOCK) : i * BLOCK + (rng() < 0.5 ? -9.5 : 9.5);
    const z = horizontal ? j * BLOCK + (rng() < 0.5 ? -9.5 : 9.5) : rand(rng, -GRID * BLOCK, GRID * BLOCK);
    return { x, z, horizontal };
  }

  spawn() {
    const rng = this.rng;
    const s = this.randomSidewalkSpot();
    const mesh = makePedMesh(rng);
    mesh.position.set(s.x, 0, s.z);
    this.G.scene.add(mesh);
    const ped = {
      mesh, speed: rand(rng, 1.1, 2.0), heading: s.horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      flee: 0, walkPhase: rand(rng, 0, 6), target: null,
    };
    mesh.rotation.y = ped.heading;
    this.peds.push(ped);
    return ped;
  }

  scare(x, z, radius) {
    for (const p of this.peds) {
      const d = dist2(x, z, p.mesh.position.x, p.mesh.position.z);
      if (d < radius) {
        p.flee = rand(this.rng, 2.5, 5);
        const dx = p.mesh.position.x - x, dz = p.mesh.position.z - z;
        p.heading = Math.atan2(dx, dz);
      }
    }
  }

  update(dt) {
    const rng = this.rng;
    for (const p of this.peds) {
      const speed = p.flee > 0 ? 5.2 : p.speed;
      if (p.flee > 0) p.flee -= dt;
      p.mesh.position.x += Math.sin(p.heading) * speed * dt;
      p.mesh.position.z += Math.cos(p.heading) * speed * dt;
      // turn around at city edge; occasionally change direction on sidewalks
      const m = p.mesh.position;
      if (Math.abs(m.x) > GRID * BLOCK + 10 || Math.abs(m.z) > GRID * BLOCK + 10) p.heading += Math.PI;
      if (rng() < dt * 0.06) p.heading += pick(rng, [-Math.PI / 2, Math.PI / 2]);
      // keep on sidewalks: nudge back toward the nearest street edge
      const sx = Math.round(m.x / BLOCK) * BLOCK, sz = Math.round(m.z / BLOCK) * BLOCK;
      const dxRoad = Math.abs(m.x - sx), dzRoad = Math.abs(m.z - sz);
      if (dxRoad < 6 && dzRoad > 12) m.x = sx + (m.x > sx ? 9.5 : -9.5);
      if (dzRoad < 6 && dxRoad > 12) m.z = sz + (m.z > sz ? 9.5 : -9.5);
      p.mesh.rotation.y = p.heading;
      // walk swing
      p.walkPhase += dt * (p.flee > 0 ? 14 : 7);
      const s = Math.sin(p.walkPhase) * 0.45;
      p.mesh.userData.armL.rotation.x = s;
      p.mesh.userData.armR.rotation.x = -s;
      p.mesh.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.05;
    }
  }
}
