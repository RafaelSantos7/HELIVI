# ⚙️ GUIA DE CONFIGURAÇÃO FINAL — PIX MULTI-GATEWAY (Mercado Pago + Efi Bank)

Checklist completo para configurar, testar e publicar a integração PIX do HELIVI PDV.

> **Novidade:** o PIX agora é **multi-gateway**. Foi implantada a **API do Mercado Pago** (Checkout API `/v1/orders`), que passa a ser o gateway **recomendado**. A Efi Bank continua disponível como alternativa. A troca de gateway e as credenciais são feitas **dentro do app** (Configurações → Pagamento PIX) e gravadas com segurança no Firestore — **não** mais por `.env`.

---

## 🏗️ COMO FUNCIONA (ARQUITETURA)

```
PDV (js/pdv.js)
   │  criarPagamentoPix / verificarPagamentoPix  (Callable)
   ▼
Firebase Functions ── pixFactory ──► mercadoPagoService  (API /v1/orders)
                          │        └► efiService          (API PIX + mTLS .pem)
                          │
                          └─ lê gateway ativo + segredos do Firestore (cache 60s)
```

- **`configuracoes/pagamentos`** → gateway ativo (`gatewayAtivo`), flag `mpAmbienteTeste`, status.
- **`configuracoes/segredos_pagamento`** → tokens/segredos (gravados pela function, **nunca legíveis pelo navegador**).
- O `pixFactory` escolhe o service do gateway ativo e delega criação, verificação e webhook.

---

## 📋 CHECKLIST ANTES DO DEPLOY

### ✅ Pré-requisitos
- [ ] Node.js **20+** instalado (`node --version`)
- [ ] Firebase CLI instalado (`npm install -g firebase-tools`)
- [ ] Plano **Blaze** ativo no Firebase (Functions exige)
- [ ] **Mercado Pago:** conta + aplicação em https://www.mercadopago.com.br/developers + **chave PIX** cadastrada no app Mercado Pago
- [ ] **Efi (opcional):** certificados `.pem` em `helivi-functions/functions/` + credenciais do painel https://sejaefi.com.br

---

## 1️⃣ INSTALAÇÃO DE DEPENDÊNCIAS

```bash
cd helivi-functions
npm install
firebase login
```

Verificar pacotes principais:

```bash
npm list axios firebase-admin firebase-functions
```

---

## 2️⃣ CONFIGURAR O MERCADO PAGO (RECOMENDADO)

A configuração é feita **pela tela do sistema**, não por arquivo. Os tokens são salvos no Firestore pela function `salvarConfigPagamentoPix` (apenas admin) e **não podem ser lidos pelo navegador** depois de salvos.

### Passo 1 — Obter o Access Token de PRODUÇÃO

1. Acesse https://www.mercadopago.com.br/developers → **Suas integrações**
2. Crie/abra a aplicação (ex.: `helivi-pdv`)
3. Vá em **Credenciais de produção** → copie o **Access Token** (começa com `APP_USR-`)

> ⚠️ Token `TEST-` **não funciona** na API `/v1/orders`. Use sempre `APP_USR-`.

### Passo 2 — Cadastrar a chave PIX na conta Mercado Pago

No app Mercado Pago (celular) → **PIX → Minhas chaves**, cadastre ao menos uma chave. **Sem chave PIX a cobrança de produção falha** (erro `13253 / without key`).

### Passo 3 — Salvar no HELIVI

1. Faça login como **administrador**
2. Abra **Configurações → Pagamento PIX**
3. Em **Gateway PIX ativo**, selecione **Mercado Pago**
4. Cole o token em **Access Token PRODUÇÃO (APP_USR-)**
5. Deixe **Modo teste Mercado Pago** **desmarcado** (PIX real)
6. Clique em **Salvar**

Pronto — o PDV passa a gerar PIX real via Mercado Pago.

### (Opcional) Modo teste / Sandbox Mercado Pago

Para testar sem cobrança real:

