// The player: Rook Vega, on foot (third person) or behind the wheel.
// Handles movement, camera, entering/exiting cars, damage and respawn.
import * as THREE from 'three';
import { clamp, angleLerp, collideCircle, dist2 } from './util.js';

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8a2f3d, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3a4a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.82, 0.28), pants);
  legs.position.y = 0.41; legs.castShadow = true; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.32), jacket);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.65; head.castShadow = true; g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.14), jacket);
  armL.position.set(-0.36, 1.14, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.36; g.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.36, 0.95, 0.2); gun.name = 'gun'; g.add(gun);
  g.userData.armL = armL; g.userData.armR = armR; g.userData.gun = gun;
  return g;
}

export class Player {
  constructor(G, city) {
    this.G = G; this.city = city;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(city.spawn.x, 0, city.spawn.z);
    G.scene.add(this.mesh);
    this.pos = this.mesh.position; // alias (Vector3)
    this.heading = 0;              // facing, radians (0 = +Z)
    this.camYaw = 0; this.camPitch = 0.32; this.camDist = 7;
    this.speed = 0;
    this.health = 100;
    this.inCar = null;             // car object when driving
    this.dead = false;
    this.walkPhase = 0;
    this.invuln = 0;
  }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.heading = 0; this.camYaw = 0;
    this.health = 100; this.dead = false;
    this.exitCar(true);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  damage(amount) {
    if (this.invuln > 0 || this.dead) return;
    this.health -= amount;
    this.G.hud.flashDamage();
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  enterCar(car) {
    this.inCar = car;
    car.isParked = false; car.isTraffic = false; car.isPlayer = true;
    this.mesh.visible = false;
    this.G.audio.engineStart();
  }

  exitCar(silent) {
    if (!this.inCar) return;
    const car = this.inCar;
    car.isPlayer = false;
    car.speed = 0;
    // step out to the left of the car
    const lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
    this.pos.set(car.mesh.position.x + lx * 2.2, 0, car.mesh.position.z + lz * 2.2);
    this.heading = car.heading;
    this.mesh.visible = true;
    this.inCar = null;
    if (!silent) this.G.audio.door();
  }

  update(dt) {
    const G = this.G;
    const input = G.input;
    if (this.invuln > 0) this.invuln -= dt;
    // camera orbit from mouse
    this.camYaw -= input.mouseDX * 0.0026;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0022, -0.15, 0.9);
    input.mouseDX = 0; input.mouseDY = 0;

    if (this.inCar) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);

