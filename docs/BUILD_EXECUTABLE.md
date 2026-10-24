# Guia de Construção do Executável Desktop (RADAR Desktop)

Este documento registra detalhadamente a arquitetura, pré-requisitos e o passo a passo para gerar o instalador executável oficial do **RADAR**:
- **Windows**: Instalador executável **`.exe` (NSIS)** (`RADAR-Quiz_1.1.0_x64-setup.exe`).
- **Linux (Debian/Ubuntu/Mint)**: Pacote instalador **`.deb`** (`RADAR-Quiz_1.1.0_amd64.deb`).
- **Linux (Universal)**: Executável portátil **`.AppImage`** (`RADAR-Quiz_1.1.0_amd64.AppImage`).

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
3. **Persistência Segura**: O banco SQLite (`radar.db`) é mantido no diretório de dados do usuário: `%APPDATA%\com.radar.quiz\data\` no Windows ou `~/.local/share/com.radar.quiz/data/` no Linux, garantindo que atualizações do executável não apaguem os dados.
4. **Logs automáticos**: O servidor redireciona toda sua saída para a pasta de logs do aplicativo (`%APPDATA%\com.radar.quiz\logs\radar-server.log` no Windows; `~/.local/share/com.radar.quiz/logs/radar-server.log` no Linux).

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
offline-game-quiz/src-tauri/target/release/bundle/nsis/RADAR-Quiz_1.1.0_x64-setup.exe
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
  offline-game-quiz/src-tauri/target/release/bundle/deb/RADAR-Quiz_1.1.0_amd64.deb
  ```
- **AppImage Portátil**:
  ```
  offline-game-quiz/src-tauri/target/release/bundle/appimage/RADAR-Quiz_1.1.0_amd64.AppImage
  ```

---

### Build Linux a partir do Windows / macOS (Docker)

O Tauri **não cross-compila** de Windows para Linux. Para gerar os pacotes Linux a partir de uma máquina Windows/macOS (ou de um WSL sem as bibliotecas de sistema do Tauri), use o ambiente Docker versionado neste repositório.

**Pré-requisito:** Docker Desktop instalado e **em execução**.

**Windows (1 comando):**
```powershell
npm run build:app:linux:docker
# ou, diretamente:
.\scripts\build-app-docker.ps1
# recriar a imagem após editar o Dockerfile:
.\scripts\build-app-docker.ps1 -RebuildImage
```

**Linux / macOS:**
```bash
npm run build:app:linux:docker:sh
# ou:
REBUILD_IMAGE=1 ./scripts/build-app-docker.sh
```

**Como funciona:**
1. Constrói (na primeira execução) a imagem `radar-linux-builder` — Ubuntu 24.04 + Rust + Node 22 + libs do Tauri — definida em `radar-tcc/scripts/linux-docker/Dockerfile`.
2. Executa `radar-tcc/scripts/linux-docker/build-inner.sh` dentro do container, montando a raiz do workspace em `/src`.
3. Devolve os pacotes para `offline-game-quiz/src-tauri/target/release/bundle/{deb,appimage}/`.

**Notas:**
- `build-inner.sh` gera os bundles `deb` e `appimage` em execuções separadas, para que uma falha em um não impeça o outro.
- O AppImage é empacotado com `APPIMAGE_EXTRACT_AND_RUN=1`, portanto não exige FUSE.
- O runtime Node embutido no pacote é o binário Linux (ELF) do container, e o Prisma gera o engine `debian-openssl-3.0.x`.
- Arquivos relacionados: `radar-tcc/scripts/build-app-docker.ps1`, `radar-tcc/scripts/build-app-docker.sh`, `radar-tcc/scripts/linux-docker/Dockerfile`, `radar-tcc/scripts/linux-docker/build-inner.sh`.

---


## 4. Como Executar no Linux

### Usando o `.AppImage` (Sem instalação):
1. Dê permissão de execução:
   ```bash
   chmod +x RADAR-Quiz_1.1.0_amd64.AppImage
   ```
2. Execute diretamente:
   ```bash
   ./RADAR-Quiz_1.1.0_amd64.AppImage
   ```

