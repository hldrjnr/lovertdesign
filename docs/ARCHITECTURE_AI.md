# Lovert Design — Referência Cirúrgica para Construção de Templates por Código

> Documento extraído diretamente do código-fonte (`types.ts`, `store.ts`, `Canvas.tsx`, `mask.ts`).
> Qualquer JSON gerado passará por `sanitizeLayer` / `sanitizeBackground` — campos omissos viram default, tipos errados são coagidos, ranges são clampados.
> **Última atualização:** 2026-01-27 — reflete branch atual (isolatedGroup, vectorPath masks, background filters, bevel, inlinePrompt, canvas sem borda arredondada, temas uniformes).

---

## 1. Formatos de saída

| Formato | Uso | Campos obrigatórios |
|---------|-----|---------------------|
| **`.lovd`** (projeto) | Abrir em File ▸ Open ou double-click | `version`, `template`, `layers` |
| **`template.json`** (preset) | Importar via Templates ▸ Import | `type:"template"`, `version`, `name`, `template`, `layers` |

Ambos são JSON puro. A extensão do ficheiro é irrelevante; o loader só valida a estrutura.

---

## 2. Sistema de coordenadas — entendimento completo

### 2.1 Normalização 0–1

`x`, `y`, `width`, `height` são valores **normalizados** (adimensionais) relativos ao canvas:

```
x:0,     y:0      = canto superior esquerdo
x:0.5,   y:0.5    = centro
width:0.5         = 50% da largura do canvas
height:0.3        = 30% da altura do canvas
```

### 2.2 Como é renderizado no DOM (Canvas.tsx)

Cada layer é um `<div>` com `position: absolute` dentro do container do canvas. A posição/tamanho é convertida para **percentagem** diretamente:

```css
left:   {layer.x * 100}%     /* ex: 0.5 → 50% */
top:    {layer.y * 100}%     /* ex: 0.3 → 30% */
width:  {layer.width * 100}% /* ex: 0.5 → 50% */
height: {layer.height * 100}%/* ex: 0.3 → 30% */
```

O container do canvas tem `position: relative` e dimensões fixas `template.width × template.height`. Logo, percentagem é relativa às dimensões do template.

**Conclusão fundamental:** `x=0.5` com `width=0.5` significa que o canto esquerdo da layer está a 50% da largura do canvas, e a layer ocupa 50% da largura. O centro da layer está a 75% do canvas.

### 2.3 Relação com dimensões do template

Para converter qualquer valor normalizado em **píxeis**:

```
pixelX  = layer.x * template.width
pixelY  = layer.y * template.height
pixelW  = layer.width * template.width
pixelH  = layer.height * template.height
```

Para converter píxeis de volta a normalizado:

```
normX = pixelX / template.width
normY = pixelY / template.height
normW = pixelW / template.width
normH = pixelH / template.height
```

### 2.4 Ranges válidos (dois regimes diferentes)

#### `sanitizeLayer` — para JSON externo (importação/abertura)

Usado quando o projeto é carregado de ficheiro ou quando um template JSON é importado.

| Campo | Default | Range | Notas |
|-------|---------|-------|-------|
| `x` | `0.5` | `[-10, 10]` (bezier) / `[-2,2]` | Para bezier permite 10x fora; para outros clamp mais restrito |
| `y` | `0.5` | `[-10, 10]` / `[-2,2]` | |
| `width` | `0.5` | `[0.02, 5]` (sanitize) / `[0.01,10]` bezier | Pode ser maior que o canvas |
| `height` | `0.5` | `[0.02, 5]` / `[0.01,10]` | |

#### `normalizeLayer` — para camadas internas (após qualquer operação)

Usado depois de `addLayer`, `updateLayer`, `duplicateLayer`, alinhamentos, etc. É **mais restritivo**:

| Campo | Clamping | Notas |
|-------|----------|-------|
| `x` | `[-width + 0.02, 1 - 0.02]` (ou `[-10,10]` para bezier) | Garante que pelo menos 2% da layer fica visível |
| `y` | `[-height + 0.02, 1 - 0.02]` | |
| `width` | `[0.02, 2]` (bezier até 10) | Máximo 2x o canvas (vs 5x no sanitize) |
| `height` | `[0.02, 2]` | |

**Ou seja:** ao gerares JSON externo, tens mais liberdade (width até 5x). Após abrir no app e editar, os valores são apertados para width/height até 2x.

### 2.5 Canvas container — renderização atual (2026-01)

O container que envolve o canvas (`Canvas.tsx: containerRef`) agora é **pixel-perfect sem borda arredondada**:
* `class="canvas-container"` sem `rounded-xl`, `border-radius:0`, `border:none`, `outline:1px solid var(--border)` + `outline-offset:-1px`.
* O `outline` não altera `width/height` (`cw*scale` continua exato), ao contrário do antigo `border:1px` que somava 2px e desalinhava com o export. O `box-shadow` é `var(--canvas-shadow)` por tema (padrão `#1e1e20` com sombra suave, dark com `0 0 0 1px rgba(255,255,255,0.14)` para ver limite em fundo preto).

