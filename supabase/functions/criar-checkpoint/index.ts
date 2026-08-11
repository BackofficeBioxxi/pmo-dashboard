// ============================================================================
// Edge Function: criar-checkpoint
//
// "Porta de entrada" usada pela automação externa (tarefa agendada do Claude
// que lê o Teams) para gravar um checkpoint de reunião no painel.
//
// Fluxo esperado (a automação chama NESTA ordem):
//   1. GET  /checkpoint-contexto                    → lista de projetos
//   2. GET  /checkpoint-contexto?projeto_id=<id>     → tarefas já abertas do projeto
//   3. (o Claude da automação decide, lendo a transcrição + as tarefas
//      abertas, o que é pendência repetida vs. item genuinamente novo)
//   4. POST /criar-checkpoint com:
//      - proximos_passos: só os itens NOVOS (viram tarefa no Backlog)
//      - referencias_existentes: [{tarefa_id, nota}] pros itens que já eram
//        uma tarefa aberta, só ditos com outras palavras (vira comentário)
//
// NÃO é chamada pelo navegador/usuária logada — por isso a autenticação aqui
// é por uma chave secreta compartilhada (CHECKPOINT_SECRET), não por sessão.
//
// Implantar: colar no editor de Edge Functions do painel do Supabase
// (Functions → New Function → nome "criar-checkpoint") e Deploy.
//
// Secret necessário (Project Settings → Edge Functions → Secrets):
//   CHECKPOINT_SECRET = uma senha/token qualquer, só você e a automação sabem
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHECKPOINT_SECRET = Deno.env.get("CHECKPOINT_SECRET") ?? "";

const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, erro: "Método não permitido" }), { status: 405 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!CHECKPOINT_SECRET || token !== CHECKPOINT_SECRET) {
      return new Response(JSON.stringify({ ok: false, erro: "Não autorizado" }), { status: 401 });
    }

    const body = await req.json();
    const {
      projeto_id, titulo_reuniao, data_reuniao,
      pontos_principais, decisoes, riscos, participantes,
      proximos_passos, // array de strings — SÓ itens genuinamente novos (a automação já checou via /checkpoint-contexto)
      referencias_existentes, // array de {tarefa_id, nota} — itens que já eram uma tarefa aberta, só com outras palavras
    } = body;

    if (!projeto_id || !data_reuniao) {
      return new Response(JSON.stringify({ ok: false, erro: "Dados incompletos (projeto_id/data_reuniao)" }), { status: 400 });
    }

    const { data: projeto } = await sbAdmin.from("projetos").select("id").eq("id", projeto_id).maybeSingle();
    if (!projeto) {
      return new Response(JSON.stringify({ ok: false, erro: `projeto_id ${projeto_id} não encontrado` }), { status: 404 });
    }

    const { data: checkpoint, error: errCheckpoint } = await sbAdmin.from("checkpoints").insert({
      projeto_id, titulo_reuniao: titulo_reuniao ?? null, data_reuniao,
      origem: "teams_auto",
      pontos_principais: pontos_principais ?? null,
      decisoes: decisoes ?? null,
      riscos: riscos ?? null,
      participantes: participantes ?? null,
      proximos_passos: Array.isArray(proximos_passos) ? proximos_passos : [],
    }).select().single();
    if (errCheckpoint) throw errCheckpoint;

    const contexto = `checkpoint de ${data_reuniao}${titulo_reuniao ? ` — reunião: ${titulo_reuniao}` : ""}`;
    let tarefasCriadas = 0, tarefasJaExistentes = 0;

    // Caminho principal de "não duplicar": a PRÓPRIA automação (que já leu a
    // reunião com o Claude) consultou /checkpoint-contexto, viu as tarefas
    // abertas do projeto, e decidiu que estes itens são a MESMA pendência de
    // antes, só com outras palavras — aqui só registramos o comentário.
    if (Array.isArray(referencias_existentes)) {
      for (const ref of referencias_existentes) {
        if (!ref?.tarefa_id) continue;
        const nota = ref.nota ? `${ref.nota} (${contexto})` : `Mencionado novamente: ${contexto}`;
        const { error: errComentario } = await sbAdmin.from("comentarios").insert({ projeto_id, tarefa_id: ref.tarefa_id, texto: nota });
        if (!errComentario) tarefasJaExistentes++;
      }
    }

    // Rede de segurança: se ainda assim vier um próximo passo com título
    // IDÊNTICO a uma tarefa já aberta (ex: a automação não checou antes),
    // não duplica mesmo assim — só nesse caso exato-igual.
    if (Array.isArray(proximos_passos) && proximos_passos.length) {
      const { data: abertas } = await sbAdmin.from("tarefas").select("id,titulo").eq("projeto_id", projeto_id).not("status", "in", "(concluido,cancelado)");
      for (const passo of proximos_passos) {
        const titulo = String(passo).trim();
        if (!titulo) continue;
        const existente = (abertas || []).find((t: any) => t.titulo.trim().toLowerCase() === titulo.toLowerCase());
        if (existente) {
          await sbAdmin.from("comentarios").insert({ projeto_id, tarefa_id: existente.id, texto: `Mencionado novamente: ${contexto}` });
          tarefasJaExistentes++;
          continue;
        }
        const { error: errTarefa } = await sbAdmin.from("tarefas").insert({
          projeto_id, titulo, status: "backlog", prioridade: "media",
          descricao: `Gerada automaticamente do ${contexto}.`,
          origem_checkpoint_id: checkpoint.id,
        });
        if (!errTarefa) tarefasCriadas++;
      }
    }

    return new Response(JSON.stringify({ ok: true, checkpoint_id: checkpoint.id, tarefas_criadas: tarefasCriadas, tarefas_ja_existentes: tarefasJaExistentes }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500 });
  }
});
