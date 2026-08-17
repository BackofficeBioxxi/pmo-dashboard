// ============================================================================
// PMO Dashboard — lógica do app (módulo único, sem build step).
// Fala direto com o Supabase (banco, auth, storage) via supabase-js.
// Organizado em seções — procure o cabeçalho "// ==== NOME ====" para navegar.
// ============================================================================
// sb / isDemoMode vêm de js/supabaseClient.js (carregado antes deste
// arquivo no index.html — scripts clássicos, sem type="module", de propósito,
// pra a tela também abrir com duplo-clique no arquivo, sem servidor).
if (isDemoMode) { document.getElementById("demo-banner").classList.remove("hidden"); document.body.classList.add("demo-mode"); }

// ==== ESTADO GLOBAL ====
const state = {
  user: null,
  perfil: null,
  projetos: [],
  perfis: [],
  currentTab: "visao-geral",
  chartStatus: null,
  chartAndamento: null,
  chartAtraso: null,
  chartConcluidas: null,
  calendar: null,
  stakeholdersAll: [],     // cache de todos os stakeholders (todos os projetos), pro preenchimento inteligente do report
  reportDestinatarios: [], // destinatários escolhidos pro Report do CEO: [{email, nome, stakeholder_id|null}]
};

const STATUS_PROJETO = ["iniciacao", "planejado", "em_andamento", "pausado", "concluido", "cancelado"];
const STATUS_ENTREGA = ["pendente", "em_andamento", "concluido", "cancelado"];
const STATUS_TAREFA = ["backlog", "todo", "em_andamento", "em_revisao", "concluido"];
const PRIORIDADES = ["baixa", "media", "alta", "critica"];
const LABEL = {
  iniciacao: "Iniciação", planejado: "Planejado", em_andamento: "Em andamento", pausado: "Pausado", concluido: "Concluído", cancelado: "Cancelado",
  pendente: "Pendente", backlog: "Backlog", todo: "A fazer", em_revisao: "Em revisão", ativo: "Ativo",
  baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica",
  atrasado: "Atrasado", em_risco: "Em risco", no_prazo: "No prazo",
  marco: "Marco", entrega: "Entrega",
  admin: "Admin", editor: "Editor", colaborador: "Colaborador", leitor: "Leitor",
};
const label = (v) => LABEL[v] ?? v ?? "-";

