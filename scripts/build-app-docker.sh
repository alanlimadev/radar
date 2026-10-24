#!/usr/bin/env bash
#
# Gera os instaladores Linux (.deb e .AppImage) do RADAR usando Docker.
#
# Útil a partir de macOS ou de um Linux sem as libs do Tauri instaladas.
# (Em um Linux com as dependências nativas, prefira ./scripts/build-app.sh.)
#
# Uso:
#   ./scripts/build-app-docker.sh
#   REBUILD_IMAGE=1 ./scripts/build-app-docker.sh   # recria a imagem antes de compilar
#
# Pré-requisito: Docker instalado e em execução.
set -euo pipefail

IMAGE="radar-linux-builder"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINUX_DIR="$SCRIPT_DIR/linux-docker"

if [ ! -f "$LINUX_DIR/Dockerfile" ]; then
    echo "Dockerfile não encontrado em $LINUX_DIR" >&2
    exit 1
fi

echo "========================================="
echo "  RADAR - Build Linux (.deb + .AppImage) via Docker"
echo "========================================="
echo "Workspace: $ROOT_DIR"

if ! docker info >/dev/null 2>&1; then
    echo "Erro: Docker não está em execução." >&2
    exit 1
fi

if [ -z "$(docker images -q "$IMAGE")" ] || [ "${REBUILD_IMAGE:-0}" = "1" ]; then
    echo -e "\n[img] Construindo imagem '$IMAGE' (pode levar vários minutos na primeira vez)..."
    docker build -t "$IMAGE" "$LINUX_DIR"
else
    echo -e "\n[img] Imagem '$IMAGE' já existe (use REBUILD_IMAGE=1 para recriar)."
fi

echo -e "\n[run] Compilando dentro do container..."
docker run --rm --name radar-linux-build \
    -v "$ROOT_DIR:/src" \
    -v "$LINUX_DIR:/opt/build" \
    "$IMAGE" bash -c 'sed -i "s/\r$//" /opt/build/build-inner.sh && bash /opt/build/build-inner.sh'

echo -e "\n✅ Build Linux finalizado."
echo "Artefatos em:"
echo " - deb:      offline-game-quiz/src-tauri/target/release/bundle/deb/"
echo " - appimage: offline-game-quiz/src-tauri/target/release/bundle/appimage/"