---

## 3. Templates — IDs e dimensões predefinidos

| ID | Largura | Altura |
|----|---------|--------|
| `youtube` | 1920 | 1080 |
| `youtube-hd` | 1280 | 720 |
| `youtube-2k` | 2560 | 1440 |
| `instagram-post` | 1080 | 1080 |
| `instagram-story` | 1080 | 1920 |
| `facebook-post` | 1200 | 630 |
| `facebook-cover` | 820 | 312 |
| `unity-as-card` | 420 | 280 |
| `unity-as-cover` | 1950 | 1300 |
| `fab` | 960 | 540 |
| `fab-hd` | 1920 | 1080 |
| `gumroad-square` | 600 | 600 |
| `gumroad-cover` | 1280 | 720 |
| `itchio-cover` | 630 | 500 |
| `itchio-square` | 1280 | 720 |
| `itchio-banner` | 960 | 400 |
| `linkedin-square` | 1200 | 1200 |
| `linkedin-portrait` | 1080 | 1350 |
| `linkedin-link` | 1200 | 627 |

Template customizado:

```json
{ "id": "custom", "name": "Custom", "width": 1200, "height": 1200 }
```

---

## 4. Campos da interface `Template`

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `id` | `string` (TemplateId) | sim |
| `name` | `string` | sim |
| `width` | `number` | sim |
| `height` | `number` | sim |
| `icon` | `string` | não |
| `desc` | `string` | não |
| `platform` | `string` | não |

---

## 5. Layer — referência completa de campos

Apenas `type` é obrigatório. Tudo o resto tem default seguro via `sanitizeLayer`.

### 5.1 Identidade e comportamento

| Campo | Tipo | Default | Range/Notas |
|-------|------|---------|-------------|
| `id` | `string` | auto-generado | |
| `type` | `string` | `"text"` | `"image"`, `"text"`, `"element"`, `"vector"`, `"group"` |
| `name` | `string` | `"Layer"` | |
| `visible` | `boolean` | `true` | |
| `locked` | `boolean` | `false` | Se `true`, não é selecionável nem por caixa (rubberband filtra) |
| `groupId` | `string` \| `null` | `undefined` | Aponta para `id` de uma layer `type:"group"` |
| `zIndex` | `number` | 0 | Range `[-9999, 9999]` |
| `isBackground` | `boolean` | `undefined` | Se `true`: locked, zIndex=-1, não duplicável, excluído de seleção toda, pinned a (0,0,1,1) em convertTemplate |

**Transient UI (não persistido no .lovd, runtime apenas):**
| Campo | Tipo | Notas |
|-------|------|-------|
| `isolatedGroupId` (store) | `string \| null` | Modo isolado: duplo clique num grupo entra, só filhos desse grupo são selecionáveis/arrastáveis, outros dimmed `opacity*0.22 + grayscale`. Sai com duplo clique fora ou `ESC`. Não é salvo. |
| `inlinePrompt` (store) | `{title, defaultValue, onConfirm}` | Substitui `window.prompt` (edit de nome de template/vector) — modal custom centralizado, evita webview Edge. |

### 5.2 Posição e transformação (valores normalizados)

| Campo | Tipo | Default | Range (sanitize) | Range (normalize) |
|-------|------|---------|-------------------|-------------------|
| `x` | `number` | `0.5` | `[-10,10]` bezier / `[-2,2]` | `[-width+0.02, 1-0.02]` |
| `y` | `number` | `0.5` | `[-10,10]` | `[-height+0.02, 1-0.02]` |
| `width` | `number` | `0.5` | `[0.01,10]` bezier / `[0.02,5]` | `[0.01,10]` bezier / `[0.02,2]` |
| `height` | `number` | `0.5` | `[0.01,10]` / `[0.02,5]` | `[0.01,10]` / `[0.02,2]` |
| `rotation` | `number` | `0` | `[-180, 180]` | `[-180, 180]` |
| `opacity` | `number` | `1` | `[0, 1]` | `[0, 1]` |

Zoom do canvas agora é **multiplicativo** (`Canvas.tsx onWheel: factor 0.92/1.08`, atalhos `*0.8/*1.25`) para velocidade uniforme em qualquer nível.

### 5.3 Efeitos de layer

| Campo | Tipo | Default | Range |
|-------|------|---------|-------|
| `brightness` | `number` | `1` | `[0, 2]` |
| `contrast` | `number` | `1` | `[0, 2]` |
| `saturation` | `number` | `1` | `[0, 2]` |
| `blur` | `number` | `0` | `[0, 20]` |
| `hueRotate` | `number` | `0` | `[0, 360]` |
| `sepia` | `number` | `0` | `[0, 1]` |
| `negative` | `boolean` | `false` | |

