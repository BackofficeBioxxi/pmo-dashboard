-- ============================================================================
-- PMO Dashboard — Setup completo do Supabase
-- Rodar UMA ÚNICA VEZ no SQL Editor do projeto Supabase (Fase 1 do setup).
-- Idempotente: pode rodar de novo sem duplicar nada.
-- ============================================================================

-- 0. Extensões necessárias ---------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_cron;    -- agendamento nativo (envio diário de e-mail)
create extension if not exists pg_net;     -- chamadas HTTP a partir do Postgres (pg_cron -> Edge Function)

-- 1. Perfis (papéis da equipe) -----------------------------------------------
-- papéis: admin (tudo) / editor (CRUD, sem gerir usuários) / colaborador (só os
-- projetos em que foi incluído via projeto_membros, e só edita o que é dele) /
-- leitor (só visualiza tudo).
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  papel      text not null default 'leitor' check (papel in ('admin','editor','colaborador','leitor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- (a tabela de escopo "projeto_membros" só pode ser criada depois de "projetos" —
--  ver seção 2 abaixo, logo após a criação de public.projetos)

-- Cria automaticamente o perfil de quem faz login pela 1ª vez.
-- O primeiro usuário do sistema vira admin automaticamente (bootstrap sem SQL manual).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ja_existe_alguem boolean;
begin
  select exists(select 1 from public.perfis) into ja_existe_alguem;
  insert into public.perfis (id, nome, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    case when ja_existe_alguem then 'leitor' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Funções auxiliares de RLS (security definer evita recursão ao consultar perfis) --
create or replace function public.papel_atual()
returns text
language sql stable security definer set search_path = public
as $$ select papel from public.perfis where id = auth.uid(); $$;

create or replace function public.e_editor_ou_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.papel_atual() in ('admin','editor'), false); $$;

create or replace function public.e_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.papel_atual() = 'admin', false); $$;

