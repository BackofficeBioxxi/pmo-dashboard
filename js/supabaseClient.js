// ============================================================================
// Cria o cliente supabase-js usado por todo o app.
//
// Script "clássico" de propósito (sem type="module") — assim a tela também
// abre direto com duplo-clique no arquivo (file://), sem precisar de servidor.
// O SDK do Supabase é carregado antes deste arquivo via <script> no index.html
// e fica disponível em window.supabase.
//
// Modo de demonstração: abrir com ?demo=1 na URL usa dados fictícios em
// memória (js/mockSupabase.js) em vez do Supabase real — útil pra testar a
// tela antes de fazer o setup de infraestrutura.
// ============================================================================
var isDemoMode = new URLSearchParams(location.search).get("demo") === "1";

var sb;
if (isDemoMode) {
  sb = createMockClient();
  console.info("[PMO Dashboard] Modo de demonstração ativo — dados fictícios, nada é salvo de verdade.");
} else {
  sb = window.supabase.createClient(window.PMO_CONFIG.SUPABASE_URL, window.PMO_CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