### 5.4 Borda e sombra

| Campo | Tipo | Default | Range |
|-------|------|---------|-------|
| `borderRadius` | `number` | `0` | `[0, 999]` (normalizado) |
| `borderRadiusPx` | `number` | `0` | `[0, 1000]` (píxeis) |
| `outlineWidthPx` | `number` | `0` | `[0, 200]` |
| `outline` | `OutlineEffect` \| `null` | `null` | |
| `shadow` | `ShadowEffect` \| `null` | `null` | |
| `bevel` | `BevelEffect` \| `null` | `null` | Chanfro interno via filtro SVG `url(#bevel-id)` — ver 5.9 |

### 5.5 Espelho e perspetiva

| Campo | Tipo | Default | Range |
|-------|------|---------|-------|
| `mirrorX` | `boolean` | `false` | |
| `mirrorY` | `boolean` | `false` | |
| `perspectiveX` | `number` | `0` | `[-60, 60]` (antes -80, agora clamp -60) |
| `perspectiveY` | `number` | `0` | `[-60, 60]` |

### 5.6 Campos específicos por tipo

#### Texto (`type: "text"`)

| Campo | Tipo | Default | Range |
|-------|------|---------|-------|
| `text` | `string` | `""` | |
| `font` | `string` | `"Arial"` | |
| `fontSize` | `number` | `48` | `[8, 500]` |
| `color` | `string` | `"#ffffff"` | CSS color |
| `textAlign` | `string` | `"center"` | `"left"`, `"center"`, `"right"` |
| `lineHeight` | `number` | `1.2` | `[0.1, 5]` |
| `letterSpacing` | `number` | `0` | `[-100, 200]` |
| `textTransform` | `string` | `"none"` | `"none"`, `"uppercase"`, `"lowercase"` |
| `textGradient` | `string` \| `null` | `null` | CSS gradient |
| `fontStyle` | `string` | `"normal"` | `"normal"`, `"italic"`, `"oblique"` |
| `fontWeight` | `number` | `700` | `[100, 900]`, arredonda a 100 na normalize |

#### Imagem (`type: "image"`)

| Campo | Tipo | Default |
|-------|------|---------|
| `source` | `string` | `""` |
| `preview` | `string` | `""` (ignorada ao carregar — re-hidratada de `source`) |

**Crop não-destrutivo** (coordenadas em píxeis da imagem original):

```typescript
crop?: {
  x: number     // origem X do crop na imagem original (píxeis)
  y: number     // origem Y do crop na imagem original (píxeis)
  w: number     // largura do crop (píxeis)
  h: number     // altura do crop (píxeis)
  imgW: number  // largura total da imagem original (píxeis)
  imgH: number  // altura total da imagem original (píxeis)
} | null
```

Campos associados:
```
originalPreview?: string  // URL da imagem original (sem crop)
originalWidth?: number    // largura original
originalHeight?: number   // altura original
```

**Como o crop é renderizado (Canvas.tsx):**
A imagem original é posta como `background-image` num div do tamanho da layer. O `background-size` e `background-position` são calculados para que apenas a região do crop fique visível (ver `cropBackgroundCss`).

#### Emoji/elemento (`type: "element"`)

| Campo | Tipo | Default |
|-------|------|---------|
| `elementContent` | `string` | `""` |
| `elementName` | `string` | `""` |

A font default é `'"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'`.

#### Vector shape (`type: "vector"`)

| Campo | Tipo | Default |
|-------|------|---------|
| `vector` | `VectorData` \| `null` | `null` |
| `vectorPath` | `VectorPathData` \| `null` | `null` |

### 5.7 Máscaras

| Campo | Tipo | Default |
|-------|------|---------|
| `mask` | `MaskConfig` \| `null` | `null` (backward compat) |
| `masks` | `MaskConfig[]` | `[]` |

**Mask source agora inclui vectors:** `canBeMaskSource()` (`mask.ts:3`) retorna `true` para `image` e para `vector` com `vector` **ou** `vectorPath` (bezier custom). O renderer em `drawMaskSourceOnContext` / `getCompositeMaskDataUrl` desenha `vector` via `drawVectorOnCanvas` e `vectorPath` via `drawVectorPathOnCanvas` (bezier com `handleIn/handleOut`, `closed ? fill : stroke`). Máscaras são compositadas num único canvas em ordem determinística (`fillRect #fff` + `source-in`/`destination-out` por máscara).

### 5.8 Objetos aninhados

#### ShadowEffect

```typescript
{ color?: string, blur?: number, offsetX?: number, offsetY?: number }
// defaults: "#000000", 0, 0, 0
// ranges: blur [0,100], offsetX [-200,200], offsetY [-200,200]
```

#### OutlineEffect

```typescript
{ color?: string, width?: number }
// defaults: "#000000", 0
// range: width [0,200]
```

