#requires -Version 5.1
<#
.SYNOPSIS
    Gera os instaladores Linux (.deb e .AppImage) do RADAR a partir do Windows usando Docker.

.DESCRIPTION
    O Tauri NÃO cross-compila de Windows para Linux. Este script compila tudo dentro de um
    container Ubuntu 24.04 (imagem 'radar-linux-builder'), com Rust, Node 22 e as libs do
    Tauri, e devolve os pacotes para o repositório:

      offline-game-quiz/src-tauri/target/release/bundle/deb/RADAR-Quiz_1.0.0_amd64.deb
      offline-game-quiz/src-tauri/target/release/bundle/appimage/RADAR-Quiz_1.0.0_amd64.AppImage

    PRÉ-REQUISITOS:
      - Docker Desktop instalado e EM EXECUÇÃO (o daemon precisa estar no ar).

.PARAMETER RebuildImage
    Reconstrói a imagem 'radar-linux-builder' antes de compilar (use após editar o Dockerfile).

.EXAMPLE
    .\scripts\build-app-docker.ps1
    .\scripts\build-app-docker.ps1 -RebuildImage
#>
param(
    [switch]$RebuildImage
)

$ErrorActionPreference = "Stop"

# --- Resolve a raiz do workspace (pasta que contém radar-tcc/ e offline-game-quiz/) ---
$Root = $PSScriptRoot
while ($Root -and -not (Test-Path (Join-Path $Root "radar-tcc"))) {
    $Parent = Split-Path $Root -Parent
    if ($Parent -eq $Root -or [string]::IsNullOrEmpty($Parent)) { break }
    $Root = $Parent
}
if (-not (Test-Path (Join-Path $Root "radar-tcc"))) {
    throw "Não foi possível localizar a raiz do workspace (pasta com radar-tcc/ e offline-game-quiz/)."
}

$LinuxDir = Join-Path $Root "radar-tcc\scripts\linux-docker"
$Image    = "radar-linux-builder"

if (-not (Test-Path (Join-Path $LinuxDir "Dockerfile"))) {
    throw "Dockerfile não encontrado em $LinuxDir"
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  RADAR - Build Linux (.deb + .AppImage) via Docker" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Workspace: $Root"

# --- Verifica o daemon do Docker ---
docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker não está em execução. Abra o Docker Desktop e tente novamente."
}

# --- Constrói a imagem se necessário ---
$imageExists = docker images -q $Image
if (-not $imageExists -or $RebuildImage) {
    Write-Host "`n[img] Construindo imagem '$Image' (pode levar vários minutos na primeira vez)..." -ForegroundColor Yellow
    docker build -t $Image $LinuxDir
    if ($LASTEXITCODE -ne 0) { throw "Falha ao construir a imagem Docker." }
} else {
    Write-Host "`n[img] Imagem '$Image' já existe (use -RebuildImage para recriar)." -ForegroundColor DarkGray
}

# --- Executa o build dentro do container ---
Write-Host "`n[run] Compilando dentro do container..." -ForegroundColor Yellow
docker run --rm --name radar-linux-build `
    -v "${Root}:/src" `
    -v "${LinuxDir}:/opt/build" `
    $Image bash -c 'sed -i "s/\r$//" /opt/build/build-inner.sh && bash /opt/build/build-inner.sh'

if ($LASTEXITCODE -ne 0) {
    throw "O build Linux falhou (código $LASTEXITCODE). Verifique a saída acima."
}

Write-Host "`n✅ Build Linux finalizado." -ForegroundColor Green
Write-Host "Artefatos em:" -ForegroundColor Cyan
Write-Host " - deb:      offline-game-quiz\src-tauri\target\release\bundle\deb\"
Write-Host " - appimage: offline-game-quiz\src-tauri\target\release\bundle\appimage\"
