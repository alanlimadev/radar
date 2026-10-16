Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  RADAR - Compilação do Instalador Desktop" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Detecta se está sendo executado da raiz do workspace ou de dentro de radar-tcc/scripts
$Root = $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "radar-tcc"))) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if (-not (Test-Path (Join-Path $Root "radar-tcc"))) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$BackendDir = Join-Path $Root "radar-tcc"
$FrontendDir = Join-Path $Root "offline-game-quiz"
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

Write-Host "`n[1/5] Compilando Backend (radar-tcc)..." -ForegroundColor Yellow
Set-Location $BackendDir
npm run build
if ($LASTEXITCODE -ne 0) { throw "Erro ao compilar o backend" }

Write-Host "`n[2/5] Gerando Bundle Standalone do Backend..." -ForegroundColor Yellow
npx @vercel/ncc build dist/main.js -o dist-bundle --external @prisma/client
if ($LASTEXITCODE -ne 0) { throw "Erro ao empacotar com ncc" }

Write-Host "`n[3/5] Compilando Frontend (offline-game-quiz)..." -ForegroundColor Yellow
Set-Location $FrontendDir
npm run build
if ($LASTEXITCODE -ne 0) { throw "Erro ao compilar o frontend" }

Write-Host "`n[4/5] Sincronizando arquivos do servidor embutido..." -ForegroundColor Yellow
if (-not (Test-Path $ServerTarget)) { New-Item -ItemType Directory -Force -Path $ServerTarget | Out-Null }

Copy-Item $NodePath -Destination (Join-Path $ServerTarget "node.exe") -Force
Copy-Item (Join-Path $BackendDir "dist-bundle\index.js") -Destination (Join-Path $ServerTarget "index.js") -Force

if (Test-Path (Join-Path $ServerTarget "client")) { Remove-Item -Recurse -Force (Join-Path $ServerTarget "client") }
Copy-Item -Recurse (Join-Path $FrontendDir "dist") (Join-Path $ServerTarget "client")

if (Test-Path (Join-Path $BackendDir "prisma\radar.db")) {
    Copy-Item (Join-Path $BackendDir "prisma\radar.db") -Destination (Join-Path $ServerTarget "radar.db") -Force
}

$ModulesTarget = Join-Path $ServerTarget "node_modules"
if (-not (Test-Path $ModulesTarget)) { New-Item -ItemType Directory -Force -Path $ModulesTarget | Out-Null }
Copy-Item -Recurse (Join-Path $BackendDir "node_modules\@prisma") (Join-Path $ModulesTarget "@prisma") -Force
Copy-Item -Recurse (Join-Path $BackendDir "node_modules\.prisma") (Join-Path $ModulesTarget ".prisma") -Force

Write-Host "`n[5/5] Gerando Instalador Executável com Tauri (NSIS)..." -ForegroundColor Yellow
Set-Location $FrontendDir
npx @tauri-apps/cli build --bundles nsis

Write-Host "`n✅ Build finalizado com sucesso!" -ForegroundColor Green
Write-Host "O instalador .exe estará na pasta: offline-game-quiz\src-tauri\target\release\bundle\nsis\" -ForegroundColor Cyan
Set-Location $Root