#### VectorData

```
shape:        "line" | "rounded-rect" (default) | "circle" | "triangle" | "hexagon"
              | "star" | "plus" | "arrow-right" | "arrow" | "curved-arrow"
              | "diamond" | "pentagon" | "cross" | "lightning" | "heart" | "bloom"
color:        string — default "#ffffff"
fillGradient: string | null — default null
strokeColor:  string — default "#000000"
strokeWidth:  number — default 0, range [0,100]
filled:       boolean — default true
cornerRadius: number — default 0, range [0,1000]
strokeDash:   "solid" (default) | "dashed" | "dotted" | "dash-dot"
skewX:        number — default 0, range [-180, 180]
// tradução: t(`vectorShapes.${shape}`) — `VECTOR_SHAPES` usa `t()` no UI
```

#### VectorPathData

```typescript
{
  points: [
    {
      id?: string           // auto se omitido
      x: number
      y: number
      type?: "corner" | "bezier"   // default "corner"
      handleIn?: { x: number; y: number }
      handleOut?: { x: number; y: number }
    }
  ]
  closed?: boolean       // default false
  fillColor?: string     // default "#ffffff"
  strokeColor?: string   // default "#000000"
  strokeWidth?: number   // default 20 para bezier, range [0, 100]
  strokeDash?: "solid" | "dashed" | "dotted" | "dash-dot"
  startCap?: "none" | "arrow" | "round"
  endCap?: "none" | "arrow" | "round"
  startCapSize?: number
  endCapSize?: number
}
```

#### MaskConfig

```typescript
{
  id?: string         // auto se omitido
  mode: "intersection" | "difference"
  sourceId: string    // id da layer que atua como máscara (image ou vector/vectorPath)
}
```

#### BevelEffect (5.9)

```typescript
{
  enabled: boolean         // default false
  size: number             // 0..20, default 6
  smoothing: number        // 0..10, default 2
  strength: number         // 0..1, default 0.6
  lightAngle: number       // 0..360, default 120
  highlightColor: string   // default "rgba(255,255,255,0.85)"
  shadowColor: string      // default "rgba(0,0,0,0.55)"
}
// Renderizado como filtro SVG <filter id="bevel-${id}"> com feGaussianBlur + feMorphology erode + feOffset
// No painel, EffectRow "Bevel — chanfro interno" é colapsável (EffectRow/CollapsibleRow)
```

---

## 6. Background

Top-level `background` (opcional no JSON, mas o store tem sempre um default).

| Campo | Tipo | Default | Range |
|-------|------|---------|-------|
| `type` | `string` | `"color"` | `"color"`, `"gradient"`, `"image"` |
| `color` | `string` | `"#1a1a2e"` | CSS color |
| `gradient` | `string` | `""` | CSS gradient |
| `imagePath` | `string` | `""` | path absoluto ou `./` relativo |
| `imagePreview` | `string` | `""` | data: URL (preenchido automaticamente) |
| `brightness` | `number` | `1` | `[0, 2]` |
| `blur` | `number` | `0` | `[0, 20]` |
| `contrast` | `number` | `1` | `[0, 2]` |
| `saturation` | `number` | `1` | `[0, 2]` |
| `hueRotate` | `number` | `0` | `[0, 360]` |
| `sepia` | `number` | `0` | `[0, 1]` |
| `bgPosition` | `string` | `"center"` | CSS background-position |
| `bgSize` | `string` | `"cover"` | `"cover"`, `"contain"`, `"fill"`, `"auto"` |

### Comportamento do background no canvas

Quando o background é do tipo `image`, o store cria automaticamente uma **layer especial** com `isBackground: true`, `x:0`, `y:0`, `width:1`, `height:1`, `zIndex:-1`. Esta layer:

- **cobre o canvas inteiro** (0,0 → 1,1)
- fica sempre em **zIndex -1** (abaixo de todas as outras)
- usa `bgSize` e `bgPosition` da `BackgroundState` para `object-fit` / `object-position`
- é **ignorada** no cálculo da bounding box durante `convertTemplate`
- **não pode ser duplicada**, nem selecionada em "Select All"
- ao converter template, é **pinned** a `(0,0,1,1)` independentemente da scaling
- **Filtros editáveis mesmo com layer selecionada:** o painel `EffectsControls` aba `adjust` mostra agora `Card "Fundo — Filtros"` (`panel.backgroundFilters`) com brightness/contrast/saturation/hue/sepia/blur + `bgSize` sempre que `background.type==='image'` e `imagePreview` existir, independente da seleção (antes só aparecia sem seleção).

---

## 7. Global effects

Top-level `globalEffects` (opcional) — aplica-se a todo o canvas via CSS filter.

