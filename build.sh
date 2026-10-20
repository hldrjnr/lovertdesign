#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Lovert Design — build para Linux (e macOS)
#
# Espelha o build.bat do Windows, mas para sistemas Unix. Não faz download de
# nada silenciosamente: verifica as dependências e diz o que falta.
#
# Uso:
#   ./build.sh              # build completo (bundles .deb/.rpm/.AppImage)
#   ./build.sh --deb        # apenas .deb
#   ./build.sh --appimage   # apenas .AppImage
#   ./build.sh --no-bundle  # apenas o executável (sem instaladores)
#
# Segredos (opcional) — defina no ambiente ou num ficheiro .env na raiz:
#   GUMROAD_PRODUCT_ID, DISCORD_WEBHOOK_URL, LICENSE_XOR_KEY
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

# ---------- Carregar .env (não versionado) ----------
if [ -f .env ]; then
  echo "[INFO] A carregar variáveis de .env..."
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# ---------- Versão a partir de src/version.ts ----------
APP_VERSION="$(grep -oE "APP_VERSION = '[^']+'" src/version.ts | sed -E "s/.*'([^']+)'.*/\1/")"
APP_VERSION="${APP_VERSION:-1.1.0}"

echo "============================================"
echo "  Lovert Design v${APP_VERSION} — Build (Unix)"
echo "============================================"
echo

# ---------- Dependências ----------
command -v node >/dev/null 2>&1 || { echo "[ERRO] Node.js não encontrado. Instale em https://nodejs.org"; exit 1; }
echo "[OK] Node.js: $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[ERRO] pnpm não encontrado. Instale com: corepack enable && corepack prepare pnpm@latest --activate"
  exit 1
fi
echo "[OK] pnpm: $(pnpm -v)"

command -v cargo >/dev/null 2>&1 || { echo "[ERRO] Rust não encontrado. Instale em https://rustup.rs"; exit 1; }
echo "[OK] Rust: $(cargo --version)"

if [ "$(uname -s)" = "Linux" ]; then
  if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    echo "[AVISO] Dependências de sistema do Tauri parecem faltar."
    echo "        Debian/Ubuntu:"
    echo "          sudo apt update && sudo apt install -y \\"
    echo "            libwebkit2gtk-4.1-dev build-essential curl wget file \\"
    echo "            libxdo-dev libssl-dev libayatana-appindicator3-dev \\"
    echo "            librsvg2-dev patchelf libfontconfig1-dev libfreetype6-dev"
    echo "        Fedora: sudo dnf install webkit2gtk4.1-devel openssl-devel ..."
    echo
  fi
fi

# ---------- Segredos (sem fallbacks hardcoded) ----------
[ -n "${GUMROAD_PRODUCT_ID:-}" ] && echo "[OK] GUMROAD_PRODUCT_ID configurado" \
  || echo "[AVISO] GUMROAD_PRODUCT_ID não definido — licenciamento desabilitado neste build"
[ -n "${DISCORD_WEBHOOK_URL:-}" ] && echo "[OK] DISCORD_WEBHOOK_URL configurado (feedback ativo)" \
  || echo "[AVISO] DISCORD_WEBHOOK_URL não definido — feedback desabilitado"
[ -n "${LICENSE_XOR_KEY:-}" ] && echo "[OK] LICENSE_XOR_KEY configurado" \
  || echo "[INFO] LICENSE_XOR_KEY não definido — usa a chave de cache por omissão"
echo

# ---------- Dependências Node ----------
echo "[INFO] A instalar dependências Node..."
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile || pnpm install
else
  pnpm install
fi
echo "[OK] Dependências instaladas."
echo

# ---------- Bundles ----------
BUNDLES=""
for arg in "$@"; do
  case "$arg" in
    --deb) BUNDLES="deb" ;;
    --rpm) BUNDLES="rpm" ;;
    --appimage) BUNDLES="appimage" ;;
    --no-bundle) BUNDLES="__none__" ;;
  esac
done

echo "[INFO] A compilar frontend + executável Tauri..."
if [ "$BUNDLES" = "__none__" ]; then
  pnpm tauri build --no-bundle
elif [ -n "$BUNDLES" ]; then
  pnpm tauri build --bundles "$BUNDLES"
else
  pnpm tauri build
fi

echo
echo "============================================"
echo "  BUILD CONCLUÍDO"
echo "============================================"
echo "Executável: src-tauri/target/release/lovert-design"
if [ -d src-tauri/target/release/bundle ]; then
  echo "Instaladores:"
  find src-tauri/target/release/bundle -maxdepth 2 -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) -print
fi
