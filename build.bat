@echo off
title Lovert Design v%APP_VERSION% - Build Completo
setlocal enabledelayedexpansion

:: ---------- Ler versao do ficheiro TypeScript ----------
for /f "tokens=2 delims='" %%a in ('findstr "APP_VERSION" src\version.ts') do set "APP_VERSION=%%a"
if "%APP_VERSION%"=="" (
  echo [ERRO] Nao foi possivel ler a versao de src\version.ts
  pause & exit /b 1
)

echo ============================================
echo   Lovert Design v%APP_VERSION% — Build + Installer
echo ============================================
echo.

:: ---------- Dependencias ----------
where node >nul 2>&1
if %errorlevel% neq 0 ( echo [ERRO] Node.js nao encontrado. Instale em: https://nodejs.org & pause & exit /b 1 )
echo [OK] Node.js:
call node -v

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] A instalar pnpm...
    call npm install -g pnpm
)
echo [OK] pnpm:
call pnpm -v

where rustc >nul 2>&1
if %errorlevel% neq 0 ( echo [ERRO] Rust nao encontrado. Instale em: https://rustup.rs & pause & exit /b 1 )
echo [OK] Rust:
call rustc --version

:: Verificar se o Rust tem o target windows-msvc (necessario no Windows)
rustup target list --installed | find "x86_64-pc-windows-msvc" >nul
if %errorlevel% neq 0 (
    echo [INFO] A adicionar target windows-msvc...
    rustup target add x86_64-pc-windows-msvc
)

echo.
echo ============================================
echo   1/7 - WebView2 Bootstrapper
echo ============================================
if not exist "src-tauri\WebView2Setup.exe" (
    echo [INFO] A transferir WebView2 bootstrapper ^(Evergreen^)...
    powershell -Command "Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile 'src-tauri\WebView2Setup.exe'"
    if !errorlevel! neq 0 ( echo [AVISO] Falha ao transferir WebView2 bootstrapper. ) else ( echo [OK] WebView2 bootstrapper transferido. )
) else ( echo [OK] WebView2 bootstrapper ja existe. )

echo.
echo ============================================
echo   2/7 - Verificacao de remocao de fundo ^(opcional^)
echo ============================================
echo [INFO] A remocao de fundo IA ^(rembg^) e OPCIONAL e nao e empacotada.
echo         Funciona automaticamente APENAS se o utilizador final ja tiver
echo         Python 3.10+ e o pacote 'rembg' instalados no sistema.
echo         Sem isso, a app usa o removedor de fundo por cor chromakey
echo         integrado em Rust, sem dependencias externas, sempre disponivel.
echo.
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [OK] Sem Python no ambiente de build ^(esperado^). Sem acoes de download.
) else (
    echo [OK] Python encontrado no build ^(nao obrigatorio^):
    for /f "tokens=*" %%i in ('python --version 2^>nul') do echo   %%i
    echo [INFO] Nenhuma instalacao de rembg sera feita aqui; a feature e lazy no cliente.
)

echo.
echo ============================================
echo   3/7 - Instalar dependencias Node.js
echo ============================================
call pnpm install --frozen-lockfile 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Lockfile desatualizado. A instalar com atualizacao...
    call pnpm install
    if !errorlevel! neq 0 ( echo [ERRO] Falha ao instalar dependencias. & pause & exit /b 1 )
)
echo [OK] Dependencias instaladas.

echo.
echo ============================================
echo   4/7 - Configurar build limpo (anti-falso-positivo)
echo ============================================
echo [INFO] Passo 1 — Build limpo com env (evita strings hardcoded)
echo         Os valores sensiveis NAO vivem no repositorio: defina-os como
echo         variaveis de ambiente ou no ficheiro .env (que nao e versionado):
echo           GUMROAD_PRODUCT_ID=...
echo           DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
echo           LICENSE_XOR_KEY=...
echo.

:: Carregar .env se existir (formato KEY=VALUE por linha)
if exist ".env" (
  echo [INFO] A carregar variaveis de .env...
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if not "%%a"=="" if not "%%b"=="" set "%%a=%%b"
  )
)