```typescript
{
  brightness?: number  // default 1, range [0, 2]
  contrast?: number    // default 1, range [0, 2]
  saturation?: number  // default 1, range [0, 2]
  blur?: number        // default 0, range [0, 20]
  sepia?: number       // default 0, range [0, 1]
  hueRotate?: number   // default 0, range [0, 360]
}
```

---

## 8. Posicionamento cirúrgico — fórmulas exatas

### 8.1 Centralizar uma layer no canvas

```json
{ "x": 0.5 - width/2, "y": 0.5 - height/2, "width": W, "height": H }
```

Se `width=0.5, height=0.3`:

```json
{ "x": 0.25, "y": 0.35, "width": 0.5, "height": 0.3 }
```

### 8.2 Alinhamento (código do store)

Cada alinhamento é uma fórmula fechada. `padding` é um número 0–50 (percentagem) convertido para normalizado via `/100`.

| Alinhamento | Eixo | Fórmula |
|-------------|------|---------|
| `left` | X | `x = padding / 100` |
| `center-h` | X | `x = 0.5 - layer.width / 2` |
| `right` | X | `x = 1 - layer.width - padding/100` |
| `top` | Y | `y = padding / 100` |
| `center-v` | Y | `y = 0.5 - layer.height / 2` |
| `bottom` | Y | `y = 1 - layer.height - padding/100` |

Após alinhamento, é aplicado clamp: `x ∈ [0, 1 - width]`, `y ∈ [0, 1 - height]`.

### 8.3 Alinhamento de múltiplas layers (grupo virtual)

Em vez de mover cada layer individualmente, calcula a **bounding box do grupo**:

```
minX = min(layers.x)
minY = min(layers.y)
maxX = max(layers.x + layers.width)
maxY = max(layers.y + layers.height)
groupW = maxX - minX
groupH = maxY - minY
```

Depois calcula `dx = newMinX - minX` e `dy = newMinY - minY`, e desloca **todas as layers** por esse offset. As layers mantêm as suas posições relativas umas às outras.

### 8.4 Auto-dimensionamento de texto

Quando uma layer de texto é criada pela UI (`addTextLayer`), o tamanho é calculado via `CanvasRenderingContext2D.measureText()`:

```
font: "700 72px Impact"
fontSize base: 72px
lineHeight: 1.2

maxW = max(measureText(line).width para cada linha)
totalH = númeroLinhas * 72 * 1.2

tw = max(0.08, min(maxW + 72*0.3, template.width * 0.98)) / template.width
th = max(0.05, min(totalH, template.height * 0.98)) / template.height

x = 0.5 - tw/2
y = 0.5 - th/2
```

**Nota:** O padding de 30% de fontSize (`maxW + fs*0.3`) evita que o texto fique colado à borda. O teto de 98% do canvas evita overflow.

### 8.5 Duplicar layer — offset

Ao duplicar via menu (`duplicateLayer`), a nova layer é deslocada `0.02` (2% do canvas) para baixo e para a direita. Duplicação exata (`duplicateLayerExact`, usada por `Ctrl+D` e `Ctrl+drag`) mantém posição idêntica (usada para copiar e arrastar mantendo original).

### 8.6 Tamanhos padrão dos tipos de layer (criados pela UI)

| Tipo | Largura (normalizada) | Altura (normalizada) | Nota |
|------|----------------------|----------------------|------|
| Texto | calculado por `measureText` (≥0.08) | calculado (≥0.05) | centralizado |
| Imagem | 0.8 (ou proporcional ao drop) | 0.8 (ou proporcional ao drop) | max 80% do canvas |
| Emoji | `200 / cw` | `200 / ch` | fontSize 200, centralizado |
| Vector | `350 / cw` | `350 / ch` | centralizado |
| Grupo | 0.1 | 0.1 | placeholder, não renderizado |
| Background | 1.0 | 1.0 | `x:0, y:0`, pinned |

### 8.7 Seleção por caixa (rubberband) — comportamento atual

A caixa de seleção (arrastar com botão esquerdo no fundo) usa AABB rotacionada:
* Calcula 4 cantos rotacionados por `rotation`, extrai `minX/maxX/minY/maxY` e testa sobreposição com a caixa normalizada `x1/y1/x2/y2`.
* Filtra `visible && !locked && !isBackground && type !== group/mask && parent visible/locked`.
* Se `isolatedGroupId` ativo, só considera `groupId === isolated`.
* Acumula com `Shift` (`merged = Set([...selected, ...inside])`), senão substitui.
* Objetos travados (`locked`) nunca são selecionáveis por caixa.

### 8.8 Ctrl+drag para copiar

Segurar `Ctrl` (ou `Meta` no Mac) ao iniciar arrasto (`handleMoveStart`) duplica exatamente (`duplicateLayerExact`) as layers selecionadas na posição original e arrasta as cópias, deixando originais intactas. Histórico é registrado.

---

## 9. Bounding box e conversão entre templates (`convertTemplate`)

