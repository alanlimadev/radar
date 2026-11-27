# Problemas Conhecidos e Guardas de Regressão

Este documento centraliza os bugs que já chegaram a um **instalador publicado** do Qonect
desktop (`radar` + app Tauri `qonect`), com sintoma, causa raiz, correção e
**como impedir que volte**.

> **Regra do projeto:** todo bug que chegar a um instalador publicado precisa virar uma
> entrada neste documento **e**, quando possível, um teste automatizado (unitário ou smoke
> test). Os smoke tests rodam automaticamente ao final de cada build — ver
> [release-checklist.md](./release-checklist.md).

## Índice

| # | Problema | Arquivo(s) afetado(s) |
|---|----------|------------------------|
| 1 | [404 nas rotas do SPA no Linux (`/game`, `/loginScreen`, deep links)](#1-404-nas-rotas-do-spa-no-linux) | `src/main.ts`, `src/app.module.ts`, `src/core/http/spa-fallback.filter.ts` |
| 2 | [Erro 500 ao abrir o app (SQLite ausente/corrompido)](#2-erro-500-ao-abrir-o-app-sqlite) | `src/prisma/prisma.service.ts` |
| 3 | [WebSocket não conecta / cai ao trocar de tela](#3-websocket-não-conecta--cai-ao-trocar-de-tela) | `src/services/websocket.ts`, `src/hooks/useGameSession.ts` (frontend) |
| 4 | [Link/QR com IP errado](#4-linkqr-com-ip-errado) | `src/core/network/ip.util.ts` |
| 5 | [Binário do SO errado embutido no pacote](#5-binário-do-so-errado-embutido-no-pacote) | `scripts/build-app.ps1`, `scripts/linux-docker/build-inner.sh` |

---

## 1. 404 nas rotas do SPA no Linux

**Arquivo:** `documentation/spa-fallback-404-appimage.md` (detalhamento completo)

### Sintoma

Somente no Linux (`.deb` e `.AppImage`): a raiz `/` responde **200**, mas qualquer rota do
frontend responde **404**:

```json
{ "message": "Not Found", "error": "Not Found", "statusCode": 404 }
```

Afetados: `/game`, `/game?sessionId=...` (link aberto pelo QR Code), `/loginScreen` e
qualquer deep link. As rotas da API continuavam funcionando (ex.: `/quizzes` → 401 JSON).
No Windows **não** acontecia.

### Causa raiz

O fallback de SPA usava o `ServeStaticModule` do `@nestjs/serve-static`, que serve o
`index.html` via `res.sendFile(<caminho absoluto>)`. O módulo `send` (usado internamente
pelo Express) **recusa caminhos que contenham um componente iniciado por `.`** (regra de
*dotfile*), chamando `this.error(404)`:

```js
// node_modules/send/index.js (aprox. linhas 457-471)
if (containsDotFile(parts)) {
  ...
  return this.error(404)
}
```

O AppImage monta o aplicativo em `/tmp/.mount_XXXX/...` — o diretório `.mount_XXXX` é um
*dot-dir*, então **todo** `sendFile` com caminho absoluto era rejeitado. A raiz `/` funcionava
porque, nesse caso, o `express.static(root)` avalia o caminho da **URL** (`/` → `index.html`),
que não contém ponto — daí o comportamento assimétrico (`/` = 200, `/game` = 404).

### Correção

- **Commit:** `radar@452ca07`
- Removido o `ServeStaticModule` de `src/app.module.ts`.
- Client servido por caminho de URL via `app.useStaticAssets(clientPath)` em `src/main.ts`.
- Novo `SpaFallbackFilter` (`src/core/http/spa-fallback.filter.ts`) que só age em
  `NotFoundException` de rota não casada (`Cannot GET/HEAD`) e serve o index com caminho
  **relativo + root**:

  ```ts
  res.sendFile('index.html', { root: this.clientRoot })
  ```

  Assim o `send` resolve o caminho internamente e não vê dotfile.

### Como não regredir

- **Teste unitário:** `src/core/http/spa-fallback.filter.spec.ts` (4 casos) — garante que o
  filter só responde ao `NotFound` de página e que não interfere na API.
- **Smoke test automático:** `scripts/smoke-test-server.ps1` (Windows) e
  `scripts/linux-docker/smoke-test-linux.sh` (Linux), ambos executados ao final dos builds.
  Eles sobem o servidor a partir de um caminho com dot-dir (`.mount_RADAR-smoke`) e falham se
  `/game` não devolver o HTML do client.
- **Nunca** voltar a usar `res.sendFile(<caminho absoluto>)` nem `ServeStaticModule` para o
  fallback de SPA. Use sempre `{ root }` com caminho relativo.

---

## 2. Erro 500 ao abrir o app (SQLite)

### Sintoma

O app abre e mostra erro **500** nas requisições. Log (`qonect-server.log`) aponta falha do
Prisma ao acessar/abrir o banco.

### Causa raiz

O banco SQLite do usuário (em `%APPDATA%\com.qonect.quiz\data\radar.db` no Windows ou
`~/.local/share/com.qonect.quiz/data/radar.db` no Linux) podia estar ausente, vazio ou
incompleto (ex.: primeira execução interrompida, arquivo de template inválido), e o servidor
não fazia nenhuma recuperação no startup.

### Correção

- **Commits:** `radar@53b1324` e `radar@248b733`
- `src/prisma/prisma.service.ts` faz um **self-heal** no startup: se o banco do usuário não
  existir (ou estiver inválido), ele recria o schema a partir do template embutido antes de
  aceitar conexões. O caminho do banco é resolvido por `RADAR_DATA_DIR` (definido pelo app
  Tauri) com fallback para `process.cwd()/radar.db`.

### Como não regredir

- O self-heal usa o template `radar.db` embutido no pacote — os scripts de build precisam
  continuar copiando `radar/prisma/radar.db` para `src-tauri/server/radar.db`.
- Ao testar manualmente, apague `.../data/radar.db` e confirme que o app sobe sem 500.

---

## 3. WebSocket não conecta / cai ao trocar de tela

**Arquivo:** `documentation/websocket-connection-bug.md` (detalhamento completo)

### Sintoma

- Às vezes o `connect`/`radar:roomJoined` não chega ao abrir a página e a UI fica "desconectada"
  (intermitente).
- Ao finalizar a partida ou voltar de tela e iniciar outra, a nova sessão não recebe eventos.

### Causa raiz

Duas causas combinadas:

1. **Race condition:** `io('url')` inicia o handshake imediatamente; se o listener
   `socket.on('connect', ...)` for registrado depois (React ainda montando), o evento se
   perde.
2. **Socket recriado/descartado entre telas:** telas chamavam `disconnect()` ao sair
   ("finalizar"/"voltar"), derrubando o socket e os listeners das telas seguintes.

### Correção

- **Commit (frontend):** `qonect@194ae7a`
- O socket passou a ser um **singleton vivo entre telas** (`src/services/websocket.ts`), com
  listeners registrados de forma resiliente a reconexão.
- "Finalizar"/"voltar" usam `leaveSession()` em vez de `disconnect()` — a conexão permanece e
  a sessão é que é encerrada (`src/hooks/useGameSession.ts`).

### Como não regredir

- Não chamar `disconnect()` em navegação/finalização; usar `leaveSession()`.
- Não criar um novo `io()` por tela — reutilizar o singleton.
- Ao testar: criar sessão → entrar no celular → finalizar → criar **nova** sessão na mesma
  janela e confirmar que os eventos chegam.

---

## 4. Link/QR com IP errado

### Sintoma

O link/QR exibido no lobby apontava para um IP que os celulares não alcançavam (ex.: IP de
adaptador virtual — Docker/WSL/VMware/VirtualBox — ou `127.0.0.1`).

### Causa raiz

A seleção de interface de rede não filtrava adaptadores virtuais nem priorizava o hotspot do
Windows, escolhendo uma interface inadequada.

### Correção

- **Commit:** `radar@0410da3`
- `src/core/network/ip.util.ts` passou a usar um filtro **híbrido**: nome da interface **+**
  faixas de IP virtuais conhecidas, **sem nunca fabricar** um IP.
- Prioritiza `192.168.137.1` (hotspot móvel do Windows) quando presente.
- O painel do lobby permite alternar manualmente entre as interfaces.

### Como não regredir

- **Teste unitário:** `src/core/network/ip.util.spec.ts`.
- A regra continua: **nunca inventar** um IP; se nada for elegível, informar claramente em vez
  de mostrar um endereço inalcançável.

---

## 5. Binário do SO errado embutido no pacote

### Sintoma

- Pacote Linux enorme e/ou com `node.exe` (Windows) dentro, ou pacote Windows com `node`
  (Linux) — resquício do build anterior, já que o staging `src-tauri/server/` é compartilhado
  entre os dois builds.

### Causa raiz

Os scripts de build **adicionavam** arquivos ao staging sem limpá-lo antes, então binários do
SO do build anterior permaneciam na pasta e eram embutidos no pacote seguinte.

### Correção

- Os scripts passaram a **limpar o staging antes de montá-lo**:
  - `scripts/build-app.ps1` (Windows): `Remove-Item -Recurse -Force $ServerTarget` antes de
    copiar `node.exe`, `client/` e `node_modules/`.
  - `scripts/linux-docker/build-inner.sh` (Linux): `rm -rf "$SERVER"` antes de copiar `node`,
    `client/` e `node_modules/`.

### Como não regredir

- Os smoke tests verificam explicitamente que **não existe `node.exe`** dentro do `.deb` nem
  do `.AppImage`.
- Nunca remover a limpeza do staging dos dois scripts.

---

## Pendências conhecidas (ainda não corrigidas)

- **"Flash" da tela de pergunta antes do lobby:** ao entrar como jogador, a tela de pergunta
  ativa pode piscar por um instante antes de o lobby aparecer. Cosmético, fora do escopo das
  correções acima.

---

## Referências

- `docs/BUILD_EXECUTABLE.md` — arquitetura e como gerar os binários.
- `documentation/release-checklist.md` — checklist obrigatório antes de publicar.
- `documentation/spa-fallback-404-appimage.md` — investigação detalhada do bug #1.
- `documentation/websocket-connection-bug.md` — investigação detalhada do bug #3.
