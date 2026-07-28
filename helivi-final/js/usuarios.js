// usuarios.js — HELIVI
"use strict";

let cacheUsuarios = [];
let editDocId = null,
  editUid = null;

document.addEventListener("DOMContentLoaded", () => {
  requireAuth((user, perfil, ownerUid) => {
    // Garante ownerUid válido — fallback para uid do próprio usuário
    const oUid = ownerUid || window.OWNER_UID || user.id || user.uid;
    window.OWNER_UID = oUid;
    setupTopbar(user, perfil, oUid);
    carregarUsuarios(oUid);
    bindUI();
  });
});

function carregarUsuarios(ownerUid) {
  if (!ownerUid) {
    console.warn("ownerUid indefinido");
    return;
  }
  data.usuarios.subscribeByOwner(
    ownerUid,
    (lista) => {
      cacheUsuarios = lista;
      renderUsuarios(cacheUsuarios);
    },
    (err) => console.error("Erro carregar usuários:", err),
  );
}

async function refrescarUsuarios() {
  const ownerUid = window.OWNER_UID;
  if (!ownerUid || typeof data.usuarios.listByOwner !== "function") return;
  try {
    cacheUsuarios = await data.usuarios.listByOwner(ownerUid);
    renderUsuarios(cacheUsuarios);
  } catch (err) {
    console.error("Erro ao atualizar lista:", err);
  }
}

function renderUsuarios(lista) {
  const el = document.getElementById("listaUsuarios");
  if (!lista.length) {
    el.innerHTML = `<div class="empty-box">
      <div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div>
      <div class="empty-title">Nenhum colaborador cadastrado</div>
      <div class="empty-sub">Use o formulário acima para adicionar membros da equipe</div>
    </div>`;
    return;
  }
  const roleLabel = {
    admin: "Administrador",
    atendente: "Atendente",
    caixa: "Caixa",
    cozinha: "Cozinha",
    balcao: "Balcão",
  };
  const roleColor = {
    admin: "b-red",
    atendente: "b-blu",
    caixa: "b-grn",
    cozinha: "b-org",
    balcao: "b-pur",
  };
  el.innerHTML = lista
    .map(
      (u) => `
    <div class="user-item">
      <div class="u-av">${(u.nome || u.email || "?")[0].toUpperCase()}</div>
      <div class="u-info">
        <div class="u-nm">${escHtml(u.nome || "—")}</div>
        <div class="u-em">${escHtml(u.email)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span class="badge ${roleColor[u.role] || "b-gry"}">${roleLabel[u.role] || u.role}</span>
          <span style="font-size:11px;color:${u.ativo !== false ? "var(--ok)" : "var(--err)"}">${u.ativo !== false ? "● Ativo" : "● Inativo"}</span>
        </div>
      </div>
      <div class="u-acts">
        <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick="abrirEditar('${u.docId}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Excluir" onclick="excluirColab('${u.docId}','${u.uid || ""}','${(u.nome || "").replace(/'/g, "\\'")}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--err)" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>`,
    )
    .join("");
}

function bindUI() {
  document.getElementById("formUser").addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("uNome").value.trim();
    const email = document.getElementById("uEmail").value.trim().toLowerCase();
    const senha = document.getElementById("uSenha").value;
    const perfil = document.getElementById("uRole").value;

    // Validações
    if (!nome) {
      toast("Informe o nome", "warning");
      return;
    }
    if (!email || !email.includes("@")) {
      toast("E-mail inválido", "warning");
      return;
    }
    if (!editDocId && senha.length < 6) {
      toast("Senha mínimo 6 caracteres", "warning");
      return;
    }

    const btn = document.getElementById("btnSalvarUser");
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:rot .7s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>&nbsp;${editDocId ? "Salvando..." : "Criando conta..."}`;

    try {
      if (editDocId) {
        const r = await data.usuarios.editarColaborador({
          docId: editDocId,
          uid: editUid,
          nome,
          email,
          senha: senha || null,
          perfil,
        });
        toast(r?.mensagem || "Colaborador atualizado!", "success");
      } else {
        const r = await data.usuarios.criarColaborador({
          nome,
          email,
          senha,
          perfil,
        });
        toast(
          r?.mensagem || `Colaborador "${nome}" criado com sucesso!`,
          "success",
        );
      }
      await refrescarUsuarios();
      resetForm(); // só limpa se chegou aqui (sem erro)
    } catch (err) {
      console.error("Erro colaborador:", err);
      const code = String(err.code || "");
      const msg = String(err.message || err.details || err);

      if (code.includes("already-exists") || msg.includes("already-exists"))
        toast("Este e-mail já está cadastrado no sistema", "error");
      else if (
        code.includes("unauthenticated") ||
        msg.includes("unauthenticated")
      )
        toast(
          "Sessão expirada. Recarregue a página e faça login novamente.",
          "error",
        );
      else if (
        msg.includes("CORS") ||
        msg.includes("cors") ||
        msg.includes("Failed to fetch")
      )
        toast(
          "Erro de conexão. Verifique se a API do HELIVI está em execução.",
          "error",
        );
      else if (msg.includes("invalid-argument"))
        toast(msg.replace("invalid-argument: ", ""), "warning");
      else toast(`Erro: ${msg}`, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });

  document
    .getElementById("btnCancelarUser")
    ?.addEventListener("click", resetForm);
}

function abrirEditar(docId) {
  const u = cacheUsuarios.find((x) => x.docId === docId);
  if (!u) return;
  editDocId = docId;
  editUid = u.uid || null;
  document.getElementById("uNome").value = u.nome || "";
  document.getElementById("uEmail").value = u.email || "";
  document.getElementById("uSenha").value = "";
  document.getElementById("uRole").value = u.role || "atendente";
  document.getElementById("formTitleTxt").textContent = "Editar Colaborador";
  document.getElementById("btnSalvarUser").innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Atualizar`;
  document.getElementById("btnCancelarUser").style.display = "inline-flex";
  const lblSenha = document.getElementById("lblSenha");
  if (lblSenha)
    lblSenha.textContent = "Nova Senha (deixe em branco para manter)";
  document.getElementById("formUser").scrollIntoView({ behavior: "smooth" });
}

async function excluirColab(docId, uid, nome) {
  const ok = await confirmar(
    `Excluir "${nome}"?\nA conta de acesso será removida permanentemente.`,
  );
  if (!ok) return;
  try {
    const r = await data.usuarios.excluirColaborador({ docId, uid });
    cacheUsuarios = cacheUsuarios.filter(
      (u) => u.docId !== docId && u.uid !== uid,
    );
    renderUsuarios(cacheUsuarios);
    toast(r?.mensagem || "Colaborador removido.", "info");
  } catch (err) {
    toast("Erro ao excluir: " + (err.message || err), "error");
  }
}

function resetForm() {
  editDocId = null;
  editUid = null;
  ["uNome", "uEmail", "uSenha"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("uRole").value = "atendente";
  document.getElementById("formTitleTxt").textContent = "Novo Colaborador";
  document.getElementById("btnSalvarUser").innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Criar Colaborador`;
  document.getElementById("btnCancelarUser").style.display = "none";
  const lblSenha = document.getElementById("lblSenha");
  if (lblSenha) lblSenha.textContent = "Senha *";
  document.getElementById("uNome").focus();
}
