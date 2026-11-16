// Effetti sonori sintetizzati con WebAudio (nessun file audio da caricare).
// I browser permettono l'audio solo dopo un'interazione: chiama unlock() al primo click/tasto.

let ctx = null;
let muted = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlock() { ensure(); }
export const isUnlocked = () => !!ctx && ctx.state === 'running';
export function setMuted(m) { muted = m; }
export const isMuted = () => muted;

function tone(freq, start, dur, { type = 'sine', vol = 0.15, slide = null } = {}) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const arp = (notes, step, dur, opts) => notes.forEach((f, i) => tone(f, i * step, dur, opts));

export const sfx = {
  // qualcuno entra nella lobby
  join() { tone(660, 0, 0.12, { type: 'triangle' }); tone(990, 0.08, 0.2, { type: 'triangle' }); },
  // il quiz parte
  start() { arp([392, 523, 659, 784, 1046], 0.09, 0.28, { type: 'square', vol: 0.07 }); },
  // nuova domanda
  question() { tone(523, 0, 0.14, { type: 'triangle' }); tone(784, 0.12, 0.14, { type: 'triangle' }); tone(1046, 0.24, 0.35, { type: 'triangle' }); },
  // ultimi secondi
  tick() { tone(880, 0, 0.07, { type: 'square', vol: 0.05 }); },
  // rullo di tamburi prima della rivelazione
  drum() { for (let i = 0; i < 10; i++) tone(180 + i * 12, i * 0.045, 0.06, { type: 'triangle', vol: 0.09 }); },
  // risposta giusta mostrata
  correct() { arp([523, 659, 784, 1046, 1318], 0.08, 0.32, { type: 'triangle', vol: 0.12 }); },
  // nessuno ha indovinato
  nobody() { tone(300, 0, 0.35, { type: 'sawtooth', vol: 0.06, slide: 140 }); },
  // fanfara finale
  final() {
    arp([523, 523, 523, 698, 659, 659, 659, 784, 1046], 0.16, 0.3, { type: 'square', vol: 0.06 });
    arp([262, 262, 262, 349, 330, 330, 330, 392, 523], 0.16, 0.3, { type: 'triangle', vol: 0.1 });
  },
  // suoni per i telefoni
  tap() { tone(700, 0, 0.05, { type: 'triangle', vol: 0.08 }); },
  right() { arp([659, 880, 1318], 0.07, 0.2, { type: 'triangle', vol: 0.1 }); },
  wrong() { tone(260, 0, 0.3, { type: 'sawtooth', vol: 0.06, slide: 120 }); }
};
