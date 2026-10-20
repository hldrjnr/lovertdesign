# BYOK — Bring Your Own Key — Especificação Lovert Design

> **Status:** especificação recolhida — não implementar até ordem explícita. Documento vivo para quando o serviço for priorizado.
> **Stack base:** Tauri 2 + React 19 + Vite 6 + Zustand 5 + `html-to-image` + `plugin-fs|dialog|shell|deep-link`. CSP atual `csp:null`, `capabilities/default.json` `fs:scope-*-recursive`, `reqwest blocking` em `Cargo.toml:22`, sessão `rembg` (`bg_removal.rs`, `AiStatus`).

---

## 1. Objetivo

Permitir que o utilizador traga a sua própria API key (OpenAI / Anthropic / Google / OpenRouter) para **criar** projetos/templates novos e **editar** projetos existentes dentro da app, sem backend próprio de faturação no MVP. Custo fica no utilizador; a app orquestra o `Layer` model já validado por `sanitizeLayer`/`normalizeLayer`.

TODO já mapeado em `TODO_FIXES.md:26`: *"IA integrada via API key: serve para criar novos projetos rapidamente e editar projetos já existentes"* — 1 projeto → abrir logo; N projetos → previews no chat + botão *Escolher todos*.

---

## 2. Arquitetura exigida

### 2.1 Cofre de chaves — não repetir `license.rs:86` XOR

- `license.dat` XOR+Base64 é reversível e `appDataDir` é legível. Para BYOK usar **OS Credential Store**.
- Opção recomendada: `tauri-plugin-stronghold` (vault cifrado com salt) ou crate `keyring` → *Windows Credential Manager* via `windows-credential`.
- Modelo: `ByokRecord { provider: 'openai'|'anthropic'|'google'|'openrouter', keyEncrypted, createdAt, lastValidated, masked:'sk-...XYZ' }` em `appDataDir/byok.dat` ou stronghold. Nunca em `localStorage`.
- Comandos Tauri espelhando `license.rs`: `store_api_key(provider,key)`, `get_api_key_masked`, `validate_key` (`GET /v1/models`), `delete_key`.
- Slice Zustand: `aiKeys: Record<Provider,{masked,valid,lastChecked}>`, `aiSettings:{preferredProvider, model, maxTokens, temperature}`.

### 2.2 Abstração de providers

- `src/ai/providers.ts`: `interface AiProvider { id, validate(key):Promise<boolean>, chat(req):Promise<AiResponse>, generateImage(...), costEstimate }`. Implementações OpenAI-compatível + Anthropic + Google. OpenRouter como proxy universal.
- Rust `src/ai_proxy.rs`: `ai_chat(provider,model,messages)` injeta key server-side (frontend nunca vê raw após `set`). `reqwest` async (trocar `blocking`), 30s timeout, retries, `serde_json` + `zod` no frontend. `BYOK_PROXY_URL` env para proxy corporativo.

### 2.3 Segurança / rede

- Apertar `tauri.conf.json` `csp`: se proxy Rust → `connect-src 'none'`; se fetch direto → `connect-src https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com`. Hoje `csp:null` permite exfiltração via DevTools.
- Sanitizar prompts: remover paths absolutos `C:\...`, injetar só `Layer` JSON sanitizado. Logar `provider,model,tokens` não conteúdo salvo opt-in.
- `capabilities/default.json` hoje `fs:scope-home-recursive` amplo — restringir para `appData|document` no BYOK.
- `source` allowlist ao aplicar patch LLM: só `''|data:|LovertDesign/images/*`.

### 2.4 UI

- Modal *Settings* `Editor.tsx:742` → abas `Appearance|Shortcuts|AI`: seletor provider, input `type=password` (mostrar 1×), *Testar* → `validate_key`, dot status, links `platform.openai.com/api-keys`, *Remover*.
- Painel `LeftTab='ai'` ao lado de `ImageUploader/TextEditor`: chat streaming, histórico só prompts em `localStorage`, ações *Criar 1 projeto / Criar N variações*.

### 2.5 Rate, offline e streaming

- Offline: fila `pendingAiTasks[]`, banner *Sem conexão — tarefa enfileirada*, `check_ai_connectivity` reusando padrão `check_python_rembg` (probe paralelo + 45s timeout).
- Graça 7d como `license.rs:GRACE_PERIOD_DAYS` para reutilizar key validada offline.
- Streaming: `emit('ai-stream',chunk)` como `model-download-progress` (`bg_removal.rs:534`), concatenação no frontend.
- Token bucket Rust: 10 req/min, backoff 429.

