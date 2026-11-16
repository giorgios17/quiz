import { createDB, isLocal } from './db.js';
import { COUPLE, DEFAULT_TIME, REVEAL_TIME, CREDIT } from './config.js';
import { QUESTIONS } from './questions.js';
import { sfx, unlock, isUnlocked, setMuted, isMuted } from './audio.js';

const $ = (s) => document.querySelector(s);
const LETTERS = ['A', 'B', 'C', 'D'];

let db;
let state = null;
let players = {};
let answers = {};
let stateLoaded = false;
let lock = false;          // evita doppie rivelazioni
let builtFor = -1;         // indice domanda per cui sono costruite le card
let unwatchAnswers = null;
let watchedIndex = -1;
let paused = false;        // mette in pausa l'avanzamento automatico
let autoLock = false;      // evita doppi avanzamenti automatici
let revealFallback = 0;    // scadenza di riserva se lo stato di rivelazione non contiene revealEndsAt
let lastKey = null;        // per riconoscere i cambi di fase (suoni/animazioni)
let lastSecond = -1;

// ---------- utilità ----------
const sortedPlayers = () =>
  Object.entries(players)
    .map(([id, p]) => ({ id, name: p.name || '?', score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function setView(name) {
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== 's-' + name; });
}

// ---------- avvio ----------
async function init() {
  $('#couple').textContent = COUPLE.names;
  $('#title').textContent = COUPLE.title;
  $('#demo-banner').hidden = !isLocal;

  const joinUrl = new URL('play.html', location.href).href;
  $('#joinurl').textContent = joinUrl.replace(/^https?:\/\//, '');
  try {
    const qr = qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ scalable: true, cellSize: 4, margin: 2 });
  } catch (e) {
    $('#qr').textContent = joinUrl;
  }

  db = await createDB();
  db.on('game/players', (v) => { players = v || {}; render(); });
  db.on('game/state', (v) => {
    state = v;
    stateLoaded = true;
    if (!state) { db.set('game/state', { phase: 'lobby' }); return; }
    if (state.phase !== 'question') lock = false;
    if (state.phase !== 'reveal') { autoLock = false; paused = false; revealFallback = 0; }
    if (state.phase === 'question' || state.phase === 'reveal') watchAnswers(state.index);
    onPhaseChange();
    render();
  });

  setInterval(tick, 100);
  $('#next').addEventListener('click', advance);
  $('#pause').addEventListener('click', togglePause);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); advance(); }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyR' && e.shiftKey) reset();   // scorciatoia nascosta: Maiusc+R azzera tutto
  });
  requestAnimationFrame(frame);

  // audio: i browser lo sbloccano solo dopo un click o un tasto
  const hint = $('#sound-hint');
  const unlockAudio = () => { unlock(); hint.hidden = true; };
  document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  document.addEventListener('keydown', unlockAudio, { once: true, capture: true });
  hint.hidden = isUnlocked();
  $('#mute').addEventListener('click', (e) => {
    setMuted(!isMuted());
    e.currentTarget.textContent = isMuted() ? '🔇' : '🔊';
  });

  $('.credit').textContent = CREDIT;
  makeHearts();
}

function togglePause() {
  if (!state || state.phase !== 'reveal') return;
  paused = !paused;
  render();
}

// suoni e animazioni quando cambia fase/domanda
function onPhaseChange() {
  const key = state.phase + ':' + (state.index ?? '');
  if (lastKey === null) { lastKey = key; return; }   // primo caricamento: nessun suono
  if (key === lastKey) return;
  const wasLobby = lastKey.startsWith('lobby');
  lastKey = key;
  lastSecond = -1;
  if (state.phase === 'question') {
    if (wasLobby) sfx.start();
    setTimeout(() => sfx.question(), wasLobby ? 450 : 0);
  } else if (state.phase === 'reveal') {
    sfx.drum();
    const anyCorrect = (state.counts || [])[state.correct] > 0;
    setTimeout(() => (anyCorrect ? sfx.correct() : sfx.nobody()), 480);
    if (anyCorrect) setTimeout(() => confetti(45, 4), 480);
  } else if (state.phase === 'final') {
    sfx.final();
  }
}

// cuoricini che salgono lentamente sullo sfondo
function makeHearts() {
  const box = $('#hearts');
  for (let i = 0; i < 16; i++) {
    const h = el('span', 'heart', i % 3 === 0 ? '✦' : '♥');
    h.style.left = Math.random() * 100 + 'vw';
    h.style.fontSize = 14 + Math.random() * 26 + 'px';
    h.style.animationDuration = 14 + Math.random() * 14 + 's';
    h.style.animationDelay = -Math.random() * 20 + 's';
    box.append(h);
  }
}

