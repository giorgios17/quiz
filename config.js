// ============================================================
//  CONFIGURAZIONE
// ============================================================

// Incolla qui la configurazione di Firebase (vedi README.md).
// Finché resta `null` il quiz funziona in MODALITÀ DEMO LOCALE:
// host e telefono comunicano solo tra schede dello stesso browser (utile per provare).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDnLfR0zoZomzSFxFQMxSQCeSTcD_34M0I",
  authDomain: "quiz-1af34.firebaseapp.com",
  databaseURL: "https://quiz-1af34-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quiz-1af34",
  storageBucket: "quiz-1af34.firebasestorage.app",
  messagingSenderId: "420483866527",
  appId: "1:420483866527:web:63ee735c9051a54ac6e7aa"
};

export const COUPLE = {
  names: "Sposo & Sposa",          // <-- metti i vostri nomi
  title: "Quanto conosci gli sposi?",
  footer: "Grazie per aver giocato con noi!"
};

// Secondi a disposizione per domanda (si può cambiare per singola domanda in questions.js)
export const DEFAULT_TIME = 20;

// Secondi in cui resta visibile la risposta giusta prima di passare alla domanda successiva
export const REVEAL_TIME = 10;

export const CREDIT = "Sviluppato da Giorgio Surace";
