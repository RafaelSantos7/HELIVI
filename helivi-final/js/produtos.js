// produtos.js — HELIVI
let editId = null,
  cache = [],
  catSel = "";

const CAT_COLORS = {
  Comida: "#F97316",
  Bebida: "#3B82F6",
  Lanche: "#10B981",
  Porção: "#8B5CF6",
  Sobremesa: "#EC4899",
  Combo: "#F59E0B",
  Entrada: "#06B6D4",
  Outros: "#94A3B8",
};
const CATS_DEFAULT = [
  "Comida",
  "Bebida",
  "Lanche",
  "Porção",
  "Sobremesa",
  "Combo",
  "Entrada",
  "Outros",
];
let catsCustom = JSON.parse(localStorage.getItem("helivi_cats") || "[]");
let dropOpen = false;

function catColor(c) {
  return CAT_COLORS[c] || "#94A3B8";
}

document.addEventListener("DOMContentLoaded", () => {
  requireAuth((user, perfil, ownerUid) => {
    const oUid = ownerUid || window.OWNER_UID || user.uid;
    window.OWNER_UID = oUid;
    setupTopbar(user, perfil, oUid);
    loadProds(oUid);
    bindForm(oUid);
    initCatDrop();
  });
});

// ── Load produtos ─────────────────────────────────────────
function loadProds(uid) {
  data.produtos.subscribeByOwner(
    uid,
    (lista) => {
      cache = lista.sort(
        (a, b) =>
          (a.categoria || "").localeCompare(b.categoria || "") ||
          (a.nome || "").localeCompare(b.nome || ""),
      );
      renderList(cache);
    },
    (err) => {
      document.getElementById("listaProds").innerHTML =
        `<div class="empty-box"><div class="empty-icon">${ic("alert")}</div><div class="empty-title">Erro ao carregar</div><div class="empty-sub">${err.message}</div></div>`;
    },
  );
}

function renderList(lista, filtro = "") {
  const el = document.getElementById("listaProds");
  const arr = filtro
    ? lista.filter(
        (p) =>
          p.nome.toLowerCase().includes(filtro.toLowerCase()) ||
          (p.categoria || "").toLowerCase().includes(filtro.toLowerCase()),
      )
    : lista;
  if (!arr.length) {
    el.innerHTML = `<div class="empty-box"><div class="empty-icon">${ic("pkg")}</div><div class="empty-title">Nenhum produto cadastrado</div><div class="empty-sub">Use o formulário acima para adicionar produtos ao cardápio</div></div>`;
    return;
  }
  el.innerHTML = arr
    .map((p) => {
      const lucro = Number(p.preco) - Number(p.custo);
      const mg = p.preco > 0 ? ((lucro / p.preco) * 100).toFixed(0) : 0;
      return `<div class="prod-item">
      <div class="pi-dot" style="background:${catColor(p.categoria)}"></div>
      <div class="pi-info">
        <div class="pi-nm">${p.nome}</div>
        <div class="pi-ct">${p.categoria || "Sem categoria"} · Margem ${mg}%</div>
      </div>
      <div class="pi-prs">
        <div class="pi-pr">${fmtR(p.preco)}</div>
        <div class="pi-cs">custo ${fmtR(p.custo)}</div>
        <div class="pi-lc">+${fmtR(lucro)}</div>
      </div>
      <div class="pi-acts">
        <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick="abrirEdit('${p.id}')">${ic("edit")}</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Excluir" onclick="excluir('${p.id}','${p.nome.replace(/'/g, "\\'")}')"><span style="color:var(--err)">${ic("trash")}</span></button>
      </div>
    </div>`;
    })
    .join("");
}

// ── Category dropdown premium ─────────────────────────────
function initCatDrop() {
  const btn = document.getElementById("catBtn");
  const drop = document.getElementById("catDrop");
  const si = document.getElementById("catSearchIn");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDrop();
  });
  si?.addEventListener("input", () => renderCatOpts(si.value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".cat-wrap")) closeDrop();
  });
  document
    .getElementById("catCreateBtn")
    ?.addEventListener("click", criarCatCustom);
  renderCatOpts();
}
function toggleDrop() {
  dropOpen = !dropOpen;
  document.getElementById("catDrop")?.classList.toggle("open", dropOpen);
  document.getElementById("catBtn")?.classList.toggle("open", dropOpen);
  if (dropOpen) document.getElementById("catSearchIn")?.focus();
}
function closeDrop() {
  dropOpen = false;
  document.getElementById("catDrop")?.classList.remove("open");
  document.getElementById("catBtn")?.classList.remove("open");
}
function renderCatOpts(filtro = "") {
  const list = document.getElementById("catOptList");
  if (!list) return;
  const todas = [
    ...CATS_DEFAULT,
    ...catsCustom.filter((c) => !CATS_DEFAULT.includes(c)),
  ];
  const filtered = filtro
    ? todas.filter((c) => c.toLowerCase().includes(filtro.toLowerCase()))
    : todas;
  list.innerHTML =
    filtered
      .map(
        (c) => `
    <div class="cat-opt ${catSel === c ? "sel" : ""}" onclick="selecionarCat('${c}')">
      <span class="cat-dot" style="background:${catColor(c)}"></span>${c}
    </div>`,
      )
      .join("") ||
    `<div style="padding:12px;font-size:12px;color:var(--t4);text-align:center">Nenhuma categoria</div>`;
}
function selecionarCat(cat) {
  catSel = cat;
  const btn = document.getElementById("catBtn");
  btn.innerHTML = `<span class="cat-dot" style="background:${catColor(cat)}"></span><span class="cat-val-txt">${cat}</span><span class="cat-btn-chevron">${ic("chevD")}</span>`;
  closeDrop();
  renderCatOpts("");
}
function criarCatCustom() {
  const val = document.getElementById("catSearchIn")?.value.trim();
  if (!val) return;
  if (!catsCustom.includes(val) && !CATS_DEFAULT.includes(val)) {
    catsCustom.push(val);
    localStorage.setItem("helivi_cats", JSON.stringify(catsCustom));
  }
  selecionarCat(val);
}

