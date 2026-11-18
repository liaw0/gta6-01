// HUD: DOM readouts, the message feed, and the circular minimap drawn on a
// 2D canvas (streets, player arrow, mission beacon, police and traffic).
import { money } from './util.js';
import { BLOCK, GRID } from './city.js';

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = {
      hud: document.getElementById('hud'),
      wanted: document.getElementById('wanted'),
      money: document.getElementById('money'),
      mission: document.getElementById('mission-label'),
      objective: document.getElementById('objective-text'),
      healthfill: document.getElementById('healthfill'),
      healthtext: document.getElementById('healthtext'),
      ammo: document.getElementById('ammo'),
      speed: document.getElementById('speed'),
      clock: document.getElementById('clock'),
      feed: document.getElementById('feed'),
      interact: document.getElementById('interact'),
      interactText: document.getElementById('interact-text'),
      vignette: document.getElementById('vignette'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.feedItems = [];
    this.clockMin = 9 * 60 + 41;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setMission(t) { this.el.mission.textContent = t; }
  setObjective(t) { this.el.objective.textContent = t; }

  feed(text) {
    const div = document.createElement('div');
    div.textContent = text;
    this.el.feed.prepend(div);
    this.feedItems.unshift(div);
    while (this.feedItems.length > 4) this.feedItems.pop().remove();
    setTimeout(() => { div.style.opacity = '0.25'; }, 9000);
  }

  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2200);
  }

  flashDamage() {
    this.el.vignette.style.opacity = '1';
    setTimeout(() => { this.el.vignette.style.opacity = '0'; }, 130);
  }

  showInteract(text) {
    this.el.interactText.textContent = text;
    this.el.interact.classList.remove('hidden');
  }
  hideInteract() { this.el.interact.classList.add('hidden'); }

  update(dt) {
    const G = this.G;
    const p = G.player;
    // wanted stars
    let stars = '';
    for (let i = 0; i < 5; i++) {
      stars += i < G.wanted.stars
        ? '<span>★</span>'
        : '<span class="star-off">★</span>';
    }
    this.el.wanted.innerHTML = stars;
    this.el.money.textContent = money(G.money);
    this.el.healthfill.style.width = Math.max(0, p.health) + '%';
    this.el.healthtext.textContent = Math.ceil(Math.max(0, p.health));
    this.el.ammo.textContent = `PISTOL · ${G.combat.ammo} / ∞`;
    const spd = p.inCar ? Math.abs(p.inCar.speed) * 2.237 : Math.abs(p.speed) * 2.237;
    this.el.speed.textContent = `${Math.round(spd)} mph`;
    this.el.crosshair.classList.toggle('hidden', !!p.inCar);
    // in-game clock: 1 game hour per 2 real minutes
    this.clockMin += dt * 0.5;
    const hh = Math.floor(this.clockMin / 60) % 24;
    const mm = Math.floor(this.clockMin % 60);
    this.el.clock.textContent = `DAY 1 · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.drawMinimap();
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const S = 190, C = S / 2;
    const scale = S / 340; // ~340m across
    ctx.clearRect(0, 0, S, S);
    // sea / land background
    ctx.fillStyle = '#0e1a2e'; ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    const px = G.player.x, pz = G.player.z;
    const toMap = (x, z) => [C + (x - px) * scale, C + (z - pz) * scale];
    // city ground
    ctx.fillStyle = '#22304a'; ctx.fillRect(0, 0, S, S);
    // blocks
    ctx.fillStyle = '#31405e';
    for (let i = -GRID; i < GRID; i++) {
      for (let j = -GRID; j < GRID; j++) {
        const [x1, y1] = toMap(i * BLOCK + 8, j * BLOCK + 8);
        const w = (BLOCK - 16) * scale;
        ctx.fillRect(x1, y1, w, w);
      }
    }
    // roads
    ctx.strokeStyle = '#5a6b85'; ctx.lineWidth = 5;
    for (let i = -GRID; i <= GRID; i++) {
      const [x1, y1] = toMap(i * BLOCK, -GRID * BLOCK - 20);
      const [x2, y2] = toMap(i * BLOCK, GRID * BLOCK + 20);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-GRID * BLOCK - 20, i * BLOCK);
      const [x4, y4] = toMap(GRID * BLOCK + 20, i * BLOCK);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // mission beacon
    if (G.missions.target) {
      const [mx, my] = toMap(G.missions.target.x, G.missions.target.z);
      const pulse = 6 + 3 * Math.sin(G.time * 4);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5200';
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
    }
    // traffic dots
    ctx.fillStyle = '#aab8cc';
    for (const c of G.traffic.cars) {
      if (c.isPlayer) continue;
      const [x, y] = toMap(c.mesh.position.x, c.mesh.position.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // police dots
    for (const c of G.police.cars) {
      const [x, y] = toMap(c.mesh.position.x, c.mesh.position.z);
      ctx.fillStyle = (Math.floor(G.time * 4) % 2 === 0) ? '#ff4040' : '#4080ff';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow (map is north-up: -z is up, so heading h maps to rotation PI - h)
    const effHeading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(Math.PI - effHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // ring
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.stroke();
  }
}