// ==== HELPERS DE UI ====
function toast(msg, type = "ok") {
  const wrap = document.getElementById("toast-wrap");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) {
  if (!d) return "-";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function setLoading(v) {
  document.getElementById("global-loading").classList.toggle("hidden", !v);
}
function canEdit() {
  return state.perfil?.papel === "admin" || state.perfil?.papel === "editor";
}
function canEditItem(item) {
  return canEdit() || (state.perfil?.papel === "colaborador" && item.responsavel_id === state.user?.id);
}
function isAdmin() {
  return state.perfil?.papel === "admin";
}
function badge(situacao) {
  return `<span class="badge badge-${situacao}"><span class="badge-dot"></span>${label(situacao)}</span>`;
}
function priorityDot(p) {
  return `<span class="priority-dot priority-${p || "media"}"></span>`;
}
function perfilNome(id) {
  return state.perfis.find((p) => p.id === id)?.nome || "-";
}
function projetoNome(id) {
  return state.projetos.find((p) => p.id === id)?.nome || "-";
}
function selectOptions(list, valueKey, labelKey, current) {
  return list.map((it) => `<option value="${it[valueKey]}" ${it[valueKey] === current ? "selected" : ""}>${esc(it[labelKey])}</option>`).join("");
}

// ==== MODAL GENÉRICO ====
function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}
function openModal({ title, bodyHtml, footerHtml, onMount }) {
  document.getElementById("modal-root").innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box">
        <div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" id="modal-close-btn">&times;</button></div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">${footerHtml}</div>
      </div>
    </div>`;
  document.getElementById("modal-close-btn").onclick = closeModal;
  document.getElementById("modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") closeModal(); });
  if (onMount) onMount();
}
function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal({
      title: "Confirmar",
      bodyHtml: `<p>${esc(message)}</p>`,
      footerHtml: `<button class="btn btn-ghost" id="cf-no">Cancelar</button><button class="btn btn-danger" id="cf-yes">Confirmar</button>`,
      onMount: () => {
        document.getElementById("cf-no").onclick = () => { closeModal(); resolve(false); };
        document.getElementById("cf-yes").onclick = () => { closeModal(); resolve(true); };
      },
    });
  });
}

// ==== FORM MODAL (criar/editar genérico) ====
// fields: [{name,label,type:'text'|'textarea'|'date'|'select'|'number'|'checkbox',options,required,half}]
function fieldHtml(f, values) {
  const val = values?.[f.name] ?? f.default ?? "";
  const half = f.half ? "" : "grid-column: 1 / -1;";
  if (f.type === "select") {
    return `<div class="field" style="${half}"><label>${f.label}</label><select name="${f.name}" ${f.required ? "required" : ""}>
      ${f.placeholder ? `<option value="">${f.placeholder}</option>` : ""}
      ${f.options.map((o) => `<option value="${o.value}" ${String(o.value) === String(val) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select></div>`;
  }
  if (f.type === "textarea") {
    return `<div class="field" style="${half}"><label>${f.label}</label><textarea name="${f.name}" ${f.required ? "required" : ""}>${esc(val)}</textarea></div>`;
  }
  if (f.type === "checkbox") {
    return `<div class="field" style="${half}"><label>${f.label}</label><select name="${f.name}"><option value="true" ${val ? "selected" : ""}>Sim</option><option value="false" ${!val ? "selected" : ""}>Não</option></select></div>`;
  }
  return `<div class="field" style="${half}"><label>${f.label}</label><input type="${f.type}" name="${f.name}" value="${esc(val)}" ${f.required ? "required" : ""} /></div>`;
}
function openFormModal({ title, fields, values, onSubmit, extraFooter = "", deleteBtn = null, infoHtml = "", belowFormHtml = "", onExtraMount = null }) {
  const body = `${infoHtml}<form id="generic-form"><div class="form-row">${fields.map((f) => fieldHtml(f, values)).join("")}</div>
    <div class="error-text" id="form-error"></div></form>${belowFormHtml}`;
  const footer = `${extraFooter}<button class="btn btn-ghost" id="gf-cancel">Cancelar</button><button class="btn btn-primary" id="gf-save">Salvar</button>`;
  openModal({
    title, bodyHtml: body, footerHtml: footer,
    onMount: () => {
      document.getElementById("gf-cancel").onclick = closeModal;
      if (onExtraMount) onExtraMount();
      if (deleteBtn) {
        const btn = document.createElement("button");
        btn.className = "btn btn-danger";
        btn.textContent = deleteBtn.label;
        btn.onclick = deleteBtn.onClick;
        document.querySelector(".modal-footer").prepend(btn);
      }
      document.getElementById("gf-save").onclick = async () => {
        const form = document.getElementById("generic-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const data = {};
        for (const f of fields) {
          let v = fd.get(f.name);
          if (f.type === "checkbox") v = v === "true";
          if (f.type === "number") v = v === "" ? null : Number(v);
          if ((f.type === "date" || f.type === "select") && v === "") v = null;
          data[f.name] = v;
        }
        try {
          await onSubmit(data);
          closeModal();
        } catch (e) {
          document.getElementById("form-error").textContent = e.message || String(e);
        }
      };
    },
  });
}

// ==== HISTÓRICO / COMENTÁRIOS (justificativas, atualizações, pedidos de prazo) ====
// Usado tanto em Tarefas quanto em Entregas — reaproveita o mesmo bloco.
async function buildComentariosHtml(coluna, valorId) {
  if (!valorId) return "";
  const { data, error } = await sb.from("comentarios").select("*, perfis:autor_id(nome)").eq(coluna, valorId).order("criado_em", { ascending: true });
  if (error) return "";
  const lista = (data || []).map((c) => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border);">
      <div class="small"><b>${esc(c.perfis?.nome || "—")}</b> <span class="muted">${new Date(c.criado_em).toLocaleString("pt-BR")}</span></div>
      <div class="small" style="margin-top:2px;">${esc(c.texto)}</div>
    </div>`).join("") || `<div class="small muted">Nenhum comentário ainda.</div>`;
  return `
    <div class="card" style="padding:14px 16px;margin:16px 0 0;">
      <div class="small" style="font-weight:700;margin-bottom:8px;">Histórico / comentários (justificativas, atualizações, pedidos de prazo...)</div>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:10px;">${lista}</div>
      <div class="flex gap-8">
        <input type="text" id="novo-comentario-input" placeholder="Escrever uma atualização ou justificativa..." style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border-strong);background:var(--input-bg);color:var(--text-0);" />
        <button type="button" class="btn btn-primary btn-sm" id="btn-add-comentario">Adicionar</button>
      </div>
    </div>`;
}
function wireComentarioInput({ coluna, valorId, projetoId, onAdded }) {
  const btn = document.getElementById("btn-add-comentario");
  if (!btn) return;
  btn.onclick = async () => {
    const input = document.getElementById("novo-comentario-input");
    const texto = input.value.trim();
    if (!texto) return;
    const payload = { projeto_id: projetoId, autor_id: state.user.id, texto, [coluna]: valorId };
    const { error } = await sb.from("comentarios").insert(payload);
    if (error) return toast(error.message, "err");
    toast("Comentário adicionado.");
    onAdded();
  };
}

// ==== AUTH ====
async function doLogin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
async function doLogout() {
  await sb.auth.signOut();
  location.reload();
}
async function loadPerfilAtual() {
  const { data: userData } = await sb.auth.getUser();
  state.user = userData?.user ?? null;
  if (!state.user) return null;
  const { data, error } = await sb.from("perfis").select("*").eq("id", state.user.id).single();
  if (error) throw error;
  state.perfil = data;
  return data;
}
function applyIdentityToShell() {
  document.getElementById("user-name").textContent = state.perfil?.nome || state.user?.email || "-";
  document.getElementById("user-role").textContent = label(state.perfil?.papel);
  document.getElementById("user-avatar").textContent = (state.perfil?.nome || state.user?.email || "?").slice(0, 1).toUpperCase();
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin() ? "flex" : "none";
  });
}

// ==== NAVEGAÇÃO ENTRE ABAS ====
const TAB_META = {
  "visao-geral": { title: "Visão Geral", sub: "Resumo de todos os projetos", load: loadVisaoGeral },
  projetos: { title: "Projetos", sub: "Todos os projetos cadastrados", load: loadProjetos },
  entregas: { title: "Entregas & Prazos", sub: "Marcos e entregas de todos os projetos", load: loadEntregas },
  kanban: { title: "Sprints / Kanban", sub: "Selecione um projeto para ver o quadro", load: loadKanban },
  calendario: { title: "Calendário", sub: "Prazos e sprints no tempo", load: loadCalendario },
  checkpoints: { title: "Checkpoints", sub: "Resumo de reuniões por projeto", load: loadCheckpoints },
  anexos: { title: "Anexos", sub: "Arquivos e prints por projeto", load: loadAnexos },
  stakeholders: { title: "Stakeholders", sub: "Destinatários de notificações e reports", load: loadStakeholders },
  config: { title: "Configurações", sub: "Regras do sistema e usuários", load: loadConfig },
}; // funções "load*" são "hoisted" (function declarations), então podem ser referenciadas aqui mesmo definidas depois

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((el) => el.classList.toggle("active", el.id === `tab-${tab}`));
  document.getElementById("page-title").textContent = TAB_META[tab].title;
  document.getElementById("page-sub").textContent = TAB_META[tab].sub;
  document.getElementById("sidebar").classList.remove("open");
  TAB_META[tab].load().catch((e) => toast(e.message, "err"));
}

// ==== CARREGAMENTO BASE (cacheado, usado nos selects de todo lugar) ====
async function refreshBase() {
  const [{ data: projetos, error: e1 }, { data: perfis, error: e2 }] = await Promise.all([
    sb.from("projetos").select("*, resp:perfis!projetos_responsavel_id_fkey(nome)").order("criado_em", { ascending: false }),
    sb.from("perfis").select("*").order("nome"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  state.projetos = projetos ?? [];
  state.perfis = perfis ?? [];
}

// Desenha (ou redesenha) uma pizza de "quantas entregas, por área do
// stakeholder" num canvas específico — reaproveitado pelos 3 recortes
// (andamento/atraso/concluídas) da Visão Geral.
const PALETA_PIZZA = ["#34e9ff", "#a855f7", "#ff4fd8", "#3ef7a6", "#ffd23e", "#ff5c72", "#8b8fb8"];
function renderPizzaPorArea(canvasId, stateKey, entregasFiltradas, areasPorProjeto, corTexto) {
  const contagem = {};
  entregasFiltradas.forEach((e) => {
    (areasPorProjeto[e.projeto_id] || new Set()).forEach((area) => {
      contagem[area] = (contagem[area] || 0) + 1;
    });
  });
  const labels = Object.keys(contagem);
  const ctx = document.getElementById(canvasId);
  const vazioEl = document.getElementById(`${canvasId}-vazio`);
  if (state[stateKey]) state[stateKey].destroy();
  ctx.classList.toggle("hidden", labels.length === 0);
  if (vazioEl) vazioEl.classList.toggle("hidden", labels.length > 0);
  if (!labels.length) return;
  state[stateKey] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: labels.map((a) => contagem[a]), backgroundColor: labels.map((_, i) => PALETA_PIZZA[i % PALETA_PIZZA.length]), borderColor: cssVar("--panel-solid") || "#151833", borderWidth: 3, hoverOffset: 8 }],
    },
    options: { plugins: { legend: { position: "bottom", labels: { color: corTexto, boxWidth: 12, padding: 12, font: { size: 11 } } } }, cutout: "62%" },
  });
}

// ==== VISÃO GERAL ====
async function loadVisaoGeral() {
  setLoading(true);
  try {
    await refreshBase();
    const filtroProjeto = document.getElementById("vg-filtro-projeto").value;
    const selVg = document.getElementById("vg-filtro-projeto");
    if (selVg.options.length <= 1) selVg.innerHTML = `<option value="">Todos os projetos</option>` + selectOptions(state.projetos, "id", "nome");
    selVg.value = filtroProjeto;

    let qEntregas = sb.from("v_entregas").select("*, projetos(nome), perfis:responsavel_id(nome)");
    if (filtroProjeto) qEntregas = qEntregas.eq("projeto_id", filtroProjeto);
    const { data: entregas, error } = await qEntregas;
    if (error) throw error;

    const projetosNoEscopo = filtroProjeto ? state.projetos.filter((p) => p.id === filtroProjeto) : state.projetos;
    const projetosAtivosLista = projetosNoEscopo.filter((p) => !["concluido", "cancelado"].includes(p.status));
    const noPrazoLista = entregas.filter((e) => e.situacao_calculada === "no_prazo");
    const riscoLista = entregas.filter((e) => e.situacao_calculada === "em_risco");
    const atrasadasLista = entregas.filter((e) => e.situacao_calculada === "atrasado");
    const entreguesLista = entregas.filter((e) => e.situacao_calculada === "concluido");
    // guarda pra abrir no modal quando clicar em cada card, sem refazer a consulta
    state.vgListas = { projetosAtivos: projetosAtivosLista, noPrazo: noPrazoLista, emRisco: riscoLista, atrasadas: atrasadasLista, entregues: entreguesLista };
    document.getElementById("kpi-projetos-ativos").textContent = projetosAtivosLista.length;
    document.getElementById("kpi-no-prazo").textContent = noPrazoLista.length;
    document.getElementById("kpi-em-risco").textContent = riscoLista.length;
    document.getElementById("kpi-atrasadas").textContent = atrasadasLista.length;
    document.getElementById("kpi-entregues").textContent = entreguesLista.length;

    const corTexto = cssVar("--text-2") || "#8b8fb8";
    const corGrade = cssVar("--border") || "rgba(255,255,255,0.06)";

    const contagem = {};
    STATUS_PROJETO.forEach((s) => (contagem[s] = 0));
    projetosNoEscopo.forEach((p) => contagem[p.status]++);
    const ctx = document.getElementById("chart-status-projetos");
    if (state.chartStatus) state.chartStatus.destroy();
    state.chartStatus = new Chart(ctx, {
      type: "bar",
      data: {
        labels: STATUS_PROJETO.map(label),
        datasets: [{ data: STATUS_PROJETO.map((s) => contagem[s]), backgroundColor: ["#a855f7", "#8b8fb8", "#34e9ff", "#ffd23e", "#3ef7a6", "#ff5c72"], borderRadius: 6 }],
      },
      options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: corTexto } }, y: { ticks: { color: corTexto, precision: 0 }, grid: { color: corGrade } } } },
    });

    // Três recortes por área do stakeholder: em andamento, em atraso, e
    // concluídas — cada entrega "pertence" às áreas dos stakeholders
    // cadastrados no projeto dela (um projeto com mais de uma área
    // interessada conta a entrega pra cada uma).
    let qStake = sb.from("stakeholders").select("projeto_id,cargo");
    if (filtroProjeto) qStake = qStake.eq("projeto_id", filtroProjeto);
    const { data: stakeAreas } = await qStake;
    const areasPorProjeto = {};
    (stakeAreas || []).forEach((s) => {
      const area = (s.cargo || "Sem área definida").trim() || "Sem área definida";
      (areasPorProjeto[s.projeto_id] ??= new Set()).add(area);
    });
    renderPizzaPorArea("chart-em-andamento", "chartAndamento", entregas.filter((e) => e.status === "em_andamento"), areasPorProjeto, corTexto);
    renderPizzaPorArea("chart-em-atraso", "chartAtraso", entregas.filter((e) => e.situacao_calculada === "atrasado"), areasPorProjeto, corTexto);
    renderPizzaPorArea("chart-concluidas", "chartConcluidas", entregas.filter((e) => e.status === "concluido"), areasPorProjeto, corTexto);

    const atencao = entregas.filter((e) => ["atrasado", "em_risco"].includes(e.situacao_calculada)).sort((a, b) => a.data_prazo.localeCompare(b.data_prazo)).slice(0, 12);
    const tbody = document.querySelector("#table-atencao tbody");
    tbody.innerHTML = atencao.length ? atencao.map((e) => `
      <tr><td>${esc(e.projetos?.nome)}</td><td>${esc(e.titulo)}</td><td>${fmtDate(e.data_prazo)}</td><td>${badge(e.situacao_calculada)}</td><td>${esc(e.perfis?.nome || "-")}</td></tr>
    `).join("") : `<tr><td colspan="5" class="empty-state">Nenhuma entrega atrasada ou em risco agora. 🎉</td></tr>`;
  } finally {
    setLoading(false);
  }
}

// ==== PROJETOS ====
function renderProjectsGrid() {
  const busca = (document.getElementById("proj-busca").value || "").toLowerCase();
  const filtroStatus = document.getElementById("proj-filtro-status").value;
  const grid = document.getElementById("projects-grid");
  const datalist = document.getElementById("proj-busca-lista");
  if (datalist) datalist.innerHTML = state.projetos.map((p) => `<option value="${esc(p.nome)}"></option>`).join("");
  const lista = state.projetos.filter((p) => (!filtroStatus || p.status === filtroStatus) && (!busca || p.nome.toLowerCase().includes(busca)));
  grid.innerHTML = lista.length ? lista.map((p) => `
    <div class="project-card" data-id="${p.id}">
      <div class="stripe" style="background:${p.cor || "#7c3aed"}"></div>
      <div class="p-name">${esc(p.nome)}</div>
      <div class="p-desc">${esc(p.descricao || "Sem descrição")}</div>
      <div class="p-progress"><div class="p-progress-fill" style="width:${p._progresso ?? 0}%"></div></div>
      <div class="p-meta">
        ${badge(p.status)}
        <span class="small muted">${p.data_fim_prevista ? fmtDate(p.data_fim_prevista) : "sem prazo"}</span>
      </div>
    </div>`).join("") : `<div class="empty-state"><div class="big-ic">▣</div>Nenhum projeto encontrado.</div>`;
  grid.querySelectorAll(".project-card").forEach((el) => (el.onclick = () => openProjetoForm(lista.find((p) => p.id === el.dataset.id))));
}
async function computeProgress() {
  const { data } = await sb.from("entregas").select("projeto_id,status");
  const byProj = {};
  (data ?? []).forEach((e) => {
    byProj[e.projeto_id] ??= { total: 0, done: 0 };
    byProj[e.projeto_id].total++;
    if (e.status === "concluido") byProj[e.projeto_id].done++;
  });
  state.projetos.forEach((p) => {
    const c = byProj[p.id];
    p._progresso = c && c.total ? Math.round((c.done / c.total) * 100) : 0;
  });
}
async function loadProjetos() {
  setLoading(true);
  try {
    await refreshBase();
    await computeProgress();
    renderProjectsGrid();
  } finally {
    setLoading(false);
  }
}
function openProjetoForm(projeto) {
  const fields = [
    { name: "nome", label: "Nome do projeto", type: "text", required: true },
    { name: "descricao", label: "Descrição", type: "textarea" },
    { name: "status", label: "Status", type: "select", half: true, default: "iniciacao", options: STATUS_PROJETO.map((s) => ({ value: s, label: label(s) })) },
    { name: "prioridade", label: "Prioridade", type: "select", half: true, options: PRIORIDADES.map((s) => ({ value: s, label: label(s) })) },
    { name: "data_inicio", label: "Início", type: "date", half: true },
    { name: "data_fim_prevista", label: "Prazo final previsto", type: "date", half: true },
    { name: "responsavel_id", label: "Responsável", type: "select", half: true, placeholder: "Sem responsável", options: state.perfis.map((p) => ({ value: p.id, label: p.nome })) },
    { name: "cor", label: "Cor (identificação visual)", type: "text", half: true, default: "#7c3aed" },
  ];
  openFormModal({
    title: projeto ? "Editar projeto" : "Novo projeto",
    fields, values: projeto,
    deleteBtn: projeto && isAdmin() ? {
      label: "Excluir",
      onClick: async () => {
        if (!(await confirmDialog(`Excluir o projeto "${projeto.nome}" e tudo relacionado a ele? Isso não pode ser desfeito.`))) return;
        await sb.from("projetos").delete().eq("id", projeto.id);
        closeModal(); toast("Projeto excluído."); loadProjetos();
      },
    } : null,
    onSubmit: async (data) => {
      if (projeto) {
        const { error } = await sb.from("projetos").update(data).eq("id", projeto.id);
        if (error) throw error;
        toast("Projeto atualizado.");
      } else {
        const { error } = await sb.from("projetos").insert({ ...data, criado_por: state.user.id });
        if (error) throw error;
        toast("Projeto criado.");
      }
      loadProjetos();
    },
  });
}

// ==== ENTREGAS & PRAZOS ====
async function fillProjectSelects() {
  const html = `<option value="">Todos os projetos</option>` + selectOptions(state.projetos, "id", "nome");
  ["ent-filtro-projeto", "anex-filtro-projeto", "stake-filtro-projeto", "report-projeto", "chk-filtro-projeto"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { const cur = el.value; el.innerHTML = id === "anex-filtro-projeto" || id === "report-projeto" ? `<option value="">Selecione o projeto...</option>` + selectOptions(state.projetos, "id", "nome") : html; el.value = cur; }
  });
  const kanSel = document.getElementById("kan-filtro-projeto");
  const curK = kanSel.value;
  kanSel.innerHTML = `<option value="">Selecione um projeto...</option>` + selectOptions(state.projetos, "id", "nome");
  kanSel.value = curK;
}
async function loadEntregas() {
  setLoading(true);
  try {
    await refreshBase();
    await fillProjectSelects();
    await renderEntregasTable();
  } finally {
    setLoading(false);
  }
}
async function renderEntregasTable() {
  const filtroProj = document.getElementById("ent-filtro-projeto").value;
  const filtroSit = document.getElementById("ent-filtro-situacao").value;
  let q = sb.from("v_entregas").select("*, perfis:responsavel_id(nome)").order("data_prazo");
  if (filtroProj) q = q.eq("projeto_id", filtroProj);
  if (filtroSit) q = q.eq("situacao_calculada", filtroSit);
  const { data, error } = await q;
  if (error) return toast(error.message, "err");
  const tbody = document.querySelector("#table-entregas tbody");
  tbody.innerHTML = data.length ? data.map((e) => `
    <tr data-id="${e.id}">
      <td>${esc(projetoNome(e.projeto_id))}</td>
      <td>${priorityDot(e.prioridade)}${esc(e.titulo)} ${e.silenciar_notificacoes ? '<span title="Notificações silenciadas" class="small muted">🔇</span>' : ""}</td>
      <td>${label(e.tipo)}</td>
      <td>${fmtDate(e.data_prazo)}</td>
      <td>${e.data_conclusao ? fmtDate(e.data_conclusao) : "-"}</td>
      <td>${badge(e.situacao_calculada)}</td>
      <td>${badge(e.status)}</td>
      <td>${esc(e.perfis?.nome || "-")}</td>
      <td class="small muted">clique para editar</td>
    </tr>`).join("") : `<tr><td colspan="9" class="empty-state">Nenhuma entrega encontrada com esse filtro.</td></tr>`;
  tbody.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => openEntregaForm(data.find((e) => e.id === tr.dataset.id))));
}
async function openEntregaForm(entrega, projetoIdPreset) {
  let infoHtml = "";
  if (entrega) {
    const { data: tarefasLigadas } = await sb.from("tarefas").select("titulo,status").eq("entrega_id", entrega.id);
    if (tarefasLigadas?.length) {
      const done = tarefasLigadas.filter((t) => t.status === "concluido").length;
      const pct = Math.round((done / tarefasLigadas.length) * 100);
      infoHtml = `
        <div class="card" style="padding:14px 16px;margin-bottom:16px;background:rgba(168,85,247,0.06);">
          <div class="small" style="margin-bottom:8px;"><b>${done} de ${tarefasLigadas.length} tarefas do Kanban concluídas</b> (${pct}%) — isto é só informativo, não altera o status da entrega automaticamente.</div>
          <div class="p-progress" style="margin:0;"><div class="p-progress-fill" style="width:${pct}%"></div></div>
        </div>`;
    } else {
      infoHtml = `<div class="small muted" style="margin-bottom:16px;">Nenhuma tarefa do Kanban vinculada a esta entrega ainda.</div>`;
    }
  }
  const stakeholdersVinculadosIds = entrega
    ? new Set((await sb.from("entrega_stakeholders").select("stakeholder_id").eq("entrega_id", entrega.id)).data?.map((v) => v.stakeholder_id) ?? [])
    : new Set();
  const stakeholdersHtml = `
    <div class="card" style="padding:14px 16px;margin:16px 0 0;">
      <div class="small" style="font-weight:700;margin-bottom:4px;">Quem deve ser avisado sobre esta entrega (sininho + e-mail)</div>
      <div class="small muted" style="margin-bottom:10px;">Se não marcar ninguém, todos os stakeholders do projeto continuam recebendo alerta dela — normal.</div>
      <div id="entrega-stakeholders-lista" class="small muted">Selecione um projeto primeiro...</div>
    </div>`;
  const belowFormHtml = (entrega ? await buildComentariosHtml("entrega_id", entrega.id) : "") + stakeholdersHtml;
  const fields = [
    { name: "projeto_id", label: "Projeto", type: "select", required: true, options: state.projetos.map((p) => ({ value: p.id, label: p.nome })), default: projetoIdPreset },
    { name: "titulo", label: "Título", type: "text", required: true },
    { name: "descricao", label: "Descrição", type: "textarea" },
    { name: "observacoes", label: "Observações (o que será realizado nessa etapa)", type: "textarea" },
    { name: "tipo", label: "Tipo", type: "select", half: true, options: [{ value: "entrega", label: "Entrega" }, { value: "marco", label: "Marco" }] },
    { name: "prioridade", label: "Prioridade", type: "select", half: true, options: PRIORIDADES.map((s) => ({ value: s, label: label(s) })) },
    { name: "data_prazo", label: "Prazo previsto", type: "date", half: true, required: true },
    { name: "data_conclusao", label: "Prazo real (data em que foi/será concluída)", type: "date", half: true },
    { name: "status", label: "Status", type: "select", half: true, options: STATUS_ENTREGA.map((s) => ({ value: s, label: label(s) })) },
    { name: "responsavel_id", label: "Responsável", type: "select", half: true, placeholder: "Sem responsável", options: state.perfis.map((p) => ({ value: p.id, label: p.nome })) },
    { name: "silenciar_notificacoes", label: "Silenciar notificações desta entrega", type: "checkbox", half: true },
  ];
  async function carregarStakeholdersDoProjeto(projetoId) {
    const container = document.getElementById("entrega-stakeholders-lista");
    if (!projetoId) { container.innerHTML = "Selecione um projeto primeiro..."; return; }
    const { data: stakes } = await sb.from("stakeholders").select("id,nome,email").eq("projeto_id", projetoId).eq("ativo", true).order("nome");
    container.innerHTML = stakes?.length
      ? stakes.map((s) => `
        <label class="flex gap-8" style="align-items:center;padding:4px 0;font-weight:400;">
          <input type="checkbox" class="chk-entrega-stakeholder" value="${s.id}" ${stakeholdersVinculadosIds.has(s.id) ? "checked" : ""} />
          ${esc(s.nome)} <span class="muted">(${esc(s.email)})</span>
        </label>`).join("")
      : "Nenhum stakeholder cadastrado neste projeto ainda.";
  }
  openFormModal({
    title: entrega ? "Editar entrega" : "Nova entrega",
    fields, values: entrega, infoHtml, belowFormHtml,
    onExtraMount: () => {
      wireComentarioInput({
        coluna: "entrega_id", valorId: entrega?.id, projetoId: entrega?.projeto_id || projetoIdPreset,
        onAdded: () => { closeModal(); openEntregaForm(entrega, projetoIdPreset); },
      });
      const selProjeto = document.querySelector('#generic-form [name="projeto_id"]');
      carregarStakeholdersDoProjeto(selProjeto.value);
      selProjeto.onchange = () => carregarStakeholdersDoProjeto(selProjeto.value);
    },
    deleteBtn: entrega && canEditItem(entrega) ? {
      label: "Excluir",
      onClick: async () => {
        if (!(await confirmDialog(`Excluir a entrega "${entrega.titulo}"?`))) return;
        await sb.from("entregas").delete().eq("id", entrega.id);
        closeModal(); toast("Entrega excluída."); renderEntregasTable(); atualizarContadorAlertas();
      },
    } : null,
    onSubmit: async (data) => {
      if (data.status === "concluido" && !data.data_conclusao) data.data_conclusao = todayISO();
      const idsSelecionados = Array.from(document.querySelectorAll(".chk-entrega-stakeholder:checked")).map((el) => el.value);
      let entregaId = entrega?.id;
      if (entrega) {
        const { error } = await sb.from("entregas").update(data).eq("id", entrega.id);
        if (error) throw error;
        toast("Entrega atualizada.");
      } else {
        const { data: nova, error } = await sb.from("entregas").insert(data).select().single();
        if (error) throw error;
        entregaId = nova.id;
        toast("Entrega criada.");
      }
      await sb.from("entrega_stakeholders").delete().eq("entrega_id", entregaId);
      if (idsSelecionados.length) {
        await sb.from("entrega_stakeholders").insert(idsSelecionados.map((stakeholder_id) => ({ entrega_id: entregaId, stakeholder_id })));
      }
      renderEntregasTable();
      if (state.currentTab === "visao-geral") loadVisaoGeral();
      atualizarContadorAlertas();
    },
  });
}

// ==== SPRINTS / KANBAN ====
function switchKanbanSubtab(nome) {
  document.querySelectorAll('#tab-kanban .subtab-item').forEach((el) => el.classList.toggle("active", el.dataset.subtab === nome));
  document.getElementById("subtab-sprints").classList.toggle("hidden", nome !== "sprints");
  document.getElementById("subtab-board").classList.toggle("hidden", nome !== "board");
}
async function loadKanban() {
  await refreshBase();
  await fillProjectSelects();
  const projSel = document.getElementById("kan-filtro-projeto");
  projSel.onchange = () => renderKanbanSprints();
  document.getElementById("kan-filtro-sprint").onchange = () => renderKanban();
  document.getElementById("btn-nova-sprint").onclick = () => openSprintForm(projSel.value);
  document.getElementById("btn-nova-tarefa").onclick = () => openTarefaForm(null, projSel.value, document.getElementById("kan-filtro-sprint").value);
  document.querySelectorAll('#tab-kanban .subtab-item').forEach((el) => (el.onclick = () => switchKanbanSubtab(el.dataset.subtab)));
  switchKanbanSubtab("sprints");
  if (projSel.value) await renderKanbanSprints();
  else STATUS_TAREFA.forEach((s) => (document.getElementById(`kcol-${s}`).innerHTML = ""));
}
// Texto de prazo de uma sprint: quantos dias faltam, se termina hoje, se já
// passou do fim sem ter sido concluída, ou se já foi concluída.
function sprintPrazoTexto(sprint, hoje) {
  if (sprint.status === "concluido") return { texto: "Concluída", atrasada: false };
  if (sprint.data_fim < hoje) return { texto: "Atrasada", atrasada: true };
  const dias = Math.round((new Date(sprint.data_fim) - new Date(hoje)) / 86400000);
  if (dias === 0) return { texto: "Termina hoje", atrasada: false };
  return { texto: `${dias} dia${dias === 1 ? "" : "s"} restante${dias === 1 ? "" : "s"}`, atrasada: false };
}
async function renderKanbanSprints() {
  const projetoId = document.getElementById("kan-filtro-projeto").value;
  const sprintSel = document.getElementById("kan-filtro-sprint");
  const listaEl = document.getElementById("kanban-sprints-lista");
  if (!projetoId) { sprintSel.innerHTML = `<option value="">Todas as tarefas</option>`; listaEl.innerHTML = ""; return renderKanban(); }
  const [{ data: sprints, error }, { data: tarefasProjeto }] = await Promise.all([
    sb.from("sprints").select("*").eq("projeto_id", projetoId).order("data_inicio", { ascending: true }),
    sb.from("tarefas").select("sprint_id,status").eq("projeto_id", projetoId),
  ]);
  if (error) return toast(error.message, "err");
  sprintSel.innerHTML = `<option value="">Todas as tarefas do projeto</option>` + sprints.map((s) => `<option value="${s.id}">${esc(s.nome)} (${label(s.status)})</option>`).join("");

  const hoje = todayISO();
  listaEl.innerHTML = sprints.length ? sprints.map((s) => {
    const tarefasDaSprint = (tarefasProjeto || []).filter((t) => t.sprint_id === s.id);
    const total = tarefasDaSprint.length;
    const feitas = tarefasDaSprint.filter((t) => t.status === "concluido").length;
    const pct = total ? Math.round((feitas / total) * 100) : 0;
    const prazo = sprintPrazoTexto(s, hoje);
    return `
    <div class="sprint-card ${s.status === "ativo" ? "sprint-card-ativa" : ""}" data-id="${s.id}">
      <div class="sprint-nome">${esc(s.nome)} ${badge(s.status)}</div>
      <div class="sprint-periodo">${fmtDate(s.data_inicio)} — ${fmtDate(s.data_fim)} · <span class="${prazo.atrasada ? "sprint-atrasada" : ""}">${prazo.texto}</span></div>
      <div class="p-progress"><div class="p-progress-fill" style="width:${pct}%"></div></div>
      <div class="sprint-progresso-texto">${feitas} de ${total} tarefa(s) concluída(s) (${pct}%)</div>
      <div class="sprint-objetivo">${esc(s.objetivo || "Sem objetivo descrito.")}</div>
    </div>`;
  }).join("") : `<div class="empty-state">Nenhuma sprint criada ainda.</div>`;
  listaEl.querySelectorAll(".sprint-card").forEach((el) => (el.onclick = () => openSprintForm(projetoId, sprints.find((s) => s.id === el.dataset.id))));
  await renderKanban();
}
// Renumera a ordem de todos os cartões de uma coluna, na ordem em que estão
// no DOM (chamado depois de qualquer arrastar-e-soltar, entre colunas ou
// dentro da mesma coluna). Sem limite de quantos cartões — a coluna aceita
// quantas tarefas o projeto tiver.
async function persistOrdemColuna(colEl) {
  const ids = Array.from(colEl.children).map((el) => el.dataset.id);
  const resultados = await Promise.all(ids.map((id, ordem) => sb.from("tarefas").update({ ordem }).eq("id", id)));
  const comErro = resultados.find((r) => r.error);
  return { error: comErro?.error?.message };
}
async function renderKanban() {
  const projetoId = document.getElementById("kan-filtro-projeto").value;
  STATUS_TAREFA.forEach((s) => (document.getElementById(`kcol-${s}`).innerHTML = ""));
  if (!projetoId) return;
  let q = sb.from("tarefas").select("*, perfis:responsavel_id(nome)").eq("projeto_id", projetoId).order("ordem");
  const sprintId = document.getElementById("kan-filtro-sprint").value;
  if (sprintId) q = q.eq("sprint_id", sprintId);
  const { data, error } = await q;
  if (error) return toast(error.message, "err");
  STATUS_TAREFA.forEach((status) => {
    const itens = data.filter((t) => t.status === status);
    document.querySelector(`.count[data-count="${status}"]`).textContent = itens.length;
    const col = document.getElementById(`kcol-${status}`);
    col.innerHTML = itens.map((t) => `
      <div class="kanban-card" draggable="true" data-id="${t.id}">
        <div class="kc-title">${priorityDot(t.prioridade)}${esc(t.titulo)}</div>
        <div class="kc-meta"><span>${esc(t.perfis?.nome || "-")}</span><span>${t.data_prazo ? fmtDate(t.data_prazo) : ""}</span></div>
      </div>`).join("");
    col.querySelectorAll(".kanban-card").forEach((el) => (el.onclick = () => openTarefaForm(data.find((t) => t.id === el.dataset.id))));
    if (col._sortable) col._sortable.destroy();
    col._sortable = Sortable.create(col, {
      group: "kanban", animation: 150, ghostClass: "dragging",
      // forceFallback troca o "drag nativo" do navegador (que em alguns
      // ambientes falha silenciosamente ao soltar num alvo já com itens)
      // por um arrastar controlado via mouse — mais confiável.
      forceFallback: true, fallbackTolerance: 3,
      // onAdd: cartão veio de OUTRA coluna (mudou de status).
      onAdd: async (evt) => {
        const id = evt.item.dataset.id;
        const novoStatus = evt.to.closest(".kanban-col").dataset.status;
        const tarefaMovida = data.find((t) => t.id === id);
        const { error } = await sb.from("tarefas").update({ status: novoStatus }).eq("id", id);
        if (error) { toast(error.message, "err"); renderKanban(); return; }
        await persistOrdemColuna(evt.to);
        await renderKanban(); // recontagem das colunas
        if (tarefaMovida?.entrega_id && novoStatus === "concluido") await sugerirConcluirEntrega(tarefaMovida.entrega_id);
      },
      // onUpdate: só reordenou dentro da MESMA coluna (não mudou de status).
      onUpdate: async (evt) => {
        const { error } = await persistOrdemColuna(evt.to);
        if (error) toast(error, "err");
      },
    });
  });
}
function openSprintForm(projetoId, sprint) {
  if (!projetoId) return toast("Selecione um projeto primeiro.", "err");
  const fields = [
    { name: "nome", label: "Nome da sprint", type: "text", required: true },
    { name: "objetivo", label: "Objetivo", type: "textarea" },
    { name: "data_inicio", label: "Início", type: "date", half: true, required: true },
    { name: "data_fim", label: "Fim", type: "date", half: true, required: true },
    { name: "status", label: "Status", type: "select", options: [{ value: "planejado", label: "Planejado" }, { value: "ativo", label: "Ativo" }, { value: "concluido", label: "Concluído" }] },
  ];
  openFormModal({
    title: sprint ? "Editar sprint" : "Nova sprint", fields, values: sprint,
    deleteBtn: sprint ? {
      label: "Excluir",
      onClick: async () => {
        if (!(await confirmDialog(`Excluir a sprint "${sprint.nome}"? As tarefas ligadas a ela ficam soltas, sem sprint.`))) return;
        await sb.from("sprints").delete().eq("id", sprint.id);
        closeModal(); toast("Sprint excluída."); renderKanbanSprints();
      },
    } : null,
    onSubmit: async (data) => {
      if (sprint) {
        const { error } = await sb.from("sprints").update(data).eq("id", sprint.id);
        if (error) throw error;
        toast("Sprint atualizada.");
      } else {
        const { error } = await sb.from("sprints").insert({ ...data, projeto_id: projetoId });
        if (error) throw error;
        toast("Sprint criada.");
      }
      renderKanbanSprints();
    },
  });
}
async function openTarefaForm(tarefa, projetoId, sprintId) {
  const projId = tarefa?.projeto_id || projetoId;
  const [{ data: entregasDoProjeto }, { data: sprintsDoProjeto }] = await Promise.all([
    sb.from("entregas").select("id,titulo").eq("projeto_id", projId).order("data_prazo"),
    sb.from("sprints").select("id,nome,status").eq("projeto_id", projId).order("data_inicio", { ascending: false }),
  ]);
  const belowFormHtml = tarefa ? await buildComentariosHtml("tarefa_id", tarefa.id) : "";
  const fields = [
    { name: "titulo", label: "Título", type: "text", required: true },
    { name: "descricao", label: "Descrição", type: "textarea" },
    { name: "entrega_id", label: "Etapa/entrega relacionada (opcional)", type: "select", placeholder: "Nenhuma — tarefa solta", options: (entregasDoProjeto || []).map((e) => ({ value: e.id, label: e.titulo })) },
    { name: "sprint_id", label: "Sprint (opcional)", type: "select", placeholder: "Nenhuma — tarefa solta", default: sprintId || "", options: (sprintsDoProjeto || []).map((s) => ({ value: s.id, label: `${s.nome} (${label(s.status)})` })) },
    { name: "status", label: "Status", type: "select", half: true, options: STATUS_TAREFA.map((s) => ({ value: s, label: label(s) })) },
    { name: "prioridade", label: "Prioridade", type: "select", half: true, options: PRIORIDADES.map((s) => ({ value: s, label: label(s) })) },
    { name: "data_prazo", label: "Prazo (opcional)", type: "date", half: true },
    { name: "responsavel_id", label: "Responsável", type: "select", half: true, placeholder: "Sem responsável", options: state.perfis.map((p) => ({ value: p.id, label: p.nome })) },
  ];
  openFormModal({
    title: tarefa ? "Editar tarefa" : "Nova tarefa",
    fields, values: tarefa, belowFormHtml,
    onExtraMount: () => wireComentarioInput({
      coluna: "tarefa_id", valorId: tarefa?.id, projetoId: projId,
      onAdded: () => { closeModal(); openTarefaForm(tarefa, projetoId, sprintId); },
    }),
    deleteBtn: tarefa ? { label: "Excluir", onClick: async () => {
      if (!(await confirmDialog("Excluir esta tarefa?"))) return;
      await sb.from("tarefas").delete().eq("id", tarefa.id);
      closeModal(); toast("Tarefa excluída."); renderKanban();
    } } : null,
    onSubmit: async (data) => {
      if (tarefa) {
        const { error } = await sb.from("tarefas").update(data).eq("id", tarefa.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("tarefas").insert({ ...data, projeto_id: projetoId });
        if (error) throw error;
      }
      toast("Tarefa salva."); renderKanban();
      if (data.entrega_id && data.status === "concluido") await sugerirConcluirEntrega(data.entrega_id);
    },
  });
}

// Se todas as tarefas ligadas a uma entrega já estiverem concluídas, pergunta
// se ela também deve ser marcada como concluída — nunca faz isso sozinho.
async function sugerirConcluirEntrega(entregaId) {
  const { data: ligadas } = await sb.from("tarefas").select("status").eq("entrega_id", entregaId);
  if (!ligadas?.length || ligadas.some((t) => t.status !== "concluido")) return;
  const { data: entrega } = await sb.from("entregas").select("*").eq("id", entregaId).single();
  if (!entrega || entrega.status === "concluido") return;
  const quer = await confirmDialog(`Todas as ${ligadas.length} tarefa(s) ligadas à entrega "${entrega.titulo}" foram concluídas. Marcar essa entrega como concluída também?`);
  if (!quer) return;
  const { error } = await sb.from("entregas").update({ status: "concluido", data_conclusao: entrega.data_conclusao || todayISO() }).eq("id", entregaId);
  if (error) return toast(error.message, "err");
  toast("Entrega marcada como concluída.");
  if (state.currentTab === "entregas") renderEntregasTable();
  if (state.currentTab === "visao-geral") loadVisaoGeral();
  atualizarContadorAlertas();
}

// ==== CALENDÁRIO ====
async function loadCalendario() {
  const { data: entregas } = await sb.from("v_entregas").select("*, projetos(nome,cor)");
  const eventos = (entregas ?? []).map((e) => ({
    title: `${e.projetos?.nome ?? ""} — ${e.titulo}`,
    start: e.data_prazo,
    color: e.situacao_calculada === "atrasado" ? "#ff5c72" : e.situacao_calculada === "em_risco" ? "#ffd23e" : (e.projetos?.cor || "#34e9ff"),
  }));
  const el = document.getElementById("calendario-el");
  if (state.calendar) state.calendar.destroy();
  state.calendar = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth", height: 680, locale: "pt-br",
    headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek" },
    events: eventos,
  });
  state.calendar.render();
}

// ==== CHECKPOINTS (resumo de reuniões, manual ou via automação do Teams) ====
async function loadCheckpoints() {
  await refreshBase();
  await fillProjectSelects();
  document.getElementById("chk-filtro-projeto").onchange = renderCheckpoints;
  document.getElementById("btn-novo-checkpoint").onclick = () => openCheckpointForm(document.getElementById("chk-filtro-projeto").value || null);
  await renderCheckpoints();
}
async function renderCheckpoints() {
  const filtroProjeto = document.getElementById("chk-filtro-projeto").value;
  let q = sb.from("checkpoints").select("*").order("data_reuniao", { ascending: false });
  if (filtroProjeto) q = q.eq("projeto_id", filtroProjeto);
  const { data, error } = await q;
  if (error) return toast(error.message, "err");
  const wrap = document.getElementById("checkpoints-lista");
  if (!data.length) { wrap.innerHTML = `<div class="empty-state"><div class="big-ic">✓</div>Nenhum checkpoint registrado ainda.</div>`; return; }
  const listaHtml = (texto) => {
    if (!texto) return "-";
    return texto;
  };
  wrap.innerHTML = data.map((c) => `
    <div class="checkpoint-card" data-id="${c.id}" style="cursor:pointer;">
      <div class="checkpoint-head">
        <div>
          <div class="cp-title">${esc(projetoNome(c.projeto_id))}${c.titulo_reuniao ? " — " + esc(c.titulo_reuniao) : ""}</div>
          <div class="cp-meta">${fmtDate(c.data_reuniao)}${c.participantes ? " · " + esc(c.participantes) : ""}</div>
        </div>
        <div class="flex gap-8" style="align-items:center;">
          <span class="checkpoint-origem ${c.origem}">${c.origem === "teams_auto" ? "Automático (Teams)" : "Manual"}</span>
          <button class="btn btn-ghost btn-sm" data-action="excluir">Excluir</button>
        </div>
      </div>
      <div class="checkpoint-grid">
        <div><h4>Pontos principais</h4><p>${esc(listaHtml(c.pontos_principais))}</p></div>
        <div><h4>Decisões</h4><p>${esc(listaHtml(c.decisoes))}</p></div>
        <div><h4>Riscos</h4><p>${esc(listaHtml(c.riscos))}</p></div>
        <div><h4>Próximos passos</h4>${
          c.proximos_passos?.length
            ? `<ul>${c.proximos_passos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
            : "<p>-</p>"
        }</div>
      </div>
    </div>`).join("");
  wrap.querySelectorAll(".checkpoint-card").forEach((card) => {
    card.onclick = () => openCheckpointForm(null, data.find((c) => c.id === card.dataset.id));
  });
  wrap.querySelectorAll('[data-action="excluir"]').forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const card = btn.closest(".checkpoint-card");
      if (!(await confirmDialog("Excluir este checkpoint? As tarefas já criadas a partir dele NÃO são excluídas."))) return;
      await sb.from("checkpoints").delete().eq("id", card.dataset.id);
      toast("Checkpoint excluído.");
      renderCheckpoints();
    };
  });
}
// Cria uma tarefa no Backlog pra cada "próximo passo" — mas, se já existir uma
// tarefa ABERTA (não concluída/cancelada) com o mesmo título nesse projeto,
// não duplica: só registra um comentário nela referenciando esse checkpoint.
// Evita o caso de um mesmo pendente ser citado em reuniões seguidas e virar
// vários cartões iguais no Kanban.
async function criarTarefasSemDuplicar(projetoId, passos, checkpointId, contextoTexto) {
  let criadas = 0, jaExistentes = 0;
  if (!passos?.length) return { criadas, jaExistentes };
  const { data: abertas } = await sb.from("tarefas").select("id,titulo").eq("projeto_id", projetoId).not("status", "in", "(concluido,cancelado)");
  for (const passoOriginal of passos) {
    const passo = String(passoOriginal).trim();
    if (!passo) continue;
    const existente = (abertas || []).find((t) => t.titulo.trim().toLowerCase() === passo.toLowerCase());
    if (existente) {
      await sb.from("comentarios").insert({ projeto_id: projetoId, tarefa_id: existente.id, autor_id: state.user?.id ?? null, texto: `Mencionado novamente: ${contextoTexto}` });
      jaExistentes++;
    } else {
      await sb.from("tarefas").insert({
        projeto_id: projetoId, titulo: passo, status: "backlog", prioridade: "media",
        descricao: `Gerada automaticamente do checkpoint — ${contextoTexto}.`,
        origem_checkpoint_id: checkpointId,
      });
      criadas++;
    }
  }
  return { criadas, jaExistentes };
}
function openCheckpointForm(projetoIdPreset, checkpoint) {
  const values = checkpoint ? { ...checkpoint, proximos_passos_texto: (checkpoint.proximos_passos || []).join("\n") } : null;
  const fields = [
    { name: "projeto_id", label: "Projeto", type: "select", required: true, options: state.projetos.map((p) => ({ value: p.id, label: p.nome })), default: projetoIdPreset },
    { name: "titulo_reuniao", label: "Título da reunião", type: "text", half: true },
    { name: "data_reuniao", label: "Data da reunião", type: "date", half: true, required: true, default: todayISO() },
    { name: "participantes", label: "Participantes", type: "text" },
    { name: "pontos_principais", label: "Pontos principais", type: "textarea" },
    { name: "decisoes", label: "Decisões", type: "textarea" },
    { name: "riscos", label: "Riscos", type: "textarea" },
    { name: "proximos_passos_texto", label: "Próximos passos (1 por linha)" + (checkpoint ? "" : " — cada um vira uma tarefa no Backlog (sem duplicar as que já existem)"), type: "textarea" },
  ];
  openFormModal({
    title: checkpoint ? "Editar checkpoint" : "Novo checkpoint",
    fields, values,
    deleteBtn: checkpoint ? {
      label: "Excluir",
      onClick: async () => {
        if (!(await confirmDialog("Excluir este checkpoint? As tarefas já criadas a partir dele NÃO são excluídas."))) return;
        await sb.from("checkpoints").delete().eq("id", checkpoint.id);
        closeModal(); toast("Checkpoint excluído."); renderCheckpoints();
      },
    } : null,
    onSubmit: async (data) => {
      const proximos_passos = (data.proximos_passos_texto || "").split("\n").map((l) => l.trim()).filter(Boolean);
      delete data.proximos_passos_texto;
      if (checkpoint) {
        const { error } = await sb.from("checkpoints").update({ ...data, proximos_passos }).eq("id", checkpoint.id);
        if (error) throw error;
        toast("Checkpoint atualizado.");
      } else {
        const { data: novo, error } = await sb.from("checkpoints").insert({ ...data, origem: "manual", proximos_passos, criado_por: state.user.id }).select().single();
        if (error) throw error;
        const contexto = `checkpoint de ${data.data_reuniao}${data.titulo_reuniao ? ` — reunião: ${data.titulo_reuniao}` : ""}`;
        const { criadas, jaExistentes } = await criarTarefasSemDuplicar(data.projeto_id, proximos_passos, novo.id, contexto);
        toast(`Checkpoint criado. ${criadas} tarefa(s) nova(s) no Backlog${jaExistentes ? `, ${jaExistentes} já existente(s) atualizada(s) com comentário` : ""}.`);
      }
      renderCheckpoints();
    },
  });
}

