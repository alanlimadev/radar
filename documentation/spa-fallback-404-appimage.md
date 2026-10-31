# Bug: 404 nas rotas do SPA no Linux (`/game`, `/loginScreen`, deep links)

## O que acontece

No Linux (**`.deb`** e **`.AppImage`**), a raiz do app responde normalmente, mas **qualquer
rota do frontend responde 404**:

```text
GET /                      -> 200 (carrega o app)
GET /game                  -> 404  {"message":"Not Found","error":"Not Found","statusCode":404}
GET /game?sessionId=abc    -> 404
GET /loginScreen           -> 404
GET /qualquer-rota/x       -> 404
```

O sintoma mais visível: o aluno escaneia o QR Code no lobby, o celular abre
`http://<ip>:3333/game?sessionId=...` e recebe **404**.

O que **não** era afetado: as rotas da API. Por exemplo `/quizzes` continuava respondendo
`401` (JSON), ou seja, o servidor estava no ar e a API saudável.

No **Windows** o mesmo código funcionava perfeitamente. Isso é o que tornava o bug confuso.

## Por que acontece

O fallback de SPA era delegado ao `ServeStaticModule` (`@nestjs/serve-static`), que serve o
`index.html` para rotas não encontradas com algo assim:

```js
// @nestjs/serve-static/dist/loaders/express.loader.js (aprox. linhas 60-92)
res.sendFile(indexFilePath, null, callback)   // indexFilePath ABSOLUTO
```

Esse `res.sendFile` cai no módulo **`send`** do Express. E o `send` tem uma regra de
segurança: **rejeita qualquer caminho que contenha um componente iniciado por `.`**
(*dotfile*):

```js
// node_modules/send/index.js (aprox. linhas 457-471)
if (containsDotFile(parts)) {
  ...
  return this.error(404)
}
```

Agora o detalhe do Linux: o **AppImage monta o aplicativo em `/tmp/.mount_XXXX/...`**. O
diretório **`.mount_XXXX` começa com ponto** — é um dot-dir. Logo, o `indexFilePath` absoluto
do `@nestjs/serve-static` era algo como:

```text
/tmp/.mount_RADAR123/usr/lib/Qonect/server/client/index.html
      └── dot-dir ──┘
```

O `send` detectava o dot-dir, chamava `this.error(404)` — e todas as rotas do SPA devolviam
404. No `.deb` o mesmo acontece quando o app é executado de qualquer pasta dot (**e**, de
forma geral, o código ficava refém de onde o pacote é montado).

### Por que `/` funcionava e `/game` não?

Porque são caminhos de código diferentes:

- `/` → `express.static(root)`: o `send` recebe o caminho **relativo à URL** (`index.html`),
  que ele mesmo resolve contra o `root`. Como o caminho avaliado não contém dotfile, funciona.
- `/game` (rota sem arquivo correspondente) → fallback do `@nestjs/serve-static`: chamava
  `sendFile` com o caminho **absoluto** do disco. Aí o `.mount_XXXX` entra na análise do
  `send` → dotfile → 404.

Essa assimetria (`/` = 200, `/game` = 404) é a assinatura desse bug.

### Por que só no Linux?

No Windows o app é instalado em algo como
`C:\Users\<user>\AppData\Local\Qonect\...` — nenhum componente começa com ponto, então o
`send` aceitava o caminho absoluto normalmente.

## Como reproduzir

Reproduzido no próprio Windows, sem AppImage, só para isolar a causa:

1. Copiar o conteúdo de `qonect/src-tauri/server/` para uma pasta cujo caminho
   tenha um componente iniciado por `.` (ex.: `...\.mount_RADAR-test\`).
2. Rodar `node index.js` dentro dela.
3. Resultado com o código antigo:

   ```text
   GET /       -> 200
   GET /game   -> 404 {"message":"Not Found","error":"Not Found","statusCode":404}
   ```

Isso confirma que a causa é o dot no caminho — não o Linux, não o AppImage em si.

## Correção

**Commit:** `radar@452ca07` (branch `feat/game-improvements-and-scoring`)

1. **Removido o `ServeStaticModule`** de `src/app.module.ts`.
2. O client passou a ser servido por caminho de **URL** via
   `app.useStaticAssets(clientPath)` em `src/main.ts`.
3. Criado o **`SpaFallbackFilter`** (`src/core/http/spa-fallback.filter.ts`), que:
   - só age em `NotFoundException` cujo método/mensagem indicam rota de página não casada
     (`Cannot GET` / `Cannot HEAD`);
   - deixa a API intacta (um `/quizzes` sem token continua `401` JSON, não vira HTML);
   - serve o index com **caminho relativo + `root`**:

     ```ts
     res.sendFile('index.html', { root: this.clientRoot })
     ```

   Com `{ root }`, o `send` resolve o caminho internamente e **não** enxerga o dot-dir do
   AppImage. A montagem pode estar em `/tmp/.mount_XXXX` que funciona.

## Como verificar

### Teste unitário

```bash
cd radar
npx jest src/core/http/spa-fallback.filter.spec.ts
```

Cobre: rota de página não casada → index; rota de API → não intercepta; método/rota fora do
escopo → não intercepta.

### Smoke test (por pacote)

Windows:

```powershell
powershell -File radar/scripts/smoke-test-server.ps1 -ServerDir qonect/src-tauri/server
```

Linux (dentro do container de build):

```bash
docker run --rm -w / \
  -v "<workspace>/qonect/src-tauri/target/release/bundle:/b:ro" \
  -v "<workspace>/radar/scripts/linux-docker:/s:ro" \
  radar-linux-builder:latest \
  bash /s/smoke-test-linux.sh /b/deb/*.deb /b/appimage/*.AppImage
```

Ambos copiam/extraem o pacote para um caminho com **dot-dir** e exigem:

```text
/                  -> 200
/game              -> 200 (e o corpo é o HTML do client)
/game?sessionId=1  -> 200
/loginScreen       -> 200
/qualquer-rota/x   -> 200
/quizzes           -> 401
```

Esses smoke tests rodam automaticamente ao final dos builds (`scripts/build-app.ps1` e
`scripts/linux-docker/build-inner.sh`) — se `/game` voltar a dar 404, **o build falha**.

## Lições / regras

1. **Nunca** usar `res.sendFile(<caminho absoluto>)` para servir o SPA. Use
   `res.sendFile('index.html', { root })`.
2. O fallback de SPA deve ser explícito (um filter) e não engolir as rotas da API.
3. Caminhos de execução podem conter *dot-dirs* (AppImage, Snap, caches). Qualquer código que
   lide com caminho absoluto precisa considerar isso.
4. Bug que só aparece em um SO deve ser reproduzido **isolando a variável** (aqui: o dot-dir),
   não apenas no ambiente final.