1. Crie um **usuário de teste vendedor** em **Suas integrações → Contas de teste**
2. Gere o **Access Token `APP_USR-` desse usuário de teste**
3. No HELIVI: **Configurações → Pagamento PIX → Opções avançadas (sandbox / testes)**
   - Cole o token em **Token SANDBOX opcional (APP_USR vendedor teste)**
   - Marque **Modo teste Mercado Pago**
   - **Salvar**

| Modo | Token usado | Resultado |
|------|-------------|-----------|
| **Produção** (padrão) | Access Token PRODUÇÃO `APP_USR-` | PIX real (exige chave PIX na conta) |
| **Modo teste** marcado | Token SANDBOX `APP_USR-` (vendedor de teste) | PIX de sandbox, sem cobrança real |

> Regras de token: deve começar com `APP_USR-`. Token `TEST-` é rejeitado. Sem token salvo, a cobrança falha com mensagem orientando qual token usar.

---

## 3️⃣ CONFIGURAR A EFI BANK (ALTERNATIVO)

A Efi continua suportada como gateway. A configuração também é feita em **Configurações → Pagamento PIX** (selecione **Efi Bank**) e preencha **Client ID**, **Client Secret** e **Chave PIX**.

A Efi exige ainda os certificados **.pem** (mTLS) em `helivi-functions/functions/`:

| Ambiente     | Arquivo em `helivi-functions/functions/`      |
|--------------|-----------------------------------------------|
| Homologação  | `homologacao-927842-PDV HELIVI.pem`           |
| Produção     | `producao-927842-PDV HELIVI.pem`              |

```powershell
dir "helivi-functions\functions\*.pem"   # Windows
```
```bash
ls -la helivi-functions/functions/*.pem  # Linux/macOS
```

Troca de ambiente Efi (afeta apenas a Efi):

```bash
npm run efi:homolog    # homologação
npm run efi:producao   # produção
npm run efi:status     # ambiente atual
```

> ⚠️ Arquivos `.pem` e `.env.local` estão no `.gitignore` — nunca commite credenciais ou certificados.

---

## 4️⃣ SECRET DO WEBHOOK (`.env.local`)

As credenciais dos gateways ficam no Firestore (passo 2/3). O **único** segredo que permanece em `helivi-functions/.env.local` é o do webhook:

```env
# Protege a URL pública do webhook PIX (?secret=...)
PIX_WEBHOOK_SECRET=helivi-mp-wh-2026-xxxxxxxx
```

> ⚠️ Use **apenas o valor** após o `=` (não repita `PIX_WEBHOOK_SECRET=` dentro do valor). Esse mesmo segredo deve ser usado na URL configurada no painel do gateway (passo 6).

Em produção, defina `PIX_WEBHOOK_SECRET` como variável de ambiente no Cloud Run (passo 7).

---

## 5️⃣ TESTAR LOCALMENTE (EMULADOR + PDV)

**Terminal 1 — emuladores:**

```bash
cd helivi-functions
npm run serve
```

Saída esperada:

```
✔ All emulators ready!
│ Functions  │ 127.0.0.1:5001 │
│ Firestore  │ 127.0.0.1:8080 │
│ Auth       │ 127.0.0.1:9099 │
│ Emulator UI│ 127.0.0.1:4000 │
```

**Terminal 2 — frontend:** abra a pasta raiz `helivi-final` com **Live Server** (VS Code). Em `localhost`/`127.0.0.1`, o `js/firebase.js` conecta aos emuladores automaticamente.

### Fluxo PIX no PDV

1. Faça login no sistema
2. Configure o gateway em **Configurações → Pagamento PIX** (passo 2/3) — a config é salva no Firestore do emulador
3. Abra uma comanda com itens
4. Selecione pagamento **PIX** e confirme → o QR Code aparece

### Simular confirmação (somente emulador)

No emulador, a function `simularConfirmacaoPixTeste` confirma o pagamento sem pagar de verdade. No modal de PIX, use o botão **🧪 Simular pagamento** (ele chama essa function). Em **Modo teste / sandbox MP** o botão abre a página do Mercado Pago; em PIX real, abre o ticket para pagamento.

> As functions PIX são **callable** (`onCall`) e exigem usuário logado. Não teste com `curl` direto — use o SDK Firebase pelo PDV.

