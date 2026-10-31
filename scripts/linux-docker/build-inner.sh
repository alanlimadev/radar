#!/usr/bin/env bash
#
# Build interno executado DENTRO do container radar-linux-builder.
# Não é feito para rodar direto no host.
#
# Contrato de montagem (definido pelos wrappers build-app-docker.ps1/.sh):
#   /src        -> raiz do workspace (contém radar/ e qonect/), rw
#   /opt/build  -> pasta radar/scripts/linux-docker (contém este script e o Dockerfile)
#
# Ao final, os artefatos são copiados de volta para:
#   /src/qonect/src-tauri/target/release/bundle/{deb,appimage}/
set -euo pipefail

# Diretorio deste script (pode ser uma copia normalizada em /tmp dentro do container).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export APPIMAGE_EXTRACT_AND_RUN=1
export CI=true

# O WORKDIR da imagem é /build; saia dele antes de recriá-lo (evita getcwd inválido no rsync).
cd /

echo "==========================================="
echo "  Qonect - Build Linux (.deb + .AppImage)"
echo "==========================================="

rm -rf /build
mkdir -p /build

echo -e "\n[0/8] Copiando codigo (/src) para o filesystem Linux (/build, sem node_modules/target)..."
rsync -a \
  --exclude 'node_modules' --exclude 'target' --exclude 'dist' --exclude 'dist-bundle' \
  --exclude '.git' --exclude '.tanstack' --exclude 'gen' \
  /src/radar /build/
rsync -a \
  --exclude 'node_modules' --exclude 'target' --exclude 'dist' --exclude '.git' --exclude '.tanstack' \
  /src/qonect /build/

BACKEND=/build/radar
FRONTEND=/build/qonect
SERVER="$FRONTEND/src-tauri/server"
OUT_BUNDLE=/src/qonect/src-tauri/target/release/bundle

echo -e "\n[1/8] Instalando dependencias do backend..."
cd "$BACKEND"
npm install --no-audit --no-fund

echo -e "\n[2/8] Compilando backend (nest build)..."
npm run build

echo -e "\n[3/8] Gerando Prisma Client (engine Linux) + banco template (SQLite)..."
export DATABASE_URL="file:./radar.db"
npx prisma generate
npx prisma db push --skip-generate

echo -e "\n[4/8] Gerando bundle standalone do backend (ncc)..."
npx @vercel/ncc build dist/main.js -o dist-bundle --external @prisma/client

echo -e "\n[5/8] Instalando dependencias e compilando o frontend..."
cd "$FRONTEND"
npm install --no-audit --no-fund
npm run build

echo -e "\n[6/8] Montando o servidor embutido (node + index.js + client + radar.db + engines)..."
# Limpa o staging para não arrastar artefatos de outro SO (ex.: node.exe do Windows)
rm -rf "$SERVER"
mkdir -p "$SERVER"
cp "$(command -v node)" "$SERVER/node"
chmod +x "$SERVER/node"
cp "$BACKEND/dist-bundle/index.js" "$SERVER/index.js"
rm -rf "$SERVER/client"
cp -r "$FRONTEND/dist" "$SERVER/client"
cp "$BACKEND/prisma/radar.db" "$SERVER/radar.db"
mkdir -p "$SERVER/node_modules"
rm -rf "$SERVER/node_modules/@prisma" "$SERVER/node_modules/.prisma"
cp -r "$BACKEND/node_modules/@prisma" "$SERVER/node_modules/@prisma"
cp -r "$BACKEND/node_modules/.prisma" "$SERVER/node_modules/.prisma"
echo "  server/ montado:"
ls -la "$SERVER"

echo -e "\n[7/8] Gerando pacotes com o Tauri..."
cd "$FRONTEND"
# Bundles executados separadamente para isolar falhas (ex.: AppImage/FUSE).
echo "--- Bundle: deb ---"
npx --yes @tauri-apps/cli@2 build --bundles deb || echo "!!! DEB BUILD FAILED !!!"
echo "--- Bundle: appimage ---"
npx --yes @tauri-apps/cli@2 build --bundles appimage || echo "!!! APPIMAGE BUILD FAILED !!!"

echo -e "\n=== Copiando artefatos de volta para o projeto (/src) ==="
mkdir -p "$OUT_BUNDLE/deb" "$OUT_BUNDLE/appimage"
cp "$FRONTEND/src-tauri/target/release/bundle/deb/"*.deb          "$OUT_BUNDLE/deb/"      2>/dev/null || true
cp "$FRONTEND/src-tauri/target/release/bundle/appimage/"*.AppImage "$OUT_BUNDLE/appimage/" 2>/dev/null || true
echo "  deb:";      ls -la "$OUT_BUNDLE/deb"      || true
echo "  appimage:"; ls -la "$OUT_BUNDLE/appimage" || true

# Smoke test obrigatorio: valida os pacotes gerados a partir de um caminho com dot-di
# (como o /tmp/.mount_XXXX do AppImage). Ver documentation/known-issues-and-regressions.md
echo -e "\n[8/8] Smoke test dos pacotes (.deb + .AppImage) em caminho com dot-dir..."
# A pasta de bundle pode conter artefatos de builds anteriores (ex.: 1.0.0).
# Validar sempre o mais recente, senao o smoke test aprova o pacote antigo.
DEB_ARTIFACT=$(ls -1t "$OUT_BUNDLE/deb/"*.deb 2>/dev/null | head -n 1 || true)
APP_ARTIFACT=$(ls -1t "$OUT_BUNDLE/appimage/"*.AppImage 2>/dev/null | head -n 1 || true)
if [ -z "$DEB_ARTIFACT" ] || [ -z "$APP_ARTIFACT" ]; then
  echo "!!! ARTEFATOS AUSENTES (deb=${DEB_ARTIFACT:-?} appimage=${APP_ARTIFACT:-?}) - build incompleto !!!"
  exit 1
fi
bash "$SCRIPT_DIR/smoke-test-linux.sh" "$DEB_ARTIFACT" "$APP_ARTIFACT" \
  || { echo "!!! SMOKE TEST FALHOU - NAO publique estes artefatos !!!"; exit 1; }

echo "DONE"
