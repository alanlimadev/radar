#!/usr/bin/env bash
#
# Smoke test dos pacotes Linux (.deb e .AppImage).
# Roda DENTRO do container radar-linux-builder (precisa de bash, curl, dpkg-deb/ar, tar).
#
# Para cada pacote:
#   1. extrai para um caminho com dot-dir (simula /tmp/.mount_XXXX do AppImage);
#   2. sobe o servidor embutido e valida as rotas do SPA (/game etc. = 200);
#   3. garante que nao ha node.exe (binario Windows) embutido por engano.
#
# O dot-dir e proposital: o modulo `send` (usado por res.sendFile) recusa caminhos
# com um componente iniciado por "." (dotfile, 404 "Not Found"). Foi o que quebrou
# /game no AppImage. Este teste garante que o problema nao volte.
#
# Uso: smoke-test-linux.sh <arquivo.deb> <arquivo.AppImage>
set -u

DEB="${1:-}"
APP="${2:-}"

FAIL=0
W=/tmp/.mount_RADAR-smoke
rm -rf "$W"; mkdir -p "$W"

extract_deb() {
  local deb="$1" out="$2"
  mkdir -p "$out"
  if command -v dpkg-deb >/dev/null 2>&1; then
    dpkg-deb -x "$deb" "$out" >/dev/null 2>&1
  else
    ( cd "$out" && ar x "$deb" && tar xf data.tar.* )
  fi
}

check_server() {
  local label="$1" serverdir="$2" work="$3"
  echo "--- $label ---"
  echo "    server dir: $serverdir"
  mkdir -p "$work"
  (
    cd "$serverdir" || exit 1
    RADAR_DATA_DIR="$work/data" JWT_SECRET=smoke PORT=3333 ./node index.js > "$work/log" 2>&1 &
    echo $! > "$work/pid"
  )
  sleep 12
  local pid
  pid="$(cat "$work/pid" 2>/dev/null || true)"

  local item path want got
  for item in "/:200" "/game:200" "/loginScreen:200" "/qualquer-rota/x:200" "/quizzes:401"; do
    path="${item%:*}"
    want="${item##*:}"
    got="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3333${path}")"
    if [ "$got" = "$want" ]; then
      echo "    [OK]     ${path} -> ${got}"
    else
      echo "    [FALHOU] ${path} -> ${got} (esperado ${want})"
      FAIL=1
    fi
  done

  if curl -s "http://localhost:3333/game" | head -c 40 | grep -q "<!doctype html>"; then
    echo "    [OK]     /game retorna o HTML do client"
  else
    echo "    [FALHOU] /game nao retornou o HTML do client"
    FAIL=1
  fi

  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  sleep 2
  return 0
}

if [ -n "$DEB" ]; then
  if [ ! -f "$DEB" ]; then
    echo "    [FALHOU] arquivo .deb nao encontrado: $DEB"
    FAIL=1
  else
    echo "=== deb: $DEB ==="
    extract_deb "$DEB" "$W/deb/root"
    dserver="$(dirname "$(find "$W/deb/root" -path '*server/index.js' | head -1)")"
    if [ -z "$dserver" ] || [ "$dserver" = "." ]; then
      echo "    [FALHOU] server/index.js nao encontrado no deb"
      FAIL=1
    else
      check_server "deb" "$dserver" "$W/deb/work"
    fi
    if find "$W/deb/root" -name 'node.exe' 2>/dev/null | grep -q .; then
      echo "    [FALHOU] node.exe (Windows) embutido no deb"
      FAIL=1
    else
      echo "    [OK]     sem node.exe no deb"
    fi
  fi
fi

if [ -n "$APP" ]; then
  if [ ! -f "$APP" ]; then
    echo "    [FALHOU] arquivo .AppImage nao encontrado: $APP"
    FAIL=1
  else
    echo "=== appimage: $APP ==="
    cp "$APP" "$W/a.AppImage"; chmod +x "$W/a.AppImage"
    ( cd "$W" && ./a.AppImage --appimage-extract >/dev/null 2>&1 )
    aserver="$W/squashfs-root/usr/lib/Qonect/server"
    if [ -d "$aserver" ]; then
      check_server "appimage" "$aserver" "$W/ai/work"
    else
      echo "    [FALHOU] server/ nao encontrado no AppImage"
      FAIL=1
    fi
    if find "$W/squashfs-root" -name 'node.exe' 2>/dev/null | grep -q .; then
      echo "    [FALHOU] node.exe (Windows) embutido no AppImage"
      FAIL=1
    else
      echo "    [OK]     sem node.exe no AppImage"
    fi
  fi
fi

# Nada foi testado? Entao o teste nao serve de nada.
if [ -z "$DEB" ] && [ -z "$APP" ]; then
  echo "    [FALHOU] nenhum pacote informado (uso: smoke-test-linux.sh <deb> <AppImage>)"
  FAIL=1
fi

if [ "$FAIL" = "0" ]; then
  echo "SMOKE TEST OK"
else
  echo "SMOKE TEST FALHOU"
fi
exit "$FAIL"
