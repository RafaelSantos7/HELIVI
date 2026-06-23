// historico.js — HELIVI
document.addEventListener("DOMContentLoaded", () => {
  requireAuth((user, perfil, ownerUid) => {
    const oUid = ownerUid || window.OWNER_UID || user.uid;
    window.OWNER_UID = oUid;
    setupTopbar(user, perfil, oUid);
    load(oUid, "hoje");
    bindFiltros(oUid);
  });
});
function bindFiltros(uid) {
  document.querySelectorAll(".filt-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll(".filt-btn")
        .forEach((x) => x.classList.remove("ativo"));
      b.classList.add("ativo");
      load(uid, b.dataset.f);
    }),
  );
}
function load(uid, f) {
  const el = document.getElementById("listaHist");
  el.innerHTML = `<div class="loading-box"><div class="spin"></div><span>Carregando...</span></div>`;
  const agora = new Date();
  let ini;
  if (f === "hoje")
    ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  else if (f === "semana") {
    ini = new Date(agora);
    ini.setDate(agora.getDate() - 7);
  } else if (f === "mes")
    ini = new Date(agora.getFullYear(), agora.getMonth(), 1);
  // Busca simples sem índice composto, ordena no cliente
  let q = db.collection("pedidos").where("uid", "==", uid).limit(500);
  q.get()
    .then((snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Filtro por data no cliente
      if (ini)
        list = list.filter((p) => {
          const dt = p.serverTime?.toDate
            ? p.serverTime.toDate()
            : new Date(p.createdAt || 0);
          return dt >= ini;
        });
      list.sort((a, b) => {
        const da = a.serverTime?.toDate
          ? a.serverTime.toDate()
          : new Date(a.createdAt || 0);
        const db2 = b.serverTime?.toDate
          ? b.serverTime.toDate()
          : new Date(b.createdAt || 0);
        return db2 - da;
      });
      resumo(list);
      renderHist(list);
    })
    .catch(() => {
      el.innerHTML = `<div class="empty-box"><div class="ei">⚠️</div><div class="et">Erro ao carregar</div></div>`;
    });
}
function resumo(list) {
  const tv = list.reduce((s, p) => s + p.total, 0);
  document.getElementById("rTotal").textContent = fmtR(tv);
  document.getElementById("rQtd").textContent = list.length;
  document.getElementById("rTicket").textContent = fmtR(
    list.length ? tv / list.length : 0,
  );
}
function renderHist(list) {
  const el = document.getElementById("listaHist");
  if (!list.length) {
    el.innerHTML = `<div class="empty-box"><div class="ei">📋</div><div class="et">Nenhuma venda no período</div></div>`;
    return;
  }
  el.innerHTML = list
    .map((p) => {
      const dt = fmtData(p.serverTime || p.createdAt);
      const pag = (p.pagamento || "").toLowerCase();
      const bc = pag.includes("pix")
        ? "badge-green"
        : pag.includes("créd") || pag.includes("cred")
          ? "badge-blue"
          : pag.includes("din")
            ? "badge-yellow"
            : "badge-gray";
      return `<div class="hist-item" onclick="detalhe('${p.id}')">
      <div class="hi-head"><span class="hi-id">#${p.numeroPedido || p.id.slice(-6).toUpperCase()}</span><span class="hi-data">${dt}</span></div>
      <div class="hi-nome">${p.cliente || p.mesa ? (p.cliente || "") + (p.mesa ? " · Mesa " + p.mesa : "") : "—"}</div>
      <div class="hi-itens">${(p.itens || []).map((i) => i.quantidade + "x " + i.nome).join(" · ")}</div>
      ${p.obsGeral ? `<div style="font-size:12px;color:var(--warning);margin-bottom:6px">📝 ${p.obsGeral}</div>` : ""}
      <div class="hi-foot"><span class="badge ${bc}">${p.pagamento || "—"}</span><span class="hi-total">${fmtR(p.total)}</span></div>
    </div>`;
    })
    .join("");
}
function detalhe(id) {
  db.collection("pedidos")
    .doc(id)
    .get()
    .then((doc) => {
      if (!doc.exists) return;
      const p = { id: doc.id, ...doc.data() };
      document.getElementById("detBody").innerHTML = `
      <p style="font-size:11px;font-weight:700;color:var(--text-500);text-transform:uppercase;letter-spacing:.5px">Pedido #${p.numeroPedido || p.id.slice(-6).toUpperCase()}</p>
      <p style="font-size:13px;color:var(--text-500);margin-top:2px">${fmtData(p.serverTime || p.createdAt)}</p>
      ${p.cliente ? `<p style="font-size:16px;font-weight:700;margin-top:10px">👤 ${p.cliente}</p>` : ""}
      ${p.mesa ? `<p style="font-size:13px;color:var(--text-500)">🪑 Mesa ${p.mesa}</p>` : ""}
      ${p.obsGeral ? `<div style="background:var(--warning-bg);border:1px solid #FDE68A;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:13px;color:var(--warning)">📝 ${p.obsGeral}</div>` : ""}
      <div class="divider"></div>
      ${(p.itens || [])
        .map(
          (i) => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:14px;font-weight:600">${i.quantidade}x ${i.nome}</div>${i.obs ? `<div style="font-size:11px;color:var(--text-500);font-style:italic">${i.obs}</div>` : ""}</div>
          <div style="font-size:14px;font-weight:700;color:var(--brand)">${fmtR(i.preco * i.quantidade)}</div>
        </div>`,
        )
        .join("")}
      <div class="divider"></div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:16px;font-weight:800">TOTAL</span>
        <span style="font-size:22px;font-weight:800;color:var(--brand)">${fmtR(p.total)}</span>
      </div>
      <p style="font-size:13px;color:var(--text-500);margin-top:6px">💳 ${p.pagamento || ""}</p>
      ${p.cartao1 ? `<p style="font-size:12px;color:var(--text-500)">Cartão 1: ${fmtR(p.cartao1)} · Cartão 2: ${fmtR(p.cartao2 || 0)}</p>` : ""}
      ${p.lucro ? `<p style="font-size:13px;color:var(--success);margin-top:3px">📈 Lucro: ${fmtR(p.lucro)}</p>` : ""}`;
      document.getElementById("btnDetImprimir").onclick = () =>
        imprimirCupom(p);
      openModal("modalDet");
    });
}