// ── Formulário — CORRIGIDO ────────────────────────────────
let formBound = false;
function bindForm(uid) {
  if (formBound) return;
  formBound = true;
  const form = document.getElementById("formProd");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSalvar");
    if (btn.disabled) return; // evita duplo clique / listeners fantasma

    // Validação
    const nome = document.getElementById("fNome").value.trim();
    const preco = parseFloat(document.getElementById("fPreco").value);
    const custo = parseFloat(document.getElementById("fCusto").value);
    let valid = true;
    if (!nome) {
      showErr("fNome", "Nome é obrigatório");
      valid = false;
    } else clearErr("fNome");
    if (isNaN(preco) || preco < 0) {
      showErr("fPreco", "Preço inválido");
      valid = false;
    } else clearErr("fPreco");
    if (isNaN(custo) || custo < 0) {
      showErr("fCusto", "Custo inválido");
      valid = false;
    } else clearErr("fCusto");
    if (!valid) return;

    const original = btn.innerHTML;
    // ✅ CORRIGIDO: desabilita + mostra loading
    btn.disabled = true;
    btn.innerHTML = `<div class="spin"></div> ${editId ? "Atualizando..." : "Cadastrando..."}`;

    const dados = {
      nome,
      preco,
      custo,
      categoria: catSel || "Outros",
      uid: uid,
      updatedAt: data.serverTimestamp(),
    };

    try {
      if (editId) {
        const updated = await data.produtos.update(editId, dados);
        cache = cache.map((p) => (p.id === editId ? { ...p, ...updated } : p));
        toast("Produto atualizado com sucesso!", "success");
      } else {
        dados.createdAt = data.serverTimestamp();
        const created = await data.produtos.create(dados);
        cache = [...cache, created];
        toast("Produto cadastrado!", "success");
      }
      renderList(cache, document.getElementById("buscaProd")?.value || "");
      // ✅ CORRIGIDO: resetar SEMPRE após salvar
      resetForm();
    } catch (err) {
      toast("Erro: " + err.message, "error");
    } finally {
      // ✅ CORRIGIDO: restaurar botão SEMPRE (sucesso ou erro)
      btn.disabled = false;
      btn.innerHTML = editId ? `${ic("check")} Atualizar Produto` : original;
    }
  });
  document.getElementById("btnCancelar")?.addEventListener("click", resetForm);
  document
    .getElementById("buscaProd")
    ?.addEventListener("input", (e) => renderList(cache, e.target.value));
}

function showErr(id, msg) {
  document.getElementById(id)?.classList.add("err");
  let el = document
    .getElementById(id)
    ?.parentElement?.querySelector(".field-err");
  if (!el) {
    el = document.createElement("div");
    el.className = "field-err";
    document.getElementById(id)?.parentElement?.appendChild(el);
  }
  el.textContent = "⚠ " + msg;
}
function clearErr(id) {
  document.getElementById(id)?.classList.remove("err");
  document
    .getElementById(id)
    ?.parentElement?.querySelector(".field-err")
    ?.remove();
}

// ✅ CORRIGIDO: reset TOTAL do formulário
function resetForm() {
  editId = null;
  catSel = "";
  // Limpa campos
  document.getElementById("fNome").value = "";
  document.getElementById("fPreco").value = "";
  document.getElementById("fCusto").value = "";
  // Reseta categoria
  const catBtn = document.getElementById("catBtn");
  if (catBtn)
    catBtn.innerHTML = `<span class="cat-placeholder">Selecione uma categoria...</span><span class="cat-btn-chevron">${ic("chevD")}</span>`;
  // Limpa erros
  ["fNome", "fPreco", "fCusto"].forEach((id) => clearErr(id));
  // Reseta header
  document.getElementById("formTitleTxt").textContent = "Novo Produto";
  document.getElementById("btnSalvar").innerHTML =
    `${ic("plus")} Cadastrar Produto`;
  document.getElementById("btnCancelar").style.display = "none";
  document.getElementById("btnSalvar").disabled = false;
  renderCatOpts("");
  document.getElementById("fNome").focus();
}

function abrirEdit(id) {
  const p = cache.find((x) => x.id === id);
  if (!p) return;
  editId = id;
  document.getElementById("fNome").value = p.nome;
  document.getElementById("fPreco").value = p.preco;
  document.getElementById("fCusto").value = p.custo;
  selecionarCat(p.categoria || "Outros");
  document.getElementById("formTitleTxt").textContent = "Editar Produto";
  document.getElementById("btnSalvar").innerHTML =
    `${ic("check")} Atualizar Produto`;
  document.getElementById("btnCancelar").style.display = "inline-flex";
  document.getElementById("formProd").scrollIntoView({ behavior: "smooth" });
}

async function excluir(id, nome) {
  const ok = await confirmar(
    `Excluir "${nome}"?\nEsta ação não pode ser desfeita.`,
  );
  if (!ok) return;
  try {
    await data.produtos.remove(id);
    cache = cache.filter((p) => p.id !== id);
    const filtro = document.getElementById("buscaProd")?.value || "";
    renderList(cache, filtro);
    toast("Produto excluído", "info");
  } catch (err) {
    toast("Erro: " + err.message, "error");
  }
}
