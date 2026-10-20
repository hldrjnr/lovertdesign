# Lovert Design

Ferramenta de design de thumbnails e banners (YouTube, Instagram, Facebook,
Unity Asset Store, Fab, Gumroad, itch.io, LinkedIn e mais).

**Stack:** Tauri 2 · React 19 · TypeScript · Vite 6 · Zustand · Tailwind 4 · Rust

---

## Segurança — segredos

Nenhum valor sensível é **hardcoded** neste repositório. Os valores usados na
verificação de licenças e no feedback são lidos de variáveis de ambiente
(runtime) ou injetados em tempo de compilação via *secrets* do GitHub Actions.

| Variável | Descrição | Obrigatória |
| --- | --- | --- |
| `GUMROAD_PRODUCT_ID` | ID do produto Gumroad usado para validar licenças | Não¹ |
| `DISCORD_WEBHOOK_URL` | Webhook do Discord do formulário de feedback | Não² |
| `LICENSE_XOR_KEY` | Chave de ofuscação do cache local `license.dat` | Não³ |

¹ Sem esta variável o licenciamento fica desativado (o build continua a funcionar).
² Sem esta variável o formulário de feedback fica desativado e o binário não
  contém qualquer URL embutida.
³ Sem esta variável é usada uma chave de cache não-sensível por omissão.

### Configurar

**Localmente** — copie `.env.example` para `.env` (que está no `.gitignore`) e
preencha os valores.

**No GitHub** — em *Settings → Secrets and variables → Actions → New repository
secret*, crie os três segredos com os mesmos nomes. O workflow `Build` injeta-os
automaticamente durante a compilação.

---

## Desenvolvimento

```bash
corepack enable
pnpm install
pnpm tauri dev      # ou ./run.sh (Linux/macOS) / run.bat (Windows)
```

## Build

| Plataforma | Comando |
| --- | --- |
| Linux / macOS | `./build.sh` (`--deb`, `--rpm`, `--appimage`, `--no-bundle`) |
| Windows | `build.bat` |
| Qualquer | `pnpm tauri build` |

### Dependências de sistema (Linux)

Debian / Ubuntu:

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf libfontconfig1-dev libfreetype6-dev
```

Fedora:

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel \
  librsvg2-devel patchelf fontconfig-devel freetype-devel
```

---

## Integração contínua

O workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) compila o
executável para **Linux** (`.deb` + `.AppImage`) e **Windows** (`.exe`/NSIS).

- Corre em cada `push`/`pull request` para `main`.
- Pode ser executado manualmente em *Actions → Build → Run workflow*.
- Os artefactos ficam disponíveis em *Actions → (run) → Artifacts*.

---

## Estrutura

```
src/                 Frontend React/TypeScript
src-tauri/           Backend Rust + config Tauri
  src/license.rs     Verificação de licenças (valores via secrets)
  src/bg_removal.rs  Remoção de fundo (chromakey + rembg opcional)
  src/lib.rs         Comandos Tauri / bootstrap
templates/           Templates de dimensões por plataforma
docs/                Documentação técnica
```
