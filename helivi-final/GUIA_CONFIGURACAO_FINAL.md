# ⚙️ GUIA DE CONFIGURAÇÃO FINAL — PIX EFI BANK

Checklist completo para configurar, testar e publicar a integração PIX do HELIVI PDV.

---

## 📋 CHECKLIST ANTES DO DEPLOY

### ✅ Pré-requisitos
- [ ] Node.js **20+** instalado (`node --version`)
- [ ] Firebase CLI instalado (`npm install -g firebase-tools`)
- [ ] Certificados **.pem** da Efi em `helivi-functions/functions/`
- [ ] Credenciais Efi Bank (Client ID, Secret, Chave PIX) — homologação e/ou produção
- [ ] Acesso ao painel Efi: https://sejaefi.com.br

---

## 1️⃣ INSTALAÇÃO DE DEPENDÊNCIAS

```bash
cd helivi-functions
npm install
firebase login
```

Verificar pacotes principais:

```bash
npm list axios node-rsa firebase-functions
```

---

## 2️⃣ CONFIGURAR CREDENCIAIS EFI

Copie o arquivo de exemplo e preencha com os dados do painel Efi (**API → Minhas Aplicações → PDV HELIVI**):

```bash
cd helivi-functions
cp .env.example .env.local
```

Edite `helivi-functions/.env.local`:

```env
EFI_AMBIENTE=homolog

EFI_HOMOLOG_CLIENT_ID=seu_client_id_homolog
EFI_HOMOLOG_CLIENT_SECRET=seu_client_secret_homolog
EFI_HOMOLOG_PIX_KEY=sua_chave_pix_homolog

EFI_PROD_CLIENT_ID=seu_client_id_producao
EFI_PROD_CLIENT_SECRET=seu_client_secret_producao
EFI_PROD_PIX_KEY=sua_chave_pix_producao
```

**Alternativa:** copie `functions/efi.local.json.example` → `functions/efi.local.json` e preencha os mesmos dados.

**Trocar ambiente:**

```bash
npm run efi:homolog    # homologação
npm run efi:producao   # produção
npm run efi:status     # ver ambiente atual
```

---

## 3️⃣ VERIFICAR CERTIFICADOS .pem

O código usa certificados **.pem** (não .p12):

| Ambiente     | Arquivo em `helivi-functions/functions/`      |
|--------------|-----------------------------------------------|
| Homologação  | `homologacao-927842-PDV HELIVI.pem`           |
| Produção     | `producao-927842-PDV HELIVI.pem`              |

**Windows (PowerShell):**

```powershell
dir "helivi-functions\functions\*.pem"
```

**Linux / macOS:**

```bash
ls -la helivi-functions/functions/*.pem
```

**Se o arquivo não existir:**
1. Acesse https://sejaefi.com.br → **API → Meus Certificados**
2. Baixe o certificado da aplicação **PDV HELIVI**
3. Exporte ou converta para **.pem** e salve com o nome acima em `helivi-functions/functions/`

> ⚠️ Arquivos `.pem` e `.env.local` estão no `.gitignore` — nunca commite credenciais ou certificados.

---

## 4️⃣ TESTAR LOCALMENTE

### Teste rápido (OAuth Efi, sem emulador)

```bash
cd helivi-functions
npm run test:pix              # OAuth homolog
npm run test:pix:cob          # OAuth + criar cobrança de teste
npm run test:pix:producao     # OAuth produção
```

### Emulador Firebase + PDV

**Terminal 1 — emuladores:**

```bash
cd helivi-functions
npm run serve
```

Saída esperada:

```
✔ All emulators ready!
│ Functions  │ localhost:5001 │
│ Firestore  │ localhost:8080 │
│ Auth       │ localhost:9099 │
│ Emulator UI│ localhost:4000 │
```

**Terminal 2 — frontend:**

Abra a pasta raiz `helivi-final` com **Live Server** (VS Code). Em `localhost` ou `127.0.0.1`, o arquivo `js/firebase.js` conecta automaticamente aos emuladores — **não é necessário editar código manualmente**.

Painel do emulador: http://localhost:4000

### Testar PIX no PDV

