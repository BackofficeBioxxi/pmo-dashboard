// ============================================================================
// Edge Function: enviar-report-ceo
//
// Envia, sob demanda (clique manual na tela, não agendado), o "report
// executivo" para um destinatário escolhido — normalmente o CEO.
//
// Envia via SMTP direto da sua própria caixa de e-mail (não usa Brevo nem
// nenhum serviço terceiro) — as credenciais ficam só aqui dentro (nunca
// chegam ao navegador). Quem chama esta função é o próprio app, autenticado
// com a sessão da usuária logada — a verificação de JWT do Supabase já
// garante que só gente logada chega até aqui; abaixo checamos também se o
// papel é admin/editor antes de enviar.
//
// Implantar: colar no editor de Edge Functions do painel do Supabase
// (Functions → New Function → nome "enviar-report-ceo") e clicar em Deploy.
//
// Secrets necessários (os mesmos já usados por notificacoes-diarias):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  (ver README — Passo 4)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";

const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function enviarEmailSMTP(destinatarioEmail: string, assunto: string, html: string, remetenteNome: string) {
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });
  try {
    await client.send({
      from: `${remetenteNome} <${SMTP_USER}>`,
      to: destinatarioEmail,
      subject: assunto,
      html,
      content: "Ative HTML para ver esta mensagem.",
    });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, erro: "Método não permitido" }), { status: 405 });
    }

    // Identifica quem está chamando, a partir do token da própria requisição.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await sbAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, erro: "Não autenticado" }), { status: 401 });
    }

    const { data: perfil } = await sbAdmin.from("perfis").select("papel").eq("id", userData.user.id).single();
    if (!perfil || !["admin", "editor"].includes(perfil.papel)) {
      return new Response(JSON.stringify({ ok: false, erro: "Sem permissão para enviar reports" }), { status: 403 });
    }

    const { destinatarios, subject, html, projeto_id } = await req.json();
    if (!Array.isArray(destinatarios) || destinatarios.length === 0 || !subject || !html) {
      return new Response(JSON.stringify({ ok: false, erro: "Dados incompletos (destinatarios/subject/html)" }), { status: 400 });
    }

    const { data: cfg } = await sbAdmin.from("configuracoes").select("chave,valor").eq("chave", "remetente_nome");
    const remetenteNome = cfg?.[0]?.valor ?? "PMO Dashboard";
    const dataReferencia = new Date().toISOString().slice(0, 10);

    // Envia UM e-mail por destinatário (ninguém vê o endereço dos outros).
    const resultados = [];
    for (const dest of destinatarios) {
      try {
        await enviarEmailSMTP(dest.email, subject, html, remetenteNome);
        await sbAdmin.from("notificacoes_log").insert({
          tipo: "report_ceo", projeto_id, stakeholder_id: dest.stakeholder_id || null, data_referencia: dataReferencia, status_envio: "ok",
        });
        resultados.push({ email: dest.email, status: "ok" });
      } catch (e) {
        await sbAdmin.from("notificacoes_log").insert({
          tipo: "report_ceo", projeto_id, stakeholder_id: dest.stakeholder_id || null, data_referencia: dataReferencia,
          status_envio: "erro", mensagem_erro: String(e),
        });
        resultados.push({ email: dest.email, status: "erro", mensagem: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, resultados }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500 });
  }
});