Quando se converte um design de um template para outro (ex: YouTube → Instagram Post), o store:

1. **Ignora layers `isBackground`** — não entram na bounding box
2. Calcula a bounding box das layers de conteúdo em **píxeis**:

```
lx = layer.x * W1
ly = layer.y * H1
lw = layer.width * W1
lh = layer.height * H1
```

3. Fallback: se não há layers ou a bbox é degenerada (<1px), usa o canvas inteiro
4. Calcula o centro e escala uniforme:

```
bbW  = maxX - minX
bbH  = maxY - minY
bbCx = (minX + maxX) / 2
bbCy = (minY + maxY) / 2
sScale = clamp(min(W2/bbW, H2/bbH), 0.05, 20)
```

5. Reposiciona cada layer:

```
newPx = (lx - bbCx) * sScale + W2/2
newPy = (ly - bbCy) * sScale + H2/2
newPw = lw * sScale
newPh = lh * sScale

x = clamp(newPx / W2)
y = clamp(newPy / H2)
width = max(0.02, newPw / W2)
height = max(0.02, newPh / H2)
```

6. Layers de texto/elemento têm `fontSize` escalado: `max(8, round(fontSize * sScale))`
7. Background layers são **sempre resetadas** para `{x:0, y:0, width:1, height:1}`

---

## 10. Project file (.lovd) — formato completo

```json
{
  "version": 3,
  "template": { "id": "youtube", "width": 1920, "height": 1080 },
  "background": {
    "type": "gradient",
    "gradient": "linear-gradient(135deg,#0f172a,#334155)"
  },
  "layers": [
    {
      "type": "image",
      "source": "C:\\assets\\hero.png",
      "x": 0.1, "y": 0.15, "width": 0.5, "rotation": -4
    },
    {
      "type": "text",
      "text": "BIG TITLE",
      "font": "Impact",
      "fontSize": 140,
      "y": 0.25,
      "color": "#ffffff",
      "shadow": { "color": "#000", "blur": 12, "offsetX": 0, "offsetY": 6 },
      "textGradient": "linear-gradient(180deg,#fff,#fbbf24)"
    },
    {
      "type": "element",
      "elementContent": "🔥",
      "fontSize": 160,
      "x": 0.8, "y": 0.6
    }
  ],
  "globalEffects": {
    "brightness": 1.05,
    "contrast": 1.1,
    "saturation": 1.1
  }
}
```

### Resolução de paths relativos `./`

Ao carregar um `.lovd`, se `source` começa com `./`, o path é resolvido em relação à pasta do ficheiro (ver `loadProjectFromFile`).

### Regras de salvamento

Ao guardar um projeto, cada layer de imagem tem o seu `preview` convertido para data: URL (embeddado). Isto torna o `.lovd` portátil.

---

## 11. Template preset — formato completo

Para importar via Templates ▸ Import (ficheiro único) ou Import Folder (pasta).

```json
{
  "type": "template",
  "version": 2,
  "name": "My YouTube Preset",
  "category": "YouTube",
  "icon": "▶️",
  "preview": "data:image/jpeg;base64,...",
  "theme": "Escuro",
  "template": {
    "id": "youtube",
    "name": "YouTube",
    "width": 1920,
    "height": 1080,
    "icon": "▶️",
    "desc": "1920×1080",
    "platform": "YouTube"
  },
  "background": {
    "type": "color",
    "color": "#1a1a2e"
  },
  "layers": [
    {
      "type": "text",
      "text": "MY TITLE",
      "font": "Impact",
      "fontSize": 120,
      "y": 0.3,
      "color": "#ffffff"
    }
  ],
  "globalEffects": {
    "brightness": 1,
    "contrast": 1,
    "saturation": 1,
    "blur": 0,
    "sepia": 0,
    "hueRotate": 0
  }
}
```

**Diferenças para `.lovd`:**
- `type: "template"` (vs ausente em `.lovd`)
- `version: 2` (vs `version: 3` em `.lovd`)
- Campos extra: `category`, `icon`, `preview`, `theme`

**Edição inline de nome:** no picker, o overlay de edição (`editingPresetId` state) mostra `<input>` direto no card com `✓/✕`, `Enter` confirma `renameCustomPreset`, `Esc` cancela — evita `window.prompt` (webview Edge).

---

## 12. Padrões de construção cirúrgica

### 12.1 Texto outline + shadow + centralizado

```json
{
  "type": "text",
  "text": "GUERRA",
  "font": "Impact",
  "fontSize": 180,
  "color": "#ff4444",
  "textAlign": "center",
  "fontWeight": 900,
  "letterSpacing": 4,
  "textTransform": "uppercase",
  "lineHeight": 0.9,
  "x": 0.15, "y": 0.2, "width": 0.7, "height": 0.2,
  "shadow": { "color": "#000", "blur": 16, "offsetX": 0, "offsetY": 8 },
  "outline": { "color": "#000", "width": 6 }
}
```

