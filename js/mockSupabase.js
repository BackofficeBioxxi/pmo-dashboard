// ============================================================================
// Cliente "falso" do Supabase, usado só no modo de demonstração
// (abrir o site com ?demo=1 na URL). Guarda tudo em memória, com dados de
// exemplo, pra dar pra ver e testar as telas sem precisar de um projeto
// Supabase real ainda. Nada aqui é salvo de verdade — ao recarregar a
// página, volta ao ponto de partida.
// ============================================================================

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
const nowISO = () => new Date().toISOString();
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const ADMIN_ID = "demo-admin";
const EDITOR_ID = "demo-editor";
const COLAB_ID = "demo-colaborador";
const P1 = uid(), P2 = uid(), P3 = uid();
const SPRINT1 = uid();

const DB = {
  perfis: [
    { id: ADMIN_ID, nome: "Juliana Lobão", papel: "admin", ativo: true, criado_em: nowISO() },
    { id: EDITOR_ID, nome: "Carlos Souza", papel: "editor", ativo: true, criado_em: nowISO() },
    { id: COLAB_ID, nome: "Ana Ferreira", papel: "colaborador", ativo: true, criado_em: nowISO() },
  ],
  projeto_membros: [{ projeto_id: P1, perfil_id: COLAB_ID }],
  projetos: [
    { id: P1, nome: "Implantação CRM", descricao: "Migração do CRM antigo para a nova plataforma, com treinamento das equipes.", status: "em_andamento", prioridade: "alta", data_inicio: addDays(-40), data_fim_prevista: addDays(30), data_fim_real: null, cor: "#34e9ff", responsavel_id: EDITOR_ID, criado_por: ADMIN_ID, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: P2, nome: "Expansão Regional Nordeste", descricao: "Abertura de 3 novas unidades na região Nordeste.", status: "em_andamento", prioridade: "critica", data_inicio: addDays(-20), data_fim_prevista: addDays(60), data_fim_real: null, cor: "#a855f7", responsavel_id: ADMIN_ID, criado_por: ADMIN_ID, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: P3, nome: "Auditoria de Processos", descricao: "Revisão dos processos internos de compliance.", status: "planejado", prioridade: "media", data_inicio: addDays(5), data_fim_prevista: addDays(90), data_fim_real: null, cor: "#ff4fd8", responsavel_id: null, criado_por: ADMIN_ID, criado_em: nowISO(), atualizado_em: nowISO() },
  ],
  entregas: [
    { id: uid(), projeto_id: P1, titulo: "Migração da base de clientes", descricao: "Exportar e importar todos os cadastros.", observacoes: "Falta validar duplicados antes de subir.", tipo: "entrega", data_prazo: addDays(-5), data_conclusao: null, status: "em_andamento", prioridade: "alta", responsavel_id: EDITOR_ID, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, titulo: "Treinamento das equipes", descricao: "Sessões de treinamento por regional.", observacoes: "", tipo: "marco", data_prazo: addDays(-1), data_conclusao: null, status: "pendente", prioridade: "critica", responsavel_id: ADMIN_ID, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, titulo: "Homologação com TI", descricao: "", observacoes: "Aguardando ambiente de testes.", tipo: "entrega", data_prazo: addDays(2), data_conclusao: null, status: "em_andamento", prioridade: "media", responsavel_id: COLAB_ID, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, titulo: "Go-live oficial", descricao: "Corte de chave para produção.", observacoes: "", tipo: "marco", data_prazo: addDays(25), data_conclusao: null, status: "pendente", prioridade: "critica", responsavel_id: EDITOR_ID, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, titulo: "Levantamento de requisitos", descricao: "", observacoes: "", tipo: "entrega", data_prazo: addDays(-15), data_conclusao: addDays(-12), status: "concluido", prioridade: "media", responsavel_id: EDITOR_ID, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P2, titulo: "Assinatura dos contratos de locação", descricao: "3 pontos comerciais.", observacoes: "Jurídico revisando cláusulas.", tipo: "entrega", data_prazo: addDays(1), data_conclusao: null, status: "em_andamento", prioridade: "critica", responsavel_id: ADMIN_ID, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P2, titulo: "Contratação das equipes locais", descricao: "", observacoes: "", tipo: "entrega", data_prazo: addDays(15), data_conclusao: null, status: "pendente", prioridade: "alta", responsavel_id: null, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P2, titulo: "Inauguração unidade piloto", descricao: "", observacoes: "", tipo: "marco", data_prazo: addDays(55), data_conclusao: null, status: "pendente", prioridade: "critica", responsavel_id: ADMIN_ID, silenciar_notificacoes: true, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P3, titulo: "Mapeamento dos processos atuais", descricao: "", observacoes: "", tipo: "entrega", data_prazo: addDays(20), data_conclusao: null, status: "pendente", prioridade: "media", responsavel_id: null, silenciar_notificacoes: false, criado_em: nowISO(), atualizado_em: nowISO() },
  ],
  sprints: [
    { id: SPRINT1, projeto_id: P1, nome: "Sprint 1 — Migração", objetivo: "Concluir a migração de dados e homologar com TI.", data_inicio: addDays(-14), data_fim: addDays(0), status: "ativo", criado_em: nowISO() },
    { id: uid(), projeto_id: P1, nome: "Sprint 2 — Go-live", objetivo: "Preparar corte de chave e treinamento final.", data_inicio: addDays(1), data_fim: addDays(14), status: "planejado", criado_em: nowISO() },
  ],
  tarefas: [
    { id: uid(), projeto_id: P1, sprint_id: SPRINT1, entrega_id: null, titulo: "Exportar base antiga", descricao: "", status: "concluido", prioridade: "media", responsavel_id: EDITOR_ID, data_prazo: addDays(-10), ordem: 0, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: SPRINT1, entrega_id: null, titulo: "Mapear campos customizados", descricao: "", status: "concluido", prioridade: "baixa", responsavel_id: COLAB_ID, data_prazo: addDays(-8), ordem: 1, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: SPRINT1, entrega_id: null, titulo: "Validar duplicados", descricao: "", status: "em_andamento", prioridade: "alta", responsavel_id: EDITOR_ID, data_prazo: addDays(1), ordem: 0, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: SPRINT1, entrega_id: null, titulo: "Importar para o novo CRM", descricao: "", status: "todo", prioridade: "alta", responsavel_id: EDITOR_ID, data_prazo: addDays(3), ordem: 0, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: SPRINT1, entrega_id: null, titulo: "Agendar treinamento regional Sul", descricao: "", status: "todo", prioridade: "media", responsavel_id: ADMIN_ID, data_prazo: addDays(5), ordem: 1, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: SPRINT1, entrega_id: null, titulo: "Testar fluxo de aprovação", descricao: "", status: "em_revisao", prioridade: "critica", responsavel_id: COLAB_ID, data_prazo: addDays(2), ordem: 0, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: null, entrega_id: null, titulo: "Revisar política de permissões", descricao: "", status: "backlog", prioridade: "baixa", responsavel_id: null, data_prazo: null, ordem: 0, criado_em: nowISO(), atualizado_em: nowISO() },
    { id: uid(), projeto_id: P1, sprint_id: null, entrega_id: null, titulo: "Documentar processo de rollback", descricao: "", status: "backlog", prioridade: "media", responsavel_id: null, data_prazo: null, ordem: 1, criado_em: nowISO(), atualizado_em: nowISO() },
  ],
  stakeholders: [
    { id: uid(), projeto_id: P1, nome: "Ricardo Nogueira", email: "ricardo.ceo@bioxxi.com.br", cargo: "CEO", observacoes: "Prefere resumos curtos, direto ao ponto — evitar jargão técnico.", receber_digest_diario: true, ativo: true, criado_em: nowISO() },
    { id: uid(), projeto_id: P2, nome: "Fernanda Lima", cargo: "Diretora de Operações", email: "fernanda.lima@bioxxi.com.br", observacoes: "", receber_digest_diario: true, ativo: true, criado_em: nowISO() },
    { id: uid(), projeto_id: P1, nome: "Equipe de TI", cargo: "Suporte técnico", email: "ti@bioxxi.com.br", observacoes: "Só avisar em caso de bloqueio técnico.", receber_digest_diario: false, ativo: true, criado_em: nowISO() },
  ],
  anexos: [],
  notificacoes_log: [
    { id: uid(), tipo: "digest_diario", stakeholder_id: null, projeto_id: P1, data_referencia: addDays(-1), status_envio: "ok", mensagem_erro: null, enviado_em: nowISO(), stakeholders: { nome: "Ricardo Nogueira", email: "ricardo.ceo@bioxxi.com.br" } },
    { id: uid(), tipo: "digest_diario", stakeholder_id: null, projeto_id: P2, data_referencia: addDays(-1), status_envio: "pulado_sem_itens", mensagem_erro: null, enviado_em: nowISO(), stakeholders: { nome: "Fernanda Lima", email: "fernanda.lima@bioxxi.com.br" } },
  ],
  comentarios: [],
  checkpoints: [
    {
      id: uid(), projeto_id: P1, titulo_reuniao: "Implantação CRM — acompanhamento semanal", data_reuniao: addDays(-3),
      origem: "teams_auto", pontos_principais: "Migração da base avançou 70%. Time de TI confirmou ambiente de homologação pronto.",
      decisoes: "Adiar o treinamento da regional Sul em 1 semana.", riscos: "Fornecedor do novo CRM pode atrasar a liberação do ambiente de produção.",
      proximos_passos: ["Validar duplicados na base migrada", "Agendar nova data de treinamento com a regional Sul"],
      participantes: "juliana.lobao@bioxxi.com.br, carlos.souza@bioxxi.com.br", criado_por: null, criado_em: nowISO(),
    },
  ],
  configuracoes: [
    { chave: "dias_risco_padrao", valor: "3" },
    { chave: "hora_envio_digest_utc", valor: "11" },
    { chave: "digest_ativo", valor: "true" },
    { chave: "remetente_nome", valor: "Juliana Lobão" },
    { chave: "remetente_email", valor: "juliana.lobao@bioxxi.com.br" },
  ],
};

