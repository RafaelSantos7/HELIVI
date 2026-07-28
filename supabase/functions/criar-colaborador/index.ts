import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Variáveis do Supabase não configuradas.");
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Usuário não autenticado.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user: usuarioLogado },
      error: usuarioError,
    } = await supabaseAdmin.auth.getUser(token);

    if (usuarioError || !usuarioLogado) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Sessão inválida.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const { data: perfilLogado, error: perfilError } = await supabaseAdmin
      .from("usuarios")
      .select("owner_uid, role, ativo")
      .eq("id", usuarioLogado.id)
      .maybeSingle();

    if (perfilError || !perfilLogado) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Perfil do administrador não encontrado.",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (perfilLogado.role !== "admin" || perfilLogado.ativo === false) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Apenas administradores podem criar colaboradores.",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const body = await req.json();

    const nome = String(body.nome || "").trim();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const senha = String(body.senha || "");
    const role = String(body.role || "atendente");

    if (!nome || !email || !senha) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Preencha nome, e-mail e senha.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (senha.length < 6) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "A senha deve ter no mínimo 6 caracteres.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const perfisPermitidos = [
      "admin",
      "atendente",
      "caixa",
      "cozinha",
      "balcao",
    ];

    if (!perfisPermitidos.includes(role)) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Perfil de acesso inválido.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const { data: novoUsuario, error: criarError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
        },
      });

    if (criarError || !novoUsuario.user) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: criarError?.message || "Erro ao criar usuário.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const ownerUid = perfilLogado.owner_uid || usuarioLogado.id;

    const { error: insertError } = await supabaseAdmin.from("usuarios").upsert(
      {
        id: novoUsuario.user.id,
        owner_uid: ownerUid,
        nome,
        email,
        role,
        ativo: true,
      },
      {
        onConflict: "id",
      },
    );

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(novoUsuario.user.id);

      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem:
            insertError.message ||
            "Usuário criado, mas não foi possível salvar o perfil.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        mensagem: "Colaborador criado com sucesso.",
        usuario: {
          uid: novoUsuario.user.id,
          nome,
          email,
          role,
          owner_uid: ownerUid,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        sucesso: false,
        mensagem: error instanceof Error ? error.message : "Erro interno.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
