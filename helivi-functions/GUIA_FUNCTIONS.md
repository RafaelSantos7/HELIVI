# HELIVI — Guia de Functions e Testes Locais

Como publicar as Firebase Functions e testar o sistema com Live Server no VS Code.

---

## 📋 O QUE AS FUNCTIONS FAZEM

| Function | Tipo | O que faz |
|----------|------|-----------|
| `criarColaborador` | Callable | Admin cria conta (nome, e-mail, senha, perfil) |
| `editarColaborador` | Callable | Atualiza dados e senha do colaborador |
| `excluirColaborador` | Callable | Remove do Auth e do Firestore |
| `onPedidoCriado` | Trigger Firestore | Registra o atendente no pedido |
| `onComandaCriada` | Trigger Firestore | Registra quem abriu a comanda |
| `onKdsCozinhaCriado` | Trigger Firestore | Registra quem enviou para a cozinha |
| `onKdsBalcaoCriado` | Trigger Firestore | Registra quem enviou para o balcão |
| `criarPagamentoPix` | Callable | Gera QR Code PIX para uma comanda (gateway ativo: Mercado Pago ou Efi) |
| `verificarPagamentoPix` | Callable | Consulta status do pagamento PIX |
| `salvarConfigPagamentoPix` | Callable (admin) | Salva o gateway ativo e os segredos no Firestore (ilegíveis pelo cliente) |
| `simularConfirmacaoPixTeste` | Callable (só emulador) | Marca a comanda como paga para testes locais |
| `webhookPagamentoPix` | HTTP POST | Recebe a notificação do gateway, valida na API e confirma o pagamento |

> **PIX multi-gateway:** foi implantada a **API do Mercado Pago** (`/v1/orders`), agora o gateway recomendado; a **Efi Bank** segue como alternativa. Um `pixFactory` lê o gateway ativo e os segredos do Firestore (`configuracoes/pagamentos` e `configuracoes/segredos_pagamento`) e delega ao service correto. O gateway e as credenciais são definidos **no app** em **Configurações → Pagamento PIX**.

> Configuração completa do PIX (Mercado Pago, Efi, webhook, deploy): [GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md)

---

## ✅ PRÉ-REQUISITOS

1. **Node.js 20+**
   - https://nodejs.org (versão LTS)
   - Verifique: `node --version`

2. **Firebase CLI**
   ```bash
   npm install -g firebase-tools
   firebase --version
   ```

3. **Conta Firebase** com acesso ao projeto `helivi`

---

## 🚀 PUBLICAR AS FUNCTIONS

### Passo 1 — Login

```bash
firebase login
```

### Passo 2 — Instalar dependências

```bash
cd helivi-functions
npm install
```

### Passo 3 — Deploy

```bash
npm run deploy
```

Equivalente a `firebase deploy --only functions`. Aguarde 2–3 minutos.

Saída esperada:

```
✔ functions[criarColaborador]: Deployed
✔ functions[criarPagamentoPix]: Deployed
✔ functions[salvarConfigPagamentoPix]: Deployed
✔ functions[webhookPagamentoPix]: Deployed
...
Deploy complete!
```

A URL do webhook é exibida ao final (ex.: `https://webhookpagamentopix-<hash>-uc.a.run.app`). Use-a no painel do gateway com `?gateway=mercadopago&secret=...` (veja [GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md)).

### Passo 4 — Plano Blaze (obrigatório)

Firebase Functions exige o plano **Blaze** (pay-as-you-go):

- https://console.firebase.google.com/project/helivi/usage/details
- Para o volume de uma lanchonete, o custo costuma ser **R$ 0,00** (cota gratuita mensal)

---

## 🧪 TESTAR LOCALMENTE (LIVE SERVER + EMULADOR)

Teste tudo sem publicar na nuvem.

### Passo 1 — Iniciar emuladores

```bash
cd helivi-functions
npm run serve
```

O script libera portas ocupadas e inicia Auth, Firestore e Functions:

```
✔ All emulators ready!
┌─────────────────┬──────────────┐
│ Authentication  │ localhost:9099 │
│ Functions       │ localhost:5001 │
│ Firestore       │ localhost:8080 │
│ Emulator UI     │ localhost:4000 │
└─────────────────┴──────────────┘
```

Painel: http://localhost:4000

### Passo 2 — Emuladores no frontend (automático)

O arquivo `js/firebase.js` detecta `localhost` / `127.0.0.1` e conecta aos emuladores automaticamente:

