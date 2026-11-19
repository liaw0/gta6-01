// Wanted level + Solmar PD: stars rise with crime, police cars chase and ram,
// and getting caught on foot means BUSTED.
import * as THREE from 'three';
import { mulberry32, rand, clamp, dist2 } from './util.js';
import { createCarMesh } from './vehicles.js';
import { BLOCK, GRID } from './city.js';

export class Wanted {
  constructor(G) {
    this.G = G;
    this.stars = 0;
    this.heat = 0;        // 0..5 continuous
    this.lastCrime = -999;
    this.coolTimer = 0;
  }

  addCrime(amount) {
    this.heat = clamp(this.heat + amount, 0, 5);
    this.lastCrime = this.G.time;
    this.coolTimer = 0;
    const newStars = Math.ceil(this.heat - 0.001);
    if (newStars > this.stars) {
      this.stars = newStars;
      this.G.hud.feed(`WANTED LEVEL ${this.stars} — the Solmar PD is on you!`);
      this.G.audio.siren(this.stars > 0);
    }
  }

  setStars(n) {
    this.stars = n; this.heat = n;
    this.G.audio.siren(n > 0);
  }

  clear() {
    this.stars = 0; this.heat = 0;
    this.G.audio.siren(false);
  }

  // Cooling state for the HUD heat indicator: are we in the decay window,
  // and is any cop actually able to see us right now?
  cooling() {
    const inWindow = this.G.time - this.lastCrime > 10;
    return { cooling: this.heat > 0 && inWindow, hidden: !this.G.police.canSeePlayer() };
  }

  update(dt) {
    if (this.heat <= 0) return;
    // heat decays 10s after the last crime; much faster when no cop has
    // line of sight on you — duck behind a building and the stars melt
    if (this.G.time - this.lastCrime > 10) {
      const hidden = !this.G.police.canSeePlayer();
      this.heat = Math.max(0, this.heat - dt * (hidden ? 0.45 : 0.12));
      const s = Math.ceil(this.heat - 0.001);
      if (s < this.stars) {
        this.stars = s;
        this.G.hud.feed(this.stars === 0 ? 'You lost them. The heat is off.' : `Wanted level down to ${this.stars}.`);
        this.G.audio.siren(this.stars > 0);
      }
    }
  }
}

export class Police {
  constructor(G, city) {
    this.G = G; this.city = city;
    this.rng = mulberry32(99);
    this.cars = [];
    this.bustTimer = 0;
  }

  desiredCount() {
    const s = this.G.wanted.stars;
    return s === 0 ? 0 : s === 1 ? 1 : s === 2 ? 2 : s === 3 ? 3 : 4;
  }

  nearestDist() {
    const p = this.G.player;
    let best = Infinity;
    for (const c of this.cars) {
      best = Math.min(best, dist2(p.x, p.z, c.mesh.position.x, c.mesh.position.z));
    }
    return best;
  }

  // True if any police car has a clear line of sight to the player:
  // within 70m and no building (city collider) between cop and player.
  // A 2D segment-vs-AABB slab test in the XZ plane, one new check per cop.
  canSeePlayer() {
    const p = this.G.player;
    const colliders = this.G.city.colliders;
    for (const c of this.cars) {
      const ax = c.mesh.position.x, az = c.mesh.position.z;
      const dx = p.x - ax, dz = p.z - az;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 70 || d < 0.01) {
        if (d < 0.01) return true; // a cop is right on top of you
        continue;
      }
      const invX = 1 / (dx || 1e-6), invZ = 1 / (dz || 1e-6);
      let blocked = false;
      for (const b of colliders) {
        let tmin = 0, tmax = 1;
        let t1 = (b.minX - ax) * invX, t2 = (b.maxX - ax) * invX;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
        t1 = (b.minZ - az) * invZ; t2 = (b.maxZ - az) * invZ;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin <= tmax) { blocked = true; break; }
      }
      if (!blocked) return true;
    }
    return false;
  }

  spawnOne() {
    const G = this.G;
    const p = G.player;
    // spawn on a street 40-70m away from the player
    const ang = this.rng() * Math.PI * 2;
    const d = rand(this.rng, 45, 70);
    let x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
    x = Math.round(x / BLOCK) * BLOCK;
    z = Math.round(z / BLOCK) * BLOCK;
    x = clamp(x, -GRID * BLOCK, GRID * BLOCK);
    z = clamp(z, -GRID * BLOCK, GRID * BLOCK);
    const mesh = createCarMesh(0x101418, 'police');
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const car = {
      mesh, kind: 'police', heading: 0, speed: 0, maxSpeed: 36,
      isPolice: true, health: 100, length: mesh.userData.length, disabled: false,
    };
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    this.G.scene.remove(car.mesh);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  update(dt) {
    const G = this.G;
    const want = this.desiredCount();
    while (this.cars.length < want) this.spawnOne();
    while (this.cars.length > want) this.removeCar(this.cars[this.cars.length - 1]);
    const p = G.player;
    let bustedNear = false;
    for (const c of [...this.cars]) {
      if (c.disabled) {
        // wrecked police car fades out
        c.mesh.position.y -= dt * 0.2;
        if (c.mesh.position.y < -3) this.removeCar(c);
        continue;
      }
      const m = c.mesh;
      const d = dist2(p.x, p.z, m.position.x, m.position.z);
      // chase: steer toward the player, preferring roads
      const desiredHeading = Math.atan2(p.x - m.position.x, p.z - m.position.z);
      let dh = desiredHeading - c.heading;
      dh = ((dh + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      c.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
      const targetSpeed = d > 6 ? c.maxSpeed : c.maxSpeed * 0.6;
      c.speed += clamp(targetSpeed - c.speed, -20 * dt, 16 * dt);
      m.position.x += Math.sin(c.heading) * c.speed * dt;
      m.position.z += Math.cos(c.heading) * c.speed * dt;
      m.rotation.y = c.heading;
      const spin = c.speed * dt * 2.8;
      for (const w of m.userData.wheels) w.rotation.x += spin;
      // flashing light bar
      const phase = (G.time * 6) % 2 < 1;
      const red = m.getObjectByName('lightbar-red');
      const blue = m.getObjectByName('lightbar-blue');
      if (red) red.material.emissiveIntensity = phase ? 2.2 : 0.15;
      if (blue) blue.material.emissiveIntensity = phase ? 0.15 : 2.2;
      // ram the player
      if (d < 3.2) {
        if (p.inCar) {
          p.inCar.speed *= 0.55;
          p.inCar.health -= 3;
          G.audio.thud();
          if (p.inCar.health <= 0) p.disableCar(p.inCar);
        } else {
          p.damage(14 * dt * 3);
          bustedNear = true;
        }
      }
      // smoke when damaged
      if (c.health < 45 && !c.smoke) {
        c.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x555555, opacity: 0.55 }));
        c.smoke.scale.set(3, 3, 1);
        c.smoke.position.y = 1.6;
        m.add(c.smoke);
      }
      if (c.smoke) c.smoke.material.opacity = 0.35 + 0.25 * Math.sin(G.time * 9);
    }
    // busted: police on foot next to you for a while
    if (bustedNear && !p.inCar && !p.dead) {
      this.bustTimer += dt;
      if (this.bustTimer > 2.5) { this.bustTimer = 0; G.busted(); }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt);
    }
  }
}
