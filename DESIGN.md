---
name: SFL Stats
description: A compact, competitive workbench for SFL CS2 performance data.
colors:
  league-magenta: "oklch(0.518 0.253 323.949)"
  league-magenta-dark: "oklch(0.452 0.211 324.591)"
  paper-white: "oklch(1 0 0)"
  ink-mauve: "oklch(0.145 0.008 326)"
  panel-dark: "oklch(0.212 0.019 322.12)"
  muted-mauve: "oklch(0.96 0.003 325.6)"
  muted-copy: "oklch(0.542 0.034 322.5)"
  line-mauve: "oklch(0.922 0.005 325.62)"
  focus-mauve: "oklch(0.711 0.019 323.02)"
  danger-red: "oklch(0.577 0.245 27.325)"
typography:
  body:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  data:
    fontFamily: "Geist Mono, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.league-magenta}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mauve}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
---

# Design System: SFL Stats

## Overview

**Creative North Star: "Scout’s Workbench"**

SFL Stats is a compact, competitive workbench for reading league performance. Its interface puts dense, demo-derived records and comparisons first: a clear sans-serif carries the working text, monospaced figures support quick scanning, and a vivid magenta accent marks the primary action and selected states. The mood is competitive and energetic, expressed through purposeful color and responsive controls rather than a wholesale esports spectacle.

The visual system balances a bright, white light theme with a mauve-tinted dark theme. Fine borders and muted surfaces organize the work area; selective shadows make controls and overlays tactile. Navigation stays icon-led and task-oriented, while tables remain the central high-density pattern.

**Key Characteristics:**
- Compact, data-dense layouts with tabular and monospaced statistics.
- Vivid league magenta against quiet, mauve-tinted neutrals.
- Border-defined surfaces, with restrained lift for interactive layers.
- Paired light and dark themes; the default follows the system preference.

## Colors

A high-chroma magenta carries the league’s visual signal, balanced by near-white and mauve-based neutrals; theme variables adapt those roles for dark mode.

### Primary
- **League Magenta** (`oklch(0.518 0.253 323.949)`): The primary action color and the defining interface accent in the light theme. The dark theme uses the deeper companion token in the frontmatter.

### Neutral
- **Paper White** (`oklch(1 0 0)`): The light-theme page, card, and popover surface.
- **Mauve Ink** (`oklch(0.145 0.008 326)`): The dark, slightly mauve foreground in light mode and the dark-theme page background.
- **Deep Mauve Panel** (`oklch(0.212 0.019 322.12)`): Card and popover surface in dark mode.
- **Soft Mauve Wash** (`oklch(0.96 0.003 325.6)`): Muted and hover surfaces in light mode.
- **Mauve Secondary Copy** (`oklch(0.542 0.034 322.5)`): Muted labels and supporting text in light mode.
- **Fine Mauve Line** (`oklch(0.922 0.005 325.62)`): Light-theme borders and input outlines.
- **Mauve Focus** (`oklch(0.711 0.019 323.02)`): The visible focus treatment in light mode.

### Tertiary
- **Destructive Red** (`oklch(0.577 0.245 27.325)`): Reserved for destructive actions, validation errors, and invalid fields; not a general-purpose accent.

**The Accent Signal Rule.** Use magenta to identify the primary action or an active state, not as a substitute for the neutral structure that makes dense data readable.

## Typography

**Display Font:** Space Grotesk (with a sans-serif fallback)
**Body Font:** Space Grotesk (with a sans-serif fallback)
**Label/Mono Font:** JetBrains Mono for many section/title labels; Geist Mono for data and numeric emphasis.

**Character:** Space Grotesk keeps interface copy direct and contemporary. JetBrains Mono adds a technical cadence to section labels, while Geist Mono gives figures a stable, scan-friendly shape; use tabular numerals where values need column alignment.

### Hierarchy
- **Display** (not a global role): No separate display scale is established; page titles use the local page hierarchy.
- **Headline** (medium, commonly 14–24px): Section and page headings; some use the JetBrains Mono heading face.
- **Title** (medium, commonly 14–18px): Card and subsection titles, often set in the heading face.
- **Body** (regular, 14px, line-height 1.5): Default controls and dense supporting copy. Let tables and comparison views stay compact.
- **Label** (medium, 12px): Metadata, compact labels, and supporting table information; uppercase is not a system-wide requirement.

**The Figure-Face Rule.** Use Geist Mono or tabular numerals for statistics and ranks when alignment improves comparison; do not apply a monospaced face to all prose.

## Layout