### 12.2 Gradiente em texto

```json
{
  "type": "text",
  "text": "HOT",
  "font": "Impact",
  "fontSize": 160,
  "x": 0.25, "y": 0.3, "width": 0.5,
  "textGradient": "linear-gradient(180deg,#fbbf24,#ef4444)",
  "shadow": { "color": "#000", "blur": 10, "offsetX": 0, "offsetY": 5 }
}
```

**Gradiente custom:** `GradientPickerInline` (`GradientPicker.tsx:48`) mostra presets + `+{remaining} mais` + `✚ Criar`. Right-click num swatch abre menu portalizado (`createPortal` para `document.body`) com `✏️ Editar` (abre `GradientBuilderPopup` com ângulo/stops) e `🚫 Ocultar` (preset) ou `🗑️ Excluir` (custom). Menu usa `var(--bg-panel)` para tema claro.

### 12.3 Imagem com crop não-destrutivo

```json
{
  "type": "image",
  "source": "C:\\foto.jpg",
  "x": 0.05, "y": 0.05, "width": 0.4, "height": 0.5,
  "crop": { "x": 100, "y": 50, "w": 800, "h": 600, "imgW": 1920, "imgH": 1080 },
  "brightness": 1.1,
  "borderRadius": 0.05
}
```

### 12.4 Vector shape com gradiente

```json
{
  "type": "vector",
  "vector": {
    "shape": "star",
    "color": "#FFD700",
    "fillGradient": "linear-gradient(135deg,#FFD700,#FF8C00)",
    "strokeColor": "#000",
    "strokeWidth": 3,
    "filled": true
  },
  "x": 0.4, "y": 0.3, "width": 0.2, "height": 0.2, "rotation": 15
}
```

No painel `EffectsControls` aba `style`, `vector.outline` e `vector.dash` são `CollapsibleRow` colapsáveis (persistido em `localStorage`).

### 12.5 Vector path (curvas Bézier)

```json
{
  "type": "vector",
  "vectorPath": {
    "points": [
      { "x": 100, "y": 500, "type": "corner" },
      { "x": 300, "y": 200, "type": "bezier", "handleOut": { "x": 400, "y": 100 } },
      { "x": 500, "y": 500, "type": "corner" },
      { "x": 700, "y": 800, "type": "bezier", "handleIn": { "x": 600, "y": 900 } }
    ],
    "closed": true,
    "fillColor": "#667eea",
    "strokeColor": "#fff",
    "strokeWidth": 2
  },
  "x": 0.2, "y": 0.1, "width": 0.6, "height": 0.8
}
```

**Nota:** Os pontos de `vectorPath` estão em **píxeis** relativos ao tamanho da layer, não normalizados.

### 12.6 Máscara (intersection) — agora com vectors

```json
{
  "type": "image",
  "id": "mask-shape",
  "source": "C:\\texture.jpg",
  "x": 0, "y": 0, "width": 1, "height": 1
},
{
  "type": "vector",
  "id": "clip-path",
  "vector": { "shape": "circle", "color": "#fff", "filled": true },
  "x": 0.2, "y": 0.2, "width": 0.6
},
{
  "type": "vector",
  "id": "bezier-mask",
  "vectorPath": { "points": [...], "closed": true, "fillColor": "#fff" },
  "x": 0.1, "y": 0.1, "width": 0.5
},
{
  "type": "image",
  "source": "C:\\photo.jpg",
  "x": 0, "y": 0, "width": 1, "height": 1,
  "mask": { "mode": "intersection", "sourceId": "clip-path" }
}
```

A layer `photo.jpg` só é visível onde coincide com `clip-path`. `bezier-mask` também é válido como source (`canBeMaskSource` aceita `vector` com `vector` ou `vectorPath`). Máscaras são compositadas num único canvas com `source-in`/`destination-out`.

### 12.7 Grupo e modo isolado

```json
{
  "type": "group",
  "id": "grupo-1",
  "name": "Card Group",
  "x": 0, "y": 0, "width": 0.1, "height": 0.1
},
{
  "type": "text",
  "text": "TITLE",
  "groupId": "grupo-1",
  "x": 0.2, "y": 0.3, "width": 0.6
}
```

A layer de grupo não é renderizada visualmente. Ao mover o grupo, só os filhos são movidos (cálculo via `groupOrigBbox` + `rotatePoint`). **Modo isolado:** duplo clique no grupo no canvas ou na lista entra em `isolatedGroupId` (store transient); só filhos desse grupo ficam interativos (outros dimmed `opacity*0.22 + grayscale`), caixa de seleção só pega filhos, clique individual não mapeia para grupo. Sai com duplo clique fora ou `ESC` (banner azul no topo do canvas e da lista).

### 12.8 Background imagem com efeitos