function watchAnswers(i) {
  if (watchedIndex === i) return;
  if (unwatchAnswers) unwatchAnswers();
  watchedIndex = i;
  answers = {};
  unwatchAnswers = db.on(`game/answers/${i}`, (v) => { answers = v || {}; renderCounts(); });
}

// ---------- flusso di gioco ----------
async function advance() {
  if (!stateLoaded || !state) return;
  switch (state.phase) {
    case 'lobby': return startQuestion(0);
    case 'question': return reveal();
    case 'reveal':
      return state.index + 1 < QUESTIONS.length
        ? startQuestion(state.index + 1)
        : db.set('game/state', { phase: 'final' });
  }
}

async function startQuestion(i) {
  const q = QUESTIONS[i];
  const duration = q.time || DEFAULT_TIME;
  watchedIndex = -1; // forza la nuova sottoscrizione
  await db.update({
    [`game/answers/${i}`]: null,
    'game/state': {
      phase: 'question',
      index: i,
      total: QUESTIONS.length,
      question: { text: q.q, options: q.a },
      duration,
      endsAt: Date.now() + duration * 1000
    }
  });
}

async function reveal() {
  if (lock || !state || state.phase !== 'question') return;
  lock = true;
  const i = state.index;
  const q = QUESTIONS[i];
  const dur = state.duration * 1000;
  const counts = [0, 0, 0, 0];
  const upd = {};
  for (const [id, p] of Object.entries(players)) {
    const a = answers[id];
    let points = 0, correct = false, choice = -1;
    if (a && a.c >= 0 && a.c <= 3) {
      choice = a.c;
      counts[a.c]++;
      if (a.c === q.correct) {
        correct = true;
        points = 500 + Math.round(500 * Math.max(0, 1 - a.ms / dur));
      }
    }
    upd[`game/players/${id}/score`] = (p.score || 0) + points;
    upd[`game/players/${id}/last`] = { q: i, points, correct, choice };
  }
  upd['game/state'] = { ...state, phase: 'reveal', correct: q.correct, counts, revealEndsAt: Date.now() + REVEAL_TIME * 1000 };
  await db.update(upd);
}

async function reset() {
  if (!confirm('Azzerare partecipanti e punteggi e tornare alla lobby?')) return;
  watchedIndex = -1;
  await db.set('game', null);
}

// quando finisce la rivelazione (con riserva se il campo manca)
function revealEnd() {
  if (state.revealEndsAt) return state.revealEndsAt;
  if (!revealFallback) revealFallback = Date.now() + REVEAL_TIME * 1000;
  return revealFallback;
}

// barra del tempo: aggiornata a ogni frame (fluida, niente scatti)
function frame() {
  if (state) {
    let frac = null;
    if (state.phase === 'question') frac = (state.endsAt - Date.now()) / (state.duration * 1000);
    else if (state.phase === 'reveal' && !paused) frac = (revealEnd() - Date.now()) / (REVEAL_TIME * 1000);
    if (frac !== null) $('#timerbar').style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }
  requestAnimationFrame(frame);
}

function tick() {
  if (!state) return;

  if (state.phase === 'reveal') {
    // dopo REVEAL_TIME secondi si passa da soli alla domanda successiva
    const left = revealEnd() - Date.now();
    const isLast = state.index + 1 >= QUESTIONS.length;
    if (paused) {
      $('#answered').textContent = '⏸ In pausa';
    } else {
      $('#answered').textContent = `${isLast ? 'Classifica finale' : 'Prossima domanda'} tra ${Math.max(0, Math.ceil(left / 1000))}s`;
      if (left <= 0 && !autoLock) { autoLock = true; advance(); }
    }
    return;
  }

  if (state.phase !== 'question') return;
  const left = state.endsAt - Date.now();
  const sec = Math.max(0, Math.ceil(left / 1000));
  const secsEl = $('#secs');
  secsEl.textContent = sec;
  secsEl.classList.toggle('urgent', sec <= 5);
  if (sec <= 5 && sec > 0 && sec !== lastSecond) sfx.tick();
  lastSecond = sec;
  const n = Object.keys(players).length;
  const done = Object.keys(answers).length;
  if (left <= 0 || (n > 0 && done >= n)) reveal();
}

// ---------- rendering ----------
function render() {
  const phase = state ? state.phase : 'lobby';
  const next = $('#next');
  const pauseBtn = $('#pause');
  pauseBtn.hidden = phase !== 'reveal';
  pauseBtn.textContent = paused ? '▶ Riprendi' : '⏸ Pausa';

  if (phase === 'lobby') {
    setView('lobby');
    renderLobby();
    next.hidden = false;
    next.textContent = 'Avvia il quiz ▶';
  } else if (phase === 'question' || phase === 'reveal') {
    setView('question');
    renderQuestion(phase === 'reveal');
    // durante la domanda non serve alcun pulsante: la risposta compare da sola
    next.hidden = phase === 'question';
    next.textContent = state.index + 1 < QUESTIONS.length ? 'Prossima domanda ▶' : 'Classifica finale 🏆';
  } else if (phase === 'final') {
    setView('final');
    renderFinal();
    next.hidden = true;
  }
}

