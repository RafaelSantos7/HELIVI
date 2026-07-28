// kds.js — HELIVI — Kitchen Display System
// Usado por cozinha.html e balcao.html
// A variável KDS_SETOR deve ser definida antes deste script:
// window.KDS_SETOR = 'cozinha' ou 'balcao'

const COLECAO = window.KDS_SETOR === "balcao" ? "kds_balcao" : "kds_cozinha";
const TEM_ENTREGUE = window.KDS_SETOR === "balcao";

// Status possíveis
const STATUS = TEM_ENTREGUE
  ? ["novo", "preparando", "pronto", "entregue"]
  : ["novo", "preparando", "pronto"];

let todosCards = [];
let uidAtual = null;
let timerInterval = null;
let ultimoCount = 0;

document.addEventListener("DOMContentLoaded", () => {
  requireAuth((user, perfil, ownerUid) => {
    // KDS filtra pelo tenant (ownerUid), não pelo UID do login de cozinha/balcão.
    uidAtual = ownerUid || window.OWNER_UID || user.id || user.uid;
    window.OWNER_UID = uidAtual;
    iniciarKDS(uidAtual);
    iniciarRelogio();
  });
});

function iniciarKDS(uid) {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const setor = window.KDS_SETOR === "balcao" ? "balcao" : "cozinha";
  data.kds.subscribe(setor, uid, (lista) => {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const novos = lista.filter((p) => {
      const dt = p.serverTime?.toDate
        ? p.serverTime.toDate()
        : new Date(p.createdAt || 0);
      return dt >= inicioDia;
    });
    // Detecta novos pedidos para tocar som
    const novoCount = novos.filter((p) => p.status === "novo").length;
    if (novoCount > ultimoCount) beepKDS();
    ultimoCount = novoCount;
    todosCards = novos;
    renderBoard();
    atualizarStats();
  });

  // Timer de refresh dos contadores a cada 30s
  timerInterval = setInterval(() => renderBoard(), 30000);
}

function renderBoard() {
  STATUS.forEach((st) => {
    const col = document.getElementById("col-" + st);
    const badge = document.getElementById("badge-" + st);
    if (!col) return;
    const cards = todosCards.filter((p) => p.status === st);
    if (badge) badge.textContent = cards.length;
    if (!cards.length) {
      col.innerHTML = `<div class="kds-col-empty"><div class="kds-col-empty-icon">${statusIcon(st)}</div><div class="kds-col-empty-txt">Nenhum pedido</div></div>`;
      return;
    }
    col.innerHTML = cards.map((p) => renderCard(p)).join("");
  });
}

function renderCard(p) {
  const dt = p.serverTime?.toDate
    ? p.serverTime.toDate()
    : new Date(p.createdAt);
  const hora = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const mins = Math.floor((Date.now() - dt) / 60000);
  const timerClass =
    mins < 10 ? "timer-ok" : mins < 20 ? "timer-aviso" : "timer-atrasado";
  const urgente =
    mins >= 20 && (p.status === "novo" || p.status === "preparando");
  const ehNovo = p.status === "novo";

  const itensHtml = (p.itens || [])
    .map(
      (i) => `
    <div class="kds-item-row">
      <div class="kds-item-qtd">${i.quantidade}</div>
      <div class="kds-item-info">
        <div class="kds-item-nome">${escHtml(i.nome)}</div>
        ${i.obs ? `<div class="kds-item-obs">📝 ${escHtml(i.obs)}</div>` : ""}
      </div>
    </div>`,
    )
    .join("");

  const botoesHtml = botoesStatus(p.id, p.status);

  return `
  <div class="kds-card status-${p.status}${urgente ? " urgente" : ""}" id="kcard-${p.id}">
    ${ehNovo ? `<div class="kds-card-new-badge">🆕 NOVO PEDIDO</div>` : ""}
    <div class="kds-card-head">
      <div>
        <div class="kds-card-num">#${escHtml(p.numeroPedido || p.id.slice(-4).toUpperCase())}</div>
        <div class="kds-card-cliente">${escHtml(p.cliente || p.mesa ? (p.cliente || "") + (p.mesa ? " · Mesa " + p.mesa : "") : "—")}</div>
      </div>
      <div class="kds-card-right">
        <div class="kds-card-hora">${hora}</div>
        <span class="kds-timer ${timerClass}">${mins}min</span>
      </div>
    </div>
    <div class="kds-card-items">${itensHtml}</div>
    ${p.obsGeral ? `<div class="kds-card-obs">📝 ${escHtml(p.obsGeral)}</div>` : ""}
    <div class="kds-card-actions">${botoesHtml}</div>
  </div>`;
}

function botoesStatus(id, status) {
  const btns = [];
  if (status === "novo") {
    btns.push(
      `<button class="kds-btn kds-btn-prep" onclick="mudarStatus('${id}','preparando')">🟡 Preparando</button>`,
    );
  }
  if (status === "preparando") {
    btns.push(
      `<button class="kds-btn kds-btn-pronto" onclick="mudarStatus('${id}','pronto')">🟢 Pronto</button>`,
    );
  }
  if (status === "pronto" && TEM_ENTREGUE) {
    btns.push(
      `<button class="kds-btn kds-btn-entregar" onclick="mudarStatus('${id}','entregue')">✅ Entregue</button>`,
    );
  }
  if (status === "pronto" && !TEM_ENTREGUE) {
    btns.push(
      `<span style="font-size:12px;color:#4ADE80;font-weight:700;padding:4px 0">✅ Pronto para retirada</span>`,
    );
  }
  return btns.join("");
}

async function mudarStatus(id, novoStatus) {
  try {
    const setor = window.KDS_SETOR === "balcao" ? "balcao" : "cozinha";
    await data.kds.update(setor, id, {
      status: novoStatus,
      [`statusAt_${novoStatus}`]: data.serverTimestamp(),
    });
    // Feedback sonoro
    if (novoStatus === "pronto") beepOk();
    else beep(660, 0.1);
  } catch (err) {
    toast("Erro ao atualizar status", "error");
  }
}

function statusIcon(st) {
  return (
    { novo: "🆕", preparando: "👨‍🍳", pronto: "✅", entregue: "🤝" }[st] || "📋"
  );
}

function atualizarStats() {
  const novos = todosCards.filter((p) => p.status === "novo").length;
  const prepando = todosCards.filter((p) => p.status === "preparando").length;
  const prontos = todosCards.filter((p) => p.status === "pronto").length;
  const el_n = document.getElementById("statNovos");
  const el_p = document.getElementById("statPrep");
  const el_r = document.getElementById("statProntos");
  if (el_n) el_n.textContent = novos;
  if (el_p) el_p.textContent = prepando;
  if (el_r) el_r.textContent = prontos;
}

function iniciarRelogio() {
  const el = document.getElementById("kdsClock");
  function tick() {
    if (el)
      el.textContent = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
  }
  tick();
  setInterval(tick, 1000);
}