-- 2. Tabelas de domínio -------------------------------------------------------
create table if not exists public.projetos (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  descricao          text,
  cliente_area       text,
  status             text not null default 'iniciacao'
                     check (status in ('iniciacao','planejado','em_andamento','pausado','concluido','cancelado')),
  prioridade         text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  data_inicio        date,
  data_fim_prevista  date,
  data_fim_real      date,
  cor                text default '#7c3aed',
  responsavel_id     uuid references public.perfis(id),
  criado_por         uuid references public.perfis(id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- Libera o novo status "iniciacao" em bancos que já tinham a tabela projetos criada antes dele existir.
alter table public.projetos drop constraint if exists projetos_status_check;
alter table public.projetos add constraint projetos_status_check check (status in ('iniciacao','planejado','em_andamento','pausado','concluido','cancelado'));
alter table public.projetos alter column status set default 'iniciacao';

-- Escopo de acesso do papel "colaborador" (agora que "projetos" já existe).
create table if not exists public.projeto_membros (
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  perfil_id   uuid not null references public.perfis(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (projeto_id, perfil_id)
);

create table if not exists public.entregas (
  id                     uuid primary key default gen_random_uuid(),
  projeto_id             uuid not null references public.projetos(id) on delete cascade,
  titulo                 text not null,
  descricao              text,
  observacoes            text,        -- o que será realizado nessa etapa (aparece no report do CEO)
  tipo                   text not null default 'entrega' check (tipo in ('marco','entrega')),
  data_prazo             date not null,
  data_conclusao         date,
  status                 text not null default 'pendente' check (status in ('pendente','em_andamento','concluido','cancelado')),
  prioridade             text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  responsavel_id         uuid references public.perfis(id),
  silenciar_notificacoes boolean not null default false,   -- exclui do e-mail automático, sem mudar o status na tela
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

create table if not exists public.sprints (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  nome        text not null,
  objetivo    text,
  data_inicio date not null,
  data_fim    date not null,
  status      text not null default 'planejado' check (status in ('planejado','ativo','concluido')),
  criado_em   timestamptz not null default now()
);

create table if not exists public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references public.projetos(id) on delete cascade,
  sprint_id       uuid references public.sprints(id) on delete set null,
  entrega_id      uuid references public.entregas(id) on delete set null,
  titulo          text not null,
  descricao       text,
  status          text not null default 'backlog' check (status in ('backlog','todo','em_andamento','em_revisao','concluido')),
  prioridade      text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  responsavel_id  uuid references public.perfis(id),
  data_prazo      date,
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.stakeholders (
  id                     uuid primary key default gen_random_uuid(),
  projeto_id             uuid not null references public.projetos(id) on delete cascade,
  nome                   text not null,
  email                  text not null,
  cargo                  text,
  observacoes            text,        -- nota sobre esse stakeholder (aparece no report do CEO, quando houver)
  receber_digest_diario  boolean not null default true,
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now()
);

-- Quais stakeholders devem ser avisados (sininho + e-mail) sobre esta entrega
-- especificamente. Sem nenhuma linha aqui pra uma entrega, o comportamento
-- antigo continua valendo: todos os stakeholders do projeto são avisados.
-- Com pelo menos uma linha, só os vinculados recebem alerta dessa entrega.
create table if not exists public.entrega_stakeholders (
  entrega_id     uuid not null references public.entregas(id) on delete cascade,
  stakeholder_id uuid not null references public.stakeholders(id) on delete cascade,
  primary key (entrega_id, stakeholder_id)
);
alter table public.entrega_stakeholders enable row level security;

create table if not exists public.anexos (
  id             uuid primary key default gen_random_uuid(),
  projeto_id     uuid not null references public.projetos(id) on delete cascade,
  entrega_id     uuid references public.entregas(id) on delete set null,
  tarefa_id      uuid references public.tarefas(id) on delete set null,
  nome_arquivo   text not null,
  storage_path   text not null,
  tipo_mime      text,
  tamanho_bytes  bigint,
  descricao      text,
  enviado_por    uuid references public.perfis(id),
  criado_em      timestamptz not null default now()
);

create table if not exists public.notificacoes_log (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('digest_diario','atraso','prazo_risco','entrega_concluida','report_ceo')),
  stakeholder_id  uuid references public.stakeholders(id),
  projeto_id      uuid references public.projetos(id),
  data_referencia date not null,
  status_envio    text not null check (status_envio in ('ok','erro','pulado_sem_itens')),
  mensagem_erro   text,
  enviado_em      timestamptz not null default now()
);

-- Dedupe só se aplica ao digest automático (1 por stakeholder/dia) — o report
-- do CEO é manual e pode ser reenviado no mesmo dia sem restrição.
create unique index if not exists uq_notificacoes_digest_diario
  on public.notificacoes_log (stakeholder_id, data_referencia)
  where tipo = 'digest_diario';

-- Histórico/comentários: justificativas de atraso, pedidos de mais prazo,
-- atualizações do stakeholder etc. Sempre ligado a uma tarefa OU a uma
-- entrega (nunca solto), e sempre a um projeto (facilita RLS e filtros).
create table if not exists public.comentarios (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  tarefa_id   uuid references public.tarefas(id) on delete cascade,
  entrega_id  uuid references public.entregas(id) on delete cascade,
  autor_id    uuid references public.perfis(id),
  texto       text not null,
  criado_em   timestamptz not null default now(),
  constraint comentario_precisa_de_dono check (tarefa_id is not null or entrega_id is not null)
);
create index if not exists idx_comentarios_tarefa  on public.comentarios (tarefa_id);
create index if not exists idx_comentarios_entrega on public.comentarios (entrega_id);

-- Checkpoints: resumo estruturado de uma reunião (Teams, via automação, ou
-- digitado à mão), com pontos principais/decisões/riscos/próximos passos.
create table if not exists public.checkpoints (
  id                 uuid primary key default gen_random_uuid(),
  projeto_id         uuid not null references public.projetos(id) on delete cascade,
  titulo_reuniao     text,
  data_reuniao       date not null,
  origem             text not null default 'manual' check (origem in ('teams_auto','manual')),
  pontos_principais  text,
  decisoes           text,
  riscos             text,
  proximos_passos    jsonb not null default '[]'::jsonb,  -- array de strings — cada item pode virar 1 tarefa
  participantes      text,
  criado_por         uuid references public.perfis(id),   -- null quando criado pela automação
  criado_em          timestamptz not null default now()
);
create index if not exists idx_checkpoints_projeto on public.checkpoints (projeto_id, data_reuniao desc);

-- Rastreia tarefas do Kanban que nasceram automaticamente de um checkpoint
-- (pra ela poder identificar e apagar/ajustar se o resumo saiu errado).
alter table public.tarefas add column if not exists origem_checkpoint_id uuid references public.checkpoints(id) on delete set null;

create table if not exists public.configuracoes (
  chave text primary key,
  valor text not null
);

insert into public.configuracoes (chave, valor) values
  ('dias_risco_padrao', '3'),
  ('hora_envio_digest_utc', '11'),
  ('digest_ativo', 'true'),
  ('remetente_nome', 'Juliana Lobão'),
  ('remetente_email', 'seu-email@outlook.com')
on conflict (chave) do nothing;

-- Guarda credenciais/tokens de integrações (ex.: refresh token do Microsoft
-- Graph, renovado a cada envio de e-mail). Sem NENHUMA policy de acesso: só o
-- service_role (usado pelas Edge Functions) lê ou escreve aqui — nem admin,
-- nem editor, nem ningum logado no painel via anon/authenticated consegue ver.
create table if not exists public.integracoes_secretas (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.integracoes_secretas enable row level security;

-- Índices para os filtros mais comuns da tela --------------------------------
create index if not exists idx_entregas_projeto     on public.entregas (projeto_id);
create index if not exists idx_entregas_prazo       on public.entregas (data_prazo);
create index if not exists idx_tarefas_projeto      on public.tarefas (projeto_id);
create index if not exists idx_tarefas_sprint       on public.tarefas (sprint_id);
create index if not exists idx_anexos_projeto       on public.anexos (projeto_id);
create index if not exists idx_stakeholders_proj    on public.stakeholders (projeto_id);
create index if not exists idx_membros_perfil       on public.projeto_membros (perfil_id);

-- atualizado_em automático ----------------------------------------------------
create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_projetos on public.projetos;
create trigger trg_touch_projetos before update on public.projetos
  for each row execute function public.touch_atualizado_em();

drop trigger if exists trg_touch_entregas on public.entregas;
create trigger trg_touch_entregas before update on public.entregas
  for each row execute function public.touch_atualizado_em();

drop trigger if exists trg_touch_tarefas on public.tarefas;
create trigger trg_touch_tarefas before update on public.tarefas
  for each row execute function public.touch_atualizado_em();

-- 3. Situação da entrega — fonte única de verdade (tela E e-mail) -----------
create or replace function public.f_situacao(p_status text, p_data_prazo date, p_dias_risco int default 3)
returns text
language sql stable
as $$
  select case
    when p_status = 'concluido' then 'concluido'
    when p_status = 'cancelado' then 'cancelado'
    when p_data_prazo < current_date then 'atrasado'
    when p_data_prazo <= current_date + p_dias_risco then 'em_risco'
    else 'no_prazo'
  end;
$$;

create or replace view public.v_entregas
with (security_invoker = true) as
select
  e.*,
  public.f_situacao(
    e.status, e.data_prazo,
    coalesce((select valor from public.configuracoes where chave = 'dias_risco_padrao')::int, 3)
  ) as situacao_calculada
from public.entregas e;

-- 4. RLS ----------------------------------------------------------------------
alter table public.perfis           enable row level security;
alter table public.projeto_membros  enable row level security;
alter table public.projetos         enable row level security;
alter table public.entregas         enable row level security;
alter table public.sprints          enable row level security;
alter table public.tarefas          enable row level security;
alter table public.stakeholders     enable row level security;
alter table public.anexos           enable row level security;
alter table public.comentarios      enable row level security;
alter table public.checkpoints      enable row level security;
alter table public.notificacoes_log enable row level security;
alter table public.configuracoes    enable row level security;

-- Alguém consegue ver o conteúdo de um projeto? (admin/editor/leitor veem tudo;
-- colaborador só se estiver listado em projeto_membros para aquele projeto)
create or replace function public.pode_ver_projeto(p_projeto_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.papel_atual() in ('admin','editor','leitor')
     or (
       public.papel_atual() = 'colaborador'
       and exists (
         select 1 from public.projeto_membros
         where projeto_id = p_projeto_id and perfil_id = auth.uid()
       )
     );
$$;

-- perfis: todo autenticado vê a lista (pra exibir nomes de responsáveis); só admin edita/exclui
drop policy if exists "perfis_select_autenticado" on public.perfis;
create policy "perfis_select_autenticado" on public.perfis for select to authenticated using (true);
drop policy if exists "perfis_update_admin" on public.perfis;
create policy "perfis_update_admin" on public.perfis for update to authenticated using (public.e_admin());
drop policy if exists "perfis_delete_admin" on public.perfis;
create policy "perfis_delete_admin" on public.perfis for delete to authenticated using (public.e_admin());

-- projeto_membros: visível pra quem já pode ver o projeto; só admin/editor gerencia
drop policy if exists "membros_select" on public.projeto_membros;
create policy "membros_select" on public.projeto_membros for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "membros_insert" on public.projeto_membros;
create policy "membros_insert" on public.projeto_membros for insert to authenticated
  with check (public.e_editor_ou_admin());
drop policy if exists "membros_delete" on public.projeto_membros;
create policy "membros_delete" on public.projeto_membros for delete to authenticated
  using (public.e_editor_ou_admin());

-- projetos: vê quem pode ver; editor+ cria/edita; só admin exclui
drop policy if exists "projetos_select" on public.projetos;
create policy "projetos_select" on public.projetos for select to authenticated
  using (public.pode_ver_projeto(id));
drop policy if exists "projetos_insert" on public.projetos;
create policy "projetos_insert" on public.projetos for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "projetos_update" on public.projetos;
create policy "projetos_update" on public.projetos for update to authenticated using (public.e_editor_ou_admin());
drop policy if exists "projetos_delete" on public.projetos;
create policy "projetos_delete" on public.projetos for delete to authenticated using (public.e_admin());

-- entregas: vê quem pode ver o projeto; editor+ tem CRUD completo;
-- colaborador pode ATUALIZAR (não criar/excluir) só as entregas em que é responsável
drop policy if exists "entregas_select" on public.entregas;
create policy "entregas_select" on public.entregas for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "entregas_insert" on public.entregas;
create policy "entregas_insert" on public.entregas for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "entregas_update" on public.entregas;
create policy "entregas_update" on public.entregas for update to authenticated
  using (public.e_editor_ou_admin() or (public.papel_atual() = 'colaborador' and responsavel_id = auth.uid()));
drop policy if exists "entregas_delete" on public.entregas;
create policy "entregas_delete" on public.entregas for delete to authenticated using (public.e_editor_ou_admin());

-- sprints
drop policy if exists "sprints_select" on public.sprints;
create policy "sprints_select" on public.sprints for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "sprints_insert" on public.sprints;
create policy "sprints_insert" on public.sprints for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "sprints_update" on public.sprints;
create policy "sprints_update" on public.sprints for update to authenticated using (public.e_editor_ou_admin());
drop policy if exists "sprints_delete" on public.sprints;
create policy "sprints_delete" on public.sprints for delete to authenticated using (public.e_editor_ou_admin());

-- tarefas: mesmo padrão de entregas (colaborador só atualiza a sua)
drop policy if exists "tarefas_select" on public.tarefas;
create policy "tarefas_select" on public.tarefas for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "tarefas_insert" on public.tarefas;
create policy "tarefas_insert" on public.tarefas for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "tarefas_update" on public.tarefas;
create policy "tarefas_update" on public.tarefas for update to authenticated
  using (public.e_editor_ou_admin() or (public.papel_atual() = 'colaborador' and responsavel_id = auth.uid()));
drop policy if exists "tarefas_delete" on public.tarefas;
create policy "tarefas_delete" on public.tarefas for delete to authenticated using (public.e_editor_ou_admin());

-- stakeholders
drop policy if exists "stakeholders_select" on public.stakeholders;
create policy "stakeholders_select" on public.stakeholders for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "stakeholders_insert" on public.stakeholders;
create policy "stakeholders_insert" on public.stakeholders for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "stakeholders_update" on public.stakeholders;
create policy "stakeholders_update" on public.stakeholders for update to authenticated using (public.e_editor_ou_admin());
drop policy if exists "stakeholders_delete" on public.stakeholders;
create policy "stakeholders_delete" on public.stakeholders for delete to authenticated using (public.e_editor_ou_admin());

-- entrega_stakeholders: vê quem pode ver a entrega (via projeto); editor+ vincula/desvincula
drop policy if exists "entrega_stakeholders_select" on public.entrega_stakeholders;
create policy "entrega_stakeholders_select" on public.entrega_stakeholders for select to authenticated
  using (exists (select 1 from public.entregas e where e.id = entrega_id and public.pode_ver_projeto(e.projeto_id)));
drop policy if exists "entrega_stakeholders_insert" on public.entrega_stakeholders;
create policy "entrega_stakeholders_insert" on public.entrega_stakeholders for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "entrega_stakeholders_delete" on public.entrega_stakeholders;
create policy "entrega_stakeholders_delete" on public.entrega_stakeholders for delete to authenticated using (public.e_editor_ou_admin());

-- anexos: vê quem pode ver o projeto; editor+ envia; só admin exclui
drop policy if exists "anexos_select" on public.anexos;
create policy "anexos_select" on public.anexos for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "anexos_insert" on public.anexos;
create policy "anexos_insert" on public.anexos for insert to authenticated with check (public.e_editor_ou_admin());
drop policy if exists "anexos_delete" on public.anexos;
create policy "anexos_delete" on public.anexos for delete to authenticated using (public.e_admin());

-- comentarios (histórico/justificativas): vê quem pode ver o projeto;
-- editor+ ou colaborador do projeto podem escrever; só admin exclui (correção)
drop policy if exists "comentarios_select" on public.comentarios;
create policy "comentarios_select" on public.comentarios for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "comentarios_insert" on public.comentarios;
create policy "comentarios_insert" on public.comentarios for insert to authenticated
  with check (public.e_editor_ou_admin() or (public.papel_atual() = 'colaborador' and public.pode_ver_projeto(projeto_id)));
drop policy if exists "comentarios_delete" on public.comentarios;
create policy "comentarios_delete" on public.comentarios for delete to authenticated
  using (public.e_admin());

-- checkpoints: leitura por quem vê o projeto; escrita manual por editor+;
-- a automação do Teams NÃO usa este caminho — ela passa pela Edge Function
-- "criar-checkpoint" com a service_role key, que ignora RLS.
drop policy if exists "checkpoints_select" on public.checkpoints;
create policy "checkpoints_select" on public.checkpoints for select to authenticated
  using (public.pode_ver_projeto(projeto_id));
drop policy if exists "checkpoints_insert" on public.checkpoints;
create policy "checkpoints_insert" on public.checkpoints for insert to authenticated
  with check (public.e_editor_ou_admin());
drop policy if exists "checkpoints_update" on public.checkpoints;
create policy "checkpoints_update" on public.checkpoints for update to authenticated
  using (public.e_editor_ou_admin());
drop policy if exists "checkpoints_delete" on public.checkpoints;
create policy "checkpoints_delete" on public.checkpoints for delete to authenticated
  using (public.e_editor_ou_admin());

-- notificacoes_log: leitura para todo autenticado (transparência); só a Edge
-- Function grava (usa a service_role key, que ignora RLS) — nenhuma policy de insert aqui.
drop policy if exists "notificacoes_log_select" on public.notificacoes_log;
create policy "notificacoes_log_select" on public.notificacoes_log for select to authenticated using (true);

-- configuracoes: leitura para todo autenticado; edição só admin
drop policy if exists "configuracoes_select" on public.configuracoes;
create policy "configuracoes_select" on public.configuracoes for select to authenticated using (true);
drop policy if exists "configuracoes_update" on public.configuracoes;
create policy "configuracoes_update" on public.configuracoes for update to authenticated using (public.e_admin());

-- 5. Storage: bucket privado de anexos ---------------------------------------
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

drop policy if exists "anexos_storage_select" on storage.objects;
create policy "anexos_storage_select" on storage.objects for select to authenticated
  using (bucket_id = 'anexos');
drop policy if exists "anexos_storage_insert" on storage.objects;
create policy "anexos_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.e_editor_ou_admin());
drop policy if exists "anexos_storage_delete" on storage.objects;
create policy "anexos_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.e_admin());

-- ============================================================================
-- Fim do setup.
-- Próximos passos (ver README.md):
--   1. Fazer login uma vez no app (cria seu perfil automaticamente como admin)
--   2. Implantar a Edge Function supabase/functions/notificacoes-diarias
--   3. Rodar supabase/schedule_cron.sql (agenda o envio diário)
-- ============================================================================
