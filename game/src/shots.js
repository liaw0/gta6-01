// Screenshot scenarios: ?shot=start|drive|chase|mission&seed=1
// Each one puts the game in a photogenic state and raises
// window.__shotReady once a few frames have rendered, so an automated
// screenshot run can capture the real game (never a mock-up).
import { BLOCK } from './city.js';

export function applyShot(G, name) {
  const p = G.player;
  const setReady = () => {
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames >= 45) { window.__shotReady = true; return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (name === 'start') {
    // title screen over a high view of the city
    G.mode = 'menu';
    p.pos.set(BLOCK * 1.5, 0, BLOCK * 1.5);
    p.camYaw = Math.PI * 0.78; p.camPitch = 0.42; p.camDist = 46;
    document.getElementById('menu').classList.remove('hidden');
    setReady();
    return;
  }

  // all gameplay shots: hide the menu, start playing
  G.startGame('freeroam');
  if (name === 'drive') {
    // put Rook in a red sports car, mid-boulevard, traffic around
    const car = G.traffic.parked.find(c => c.kind === 'sport') || G.traffic.parked[0];
    car.mesh.position.set(BLOCK, 0, -BLOCK * 2);
    car.heading = 0;
    car.mesh.rotation.y = 0;
    p.pos.set(BLOCK, 0, -BLOCK * 2 - 4);
    p.enterCar(car);
    car.speed = 24;
    G.input.keys.add('KeyW'); // hold the throttle so the shot shows the car at speed
    p.camYaw = 0; p.camPitch = 0.28; p.camDist = 9;
    G.hud.feed('Downtown Solmar — the whole city is open.');
    G.hud.setObjective('Free roam — explore Solmar City');
  } else if (name === 'chase') {
    const car = G.traffic.parked.find(c => c.kind === 'sport') || G.traffic.parked[0];
    car.mesh.position.set(-BLOCK, 0, BLOCK);
    car.heading = Math.PI / 2;
    car.mesh.rotation.y = Math.PI / 2;
    p.pos.set(-BLOCK, 0, BLOCK - 4);
    p.enterCar(car);
    car.speed = 26;
    G.wanted.setStars(3);
    // two police cars right behind
    for (let i = 0; i < 2; i++) {
      const cop = G.police.spawnOne();
      cop.mesh.position.set(-BLOCK - 14 - i * 8, 0, BLOCK - 10 - i * 6);
      cop.heading = Math.PI / 2;
      cop.speed = 24;
    }
    p.camYaw = Math.PI / 2; p.camPitch = 0.3; p.camDist = 10;
    G.hud.setObjective('Lose the cops — wanted level 3');
    G.hud.feed('WANTED LEVEL 3 — the Solmar PD is on you!');
  } else if (name === 'mission') {
    // mission 2 in progress: jump to the "steal the Comet GT" step so the
    // car and its beacon are in frame, and put Rook right beside it
    G.missions.start(1);
    G.missions.advance(); // goto marina -> steal step; spawns the Comet GT
    const car = G.missions.targetCar;
    const cx = car ? car.mesh.position.x : BLOCK * 3;
    const cz = car ? car.mesh.position.z : BLOCK * 3;
    p.pos.set(cx - 6, 0, cz + 8);
    p.camYaw = Math.PI * 0.75; p.camPitch = 0.3; p.camDist = 12;
    G.hud.setObjective('Steal the Comet GT — press E to get in');
  }
  setReady();
}
