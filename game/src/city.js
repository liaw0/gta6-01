// Solmar City: a sun-soaked coastal grid city built from a fixed seed, so every
// load produces the same streets, buildings and landmarks.
import * as THREE from 'three';
import { mulberry32, rand, randInt, pick } from './util.js';

export const BLOCK = 52;       // distance between street centrelines
export const STREET_W = 14;    // street width
export const GRID = 4;         // streets at -GRID..GRID
export const CITY_R = GRID * BLOCK + 26;

const PALETTES = [
  [0xd8c9a3, 0xc9b48a, 0xe8dcc0], // sandstone
  [0x9fb8c8, 0x7d9bb0, 0xb8cdd9], // sea glass
  [0xd8a08a, 0xc98a72, 0xe8b8a0], // terracotta
  [0xa8b89a, 0x8aa078, 0xc0d0b0], // palm green
  [0xc8c8d0, 0xa8a8b8, 0xd8d8e0], // concrete
];

function facadeTexture(rng, base, floors) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const hex = '#' + base.toString(16).padStart(6, '0');
  g.fillStyle = hex; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, 6, 256); g.fillRect(122, 0, 6, 256);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, 0, 128, 8);
  // lit / dark windows
  const cols = 4, rows = Math.max(3, floors);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.45;
      g.fillStyle = lit ? '#ffe9a8' : '#1d2b40';
      g.fillRect(14 + x * 28, 20 + y * (216 / rows), 16, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';

  // --- ground: sand / grass base, big enough to fade into fog ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x9db98a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  // --- beach + sea on the south edge ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_R * 2 + 120, 46),
    new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY_R + 22);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 320),
    new THREE.MeshStandardMaterial({ color: 0x2e7fb8, roughness: 0.25, metalness: 0.1 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.0, CITY_R + 46 + 160);
  group.add(sea);

  // --- streets: dark asphalt ribbons with centre dashes ---
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8d2a8, roughness: 0.9 });
  const span = CITY_R * 2;
  for (let i = -GRID; i <= GRID; i++) {
    const c = i * BLOCK;
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(span, STREET_W), roadMat);
    ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.03, c); ew.receiveShadow = true;
    group.add(ew);
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W, span), roadMat);
    ns.rotation.x = -Math.PI / 2; ns.position.set(c, 0.03, 0); ns.receiveShadow = true;
    group.add(ns);
    // centre dashes along both axes
    for (let d = -CITY_R + 8; d < CITY_R - 8; d += 12) {
      if (Math.abs(d - c) < STREET_W) continue; // skip intersections
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      d1.rotation.x = -Math.PI / 2; d1.position.set(d, 0.05, c); group.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      d2.rotation.x = -Math.PI / 2; d2.position.set(c, 0.05, d); group.add(d2);
    }
  }

  // --- sidewalks: light strips along every street ---
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 });
  for (let i = -GRID; i <= GRID; i++) {
    const c = i * BLOCK;
    const ew1 = new THREE.Mesh(new THREE.PlaneGeometry(span, 3), walkMat);
    ew1.rotation.x = -Math.PI / 2; ew1.position.set(0, 0.04, c - STREET_W / 2 - 1.5); group.add(ew1);
    const ew2 = ew1.clone(); ew2.position.z = c + STREET_W / 2 + 1.5; group.add(ew2);
    const ns1 = new THREE.Mesh(new THREE.PlaneGeometry(3, span), walkMat);
    ns1.rotation.x = -Math.PI / 2; ns1.position.set(c - STREET_W / 2 - 1.5, 0.04, 0); group.add(ns1);
    const ns2 = ns1.clone(); ns2.position.x = c + STREET_W / 2 + 1.5; group.add(ns2);
  }

  // --- buildings: 1-4 per block, varied heights, window facades ---
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5f6a, roughness: 1 });
  const landmarks = {};
  for (let bx = -GRID; bx < GRID; bx++) {
    for (let bz = -GRID; bz < GRID; bz++) {
      const cx = bx * BLOCK + BLOCK / 2;
      const cz = bz * BLOCK + BLOCK / 2;
      // beach blocks stay open; one central block is the plaza
      if (bz === GRID - 1 && bx >= -1 && bx <= 1) continue; // south park strip
      if (bx === 0 && bz === 0) continue; // central plaza
      const roll = rng();
      if (roll < 0.14) continue; // empty lot / parking
      const palette = pick(rng, PALETTES);
      const n = roll < 0.5 ? 1 : roll < 0.8 ? 2 : 4;
      for (let k = 0; k < n; k++) {
        const w = rand(rng, 12, 20), d = rand(rng, 12, 20);
        const h = rand(rng, 10, 46) * (rng() < 0.12 ? 1.8 : 1);
        const ox = (k % 2 === 0 ? -1 : 1) * (w / 2 + 2) * (n > 1 ? 0.5 : 0);
        const oz = (k < 2 ? -1 : 1) * (d / 2 + 2) * (n > 2 ? 0.5 : 0);
        const x = cx + ox, z = cz + oz;
        const mat = new THREE.MeshStandardMaterial({
          map: facadeTexture(rng, palette[Math.floor(rng() * 3)], Math.max(3, Math.round(h / 6))),
          roughness: 0.9,
        });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, h / 2, z);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.6, d + 0.6);
        roof.position.set(x, h + 0.3, z);
        group.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // --- landmarks: Marlin Club (story hub), docks, marina, hospital, bank ---
  function landmark(name, x, z, w, h, d, color, sign) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d); m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    // rooftop sign board
    const signMesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(w, 22), 2.4, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x10131f, roughness: 0.6, emissive: 0xffb02e, emissiveIntensity: 0.55 })
    );
    signMesh.position.set(x, h + 1.6, z - d / 2 - 0.4);
    group.add(signMesh);
    landmarks[name] = { x, z, w, d, sign };
    return { x, z };
  }
  landmark('marlin', -BLOCK * 1.5, -BLOCK * 0.5, 26, 20, 20, 0x8a2f4d, 'MARLIN CLUB');
  landmark('docks', -BLOCK * 3.5, BLOCK * 2.5, 30, 12, 18, 0x3d5a6b, 'DOCKS');
  landmark('marina', BLOCK * 3.5, BLOCK * 3.5, 24, 14, 18, 0x2f6b5a, 'MARINA');
  landmark('hospital', BLOCK * 2.5, -BLOCK * 2.5, 26, 22, 20, 0xd8d8d8, 'GENERAL');
  landmark('bank', BLOCK * 0.5, -BLOCK * 3.5, 22, 26, 18, 0x6b5a2f, 'SOLMAR BANK');
  landmark('garage', -BLOCK * 2.5, BLOCK * 3.5, 22, 10, 16, 0x4d4d5a, 'CHOP SHOP');

  // --- central plaza: fountain + benches ---
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 10, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x7fb8d8, roughness: 0.3 })
  );
  plaza.position.set(BLOCK / 2, 0.6, BLOCK / 2);
  group.add(plaza);
  colliders.push({ minX: BLOCK / 2 - 9, maxX: BLOCK / 2 + 9, minZ: BLOCK / 2 - 9, maxZ: BLOCK / 2 + 9 });

  // --- streetlights along the avenues ---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.7 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd166, emissiveIntensity: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (let i = -GRID; i <= GRID; i++) {
    for (let j = -GRID; j < GRID; j += 2) {
      const x = i * BLOCK + STREET_W / 2 + 2.2;
      const z = j * BLOCK + BLOCK / 2;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 3, z); pole.castShadow = true; group.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 6.1, z); group.add(lamp);
    }
  }

  // --- palm trees on sidewalks and the park strip ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 5, 6);
  const leafGeo = new THREE.ConeGeometry(2.4, 2.2, 7);
  for (let n = 0; n < 90; n++) {
    const x = rand(rng, -CITY_R + 10, CITY_R - 10);
    const z = rand(rng, -CITY_R + 10, CITY_R - 10);
    // keep palms off roads and out of buildings: only near street edges / park
    const onRoadX = Math.abs(((x + BLOCK / 2) % BLOCK) - BLOCK / 2) < STREET_W / 2 + 3;
    const onRoadZ = Math.abs(((z + BLOCK / 2) % BLOCK) - BLOCK / 2) < STREET_W / 2 + 3;
    if (!onRoadX && !onRoadZ && !(bzPark(z))) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.5, z); trunk.castShadow = true; group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(x, 6, z); leaves.castShadow = true; group.add(leaves);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  function bzPark(z) { return z > (GRID - 1) * BLOCK; }

  scene.add(group);
  return {
    colliders,
    landmarks,
    spawn: { x: BLOCK * 0.5, z: -BLOCK * 0.5 + 4 },
    streetY: 0,
  };
}