The interface uses a compact utility rhythm rather than a separate bespoke spacing scale. Common steps are 4, 8, 12, 16, and 24px: inline controls and table cells use the tight end; cards and page sections commonly use 16px and 24px. The desktop shell pairs a collapsible sidebar with a flexible, min-width-safe content area. Navigation switches to a sheet-style mobile treatment below the medium breakpoint (768px). Data tables preserve their columns in a horizontally scrollable container rather than forcing every statistic into narrow mobile widths.

Responsive page grids use small and large breakpoints where appropriate; for example, homepage podium cards progress from one column to two at `sm` and four at `lg`. The default page shell and major section rhythm use 24px padding/gaps. Preserve scanability and data relationships as layouts contract.

## Elevation & Depth

Depth is restrained and layered: borders and muted tonal surfaces do most of the organizational work; small shadows distinguish controls, selected tabs, and cards, while popovers and sheets receive stronger separation. Avoid using elevation as a substitute for hierarchy or turning every data panel into a floating card.

### Shadow Vocabulary
- **Control inset** (`shadow-xs`): A subtle edge beneath inputs and compact match cards.
- **Selected surface** (`shadow-sm`): A small lift for selected tabs and sidebar variants.
- **Menu layer** (`shadow-md`): Dropdown and select popovers.
- **Sheet layer** (`shadow-lg`): Mobile or modal-like sheet separation.

**The Layer-on-Intent Rule.** Reserve stronger shadows for content that overlays or temporarily rises above the work surface.

## Shapes

Corners are gently rounded, with the 10px base radius feeding the utility scale. Buttons, inputs, selects, and most cards use the large radius utility (10px); small rows and table-adjacent elements use a tighter medium radius (about 8px). Borders are fine and low contrast in the light theme, then become translucent in dark mode. Keep forms and data surfaces cleanly clipped and avoid ornamental geometry.

## Components

### Buttons
Compact, tactile controls with a clear primary signal.
- **Shape:** Gently rounded corners (10px by default; small variants use about 6–8px).
- **Primary:** Magenta fill with light foreground; default size is 32px high with 10px horizontal padding. Hover shifts the fill toward a softer magenta; active presses down by 1px.
- **Hover / Focus:** Use a visible 3px focus ring with a 50% ring-color treatment; preserve keyboard visibility. Disabled controls reduce opacity to 50% and do not respond to pointer input.
- **Secondary / Ghost / Tertiary:** Outline buttons use the page surface and border; secondary buttons use the muted secondary surface; ghost buttons gain a muted surface on hover; link buttons use the primary color and underline on hover.

### Chips
- **Style:** Use existing semantic foreground/background pairings, fine borders where useful, and compact rounded shapes.
- **State:** Selected or active states may use the primary accent or a muted surface; keep decorative color separate from data meaning.

### Cards / Containers
- **Corner Style:** Gently rounded (10px for the common card treatment).
- **Background:** White or popover surfaces, with muted rows and contextual dark-theme equivalents.
- **Shadow Strategy:** Flat and border-defined at rest; use only the restrained, component-specific shadows described in Elevation & Depth.
- **Border:** Fine, low-contrast theme border.
- **Internal Padding:** Commonly 16px; page sections and shell rhythm commonly use 24px.

### Inputs / Fields
- **Style:** Transparent or theme input surface, fine input border, 10px radius, 32px height, 10px horizontal padding, and a subtle inset shadow.
- **Focus:** Border shift and visible 3px focus ring, matching buttons.
- **Error / Disabled:** Destructive border/ring for invalid state; disabled state is subdued and non-interactive.

### Navigation
Icon-and-label items live in a collapsible 16rem desktop sidebar, with a 3rem icon rail when collapsed. The active route receives a clear active treatment; tooltips identify labels in the icon-only state. Below 768px, navigation moves into an 18rem sheet. Keep the functional hierarchy and labels intact.

### Data Tables
Dense comparison surfaces prioritize consistent columns and unobstructed scanning. Table text is 14px; headers are 40px high, cells use 8px padding, and row separators/hover treatments remain subtle. Keep wide tables horizontally scrollable, and use monospaced or tabular figures for numeric comparison where appropriate.

## Do's and Don'ts

### Do:
- **Do** preserve both light and dark semantic color assignments; the theme changes the actual values behind shared roles.
- **Do** use the magenta accent for primary actions and active states, retaining neutral surfaces for the bulk of dense data.
- **Do** keep visible keyboard focus rings and the established disabled and invalid treatments.
- **Do** preserve horizontal table overflow when column relationships matter on narrow screens.
- **Do** treat SFL Rating as a provisional custom score, not an official HLTV rating.

### Don't:
- **Don't** present Faceit context as the source of SFL league statistics or SFL Rating.
- **Don't** imply that demo-derived statistics or provisional ratings are official tournament results.
- **Don't** apply strong shadows indiscriminately to data cards and sections.
- **Don't** use decorative magenta where it competes with the meaning of data or status colors.
