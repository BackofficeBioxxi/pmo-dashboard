// ============================================================================
// Edge Function: notificacoes-diarias
//
// Roda 1x por dia (agendada via supabase/schedule_cron.sql, com pg_cron).
// Para cada stakeholder ativo com receber_digest_diario=true, monta um resumo
// das entregas do(s) projeto(s) dele que estão atrasadas, em risco, ou que
// foram concluídas nas últimas 24h — e envia por e-mail via Microsoft Graph
// (enviado como a própria usuária admin, sem SMTP/senha de aplicativo — só
// permissão delegada Mail.Send, autorizada uma única vez).
//
// Implantar: colar este arquivo no editor de Edge Functions do painel do
// Supabase (Functions → New Function → nome "notificacoes-diarias") e clicar
// em Deploy. Não precisa de CLI nem terminal.
//
// Secrets necessários (Project Settings → Edge Functions → Secrets):
//   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_REFRESH_TOKEN
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente em
//  toda Edge Function do projeto — não precisa cadastrar.)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_TENANT_ID = Deno.env.get("GRAPH_TENANT_ID")!;
const GRAPH_CLIENT_ID = Deno.env.get("GRAPH_CLIENT_ID")!;
const GRAPH_CLIENT_SECRET = Deno.env.get("GRAPH_CLIENT_SECRET")!;
const GRAPH_REFRESH_TOKEN_BOOTSTRAP = Deno.env.get("GRAPH_REFRESH_TOKEN") ?? "";
const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Send offline_access https://graph.microsoft.com/User.Read";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// O refresh token é trocado a cada uso; guardamos sempre o mais novo na tabela
// "integracoes_secretas" (sem NENHUMA policy de RLS liberada — só o
// service_role, usado por esta própria função, consegue ler ou escrever nela).
// Isso evita depender de alguém colar um token novo manualmente daqui a
// alguns meses, sem expor esse token pra usuários logados no painel.
async function obterAccessTokenGraph(): Promise<string> {
  const { data: cfg } = await sb.from("integracoes_secretas").select("valor").eq("chave", "graph_refresh_token").maybeSingle();
  const refreshToken = cfg?.valor || GRAPH_REFRESH_TOKEN_BOOTSTRAP;
  if (!refreshToken) throw new Error("Nenhum refresh token do Microsoft Graph configurado.");

  const resp = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: GRAPH_SCOPE,
    }),
  });
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Falha ao renovar token do Microsoft Graph: ${resp.status} ${texto}`);
  }
  const tokenData = await resp.json();
  await sb.from("integracoes_secretas").upsert({ chave: "graph_refresh_token", valor: tokenData.refresh_token, atualizado_em: new Date().toISOString() });
  return tokenData.access_token;
}

const hoje = () => new Date().toISOString().slice(0, 10);

function badgeLabel(situacao: string): string {
  return { atrasado: "Atrasado", em_risco: "Em risco", no_prazo: "No prazo", concluido: "Concluído" }[situacao] ?? situacao;
}

function badgeColor(situacao: string): string {
  return { atrasado: "#ff5c72", em_risco: "#ffd23e", no_prazo: "#34e9ff", concluido: "#3ef7a6" }[situacao] ?? "#8b8fb8";
}

function montarHtml(nomeStakeholder: string, grupos: Record<string, any[]>, concluidasRecentes: any[]): string {
  const linhaItem = (e: any) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">${e.projetos?.nome ?? "-"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">${e.titulo}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">${e.data_prazo ?? "-"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">
        <span style="background:${badgeColor(e.situacao_calculada)}22;color:${badgeColor(e.situacao_calculada)};
        padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;">${badgeLabel(e.situacao_calculada)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;">${e.perfis?.nome ?? "-"}</td>
    </tr>`;

  const secao = (titulo: string, itens: any[]) =>
    itens.length === 0 ? "" : `
    <h3 style="font-family:sans-serif;color:#1a1a2e;margin:22px 0 8px;">${titulo}</h3>
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;color:#333;">
      <tr style="background:#f5f5fa;">
        <th style="text-align:left;padding:8px 12px;">Projeto</th>
        <th style="text-align:left;padding:8px 12px;">Entrega</th>
        <th style="text-align:left;padding:8px 12px;">Prazo</th>
        <th style="text-align:left;padding:8px 12px;">Situação</th>
        <th style="text-align:left;padding:8px 12px;">Responsável</th>
      </tr>
      ${itens.map(linhaItem).join("")}
    </table>`;

  return `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#1a1a2e;">Olá, ${nomeStakeholder}</h2>
    <p style="color:#555;font-size:14px;">Resumo automático de hoje (${hoje()}) dos seus projetos:</p>
    ${secao("⚠️ Atrasadas", grupos.atrasado ?? [])}
    ${secao("🟡 Em risco (vencem em breve)", grupos.em_risco ?? [])}
    ${secao("✅ Concluídas nas últimas 24h", concluidasRecentes)}
    <p style="color:#999;font-size:12px;margin-top:28px;">Este é um e-mail automático do PMO Dashboard. Para ajustar o que você recebe, fale com o administrador do sistema.</p>
  </div>`;
}

