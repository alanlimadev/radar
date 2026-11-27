#!/usr/bin/env bash
set -e

echo "========================================="
echo "  Qonect - Compilação Desktop Linux (.deb & .AppImage)"
echo "========================================="

# Diretórios base
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKEND_DIR="$ROOT_DIR/radar"
FRONTEND_DIR="$ROOT_DIR/qonect"
SERVER_TARGET="$FRONTEND_DIR/src-tauri/server"

# Localizar binário do Node.js no Linux
NODE_PATH="$(which node || true)"
if [ -z "$NODE_PATH" ]; then
    echo "Erro: Node.js não foi encontrado no PATH do sistema."
    echo "Dica: se estiver no WSL e o 'node' resolver para o node.exe do Windows,"
    echo "instale o Node.js Linux nativo ou use: npm run build:app:linux:docker"
    exit 1
fi

# O binário embutido no bundle precisa ser um executável ELF Linux nativo.
# No WSL, 'which node' pode resolver para /mnt/c/.../node.exe (interop), o que
# geraria um pacote quebrado.
if ! file "$NODE_PATH" 2>/dev/null | grep -q "ELF"; then
    echo "Erro: o node do PATH não é um binário Linux nativo ($NODE_PATH)."
    echo "Isso normalmente acontece no WSL usando o Node.js do Windows."
    echo "Use um Node.js Linux nativo ou, para compilar via Docker:"
    echo "  npm run build:app:linux:docker"
    exit 1
fi

echo -e "\n[1/6] Compilando Backend (radar)..."
cd "$BACKEND_DIR"
npm run build

echo -e "\n[2/6] Gerando Prisma Engines para Linux..."
npx prisma generate

echo -e "\n[3/6] Gerando Bundle Standalone do Backend..."
npx @vercel/ncc build dist/main.js -o dist-bundle --external @prisma/client
# O ncc copia um radar.db vazio para dist-bundle por causa dos caminhos de template
# em PrismaService; o bundle final usa apenas index.js, entao remove o resto.
rm -f dist-bundle/radar.db

echo -e "\n[4/6] Compilando Frontend (qonect)..."
cd "$FRONTEND_DIR"
npm run build

echo -e "\n[5/6] Sincronizando arquivos do servidor embutido para Linux..."
mkdir -p "$SERVER_TARGET"

# Copiar binário do node linux e script principal
cp "$NODE_PATH" "$SERVER_TARGET/node"
chmod +x "$SERVER_TARGET/node"
cp "$BACKEND_DIR/dist-bundle/index.js" "$SERVER_TARGET/index.js"

# Copiar arquivos estáticos do frontend
rm -rf "$SERVER_TARGET/client"
cp -r "$FRONTEND_DIR/dist" "$SERVER_TARGET/client"

# Gera sempre um template vazio e limpo (nunca empacota o banco de desenvolvimento).
TEMPLATE_DIR="$BACKEND_DIR/prisma/build"
TEMPLATE_DB="$TEMPLATE_DIR/radar.db"
mkdir -p "$TEMPLATE_DIR"
rm -f "$TEMPLATE_DB"

cd "$BACKEND_DIR"
OLD_DATABASE_URL="${DATABASE_URL-}"
export DATABASE_URL="file:./build/radar.db"
npx prisma db push --skip-generate
if [ ! -f "$TEMPLATE_DB" ]; then
    echo "ERRO: falha ao gerar o banco template vazio."
    exit 1
fi
if [ -n "$OLD_DATABASE_URL" ]; then
    export DATABASE_URL="$OLD_DATABASE_URL"
else
    unset DATABASE_URL
fi

cp "$TEMPLATE_DB" "$SERVER_TARGET/radar.db"
echo "  radar.db vazio gerado em: $TEMPLATE_DB"
cd "$FRONTEND_DIR"

# Copiar apenas o runtime do Prisma (@prisma/client + .prisma gerado).
# O @prisma/engines (~36 MB) e exclusivo da CLI (schema-engine/migrate) e nunca
# e carregado em runtime pelo servidor embutido.
MODULES_TARGET="$SERVER_TARGET/node_modules"
mkdir -p "$MODULES_TARGET"
rm -rf "$MODULES_TARGET/@prisma" "$MODULES_TARGET/.prisma"
mkdir -p "$MODULES_TARGET/@prisma"
cp -r "$BACKEND_DIR/node_modules/@prisma/client" "$MODULES_TARGET/@prisma/client"
cp -r "$BACKEND_DIR/node_modules/.prisma" "$MODULES_TARGET/.prisma"

echo -e "\n[6/6] Gerando Pacotes Linux com Tauri (.deb e .AppImage)..."
cd "$FRONTEND_DIR"
npx @tauri-apps/cli build --bundles deb,appimage

echo -e "\n✅ Build Linux finalizado com sucesso!"
echo "Artefatos gerados em:"
echo " - Debian (.deb): $FRONTEND_DIR/src-tauri/target/release/bundle/deb/"
echo " - AppImage:      $FRONTEND_DIR/src-tauri/target/release/bundle/appimage/"
