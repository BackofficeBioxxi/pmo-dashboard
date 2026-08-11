// ============================================================================
// Edge Function: checkpoint-contexto
//
// Endpoint de LEITURA usado pela automação (tarefa agendada do Claude que lê
// o Teams) para decidir, com bom senso, o que já é uma tarefa em aberto e o
// que é realmente novo — ANTES de chamar "criar-checkpoint". Existe pra que
// a automação nunca precise da service_role key (só desta chave estreita).
//
// Uso:
//   GET .../checkpoint-contexto                    → lista de projetos {id, nome}
//   GET .../checkpoint-contexto?projeto_id=<uuid>  → tarefas ABERTAS desse projeto {id, titulo, descricao}
//
// Header obrigatório: Authorization: Bearer <CHECKPOINT_SECRET>
//
// Implantar: colar no editor de Edge Functions do painel do Supabase
// (Functions → New Function → nome "checkpoint-contexto") e Deploy.
// Usa o mesmo secret CHECKPOINT_SECRET já criado pra "criar-checkpoint".
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHECKPOINT_SECRET = Deno.env.get("CHECKPOINT_SECRET") ?? "";

const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!CHECKPOINT_SECRET || token !== CHECKPOINT_SECRET) {
      return new Response(JSON.stringify({ ok: false, erro: "Não autorizado" }), { status: 401 });
    }

    const url = new URL(req.url);
    const projetoId = url.searchParams.get("projeto_id");

    if (!projetoId) {
      const { data: projetos, error } = await sbAdmin.from("projetos").select("id,nome").order("nome");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, projetos }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const { data: tarefas, error } = await sbAdmin
      .from("tarefas")
      .select("id,titulo,descricao")
      .eq("projeto_id", projetoId)
      .not("status", "in", "(concluido,cancelado)");
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, tarefas_abertas: tarefas }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500 });
  }
});