1. Faça login no sistema
2. Abra uma comanda com itens
3. Selecione pagamento **PIX** e confirme
4. O QR Code deve aparecer (requer credenciais Efi válidas e emulador ativo)

> As functions PIX são **callable** (`onCall`). Use o SDK Firebase no frontend ou o PDV — não teste com `curl` direto na URL do emulador.

---

## 5️⃣ CONFIGURAR WEBHOOK NO PAINEL EFI

### Passo 1 — Acessar o painel

1. https://sejaefi.com.br
2. **API → Webhooks** (ou Configurações → Webhooks)

### Passo 2 — Adicionar webhook

| Campo    | Valor |
|----------|-------|
| **URL**  | URL pública da function `webhookPagamentoPix` (veja abaixo) |
| **Evento** | PIX recebido / Cobrança paga |
| **Ativo** | ✅ Habilitado |

**Como obter a URL após o deploy:**

```bash
cd helivi-functions
npm run deploy
```

Anote a URL exibida no terminal ou consulte no [Firebase Console](https://console.firebase.google.com/project/helivi/functions) → função `webhookPagamentoPix`.

Formato típico (Functions v2):

```
https://us-central1-helivi.cloudfunctions.net/webhookPagamentoPix
```

ou URL Cloud Run (`*.run.app`) — use sempre a URL exata mostrada no deploy.

### Passo 3 — Salvar e testar

1. Salve o webhook no painel Efi
2. Use **Enviar teste** no painel (se disponível)
3. Verifique logs: `npm run logs` ou `firebase functions:log`

---

## 6️⃣ DEPLOY EM PRODUÇÃO

### Plano Blaze

Firebase Functions exige o plano **Blaze**. Para o volume de uma lanchonete, o custo costuma ser **R$ 0,00** (cota gratuita generosa).

### Publicar

```bash
cd helivi-functions
npm run deploy
```

### Variáveis de ambiente em produção

O arquivo `.env.local` **não vai para o Git** e, por padrão, **não é enviado no deploy** (`.gitignore`). Configure as variáveis no **Google Cloud Console**:

1. https://console.cloud.google.com/run?project=helivi
2. Selecione o serviço da function PIX (ex.: `criarpagamentopix`)
3. **Editar e implantar nova revisão** → **Variáveis e segredos**
4. Adicione: `EFI_AMBIENTE`, `EFI_PROD_CLIENT_ID`, `EFI_PROD_CLIENT_SECRET`, `EFI_PROD_PIX_KEY` (ou homolog, conforme ambiente)

Repita para `verificarpagamentopix` e `webhookpagamentopix`.

### Certificados em produção

Como `*.pem` está no `.gitignore`, o Firebase CLI **não envia** esses arquivos no deploy. Opções:

- **Recomendado:** incluir os `.pem` no pacote de deploy criando `helivi-functions/.firebaseignore` **sem** a regra `*.pem` (mantenha-os fora do Git)
- **Alternativa:** armazenar certificados no Secret Manager do Google Cloud

Verificar functions publicadas:

```bash
firebase functions:list
```

Functions esperadas:

- `criarColaborador`, `editarColaborador`, `excluirColaborador`
- `onPedidoCriado`, `onComandaCriada`, `onKdsCozinhaCriado`, `onKdsBalcaoCriado`
- `criarPagamentoPix`, `verificarPagamentoPix`, `webhookPagamentoPix`

---

## 7️⃣ TESTAR FLUXO COMPLETO

### Teste 1 — Gerar QR Code (console do navegador, com usuário logado)

```javascript
firebase.functions().httpsCallable('criarPagamentoPix')({
  comandaId: 'ID_DA_COMANDA_EXISTENTE',
  valor: 15000  // centavos — R$ 150,00
}).then(result => {
  console.log('QR Code:', result.data.qrcode);
  console.log('TXID:', result.data.txid);
}).catch(err => console.error('Erro:', err));
```

### Teste 2 — Verificar status

```javascript
firebase.functions().httpsCallable('verificarPagamentoPix')({
  txid: 'TXID_RETORNADO_ACIMA'
}).then(result => {
  console.log('Status:', result.data.status);
  console.log('Pago?', result.data.pago);
}).catch(err => console.error('Erro:', err));
```

### Teste 3 — Simular webhook (formato Efi)

```bash
curl -X POST \
  "https://SUA_URL_DEPLOY/webhookPagamentoPix" \
  -H "Content-Type: application/json" \
  -d '{
    "pix": [{
      "txid": "TXID_DA_COMANDA",
      "valor": "150.00",
      "pagador": { "cpf": "12345678900" },
      "horario": "2026-06-11T10:35:22Z"
    }]
  }'
```

---

## 8️⃣ INTEGRAÇÃO NO PDV

A integração PIX **já está implementada** em `js/pdv.js` (criação do QR, monitoramento Firestore, verificação periódica e modal de pagamento).

Não é necessário copiar arquivos externos. Basta:

1. Ter as functions publicadas (ou emulador ativo)
2. Abrir o PDV, selecionar **PIX** como forma de pagamento
3. Confirmar o pagamento — o QR Code abre automaticamente

---

## 🔐 SEGURANÇA

### ❌ Não fazer

- Colocar Client Secret ou chave PIX no código-fonte
- Commitar `.env.local`, `efi.local.json` ou certificados
- Usar credenciais de homologação em produção

### ✅ Fazer

- Manter credenciais em `helivi-functions/.env.local` (desenvolvimento)
- Usar variáveis de ambiente no Google Cloud (produção)
- Rotacionar certificados quando expirarem no painel Efi

---

## 🆘 SOLUÇÃO DE PROBLEMAS

### "Certificado não encontrado"

```
Erro: ENOENT ... homologacao-927842-PDV HELIVI.pem
```

**Solução:** confira se o `.pem` correto está em `helivi-functions/functions/` para o ambiente ativo (`npm run efi:status`).

---

### "Unauthorized" / "Invalid or inactive credentials"

**Solução:**
1. Client ID e Secret da **mesma aba** (Homologação ou Produção) do painel Efi
2. `EFI_AMBIENTE` alinhado ao certificado e credenciais (`npm run efi:homolog` ou `efi:producao`)
3. Certificado não expirado — regenere no painel se necessário
4. Reinicie o emulador após alterar `.env.local`

---

### "Comanda não encontrada" no emulador

**Solução:** o emulador Firestore precisa estar ativo (`npm run serve`) e a comanda deve existir no emulador antes de gerar o PIX.

---

### Webhook não atualiza a comanda

**Solução:**
1. Confirme a URL do webhook no painel Efi (URL exata do deploy)
2. Teste manualmente com `curl` (formato `pix[]` acima)
3. Verifique logs: `firebase functions:log`
4. Confirme que o `txid` do webhook corresponde ao `pixTxid` salvo na comanda

---

### "TXID obrigatório"

**Solução:** passe `txid` válido retornado por `criarPagamentoPix`; valor deve ser > 0 em centavos.

---

## 📊 MONITORAMENTO

```bash
firebase functions:log          # tempo real
firebase functions:log -n 50    # últimos 50
npm run logs                    # atalho no package.json
```

No [Firebase Console](https://console.firebase.google.com/project/helivi/functions): invocações, erros, latência e memória.

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
| Painel Efi | https://sejaefi.com.br |
| Docs API PIX | https://dev.efipay.com.br/docs/api-pix |
| Firebase Console | https://console.firebase.google.com/project/helivi |
| Status Efi | https://status.sejaefi.com.br |

---

## ✅ VALIDAÇÃO FINAL

Antes de liberar para o cliente:

- [ ] `npm run test:pix` passou
- [ ] Emulador + PDV geram QR Code
- [ ] Deploy concluído sem erros
- [ ] Webhook configurado e testado
- [ ] Certificado válido
- [ ] Credenciais fora do Git
- [ ] Variáveis de ambiente configuradas em produção
- [ ] Fluxo PIX completo testado no PDV

---

**Documentação relacionada:**

- [README.md](./README.md) — visão geral do projeto
- [helivi-functions/GUIA_FUNCTIONS.md](./helivi-functions/GUIA_FUNCTIONS.md) — emuladores, colaboradores e deploy