---

## 6️⃣ CONFIGURAR O WEBHOOK NO PAINEL DO GATEWAY

A function `webhookPagamentoPix` recebe a notificação, **consulta a API do gateway** para validar e atualiza a comanda. Ela aceita dois parâmetros na URL:

- `?gateway=mercadopago` (ou `efi`) — informa qual service processa o payload
- `?secret=<PIX_WEBHOOK_SECRET>` — protege o endpoint

**URL após o deploy** (exemplo real do projeto):

```
https://webhookpagamentopix-<hash>-uc.a.run.app?gateway=mercadopago&secret=SEU_SECRET
```

Obtenha a URL exata no terminal do `npm run deploy` ou no [Firebase Console](https://console.firebase.google.com/project/helivi/functions) → função `webhookPagamentoPix`.

### Mercado Pago

1. https://www.mercadopago.com.br/developers → sua aplicação → **Webhooks / Notificações**
2. Cole a URL acima (com `gateway=mercadopago` e `secret=`)
3. Evento: **Pagamentos** (`payment`)
4. Salve e use **Simular notificação** para testar

### Efi

1. https://sejaefi.com.br → **API → Webhooks**
2. Cole a URL com `gateway=efi&secret=...`
3. Evento: **PIX recebido / Cobrança paga**

Verifique os logs após o teste: `npm run logs` ou `firebase functions:log`.

---

## 7️⃣ DEPLOY EM PRODUÇÃO

### Publicar

```bash
cd helivi-functions
npm run deploy
```

Equivale a `firebase deploy --only functions`.

### Variáveis de ambiente em produção

Como as credenciais dos gateways ficam no **Firestore** (configuradas pelo app), **não** é preciso colocar tokens do Mercado Pago em variáveis de ambiente. Configure apenas o secret do webhook:

1. https://console.cloud.google.com/run?project=helivi
2. Selecione o serviço `webhookpagamentopix`
3. **Editar e implantar nova revisão → Variáveis e segredos**
4. Adicione `PIX_WEBHOOK_SECRET` (mesmo valor da URL do webhook)

> Se usar a Efi via `.env`/variáveis (fallback do `efiService`), configure também as `EFI_*` nos serviços `criarpagamentopix` e `verificarpagamentopix`. Para Mercado Pago não é necessário.

### Certificados Efi em produção

`*.pem` está no `.gitignore` e o CLI **não** os envia no deploy. Opções:

- Criar `helivi-functions/.firebaseignore` **sem** a regra `*.pem` (mantendo-os fora do Git), **ou**
- Armazenar os certificados no **Secret Manager** do Google Cloud.

> Aplicável **somente** se você usa a Efi. Para Mercado Pago não há certificado.

### Verificar functions publicadas

```bash
firebase functions:list
```

Functions esperadas:

- `criarColaborador`, `editarColaborador`, `excluirColaborador`
- `onPedidoCriado`, `onComandaCriada`, `onKdsCozinhaCriado`, `onKdsBalcaoCriado`
- `criarPagamentoPix`, `verificarPagamentoPix`, `salvarConfigPagamentoPix`, `simularConfirmacaoPixTeste`, `webhookPagamentoPix`

---

## 8️⃣ INTEGRAÇÃO NO PDV

A integração PIX **já está implementada** em `js/pdv.js` (criação do QR via `criarPagamentoPix`, monitoramento Firestore, verificação periódica via `verificarPagamentoPix`, modal de pagamento e botão de simulação/abertura do Mercado Pago).

Não é necessário copiar arquivos externos. Basta:

1. Ter as functions publicadas (ou emulador ativo)
2. Configurar o gateway em **Configurações → Pagamento PIX**
3. Abrir o PDV, selecionar **PIX** e confirmar — o QR Code abre automaticamente

---

## 🔐 SEGURANÇA

### ❌ Não fazer
- Colocar Access Token, Client Secret ou chave PIX no código-fonte
- Commitar `.env.local` ou certificados `.pem`
- Usar token `TEST-` (não funciona) ou misturar token de produção com Modo teste

### ✅ Fazer
- Configurar credenciais **pela tela do app** (gravadas no Firestore, ilegíveis pelo cliente)
- Restringir a alteração de pagamentos a usuários **admin** (já validado em `salvarConfigPagamentoPix`)
- Definir `PIX_WEBHOOK_SECRET` e usá-lo na URL do webhook
- Rotacionar tokens/certificados quando necessário

---

## 🆘 SOLUÇÃO DE PROBLEMAS

### Mercado Pago: "Token PRODUÇÃO não configurado"
Salve o Access Token `APP_USR-` em **Configurações → Pagamento PIX** (Mercado Pago).

### Mercado Pago: "Token TEST- não funciona"
A API `/v1/orders` não aceita `TEST-`. Em **Credenciais de produção** (ou no usuário de teste) copie o `APP_USR-`.

### Mercado Pago: "Conta sem chave PIX" (`13253 / without key`)
Cadastre uma **chave PIX** no app Mercado Pago, ou use **Modo teste** com token de vendedor de teste.

### Mercado Pago: `invalid_users` (402)
Conflito de credenciais. Em produção use **Token PRODUÇÃO** com **Modo teste desmarcado**. Em sandbox, use o **Token do vendedor de teste** com **Modo teste marcado**.

### Mercado Pago: 401 "Access Token inválido"
Token expirado/incorreto. Gere um novo `APP_USR-` no painel e salve novamente.

### "Comanda não encontrada" no emulador
O emulador Firestore precisa estar ativo (`npm run serve`) e a comanda deve existir antes de gerar o PIX.

### Webhook não atualiza a comanda
1. Confirme a URL no painel do gateway, incluindo `?gateway=...&secret=...`
2. Confira se `PIX_WEBHOOK_SECRET` bate (local e produção)
3. Verifique os logs: `firebase functions:log`
4. Confirme que o `txid`/id recebido corresponde ao `pixTxid` salvo na comanda

### Efi: "Certificado não encontrado"
Confira se o `.pem` do ambiente ativo está em `helivi-functions/functions/` (`npm run efi:status`).

---

## 📊 MONITORAMENTO

```bash
firebase functions:log          # tempo real
firebase functions:log -n 50    # últimos 50
npm run logs                    # atalho no package.json
```

No [Firebase Console](https://console.firebase.google.com/project/helivi/functions): invocações, erros, latência e memória.

Logs úteis do Mercado Pago: `[PIX Factory] Gerando cobrança via mercadopago`, `[MercadoPago] POST /v1/orders` e `[MercadoPago] Order OK`.

---

## 📈 MÉTRICAS ESPERADAS

| Métrica | Valor esperado |
|---------|----------------|
| Criar PIX | 2–5 s |
| Verificar status | 1–3 s |
| Taxa de sucesso | > 98% |
| Latência webhook | < 1 s |

---

## 📞 LINKS ÚTEIS

| Recurso | URL |
|---------|-----|
| Mercado Pago Developers | https://www.mercadopago.com.br/developers |
| Docs Checkout API (Orders) PIX | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix |
| Painel Efi | https://sejaefi.com.br |
| Docs API PIX Efi | https://dev.efipay.com.br/docs/api-pix |
| Firebase Console | https://console.firebase.google.com/project/helivi |

---

## ✅ VALIDAÇÃO FINAL

Antes de liberar para o cliente:

- [ ] Gateway selecionado e credenciais salvas em **Configurações → Pagamento PIX**
- [ ] (Mercado Pago) Token `APP_USR-` de produção + chave PIX cadastrada na conta
- [ ] Emulador + PDV geram QR Code
- [ ] Deploy concluído sem erros
- [ ] `PIX_WEBHOOK_SECRET` configurado (local e produção)
- [ ] Webhook configurado no painel do gateway (com `gateway=` e `secret=`)
- [ ] Credenciais fora do Git
- [ ] Fluxo PIX completo testado no PDV

---

**Documentação relacionada:**

- [README.md](./README.md) — visão geral do projeto
- [helivi-functions/GUIA_FUNCTIONS.md](./helivi-functions/GUIA_FUNCTIONS.md) — emuladores, colaboradores e deploy