let lastCount = -1;
function renderLobby() {
  const list = sortedPlayers();
  const n = list.length;
  const c = $('#count');
  c.textContent = n;
  if (n !== lastCount) {
    if (lastCount >= 0 && n > lastCount) sfx.join();
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
    lastCount = n;
  }
  const box = $('#names');
  box.replaceChildren();
  const MAX = 36;
  list.slice(-MAX).forEach((p) => box.append(el('span', 'chip', p.name)));
  if (n > MAX) box.append(el('span', 'chip more', `+${n - MAX}`));
}

function buildAnswers() {
  const q = state.question;
  $('#qtext').textContent = q.text;
  const box = $('#answers');
  box.replaceChildren();
  // rilancia l'animazione di entrata della domanda
  const qt = $('#qtext');
  qt.classList.remove('enter');
  void qt.offsetWidth;
  qt.classList.add('enter');
  q.options.forEach((txt, i) => {
    const card = el('div', `ans c${i}`);
    card.style.setProperty('--i', i);
    const fill = el('div', 'fill');
    const letter = el('span', 'letter', LETTERS[i]);
    const text = el('span', 'atext', txt);
    const cnt = el('span', 'acount');
    card.append(fill, letter, text, cnt);
    box.append(card);
  });
  builtFor = state.index;
}

function renderQuestion(isReveal) {
  if (builtFor !== state.index) buildAnswers();
  $('#qnum').textContent = `Domanda ${state.index + 1} / ${state.total}`;
  $('#secs').hidden = isReveal;
  document.querySelector('.timer').classList.toggle('reveal', isReveal);

  const cards = document.querySelectorAll('.ans');
  cards.forEach((card, i) => {
    card.classList.toggle('correct', isReveal && i === state.correct);
    card.classList.toggle('wrong', isReveal && i !== state.correct);
  });
  renderCounts();

  const board = $('#board');
  board.hidden = !isReveal;
  if (isReveal) {
    board.replaceChildren(el('span', 'board-title', 'Classifica'));
    sortedPlayers().slice(0, 5).forEach((p, idx) => {
      const row = el('span', 'brow');
      row.append(el('b', '', `${idx + 1}.`), ` ${p.name} `, el('em', '', String(p.score)));
      board.append(row);
    });
  }
}

function renderCounts() {
  if (!state || (state.phase !== 'question' && state.phase !== 'reveal')) return;
  const n = Object.keys(players).length;
  const done = Object.keys(answers).length;
  if (state.phase === 'question') {
    $('#answered').textContent = `${done} / ${n} hanno risposto`;
  } else {
    const counts = state.counts || [0, 0, 0, 0];
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    document.querySelectorAll('.ans').forEach((card, i) => {
      const pct = Math.round((counts[i] / total) * 100);
      card.querySelector('.fill').style.width = pct + '%';
      card.querySelector('.acount').textContent = `${counts[i]} · ${pct}%`;
    });
  }
}

let confettiDone = false;
function renderFinal() {
  const list = sortedPlayers();
  $('#final-title').textContent = list.length ? `Vince ${list[0].name}!` : 'Quiz concluso';
  const podium = $('#podium');
  podium.replaceChildren();
  // ordine visivo: 2°, 1°, 3°
  [1, 0, 2].forEach((idx) => {
    const p = list[idx];
    if (!p) return;
    const col = el('div', `step s${idx + 1}`);
    col.append(el('div', 'pname', p.name), el('div', 'pscore', `${p.score} pt`), el('div', 'block', ['🥇', '🥈', '🥉'][idx]));
    podium.append(col);
  });
  const rest = $('#rest');
  rest.replaceChildren();
  rest.start = 4;
  list.slice(3, 10).forEach((p) => {
    const li = el('li');
    li.append(p.name + ' ', el('em', '', `${p.score} pt`));
    rest.append(li);
  });
  if (!confettiDone) { confettiDone = true; confetti(110, 6); }
}

function confetti(count = 80, spread = 3) {
  const box = $('#confetti');
  const colors = ['#d9485f', '#3b79c4', '#e6a817', '#3f9c70', '#b08d57'];
  const made = [];
  for (let i = 0; i < count; i++) {
    const s = el('span');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * spread * 0.5 + 's';
    s.style.animationDuration = 2.5 + Math.random() * spread + 's';
    box.append(s);
    made.push(s);
  }
  setTimeout(() => made.forEach((s) => s.remove()), (spread * 1.5 + 4) * 1000);
}

init();