---

## 3. Capacidades mapeadas no `Layer` (`types.ts:141`, `store.ts:364`)

| Capacidade | Valor no nicho (YouTube/Unity/Fab/Gumroad) | Mapeamento `Layer` | Reuso de código |
|---|---|---|---|
| **Projeto 1-click** | Alto — resolve templates vazios (`IMPLEMENTATION_PLAN:42`) | LLM → `{template,width,height,background,layers:[{type,text,font,color,shadow}]}` hidratado via `sanitizeLayer` | `newProject` + `loadPreset` |
| **Batch N variações + carrossel** | Diferencial | N `CustomTemplatePreset` → `toPng` off-screen (`batchImportTemplates:1991` → `writePreviewFile`) → galeria *Usar/Salvar todos* | `waitForImagesLoaded` |
| **Edição in-canvas linguagem natural** | Retenção | Tool-calling `operations:[{op:'updateLayer',id,patch},{op:'addLayer',layer},{op:'setBackground'}]` → `pushHistory()→updateLayer()` em `startBatch/endBatch` (1 entrada no `MAX_HISTORY=50`) | `Canvas.tsx:864` snap |
| **Auto-layout safe zones** | Evita corte YouTube 1546×423 | Respeita `TEMPLATES` dims + `alignLayer/alignLayers` (`ARCHITECTURE_AI.md:8.2`) | `Canvas` snap/padding |
| **Variações de copy** | Baixo custo | Só `type:'text'` (`text,font,textGradient`) → 5 títulos → `updateLayer` | — |
| **Fundo/imagem gerada** | Médio | URL → `reqwest` download → `copyImageToStorage` → `setBackgroundImage/makeBackgroundLayer` / `addImageLayer(w=0.8)` | `bgPosition/bgSize` |
| **Vector/shape** | Nice-to-have | `addVectorLayer(shape,color,strokeColor,strokeWidth,filled)` (`types.ts:79`) | — |
| **Máscara/crop** | Avançado | `layer.masks=[{mode,sourceId}]` ou `crop:{x,y,w,h,imgW,imgH}` (`demigrateMasks`) | `mask.ts:getMaskCss` |
| **Brand kit** | Pros | Constrains `COLOR_PRESETS`, `systemFonts` (`lib.rs:get_system_fonts`, `font_kit`) via system prompt | — |

Prioridade: **Variações de título + thumbnail YouTube 1-click + background** > edição > batch.

---

## 4. Viabilidade

**Viável — stack adequado.** Tauri já orquestra comandos async, `plugin-fs`, deep-link, eventos. `sanitizeLayer` torna saída LLM tolerante (malformado → default, nunca crash). `processingLayers` e `model-download-progress` já dão padrão de streaming.

**Riscos / bloqueadores:**

1. Cofre: sem Stronghold/Keyring, `appDataDir` legível.
2. Injeção de `source: C:\Windows\...` → `readFile` traversal → precisa allowlist.
3. CSP: migrar para proxy Rust antes de ativar BYOK.
4. Tokens: mostrar `tokens/$` e abortar loop `addLayer` infinito.
5. Imagens: `data:` em `.lovd` (`saveProject` embed) infla >10MB — manter `source` path para saídas IA, embed só em *Export template*.
6. JSON LLM: exigir `response_format:json_object` + validação `zod` + repair.
7. Offline first: desabilitar painel sem conexão, não bloquear startup.
8. Licença: decidir se IA é Pro-only (`saveProject:1560` gate).

**Estimativa:**

- Vault + comandos + UI settings: **M (3–4d)**
- Provider + proxy Rust + schemas: **M**
- Geração 1-shot + preview: **M**
- Edição tool-calling + histórico: **L (1 sem)**
- Batch galeria / background / polish streaming/queue: **M cada**
- **MVP (vault + 1-shot + edição): ~2–3 sem. Completo +2 sem.**

---

## 5. Preparação desde já (mesmo sem construir)

- Manter `sanitizeLayer/normalizeLayer` como contrato público (já em `ARCHITECTURE_AI.md`).
- Centralizar `embedImageDataUrl` e `copyImageToStorage` como ponto único (já feito no fix de crop `store.ts:1801,2234`).
- Restringir `capabilities/default.json` `fs:scope` de `home-recursive` para `appData|document` quando BYOK entrar.
- Criar stub `src/ai/*` (providers, schemas `zod` para `Project JSON`) sem UI, para quando a feature for ligada não haver refactor invasivo.
