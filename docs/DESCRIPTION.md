# Lovert Design — App Description

## What is Lovert Design?

Lovert Design is a **desktop thumbnail & image editor** for content creators. It produces
sized graphics (thumbnails, covers, promo cards) for many platforms from a single,
resolution-independent project format.

---

## Backend and Frontend

### Frontend
- **React 19** with **TypeScript** for the UI.
- **Tailwind CSS 4** for styling.
- **Zustand** as the single application store (all state and actions in one place).
- **Vite** as the dev server / bundler.
- Canvas is rendered as real HTML/CSS (not `<canvas>`), so layers, text, gradients,
  masks and filters are normal DOM elements — this is what makes export via
  `html-to-image` pixel-accurate.

### Backend
- **Tauri 2** (Rust) wraps the frontend into a native Windows/macOS/Linux app.
- Handles **file system I/O**: reading/writing project files, importing images,
  reading template JSON.
- Handles **file associations** (double-click a `.lovd` to open it) and deep-linking
  to an already-running instance.
- Small binary and low memory vs. Electron, since the OS webview is used for rendering.

### How they talk
The frontend calls Tauri APIs (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`,
deep-link) through dynamic `import()`. The Rust side returns plain data (text, bytes)
that the Zustand store turns into state. No custom RPC protocol to learn.

---

## What the App Can Do (Feature Overview)

This is a high-level map of capabilities — enough to know what is possible. For the
exact JSON shape to generate projects in code, see `ARCHITECTURE_AI.md`.

### Platforms / Sizes
Ships with 19+ ready templates: YouTube (HD/Full HD/2K), Instagram (Post/Story),
Facebook (Post/Cover), Unity (Card/Cover), Fab (SD/HD), Gumroad (Square/Cover),
itch.io (Cover/Square/Banner), LinkedIn (Square/Portrait/Link). Custom sizes are
also supported.

### Layers
- **Text** — fonts, size, weight, style, color, gradient text, alignment, line height,
  letter spacing, transforms, outline, shadow.
- **Image** — import local files, per-layer filters (brightness, blur, contrast,
  saturation, hue, sepia, negative), border radius, mirror.
- **Emoji / element** — large glyph elements.
- **Vector shapes** — rect, circle, triangle, star, heart, arrows, etc. with fill,
  stroke and gradient.
- **Groups** — organize and transform layers together.
- **Masks** — clip one layer by another (intersection / difference).

### Background
Solid color, CSS gradient (presets + custom builder), or image, each with its own
effects and position/size controls.

### Effects
Per-layer and global brightness, contrast, saturation, blur, hue rotate, sepia,
negative, plus shadow and outline on any layer.

### Projects & Import/Export
- Save / open projects in the `.lovd` format (double-clickable).
- Undo / redo history.
- Save designs as reusable template presets.
- Batch-import templates from JSON files or entire folders.
- Export a PNG at full resolution; export a design as a JSON template.
- Projects can be **authored entirely as JSON** and opened in the app (see
  `ARCHITECTURE_AI.md`).

### Interface
Dark / light / base themes, accent colors, adjustable UI scale, keyboard shortcuts,
multi-language UI (PT / EN / ES), layer panel with visibility & lock, snap-to-grid.
