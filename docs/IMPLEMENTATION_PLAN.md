# Lovert Design — Plano de Implementação

Ordem de implementação das melhorias em `docs/PRODUCT_RECOMMENDATIONS.md`,
priorizada por **conversão → diferenciais → retenção**. Cada item tem: o quê,
onde (ficheiros), passos, critério de done e esforço.

Legenda de esforço: S (≤1 dia) · M (2–3 dias) · L (1 semana) · XL (2+ semanas).

---

## Fase 0 — Fundações (pré-requisitos)

### 0.1 Validar baseline de texto (outline + shadow)
- [ ] Verificar que `outline` e `shadow` funcionam em camadas de texto no
      Canvas e no export (`canvas-export-target`) — há CSS aplicado?
- [ ] Se houver bugs, corrigir antes dos presets (P1.2 depende disto).
- **Ficheiros:** `Canvas.tsx` (filtros/sombras), `EffectsControls.tsx`, `src/types.ts`.
- **Done:** texto com contorno amarelo/preto + sombra dupla exporta correctamente.
- **Esforço:** S–M.

### 0.2 Catálogo de presets de texto
- [ ] Definir tipo `TextPreset` (font, fontWeight, color, outline, shadow,
      textTransform, letterSpacing, textGradient, fontSize relativo).
- [ ] Criar catálogo estático (~8 presets "estilo thumbnail": Amarelo YouTube,
      Preto/Branco Outline, Gradiente Neon, Sombra Dupla, Impact, etc.).
- **Ficheiros:** `src/types.ts`, novo `src/textPresets.ts`.
- **Esforço:** S.

### 0.3 Testes de regressão do fluxo existente
- [ ] Capturar o estado actual: `pnpm lint` verde, export PNG 1x/2x OK,
      presets custom OK, licença/watermark OK.
- **Done:** baseline documentada antes de mexer.

---

## Fase 1 — Conversão (a mais importante)

### 1.1 Galeria de templates embutida (S–M)
- [ ] Preencher `TEMPLATE_PRESETS` com 10–30 templates por nicho (gaming, tech,
      finanças, lifestyle, marca pessoal) — cada um com `background`, `getLayers()`
      (texto placeholder + shapes) e `templateId`.
- [ ] UI "Galeria": modal ou painel (em `Editor.tsx`) com busca por plataforma/nicho
      e thumbnails (reutilizar `writePreviewFile`/`readPreviewFile` de `store.ts`).
- [ ] Fluxo de aplicação = reutilizar `loadPreset` (já remapeia ids, background,
      demigra masks).
- [ ] i18n pt/en/es (`src/i18n.ts`).
- **Done:** novo projeto → galeria → 1 clique aplica e o canvas renderiza completo.
- **Esforço:** M.

### 1.2 Presets de texto "estilo thumbnail" (S)
- [ ] Botão em `TextEditor.tsx`: "Estilos de título" → dropdown com os presets
      de 0.2 → `updateLayer(layer.id, preset)`, mantendo box/posição.
- [ ] Preset inclui "redimensionar fonte à caixa" (reutilizar `recalcTextSize`).
- **Done:** seleciona texto → 1 clique → look de thumbnail completo.
- **Esforço:** S.

### 1.3 Onboarding (M)
- [ ] Primeira execução (flag em `store` + localStorage): modal "Criar projeto" →
      escolher plataforma → galeria → template.
- [ ] Slide de showcase "antes/depois" (imagens estáticas incluídas).
- **Done:** utilizador chega ao editor com um template aplicado em <2 min.
- **Esforço:** M.

### 1.4 Wizard "thumbnail rápida" (M)
- [ ] Modal wizard: template (da galeria) → título → dropzone de rosto/imagem →
      posicionamento automático (regra dos terços + lado livre) → abre editor.
- [ ] Reutilizar remove-bg/crop/máscaras já existentes.
- **Done:** thumbnail exportável em ~60s sem tocar em ferramentas.
- **Esforço:** M.

---

## Fase 2 — Diferenciais

