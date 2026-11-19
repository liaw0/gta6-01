// Cars: a shared mesh factory plus traffic AI that drives the street grid,
// and the parked cars the player can steal.
import * as THREE from 'three';
import { mulberry32, rand, randInt, pick, clamp, dist2 } from './util.js';
import { BLOCK, GRID, STREET_W } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6bc2, 0xe8c832, 0x3aa655, 0xe8e8e8, 0x222226, 0x7a4fb5, 0xd87a2e, 0x2eb8a6, 0xb03060, 0x4a6b8a, 0xc8b060];

export function createCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.15, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const isSport = kind === 'sport';
  const isTaxi = kind === 'taxi';
  const isPolice = kind === 'police';
  const isVan = kind === 'van';
  const L = isVan ? 5.4 : isSport ? 4.6 : 4.2, W = 1.9, H = isVan ? 1.15 : isSport ? 0.55 : 0.72;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.55, L * 0.45), glassMat);
  cabin.position.set(0, H + 0.42, -L * 0.08); cabin.castShadow = true;
  g.add(cabin);
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    bar.position.set(0, H + 0.78, -L * 0.08); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.4 }));
    red.position.set(-0.24, H + 0.9, -L * 0.08); red.name = 'lightbar-red'; g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x2040ff, emissiveIntensity: 1.4 }));
    blue.position.set(0.24, H + 0.9, -L * 0.08); blue.name = 'lightbar-blue'; g.add(blue);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.2, L * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.5 }));
    stripe.position.set(0, 0.62, 0); g.add(stripe);
  }
  if (isTaxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd166, emissiveIntensity: 0.8 }));
    sign.position.set(0, H + 0.8, -L * 0.08); g.add(sign);
  }
  if (isVan) {
    // tall cargo van: roof rails + a rear window band so it reads as a van, not a sedan
    const railMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.7 });
    for (const rx of [-0.6, 0.6]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, L * 0.7), railMat);
      rail.position.set(rx, H + 0.32, 0); g.add(rail);
    }
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.5, 0.06), glassMat);
    rearGlass.position.set(0, H + 0.1, -L / 2 - 0.01); g.add(rearGlass);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-W / 2, L / 2 - 0.8], [W / 2, L / 2 - 0.8], [-W / 2, -L / 2 + 0.8], [W / 2, -L / 2 + 0.8]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.36, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  // headlights + taillights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 0.9 }));
  hl.position.set(0, 0.62, L / 2 + 0.02); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xaa1010, emissiveIntensity: 0.8 }));
  tl.position.set(0, 0.62, -L / 2 - 0.02); g.add(tl);
  g.userData.wheels = wheels;
  g.userData.length = L;
  g.userData.isCarRoot = true;
  return g;
}

function streetCoord(v) {
  // snap a coordinate to the nearest street centreline
  return Math.round(v / BLOCK) * BLOCK;
}

