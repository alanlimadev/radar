# Guia de Construção do Executável Desktop (RADAR Desktop Installer)

Este documento registra detalhadamente a arquitetura, pré-requisitos e o passo a passo para gerar o instalador executável oficial do **RADAR (`RADAR-Quiz_1.0.0_x64-setup.exe`)** no Windows.

---

## 1. Visão Geral da Arquitetura

O sistema foi desenhado para que qualquer usuário leigo (professores, instrutores) consiga instalar e rodar a aplicação em um ambiente 100% offline (sem internet, sem Docker, sem Node.js e sem conhecimentos técnicos prévios):

```text
[RADAR-Quiz_1.0.0_x64-setup.exe] (Instalador NSIS gerado pelo Tauri)
                  │
                  ▼ (Instala em %LOCALAPPDATA%\RADAR-Quiz\)
  ┌─────────────────────────────────────────────────────────────┐
  │ RADAR-Quiz.exe (App Nativo Tauri em Rust)                   │
  │   ├── WebView Nativa do Windows (carrega o frontend)        │
  │   └── Gerenciador de Processo Filho (Rust Command)          │
  │         │                                                   │
  │         ▼ Spawna em background (sem terminal preto):        │
  │       node.exe index.js (NestJS Unificado na porta 3333)    │
  │         ├── Servindo a API REST e WebSocket Gateway         │
  │         ├── Servindo os arquivos estáticos do React         │
  │         └── Banco de Dados SQLite (%APPDATA%\RADAR-Quiz\)   │
  └─────────────────────────────────────────────────────────────┘
                  │
                  ▼
  [Dispositivos dos Alunos / Celulares via Hotspot Wi-Fi]
  Acessam http://192.168.137.1:3333/game escaneando o QR Code
```

### Principais Invariantes:
1. **Zero dependência externa na máquina final**: O executável inclui seu próprio runtime do Node.js (`node.exe`), as engines do Prisma e todo o frontend estático.
2. **Porta única (3333)**: Tanto o backend quanto a interface web dos celulares dos alunos utilizam exclusivamente a porta `3333`.
3. **Persistência Segura**: O banco SQLite (`radar.db`) é mantido em `%APPDATA%\RADAR-Quiz\data\radar.db`, garantindo que atualizações do executável não apaguem os dados e que não sejam necessários privilégios de Administrador para escrita.
4. **Logs automáticos**: O servidor redireciona toda sua saída para `%APPDATA%\com.radar.quiz\logs\radar-server.log`.

---

## 2. Pré-requisitos para Compilação (Ambiente de Desenvolvimento)

Para compilar o instalador em uma máquina de desenvolvimento, são necessários:
- **Node.js**: Versão 20+ (LTS) instalada no sistema.
- **Rust & Cargo**: Instalados via `rustup` (alvo `x86_64-pc-windows-msvc`).
- **Tauri CLI**: `@tauri-apps/cli` v2 (incluso nas dependências ou via `npx`).
- **PowerShell**: Para execução do script automatizado de build.

---

## 3. Como Gerar o Instalador (Método Rápido - 1 Comando)

Na raiz do repositório (`tcc/`), execute no PowerShell:

```powershell
.\build-app.ps1
```

O script executa automaticamente os 5 passos necessários e gera o arquivo instalador em:
```
offline-game-quiz\src-tauri\target\release\bundle\nsis\RADAR-Quiz_1.0.0_x64-setup.exe
```

---

## 4. Passo a Passo Detalhado (Manual ou Diagnóstico)

Se for necessário executar ou depurar o processo passo a passo:

### Passo 4.1: Compilar o Backend NestJS
No diretório `radar-tcc`:
```bash
cd radar-tcc
npm run build
```

### Passo 4.2: Gerar o Bundle Standalone do Backend
Empacota o NestJS e suas dependências TypeScript em um único arquivo JavaScript otimizado (`dist-bundle/index.js`):
```bash
npx @vercel/ncc build dist/main.js -o dist-bundle --external @prisma/client
```

### Passo 4.3: Compilar o Frontend React
No diretório `offline-game-quiz`:
```bash
cd ../offline-game-quiz
npm run build
```

### Passo 4.4: Sincronizar os Recursos do Servidor Embutido
Os arquivos compilados são organizados na pasta `offline-game-quiz/src-tauri/server/`:
- `node.exe`: Copiado de `C:\Program Files\nodejs\node.exe` (ou runtime redistribuível).
- `index.js`: Copiado de `radar-tcc/dist-bundle/index.js`.
- `client/`: Copiado de `offline-game-quiz/dist/` (entregue pelo `@nestjs/serve-static`).
- `radar.db`: Copiado de `radar-tcc/prisma/radar.db` (template com schema SQLite).
- `node_modules/`: Copia as pastas `@prisma` e `.prisma` com o `query_engine-windows.dll.node`.

### Passo 4.5: Gerar o Instalador com o Tauri
Dentro de `offline-game-quiz`:
```bash
npx @tauri-apps/cli build
```
O Tauri compilará o binário Rust (`app.exe`), empacotará a pasta `server/` como recurso e utilizará o NSIS para gerar o instalador `RADAR-Quiz_1.0.0_x64-setup.exe`.

---

## 5. Estrutura de Arquivos Crítica do Tauri

- **`offline-game-quiz/src-tauri/tauri.conf.json`**:
  - `bundle.targets`: `["nsis"]` (gera o `.exe` de instalação clássico).
  - `bundle.resources`: `["server/**/*"]` (embutir o backend e runtime).
- **`offline-game-quiz/src-tauri/src/lib.rs`**:
  - Spawna `node.exe index.js` em background com a flag `CREATE_NO_WINDOW` no Windows.
  - Redireciona logs para `%APPDATA%\com.radar.quiz\logs\radar-server.log`.
  - Mata o processo do servidor automaticamente ao fechar o app (`CloseRequested` e `Destroyed`).

---

## 6. Diagnóstico e Resolução de Problemas

1. **Servidor Indisponível ou Erro 500 ao Abrir o App**:
   - Inspecione o arquivo de log do servidor em:
     `%APPDATA%\com.radar.quiz\logs\radar-server.log`
2. **IP do Hotspot não Selecionado**:
   - O backend prioriza o IP `192.168.137.1` (padrão do Hotspot Móvel do Windows).
   - O painel do lobby (`AdminLobbyView`) possui botões para alternar manualmente entre interfaces caso o Wi-Fi e o Hotspot estejam ligados simultaneamente.
3. **Bloqueio de Conexão no Celular**:
   - Certifique-se de que o Hotspot do Windows está ativo e os celulares estão conectados nele.
   - Caso o Windows Firewall solicite permissão na primeira execução do app, selecione **Permitir em Redes Privadas**.
