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
| `criarPagamentoPix` | Callable | Gera QR Code PIX (Efi Bank) para uma comanda |
| `verificarPagamentoPix` | Callable | Consulta status do pagamento PIX |
| `webhookPagamentoPix` | HTTP POST | Recebe confirmação de pagamento da Efi |

> Configuração completa do PIX (credenciais, certificados, webhook): [GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md)

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
...
Deploy complete!
```

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

Requer credenciais Efi em `helivi-functions/.env.local` (veja [GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md)):

```bash
cd helivi-functions
npm run test:pix        # diagnóstico OAuth
npm run test:pix:cob    # OAuth + cobrança de teste
```

No PDV: abra comanda → pagamento **PIX** → confirme. O emulador Firestore deve estar ativo.

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
| `npm run efi:status` | Ambiente Efi atual |
| `npm run efi:homolog` | Usar homologação |
| `npm run efi:producao` | Usar produção |
| `npm run test:pix` | Testar OAuth Efi |

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

- Credenciais em `helivi-functions/.env.local`
- Certificado `.pem` correto em `functions/`
- Ambiente alinhado: `npm run efi:status`
- Comanda deve existir no emulador Firestore antes de gerar PIX

**Erro de CORS**

- Confirme que o Live Server usa porta 5500 ou 5501
- Verifique a lista `CORS` em `functions/index.js`

---

## 📞 SUPORTE

Documentação adicional:

- [README.md](../README.md)
- [GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md) — PIX Efi, webhook e deploy