export class Traffic {
  constructor(G, city) {
    this.G = G; this.city = city;
    this.rng = mulberry32(777);
    this.cars = [];
    this.parked = [];
    this.spawnTraffic(26);
    this.spawnParked(16);
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) this.addTrafficCar();
  }

  addTrafficCar(x, z, heading) {
    const rng = this.rng;
    const horizontal = heading === undefined ? rng() < 0.5 : (Math.abs(Math.sin(heading)) < 0.5);
    const street = randInt(rng, -GRID, GRID) * BLOCK;
    const along = rand(rng, -GRID * BLOCK, GRID * BLOCK);
    const px = horizontal ? along : street + (rng() < 0.5 ? -3.2 : 3.2);
    const pz = horizontal ? street + (rng() < 0.5 ? -3.2 : 3.2) : along;
    const dir = rng() < 0.5 ? 1 : -1;
    const hd = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const kind = rng() < 0.12 ? 'taxi' : rng() < 0.30 ? 'van' : 'sedan';
    const mesh = createCarMesh(kind === 'taxi' ? 0xe8c832 : pick(rng, CAR_COLORS), kind);
    mesh.position.set(px, 0, pz);
    mesh.rotation.y = hd;
    this.G.scene.add(mesh);
    const car = {
      mesh, kind, heading: hd, speed: rand(rng, 7, 11), maxSpeed: rand(rng, 9, 13),
      isTraffic: true, length: mesh.userData.length, health: 100, smoke: null,
      targetSpeed: 0, stopped: 0,
    };
    this.cars.push(car);
    return car;
  }

  spawnParked(n) {
    const rng = this.rng;
    const spots = [];
    for (let i = -GRID; i <= GRID; i++) {
      for (let j = -GRID; j <= GRID; j++) {
        spots.push([i * BLOCK + (rng() < 0.5 ? -8.5 : 8.5), j * BLOCK + rand(rng, -18, 18)]);
        spots.push([i * BLOCK + rand(rng, -18, 18), j * BLOCK + (rng() < 0.5 ? -8.5 : 8.5)]);
      }
    }
    for (let i = 0; i < n && spots.length; i++) {
      const idx = Math.floor(rng() * spots.length);
      const [x, z] = spots.splice(idx, 1)[0];
      const kind = rng() < 0.18 ? 'sport' : rng() < 0.38 ? 'van' : 'sedan';
      const mesh = createCarMesh(pick(rng, CAR_COLORS), kind);
      const horizontal = Math.abs(x % BLOCK) > 20;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = horizontal ? Math.PI / 2 : 0;
      this.G.scene.add(mesh);
      const car = {
        mesh, kind, heading: mesh.rotation.y, speed: 0, maxSpeed: kind === 'sport' ? 42 : 32,
        isParked: true, length: mesh.userData.length, health: 100, smoke: null,
      };
      this.cars.push(car);
      this.parked.push(car);
    }
  }

  nearestCar(x, z, maxD, filter) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      if (filter && !filter(c)) continue;
      const d = dist2(x, z, c.mesh.position.x, c.mesh.position.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt) {
    const G = this.G;
    for (const c of this.cars) {
      if (!c.isTraffic) continue;
      // desired speed: slow for cars ahead, stop briefly at some intersections
      let desired = c.maxSpeed;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.mesh.position.x - c.mesh.position.x;
        const dz = o.mesh.position.z - c.mesh.position.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 9 && side < 2.2) { desired = 0; break; }
        if (ahead > 0 && ahead < 16 && side < 2.2) desired = Math.min(desired, 4);
      }
      // random pause at intersections
      const nearX = Math.abs(c.mesh.position.x - streetCoord(c.mesh.position.x));
      const nearZ = Math.abs(c.mesh.position.z - streetCoord(c.mesh.position.z));
      if (nearX < 3 && nearZ < 3 && this.rng() < dt * 0.12) c.stopped = rand(this.rng, 1.5, 3.5);
      if (c.stopped > 0) { c.stopped -= dt; desired = 0; }
      c.speed += clamp(desired - c.speed, -14 * dt, 8 * dt);
      // at intersections, sometimes turn
      if (nearX < 1.2 && nearZ < 1.2 && this.rng() < dt * 0.55) {
        const turn = pick(this.rng, [-Math.PI / 2, 0, Math.PI / 2]);
        c.heading += turn;
      }
      // keep inside the city: turn around at the edge
      const p = c.mesh.position;
      if (Math.abs(p.x) > GRID * BLOCK + 6 || Math.abs(p.z) > GRID * BLOCK + 6) c.heading += Math.PI;
      p.x += Math.sin(c.heading) * c.speed * dt;
      p.z += Math.cos(c.heading) * c.speed * dt;
      // snap back onto the road if drifted
      if (Math.abs(p.x - streetCoord(p.x)) > STREET_W / 2 - 1 && Math.abs(Math.sin(c.heading)) < 0.7) {
        p.x = streetCoord(p.x) + (p.x > streetCoord(p.x) ? 3.2 : -3.2);
      }
      if (Math.abs(p.z - streetCoord(p.z)) > STREET_W / 2 - 1 && Math.abs(Math.cos(c.heading)) < 0.7) {
        p.z = streetCoord(p.z) + (p.z > streetCoord(p.z) ? 3.2 : -3.2);
      }
      c.mesh.rotation.y = c.heading;
      // wheel spin
      const spin = c.speed * dt * 2.8;
      for (const w of c.mesh.userData.wheels) w.rotation.x += spin;
    }
  }
}
