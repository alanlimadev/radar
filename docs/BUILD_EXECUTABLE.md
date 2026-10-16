# Guia de Construção do Executável Desktop (RADAR Desktop)

Este documento registra detalhadamente a arquitetura, pré-requisitos e o passo a passo para gerar o instalador executável oficial do **RADAR**:
- **Windows**: Instalador executável **`.exe` (NSIS)** (`RADAR-Quiz_1.0.0_x64-setup.exe`).
- **Linux (Debian/Ubuntu/Mint)**: Pacote instalador **`.deb`** (`RADAR-Quiz_1.0.0_amd64.deb`).
- **Linux (Universal)**: Executável portátil **`.AppImage`** (`RADAR-Quiz_1.0.0_amd64.AppImage`).

---

## 1. Visão Geral da Arquitetura

O sistema foi desenhado para que qualquer usuário leigo (professores, instrutores) consiga instalar e rodar a aplicação em um ambiente 100% offline (sem internet, sem Docker, sem Node.js e sem conhecimentos técnicos prévios):

```text
[RADAR-Quiz Instalador / AppImage / NSIS]
                  │
                  ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ RADAR-Quiz (App Nativo Tauri em Rust)                       │
  │   ├── WebView Nativa (Windows WebView2 / Linux WebKitGTK)   │
  │   └── Gerenciador de Processo Filho (Rust Command)          │
  │         │                                                   │
  │         ▼ Spawna em background (sem terminal visível):      │
  │       node index.js (NestJS Unificado na porta 3333)        │
  │         ├── Servindo a API REST e WebSocket Gateway         │
  │         ├── Servindo os arquivos estáticos do React         │
  │         └── Banco de Dados SQLite local                     │
  └─────────────────────────────────────────────────────────────┘
                  │
                  ▼
  [Dispositivos dos Alunos / Celulares via Hotspot Wi-Fi]
  Acessam http://<IP-DO-HOST>:3333/game escaneando o QR Code
```

### Principais Invariantes:
1. **Zero dependência externa na máquina final**: O executável inclui seu próprio runtime do Node.js (`node.exe` no Windows ou `node` no Linux), as engines nativas do Prisma e todo o frontend estático.
2. **Porta única (3333)**: Tanto o backend quanto a interface web dos celulares dos alunos utilizam exclusivamente a porta `3333`.
3. **Persistência Segura**: O banco SQLite (`radar.db`) é mantido no diretório de dados do usuário (`%APPDATA%` no Windows ou `~/.config` no Linux), garantindo que atualizações do executável não apaguem os dados.
4. **Logs automáticos**: O servidor redireciona toda sua saída para a pasta de logs do aplicativo (`radar-server.log`).

---

## 2. Pré-requisitos para Compilação

### Para Windows (`.exe` NSIS):
- **Node.js**: Versão 20+ (LTS).
- **Rust & Cargo**: Instalados via `rustup` (`x86_64-pc-windows-msvc`).
- **PowerShell**.

### Para Linux (`.deb` e `.AppImage` via WSL2 ou Ubuntu):
- **Distribuição**: Ubuntu/Debian (nativo ou no WSL2).
- **Bibliotecas do Sistema**:
  ```bash
  sudo apt install -y curl wget build-essential libwebkit2gtk-4.1-dev \
      libssl-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
  ```
- **Node.js**: Versão 20+ no Linux.
- **Rust & Cargo**: Instalados no Linux (`x86_64-unknown-linux-gnu`).

---

## 3. Como Gerar os Binários (Métodos Rápidos - 1 Comando)

### No Windows (Gerar `.exe`):
Execute a partir do diretório `radar-tcc/`:
```bash
npm run build:app
```
*(Ou execute `.\scripts\build-app.ps1`)*

O instalador será gerado em:
```
offline-game-quiz/src-tauri/target/release/bundle/nsis/RADAR-Quiz_1.0.0_x64-setup.exe
```

---

### No Linux / WSL2 (Gerar `.deb` e `.AppImage`):
No WSL ou terminal Linux, navegue até `radar-tcc/` e execute:
```bash
npm run build:app:linux
```
*(Ou execute `./scripts/build-app.sh`)*

Os pacotes serão gerados em:
- **Pacote Debian**:
  ```
  offline-game-quiz/src-tauri/target/release/bundle/deb/RADAR-Quiz_1.0.0_amd64.deb
  ```
- **AppImage Portátil**:
  ```
  offline-game-quiz/src-tauri/target/release/bundle/appimage/RADAR-Quiz_1.0.0_amd64.AppImage
  ```

---

## 4. Como Executar no Linux

### Usando o `.AppImage` (Sem instalação):
1. Dê permissão de execução:
   ```bash
   chmod +x RADAR-Quiz_1.0.0_amd64.AppImage
   ```
2. Execute diretamente:
   ```bash
   ./RADAR-Quiz_1.0.0_amd64.AppImage
   ```

### Usando o `.deb` (Instalação no sistema):
```bash
sudo dpkg -i RADAR-Quiz_1.0.0_amd64.deb
# Ou com o apt:
sudo apt install ./RADAR-Quiz_1.0.0_amd64.deb
```
O aplicativo ficará disponível no menu de aplicativos do sistema com o ícone do RADAR.

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
