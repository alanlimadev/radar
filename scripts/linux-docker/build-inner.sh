#!/usr/bin/env bash
#
# Build interno executado DENTRO do container radar-linux-builder.
# Não é feito para rodar direto no host.
#
# Contrato de montagem (definido pelos wrappers build-app-docker.ps1/.sh):
#   /src        -> raiz do workspace (contém radar-tcc/ e offline-game-quiz/), rw
#   /opt/build  -> pasta radar-tcc/scripts/linux-docker (contém este script e o Dockerfile)
#
# Ao final, os artefatos são copiados de volta para:
#   /src/offline-game-quiz/src-tauri/target/release/bundle/{deb,appimage}/
set -euo pipefail

export APPIMAGE_EXTRACT_AND_RUN=1
export CI=true

# O WORKDIR da imagem é /build; saia dele antes de recriá-lo (evita getcwd inválido no rsync).
cd /

echo "==========================================="
echo "  RADAR - Build Linux (.deb + .AppImage)"
echo "==========================================="

rm -rf /build
mkdir -p /build

echo -e "\n[0/7] Copiando codigo (/src) para o filesystem Linux (/build, sem node_modules/target)..."
rsync -a \
  --exclude 'node_modules' --exclude 'target' --exclude 'dist' --exclude 'dist-bundle' \
  --exclude '.git' --exclude '.tanstack' --exclude 'gen' \
  /src/radar-tcc /build/
rsync -a \
  --exclude 'node_modules' --exclude 'target' --exclude 'dist' --exclude '.git' --exclude '.tanstack' \
  /src/offline-game-quiz /build/

BACKEND=/build/radar-tcc
FRONTEND=/build/offline-game-quiz
SERVER="$FRONTEND/src-tauri/server"
OUT_BUNDLE=/src/offline-game-quiz/src-tauri/target/release/bundle

echo -e "\n[1/7] Instalando dependencias do backend..."
cd "$BACKEND"
npm install --no-audit --no-fund

echo -e "\n[2/7] Compilando backend (nest build)..."
npm run build

echo -e "\n[3/7] Gerando Prisma Client (engine Linux) + banco template (SQLite)..."
export DATABASE_URL="file:./radar.db"
npx prisma generate
npx prisma db push --skip-generate

echo -e "\n[4/7] Gerando bundle standalone do backend (ncc)..."
npx @vercel/ncc build dist/main.js -o dist-bundle --external @prisma/client

echo -e "\n[5/7] Instalando dependencias e compilando o frontend..."
cd "$FRONTEND"
npm install --no-audit --no-fund
npm run build

echo -e "\n[6/7] Montando o servidor embutido (node + index.js + client + radar.db + engines)..."
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

echo -e "\n[7/7] Gerando pacotes com o Tauri..."
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

echo "DONE"