### Usando o `.deb` (Instalação no sistema):
```bash
sudo dpkg -i RADAR-Quiz_1.1.0_amd64.deb
# Ou com o apt:
sudo apt install ./RADAR-Quiz_1.1.0_amd64.deb
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
Os arquivos compilados são organizados na pasta `offline-game-quiz/src-tauri/server/` (**o staging é limpo antes de montar**, para não arrastar o binário do outro SO):
- `node.exe`: Copiado de `C:\Program Files\nodejs\node.exe` (ou runtime redistribuível).
- `index.js`: Copiado de `radar-tcc/dist-bundle/index.js`.
- `client/`: Copiado de `offline-game-quiz/dist/` (servido por `app.useStaticAssets` + `SpaFallbackFilter` — **não** mais pelo `@nestjs/serve-static`, que quebrava em caminhos com dot-dir; ver `documentation/spa-fallback-404-appimage.md`).
- `radar.db`: Copiado de `radar-tcc/prisma/radar.db` (template com schema SQLite).
- `node_modules/`: Copia as pastas `@prisma` e `.prisma` com o `query_engine-windows.dll.node`.

> **Atenção:** o staging `src-tauri/server/` é compartilhado entre o build Windows e o Linux.
> Sempre limpe-o antes de copiar (os scripts já fazem isso) para não embutir `node.exe` no
> pacote Linux nem `node` no pacote Windows.

### Passo 4.5: Gerar o Instalador com o Tauri
Dentro de `offline-game-quiz`:
```bash
npx @tauri-apps/cli build
```
O Tauri compilará o binário Rust (`app.exe`), empacotará a pasta `server/` como recurso e utilizará o NSIS para gerar o instalador `RADAR-Quiz_1.1.0_x64-setup.exe`.

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
4. **Somente no Linux: `/` abre, mas `/game` / `/loginScreen` dão 404 (JSON "Not Found")**:
   - É o bug de *dot-dir* do `res.sendFile` (o AppImage monta em `/tmp/.mount_XXXX`). Se o
     código-fonte já tem a correção, provavelmente você está rodando um pacote antigo.
   - Confira qual build está em execução: `md5sum /proc/<PID>/cwd/index.js` (o PID vem de
     `ss -ltnp | grep 3333`) e compare com o `index.js` interno do pacote novo. Encerre o app
     antigo (`pkill -f RADAR-Quiz`) e confirme que a porta 3333 ficou livre antes de reabrir.
   - Detalhes: `documentation/spa-fallback-404-appimage.md`.

---

## 7. Verificação Obrigatória (Smoke Tests)

Os builds já executam smoke tests automaticamente ao final; se falharem, **o build falha e os
artefatos não devem ser publicados**. Eles existem porque alguns bugs só aparecem no pacote
final (ex.: 404 do SPA em caminhos com dot-dir).

### Windows (`scripts/smoke-test-server.ps1`)

Executado ao final de `npm run build:app`. Manualmente:

```powershell
powershell -File radar-tcc/scripts/smoke-test-server.ps1 -ServerDir offline-game-quiz/src-tauri/server
```

Copia o servidor embutido para um caminho com **dot-dir** (`.mount_RADAR-smoke`), sobe o
servidor e exige: `/`, `/game`, `/game?sessionId=1`, `/loginScreen`, rota aleatória → **200**;
`/quizzes` → **401**; e `/game` devolvendo o HTML do client.

> Usa a porta fixa **3333** — feche o app antes de rodar.

### Linux (`scripts/linux-docker/smoke-test-linux.sh`)

Executado ao final de `npm run build:app:linux:docker` (dentro do container). Manualmente:

```bash
docker run --rm -w / \
  -v "<workspace>/offline-game-quiz/src-tauri/target/release/bundle:/b:ro" \
  -v "<workspace>/radar-tcc/scripts/linux-docker:/s:ro" \
  radar-linux-builder:latest \
  bash /s/smoke-test-linux.sh /b/deb/*.deb /b/appimage/*.AppImage
```

Usa sempre o artefato mais recente de cada pasta (pode haver builds antigos no `bundle/`).
Extrai cada pacote para um dot-dir, valida as mesmas rotas **e** confirma que não há
`node.exe` (binário do Windows) embutido.

### Checklist completo

Ver `documentation/release-checklist.md`.
