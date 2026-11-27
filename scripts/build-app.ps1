Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Qonect - Compilação do Instalador Desktop" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Detecta se está sendo executado da raiz do workspace ou de dentro de radar/scripts
$Root = $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "radar"))) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if (-not (Test-Path (Join-Path $Root "radar"))) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$BackendDir = Join-Path $Root "radar"
$FrontendDir = Join-Path $Root "qonect"
$ServerTarget = Join-Path $FrontendDir "src-tauri\server"

# Localiza dinamicamente o node.exe da máquina do desenvolvedor
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodePath -or -not (Test-Path $NodePath)) {
    if (Test-Path "C:\Program Files\nodejs\node.exe") {
        $NodePath = "C:\Program Files\nodejs\node.exe"
    } else {
        throw "Node.js não foi encontrado no PATH do sistema. Certifique-se de que o Node.js está instalado."
    }
}

Write-Host "`n[1/6] Compilando Backend (radar)..." -ForegroundColor Yellow
Set-Location $BackendDir
# Regenera o Prisma Client antes do tsc: garante que o client nunca fique
# defasado do schema (causava TS2339) e que o engine em .prisma seja da plataforma correta.
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "Erro ao gerar o Prisma Client (prisma generate)" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Erro ao compilar o backend" }

Write-Host "`n[2/6] Gerando Bundle Standalone do Backend..." -ForegroundColor Yellow
npx @vercel/ncc build dist/main.js -o dist-bundle --external @prisma/client
# O ncc copia um radar.db vazio para dist-bundle por causa dos caminhos de template
# em PrismaService; o bundle final usa apenas index.js, então remove o resto.
if (Test-Path "dist-bundle\radar.db") { Remove-Item -Force "dist-bundle\radar.db" }
if ($LASTEXITCODE -ne 0) { throw "Erro ao empacotar com ncc" }

Write-Host "`n[3/6] Compilando Frontend (qonect)..." -ForegroundColor Yellow
Set-Location $FrontendDir
npm run build
if ($LASTEXITCODE -ne 0) { throw "Erro ao compilar o frontend" }

Write-Host "`n[4/6] Sincronizando arquivos do servidor embutido..." -ForegroundColor Yellow
# Limpa o staging para não arrastar artefatos de outro SO (ex.: binário `node` do Linux)
if (Test-Path $ServerTarget) { Remove-Item -Recurse -Force $ServerTarget }
New-Item -ItemType Directory -Force -Path $ServerTarget | Out-Null

Copy-Item $NodePath -Destination (Join-Path $ServerTarget "node.exe") -Force
Copy-Item (Join-Path $BackendDir "dist-bundle\index.js") -Destination (Join-Path $ServerTarget "index.js") -Force

if (Test-Path (Join-Path $ServerTarget "client")) { Remove-Item -Recurse -Force (Join-Path $ServerTarget "client") }
Copy-Item -Recurse (Join-Path $FrontendDir "dist") (Join-Path $ServerTarget "client")

# Gera sempre um template vazio e limpo (nunca empacota o banco de desenvolvimento,
# que pode conter usuarios/quizzes locais). O arquivo fica ignorado pelo git.
$TemplateDir = Join-Path $BackendDir "prisma\build"
$TemplateDb = Join-Path $TemplateDir "radar.db"
New-Item -ItemType Directory -Force -Path $TemplateDir | Out-Null
if (Test-Path $TemplateDb) { Remove-Item -Force $TemplateDb }

$PreviousDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = "file:./build/radar.db"
Push-Location $BackendDir
try {
    npx prisma db push --skip-generate
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $TemplateDb)) {
        throw "Erro ao gerar o banco template vazio (prisma db push)"
    }
} finally {
    Pop-Location
    if ($null -eq $PreviousDatabaseUrl) {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
        $env:DATABASE_URL = $PreviousDatabaseUrl
    }
}

Copy-Item $TemplateDb -Destination (Join-Path $ServerTarget "radar.db") -Force

$ModulesTarget = Join-Path $ServerTarget "node_modules"
if (-not (Test-Path $ModulesTarget)) { New-Item -ItemType Directory -Force -Path $ModulesTarget | Out-Null }
# Copia apenas o runtime do Prisma. O @prisma/engines (schema-engine/migrate, ~36 MB)
# é exclusivo da CLI e nunca é carregado em runtime pelo servidor embutido.
New-Item -ItemType Directory -Force -Path (Join-Path $ModulesTarget "@prisma") | Out-Null
Copy-Item -Recurse (Join-Path $BackendDir "node_modules\@prisma\client") (Join-Path $ModulesTarget "@prisma\client") -Force
Copy-Item -Recurse (Join-Path $BackendDir "node_modules\.prisma") (Join-Path $ModulesTarget ".prisma") -Force

Write-Host "`n[5/6] Gerando Instalador Executável com Tauri (NSIS)..." -ForegroundColor Yellow
Set-Location $FrontendDir
npx @tauri-apps/cli build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw "Erro ao gerar o instalador com o Tauri" }

# Smoke test obrigatório: garante que o servidor embutido atende o SPA a partir de um
# caminho com dot-dir (como o /tmp/.mount_XXXX do AppImage). Ver documentation/known-issues-and-regressions.md
Write-Host "`n[6/6] Smoke test do servidor embutido (caminho com dot-dir)..." -ForegroundColor Yellow
Set-Location $BackendDir
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "smoke-test-server.ps1") -ServerDir $ServerTarget
if ($LASTEXITCODE -ne 0) { throw "Smoke test falhou: o servidor embutido nao atende /game corretamente" }

Write-Host "`n✅ Build finalizado com sucesso!" -ForegroundColor Green
Write-Host "O instalador .exe estará na pasta: qonect\src-tauri\target\release\bundle\nsis\" -ForegroundColor Cyan
Set-Location $Root
