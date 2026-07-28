// auth.js — HELIVI — Supabase
// ownerUid = UID do dono da conta.
// Todos os colaboradores usam o ownerUid do administrador para acessar os mesmos dados.

"use strict";

const APENAS_ADMIN = [
  "historico.html",
  "lucro.html",
  "config.html",
  "usuarios.html",
];

const PAGINA_ATUAL = window.location.pathname.split("/").pop() || "index.html";

const APENAS_COZINHA = ["cozinha.html"];
const APENAS_BALCAO = ["balcao.html"];

window.PERFIL_ATUAL = "admin";
window.OWNER_UID = null;
window.HELIVI_CURRENT_USER = null;

function requireAuth(callback) {
  let bootstrappedForUid = null;

  if (!window.HELIVI?.auth) {
    console.error("Supabase não foi inicializado.");
    location.href = "index.html";
    return;
  }

  const processarSessao = async (sessao) => {
    const user = sessao?.user || null;

    if (!user) {
      window.HELIVI_CURRENT_USER = null;
      window.OWNER_UID = null;
      location.href = "index.html";
      return;
    }

    if (bootstrappedForUid === user.id) {
      return;
    }

    bootstrappedForUid = user.id;
    window.HELIVI_CURRENT_USER = user;

    const { perfil, ownerUid } = await buscarPerfilEOwner(user.id);
    const safeOwnerUid = ownerUid || user.id;

    window.PERFIL_ATUAL = perfil;
    window.OWNER_UID = safeOwnerUid;

    if (
      perfil === "cozinha" &&
      PAGINA_ATUAL !== "cozinha.html" &&
      PAGINA_ATUAL !== "index.html"
    ) {
      location.href = "cozinha.html";
      return;
    }

    if (
      perfil === "balcao" &&
      PAGINA_ATUAL !== "balcao.html" &&
      PAGINA_ATUAL !== "index.html"
    ) {
      location.href = "balcao.html";
      return;
    }

    if (APENAS_ADMIN.includes(PAGINA_ATUAL) && perfil !== "admin") {
      location.href = "dashboard.html";
      return;
    }

    if (typeof callback === "function") {
      callback(user, perfil, safeOwnerUid);
    }
  };

  window.HELIVI.auth
    .obterSessao()
    .then(processarSessao)
    .catch((error) => {
      console.error("Erro ao verificar sessão:", error);
      location.href = "index.html";
    });

  return window.HELIVI.auth.observar((evento, sessao) => {
    if (evento === "SIGNED_OUT") {
      window.HELIVI_CURRENT_USER = null;
      window.OWNER_UID = null;
      location.href = "index.html";
      return;
    }

    if (
      evento === "INITIAL_SESSION" ||
      evento === "SIGNED_IN" ||
      evento === "TOKEN_REFRESHED" ||
      evento === "USER_UPDATED"
    ) {
      processarSessao(sessao);
    }
  });
}

async function buscarPerfilEOwner(uid) {
  try {
    const row = await data.usuarios.buscarPerfilPorUid(uid);

    if (row) {
      return {
        perfil: row.role || row.perfil || "atendente",
        ownerUid:
          row.ownerUid || row.owner_uid || row.ownerId || row.owner_id || uid,
      };
    }

    return {
      perfil: "admin",
      ownerUid: uid,
    };
  } catch (error) {
    console.error("Erro ao buscar perfil do usuário:", error);

    return {
      perfil: "admin",
      ownerUid: uid,
    };
  }
}

async function logoutUser() {
  try {
    await window.HELIVI.auth.sair();

    window.HELIVI_CURRENT_USER = null;
    window.OWNER_UID = null;

    location.href = "index.html";
  } catch (error) {
    console.error("Erro ao sair:", error);
    toast("Não foi possível sair da conta.", "error");
  }
}

function getCurrentUID() {
  return window.HELIVI_CURRENT_USER?.id || null;
}

function getOwnerUID() {
  return window.OWNER_UID || getCurrentUID();
}

