# HELIVI — Guia de Functions e Testes Locais
## Como publicar as Firebase Functions e testar com Live Server no VS Code

---

## 📋 O QUE AS FUNCTIONS FAZEM

| Function | O que faz |
|---|---|
| `criarColaborador` | Admin cria conta completa (nome, email, senha, perfil) |
| `editarColaborador` | Atualiza dados e senha do colaborador |
| `excluirColaborador` | Remove do Auth e do Firestore |
| `onPedidoCriado` | Registra automaticamente o nome do atendente no pedido |
| `onComandaCriada` | Registra o atendente que abriu a comanda |
| `onKdsCozinhaCriado` | Registra quem enviou o pedido para a cozinha |
| `onKdsBalcaoCriado` | Registra quem enviou para o balcão |

---

## ✅ PRÉ-REQUISITOS

Antes de começar, instale:

1. **Node.js 18+**
   - Acesse: https://nodejs.org
   - Baixe a versão LTS e instale
   - Verifique: abra o terminal e digite `node --version`

2. **Firebase CLI**
   - No terminal, digite:
   ```
   npm install -g firebase-tools
   ```
   - Verifique: `firebase --version`

---

## 🚀 PASSO A PASSO — PUBLICAR AS FUNCTIONS

### Passo 1 — Login no Firebase
```bash
firebase login
```
Abrirá o navegador para você entrar com a conta Google do projeto.

---

### Passo 2 — Entrar na pasta das Functions
```bash
cd helivi-functions
```

---

### Passo 3 — Instalar dependências
```bash
npm install
```
Aguarde baixar as bibliotecas (firebase-admin, firebase-functions).

---

### Passo 4 — Publicar no Firebase
```bash
firebase deploy --only functions
```
Aguarde o deploy (pode levar 2-3 minutos).

Quando terminar, aparecerá algo como:
```
✔ functions[criarColaborador]: Deployed
✔ functions[editarColaborador]: Deployed
✔ functions[excluirColaborador]: Deployed
✔ functions[onPedidoCriado]: Deployed
...
Deploy complete!
```

---

### Passo 5 — Ativar o plano Blaze (obrigatório para Functions)
- As Firebase Functions exigem o plano **Blaze** (pay-as-you-go)
- Acesse: https://console.firebase.google.com/project/helivi/usage/details
- Clique em "Fazer upgrade" → Blaze
- ⚠️ **Não se preocupe com custo**: o plano Blaze tem uma cota gratuita generosa.
  Para um sistema de lanchonete, **o custo será R$ 0,00** (ou centavos por mês no máximo)
- Valores gratuitos incluídos todo mês:
  - 2 milhões de invocações de Functions
  - 400 mil GB-segundos de computação
  - 200 GB de transferência

---

## 🧪 TESTAR LOCALMENTE COM LIVE SERVER + EMULADOR

Esta é a parte mais legal — você testa **tudo** sem precisar publicar!

### Passo 1 — Iniciar o Emulador Firebase
```bash
cd helivi-functions
npm run serve
```

Vai aparecer:
```
✔ All emulators ready!
┌─────────────────┬──────────────┐
│ Emulator        │ Host:Port    │
├─────────────────┼──────────────┤
│ Authentication  │ localhost:9099│
│ Functions       │ localhost:5001│
│ Firestore       │ localhost:8080│
│ Emulator UI     │ localhost:4000│
└─────────────────┴──────────────┘
```

Abra http://localhost:4000 para ver o painel do emulador (dados, usuários, etc.)

---

### Passo 2 — Ativar o emulador no sistema HELIVI

No arquivo `helivi-final/js/firebase.js`, **descomente** a linha:
```javascript
// firebase.functions().useEmulator("localhost", 5001);
```
Para ficar assim:
```javascript
firebase.functions().useEmulator("localhost", 5001);
```

⚠️ **Lembre de comentar de volta antes de publicar para produção!**

---

### Passo 3 — Abrir o HELIVI com Live Server
- No VS Code, abra a pasta `helivi-final`
- Clique com botão direito em `index.html`
- Clique em **"Open with Live Server"**
- O sistema abrirá em `http://127.0.0.1:5500`

---

### Passo 4 — Testar
- Acesse **Colaboradores** no menu
- Preencha: Nome, E-mail, Senha e Perfil
- Clique em **"Criar Colaborador"**
- O usuário será criado no emulador
- No painel do emulador (localhost:4000) você vê o usuário criado em tempo real!

---

## 🔧 CONFIGURAÇÃO DE CORS (se necessário)

Se aparecer erro de CORS ao chamar as Functions localmente, adicione ao `firebase.json`:
```json
{
  "functions": {
    "source": ".",
    "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build 2>/dev/null; true"]
  }
}
```

---

## 📱 VER O NOME DO ATENDENTE NO SISTEMA

Após publicar as Functions, toda comanda e pedido criado mostrará automaticamente quem atendeu.

No **histórico**, aparecerá:
```
Pedido #42 — Mesa 5 · João
Atendente: Maria (maria@email.com)
```

No **KDS da cozinha**, aparecerá no card:
```
#42 · Mesa 5
Atendente: Maria
```

---

## ❓ PROBLEMAS COMUNS

**"Functions não encontradas" ao chamar do sistema:**
- Verifique se o deploy foi feito com sucesso
- Verifique se o SDK do Firebase Functions está carregado no HTML
  (deve ter: `<script src=".../firebase-functions-compat.js">`)

**"Permission denied" ao criar colaborador:**
- Verifique as regras do Firestore (deve permitir escrita para usuários autenticados)

**"Billing account not found":**
- Você precisa ativar o plano Blaze no Firebase Console

**Emulador não conecta:**
- Verifique se a porta 5001 não está em uso
- Tente: `firebase emulators:start --only functions`

---

## 📞 SUPORTE

Se tiver dúvidas em qualquer etapa, é só perguntar!