    // camera follow
    const cam = G.camera;
    const target = this.inCar ? this.inCar.mesh.position : this.pos;
    const cy = Math.cos(this.camPitch), sy = Math.sin(this.camPitch);
    const offX = -Math.sin(this.camYaw) * cy * this.camDist;
    const offZ = -Math.cos(this.camYaw) * cy * this.camDist;
    const offY = 1.6 + sy * this.camDist;
    const want = new THREE.Vector3(target.x + offX, target.y + offY, target.z + offZ);
    cam.position.lerp(want, 1 - Math.pow(0.0001, dt));
    const look = new THREE.Vector3(target.x, target.y + 1.4, target.z);
    cam.lookAt(look);
    // health regen
    if (this.health > 0 && this.health < 100) this.health = Math.min(100, this.health + dt * 2.5);
  }

  updateOnFoot(dt, input) {
    const G = this.G;
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const maxSpeed = sprint ? 8.5 : 5.0;
    let fx = 0, fz = 0;
    if (input.keys.has('KeyW')) fz += 1;
    if (input.keys.has('KeyS')) fz -= 1;
    if (input.keys.has('KeyA')) fx -= 1;
    if (input.keys.has('KeyD')) fx += 1;
    const moving = fx !== 0 || fz !== 0;
    if (moving) {
      const len = Math.hypot(fx, fz); fx /= len; fz /= len;
      // camera-relative movement
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const wx = fx * cos - fz * sin;
      const wz = -fx * sin - fz * cos;
      const targetHeading = Math.atan2(wx, wz);
      this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 12));
      this.speed = maxSpeed;
      const nx = this.pos.x + wx * this.speed * dt;
      const nz = this.pos.z + wz * this.speed * dt;
      const r = collideCircle(this.city.colliders, nx, nz, 0.55);
      this.pos.x = r.x; this.pos.z = r.z;
      this.walkPhase += dt * (sprint ? 13 : 9);
    } else {
      this.speed = 0;
    }
    this.mesh.rotation.y = this.heading;
    const s = moving ? Math.sin(this.walkPhase) * 0.5 : 0;
    this.mesh.userData.armL.rotation.x = s;
    this.mesh.userData.armR.rotation.x = -s;
    this.mesh.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    // gun visible only when aiming (right mouse) — keep it simple: always show
  }

  updateDriving(dt, input) {
    const car = this.inCar;
    const m = car.mesh;
    const accel = input.keys.has('KeyW') ? 1 : input.keys.has('KeyS') ? -1 : 0;
    const steer = (input.keys.has('KeyA') ? 1 : 0) - (input.keys.has('KeyD') ? 1 : 0);
    const handbrake = input.keys.has('Space');
    const top = car.maxSpeed;
    if (accel > 0) car.speed += 22 * dt;
    else if (accel < 0) car.speed -= (car.speed > 0.5 ? 30 : 14) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, -12, top);
    const spdFactor = clamp(Math.abs(car.speed) / 12, 0, 1);
    car.heading += steer * spdFactor * 1.9 * dt * (car.speed >= 0 ? 1 : -1);
    // move + collide with buildings
    const nx = m.position.x + Math.sin(car.heading) * car.speed * dt;
    const nz = m.position.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: m.position.x, z: m.position.z };
    const r = collideCircle(this.city.colliders, nx, nz, 1.6);
    const hitWall = Math.abs(r.x - nx) > 0.01 || Math.abs(r.z - nz) > 0.01;
    m.position.x = r.x; m.position.z = r.z;
    if (hitWall && Math.abs(car.speed) > 4) {
      car.speed *= -0.25; // bounce
      car.health -= 4;
      this.G.audio.thud();
      this.G.wanted.addCrime(0.2);
      if (car.health <= 0) this.disableCar(car);
    }
    // car-car bumps
    for (const o of this.G.traffic.cars) {
      if (o === car || o.isPlayer) continue;
      const d = dist2(m.position.x, m.position.z, o.mesh.position.x, o.mesh.position.z);
      if (d < 3.4) {
        car.speed *= 0.6;
        o.speed = Math.max(o.speed, 6);
        o.heading = Math.atan2(o.mesh.position.x - m.position.x, o.mesh.position.z - m.position.z);
        this.G.audio.thud();
        this.G.wanted.addCrime(0.15);
      }
    }
    // hit pedestrians (crime!)
    for (const p of this.G.peds.peds) {
      const d = dist2(m.position.x, m.position.z, p.mesh.position.x, p.mesh.position.z);
      if (d < 2.2 && Math.abs(car.speed) > 3) {
        this.G.peds.scare(m.position.x, m.position.z, 14);
        this.G.wanted.addCrime(1);
        this.G.hud.feed('You hit a pedestrian! The cops noticed.');
        // knock the ped aside
        p.mesh.position.x += Math.sin(car.heading) * 3;
        p.mesh.position.z += Math.cos(car.heading) * 3;
      }
    }
    m.rotation.y = car.heading;
    // the player's logical position rides with the car: police, missions,
    // the minimap and ped hits all read G.player.x/z, so they must track
    // the car while driving (not the spot where Rook got in)
    this.pos.set(m.position.x, 0, m.position.z);
    const spin = car.speed * dt * 2.8;
    for (const w of m.userData.wheels) {
      w.rotation.x += spin;
      w.rotation.y = 0;
    }
    // front wheels steer visually
    m.userData.wheels[0].rotation.y = steer * 0.35;
    m.userData.wheels[1].rotation.y = steer * 0.35;
    // camera pulls back with speed
    this.camDist = 7 + Math.abs(car.speed) * 0.09;
    this.G.audio.engine(Math.abs(car.speed) / top, car.speed);
    if (this.G.input.mouseDown) this.G.combat.shootFromCar();
  }

  disableCar(car) {
    car.disabled = true;
    car.speed = 0;
    this.G.hud.feed('Your car is wrecked!');
    this.exitCar(true);
  }
}