function calcSituacao(status, prazo, diasRisco, hojeStr) {
  if (status === "concluido") return "concluido";
  if (status === "cancelado") return "cancelado";
  if (prazo < hojeStr) return "atrasado";
  const limite = new Date(hojeStr);
  limite.setDate(limite.getDate() + diasRisco);
  if (prazo <= limite.toISOString().slice(0, 10)) return "em_risco";
  return "no_prazo";
}
function buildVEntregas() {
  const diasRisco = Number(DB.configuracoes.find((c) => c.chave === "dias_risco_padrao")?.valor ?? 3);
  const hojeStr = new Date().toISOString().slice(0, 10);
  return DB.entregas.map((e) => ({ ...e, situacao_calculada: calcSituacao(e.status, e.data_prazo, diasRisco, hojeStr) }));
}

// PostgREST aceita dois jeitos de indicar o relacionamento no select:
// "alias:coluna_fk(campos)" (o texto após ':' é a COLUNA) ou "tabela(campos)"
// / "alias:tabela!constraint(campos)" (o texto é a TABELA). Distinguimos pelos
// nomes conhecidos de coluna vs. tabela — o suficiente pros selects deste app.
const FK_TARGET_TABLE = { responsavel_id: "perfis", criado_por: "perfis", autor_id: "perfis", projeto_id: "projetos", stakeholder_id: "stakeholders" };
const TABLE_DEFAULT_FK = { projetos: "projeto_id", stakeholders: "stakeholder_id", perfis: "responsavel_id" };
function resolveEmbeds(row, selectStr) {
  const out = { ...row };
  const re = /(?:(\w+):)?(\w+)[^(),]*\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(selectStr))) {
    const [, aliasRaw, target, fieldsRaw] = m;
    let targetTable, fkCol;
    if (FK_TARGET_TABLE[target]) { fkCol = target; targetTable = FK_TARGET_TABLE[target]; }
    else { targetTable = target; fkCol = TABLE_DEFAULT_FK[target]; }
    const alias = aliasRaw || target;
    if (!fkCol || !DB[targetTable]) continue;
    const related = DB[targetTable].find((r) => String(r.id) === String(row[fkCol]));
    const fields = fieldsRaw.split(",").map((s) => s.trim());
    out[alias] = related ? Object.fromEntries(fields.map((f) => [f, related[f]])) : null;
  }
  return out;
}

