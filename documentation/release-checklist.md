# Checklist de Build e Publicação (Desktop)

Checklist obrigatório para gerar e publicar instaladores do RADAR desktop
(`.exe`, `.deb`, `.AppImage`). Ele existe para que os problemas catalogados em
[known-issues-and-regressions.md](./known-issues-and-regressions.md) **não voltem** a chegar
ao usuário final.

Os itens marcados como **automático** já rodam sozinhos ao final dos builds — se falharem, o
build falha e nada deve ser publicado.

---

## 0. Antes de começar

- [ ] **Nenhuma instância do RADAR aberta.** Os smoke tests usam a porta fixa `3333`.
      Se houver um servidor antigo rodando, o teste falha (ou pior, você testa o build antigo).
- [ ] Repositórios limpos e na branch correta:
      - `radar-tcc` → `feat/game-improvements-and-scoring`
      - `offline-game-quiz` → `feat/ui-improvements-quiz-experience`
- [ ] `npm install` em dia nos dois projetos.

---

## 1. Build

### Windows (`.exe` NSIS)

```powershell
cd radar-tcc
npm run build:app
```

Ao final roda automaticamente:

- [ ] **(automático)** Smoke test do servidor embutido em caminho com dot-dir
      (`scripts/smoke-test-server.ps1`).

Artefato: `offline-game-quiz/src-tauri/target/release/bundle/nsis/RADAR-Quiz_1.0.0_x64-setup.exe`

### Linux (`.deb` + `.AppImage`, via Docker Desktop)

```powershell
cd radar-tcc
npm run build:app:linux:docker
```

Ao final roda automaticamente (`scripts/linux-docker/smoke-test-linux.sh`):

- [ ] **(automático)** Extrai `.deb` e `.AppImage` para um dot-dir e valida as rotas do SPA.
- [ ] **(automático)** Confirma que **não há `node.exe`** (binário do Windows) em nenhum dos
      dois pacotes.

Artefatos em `offline-game-quiz/src-tauri/target/release/bundle/{deb,appimage}/`.

---

## 2. Verificações manuais (quando o smoke test não cobre)

- [ ] **Rotas do SPA** respondem 200 e com o HTML do client:
      `/`, `/game`, `/game?sessionId=1`, `/loginScreen`, `/qualquer-rota/x`.
- [ ] **API** continua JSON: `/quizzes` sem token → `401` (não HTML).
- [ ] **Deep link do QR** (o ponto histórico de falha): subir o app, abrir o lobby, escanear
      o QR de um celular e confirmar que `/game?sessionId=...&playerName=...` abre a tela do
      jogador.
- [ ] **Seleção de IP**: o link do lobby aponta para um IP alcançável pelo celular (não
      Docker/WSL/VM/VirtualBox/`127.0.0.1`). Hotspot do Windows → `192.168.137.1`.
- [ ] **WebSocket**: criar sessão → entrar com o celular → finalizar → criar **outra** sessão
      na mesma janela e confirmar que os eventos chegam (sem `disconnect()` entre telas).
- [ ] **Banco**: apagar `.../data/radar.db` e abrir o app — deve subir sem 500 (self-heal).
- [ ] **Runtime embutido**: o pacote Linux traz `node` (não `node.exe`) e o Windows traz
      `node.exe` (não `node`).

---

## 3. Publicação

O release pertence ao repositório do **frontend** (`juniormieg/offline-game-quiz`).
O `radar-tcc` é o framework usado no build.

- [ ] Confirmar a **tag** e que os artefatos correspondem ao commit publicado:
      `git rev-parse v1.0.0^{commit}`
- [ ] Conferir os **SHA-256** dos três artefatos:

      ```powershell
      Get-FileHash <arquivo> -Algorithm SHA256
      ```

- [ ] Subir os três assets (substituindo os antigos):

      ```bash
      gh release upload v1.0.0 \
        <...RADAR-Quiz_1.0.0_x64-setup.exe> \
        <...RADAR-Quiz_1.0.0_amd64.deb> \
        <...RADAR-Quiz_1.0.0_amd64.AppImage> \
        --clobber
      ```

- [ ] Atualizar as **notas do release** (`gh release edit v1.0.0 --notes-file <arquivo>`),
      com a tabela de SHA-256. Gravar sempre em **UTF-8** (encoding quebrado já ocorreu).

---

## 4. Após publicar — orientação a quem já tem a versão antiga

Os problemas **não se corrigem sozinhos** em máquinas que já têm a versão anterior instalada:

- [ ] Baixar/reinstalar o instalador **novo** (o nome do arquivo é o mesmo — não reutilizar o
      arquivo antigo do disco).
- [ ] **Encerrar o app antigo** e garantir que nada ficou na porta `3333` antes de abrir o
      novo:

      ```bash
      pkill -f RADAR-Quiz
      sleep 2
      ss -ltnp | grep 3333      # deve voltar vazio
      ```

- [ ] Confirmar que o processo em execução é o build novo:

      ```bash
      md5sum /proc/<PID>/cwd/index.js
      ```

      (o PID vem de `ss -ltnp | grep 3333`). Comparar com o `index.js` interno do pacote novo.
- [ ] Se ainda der 404: pegar a URL exata e o log
      (`~/.local/share/com.radar.quiz/logs/radar-server.log` no Linux,
      `%APPDATA%\com.radar.quiz\logs\radar-server.log` no Windows).

---

## Referências

- [known-issues-and-regressions.md](./known-issues-and-regressions.md) — catálogo de bugs e guardas.
- [spa-fallback-404-appimage.md](./spa-fallback-404-appimage.md) — bug do 404 no Linux.
- [websocket-connection-bug.md](./websocket-connection-bug.md) — bug do WebSocket.
- `../docs/BUILD_EXECUTABLE.md` — arquitetura e build detalhado.
