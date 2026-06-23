# HELIVI PDV

Sistema de ponto de venda (PDV) para restaurantes, com gestão de pedidos, cozinha (KDS), balcão, produtos, usuários e integração PIX via Efi Bank.

## Estrutura do projeto

```
helivi-final/
├── index.html          # Login
├── dashboard.html      # Painel principal
├── balcao.html         # KDS balcão
├── cozinha.html        # KDS cozinha
├── produtos.html       # Cadastro de produtos
├── usuarios.html       # Gestão de colaboradores
├── historico.html      # Histórico de pedidos
├── lucro.html          # Relatório de lucro
├── config.html         # Configurações
├── css/                # Estilos
├── js/                 # Lógica do frontend
├── image/              # Logo e assets
└── helivi-functions/   # Firebase Cloud Functions (PIX, colaboradores, triggers)
```

## Pré-requisitos

- Node.js 20+
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- Conta Firebase (projeto `helivi`)
- Conta Efi Bank com API PIX habilitada

## Configuração rápida

### 1. Frontend (desenvolvimento local)

Abra a pasta raiz com **Live Server** (VS Code) ou qualquer servidor estático. Em `localhost`, o app conecta automaticamente aos emuladores Firebase.

### 2. Firebase Functions

```bash
cd helivi-functions
npm install
firebase login
```

Copie os arquivos de exemplo e preencha com suas credenciais:

```bash
cp .env.example .env.local
cp functions/efi.local.json.example functions/efi.local.json   # opcional
```

Coloque os certificados `.pem` da Efi em `helivi-functions/functions/` (não são versionados — veja `.gitignore`).

### 3. Emuladores locais

```bash
cd helivi-functions
npm run serve
```

| Serviço    | Porta |
|------------|-------|
| Functions  | 5001  |
| Firestore  | 8080  |
| Auth       | 9099  |
| Emulator UI| 4000  |

### 4. PIX — troca de ambiente

```bash
npm run efi:homolog    # homologação
npm run efi:producao   # produção
npm run efi:status     # ver ambiente atual
npm run test:pix       # testar OAuth
```

### 5. Deploy

```bash
cd helivi-functions
npm run deploy
```

## Documentação adicional

- [CHECKLIST.md](./CHECKLIST.md) — checklist operacional e validação do projeto
- [GUIA_CONFIGURACAO_FINAL.md](./GUIA_CONFIGURACAO_FINAL.md) — checklist completo de deploy PIX
- [helivi-functions/GUIA_FUNCTIONS.md](./helivi-functions/GUIA_FUNCTIONS.md) — functions, emuladores e testes

## Segurança

Nunca commite:

- `.env.local` ou `efi.local.json`
- Certificados `.pem` / `.p12`
- Client secrets da Efi Bank

Use sempre os arquivos `.example` como referência.

## Licença

Projeto privado — HELIVI.
