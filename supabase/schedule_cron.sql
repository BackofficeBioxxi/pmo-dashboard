-- ============================================================================
-- Agenda o envio diário de notificações (pg_cron + pg_net → Edge Function).
--
-- Rodar DEPOIS de implantar a Edge Function "notificacoes-diarias" no painel
-- do Supabase (Functions → notificacoes-diarias → Deploy).
--
-- Preencher os DOIS pontos marcados como "COLE-AQUI" antes de rodar.
-- ============================================================================

-- 1. Guarda a service_role key no Vault (fica criptografada no banco).
--    Pegar em: Project Settings → API → Project API keys → service_role (Reveal).
--    Rodar só uma vez; se rodar de novo e der erro de "já existe", pode ignorar.
select vault.create_secret(
  'COLE-AQUI-SUA-SERVICE-ROLE-KEY',
  'pmo_service_role_key',
  'Usada pelo pg_cron para chamar a Edge Function de notificações diárias'
);

-- 2. Remove um agendamento anterior com o mesmo nome, se existir (permite rodar de novo).
select cron.unschedule(jobid) from cron.job where jobname = 'pmo-notificacoes-diarias';

-- 3. Agenda a chamada diária.
--    Horário no formato cron em UTC. Exemplo abaixo: 11h UTC = 8h em Brasília (BRT, UTC-3).
--    Troque a URL pela URL real da sua função (Functions → notificacoes-diarias → copiar URL).
select cron.schedule(
  'pmo-notificacoes-diarias',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://COLE-AQUI-o-project-ref.supabase.co/functions/v1/notificacoes-diarias',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'pmo_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Confirmar que o agendamento foi criado:
select jobid, jobname, schedule, active from cron.job where jobname = 'pmo-notificacoes-diarias';

-- 5. Depois que já passou pelo menos uma execução, conferir se rodou sem erro:
-- select * from cron.job_run_details order by start_time desc limit 5;

-- Dica: pra testar a função AGORA, sem esperar o horário agendado, é só rodar de
-- novo o bloco do passo 3 substituindo 'select cron.schedule(...)' pelo próprio
-- 'select net.http_post(...)' isolado — ele executa a chamada imediatamente.