class MockQuery {
  constructor(table) {
    this._table = table;
    this._filters = [];
    this._selectStr = "*";
    this._order = null;
    this._limitN = null;
    this._single = null;
    this._op = "select";
    this._payload = null;
  }
  select(str) { this._selectStr = str || "*"; return this; }
  eq(col, val) { this._filters.push({ op: "eq", col, val }); return this; }
  in(col, arr) { this._filters.push({ op: "in", col, arr }); return this; }
  gte(col, val) { this._filters.push({ op: "gte", col, val }); return this; }
  not(col, op, val) {
    if (op === "in") {
      const arr = String(val).replace(/^\(|\)$/g, "").split(",").map((s) => s.trim());
      this._filters.push({ op: "not_in", col, arr });
    } else {
      this._filters.push({ op: "not_eq", col, val });
    }
    return this;
  }
  order(col, opts) { this._order = { col, ascending: opts?.ascending !== false }; return this; }
  limit(n) { this._limitN = n; return this; }
  single() { this._single = "single"; return this; }
  maybeSingle() { this._single = "maybeSingle"; return this; }
  insert(payload) { this._op = "insert"; this._payload = payload; return this; }
  update(payload) { this._op = "update"; this._payload = payload; return this; }
  upsert(payload) { this._op = "upsert"; this._payload = payload; return this; }
  delete() { this._op = "delete"; return this; }

