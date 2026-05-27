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

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// Persistência offline
db.enablePersistence({ synchronizeTabs: true })
  .then(() => console.log("✅ Persistência offline ativada."))
  .catch(err => {
    if (err.code === 'failed-precondition') console.warn("Persistência: múltiplas abas abertas.");
    else if (err.code === 'unimplemented')   console.warn("Persistência não suportada neste browser.");
    else console.error("Erro persistência:", err);
  });

window.auth = auth;
window.db   = db;

console.log("🔥 Firebase HELIVI conectado!");

// ── Firebase Functions ─────────────────────────────────────
// Para testar localmente com o emulador, descomente a linha abaixo:
// firebase.functions().useEmulator("localhost", 5001);
// Para produção, deixe comentado (usa as Functions publicadas)

