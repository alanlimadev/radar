# Imagem de build Linux do RADAR (Tauri v2 + NestJS + Prisma/SQLite)
#
# Usada para compilar os pacotes .deb e .AppImage a partir de qualquer host
# (Windows/macOS/Linux) sem exigir uma máquina Linux nativa com todas as libs.
#
# Build:
#   docker build -t radar-linux-builder ./scripts/linux-docker
#
# O build real é executado por scripts/linux-docker/build-inner.sh, que recebe:
#   - /src       -> raiz do workspace (radar-tcc + offline-game-quiz), montado rw
#   - /opt/build -> esta pasta, montada (contém build-inner.sh)
#
# Veja docs/BUILD_EXECUTABLE.md, seção "Build Linux a partir do Windows (Docker)".

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Bibliotecas de sistema necessárias para compilar aplicações Tauri v2 no Ubuntu 24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget git file \
    build-essential pkg-config \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libgtk-3-bin \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libxdo-dev \
    patchelf \
    libfuse2t64 \
    rsync gnupg \
 && rm -rf /var/lib/apt/lists/*

# Node.js 22 (compila backend/frontend e é embutido como runtime Linux no bundle)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Toolchain Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Executa AppImages (linuxdeploy/linuxdeploy-plugin-gtk) sem FUSE
ENV APPIMAGE_EXTRACT_AND_RUN=1

WORKDIR /build