// ==== ANEXOS ====
async function loadAnexos() {
  await refreshBase();
  await fillProjectSelects();
  document.getElementById("anex-filtro-projeto").onchange = renderAnexos;
  document.getElementById("attach-dropzone").onclick = () => document.getElementById("attach-input").click();
  document.getElementById("attach-input").onchange = (e) => handleUpload(e.target.files[0]);
  const dz = document.getElementById("attach-dropzone");
  ["dragover", "dragleave", "drop"].forEach((evt) => dz.addEventListener(evt, (e) => e.preventDefault()));
  dz.addEventListener("dragover", () => dz.classList.add("drag-over"));
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", (e) => { dz.classList.remove("drag-over"); handleUpload(e.dataTransfer.files[0]); });
  await renderAnexos();
}
async function handleUpload(file) {
  if (!file) return;
  const projetoId = document.getElementById("anex-filtro-projeto").value;
  if (!projetoId) return toast("Selecione um projeto antes de enviar o arquivo.", "err");
  setLoading(true);
  try {
    const path = `projetos/${projetoId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await sb.storage.from("anexos").upload(path, file);
    if (upErr) throw upErr;
    const { error } = await sb.from("anexos").insert({
      projeto_id: projetoId, nome_arquivo: file.name, storage_path: path,
      tipo_mime: file.type, tamanho_bytes: file.size, enviado_por: state.user.id,
    });
    if (error) throw error;
    toast("Arquivo enviado."); renderAnexos();
  } catch (e) { toast(e.message, "err"); } finally { setLoading(false); }
}
async function renderAnexos() {
  const projetoId = document.getElementById("anex-filtro-projeto").value;
  const grid = document.getElementById("attach-grid");
  if (!projetoId) { grid.innerHTML = `<div class="empty-state">Selecione um projeto para ver os anexos.</div>`; return; }
  const { data, error } = await sb.from("anexos").select("*").eq("projeto_id", projetoId).order("criado_em", { ascending: false });
  if (error) return toast(error.message, "err");
  grid.innerHTML = data.length ? data.map((a) => {
    const isImg = (a.tipo_mime || "").startsWith("image/");
    return `<div class="attach-item" data-id="${a.id}" data-path="${a.storage_path}">
      ${isImg ? `<img class="att-thumb" data-path="${a.storage_path}" alt="" />` : `<div class="att-ic">📄</div>`}
      <div class="att-name">${esc(a.nome_arquivo)}</div>
      <div class="flex gap-8" style="justify-content:center;">
        <button class="btn btn-ghost btn-sm" data-action="download">Abrir</button>
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" data-action="excluir">Excluir</button>` : ""}
      </div>
    </div>`;
  }).join("") : `<div class="empty-state"><div class="big-ic">▥</div>Nenhum anexo neste projeto ainda.</div>`;

  for (const img of grid.querySelectorAll("img.att-thumb")) {
    const { data: signed } = await sb.storage.from("anexos").createSignedUrl(img.dataset.path, 3600);
    if (signed) img.src = signed.signedUrl;
  }
  grid.querySelectorAll('[data-action="download"]').forEach((btn) => {
    btn.onclick = async () => {
      const path = btn.closest(".attach-item").dataset.path;
      const { data: signed } = await sb.storage.from("anexos").createSignedUrl(path, 300);
      if (signed) window.open(signed.signedUrl, "_blank");
    };
  });
  grid.querySelectorAll('[data-action="excluir"]').forEach((btn) => {
    btn.onclick = async () => {
      const item = btn.closest(".attach-item");
      if (!(await confirmDialog("Excluir este anexo?"))) return;
      await sb.storage.from("anexos").remove([item.dataset.path]);
      await sb.from("anexos").delete().eq("id", item.dataset.id);
      renderAnexos();
    };
  });
}

// ==== STAKEHOLDERS & COMUNICAÇÃO ====
async function loadStakeholders() {
  await refreshBase();
  await fillProjectSelects();
  await loadStakeholdersAllCache();
  document.getElementById("stake-filtro-projeto").onchange = renderStakeholdersTable;
  document.getElementById("btn-novo-stakeholder").onclick = () => openStakeholderForm(null, document.getElementById("stake-filtro-projeto").value);
  document.getElementById("btn-report-email").onclick = gerarReportCeo;
  document.getElementById("btn-report-xls").onclick = exportarReportXls;
  wireReportDestInput();
  renderReportDestChips();
  await renderStakeholdersTable();
  await renderNotificacoesLog();
}
async function loadStakeholdersAllCache() {
  const { data, error } = await sb.from("stakeholders").select("id,nome,email,projeto_id,observacoes").order("nome");
  if (error) return toast(error.message, "err");
  state.stakeholdersAll = data ?? [];
}

// ---- destinatários do Report do CEO: chips + preenchimento inteligente ----
function reportDestSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const jaAdicionados = new Set(state.reportDestinatarios.map((d) => d.email.toLowerCase()));
  return state.stakeholdersAll
    .filter((s) => !jaAdicionados.has(s.email.toLowerCase()))
    .filter((s) => s.nome.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    .slice(0, 8);
}
function addReportDest(item) {
  if (state.reportDestinatarios.some((d) => d.email.toLowerCase() === item.email.toLowerCase())) return;
  state.reportDestinatarios.push(item);
  renderReportDestChips();
}
function removeReportDest(email) {
  state.reportDestinatarios = state.reportDestinatarios.filter((d) => d.email !== email);
  renderReportDestChips();
}
function renderReportDestChips() {
  const wrap = document.getElementById("report-dest-chips-wrap");
  if (!wrap) return;
  wrap.innerHTML = state.reportDestinatarios.map((d) => `
    <span class="chip">${esc(d.nome || d.email)}<button type="button" class="chip-x" data-email="${esc(d.email)}">&times;</button></span>
  `).join("");
  wrap.querySelectorAll(".chip-x").forEach((btn) => (btn.onclick = () => removeReportDest(btn.dataset.email)));
}
function wireReportDestInput() {
  const input = document.getElementById("report-dest-input");
  const sugBox = document.getElementById("report-dest-suggestions");
  if (!input) return;
  const esconderSugestoes = () => { sugBox.classList.add("hidden"); sugBox.innerHTML = ""; };
  input.oninput = () => {
    const sugs = reportDestSuggestions(input.value);
    if (!sugs.length) return esconderSugestoes();
    sugBox.classList.remove("hidden");
    sugBox.innerHTML = sugs.map((s) => `
      <div class="chip-suggestion-item" data-email="${esc(s.email)}" data-nome="${esc(s.nome)}" data-sid="${s.id}">
        <span>${esc(s.nome)}</span><span class="muted small">${esc(s.email)}</span>
      </div>`).join("");
    sugBox.querySelectorAll(".chip-suggestion-item").forEach((el) => (el.onclick = () => {
      addReportDest({ email: el.dataset.email, nome: el.dataset.nome, stakeholder_id: el.dataset.sid });
      input.value = ""; esconderSugestoes();
    }));
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
      const match = state.stakeholdersAll.find((s) => s.email.toLowerCase() === v.toLowerCase());
      addReportDest(match ? { email: match.email, nome: match.nome, stakeholder_id: match.id } : { email: v, nome: v, stakeholder_id: null });
      input.value = ""; esconderSugestoes();
    } else if (e.key === "Escape") { esconderSugestoes(); }
  };
  document.addEventListener("click", (e) => { if (!e.target.closest("#report-dest-chips")) esconderSugestoes(); });
}
async function renderStakeholdersTable() {
  const projetoId = document.getElementById("stake-filtro-projeto").value;
  let q = sb.from("stakeholders").select("*").order("nome");
  if (projetoId) q = q.eq("projeto_id", projetoId);
  const { data, error } = await q;
  if (error) return toast(error.message, "err");
  const tbody = document.querySelector("#table-stakeholders tbody");
  tbody.innerHTML = data.length ? data.map((s) => `
    <tr data-id="${s.id}">
      <td>${esc(s.nome)}</td>
      <td>
        <span>${esc(s.email)}</span>
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px;margin-left:6px;" data-action="copiar-email-stakeholder" data-email="${esc(s.email)}" title="Copiar e-mail">📧</button>
      </td>
      <td>${esc(projetoNome(s.projeto_id))}</td>
      <td>${esc(s.cargo || "-")}</td>
      <td class="small" style="max-width:260px;white-space:normal;" title="${esc(s.observacoes || "")}">${esc(s.observacoes || "-")}</td>
      <td>${s.receber_digest_diario ? "Sim" : "Não"}</td>
      <td class="small muted">clique para editar</td>
    </tr>`).join("") : `<tr><td colspan="7" class="empty-state">Nenhum stakeholder cadastrado.</td></tr>`;
  tbody.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => openStakeholderForm(data.find((s) => s.id === tr.dataset.id))));
  tbody.querySelectorAll('[data-action="copiar-email-stakeholder"]').forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      try {
        await navigator.clipboard.writeText(btn.dataset.email);
        toast(`E-mail de ${btn.dataset.email} copiado!`);
      } catch {
        toast("Não consegui copiar — selecione o e-mail na tabela e copie manualmente (Ctrl+C).", "err");
      }
    };
  });
}
function openStakeholderForm(stakeholder, projetoIdPreset) {
  const fields = [
    { name: "projeto_id", label: "Projeto", type: "select", required: true, options: state.projetos.map((p) => ({ value: p.id, label: p.nome })), default: projetoIdPreset },
    { name: "nome", label: "Nome", type: "text", required: true, half: true },
    { name: "email", label: "E-mail", type: "text", required: true, half: true },
    { name: "cargo", label: "Cargo", type: "text", half: true },
    { name: "receber_digest_diario", label: "Recebe digest diário automático", type: "checkbox", half: true, default: true },
    { name: "observacoes", label: "O que este stakeholder precisa fazer / observações (aparece na tabela e no Report do CEO)", type: "textarea" },
  ];
  openFormModal({
    title: stakeholder ? "Editar stakeholder" : "Novo stakeholder",
    fields, values: stakeholder,
    deleteBtn: stakeholder ? { label: "Excluir", onClick: async () => {
      if (!(await confirmDialog(`Excluir "${stakeholder.nome}"?`))) return;
      await sb.from("stakeholders").delete().eq("id", stakeholder.id);
      closeModal(); toast("Stakeholder excluído."); renderStakeholdersTable();
    } } : null,
    onSubmit: async (data) => {
      if (stakeholder) { const { error } = await sb.from("stakeholders").update(data).eq("id", stakeholder.id); if (error) throw error; }
      else { const { error } = await sb.from("stakeholders").insert(data); if (error) throw error; }
      toast("Stakeholder salvo."); renderStakeholdersTable();
    },
  });
}
async function montarDadosReport() {
  const projetoId = document.getElementById("report-projeto").value;
  if (!projetoId) { toast("Selecione o projeto.", "err"); return null; }
  if (!state.reportDestinatarios.length) { toast("Adicione ao menos um destinatário.", "err"); return null; }
  const projeto = state.projetos.find((p) => p.id === projetoId);
  const { data: entregas, error } = await sb.from("v_entregas").select("*, perfis:responsavel_id(nome)").eq("projeto_id", projetoId).order("data_prazo");
  if (error) { toast(error.message, "err"); return null; }
  // observações de cada destinatário que é um stakeholder já cadastrado (ignora e-mails digitados na hora)
  const observacoesDestinatarios = state.reportDestinatarios
    .filter((d) => d.stakeholder_id)
    .map((d) => state.stakeholdersAll.find((s) => String(s.id) === String(d.stakeholder_id)))
    .filter((s) => s?.observacoes);
  return {
    projeto,
    destinatarios: state.reportDestinatarios,
    observacoesDestinatarios,
    concluidas: entregas.filter((e) => e.status === "concluido"),
    pendentesAtencao: entregas.filter((e) => ["atrasado", "em_risco"].includes(e.situacao_calculada)),
    proximoMarco: entregas.filter((e) => e.tipo === "marco" && e.status !== "concluido").sort((a, b) => a.data_prazo.localeCompare(b.data_prazo))[0],
    percConcluido: entregas.length ? Math.round((entregas.filter((e) => e.status === "concluido").length / entregas.length) * 100) : 0,
  };
}
async function gerarReportCeo() {
  const d = await montarDadosReport();
  if (!d) return;
  const linhaPendente = (e) => `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.titulo)}</td><td style="padding:8px;border-bottom:1px solid #eee;">${fmtDate(e.data_prazo)}</td><td style="padding:8px;border-bottom:1px solid #eee;">${label(e.situacao_calculada)}</td><td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.perfis?.nome || "-")}</td><td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.observacoes || "-")}</td></tr>`;
  const linhaConcluida = (e) => `<li>${esc(e.titulo)} — concluída em ${fmtDate(e.data_conclusao || e.atualizado_em)}</li>`;
  const statusGeral = d.pendentesAtencao.some((e) => e.situacao_calculada === "atrasado") ? "Crítico — há entregas atrasadas" : d.pendentesAtencao.length ? "Atenção — itens em risco" : "Saudável — no prazo";
  const html = `
    <div style="font-family:sans-serif;color:#222;">
      <h2>${esc(d.projeto.nome)} — Report Executivo</h2>
      <p><b>Status geral:</b> ${statusGeral} &nbsp; | &nbsp; <b>Concluído:</b> ${d.percConcluido}%</p>
      ${d.proximoMarco ? `<p><b>Próximo marco:</b> ${esc(d.proximoMarco.titulo)} — ${fmtDate(d.proximoMarco.data_prazo)}</p>` : ""}
      <h3>Pendências que exigem atenção</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Entrega</th><th style="padding:8px;text-align:left;">Prazo</th><th style="padding:8px;text-align:left;">Situação</th><th style="padding:8px;text-align:left;">Responsável</th><th style="padding:8px;text-align:left;">Observações</th></tr>
      ${d.pendentesAtencao.length ? d.pendentesAtencao.map(linhaPendente).join("") : `<tr><td colspan="5" style="padding:8px;">Nenhuma pendência crítica.</td></tr>`}</table>
      <h3>Já entregue</h3>
      <ul>${d.concluidas.length ? d.concluidas.map(linhaConcluida).join("") : "<li>Nada concluído ainda.</li>"}</ul>
      ${d.observacoesDestinatarios.length ? `<h3>Observações do stakeholder</h3>${d.observacoesDestinatarios.map((s) => `<p><b>${esc(s.nome)}:</b> ${esc(s.observacoes)}</p>`).join("")}` : ""}
    </div>`;
  const assunto = `Report executivo — ${d.projeto.nome}`;
  openModal({
    title: "Report do CEO — copiar e enviar pelo seu Outlook",
    bodyHtml: `
      <div class="card" style="padding:14px 16px;margin-bottom:16px;background:rgba(52,233,255,0.05);">
        <div class="small"><b>Para:</b> ${d.destinatarios.map((x) => esc(x.nome && x.nome !== x.email ? `${x.nome} <${x.email}>` : x.email)).join(", ")}</div>
      </div>
      <div class="field"><label>Assunto</label><input id="ceo-subject" value="${esc(assunto)}" /></div>
      <p class="small muted" style="margin:-4px 0 12px;">Clique em "Copiar conteúdo", abra um e-mail novo no Outlook pro destinatário acima e cole (Ctrl+V) — a formatação vem junto.</p>
      <div id="ceo-html-preview" style="border:1px solid var(--border);border-radius:10px;padding:14px;background:#fff;max-height:320px;overflow:auto;">${html}</div>`,
    footerHtml: `<button class="btn btn-ghost" id="ceo-cancel">Fechar</button><button class="btn btn-ghost" id="ceo-copy-email">📧 Copiar e-mail</button><button class="btn btn-ghost" id="ceo-outlook">✉ Abrir no Outlook</button><button class="btn btn-primary" id="ceo-copy">📋 Copiar conteúdo</button>`,
    onMount: () => {
      document.getElementById("ceo-cancel").onclick = closeModal;
      document.getElementById("ceo-copy-email").onclick = async () => {
        const listaEmails = d.destinatarios.map((x) => x.email).join("; ");
        try {
          await navigator.clipboard.writeText(listaEmails);
          toast(`E-mail${d.destinatarios.length > 1 ? "s" : ""} copiado${d.destinatarios.length > 1 ? "s" : ""}! Cole (Ctrl+V) no campo "Para" do Outlook.`);
        } catch {
          toast("Não consegui copiar automaticamente — selecione o texto do destinatário acima e copie (Ctrl+C).", "err");
        }
      };
      document.getElementById("ceo-outlook").onclick = () => {
        const paraLista = d.destinatarios.map((x) => encodeURIComponent(x.email)).join(",");
        const assuntoAtual = document.getElementById("ceo-subject").value;
        window.open(`mailto:${paraLista}?subject=${encodeURIComponent(assuntoAtual)}`, "_blank");
      };
      document.getElementById("ceo-copy").onclick = async () => {
        const ok = await copiarHtmlParaAreaTransferencia(document.getElementById("ceo-html-preview").innerHTML);
        if (ok) toast("Conteúdo copiado! Cole (Ctrl+V) no corpo do e-mail no Outlook.");
        else toast("Não consegui copiar automaticamente — selecione o texto acima manualmente e copie (Ctrl+C).", "err");
      };
    },
  });
}
// Copia HTML (com formatação) pra área de transferência, com fallback pra
// navegadores/contextos que não suportam a API moderna de clipboard.
async function copiarHtmlParaAreaTransferencia(html) {
  try {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([new DOMParser().parseFromString(html, "text/html").body.innerText], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    try {
      const temp = document.createElement("div");
      temp.contentEditable = "true";
      temp.style.position = "fixed";
      temp.style.left = "-9999px";
      temp.innerHTML = html;
      document.body.appendChild(temp);
      const range = document.createRange();
      range.selectNodeContents(temp);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand("copy");
      sel.removeAllRanges();
      document.body.removeChild(temp);
      return ok;
    } catch {
      return false;
    }
  }
}
async function exportarReportXls() {
  const d = await montarDadosReport();
  if (!d) return;
  const obsGeral = d.observacoesDestinatarios.map((s) => `${s.nome}: ${s.observacoes}`).join(" | ");
  const linhas = d.pendentesAtencao.map((e) => ({
    Entrega: e.titulo, Prazo: fmtDate(e.data_prazo), Situação: label(e.situacao_calculada),
    Responsável: e.perfis?.nome || "-", Observações: e.observacoes || "", "Obs. dos stakeholders": obsGeral,
  }));
  const concluidasLinhas = d.concluidas.map((e) => ({ Entrega: e.titulo, "Concluída em": fmtDate(e.data_conclusao || e.atualizado_em) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    Projeto: d.projeto.nome, "% Concluído": d.percConcluido,
    "Próximo marco": d.proximoMarco?.titulo || "-", "Data do marco": d.proximoMarco ? fmtDate(d.proximoMarco.data_prazo) : "-",
    Destinatários: d.destinatarios.map((x) => x.email).join(", "),
  }]), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Entrega: "Nenhuma pendência crítica" }]), "Pendências");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(concluidasLinhas.length ? concluidasLinhas : [{ Entrega: "Nada concluído ainda" }]), "Já entregue");
  XLSX.writeFile(wb, `report-${d.projeto.nome.replace(/\W+/g, "_")}.xlsx`);
}
async function renderNotificacoesLog() {
  const { data, error } = await sb.from("notificacoes_log").select("*, stakeholders(nome,email)").order("enviado_em", { ascending: false }).limit(50);
  if (error) return toast(error.message, "err");
  const tbody = document.querySelector("#table-notificacoes tbody");
  tbody.innerHTML = data.length ? data.map((n) => `
    <tr><td>${fmtDate(n.data_referencia)}</td><td>${esc(n.tipo)}</td><td>${esc(n.stakeholders?.email || "-")}</td><td>${badge(n.status_envio === "ok" ? "concluido" : n.status_envio === "erro" ? "atrasado" : "no_prazo")} ${esc(n.status_envio)}</td></tr>
  `).join("") : `<tr><td colspan="4" class="empty-state">Nenhuma notificação registrada ainda.</td></tr>`;
}

// ==== CONFIGURAÇÕES ====
async function loadConfig() {
  if (!isAdmin()) { document.getElementById("tab-config").innerHTML = `<div class="empty-state">Apenas administradores acessam esta aba.</div>`; return; }
  await refreshBase();
  const { data: cfg } = await sb.from("configuracoes").select("*");
  const val = (k, def = "") => cfg?.find((c) => c.chave === k)?.valor ?? def;
  document.getElementById("cfg-dias-risco").value = val("dias_risco_padrao", "3");
  document.getElementById("cfg-digest-ativo").value = val("digest_ativo", "true");
  document.getElementById("cfg-remetente-nome").value = val("remetente_nome", "");
  document.getElementById("cfg-remetente-email").value = val("remetente_email", "");
  document.getElementById("btn-salvar-config").onclick = async () => {
    const updates = [
      { chave: "dias_risco_padrao", valor: document.getElementById("cfg-dias-risco").value },
      { chave: "digest_ativo", valor: document.getElementById("cfg-digest-ativo").value },
      { chave: "remetente_nome", valor: document.getElementById("cfg-remetente-nome").value },
      { chave: "remetente_email", valor: document.getElementById("cfg-remetente-email").value },
    ];
    const { error } = await sb.from("configuracoes").upsert(updates);
    if (error) return toast(error.message, "err");
    toast("Configurações salvas.");
  };
  await renderUsuariosTable();
}
async function renderUsuariosTable() {
  const { data: membros } = await sb.from("projeto_membros").select("perfil_id, projeto_id");
  const tbody = document.querySelector("#table-usuarios tbody");
  tbody.innerHTML = state.perfis.map((p) => {
    const projetosDele = (membros ?? []).filter((m) => m.perfil_id === p.id).map((m) => projetoNome(m.projeto_id)).join(", ");
    return `<tr data-id="${p.id}">
      <td>${esc(p.nome)}</td>
      <td><select class="papel-select" data-id="${p.id}"><option value="admin" ${p.papel === "admin" ? "selected" : ""}>Admin</option><option value="editor" ${p.papel === "editor" ? "selected" : ""}>Editor</option><option value="colaborador" ${p.papel === "colaborador" ? "selected" : ""}>Colaborador</option><option value="leitor" ${p.papel === "leitor" ? "selected" : ""}>Leitor</option></select></td>
      <td><input type="checkbox" class="ativo-check" data-id="${p.id}" ${p.ativo ? "checked" : ""} /></td>
      <td class="small">${esc(projetosDele || "-")} ${p.papel === "colaborador" ? `<button class="btn btn-ghost btn-sm" data-action="membros" data-id="${p.id}">editar</button>` : ""}</td>
      <td></td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll(".papel-select").forEach((sel) => (sel.onchange = async () => {
    const { error } = await sb.from("perfis").update({ papel: sel.value }).eq("id", sel.dataset.id);
    if (error) toast(error.message, "err"); else { toast("Papel atualizado."); loadConfig(); }
  }));
  tbody.querySelectorAll(".ativo-check").forEach((chk) => (chk.onchange = async () => {
    const { error } = await sb.from("perfis").update({ ativo: chk.checked }).eq("id", chk.dataset.id);
    if (error) toast(error.message, "err"); else toast("Atualizado.");
  }));
  tbody.querySelectorAll('[data-action="membros"]').forEach((btn) => (btn.onclick = () => openMembrosForm(btn.dataset.id)));
}
function openMembrosForm(perfilId) {
  openModal({
    title: "Projetos deste colaborador",
    bodyHtml: `<div id="membros-list">Carregando...</div>`,
    footerHtml: `<button class="btn btn-primary" id="membros-fechar">Fechar</button>`,
    onMount: async () => {
      document.getElementById("membros-fechar").onclick = closeModal;
      const { data: atuais } = await sb.from("projeto_membros").select("projeto_id").eq("perfil_id", perfilId);
      const atuaisIds = new Set((atuais ?? []).map((m) => m.projeto_id));
      document.getElementById("membros-list").innerHTML = state.projetos.map((p) => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 0;">
          <input type="checkbox" class="membro-check" data-projeto="${p.id}" ${atuaisIds.has(p.id) ? "checked" : ""} /> ${esc(p.nome)}
        </label>`).join("");
      document.querySelectorAll(".membro-check").forEach((chk) => (chk.onchange = async () => {
        if (chk.checked) await sb.from("projeto_membros").insert({ projeto_id: chk.dataset.projeto, perfil_id: perfilId });
        else await sb.from("projeto_membros").delete().eq("projeto_id", chk.dataset.projeto).eq("perfil_id", perfilId);
      }));
    },
  });
}

// ==== BOOTSTRAP ====
function atualizarBotaoTema() {
  const claro = document.documentElement.getAttribute("data-theme") === "light";
  const btn = document.getElementById("btn-theme-toggle");
  if (btn) btn.textContent = claro ? "☀️ Tema claro" : "🌙 Tema escuro";
  if (state.currentTab === "visao-geral") loadVisaoGeral();
}
function wireStaticEvents() {
  document.querySelectorAll(".nav-item").forEach((el) => (el.onclick = () => switchTab(el.dataset.tab)));
  document.getElementById("btn-logout").onclick = doLogout;
  atualizarBotaoTema();
  document.getElementById("btn-theme-toggle").onclick = () => {
    const atual = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", atual);
    localStorage.setItem("pmo_tema", atual);
    atualizarBotaoTema();
  };
  document.getElementById("vg-filtro-projeto").onchange = loadVisaoGeral;
  document.getElementById("proj-busca").oninput = renderProjectsGrid;
  document.getElementById("proj-filtro-status").onchange = renderProjectsGrid;
  document.getElementById("btn-novo-projeto").onclick = () => openProjetoForm(null);
  document.getElementById("ent-filtro-projeto").onchange = renderEntregasTable;
  document.getElementById("ent-filtro-situacao").onchange = renderEntregasTable;
  document.getElementById("btn-nova-entrega").onclick = () => openEntregaForm(null, document.getElementById("ent-filtro-projeto").value || null);

  document.getElementById("kpi-card-projetos-ativos").onclick = () => abrirModalKpi("Projetos ativos", "projetos", state.vgListas?.projetosAtivos || []);
  document.getElementById("kpi-card-no-prazo").onclick = () => abrirModalKpi("Entregas no prazo", "entregas", state.vgListas?.noPrazo || []);
  document.getElementById("kpi-card-em-risco").onclick = () => abrirModalKpi("Entregas em risco", "entregas", state.vgListas?.emRisco || []);
  document.getElementById("kpi-card-atrasadas").onclick = () => abrirModalKpi("Entregas atrasadas", "entregas", state.vgListas?.atrasadas || []);
  document.getElementById("kpi-card-entregues").onclick = () => abrirModalKpi("Entregas entregues", "entregas", state.vgListas?.entregues || []);
  document.getElementById("btn-alertas").onclick = abrirModalAlertas;
  atualizarContadorAlertas();
}
// Conta quantas entregas estão atrasadas/em risco (ignorando as silenciadas)
// e mostra no sininho da barra lateral — visível em qualquer aba.
async function atualizarContadorAlertas() {
  const { data, error } = await sb.from("v_entregas").select("id").in("situacao_calculada", ["atrasado", "em_risco"]).eq("silenciar_notificacoes", false);
  if (error) return;
  const badgeEl = document.getElementById("alertas-badge");
  badgeEl.textContent = data.length;
  badgeEl.classList.toggle("hidden", data.length === 0);
}
// Abre a lista de alertas agrupada por stakeholder, com um botão de copiar
// pronto pra colar num e-mail — ela decide quando e pra quem manda, sem
// nenhum envio automático por trás.
async function abrirModalAlertas() {
  setLoading(true);
  let entregas, stakeholders;
  try {
    const [{ data: e, error: e1 }, { data: s, error: e2 }] = await Promise.all([
      sb.from("v_entregas").select("*, projetos(nome), perfis:responsavel_id(nome)").in("situacao_calculada", ["atrasado", "em_risco"]).eq("silenciar_notificacoes", false),
      sb.from("stakeholders").select("*").eq("ativo", true),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    entregas = e; stakeholders = s;
  } catch (err) { toast(err.message, "err"); setLoading(false); return; }

  // Entregas com stakeholder(s) específicos vinculados só avisam essas
  // pessoas; sem vínculo nenhum, cai no comportamento antigo (todo mundo do projeto).
  const vinculosPorEntrega = {};
  if (entregas.length) {
    const { data: vinculos } = await sb.from("entrega_stakeholders").select("entrega_id,stakeholder_id").in("entrega_id", entregas.map((e) => e.id));
    (vinculos || []).forEach((v) => (vinculosPorEntrega[v.entrega_id] ??= new Set()).add(v.stakeholder_id));
  }
  setLoading(false);

  const grupos = stakeholders
    .map((st) => ({
      st,
      itens: entregas.filter((e) => {
        if (e.projeto_id !== st.projeto_id) return false;
        const especificos = vinculosPorEntrega[e.id];
        return !especificos || especificos.size === 0 || especificos.has(st.id);
      }),
    }))
    .filter((g) => g.itens.length);

  const bodyHtml = grupos.length
    ? grupos.map((g, i) => `
      <div class="card" style="padding:14px 16px;margin-bottom:12px;">
        <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div><b>${esc(g.st.nome)}</b> <span class="muted small">${esc(g.st.email)} — ${esc(projetoNome(g.st.projeto_id))}</span></div>
          <button class="btn btn-primary btn-sm" data-idx="${i}" data-action="copiar-alerta">📋 Copiar resumo</button>
        </div>
        <div class="small muted">${g.itens.length} item(ns): ${g.itens.map((e) => `${esc(e.titulo)} (${label(e.situacao_calculada)})`).join(", ")}</div>
      </div>`).join("")
    : `<div class="empty-state">Nada atrasado ou em risco agora. 🎉</div>`;

  openModal({
    title: `Alertas (${entregas.length})`,
    bodyHtml,
    footerHtml: `<button class="btn btn-primary" id="alertas-fechar">Fechar</button>`,
    onMount: () => {
      document.getElementById("alertas-fechar").onclick = closeModal;
      document.querySelectorAll('[data-action="copiar-alerta"]').forEach((btn) => {
        btn.onclick = async () => {
          const g = grupos[Number(btn.dataset.idx)];
          const html = montarResumoAlertaHtml(g.st, g.itens);
          const ok = await copiarHtmlParaAreaTransferencia(html);
          toast(ok ? `Resumo de ${g.st.nome} copiado! Cole no e-mail e envie pelo Outlook.` : "Não consegui copiar — tente selecionar e copiar manualmente.", ok ? "ok" : "err");
        };
      });
    },
  });
}
function montarResumoAlertaHtml(stakeholder, itens) {
  const linha = (e) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.projetos?.nome || "-")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.titulo)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${fmtDate(e.data_prazo)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${label(e.situacao_calculada)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(e.perfis?.nome || "-")}</td>
    </tr>`;
  return `<div style="font-family:sans-serif;color:#222;">
    <p>Olá, ${esc(stakeholder.nome)},</p>
    <p>Segue um resumo do que precisa de atenção agora:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Projeto</th><th style="padding:8px;text-align:left;">Entrega</th><th style="padding:8px;text-align:left;">Prazo</th><th style="padding:8px;text-align:left;">Situação</th><th style="padding:8px;text-align:left;">Responsável</th></tr>
      ${itens.map(linha).join("")}
    </table>
  </div>`;
}
function abrirModalKpi(titulo, tipo, itens) {
  const linhas = tipo === "projetos"
    ? itens.map((p) => `<tr data-id="${p.id}"><td>${esc(p.nome)}</td><td>${badge(p.status)}</td><td>${priorityDot(p.prioridade)}${label(p.prioridade)}</td></tr>`).join("")
    : itens.map((e) => `<tr data-id="${e.id}"><td>${esc(e.projetos?.nome || projetoNome(e.projeto_id))}</td><td>${esc(e.titulo)}</td><td>${fmtDate(e.data_prazo)}</td><td>${esc(e.perfis?.nome || "-")}</td></tr>`).join("");
  const cabecalho = tipo === "projetos" ? "<tr><th>Projeto</th><th>Status</th><th>Prioridade</th></tr>" : "<tr><th>Projeto</th><th>Entrega</th><th>Prazo</th><th>Responsável</th></tr>";
  const bodyHtml = itens.length
    ? `<div class="table-wrap"><table class="data-table"><thead>${cabecalho}</thead><tbody>${linhas}</tbody></table></div>`
    : `<div class="empty-state">Nada aqui agora. 🎉</div>`;
  openModal({
    title: `${titulo} (${itens.length})`,
    bodyHtml,
    footerHtml: `<button class="btn btn-primary" id="kpi-modal-close">Fechar</button>`,
    onMount: () => {
      document.getElementById("kpi-modal-close").onclick = closeModal;
      document.querySelectorAll(".modal-body tbody tr[data-id]").forEach((tr) => {
        tr.style.cursor = "pointer";
        tr.onclick = () => {
          const item = itens.find((x) => x.id === tr.dataset.id);
          closeModal();
          if (tipo === "projetos") openProjetoForm(item);
          else openEntregaForm(item);
        };
      });
    },
  });
}
async function bootstrapApp() {
  wireStaticEvents();
  applyIdentityToShell();
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  switchTab("visao-geral");
}
async function init() {
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    document.getElementById("login-error").textContent = "";
    try {
      await doLogin(document.getElementById("login-email").value, document.getElementById("login-password").value);
      await loadPerfilAtual();
      await bootstrapApp();
    } catch (err) {
      document.getElementById("login-error").textContent = "E-mail ou senha inválidos.";
    }
  });

  const { data } = await sb.auth.getSession();
  if (data.session) {
    try { await loadPerfilAtual(); await bootstrapApp(); } catch { /* fica na tela de login */ }
  }
}
init();
