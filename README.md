# PMO Dashboard — guia de setup (fazer uma única vez)

> A logo da Bioxxi já está aplicada na tela de login e na barra lateral (`assets/logo.png`) — nada a fazer aqui.

Depois desses passos, o sistema funciona sozinho, para sempre, sem precisar do seu notebook ligado e sem nenhum custo. Você só vai voltar aqui se um dia quiser mudar algo de propósito (trocar o e-mail remetente, convidar alguém, etc.).

Leva uns 20–30 minutos, tudo feito clicando e colando — nenhum comando, nenhum terminal.

---

## Passo 1 — Criar o projeto no Supabase

1. Entre em [supabase.com](https://supabase.com) com a conta que você já usa (a mesma do bioxxi-dashboard).
2. **New Project** → escolha um nome (ex: `pmo-dashboard`) → escolha uma senha do banco (guarde em algum lugar seguro, mas você não vai precisar dela no dia a dia) → região `South America (São Paulo)` se disponível.
3. Espere o projeto terminar de ser criado (1–2 minutos).
4. Vá em **SQL Editor** (menu lateral) → **New query**.
5. Abra o arquivo [`supabase/setup.sql`](supabase/setup.sql) deste repositório, copie todo o conteúdo, cole no SQL Editor e clique em **Run**.
   - Se aparecer algum erro na primeira vez, rode de novo — o script foi feito para poder ser executado mais de uma vez sem problema.

## Passo 2 — Pegar as chaves do projeto e colar no site

1. No painel do Supabase, vá em **Project Settings → API**.
2. Copie o **Project URL** e a chave **anon public**.
3. Abra o arquivo [`js/config.js`](js/config.js) deste repositório e substitua:
   ```js
   window.PMO_CONFIG = {
     SUPABASE_URL: "https://SEU-PROJETO.supabase.co",   // ← cole o Project URL aqui
     SUPABASE_ANON_KEY: "SUA-CHAVE-ANON-PUBLICA-AQUI",   // ← cole a chave anon public aqui
   };
   ```
   Essas duas informações são seguras para deixar public no site — a chave "anon" é feita para ser pública; quem protege os dados de verdade são as regras de segurança já criadas no Passo 1.

## Passo 3 — Criar sua conta de acesso (você vira admin automaticamente)

1. No painel do Supabase, vá em **Authentication → Users → Add user**.
2. E-mail: `julianalobao@bioxxi.com.br`. Defina uma senha e marque **Auto Confirm User**.
3. Pronto — quando você fizer login no site com esse e-mail/senha pela primeira vez, o sistema te reconhece automaticamente como **administradora** (é o primeiro login do sistema).
4. Para trocar esse e-mail depois, ou adicionar outros administradores/editores no futuro: repita "Add user" com o novo e-mail e, na aba **Configurações** do site, defina o papel da pessoa como "Admin". Não precisa voltar a este guia para isso.

## Passo 4 — Liberar o envio pelo seu e-mail corporativo (Microsoft 365)

Os e-mails automáticos saem direto da sua caixa `@bioxxi.com.br`, via SMTP — sem Brevo, sem terceiros.

**Ponto de atenção real:** a Microsoft desativou por padrão o "SMTP autenticado" em muitas contas corporativas 365. Pode ser que os passos abaixo funcionem direto, ou pode ser que você precise pedir pra TI habilitar isso pra sua caixa antes. Vamos tentar primeiro; se der erro de autenticação no Passo 8 (teste), esse é o motivo.

1. Se sua conta tiver autenticação em duas etapas (MFA) ativada — o normal em contas corporativas — você vai precisar gerar uma **senha de aplicativo**: entre em [mysignins.microsoft.com/security-info](https://mysignins.microsoft.com/security-info) → **Add sign-in method → App password**. Copie a senha gerada (só aparece uma vez).
   - Se essa opção não aparecer, é porque a política da sua empresa não permite — nesse caso, peça pra TI habilitar "senha de aplicativo" ou "SMTP autenticado" pra sua conta.
2. Guarde estes 4 valores, você vai colar no Passo 5:
   - **SMTP_HOST**: `smtp.office365.com`
   - **SMTP_PORT**: `587`
   - **SMTP_USER**: seu e-mail completo (`julianalobao@bioxxi.com.br` ou o que for)
   - **SMTP_PASS**: a senha de aplicativo do passo 1 (ou sua senha normal, só se a conta não tiver MFA — menos comum)

## Passo 5 — Implantar as Edge Functions

1. No painel do Supabase, vá em **Edge Functions → Deploy a new function**.
2. Nome: `notificacoes-diarias`. Cole todo o conteúdo do arquivo [`supabase/functions/notificacoes-diarias/index.ts`](supabase/functions/notificacoes-diarias/index.ts) no editor e clique em **Deploy**.
3. Repita para a segunda função: nome `enviar-report-ceo`, conteúdo do arquivo [`supabase/functions/enviar-report-ceo/index.ts`](supabase/functions/enviar-report-ceo/index.ts).
4. As duas próximas só são necessárias se for usar a automação de checkpoints via Teams:
   - Nome `criar-checkpoint`, conteúdo do arquivo [`supabase/functions/criar-checkpoint/index.ts`](supabase/functions/criar-checkpoint/index.ts).
   - Nome `checkpoint-contexto`, conteúdo do arquivo [`supabase/functions/checkpoint-contexto/index.ts`](supabase/functions/checkpoint-contexto/index.ts).
5. Vá em **Project Settings → Edge Functions → Secrets** e adicione os 4 valores do Passo 4:
   - `SMTP_HOST` = `smtp.office365.com`
   - `SMTP_PORT` = `587`
   - `SMTP_USER` = seu e-mail `@bioxxi.com.br`
   - `SMTP_PASS` = a senha de aplicativo
   - `CHECKPOINT_SECRET` = invente uma senha longa qualquer (só você e a automação do Teams vão usar) — necessário só se for usar a automação de checkpoints.
   - (não precisa adicionar `SUPABASE_URL` nem `SUPABASE_SERVICE_ROLE_KEY` — o Supabase já coloca isso automaticamente em toda função)

## Passo 6 — Agendar o envio diário automático

1. Copie a URL da função `notificacoes-diarias` (aparece na página da própria função, algo como `https://xxxxx.supabase.co/functions/v1/notificacoes-diarias`).
2. Volte ao **SQL Editor**, abra o arquivo [`supabase/schedule_cron.sql`](supabase/schedule_cron.sql), cole o conteúdo, e substitua os dois textos marcados como `COLE-AQUI`:
   - a **service_role key** (pegue em Project Settings → API → Project API keys → `service_role`, clique em "Reveal")
   - a URL da função que você copiou no passo anterior
3. Clique em **Run**.
4. Para confirmar que agendou certo, rode: `select * from cron.job;` — deve aparecer uma linha `pmo-notificacoes-diarias`.

## Passo 7 — Publicar a tela (GitHub Pages)

1. Se este projeto ainda não está no GitHub, crie um repositório novo (pode ser privado) e suba esta pasta inteira (`pmo-dashboard`) para ele.
2. No GitHub, vá em **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, branch `main` (ou `master`), pasta `/ (root)`. Salve.
4. Em 1–2 minutos, o GitHub mostra o link do site (algo como `https://seu-usuario.github.io/pmo-dashboard/`). É esse link que você (e sua equipe, no futuro) vai usar todos os dias.

## Passo 8 — Testar

1. Abra o link do Passo 7, faça login com o e-mail/senha do Passo 3.
2. Crie um projeto de teste, uma entrega com prazo para os próximos dias, um stakeholder com seu próprio e-mail.
3. Vá em **Configurações** e confirme que "Dias de antecedência" e o e-mail remetente estão certos.
4. Para testar o e-mail automático sem esperar o horário agendado: no SQL Editor, rode só o bloco `net.http_post(...)` do arquivo `schedule_cron.sql` (sem o `cron.schedule`) — ele dispara a função na hora. Confira se o e-mail chegou e se apareceu uma linha na aba **Stakeholders → Histórico de notificações**.
5. Teste o botão **Gerar e-mail** e **Exportar XLS** na aba Stakeholders com o projeto de teste.

---

## No dia a dia, depois disso

- Você não precisa voltar a nenhum painel técnico — tudo se faz pela tela do site.
- Para convidar alguém da equipe: Supabase → Authentication → Add user com o e-mail da pessoa; depois, na aba **Configurações** do site, escolha o papel dela (Editor / Colaborador / Leitor).
- Para mudar o horário do e-mail diário ou o remetente: aba **Configurações** do site (não precisa mais tocar em SQL).
