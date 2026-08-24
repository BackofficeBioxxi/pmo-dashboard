// ============================================================================
// Config pública do projeto Supabase.
// Estes valores são seguros para expor no navegador — a chave "anon" é feita
// para ser pública. A segurança real do sistema está nas políticas de RLS
// configuradas em supabase/setup.sql, não em esconder esta chave.
//
// PREENCHER com os dados do seu projeto (Supabase → Project Settings → API):
// ============================================================================
window.PMO_CONFIG = {
  SUPABASE_URL: "https://csnotsxfqbuaamvcziua.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbm90c3hmcWJ1YWFtdmN6aXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTE0ODIsImV4cCI6MjEwMjAyNzQ4Mn0.nfbJ35D4-coHf-r8ikAUYcStVR1giV6T7pdH2vOdNII",
  // client_id e tenant_id do app "PMO Dashboard - Email" no Azure — públicos
  // de propósito (é assim que autenticação de app em navegador funciona: sem
  // segredo nenhum, protegido por PKCE + a permissão configurada no Azure).
  GRAPH_CLIENT_ID: "9a86a177-910c-4e51-8096-3d29d3d9ea3e",
  GRAPH_TENANT_ID: "41f6ced0-c71b-4626-a41e-6aa7afe5bd7c",
};
