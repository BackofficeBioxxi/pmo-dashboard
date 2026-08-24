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

## Passo 4 — E-mails: digest diário automático via Microsoft Graph

A TI não libera senha de aplicativo/SMTP autenticado pra conta corporativa, e um serviço terceiro (Brevo) arriscava cair em spam sem o domínio `@bioxxi.com.br` autenticado. A solução: um cadastro de aplicativo no Microsoft Entra (Azure AD) da própria Bioxxi, usando a API oficial da Microsoft (Graph) com a permissão delegada `Mail.Send` — que não depende de aprovação da TI. O e-mail sai como você mesma (`juliana.lobao@bioxxi.com.br`), e uma cópia fica salva na sua pasta "Itens Enviados" do Outlook.

Isso já foi configurado uma vez (registro do aplicativo "PMO Dashboard - Email" no Entra, permissão Mail.Send, autorização única). Os 4 valores gerados nesse processo (`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_REFRESH_TOKEN`) precisam estar em **Project Settings → Edge Functions → Secrets** no Supabase antes do Passo 5.

Além do digest automático, continuam disponíveis, sem depender de nada disso:
- O sininho 🔔 de alertas na barra lateral, com botão "Copiar resumo" por stakeholder.
- O **Report do CEO** (aba Stakeholders), com botões "Copiar conteúdo" e "Copiar e-mail" — esse continua manual de propósito, pra você controlar exatamente o que o CEO recebe.

## Passo 5 — Implantar as Edge Functions

Só as duas primeiras são realmente necessárias agora (as duas últimas são só se um dia quiser ativar a automação de checkpoints via Teams):

1. No painel do Supabase, vá em **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `notificacoes-diarias` → cole o conteúdo de [`supabase/functions/notificacoes-diarias/index.ts`](supabase/functions/notificacoes-diarias/index.ts) → **Deploy**. *(Essa função não é usada no dia a dia agora — os alertas são todos no painel — mas não tem problema deixá-la implantada, sem uso.)*
3. Nome: `enviar-report-ceo` → cole o conteúdo de [`supabase/functions/enviar-report-ceo/index.ts`](supabase/functions/enviar-report-ceo/index.ts) → **Deploy**. *(Mesma observação — o app usa o botão "Copiar conteúdo" em vez desta função, mas não tem problema tê-la implantada.)*
4. Opcional, só se um dia for usar a automação de checkpoints via Teams:
   - Nome `criar-checkpoint` → conteúdo de [`supabase/functions/criar-checkpoint/index.ts`](supabase/functions/criar-checkpoint/index.ts).
   - Nome `checkpoint-contexto` → conteúdo de [`supabase/functions/checkpoint-contexto/index.ts`](supabase/functions/checkpoint-contexto/index.ts).
   - Nesse caso, em **Project Settings → Edge Functions → Secrets**, adicione `CHECKPOINT_SECRET` (invente uma senha longa qualquer).

## Passo 7 — Publicar a tela (GitHub Pages)

1. Se este projeto ainda não está no GitHub, crie um repositório novo (pode ser privado) e suba esta pasta inteira (`pmo-dashboard`) para ele.
2. No GitHub, vá em **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, branch `main` (ou `master`), pasta `/ (root)`. Salve.
4. Em 1–2 minutos, o GitHub mostra o link do site (algo como `https://seu-usuario.github.io/pmo-dashboard/`). É esse link que você (e sua equipe, no futuro) vai usar todos os dias.

## Passo 8 — Testar

1. Abra o link do Passo 7, faça login com o e-mail/senha do Passo 3.
2. Crie um projeto de teste, uma entrega com prazo já vencido (pra virar "Atrasado") e um stakeholder nesse projeto.
3. Confira o sininho 🔔 na barra lateral — deve mostrar "1". Clique nele, veja o resumo agrupado, e teste o botão "Copiar resumo" (cole em qualquer lugar, tipo o Bloco de Notas, pra confirmar que copiou).
4. Na aba **Stakeholders**, teste "Gerar Report do CEO" → botão "Copiar conteúdo" (mesma lógica) e "Exportar XLS".

---

## No dia a dia, depois disso

- Você não precisa voltar a nenhum painel técnico — tudo se faz pela tela do site.
- Para convidar alguém da equipe: Supabase → Authentication → Add user com o e-mail da pessoa; depois, na aba **Configurações** do site, escolha o papel dela (Editor / Colaborador / Leitor).
- Para mudar o horário do e-mail diário ou o remetente: aba **Configurações** do site (não precisa mais tocar em SQL).
