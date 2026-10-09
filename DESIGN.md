---
name: Tessarios
description: A dark, dense writing and worldbuilding interface set in monospace, with an electric blue as the single brand colour; the light theme is switched purely through variables.
colors:
  brand: "#0060E5"
  kennfarbe: "{colors.brand}"
  brand-hover: "#004ec2"
  brand-light: "#eef6ff"
  brand-border: "rgba(0, 96, 229, 0.4)"
  surface-base: "#09090b"
  surface-card: "#0d0d12"
  surface-elevated: "#12121a"
  surface-control: "#18181b"
  surface-hover: "#27272a"
  surface-active: "#3f3f46"
  line-subtle: "#18181b"
  line: "#27272a"
  line-strong: "#3f3f46"
  line-highlight: "#71717b"
  ink-heading: "#f4f4f5"
  ink-bright: "#e4e4e7"
  ink: "#d4d4d8"
  ink-secondary: "#9f9fa9"
  ink-muted: "#71717b"
  ink-faint: "#52525c"
  ink-disabled: "#3f3f46"
  danger-surface: "#1d0d10"
  graph-edge: "#27272a"
  heading-indigo: "#c0d9fa"
  overlay: "rgb(0 0 0 / 0.8)"
typography:
  body-sans: { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontSize: "0.875rem" }
  ui-mono: { fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace", fontSize: "0.75rem", fontWeight: 400 }
  ui-mono-small: { fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace", fontSize: "10px", fontWeight: 700 }
rounded:
  default: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  full: "9999px"
components:
  modal: { backgroundColor: "{colors.surface-card}", textColor: "{colors.ink-heading}", rounded: "{rounded.2xl}" }
  toast: { backgroundColor: "{colors.surface-elevated}", textColor: "{colors.ink-bright}", rounded: "{rounded.xl}" }
  icon-button: { backgroundColor: "{colors.surface-elevated}", textColor: "{colors.ink}", rounded: "{rounded.md}" }
  tab-bar: { backgroundColor: "{colors.surface-card}", textColor: "{colors.ink-secondary}", rounded: "{rounded.lg}" }
---

# Design System: Tessarios

## Overview

A calm, dense working surface for long writing sessions: near-black surfaces in five steps, fine grey lines, almost
everything set in a monospace face, and a single strong blue for the brand, focus and active states. Beyond that, colour
comes only from the entry-type hues and the status colours.

Source in code: `src/index.css` (tokens, light theme, helper classes), `src/components/EntityTypeBadge.tsx` (type hues),
`src/components/BaseModal.tsx`, `Toast.tsx`, `DangerConfirmDialog.tsx`, `RightPanelTabBar.tsx`, `ui/IconButton.tsx`.
Fonts ship with the app (`@fontsource`, SIL OFL); nothing is fetched at runtime.

## Colors

All values are `--color-*` variables in `@theme` in `src/index.css`. Every colour outside the accent scales goes through
one of the tokens below (usable as `bg-surface-card`, `text-ink-muted`, `border-line/80`; opacity modifiers work).
Values are given as dark theme / light theme.

**Surfaces** (darkest to lightest)
- `surface-base` `#09090b` / `#eeeef0`: app shell, page ground, deepest fields
- `surface-card` `#0d0d12` / `#fafafa`: panels and cards, dialog surface
- `surface-elevated` `#12121a` / `#ffffff`: raised on top of a card (toast, buttons)
- `surface-control` `#18181b` / `#f4f4f5`: buttons, chips, inputs
- `surface-hover` `#27272a` / `#e4e4e7`: hover state of a control
- `surface-active` `#3f3f46` / `#d4d4d8`: pressed or active

**Lines**: `line-subtle` `#18181b` / `#f4f4f5`, `line` `#27272a` / `#e4e4e7` (the default border everywhere),
`line-strong` `#3f3f46` / `#d4d4d8`, `line-highlight` `#71717b` / `#9f9fa9` (border on highlight).

**Text** (brightest to faintest): `ink-heading` `#f4f4f5` / `#09090b`, `ink-bright` `#e4e4e7` / `#18181b`, `ink`
`#d4d4d8` / `#27272a` (body text), `ink-secondary` `#9f9fa9` / `#3f3f46`, `ink-muted` `#71717b` / `#52525c`, `ink-faint`
`#52525c` / `#71717b`, `ink-disabled` `#3f3f46` / `#a1a1aa`. In the light theme the lower half of the ink ramp sits one
step darker than a mirror image would put it, because grey on white loses perceived weight faster than grey on black.

**Brand**: `brand` `#0060E5` (indigo-600, "electric indigo"), `brand-hover` `#004ec2`, `brand-light` `#eef6ff`,
`brand-border` `rgba(0, 96, 229, 0.4)`. The `indigo-50 … 950` scale is anchored at 600; in the light theme 500 and 600
stay put and the rest mirrors.

**Status** uses the Tailwind scales: `amber` = warning, `emerald` = ok, `rose` = danger. Also `danger-surface` `#1d0d10` /
rose-50 for inline error messages, `graph-edge` `#27272a` / `#a1a1aa` for edges in the relationship graph (its own token,
because a line over open canvas needs more weight than a border against a panel), `overlay` `rgb(0 0 0 / 0.8)` /
`rgb(24 24 27 / 0.45)` for the scrim behind dialogs, and `heading-indigo` `#c0d9fa` / `#1e3a8a` for headings.

**Type hues** (`TYPE_VISUALS` in `EntityTypeBadge.tsx`, the single source for "which colour means which category"; chip =
text `-400`, fill `-950/20`, border `-900/50`): book and chapter amber, character emerald, relationship rose, item purple,
map indigo, power yellow, lore cyan, organization teal, place blue, scene fuchsia, storyline violet, brainstorm and note
pink, visual zinc. The graph canvas additionally has fixed hex values per type.

## Typography

- **Monospace is the interface face.** `font-mono` (JetBrains Mono, 400/500/700) appears about 500 times, `font-sans`
  (Inter, 400/500/600/700) about 11 times. Inter is for running and reading text; JetBrains Mono is for controls, labels
  and data.
- **Sizes:** `text-xs` dominates (256 uses); `text-sm` (27), `text-xl` (8), `text-base` (4), `text-2xl` (4), `text-lg` (3),
  `text-3xl` (2). Very small steps are written freehand: `text-[10px]` (193), `text-[9px]` (72), `text-[11px]` (61),
  `text-[8px]` (9), `text-[7px]` (1), `text-[12px]` (1). See Known Deviations.
- **Weights:** `font-bold` (202), `font-semibold` (96), `font-medium` (19), `font-normal` (9). Headings and labels are
  bold; small caption titles are `uppercase` with letter spacing.

## Layout

- **Shell:** `h-screen`, columns without page scroll. A header, below it `main` as a row (`md:flex-row`): left sidebar,
  working area in the middle, right panel.
- **Sidebar:** `w-64 lg:w-72 xl:w-80`, collapsible. **Right panel:** `w-80 md:w-96 lg:w-[440px] xl:w-[490px]
  2xl:w-[540px]`, collapsed `w-12`. Widths animate with `transition-[width] duration-200`.
- **Spacing:** working area `p-4 gap-4`; panels `p-4`; panel headers `px-3 py-2.5`.
- **Breakpoints:** `sm:` 51 uses, `md:` 32, `lg:` 8, `xl:` 5, `2xl:` 1. The main break is `md`.
- **Dialog widths** (`BaseModal`): `sm` to `5xl` via `max-w-sm … max-w-5xl`.

## Elevation & Depth

- **Depth comes from surface steps, not shadows.** Cards sit on `surface-base`, raised things on `surface-card` or
  `surface-elevated`. In the light theme higher means whiter; in the dark theme it means lighter.
- **Shadows:** dialogs `shadow-2xl`; toast `shadow-2xl shadow-indigo-950/50`; active elements get a blue glow
  `rgba(0, 96, 229, 0.3)` (active tab, `btn-action-indigo`, `btn-interactive`).
- **Scrim:** `bg-overlay` with `backdrop-blur-sm` behind dialogs.
- **Stacking order, as it is today:** there is no central z-index table. See Known Deviations for the values in use.

## Shapes

- **Radii** (class counts): `rounded` (175, 0.25rem), `rounded-lg` (162), `rounded-xl` (119), `rounded-full` (39),
  `rounded-md` (25), `rounded-2xl` (19), `rounded-none` (3). Rule of thumb: dialogs `2xl`, cards and toasts `xl`,
  buttons and tab bars `md`/`lg`, chips `md`, dots and avatars `full`.
- **Lines:** 1 px, colour `line` (often `/80`); danger dialog `border-rose-900/60`; accent border `brand-border`.
- **Small parts:** slim scrollbar (6 px, thumb `rgba(113, 113, 122, 0.3)`, radius 4 px); YAML tag chip with 4 px.

## Components

Shared building blocks; look here before building a new one (see `AGENTS.md`).
- **`BaseModal`** (`src/components/BaseModal.tsx`): dialog `bg-surface-card border-line rounded-2xl shadow-2xl`; ESC and
  click-outside close it. The only dialog frame.
- **`DangerConfirmDialog`** (`DangerConfirmDialog.tsx`): confirmation for anything irreversible, red border, coloured bar
  on top.
- **`Toast`** (`Toast.tsx`): notice with an optional action (e.g. Undo), `bg-surface-elevated`, blue border.
- **`RightPanelTabBar`** (`RightPanelTabBar.tsx`): switcher for AI / Media / Statistics, active tab `bg-indigo-600` with
  white text.
- **`IconButton`** (`ui/IconButton.tsx`): variants `boxed`, `ghost`, `rail`; sizes 26 and 30 px; active rail
  `bg-indigo-600/30` with a blue glow.
- **`CollapseToggle`** (`ui/CollapseToggle.tsx`): expand/collapse control built on `IconButton`.
- **`EntityTypeBadge`** (`EntityTypeBadge.tsx`): type chip in sizes `xs`/`sm`/`md`; also provides the type colour and icon.
- **Helper classes in `index.css`:** `btn-action-indigo` (action button with a blue border), `btn-interactive` (blue
  highlight on hover), `yaml-tag`, `text-heading-indigo`.
- **Others:** `Logo.tsx` (logo with a soft gradient glow), `ErrorBoundary.tsx` (catches render crashes, never a blank
  window), `Sidebar.tsx`, `MapEditor.tsx`, `GraphView.tsx` (relationship graph on canvas).

## Do's and Don'ts

Rules that already live in `AGENTS.md` (no hard-coded colours, no invented classes, no duplicate components, light theme,
stacking order, bilingual text) are not repeated here; `npm run check` enforces them.

- **Do:** add new neutral colours only as tokens from the table above; define type hues only in `EntityTypeBadge.tsx`.
- **Do:** use very small type (`text-[10px]` and below) for secondary information only, not for content people must read.
- **Don't:** build dialog frames next to `BaseModal`.

### Known Deviations

Documented as they are, not unified. Each is a place where the code departs from the rules above or in `AGENTS.md`.

- **Stacking order (z-index):** no system, ad-hoc values from `z-10` to `z-[10000]`. `src/components/BaseModal.tsx:49`
  `z-[80]` (default); `DangerConfirmDialog.tsx:34`, `UserManualModal.tsx:100`, `Editor.tsx:1698` and `Editor.tsx:1834`
  `z-[100]`; `Editor.tsx:1607` `z-[1200]`; `Toast.tsx:29` `z-[10000]`. `z-50` in `SplashScreenModal.tsx`,
  `ImageUploadModal.tsx`, `ManuscriptEditor.tsx:1339`, `MediaView.tsx:537` and menus in `MapEditor.tsx` and
  `MarkdownTextEditor.tsx`. `z-10` to `z-40` are used 28 times across components.
- **`!important`:** `src/index.css`, in `:focus-visible` (lines 255–256), `.text-heading-indigo` (line 263) and
  `.btn-interactive:hover` (lines 315–316).
- **Hard-coded colour values:** `src/index.css` focus ring `#6366f1` (line 255), the blue `rgba(0, 96, 229, …)` in
  `.btn-action-indigo` (line 289) and `.btn-interactive` (lines 315–316), and the scrollbar `rgba(113, 113, 122, …)`
  (lines 302–306). The same blue is written inline as `rgba(0,96,229,…)` on about 43 lines in 13 component
  files, among them `App.tsx`, `Editor.tsx`, `RightPanelTabBar.tsx` and `ui/IconButton.tsx`. Fixed hex and glow
  values per type in `src/components/EntityTypeBadge.tsx` (needed for the canvas graph).
- **Freehand font sizes:** `text-[7px]` to `text-[12px]` (about 340 uses), most in `Editor.tsx` (53), `SettingsModal.tsx`
  (43), `MarkdownTextEditor.tsx` (40), `ai/ManuscriptChatPanel.tsx` (23) and `MapEditor.tsx` (22). `src/index.css` defines
  `text-2xs`, `text-3xs` and `text-4xs`, but no component uses them.
- **Duplicate type hues:** in `src/components/EntityTypeBadge.tsx` book and chapter share amber (only the text step
  differs), brainstorm and note share pink (note uses the lighter pink-400 only for its bar and graph colour), so those pairs are
  hard to tell apart in chips and in the graph.

### In Code

- **Tokens** live in `@theme` in `src/index.css` as `--color-*`. Only this way does Tailwind v4 generate `bg-`, `text-`
  and `border-` classes with opacity modifiers. Do not invent neighbours to existing tokens.
- **Light theme:** `[data-theme="light"]` in `src/index.css` redefines variables only (neutrals and scale steps). No
  light-theme overrides on components.
- **Forbidden:** hard-coded hex colours in components, invented class names, `!important`, component-level light-theme
  classes, ad-hoc `z-index` values. The Known Deviations above are the existing exceptions, not precedents.
- **Check:** `npm run check` (types, build, `scripts/check-rules.cjs` with rules for colours, classes, text, dialogs,
  headers and network resources).

### Room to Deviate

A design experiment, an extra product colour or a special page is allowed when the new value is first created as a token
in `@theme` in `src/index.css` and recorded here, with a light-theme value in `[data-theme="light"]`, and never written as
a one-off value in a component. An experiment stays on its own branch until it is approved.
