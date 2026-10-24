<#
.SYNOPSIS
  Smoke test do servidor embutido (backend NestJS + client React).

.DESCRIPTION
  Sobe o servidor a partir de um caminho que CONTEM um diretorio iniciado por "."
  (ex.: .mount_RADAR-smoke) e verifica que as rotas do SPA respondem 200 com o HTML
  do client.

  POR QUE O DOT-DIR: o AppImage monta o app em /tmp/.mount_XXXX/..., e o modulo
  `send` (usado por res.sendFile) recusa caminhos com um componente iniciado por
  "." (dotfile, retorna 404 "Not Found"). Isso ja quebrou /game no Linux. Este
  teste existe para garantir que esse problema nao volte.

  Usa a porta 3333 (fixa no backend). Feche o app RADAR antes de rodar.

.EXAMPLE
  powershell -File scripts/smoke-test-server.ps1 -ServerDir ..\offline-game-quiz\src-tauri\server
#>
param(
  [Parameter(Mandatory = $true)][string]$ServerDir
)

$ErrorActionPreference = "Stop"
$Port = 3333

$ServerDir = (Resolve-Path $ServerDir).Path
if (-not (Test-Path (Join-Path $ServerDir "index.js"))) {
  throw "index.js nao encontrado em $ServerDir"
}
if (-not (Test-Path (Join-Path $ServerDir "client\index.html"))) {
  throw "client\index.html nao encontrado em $ServerDir"
}

$base = Join-Path ([System.IO.Path]::GetTempPath()) ("radar-smoke-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$dot = Join-Path $base ".mount_RADAR-smoke"   # dot-dir DE PROPOSITO
New-Item -ItemType Directory -Force -Path $dot | Out-Null

Write-Host "[smoke] copiando servidor para caminho com dot-dir: $dot"
Copy-Item -Recurse -Force (Join-Path $ServerDir "*") $dot

$nodeExe = Join-Path $dot "node.exe"
$node = if (Test-Path $nodeExe) { $nodeExe } else { "node" }

$env:RADAR_DATA_DIR = Join-Path $base "data"
$env:JWT_SECRET = "smoke-test"
$env:PORT = "$Port"
$env:NODE_ENV = "production"

$out = Join-Path $base "out.log"
$err = Join-Path $base "err.log"

$proc = Start-Process -FilePath $node -ArgumentList "index.js" -WorkingDirectory $dot `
  -RedirectStandardOutput $out -RedirectStandardError $err -PassThru

$failures = @()
try {
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 1000
    $code = (curl.exe -s -o NUL -w "%{http_code}" "http://localhost:$Port/quizzes") 2>$null
    if ($code -and $code -ne "000") { $ready = $true; break }
  }
  if (-not $ready) {
    $tail = if (Test-Path $err) { (Get-Content $err -Tail 10) -join "`n" } else { "" }
    throw "servidor nao subiu na porta $Port. stderr:`n$tail"
  }

  $checks = @(
    @{ path = "/";                 expect = 200 },
    @{ path = "/game";             expect = 200 },
    @{ path = "/game?sessionId=1"; expect = 200 },
    @{ path = "/loginScreen";      expect = 200 },
    @{ path = "/qualquer-rota/x";  expect = 200 },
    @{ path = "/quizzes";          expect = 401 }
  )
  foreach ($chk in $checks) {
    $code = curl.exe -s -o NUL -w "%{http_code}" "http://localhost:$Port$($chk.path)"
    $ok = ($code -eq $chk.expect)
    Write-Host ("  [{0}] {1,-24} -> {2} (esperado {3})" -f $(if ($ok) { "OK" } else { "FALHOU" }), $chk.path, $code, $chk.expect)
    if (-not $ok) { $failures += "$($chk.path): recebeu $code, esperado $($chk.expect)" }
  }

  $body = (curl.exe -s "http://localhost:$Port/game") -join "`n"
  if ($body -notmatch "<!doctype html>") {
    $failures += "/game nao retornou o HTML do client (index.html)"
  }
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "SMOKE TEST FALHOU:" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "SMOKE TEST OK" -ForegroundColor Green
exit 0