  _execute() {
    const table = this._table;
    if (!DB[table] && table !== "v_entregas") DB[table] = [];

    if (this._op === "insert") {
      const items = (Array.isArray(this._payload) ? this._payload : [this._payload]).map((it) => ({
        id: uid(), criado_em: nowISO(), atualizado_em: nowISO(), ...it,
      }));
      DB[table].push(...items);
      return { data: items, error: null };
    }
    if (this._op === "upsert") {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      const keyField = table === "configuracoes" ? "chave" : "id";
      items.forEach((it) => {
        const idx = DB[table].findIndex((r) => r[keyField] === it[keyField]);
        if (idx >= 0) DB[table][idx] = { ...DB[table][idx], ...it };
        else DB[table].push(it);
      });
      return { data: items, error: null };
    }

    const source = table === "v_entregas" ? buildVEntregas() : DB[table];
    let matched = source.filter((r) => this._filters.every((f) => {
      if (f.op === "eq") return String(r[f.col]) === String(f.val);
      if (f.op === "in") return f.arr.map(String).includes(String(r[f.col]));
      if (f.op === "not_in") return !f.arr.map(String).includes(String(r[f.col]));
      if (f.op === "not_eq") return String(r[f.col]) !== String(f.val);
      if (f.op === "gte") return r[f.col] >= f.val;
      return true;
    }));

    if (this._op === "update") {
      matched.forEach((r) => Object.assign(r, this._payload, { atualizado_em: nowISO() }));
      return { data: matched, error: null };
    }
    if (this._op === "delete") {
      DB[table] = DB[table].filter((r) => !matched.includes(r));
      return { data: matched, error: null };
    }

    if (this._order) {
      const { col, ascending } = this._order;
      matched = matched.slice().sort((a, b) => {
        const av = a[col] ?? "", bv = b[col] ?? "";
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return ascending ? cmp : -cmp;
      });
    }
    if (this._limitN) matched = matched.slice(0, this._limitN);
    matched = matched.map((r) => resolveEmbeds(r, this._selectStr));

    if (this._single === "single") return { data: matched[0] || null, error: matched[0] ? null : { message: "registro não encontrado (demo)" } };
    if (this._single === "maybeSingle") return { data: matched[0] || null, error: null };
    return { data: matched, error: null };
  }
  then(resolve) { resolve(this._execute()); }
}

const demoFiles = {}; // path -> object URL, só pra thumbnails funcionarem na demo

function createMockClient() {
  return {
    auth: {
      async getSession() { return { data: { session: { user: { id: ADMIN_ID, email: "demo@bioxxi.com.br" } } } }; },
      async getUser() { return { data: { user: { id: ADMIN_ID, email: "demo@bioxxi.com.br" } } }; },
      async signInWithPassword() { return { error: null }; },
      async signOut() { return { error: null }; },
    },
    from(table) { return new MockQuery(table); },
    storage: {
      from() {
        return {
          async upload(path, file) { demoFiles[path] = URL.createObjectURL(file); return { error: null }; },
          async createSignedUrl(path) { return { data: { signedUrl: demoFiles[path] || "" } }; },
          async remove(paths) { paths.forEach((p) => delete demoFiles[p]); return { error: null }; },
        };
      },
    },
    functions: {
      async invoke(name, { body }) {
        const dataReferencia = new Date().toISOString().slice(0, 10);
        const destinatarios = body.destinatarios || (body.to ? [{ email: body.to, stakeholder_id: body.stakeholder_id }] : []);
        const resultados = destinatarios.map((d) => ({ email: d.email, status: "ok" }));
        resultados.forEach((r, i) => {
          DB.notificacoes_log.push({
            id: uid(), tipo: "report_ceo", stakeholder_id: destinatarios[i].stakeholder_id || null,
            projeto_id: body.projeto_id, data_referencia: dataReferencia, status_envio: "ok",
            mensagem_erro: null, enviado_em: nowISO(),
            stakeholders: { nome: r.email, email: r.email },
          });
        });
        return { data: { ok: true, resultados }, error: null };
      },
    },
  };
}