:: Sem fallbacks hardcoded. Se faltar, a funcionalidade respetiva fica desativada.
if defined GUMROAD_PRODUCT_ID (
  echo [OK] GUMROAD_PRODUCT_ID configurado
) else (
  echo [AVISO] GUMROAD_PRODUCT_ID nao definido — licenciamento ficara desabilitado
)
if defined DISCORD_WEBHOOK_URL (
  echo [OK] DISCORD_WEBHOOK_URL configurado (feedback ativo)
) else (
  echo [AVISO] DISCORD_WEBHOOK_URL nao definido — feedback ficara desabilitado
)
if defined LICENSE_XOR_KEY (
  echo [OK] LICENSE_XOR_KEY configurado
) else (
  echo [INFO] LICENSE_XOR_KEY nao definido — usa a chave de cache por omissao
)

echo.
echo ============================================
echo   5/7 - Compilar frontend + executavel Tauri
echo ============================================
echo [INFO] A compilar v%APP_VERSION% com env limpo...
call pnpm tauri build
if %errorlevel% neq 0 ( echo [ERRO] Falha ao compilar. Verifique os erros acima. & pause & exit /b 1 )
echo [OK] Executavel compilado.

:: Verificacao anti-falso-positivo (Passo 1)
echo.
echo [INFO] Verificando se strings sensiveis sumiram do binario...
where strings >nul 2>&1
if %errorlevel% equ 0 (
  strings "src-tauri\target\release\lovert-design.exe" | findstr /i "discord.com/api/webhooks" >nul
  if !errorlevel! equ 0 (
    echo [AVISO] Webhook ainda visivel em plain text! Considere build sem DISCORD_WEBHOOK_URL
  ) else (
    echo [OK] Webhook nao encontrado em plain text (limpo)
  )
) else (
  echo [INFO] 'strings' nao encontrado — pule verificacao. Teste manual: strings setup.exe ^| findstr discord
)

echo.
echo ============================================
echo   6/7 - Verificar instalador Inno Setup
echo ============================================
where iscc >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] iscc nao encontrado no PATH.
    set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\iscc.exe"
    if not exist "!ISCC_PATH!" set "ISCC_PATH=C:\Program Files\Inno Setup 6\iscc.exe"
    if not exist "!ISCC_PATH!" set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 5\iscc.exe"
    if not exist "!ISCC_PATH!" set "ISCC_PATH=C:\Program Files\Inno Setup 5\iscc.exe"
    if not exist "!ISCC_PATH!" (
        echo [AVISO] Inno Setup nao encontrado.
        echo         Descarregue em: https://jrsoftware.org/isdl.php
        echo.
        echo O executavel ja foi compilado em:
        echo   src-tauri\target\release\lovert-design.exe
        echo.
        pause & exit /b 0
    )
) else ( set "ISCC_PATH=iscc" )

echo [OK] Inno Setup encontrado.

echo.
echo ============================================
echo   7/7 - Criar instalador Inno Setup
echo ============================================
echo [INFO] A compilar installer v%APP_VERSION%...
"!ISCC_PATH!" /DAppVersion=%APP_VERSION% installer.iss
if %errorlevel% neq 0 ( echo [ERRO] Falha ao criar installer. & pause & exit /b 1 )
echo [OK] Installer criado.

echo.
echo ============================================
echo   BUILD CONCLUIDO COM SUCESSO!
echo ============================================
echo.
echo Versao:  %APP_VERSION%
echo.
echo Executavel:
echo   src-tauri\target\release\lovert-design.exe
echo.
echo Instalador:
for %%f in (dist\LovertDesign-Setup*.exe) do echo   %%f
echo.
echo O instalador inclui:
echo   - WebView2 Runtime (instalado automaticamente se faltar)
echo   - Atalhos no Menu Iniciar e Ambiente de Trabalho
echo   - DLLs e recursos necessarios
echo.
echo Pode distribuir o ficheiro gerado na pasta dist\
echo para qualquer computador Windows 10/11.
echo.
pause
