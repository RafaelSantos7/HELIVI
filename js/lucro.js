// lucro.js — HELIVI
document.addEventListener("DOMContentLoaded", () => {
  requireAuth((user, perfil, ownerUid) => {
    const oUid = ownerUid || window.OWNER_UID || user.uid;
    window.OWNER_UID = oUid;
    setupTopbar(user, perfil, oUid);
    loadLucro(oUid, "hoje");
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
      loadLucro(uid, b.dataset.f);
    }),
  );
}
function loadLucro(uid, f) {
  document.getElementById("loadingL").style.display = "flex";
  document.getElementById("conteudoL").style.display = "none";
  const agora = new Date();
  let ini;
  if (f === "hoje")
    ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  else if (f === "semana") {
    ini = new Date(agora);
    ini.setDate(agora.getDate() - 7);
  } else if (f === "mes")
    ini = new Date(agora.getFullYear(), agora.getMonth(), 1);
  let q = db.collection("pedidos").where("uid", "==", uid).limit(500);
  q.get()
    .then((snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (ini)
        list = list.filter((p) => {
          const dt = p.serverTime?.toDate
            ? p.serverTime.toDate()
            : new Date(p.createdAt || 0);
          return dt >= ini;
        });
      renderLucro(list);
      document.getElementById("loadingL").style.display = "none";
      document.getElementById("conteudoL").style.display = "block";
    })
    .catch(() => {
      document.getElementById("loadingL").innerHTML =
        '<span style="color:var(--danger)">Erro ao carregar</span>';
    });
}
function renderLucro(list) {
  const tv = list.reduce((s, p) => s + p.total, 0);
  const tl = list.reduce((s, p) => s + (p.lucro || 0), 0);
  const qt = list.length,
    tk = qt ? tv / qt : 0;
  const mg = tv > 0 ? ((tl / tv) * 100).toFixed(1) : 0;
  document.getElementById("lFat").textContent = fmtR(tv);
  document.getElementById("lLucro").textContent = fmtR(tl);
  document.getElementById("lVendas").textContent = qt;
  document.getElementById("lTicket").textContent = fmtR(tk);
  document.getElementById("lMargem").textContent = mg + "%";
  document.getElementById("lCusto").textContent = fmtR(tv - tl);
  const pags = {};
  list.forEach((p) => {
    pags[p.pagamento] = (pags[p.pagamento] || 0) + 1;
  });
  document.getElementById("lPags").innerHTML =
    Object.entries(pags)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([tipo, q]) =>
          `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:14px"><span style="font-weight:500">${tipo}</span><span class="badge badge-orange">${q}x</span></div>`,
      )
      .join("") ||
    '<p style="color:var(--text-300);font-size:13px">Sem dados</p>';
  const prods = {};
  list.forEach((p) =>
    (p.itens || []).forEach((i) => {
      if (!prods[i.nome]) prods[i.nome] = { q: 0, r: 0, l: 0 };
      prods[i.nome].q += i.quantidade;
      prods[i.nome].r += i.preco * i.quantidade;
      prods[i.nome].l += (i.preco - i.custo) * i.quantidade;
    }),
  );
  const top = Object.entries(prods)
    .sort((a, b) => b[1].q - a[1].q)
    .slice(0, 7);
  document.getElementById("lTop").innerHTML =
    top
      .map(
        ([nome, d], i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;font-weight:800;color:var(--text-300);min-width:24px">${i + 1}</span>
      <div style="flex:1"><div style="font-size:14px;font-weight:600">${nome}</div><div style="font-size:11px;color:var(--text-500)">${d.q}x · receita ${fmtR(d.r)}</div></div>
      <span style="font-size:13px;font-weight:700;color:var(--success)">+${fmtR(d.l)}</span>
    </div>`,
      )
      .join("") ||
    '<p style="color:var(--text-300);font-size:13px">Sem dados</p>';
}
