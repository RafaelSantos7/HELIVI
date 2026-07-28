// data-supabase.js — adapter Supabase (Auth + Postgres + Realtime + helivi-api)
// Telas continuam no contrato camelCase; este adapter traduz snake_case do Postgres.
"use strict";

window.__heliviCreateSupabaseData = function createSupabaseData() {
  const cfg = window.HELIVI_CONFIG || {};
  const sb = window.supabaseClient;
  if (!sb) {
    throw new Error("supabaseClient não inicializado, carregue js/config.js");
  }

  const apiBase = (cfg.apiBaseUrl || "http://127.0.0.1:8787").replace(
    /\/$/,
    "",
  );

  function serverTimestamp() {
    return new Date().toISOString();
  }

  function rowProduto(r) {
    if (!r) return null;
    return {
      id: r.id,
      uid: r.owner_uid,
      ownerUid: r.owner_uid,
      nome: r.nome,
      categoria: r.categoria,
      preco: Number(r.preco),
      custo: Number(r.custo),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  function rowUsuario(r) {
    if (!r) return null;
    return {
      id: r.id,
      docId: r.id,
      uid: r.id,
      ownerUid: r.owner_uid,
      nome: r.nome,
      email: r.email,
      role: r.role,
      ativo: r.ativo,
    };
  }

  function rowComanda(r) {
    if (!r) return null;
    return {
      id: r.id,
      uid: r.owner_uid,
      ownerUid: r.owner_uid,
      criadorUid: r.criador_uid,
      atendente: r.atendente,
      atendenteEmail: r.atendente_email,
      cliente: r.cliente,
      mesa: r.mesa,
      obs: r.obs,
      itens: r.itens || [],
      status: r.status,
      pagamento: r.pagamento,
      total: r.total != null ? Number(r.total) : null,
      pixTxid: r.pix_txid,
      pixGateway: r.pix_gateway,
      pixMpOrderId: r.pix_mp_order_id,
      pixValor: r.pix_valor != null ? Number(r.pix_valor) : null,
      pixQrCode: r.pix_qr_code,
      pixCopiaECola: r.pix_copia_e_cola,
      pixGeradoEm: r.pix_gerado_em,
      pixValidadeEm: r.pix_validade_em,
      pixConfirmadoEm: r.pix_confirmado_em,
      cartaoIntentId: r.cartao_intent_id,
      cartaoMaquininha: r.cartao_maquininha,
      cartaoDeviceId: r.cartao_device_id,
      cartaoTipo: r.cartao_tipo,
      cartaoValor: r.cartao_valor != null ? Number(r.cartao_valor) : null,
      cartaoGeradoEm: r.cartao_gerado_em,
      cartaoConfirmadoEm: r.cartao_confirmado_em,
      cartaoPaymentId: r.cartao_payment_id,
      cartaoCanceladoEm: r.cartao_cancelado_em,
      statusPagamento: r.status_pagamento,
      createdAt: r.created_at,
      serverTime: r.created_at
        ? { toDate: () => new Date(r.created_at) }
        : null,
      fechadoEm: r.fechado_em,
    };
  }

  function rowPedido(r) {
    if (!r) return null;
    return {
      id: r.id,
      uid: r.owner_uid,
      ownerUid: r.owner_uid,
      criadorUid: r.criador_uid,
      atendente: r.atendente,
      atendenteEmail: r.atendente_email,
      cliente: r.cliente,
      mesa: r.mesa,
      obsGeral: r.obs_geral,
      itens: r.itens || [],
      total: Number(r.total),
      lucro: Number(r.lucro),
      pagamento: r.pagamento,
      cartao1: r.cartao1 != null ? Number(r.cartao1) : null,
      cartao2: r.cartao2 != null ? Number(r.cartao2) : null,
      numeroPedido: r.numero_pedido,
      status: r.status,
      comandaId: r.comanda_id,
      createdAt: r.created_at,
      serverTime: r.created_at
        ? { toDate: () => new Date(r.created_at) }
        : null,
    };
  }

  function rowKds(r) {
    if (!r) return null;
    return {
      id: r.id,
      uid: r.owner_uid,
      ownerUid: r.owner_uid,
      criadorUid: r.criador_uid,
      atendente: r.atendente,
      pedidoId: r.pedido_id,
      comandaId: r.comanda_id,
      numeroPedido: r.numero_pedido,
      cliente: r.cliente,
      mesa: r.mesa,
      obsGeral: r.obs_geral,
      itens: r.itens || [],
      status: r.status,
      createdAt: r.created_at,
      serverTime: r.created_at
        ? { toDate: () => new Date(r.created_at) }
        : null,
      statusAt_preparando: r.status_at_preparando,
      statusAt_pronto: r.status_at_pronto,
      statusAt_entregue: r.status_at_entregue,
    };
  }

  async function apiFetch(path, options) {
    const { data: sess } = await sb.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) {
      const err = new Error("unauthenticated");
      err.code = "unauthenticated";
      throw err;
    }
    const res = await fetch(apiBase + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        ...(options && options.headers),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.mensagem || body.erro || res.statusText);
      err.code = body.erro || String(res.status);
      throw err;
    }
    return body;
  }

  function channelKey(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2);
  }

  // ── Auth ─────────────────────────────────────────────────
  const authApi = {
    onAuthStateChanged(cb) {
      // Só onAuthStateChange (já emite INITIAL_SESSION). Evita getSession+change = 2x callback.
      const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
        const u = session?.user || null;
        cb(
          u
            ? {
                uid: u.id,
                email: u.email,
                displayName: u.user_metadata?.nome || null,
              }
            : null,
        );
      });
      return () => sub.subscription.unsubscribe();
    },
    async signIn(email, senha) {
      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (error) {
        const e = new Error(error.message);
        e.code = error.code || "auth/invalid-credential";
        throw e;
      }
      return data;
    },
    async createUser(email, senha) {
      const nome = email.split("@")[0];

      const { data, error } = await sb.auth.signUp({
        email,
        password: senha,
        options: {
          data: { nome },
        },
      });

      if (error) {
        const e = new Error(error.message);
        e.code = error.code || "auth/email-already-in-use";
        throw e;
      }

      const user = data?.user;

      if (!user) {
        throw new Error("Não foi possível criar a conta.");
      }

      const { error: perfilError } = await sb.from("usuarios").insert({
        id: user.id,
        owner_uid: user.id,
        nome,
        email,
        role: "admin",
        ativo: true,
      });

      if (perfilError) {
        throw new Error(
          perfilError.message ||
            "A conta foi criada, mas o perfil não foi cadastrado.",
        );
      }

      return data;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    currentUser() {
      // sync helper — preferir getSession em fluxos async
      return window.__heliviSbUser || null;
    },
    async getAccessToken() {
      const { data } = await sb.auth.getSession();
      return data.session?.access_token || null;
    },
  };

  sb.auth.getSession().then(({ data }) => {
    const u = data.session?.user;
    window.__heliviSbUser = u
      ? {
          uid: u.id,
          email: u.email,
          displayName: u.user_metadata?.nome || null,
        }
      : null;
  });
  sb.auth.onAuthStateChange((_e, session) => {
    const u = session?.user;
    window.__heliviSbUser = u
      ? {
          uid: u.id,
          email: u.email,
          displayName: u.user_metadata?.nome || null,
        }
      : null;
  });

  const produtosApi = {
    subscribeByOwner(ownerUid, onData, onError) {
      const load = async () => {
        const { data, error } = await sb
          .from("produtos")
          .select("*")
          .eq("owner_uid", ownerUid);
        if (error) throw error;
        onData((data || []).map(rowProduto));
      };
      load().catch((e) => onError && onError(e));
      const ch = sb
        .channel(channelKey("produtos"))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "produtos",
            filter: "owner_uid=eq." + ownerUid,
          },
          () => load().catch((e) => onError && onError(e)),
        )
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    async create(dados) {
      const { data, error } = await sb
        .from("produtos")
        .insert({
          owner_uid: dados.uid || dados.ownerUid,
          nome: dados.nome,
          categoria: dados.categoria || "Outros",
          preco: dados.preco,
          custo: dados.custo || 0,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message || JSON.stringify(error));
      return rowProduto(data);
    },
    async update(id, dados) {
      const patch = { updated_at: serverTimestamp() };
      if (dados.nome != null) patch.nome = dados.nome;
      if (dados.categoria != null) patch.categoria = dados.categoria;
      if (dados.preco != null) patch.preco = dados.preco;
      if (dados.custo != null) patch.custo = dados.custo;
      const { data, error } = await sb
        .from("produtos")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message || JSON.stringify(error));
      return rowProduto(data);
    },
    async remove(id) {
      const { data, error } = await sb
        .from("produtos")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message || JSON.stringify(error));
      if (!data || !data.length) {
        throw new Error(
          "Produto não encontrado ou sem permissão para excluir.",
        );
      }
    },
  };

  const usuariosApi = {
    subscribeByOwner(ownerUid, onData, onError) {
      const load = async () => {
        const { data, error } = await sb
          .from("usuarios")
          .select("*")
          .eq("owner_uid", ownerUid);
        if (error) throw error;
        onData((data || []).map(rowUsuario));
      };
      load().catch((e) => onError && onError(e));
      const ch = sb
        .channel(channelKey("usuarios"))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "usuarios",
            filter: "owner_uid=eq." + ownerUid,
          },
          () => load().catch((e) => onError && onError(e)),
        )
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    async buscarPerfilPorUid(uid) {
      const { data, error } = await sb
        .from("usuarios")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      return rowUsuario(data);
    },
    async listByOwner(ownerUid) {
      const { data, error } = await sb
        .from("usuarios")
        .select("*")
        .eq("owner_uid", ownerUid);
      if (error) throw new Error(error.message || JSON.stringify(error));
      return (data || []).map(rowUsuario);
    },
    async criarColaborador(payload) {
      const { data: sessao } = await sb.auth.getSession();
      const usuarioLogado = sessao?.session?.user;

      if (!usuarioLogado) {
        throw new Error("Usuário não autenticado.");
      }

      const perfilLogado = await usuariosApi.buscarPerfilPorUid(
        usuarioLogado.id,
      );

      const ownerUid =
        perfilLogado?.ownerUid || window.OWNER_UID || usuarioLogado.id;

      const { data, error } = await sb.functions.invoke("criar-colaborador", {
        body: {
          nome: payload.nome,
          email: payload.email,
          senha: payload.senha,
          role: payload.role,
          owner_uid: ownerUid,
        },
      });

      if (error) {
        throw new Error(error.message || "Erro ao criar colaborador.");
      }

      if (data?.sucesso === false) {
        throw new Error(data.mensagem || "Erro ao criar colaborador.");
      }

      return data;
    },
    async editarColaborador(payload) {
      const { data, error } = await sb.functions.invoke(
        "atualizar-colaborador",
        {
          body: {
            uid: payload.uid || payload.docId,
            nome: payload.nome,
            email: payload.email,
            senha: payload.senha || null,
            perfil: payload.perfil,
          },
        },
      );

      if (error) throw new Error(error.message);

      if (!data?.sucesso) {
        throw new Error(data?.mensagem || "Erro ao atualizar colaborador.");
      }

      return data;
    },
    async excluirColaborador(payload) {
      const id = payload.uid || payload.docId;

      const { data, error } = await sb.functions.invoke("excluir-colaborador", {
        body: { uid: id },
      });

      if (error) throw new Error(error.message);

      if (!data?.sucesso) {
        throw new Error(data?.mensagem);
      }

      return data;
    },
  };

  const comandasApi = {
    subscribeByOwner(ownerUid, onData, onError) {
      const load = async () => {
        const { data, error } = await sb
          .from("comandas")
          .select("*")
          .eq("owner_uid", ownerUid)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        onData((data || []).map(rowComanda));
      };
      load().catch((e) => onError && onError(e));
      const ch = sb
        .channel(channelKey("comandas"))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comandas",
            filter: "owner_uid=eq." + ownerUid,
          },
          () => load().catch((e) => onError && onError(e)),
        )
        .subscribe();
      const unsub = () => sb.removeChannel(ch);
      window.addEventListener("beforeunload", unsub);
      return unsub;
    },
    subscribeByUidField(ownerUid, onData, onError) {
      return this.subscribeByOwner(ownerUid, onData, onError);
    },
    subscribeDoc(comandaId, onData, onError) {
      const load = async () => {
        const { data, error } = await sb
          .from("comandas")
          .select("*")
          .eq("id", comandaId)
          .maybeSingle();
        if (error) throw error;
        onData(rowComanda(data));
      };
      load().catch((e) => onError && onError(e));
      const ch = sb
        .channel(channelKey("comanda"))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comandas",
            filter: "id=eq." + comandaId,
          },
          () => load().catch((e) => onError && onError(e)),
        )
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    async get(comandaId) {
      const { data, error } = await sb
        .from("comandas")
        .select("*")
        .eq("id", comandaId)
        .maybeSingle();
      if (error) throw error;
      return rowComanda(data);
    },
    async create(dados) {
      const { data, error } = await sb
        .from("comandas")
        .insert({
          owner_uid: dados.ownerUid || dados.uid,
          criador_uid: dados.criadorUid || null,
          atendente: dados.atendente || null,
          cliente: dados.cliente || "",
          mesa: dados.mesa || "",
          obs: dados.obs || "",
          itens: dados.itens || [],
          status: dados.status || "aberta",
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    async update(comandaId, patch) {
      const p = { updated_at: serverTimestamp() };
      if (patch.itens != null) p.itens = patch.itens;
      if (patch.status != null) p.status = patch.status;
      if (patch.pagamento != null) p.pagamento = patch.pagamento;
      if (patch.total != null) p.total = patch.total;
      if (patch.fechadoEm != null || patch.status === "fechada")
        p.fechado_em = serverTimestamp();
      if (patch.statusPagamento != null)
        p.status_pagamento = patch.statusPagamento;
      if (patch.ultimaAtualizacao != null) p.updated_at = serverTimestamp();
      const { error } = await sb.from("comandas").update(p).eq("id", comandaId);
      if (error) throw error;
    },
  };

  const pedidosApi = {
    async listByOwner(ownerUid, limitN) {
      const { data, error } = await sb
        .from("pedidos")
        .select("*")
        .eq("owner_uid", ownerUid)
        .order("created_at", { ascending: false })
        .limit(limitN || 500);
      if (error) throw error;
      return (data || []).map(rowPedido);
    },
    async get(pedidoId) {
      const { data, error } = await sb
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return rowPedido(data);
    },
    async create(dados) {
      const { data, error } = await sb
        .from("pedidos")
        .insert({
          owner_uid: dados.ownerUid || dados.uid,
          criador_uid: dados.criadorUid || null,
          cliente: dados.cliente || "",
          mesa: dados.mesa || "",
          obs_geral: dados.obsGeral || "",
          itens: dados.itens || [],
          total: dados.total,
          lucro: dados.lucro || 0,
          pagamento: dados.pagamento,
          cartao1: dados.cartao1,
          cartao2: dados.cartao2,
          numero_pedido: dados.numeroPedido,
          status: dados.status || "pago",
          comanda_id: dados.comandaId || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  };

  function tabelaKds(setor) {
    return setor === "balcao" ? "kds_balcao" : "kds_cozinha";
  }

  const kdsApi = {
    subscribe(setor, ownerUid, onData, onError) {
      const table = tabelaKds(setor);
      const load = async () => {
        const { data, error } = await sb
          .from(table)
          .select("*")
          .eq("owner_uid", ownerUid)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        onData((data || []).map(rowKds));
      };
      load().catch((e) => onError && onError(e));
      const ch = sb
        .channel(channelKey(table))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: "owner_uid=eq." + ownerUid,
          },
          () => load().catch((e) => onError && onError(e)),
        )
        .subscribe();
      const unsub = () => sb.removeChannel(ch);
      window.addEventListener("beforeunload", unsub);
      return unsub;
    },
    async create(setor, dados) {
      const { data, error } = await sb
        .from(tabelaKds(setor))
        .insert({
          owner_uid: dados.ownerUid || dados.uid,
          criador_uid: dados.criadorUid || null,
          pedido_id: dados.pedidoId || null,
          comanda_id: dados.comandaId || null,
          numero_pedido: dados.numeroPedido,
          cliente: dados.cliente || "",
          mesa: dados.mesa || "",
          obs_geral: dados.obsGeral || "",
          itens: dados.itens || [],
          status: dados.status || "novo",
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    async update(setor, id, patch) {
      const p = {};
      if (patch.status != null) p.status = patch.status;
      if (
        patch.statusAt_preparando != null ||
        patch["statusAt_preparando"] != null
      )
        p.status_at_preparando = serverTimestamp();
      if (patch.statusAt_pronto != null || patch["statusAt_pronto"] != null)
        p.status_at_pronto = serverTimestamp();
      if (patch.statusAt_entregue != null || patch["statusAt_entregue"] != null)
        p.status_at_entregue = serverTimestamp();
      // Campos dinâmicos do KDS: statusAt_${status}
      Object.keys(patch).forEach((k) => {
        if (k.startsWith("statusAt_")) {
          const st = k.slice("statusAt_".length);
          p["status_at_" + st] = serverTimestamp();
        }
      });
      const { error } = await sb.from(tabelaKds(setor)).update(p).eq("id", id);
      if (error) throw error;
    },
  };

  const configApi = {
    async nextPedidoNumber(ownerUid) {
      const { data, error } = await sb.rpc("next_pedido_number", {
        p_owner_uid: ownerUid,
      });
      if (error) throw error;
      return data;
    },
    async getPagamentos() {
      const ownerUid = window.OWNER_UID;
      if (!ownerUid) return null;
      const { data, error } = await sb
        .from("configuracoes_pagamentos")
        .select("*")
        .eq("owner_uid", ownerUid)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        gatewayAtivo: data.gateway_ativo,
        efiConfigurado: data.efi_configurado,
        mpConfigurado: data.mp_configurado,
        mpAmbienteTeste: data.mp_ambiente_teste,
        maquininhaAtiva: data.maquininha_ativa,
        mpPointDeviceId: data.mp_point_device_id,
        mpPointConfigurado: data.mp_point_configurado,
      };
    },
    async salvarPagamentoPix(payload) {
      // Fase 6: endpoint dedicado; até lá exige API
      return apiFetch("/pagamentos/config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };

  const pagamentosApi = {
    async criarPix(payload) {
      return apiFetch("/pagamentos/pix", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async verificarPix(payload) {
      return apiFetch("/pagamentos/pix/verificar", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async simularConfirmacaoPix(payload) {
      return apiFetch("/pagamentos/pix/simular", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async cancelarPix(payload) {
      return apiFetch("/pagamentos/pix/cancelar", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async criarMaquininha(payload) {
      return apiFetch("/pagamentos/maquininha", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async verificarMaquininha(payload) {
      return apiFetch("/pagamentos/maquininha/verificar", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async cancelarMaquininha(payload) {
      return apiFetch("/pagamentos/maquininha/cancelar", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };

  return {
    backend: "supabase",
    serverTimestamp,
    auth: authApi,
    produtos: produtosApi,
    usuarios: usuariosApi,
    comandas: comandasApi,
    pedidos: pedidosApi,
    kds: kdsApi,
    config: configApi,
    pagamentos: pagamentosApi,
  };
};
