import { createDB, isLocal } from './db.js';
import { COUPLE } from './config.js';

const $ = (s) => document.querySelector(s);
const LETTERS = ['A', 'B', 'C', 'D'];
const SHAPES = ['▲', '◆', '●', '■'];
const ME_KEY = 'wq_me';
const SENT_KEY = 'wq_sent';

let db;
let me = null;               // { id, name }
let state = null;
let players = null;
let stateLoaded = false;
let playersLoaded = false;
let builtFor = -1;
let qStart = 0;              // istante (ms) in cui il telefono ha mostrato la domanda
let qEnd = 0;
let sent = null;             // { index, choice }

const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const uid = () =>
  (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
    .replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);

function show(name) {
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'v-' + name; });
}

async function init() {
  $('#couple').textContent = COUPLE.names;
  $('#title').textContent = COUPLE.title;
  $('#demo-banner').hidden = !isLocal;
  me = load(ME_KEY);
  sent = load(SENT_KEY);
  if (me) $('#name').value = me.name;

  db = await createDB();
  db.on('game/state', (v) => { state = v; stateLoaded = true; render(); });
  db.on('game/players', (v) => { players = v || {}; playersLoaded = true; render(); });

  $('#join-form').addEventListener('submit', join);
  setInterval(tick, 150);
}

async function join(e) {
  e.preventDefault();
  const name = $('#name').value.trim().slice(0, 20);
  if (!name) return;
  const id = me ? me.id : uid();
  me = { id, name };
  localStorage.setItem(ME_KEY, JSON.stringify(me));
  // l'oggetto "players/id" viene creato (o ricreato) con punteggio 0
  await db.set(`game/players/${id}`, { name, score: 0, joined: Date.now() });
}

function sortedPlayers() {
  return Object.entries(players || {})
    .map(([id, p]) => ({ id, name: p.name || '', score: p.score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function myStanding() {
  const list = sortedPlayers();
  const rank = list.findIndex((p) => p.id === me.id) + 1;
  return { rank, total: list.length, score: (players[me.id] && players[me.id].score) || 0 };
}

// ---------- rendering ----------
function render() {
  if (!stateLoaded || !playersLoaded) return;

  if (me && !players[me.id]) {
    // non risulto iscritto: nuova partita (reset) oppure non ho ancora premuto Partecipa
    if (!$('#join-form').dataset.busy) { show('join'); }
    return;
  }
  if (!me) { show('join'); return; }

  const phase = state ? state.phase : 'lobby';

  if (phase === 'lobby' || !state) {
    $('#wait-name').textContent = `Ciao ${me.name}!`;
    $('#wait-text').textContent = 'Sei dentro! Guarda lo schermo, il quiz sta per iniziare.';
    show('wait');
  } else if (phase === 'question') {
    if (sent && sent.index === state.index && sent.session === (state.endsAt)) {
      showSent();
    } else {
      showQuestion();
    }
  } else if (phase === 'reveal') {
    showReveal();
  } else if (phase === 'final') {
    showFinal();
  }
}

function showQuestion() {
  if (builtFor !== state.index || state.endsAt !== qEnd) {
    builtFor = state.index;
    qEnd = state.endsAt;
    qStart = Date.now();
    $('#qnum').textContent = `Domanda ${state.index + 1} / ${state.total}`;
    $('#qtext').textContent = state.question.text;
    const box = $('#answers');
    box.replaceChildren();
    state.question.options.forEach((txt, i) => {
      const b = el('button', `ans c${i}`);
      b.type = 'button';
      b.append(el('span', 'letter', LETTERS[i]), el('span', 'atext', txt), el('span', 'shape', SHAPES[i]));
      b.addEventListener('click', () => answer(i));
      box.append(b);
    });
    const bar = $('#timerbar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${state.duration}s linear`;
    bar.style.width = '0%';
  }
  show('question');
}

async function answer(choice) {
  if (!state || state.phase !== 'question') return;
  const ms = Date.now() - qStart;
  if (ms > state.duration * 1000 + 500) return;
  sent = { index: state.index, choice, session: state.endsAt };
  localStorage.setItem(SENT_KEY, JSON.stringify(sent));
  showSent();
  await db.set(`game/answers/${state.index}/${me.id}`, { c: choice, ms });
}

function showSent() {
  const b = $('#sent-badge');
  b.className = `sent-badge c${sent.choice}`;
  b.textContent = `${LETTERS[sent.choice]} ${SHAPES[sent.choice]}`;
  show('sent');
}

function showReveal() {
  const last = players[me.id].last;
  const { rank, total, score } = myStanding();
  const icon = $('#res-icon');
  const title = $('#res-title');
  const pts = $('#res-points');
  if (last && last.q === state.index) {
    if (last.correct) {
      icon.textContent = '🎉'; title.textContent = 'Giusto!'; pts.textContent = `+${last.points} punti`;
    } else if (last.choice === -1) {
      icon.textContent = '⏰'; title.textContent = 'Tempo scaduto'; pts.textContent = 'Nessuna risposta';
    } else {
      icon.textContent = '😅'; title.textContent = 'Sbagliato…';
      pts.textContent = `Era la ${LETTERS[state.correct]}: ${state.question.options[state.correct]}`;
    }
  } else {
    icon.textContent = '👋'; title.textContent = 'Ti sei unito da poco';
    pts.textContent = 'Dalla prossima domanda si gioca!';
  }
  $('#res-score').textContent = score;
  $('#res-rank').textContent = `${rank}°`;
  $('#res-of').textContent = `su ${total}`;
  show('reveal');
}

function showFinal() {
  const { rank, total, score } = myStanding();
  $('#fin-rank').textContent = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎈';
  $('#fin-title').textContent = rank <= 3 ? `Sei ${rank}° su ${total}!` : `Sei ${rank}° su ${total}`;
  $('#fin-score').textContent = `${score} punti`;
  $('#fin-footer').textContent = COUPLE.footer;
  show('final');
}

// aggiorna il tasto "tempo scaduto" sul telefono
function tick() {
  if (!state || state.phase !== 'question') return;
  const left = state.duration - (Date.now() - qStart) / 1000;
  const secs = $('#secs');
  if (secs) secs.textContent = Math.max(0, Math.ceil(left));
  document.querySelectorAll('#answers .ans').forEach((b) => { b.disabled = left <= 0; });
}

init();
