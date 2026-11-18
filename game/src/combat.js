// Combat: Rook's pistol. Hitscan with a tracer and muzzle flash, 12-round
// magazine, and real consequences — shooting raises the wanted level.
import * as THREE from 'three';
import { clamp } from './util.js';

export class Combat {
  constructor(G) {
    this.G = G;
    this.ammo = 12;
    this.magSize = 12;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.tracer = null;
    this.tracerLife = 0;
    this.flash = null;
  }

  shootFromCar() {
    // firing from a moving car is wild: allow it, but slower
    if (this.cooldown > 0.25) return;
    this.shoot();
  }

  shoot() {
    const G = this.G;
    if (this.cooldown > 0 || this.reloadTimer > 0) return;
    if (this.ammo <= 0) { this.reload(); return; }
    this.cooldown = 0.22;
    this.ammo -= 1;
    G.audio.gunshot();
    const cam = G.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    // slight spread
    dir.x += (Math.random() - 0.5) * 0.02;
    dir.y += (Math.random() - 0.5) * 0.02;
    dir.z += (Math.random() - 0.5) * 0.02;
    dir.normalize();
    const ray = new THREE.Raycaster(origin, dir, 0.1, 120);
    // targets: police cars, traffic cars, pedestrians, buildings
    const targets = [];
    for (const c of [...G.police.cars, ...G.traffic.cars]) targets.push(c.mesh);
    for (const p of G.peds.peds) targets.push(p.mesh);
    const hits = ray.intersectObjects(targets, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(90));
    if (hits.length) {
      const hit = hits[0];
      end = hit.point.clone();
      // find which car/ped was hit
      let obj = hit.object;
      while (obj && !obj.userData.isCarRoot && !obj.userData.isPedRoot) obj = obj.parent;
      this.applyHit(obj, hit.point);
    }
    this.showTracer(origin, end);
    G.wanted.addCrime(0.35);
    G.peds.scare(G.player.x, G.player.z, 26);
    if (this.ammo === 0) this.reload();
  }

  applyHit(root, point) {
    const G = this.G;
    if (!root) return;
    // police / traffic car?
    const car = [...G.police.cars, ...G.traffic.cars].find(c => c.mesh === root);
    if (car) {
      car.health -= 34;
      G.hud.feed(car.isPolice ? 'You hit a police cruiser!' : 'You shot a car!');
      if (car.health <= 0 && car.isPolice) {
        car.disabled = true;
        G.hud.feed('Police cruiser disabled!');
        G.money += 150; // impound bonus
      }
      return;
    }
    const ped = G.peds.peds.find(p => p.mesh === root);
    if (ped) {
      G.peds.scare(point.x, point.z, 30);
      G.wanted.addCrime(0.8);
      G.hud.feed('You shot a civilian! The city saw that.');
    }
  }

  showTracer(from, to) {
    const G = this.G;
    if (this.tracer) G.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    G.scene.add(this.tracer);
    this.tracerLife = 0.07;
  }

  reload() {
    if (this.reloadTimer > 0 || this.ammo === this.magSize) return;
    this.reloadTimer = 1.1;
    this.G.audio.reload();
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = this.magSize; this.G.hud.feed('Reloaded.'); }
    }
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0 && this.tracer) {
        this.G.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
  }
}
