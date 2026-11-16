// Piccolo strato di accesso ai dati, con due implementazioni:
//  - Firebase Realtime Database (produzione)
//  - localStorage (demo locale, solo stesso browser)
import { FIREBASE_CONFIG } from './config.js';

export const isLocal = !FIREBASE_CONFIG;

const parts = (p) => p.split('/').filter(Boolean);

function getAt(tree, path) {
  let o = tree;
  for (const k of parts(path)) {
    if (o == null || typeof o !== 'object') return null;
    o = o[k];
  }
  return o === undefined ? null : o;
}

function setAt(tree, path, value) {
  const ks = parts(path);
  let o = tree;
  for (const k of ks.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  const last = ks[ks.length - 1];
  if (value === null || value === undefined) delete o[last];
  else o[last] = value;
}

function localDB() {
  const KEY = 'weddingquiz_local_db';
  const listeners = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const fire = () => listeners.forEach((f) => f());
  const write = (t) => { localStorage.setItem(KEY, JSON.stringify(t)); fire(); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) fire(); });
  return {
    async set(path, value) { const t = read(); setAt(t, path, value); write(t); },
    async update(obj) { const t = read(); for (const [p, v] of Object.entries(obj)) setAt(t, p, v); write(t); },
    on(path, cb) {
      let last;
      const f = () => {
        const v = getAt(read(), path);
        const s = JSON.stringify(v);
        if (s !== last) { last = s; cb(v); }
      };
      listeners.add(f);
      f();
      return () => listeners.delete(f);
    }
  };
}

async function firebaseDB() {
  const V = '10.12.2';
  const [{ initializeApp }, fb] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`)
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const rdb = fb.getDatabase(app);
  return {
    set: (path, value) => fb.set(fb.ref(rdb, path), value),
    update: (obj) => fb.update(fb.ref(rdb), obj),
    on: (path, cb) => fb.onValue(fb.ref(rdb, path), (snap) => cb(snap.val()))
  };
}

export async function createDB() {
  return isLocal ? localDB() : firebaseDB();
}
