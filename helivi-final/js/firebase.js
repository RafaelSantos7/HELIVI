// ============================================================
// firebase.js — HELIVI Final — Configuração Firebase
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyAmbMnkQjMllEK5E2HQqA77O21Re5rLpig",
  authDomain:        "helivi.firebaseapp.com",
  projectId:         "helivi",
  storageBucket:     "helivi.firebasestorage.app",
  messagingSenderId: "348055511499",
  appId:             "1:348055511499:web:a6f342494fce265c36d64e",
  measurementId:     "G-STDBWJ82T2"
};

const usarEmulador = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

firebase.initializeApp(firebaseConfig);

// Emuladores ANTES de qualquer uso de Auth/Firestore/Functions
if (usarEmulador) {
  firebase.firestore().useEmulator('localhost', 8080);
  firebase.auth().useEmulator('http://localhost:9099');
  if (typeof firebase.functions === 'function') {
    firebase.functions().useEmulator('localhost', 5001);
    console.log('🧪 Emuladores: Firestore :8080 | Auth :9099 | Functions :5001');
  } else {
    console.log('🧪 Emuladores: Firestore :8080 | Auth :9099');
  }
}

const auth = firebase.auth();
const db   = firebase.firestore();

// Persistência offline (desativada no emulador — evita conflitos)
if (!usarEmulador) {
  db.enablePersistence({ synchronizeTabs: true })
    .then(() => console.log('✅ Persistência offline ativada.'))
    .catch(err => {
      if (err.code === 'failed-precondition') console.warn('Persistência: múltiplas abas abertas.');
      else if (err.code === 'unimplemented')   console.warn('Persistência não suportada neste browser.');
      else console.error('Erro persistência:', err);
    });
}

window.auth = auth;
window.db   = db;

console.log('🔥 Firebase HELIVI conectado!');