- Firestore → `:8080`
- Auth → `:9099`
- Functions → `:5001`

**Não é necessário descomentar linhas manualmente.** Em produção (`helivi.web.app`), o sistema usa Firebase na nuvem.

### Passo 3 — Abrir o HELIVI

- VS Code → pasta raiz `helivi-final`
- Botão direito em `index.html` → **Open with Live Server**
- Sistema em `http://127.0.0.1:5500`

### Passo 4 — Testar colaboradores

1. Acesse **Colaboradores** no menu
2. Preencha nome, e-mail, senha e perfil
3. Clique em **Criar Colaborador**
4. Veja o usuário criado em http://localhost:4000 → Authentication

### Passo 5 — Testar PIX (opcional)

As credenciais do gateway são definidas **no app**, em **Configurações → Pagamento PIX** (gravadas no Firestore, inclusive no emulador):

- **Mercado Pago** (recomendado): selecione o gateway e cole o **Access Token `APP_USR-`**. Para testes sem cobrança real, use **Modo teste** com o token de um vendedor de teste.
- **Efi** (alternativo): preencha Client ID, Client Secret e Chave PIX (e mantenha o `.pem` em `functions/`).

No PDV: configure o gateway → abra comanda → pagamento **PIX** → confirme. O emulador Firestore deve estar ativo.

No emulador, o botão **🧪 Simular pagamento** chama `simularConfirmacaoPixTeste` e confirma a comanda sem pagar de verdade (disponível **somente** no emulador local).

Diagnóstico OAuth da Efi (somente Efi):

```bash
cd helivi-functions
npm run test:pix        # diagnóstico OAuth Efi
npm run test:pix:cob    # OAuth + cobrança de teste
```

---

## 🔧 CORS

CORS já está configurado em `functions/index.js` para:

- `http://127.0.0.1:5500`, `http://localhost:5500`
- `https://helivi.web.app`, `https://helivi.firebaseapp.com`

Se usar outra porta do Live Server (ex.: 5501), ela já está na lista. Só altere o código se usar uma origem diferente.

---

## 📱 NOME DO ATENDENTE NO SISTEMA

Após publicar as triggers, comandas e pedidos registram automaticamente quem atendeu.

**Histórico:**

```
Pedido #42 — Mesa 5 · João
Atendente: Maria (maria@email.com)
```

**KDS cozinha:**

```
#42 · Mesa 5
Atendente: Maria
```

---

## 📜 SCRIPTS ÚTEIS

| Comando | Descrição |
|---------|-----------|
| `npm run serve` | Emuladores (Auth + Firestore + Functions) |
| `npm run deploy` | Publicar functions |
| `npm run logs` | Ver logs em produção |
| `npm run efi:status` | Ambiente Efi atual (só Efi) |
| `npm run efi:homolog` | Usar homologação Efi (só Efi) |
| `npm run efi:producao` | Usar produção Efi (só Efi) |
| `npm run test:pix` | Testar OAuth Efi (só Efi) |

> Mercado Pago não usa esses scripts — suas credenciais ficam no Firestore (configuradas em **Configurações → Pagamento PIX**).

---

## ❓ PROBLEMAS COMUNS

**"Functions não encontradas"**

- Confirme que `npm run serve` está rodando (local) ou que o deploy terminou sem erro (produção)
- Verifique se o HTML carrega `firebase-functions-compat.js`

**"Permission denied" ao criar colaborador**

- Usuário precisa estar autenticado
- Verifique regras do Firestore para escrita autenticada

**"Billing account not found"**

- Ative o plano Blaze no Firebase Console

**Emulador não conecta / porta em uso**

- O script `npm run serve` tenta liberar portas automaticamente
- Feche instâncias antigas do emulador
- Confira se nada mais usa as portas 5001, 8080 ou 9099

**PIX falha no emulador**

- Gateway e credenciais salvos em **Configurações → Pagamento PIX**
- Mercado Pago: token `APP_USR-` (nunca `TEST-`); produção exige chave PIX cadastrada na conta
- Efi: certificado `.pem` correto em `functions/` e ambiente alinhado (`npm run efi:status`)
- Comanda deve existir no emulador Firestore antes de gerar PIX

**Erro de CORS**

- Confirme que o Live Server usa porta 5500 ou 5501
- Verifique a lista `CORS` em `functions/index.js`

---

## 📞 SUPORTE

Documentação adicional:

- [README.md](../README.md)
- [GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md) — PIX Efi, webhook e deploy
