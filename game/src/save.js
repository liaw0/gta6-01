// Save / load: localStorage keeps money, story progress and the player's
// spot, so a session can continue later.
const KEY = 'solmar-heat-save-v1';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      money: Math.round(G.money),
      missionIndex: G.missions.index,
      missionDone: G.missions.done,
      x: p.x, z: p.z,
      health: Math.round(p.health),
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.missionIndex !== 'number') return null;
    return d;
  } catch (e) { return null; }
}

export function hasSave() { return loadGame() !== null; }
export function clearSave() { try { localStorage.removeItem(KEY); } catch (e) {} }