### 2.1 Google Fonts (M)
- [ ] Bundle de ~100 fontes prioritárias (offline) ou fetch com cache em disco
      (`plugin-fs`), fallback para sistema quando offline.
- [ ] Loader que espera `document.fonts.ready` antes do export
      (`html-to-image` já é usado no `SaveDialog`).
- [ ] UI: seletor de fontes em `TextEditor.tsx` com pré-visualização.
- **Done:** fontes carregam no editor e no PNG exportado.
- **Esforço:** M.

### 2.2 Export em lote (M)
- [ ] `SaveDialog.tsx`: "Exportar para todas as plataformas" → loop de resoluções
      (YouTube, Twitter, blog, IG) reutilizando o pipeline `toCanvas`+`writeFile`.
- [ ] Presets de tamanho por plataforma (tabela em `types.ts`).
- **Done:** 1 clique gera N ficheiros nomeados por plataforma/resolução.
- **Esforço:** M.

### 2.3 Safe zones e guias inteligentes (M)
- [ ] Overlay de safe zone por plataforma no `Canvas.tsx` (área segura YouTube,
      terço superior, proporções) + linhas de terços + snap.
- [ ] Estado das guias guardado no projeto (`store.ts` sanitize/normalize).
- **Done:** overlays visíveis, snap funcional, sobrevive a guardar/reabrir.
- **Esforço:** M.

### 2.4 AI (L–XL, incremental)
- [ ] (S) Sugestões de título/tagline: prompt para LLM local (ollama) ou serviço
      opcional, exibido em painel.
- [ ] (L) Fundo por texto (Stable Diffusion) via sidecar python — experimental,
      gated por feature flag.
- [ ] (S) Cutout de rosto: melhorar remove-bg com parâmetros (já existe sidecar).
- **Done:** ao menos sugestões de título e fundo experimental funcionais.
- **Esforço:** L–XL conforme o escopo.

---

## Fase 3 — Retenção

### 3.1 Autosave + recuperação de crash (S–M)
- [ ] Guardar projecto em ficheiro temporário a cada ~10s (debounce) + restauro
      no boot se houver ficheiro não "salvo explicitamente".
- [ ] Banner "Recuperámos o teu último projecto".
- **Done:** fechar sem guardar → reabrir → conteúdo recuperado.
- **Esforço:** S–M.

### 3.2 Marketplace/partilha de templates (S–M)
- [ ] Exportar template para ficheiro (já existe) + "Importar vários" em lote
      para `customPresets`.
- [ ] (Opcional, requer backend) galeria comunitária com categorias.
- **Done:** partilhar/importar template com um ficheiro.
- **Esforço:** S–M.

### 3.3 Backup/sync na nuvem (premium) (M)
- [ ] Versão simples: apontar pasta de backup (OneDrive/Dropbox) e espelhar
      projectos/templates (custo ~0).
- [ ] Depois: API própria de sync com licença (tier).
- **Done:** alterações espelhadas na pasta de cloud.
- **Esforço:** M (simples) → L (API).

### 3.4 Métricas CTR (YouTube) (L–XL)
- [ ] YouTube Data API: publicar thumbnail + acompanhar impressões/CTR.
- [ ] Dashboard simples em aba própria.
- **Done:** ver CTR por thumbnail exportada.
- **Esforço:** L–XL.

---

## Antes de features (marketing/preço)

- [ ] **Corrigir o vazio de templates** — é o buraco #1 (Fase 1.1).
- [ ] Material de marketing: 3–5 thumbnails feitas com a app (showcase).
- [ ] Preço: hoje licença única com tier; avaliar **Free → Pro**
      (remove watermark, export ilimitado, templates premium).
- [ ] Landing page com demo/antes-depois e download.

## Critérios de release

- Cada fase termina com `pnpm lint` verde e teste manual dos fluxos tocados.
- Verificações numéricas onde possível (node sim, como feito para crop/máscara).
- Nunca regredir: remove-bg, máscaras, crop, presets custom, licença.