async function enviarEmail(destinatario: { nome: string; email: string }, assunto: string, html: string) {
  const accessToken = await obterAccessTokenGraph();

  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: assunto,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: destinatario.email, name: destinatario.nome } }],
      },
      saveToSentItems: "true",
    }),
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Microsoft Graph respondeu ${resp.status}: ${texto}`);
  }
}

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  // Só quem conhece o CRON_SECRET (o agendamento automático, guardado só no
  // Supabase) pode acionar esta função — a chave pública do site (anon key)
  // é rejeitada aqui dentro. Isso impede qualquer bot/visitante de disparar
  // envios usando só a chave que já é pública no código do site. Precisa da
  // opção "Verify JWT with legacy secret" desligada (Settings da função) pra
  // esse segredo próprio conseguir chegar até aqui.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || token !== CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, erro: "Não autorizado" }), { status: 401 });
  }

  try {
    const { data: cfgDigest } = await sb.from("configuracoes").select("valor").eq("chave", "digest_ativo").single();
    if (cfgDigest?.valor !== "true") {
      return new Response(JSON.stringify({ ok: true, pulado: "digest_ativo=false" }), { status: 200 });
    }

    const { data: entregas, error: errEntregas } = await sb
      .from("v_entregas")
      .select("id,titulo,data_prazo,data_conclusao,situacao_calculada,silenciar_notificacoes,projeto_id,projetos(nome),perfis:responsavel_id(nome)")
      .in("situacao_calculada", ["atrasado", "em_risco"])
      .eq("silenciar_notificacoes", false);
    if (errEntregas) throw errEntregas;

    const ontemISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: concluidas, error: errConcluidas } = await sb
      .from("v_entregas")
      .select("id,titulo,data_prazo,data_conclusao,situacao_calculada,projeto_id,projetos(nome),perfis:responsavel_id(nome)")
      .eq("status", "concluido")
      .gte("atualizado_em", ontemISO);
    if (errConcluidas) throw errConcluidas;

    const { data: stakeholders, error: errStake } = await sb
      .from("stakeholders")
      .select("id,nome,email,projeto_id")
      .eq("ativo", true)
      .eq("receber_digest_diario", true);
    if (errStake) throw errStake;

    const resultados: any[] = [];

    for (const st of stakeholders ?? []) {
      const dataReferencia = hoje();

      const { data: jaEnviado } = await sb
        .from("notificacoes_log")
        .select("id")
        .eq("tipo", "digest_diario")
        .eq("stakeholder_id", st.id)
        .eq("data_referencia", dataReferencia)
        .maybeSingle();
      if (jaEnviado) {
        resultados.push({ stakeholder: st.email, status: "ja_enviado_hoje" });
        continue;
      }

      const doProjeto = (arr: any[]) => (arr ?? []).filter((e) => e.projeto_id === st.projeto_id);
      const atrasadas = doProjeto(entregas ?? []).filter((e) => e.situacao_calculada === "atrasado");
      const emRisco = doProjeto(entregas ?? []).filter((e) => e.situacao_calculada === "em_risco");
      const concluidasRecentes = doProjeto(concluidas ?? []);

      if (atrasadas.length === 0 && emRisco.length === 0 && concluidasRecentes.length === 0) {
        await sb.from("notificacoes_log").insert({
          tipo: "digest_diario",
          stakeholder_id: st.id,
          projeto_id: st.projeto_id,
          data_referencia: dataReferencia,
          status_envio: "pulado_sem_itens",
        });
        resultados.push({ stakeholder: st.email, status: "pulado_sem_itens" });
        continue;
      }

      const html = montarHtml(st.nome, { atrasado: atrasadas, em_risco: emRisco }, concluidasRecentes);
      const assunto = `Resumo diário — ${atrasadas.length} atrasada(s), ${emRisco.length} em risco`;

      try {
        await enviarEmail({ nome: st.nome, email: st.email }, assunto, html);
        await sb.from("notificacoes_log").insert({
          tipo: "digest_diario",
          stakeholder_id: st.id,
          projeto_id: st.projeto_id,
          data_referencia: dataReferencia,
          status_envio: "ok",
        });
        resultados.push({ stakeholder: st.email, status: "ok" });
      } catch (e) {
        await sb.from("notificacoes_log").insert({
          tipo: "digest_diario",
          stakeholder_id: st.id,
          projeto_id: st.projeto_id,
          data_referencia: dataReferencia,
          status_envio: "erro",
          mensagem_erro: String(e),
        });
        resultados.push({ stakeholder: st.email, status: "erro", mensagem: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, resultados }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
