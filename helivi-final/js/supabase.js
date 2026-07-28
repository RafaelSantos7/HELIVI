// ============================================================
// supabase.js — HELIVI — Configuração Supabase
// ============================================================

(() => {
  "use strict";

  const config = window.HELIVI_CONFIG || {};

  const SUPABASE_URL =
    config.supabaseUrl || "https://bzfrqglxwpnbkgdpwozr.supabase.co";

  const SUPABASE_ANON_KEY =
    config.supabaseAnonKey || "COLE_AQUI_SUA_CHAVE_ANON_DO_SUPABASE";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error(
      "Supabase JS não foi carregado. Adicione o CDN do Supabase antes de supabase.js.",
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY === "COLE_AQUI_SUA_CHAVE_ANON_DO_SUPABASE"
  ) {
    throw new Error(
      "Configure SUPABASE_URL e SUPABASE_ANON_KEY antes de iniciar o HELIVI.",
    );
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      db: {
        schema: "public",
      },
    },
  );

  async function obterSessao() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("Erro ao recuperar sessão:", error);
      throw error;
    }

    return data.session;
  }

  async function obterUsuario() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
      console.error("Erro ao recuperar usuário:", error);
      return null;
    }

    return data.user;
  }

  async function entrarComEmail(email, senha) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      console.error("Erro ao entrar:", error);
      throw error;
    }

    return data;
  }

  async function cadastrarComEmail(email, senha, metadados = {}) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password: senha,
      options: {
        data: metadados,
      },
    });

    if (error) {
      console.error("Erro ao cadastrar usuário:", error);
      throw error;
    }

    return data;
  }

  async function sair() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error("Erro ao sair:", error);
      throw error;
    }
  }

  function observarAutenticacao(callback) {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((evento, sessao) => {
      callback(evento, sessao);
    });

    return () => subscription.unsubscribe();
  }

  async function selecionar(tabela, colunas = "*", filtros = {}, opcoes = {}) {
    let query = supabaseClient.from(tabela).select(colunas);

    Object.entries(filtros).forEach(([campo, valor]) => {
      query = query.eq(campo, valor);
    });

    if (opcoes.ordem) {
      query = query.order(opcoes.ordem.campo, {
        ascending: opcoes.ordem.crescente !== false,
      });
    }

    if (Number.isInteger(opcoes.limite)) {
      query = query.limit(opcoes.limite);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Erro ao consultar ${tabela}:`, error);
      throw error;
    }

    return data;
  }

  async function inserir(tabela, dados) {
    const { data, error } = await supabaseClient
      .from(tabela)
      .insert(dados)
      .select();

    if (error) {
      console.error(`Erro ao inserir em ${tabela}:`, error);
      throw error;
    }

    return Array.isArray(dados) ? data : data[0];
  }

  async function atualizar(tabela, id, dados, campoId = "id") {
    const { data, error } = await supabaseClient
      .from(tabela)
      .update(dados)
      .eq(campoId, id)
      .select();

    if (error) {
      console.error(`Erro ao atualizar ${tabela}:`, error);
      throw error;
    }

    return data[0] || null;
  }

  async function excluir(tabela, id, campoId = "id") {
    const { error } = await supabaseClient
      .from(tabela)
      .delete()
      .eq(campoId, id);

    if (error) {
      console.error(`Erro ao excluir de ${tabela}:`, error);
      throw error;
    }

    return true;
  }

  function observarTabela(tabela, callback, filtro = null) {
    const nomeCanal = `helivi-${tabela}-${crypto.randomUUID()}`;

    const configuracao = {
      event: "*",
      schema: "public",
      table: tabela,
    };

    if (filtro) {
      configuracao.filter = filtro;
    }

    const canal = supabaseClient
      .channel(nomeCanal)
      .on("postgres_changes", configuracao, callback)
      .subscribe((status, erro) => {
        if (erro) {
          console.error(`Erro no Realtime da tabela ${tabela}:`, erro);
        }

        console.log(`Realtime ${tabela}: ${status}`);
      });

    return () => {
      supabaseClient.removeChannel(canal);
    };
  }

  window.supabaseClient = supabaseClient;

  window.HELIVI = {
    supabase: supabaseClient,

    auth: {
      obterSessao,
      obterUsuario,
      entrarComEmail,
      cadastrarComEmail,
      sair,
      observar: observarAutenticacao,
    },

    dados: {
      selecionar,
      inserir,
      atualizar,
      excluir,
      observarTabela,
    },
  };

  console.log("✅ HELIVI iniciado com Supabase.");
})();