function getInitials(value) {
  return String(value || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
}

function obterNomeUsuario(user) {
  return (
    user?.user_metadata?.display_name ||
    user?.user_metadata?.displayName ||
    user?.user_metadata?.name ||
    user?.user_metadata?.nome ||
    user?.email?.split("@")[0] ||
    "Usuário"
  );
}

/** Escape HTML — use em toda interpolação de dados do banco ou usuário. */
function escHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

window.escHtml = escHtml;

// ── Toast ─────────────────────────────────────────────────

const _tw = (() => {
  const element = document.createElement("div");
  element.className = "toast-wrap";

  document.addEventListener("DOMContentLoaded", () => {
    if (!element.isConnected) {
      document.body.appendChild(element);
    }
  });

  return element;
})();

function toast(message, type = "info", duration = 3400) {
  const toastType =
    type === "success"
      ? "ok"
      : type === "error"
        ? "err"
        : type === "warning"
          ? "warn"
          : "info";

  const icons = {
    ok: "✅",
    err: "❌",
    warn: "⚠️",
    info: "ℹ️",
  };

  const element = document.createElement("div");
  element.className = `toast-item t-${toastType}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = icons[toastType];

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = String(message);

  element.appendChild(icon);
  element.appendChild(text);

  if (!_tw.isConnected && document.body) {
    document.body.appendChild(_tw);
  }

  _tw.appendChild(element);

  requestAnimationFrame(() => {
    element.classList.add("show");
  });

  setTimeout(() => {
    element.classList.remove("show");

    setTimeout(() => {
      element.remove();
    }, 350);
  }, duration);
}

// ── Modais ────────────────────────────────────────────────

function openModal(id) {
  const element = document.getElementById(id);

  if (element) {
    element.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(id) {
  const element = document.getElementById(id);

  if (element) {
    element.classList.remove("open");
    document.body.style.overflow = "";
  }
}

document.addEventListener("click", (event) => {
  if (event.target.classList.contains("overlay")) {
    event.target.classList.remove("open");
    document.body.style.overflow = "";
  }
});

function confirmar(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay open";

    const modal = document.createElement("div");
    modal.className = "modal-box confirm-box";

    const text = document.createElement("p");
    text.className = "confirm-msg";
    text.textContent = String(message);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";

    const cancelButton = document.createElement("button");
    cancelButton.className = "btn btn-ghost btn-full";
    cancelButton.textContent = "Cancelar";

    const confirmButton = document.createElement("button");
    confirmButton.className = "btn btn-err btn-full";
    confirmButton.textContent = "Confirmar";

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    modal.appendChild(text);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const finalizar = (resultado) => {
      overlay.remove();
      document.body.style.overflow = "";
      resolve(resultado);
    };

    confirmButton.addEventListener("click", () => finalizar(true));
    cancelButton.addEventListener("click", () => finalizar(false));

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finalizar(false);
      }
    });
  });
}

// ── Formatação ────────────────────────────────────────────

function fmtR(value) {
  return `R$\u00A0${Number(value || 0)
    .toFixed(2)
    .replace(".", ",")}`;
}

function normalizarData(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtData(value) {
  const date = normalizarData(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTempo(value) {
  const date = normalizarData(value);

  if (!date) {
    return "—";
  }

  const difference = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000),
  );

  if (difference < 1) {
    return "agora";
  }

  if (difference < 60) {
    return `${difference}min`;
  }

  const hours = Math.floor(difference / 60);
  const minutes = difference % 60;

  return `${hours}h${minutes ? `${minutes}min` : ""}`;
}

function fmtMins(value) {
  const date = normalizarData(value);

  if (!date) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

// ── Sons ──────────────────────────────────────────────────

function beep(frequency = 800, duration = 0.09) {
  if (localStorage.getItem("somAtivo") === "false") {
    return;
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + duration,
    );

    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch (error) {
    console.warn("Não foi possível reproduzir o som:", error);
  }
}

function beepOk() {
  [523, 659, 784, 1047].forEach((frequency, index) => {
    setTimeout(() => beep(frequency, 0.16), index * 80);
  });
}

function beepKDS() {
  if (localStorage.getItem("somAtivo") === "false") {
    return;
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    const context = new AudioContextClass();

    [880, 1100, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "square";

      const startTime = context.currentTime + index * 0.14;

      gain.gain.setValueAtTime(0.13, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.11);
    });
  } catch (error) {
    console.warn("Não foi possível reproduzir o som do KDS:", error);
  }
}

// ── Topbar ────────────────────────────────────────────────

function setupTopbar(user, perfil, ownerUid) {
  if (user) {
    window.HELIVI_CURRENT_USER = user;
  }

  if (ownerUid) {
    window.OWNER_UID = ownerUid;
  }

  const avatar = document.getElementById("topbarAvatar");
  const name = document.getElementById("topbarName");
  const nomeUsuario = obterNomeUsuario(user);

  if (avatar) {
    avatar.textContent = getInitials(nomeUsuario);
  }

  if (name) {
    name.textContent = nomeUsuario;
  }

  document.getElementById("btnLogout")?.addEventListener("click", logoutUser);

  _aplicarMenu(perfil || window.PERFIL_ATUAL || "admin");
  _setupSidebar();
  _setupMobileMenu();
}

function _aplicarMenu(perfil) {
  if (perfil !== "admin") {
    document
      .querySelectorAll(".sb-link[href], .mob-link[href]")
      .forEach((link) => {
        if (APENAS_ADMIN.includes(link.getAttribute("href"))) {
          link.style.display = "none";
        }
      });
  }

  if (perfil === "cozinha" || perfil === "balcao") {
    document
      .querySelectorAll(".sb-link[href], .mob-link[href]")
      .forEach((link) => {
        const href = link.getAttribute("href");
        const paginaPermitida =
          perfil === "cozinha" ? "cozinha.html" : "balcao.html";

        if (href !== paginaPermitida && href !== "index.html") {
          link.style.display = "none";
        }
      });
  }

  const badge = document.getElementById("topbarPerfilBadge");

  if (badge) {
    const labels = {
      atendente: "Atendente",
      caixa: "Caixa",
      cozinha: "Cozinha",
      balcao: "Balcão",
      admin: "",
    };

    const colors = {
      atendente: "b-blu",
      caixa: "b-grn",
      cozinha: "b-org",
      balcao: "b-blu",
      admin: "",
    };

    if (perfil !== "admin") {
      badge.textContent = labels[perfil] || perfil;
      badge.className = `badge ${colors[perfil] || "b-gry"}`;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }
}

function _setupSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");
  const toggle = document.getElementById("sbToggle");

  if (!sidebar || !main) {
    return;
  }

  if (localStorage.getItem("sb_collapsed") === "1") {
    sidebar.classList.add("collapsed");
    main.classList.add("collapsed");
  }

  if (toggle && toggle.dataset.heliviBound !== "true") {
    toggle.dataset.heliviBound = "true";

    toggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      main.classList.toggle("collapsed");

      localStorage.setItem(
        "sb_collapsed",
        sidebar.classList.contains("collapsed") ? "1" : "0",
      );
    });
  }
}

function _setupMobileMenu() {
  const button = document.getElementById("topbarMenu");
  const sidebar = document.querySelector(".sidebar");

  if (!button || !sidebar) {
    return;
  }

  let overlay = document.querySelector(".sb-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sb-overlay";
    document.body.appendChild(overlay);
  }

  if (button.dataset.heliviBound !== "true") {
    button.dataset.heliviBound = "true";

    button.addEventListener("click", () => {
      sidebar.classList.add("mobile-open");
      overlay.classList.add("show");
    });
  }

  if (overlay.dataset.heliviBound !== "true") {
    overlay.dataset.heliviBound = "true";

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      overlay.classList.remove("show");
    });
  }

  document.querySelectorAll(".sb-link").forEach((link) => {
    if (link.dataset.heliviMobileBound === "true") {
      return;
    }

    link.dataset.heliviMobileBound = "true";

    link.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      overlay.classList.remove("show");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".sb-logo-wrap img, .auth-logo, .kds-logo-wrap img")
    .forEach((image) => {
      const check = () => {
        if (!image.complete || image.naturalWidth === 0) {
          image.style.display = "none";

          const fallback = image.nextElementSibling;

          if (fallback) {
            fallback.style.display = "flex";
          }
        }
      };

      image.addEventListener("error", check, { once: true });

      if (image.complete) {
        check();
      }
    });
});
