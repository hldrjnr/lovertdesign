# Lovert Design — Recomendações de Produto

> Análise da app (store, componentes, export, licenciamento) e o que fazer
> para ela realmente se vender. Base: `package.json`, `src/types.ts`,
> `src/store.ts`, `src/components/*`, `src/i18n.ts`.

## Diagnóstico: por que hoje ela não vende

- `TEMPLATE_PRESETS = []` (`src/types.ts:77`) — a app abre **vazia**, sem nenhum
  template pronto. Nesta categoria (thumbnails sociais) o template pronto *é* o
  produto: o Canva não vende a ferramenta, vende templates. Este é o maior buraco.
- Fontes só do sistema (`TextEditor.tsx` usa `systemFonts`), sem Google Fonts —
  thumbnails vivem de tipografia marcante.
- Licença/watermark já existem, mas o valor precisa ser provado nos primeiros
  5 minutos de uso.

## P1 — Conversão (valor imediato, baixo custo)

1. **Galeria de templates embutida** — 10–30 templates por nicho (gaming, tech,
   finanças, lifestyle) preenchendo `TEMPLATE_PRESETS`, com "aplicar" em 1 clique.
   É o driver #1 de conversão.
2. **Presets de texto "estilo thumbnail"** — 1 clique em "Título YouTube" aplica
   Impact + contorno amarelo/preto + sombra dupla (`outline`/`shadow` já existem;
   falta o preset).
3. **Onboarding** — primeira execução → escolher plataforma → galeria.
   Showcase "antes/depois".
4. **Wizard "thumbnail rápida"** — escolhe template → digita título → cola a
   imagem de rosto → exporta em 60s.

## P2 — Diferenciais (motivo para pagar)

5. **Google Fonts** integrado (cache local, offline) — centenas de fontes.
6. **Export em lote** — 1 clique → todas as resoluções (YouTube + Twitter + blog + IG).
7. **Safe zones por plataforma** (área segura do YouTube, terço superior) +
   guias inteligentes/snap.
8. **AI** — remove-bg já existe; somar geração de título/tagline e fundo por
   texto (Stable Diffusion local via o sidecar que já tens).

## P3 — Retenção e confiança

9. **Autosave + recuperação de crash** (Tauri).
10. **Partilha/marketplace de templates** (o import/export já existe — falta a
    galeria comunitária).
11. **Backup/sync na nuvem** como premium.
12. **Métricas** — exportar com título e acompanhar CTR (YouTube API); vira
    ecossistema, não app.

## O que já é sólido (não mexer)

- Remove-bg (rembg sidecar), chromakey.
- Máscaras (interseção/diferença, composite determinístico).
- Crop não-destrutivo (com aspect corrigido pelo template).
- Converter resolução/plataforma (`ConvertTemplateModal`).
- Presets custom com thumbnails em disco.
- Licenciamento Gumroad com tier + limite de exportações + watermark.

## Ordem sugerida

1 → 2 → 3 (galeria + presets + onboarding) já seriam suficientes para transformar
a app num produto vendável; o resto (P2/P3) escala a retenção.
Ver `docs/IMPLEMENTATION_PLAN.md` para o plano de implementação ordenado.