```json
{
  "background": {
    "type": "image",
    "imagePath": "./bg-night.jpg",
    "bgSize": "cover",
    "bgPosition": "center",
    "brightness": 0.4,
    "blur": 2,
    "saturation": 0.8
  }
}
```

Na renderização, uma layer `isBackground: true` será criada em `(0, 0, 1, 1)` com `zIndex: -1`.

---

## 13. Regras de sanitização (por que podes gerar JSON mínimo)

Cada layer importada passa por `sanitizeLayer()`:

- Campos omissos → defaults seguros (tabela secção 5)
- Tipos errados → coação (ex: `"fontSize": "48"` → `48`)
- Valores enum inválidos → primeiro valor válido (ex: `shape: "rectangle"` → `"rounded-rect"`)
- Números fora do range → clampados ao range definido
- Campos desconhecidos → ignorados (nunca crash)
- `vectorShapes` traduzido via `t('vectorShapes.' + shape)` (pt/en/es)

Cada background passa por `sanitizeBackground()`: mesmas regras.

Cada layer existente que sofre mutação passa por `normalizeLayer()` — clamping mais apertado que `sanitizeLayer`.

---

## 14. Gerar em código — receitas

### Node.js

```typescript
import { writeFileSync } from 'fs'

const project = {
  version: 3,
  template: { id: 'youtube', width: 1920, height: 1080 },
  background: { type: 'color', color: '#0f172a' },
  layers: [
    { type: 'text', text: 'HELLO', font: 'Impact', fontSize: 120, y: 0.4 },
  ],
}

writeFileSync('hello.lovd', JSON.stringify(project, null, 2))
```

### Python

```python
import json

project = {
    "version": 3,
    "template": {"id": "instagram-post", "width": 1080, "height": 1080},
    "background": {"type": "gradient", "gradient": "linear-gradient(135deg,#667eea,#764ba2)"},
    "layers": [
        {"type": "text", "text": "POST", "font": "Impact", "fontSize": 140,
         "y": 0.3, "color": "#ffffff"},
        {"type": "element", "elementContent": "✨", "fontSize": 200,
         "x": 0.8, "y": 0.15},
    ],
}

with open("post.lovd", "w", encoding="utf-8") as f:
    json.dump(project, f, indent=2, ensure_ascii=False)
```

### Bash

```bash
cat > design.lovd << 'JSONEOF'
{
  "version": 3,
  "template": { "id": "youtube", "width": 1920, "height": 1080 },
  "background": { "type": "color", "color": "#1a1a2e" },
  "layers": [
    { "type": "text", "text": "MY VIDEO", "font": "Impact", "fontSize": 150, "y": 0.35 }
  ]
}
JSONEOF
```

---

## 15. Checklist para geração em código

1. Estrutura base: `{ version: 3, template: {...}, background?: {...}, layers: [...], globalEffects?: {...} }`
2. `template` aceita `{ id: "youtube", width: 1920, height: 1080 }` ou um ID conhecido
3. Cada layer precisa no mínimo de `type`; todo o resto tem default
4. `x`, `y`, `width`, `height` são normalizados 0–1 (ver secção 2)
5. Centralizar: `x = 0.5 - width/2`, `y = 0.5 - height/2`
6. Alinhar à esquerda: `x = 0`, centro: `x = 0.5 - width/2`, direita: `x = 1 - width`
7. Para imagens, `source` pode ser path absoluto ou `./` (relativo ao `.lovd`)
8. `globalEffects` é opcional mas recomendado
9. `JSON.stringify(obj, null, 2)` → ficheiro `.lovd` ou `.json`
10. Projeto → File ▸ Open ou double-click. Template → Templates ▸ Import.
11. **Novo:** `bevel` e `vectorPath.startCap/endCap` são opcionais; `isolatedGroupId` não deve ir no JSON (transient).

---

## 16. Changelog recente (para IA que gera templates)

* **2026-01-27 — Canvas:** `canvas-container` sem `rounded-xl`, `outline` em vez de `border` para 100% alinhamento; `isolatedGroupId` + dimming; `Ctrl+drag` duplica; rubberband com AABB rotacionada.
* **2026-01-27 — Máscaras:** `vectorPath` aceito como source; `GradientPicker` menu portalizado com `var(--bg-panel)`.
* **2026-01-27 — Temas:** `BASE_THEMES` uniformes (`padrao` cinza `#1e1e20/#252529`, `dark` contrast `#09090b/#141416`, `light` `#ffffff`) e `canvas-shadow` por tema.
* **2026-01-27 — Segurança:** `DISCORD_WEBHOOK_URL` e `GUMROAD_PRODUCT_ID` via env, `csp` explícita, `publisher: HldrJnr` — ver `ANTIVIRUS_FALSO_POSITIVO.md`.
* **2026-01 — UI:** `EffectRow`/`CollapsibleRow` colapsáveis, `inlinePrompt` substitui `window.prompt`, `background filters` sempre acessíveis.
