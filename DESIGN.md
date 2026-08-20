---
version: alpha
name: Jump
description: Visual identity contract for Jump, the Epitech Academy platform. Derived from the official Epitech charte graphique, adapted to a four-space production web app.
colors:
  # ---- Brand, straight from the charte. Fills and large display only. ----
  epiBlue: '#013afb'
  epiTech: '#00ff97'
  epiTogether: '#ff5f3a'
  epiTomorrow: '#ff1ef7'
  epiDark: '#181818'
  epiLavender: '#b8c0e8'
  # ---- Ink variants: same hues, legible as small text on light surfaces ----
  epiTechInk: '#007a46'
  epiTogetherInk: '#b5361a'
  epiTomorrowInk: '#9b0b93'
  epiWarningInk: '#8a5a00'
  # ---- Semantic, light theme (names match the CSS vars in layout.css).
  #      Derived roles reference their brand hue rather than repeating a hex,
  #      so the derivation is machine-readable and cannot drift. ----
  primary: '{colors.epiBlue}'
  primaryForeground: '#ffffff'
  background: '#f6f7fb'
  card: '#ffffff'
  foreground: '{colors.epiDark}'
  foregroundSecondary: '#3a3f55'
  mutedForeground: '#555b71'
  muted: '#eceef5'
  border: '#d9dce8'
  ring: '{colors.epiBlue}'
  destructive: '{colors.epiTogetherInk}'
  destructiveForeground: '#ffffff'
  success: '{colors.epiTechInk}'
  warning: '{colors.epiWarningInk}'
  chrome: '#0b0e1a'
  chromeForeground: '#ffffff'
  # ---- Semantic, dark theme ----
  darkBackground: '#0c0e13'
  darkCard: '#12151d'
  darkMuted: '#1b1f29'
  darkBorder: '#262b38'
  darkForeground: '#f1f2f6'
  darkForegroundSecondary: '#a1a6b7'
  darkMutedForeground: '#8b90a3'
  darkPrimary: '#809dfd'
typography:
  displayXl:
    fontFamily: Anton
    fontSize: 3.5rem
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: '-0.01em'
  displayL:
    fontFamily: Anton
    fontSize: 2.5rem
    fontWeight: 400
    lineHeight: 1
    letterSpacing: '-0.01em'
  displayM:
    fontFamily: Anton
    fontSize: 1.875rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: '0em'
  displayS:
    fontFamily: Anton
    fontSize: 1.25rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: '0.02em'
  titleM:
    fontFamily: IBM Plex Sans
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.3
  bodyM:
    fontFamily: IBM Plex Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  bodyS:
    fontFamily: IBM Plex Sans
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
  overline:
    fontFamily: Space Mono
    fontSize: 0.6875rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '0.14em'
  data:
    fontFamily: Space Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.4
  numericLive:
    fontFamily: IBM Plex Sans
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 12px
  xl: 16px
  pill: 999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 24px
  6: 32px
  7: 48px
  8: 64px
  9: 96px
  10: 128px
components:
  button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primaryForeground}'
    typography: '{typography.bodyS}'
    rounded: '{rounded.sm}'
    height: 36px
    padding: 16px
  buttonNeon:
    backgroundColor: '{colors.epiTech}'
    textColor: '{colors.epiBlue}'
    rounded: '{rounded.sm}'
    height: 36px
  buttonDestructive:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.destructiveForeground}'
    rounded: '{rounded.sm}'
    height: 36px
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.sm}'
    padding: 24px
  cardBrand:
    backgroundColor: '{colors.epiBlue}'
    textColor: '{colors.primaryForeground}'
    rounded: '{rounded.sm}'
    padding: 24px
  cardTalent:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.xl}'
    padding: 24px
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.bodyS}'
    rounded: '{rounded.sm}'
    height: 36px
    padding: 12px
  badge:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foregroundSecondary}'
    typography: '{typography.overline}'
    rounded: '{rounded.sm}'
    padding: 6px
  badgeSuccess:
    backgroundColor: '{colors.card}'
    textColor: '{colors.success}'
    typography: '{typography.overline}'
    rounded: '{rounded.sm}'
    padding: 6px
  badgeWarning:
    backgroundColor: '{colors.card}'
    textColor: '{colors.warning}'
    typography: '{typography.overline}'
    rounded: '{rounded.sm}'
    padding: 6px
  badgeDanger:
    backgroundColor: '{colors.card}'
    textColor: '{colors.epiTogetherInk}'
    typography: '{typography.overline}'
    rounded: '{rounded.sm}'
    padding: 6px
  badgeVision:
    backgroundColor: '{colors.card}'
    textColor: '{colors.epiTomorrowInk}'
    typography: '{typography.overline}'
    rounded: '{rounded.sm}'
    padding: 6px
  chip:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foregroundSecondary}'
    typography: '{typography.caption}'
    rounded: '{rounded.pill}'
    padding: 8px
  tableHeader:
    backgroundColor: '{colors.card}'
    textColor: '{colors.mutedForeground}'
    typography: '{typography.overline}'
    rounded: '{rounded.none}'
    padding: 12px
  kpiTile:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.displayL}'
    rounded: '{rounded.sm}'
    padding: 20px
  sidebar:
    backgroundColor: '{colors.chrome}'
    textColor: '{colors.chromeForeground}'
    rounded: '{rounded.none}'
    width: 250px
  dialog:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.sm}'
    padding: 24px
  focusRing:
    backgroundColor: '{colors.ring}'
    rounded: '{rounded.sm}'
    size: 3px
  celebration:
    backgroundColor: '{colors.epiBlue}'
    textColor: '{colors.epiTech}'
    typography: '{typography.displayXl}'
    rounded: '{rounded.none}'
    padding: 48px
  inverseSurface:
    backgroundColor: '{colors.epiDark}'
    textColor: '{colors.primaryForeground}'
    rounded: '{rounded.sm}'
    padding: 24px
  decorativeBlock:
    backgroundColor: '{colors.epiLavender}'
    rounded: '{rounded.none}'
---

## Overview

Jump is an internal Epitech Academy platform. Its visual identity comes from the
official **charte graphique Epitech** (`~/Downloads/Epitech Design System`,
`uploads/Charte graphique_Final_compressed.pdf` is the source of truth).

**This file is the target, not a description of the current code.** Where
`frontend/src/routes/layout.css` or a component disagrees with a value here, the
code is wrong. `layout.css` is the single implementation of these tokens: nothing
below should be re-declared in a component.

### Sources, and how much authority each one has

| Source | Authority |
| --- | --- |
| `Charte graphique_Final_compressed.pdf` | **Brand law.** Logo, palette, the three fonts, signature punctuation. |
| `colors_and_type.css`, `README.md`, `preview/*.html` in the DS folder | **Faithful transcription** of the charte into CSS. Trust the values. |
| `sales/`, `eso/` in the DS folder | **One designer's app mockup, not law.** Useful for tone, and its light-mode block is genuinely valuable (see Colors). It also breaks the charte in places: gradient text, neon glow shadows, a space-and-astronaut 404. Do not copy those. |
| This file | **The app's contract.** Where the charte is silent (success states, dark mode, data density), this file decides. |

### Validating this file

It follows the [DESIGN.md format](https://github.com/google-labs-code/design.md)
(YAML tokens for machines, prose for judgement calls), so it lints:

```bash
npx @google/design.md lint DESIGN.md
```

Expect **0 errors** and a handful of `orphaned-tokens` warnings. Those are
correct, not debt: the format has no notion of a second theme, so the eight
`dark*` values look unused, and `epiTogether` / `epiTomorrow` / `border` are
governed by prose rules (fills, display text, elevation) rather than by a
component property the format allows. Do not delete a token to silence a warning.

A repo-local test does the work the format cannot:

```bash
cd frontend && bun run test   # src/lib/design/contract.test.ts
```

It parses this file's front matter and `frontend/src/routes/layout.css` and fails
when they disagree, so the tokens above cannot quietly become a second source of
truth. It also asserts every pair in the Colors tables against its floor, which
is the check that `--muted-foreground` at 3.15:1 needed and did not have.

The charte is a **print and campaign** charte. It was written for posters and
roll-ups, not for a table of 200 students that staff read for eight hours. Every
deviation recorded here exists because a print rule failed a screen job, and each
one names the job.

### The Epitech identity, in one paragraph

Code as a language: the logo is `{EPITECH}`, titles end in a terminal cursor `_`,
taglines are wrapped in `< />`. Blueprint grids and half-opacity pixel squares are
the texture. Square geometry, flat surfaces, one dominant blue. Confident and
collective, warm rather than cold. Never cyberpunk.

### Four spaces, one token layer

The spaces look different on purpose. They differ in **radius, elevation, accent
and density only**. They never differ in palette family, font, or spacing scale.

| Space | Path | Radius | Elevation | Accent | Density |
| --- | --- | --- | --- | --- | --- |
| **Dev** (recruitment) | `/staff/dev/` | `sm` (2px) | flat, 1px border | `epiBlue` | dense: 36px controls, 8px row padding |
| **Admin** | `/staff/admin/` | `sm` (2px) | flat, 1px border | `epiTomorrow` | dense, same as dev |
| **Talent** (students) | `(talent)/` | `lg` / `xl` | raised | `epiBlue` + `epiTech` | comfortable: 44px targets, 24px card padding |
| **Parent** | `(parent)/` | `lg` / `xl` | raised | `epiBlue` | generous, single column, `max-w-lg` |

Public surfaces (`/login`, `/welcome`, `/f/[slug]` feedback forms) follow the
**talent** skin: they are read once, on a phone, by someone who is not staff.

A space is implemented as an override of the semantic tokens on its root element,
the way `.camper-layout` already overrides `--radius`. It is never implemented by
switching to a different Tailwind color family.

## Colors

### The brand palette, and why every accent has two values

The charte gives one dominant blue plus four vivid accents. Measured against
white, only the blue is legible as text:

| Token | Hex | On white | Verdict |
| --- | --- | --- | --- |
| `epiBlue` | `#013afb` | 7.00:1 | text, fills, focus rings |
| `epiTech` | `#00ff97` | 1.33:1 | **fills on dark or blue only**, never text on light |
| `epiTogether` | `#ff5f3a` | 3.02:1 | display text 24px+ and fills only |
| `epiTomorrow` | `#ff1ef7` | 3.10:1 | display text 24px+ and fills only |
| `epiLavender` | `#b8c0e8` | 1.79:1 | decorative blocks, strong borders |

So each accent carries an **ink variant**: the same hue, darkened until small text
passes WCAG AA. These are not invented, they are the values the design system's
own light-mode block already worked out:

| Ink token | Hex | On white | Replaces |
| --- | --- | --- | --- |
| `epiTechInk` | `#007a46` | 5.42:1 | every `emerald-*`, `green-*`, and the `_` cursor on light |
| `epiTogetherInk` | `#b5361a` | 5.99:1 | every `red-*`, `rose-*`, and the old `--destructive` |
| `epiTomorrowInk` | `#9b0b93` | 7.34:1 | magenta labels and links in the admin space |
| `epiWarningInk` | `#8a5a00` | 5.93:1 | every `amber-*` |

**The rule: raw for fills and display, ink for anything smaller than 24px.**

### Semantic status colors

The charte has no success or warning state, and `preview/form-fields.html` uses
blue for success and orange for error. That is fine for a form on a poster and
wrong for an app where green means "synced" in six different tables. So Jump
defines four status colors, all traced back to a brand hue:

- `success` = `epiTechInk`. Green stays the tech green, just legible.
- `warning` = `epiWarningInk`. The one value with no brand ancestor, taken from the DS light-mode block.
- `destructive` = `epiTogetherInk`. The charte already assigns orange to alerts.
- info = `primary`.

There is **no fifth status color and no separate palette for charts**. A hue that
is not in this list does not appear in the product.

### Neutrals: one ramp, and it is blue-tinted

The charte neutrals are lavender-tinted, not grey: `#f6f7fb`, `#eceef5`,
`#d9dce8`, `#b8c0e8`, `#0b0e1a`. That is the ramp, for all four spaces. Warm or
pure greys read as a different product next to the brand blue.

| Role | Light | Dark | On its own surface |
| --- | --- | --- | --- |
| `background` (page) | `#f6f7fb` | `#0c0e13` | |
| `card` (surface) | `#ffffff` | `#12151d` | |
| `muted` (raised, hover) | `#eceef5` | `#1b1f29` | |
| `border` | `#d9dce8` | `#262b38` | |
| `foreground` | `#181818` | `#f1f2f6` | 17.8:1 / 16.3:1 |
| `foregroundSecondary` | `#3a3f55` | `#a1a6b7` | 10.4:1 / 7.5:1 |
| `mutedForeground` | `#555b71` | `#8b90a3` | 6.7:1 / 5.8:1 |

`foreground` is `#181818`, never `#000000`: the charte says so explicitly.

**`mutedForeground` is the most load-bearing value in this file.** It carries
every label, every table caption, every "12 inscrits" under a figure. It must
clear 4.5:1 against both `background` and `card`, which is why it is `#555b71`
and not a mid grey.

### Dark theme

The charte has no dark mode. Jump has one in all four spaces, and it stays: staff
use this tool all day, and the design system's own app mockup is dark-first, so
dark is arguably more Epitech than light. Two rules make it cheap:

1. **Dark is a token swap, never a per-utility `dark:` variant.** A space that
   reads its colors from semantic tokens gets dark mode for free.
2. **`epiBlue` never changes value.** It is the logo. Dark surfaces use a
   separate `darkPrimary` (`#809dfd`, 7.1:1 on `darkCard`) for UI text and
   borders. Redefining `epiBlue` per theme puts a non-brand blue in the wordmark.
3. **The ink variants invert on dark.** They exist only to survive a light
   background; on a dark surface the raw brand hues are the legible ones
   (`epiTech` 13.7:1 on `darkCard`). So `epiTechInk` resolves to `epiTech` there,
   and `epiTogetherInk` / `epiTomorrowInk` / the warning lift to `#ff9878` /
   `#ff7ef6` / `#ffd15c`. A component therefore names the ink token once and is
   correct in both themes.
4. **A drop shadow is invisible on dark**, so `raised` collapses to nothing there
   and the 1px border carries the separation. Only `overlay` survives, deepened.

### Chrome

`chrome` (`#0b0e1a`) is the near-black for always-dark furniture: the sidebar and
the admin top bar. There is exactly **one** near-black for chrome. `epiDark`
(`#181818`) is for inverse content surfaces (a dark card, a dark badge), which is
a different job. No third value, and never a raw `slate-950`.

Full-bleed `epiBlue` is reserved for hero and celebration surfaces (login panel,
countdown card, diploma ceremony). It is not chrome: a 250px column of pure brand
blue in front of someone for eight hours is fatiguing, which is why the sidebar is
`chrome` and not blue.

## Typography

Three families, no fourth, ever: **Anton** (display), **IBM Plex Sans** (body and
UI), **Space Mono** (labels, data, code). All three are self-hosted through
`@fontsource`. Never add a Google Fonts `@import` in a component.

### Anton

- **Uppercase only.** Enforced globally: `.font-heading` applies `uppercase`.
- **Never below 16px.** It is condensed; small Anton stops being readable before it stops being brand.
- **Tracking follows size.** The charte's `-0.01em` is for 64px to 160px poster titles. Applying one positive `tracking-wide` to every Anton title, as the code does today, spaces out the wrong end of the scale.

  | Size | Letter spacing |
  | --- | --- |
  | 40px and up | `-0.01em` |
  | 24px to 39px | `0` |
  | 16px to 23px | `+0.02em` |

- **Never for running text**, never for a paragraph, never for a form label.
- **Never for a number that changes.** See below.

### Numbers

This is the one place where picking on brand and picking on function pull apart,
so it is a rule and not a preference. Measured at 40px:

- **Anton has no tabular figures.** `111` is 39.7px wide, `000` is 59.3px. A `font-variant-numeric: tabular-nums` declaration on Anton does nothing: the font has no `tnum` feature.
- **IBM Plex Sans figures are already tabular.** `111`, `198` and `000` all measure exactly 72px. `tabular-nums` on Plex is a no-op too, because it is already the default.

Therefore:

| Kind of figure | Font |
| --- | --- |
| Static hero figure, KPI tile total, a count that changes on navigation | **Anton.** On brand, and nothing reflows. |
| Figure that changes in place: countdown, live poll, XP counter, timer | **IBM Plex Sans bold.** Anton would jitter by up to 20px per three digits every tick. |
| Denominators, ids, codes, durations, table timestamps | **Space Mono.** |

`tabular-nums` is a no-op with both our fonts. Do not add it, and do not read an
existing one as protection.

**Never `font-black` or `font-extrabold`.** `@fontsource-variable/ibm-plex-sans`
declares `font-weight: 100 700`. A 900 request clamps to 700, so the class states
a weight the app cannot render. `font-bold` is the top.

### The overline layer

Small uppercase mono labels are what make a dense screen read as Epitech rather
than as generic admin software. They are also where the type scale drifts hardest:
the code currently spells them as arbitrary values roughly 210 times
(`text-[10px]`, `text-[11px]`, `text-[9px]`, and one `text-[8px]`).

- One `overline` token: **Space Mono 700, 11px, `0.14em`, uppercase**.
- **11px is the floor.** Nothing in the product is 8, 9 or 10px. A 9px label in `mutedForeground` is decoration pretending to be information.
- Overlines use `mutedForeground`, or an ink accent when the section carries a brand meaning.

## Layout

- **Base unit 4px**, scale `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`. No arbitrary pixel spacing.
- **Grid-first.** The blueprint grid (thin lines at 48px cells, `epiBlue` at 6% on light, white at 4.5% on dark) is a real brand asset and belongs in a utility class, not copied into `style=` attributes.
- Content column: `max-w-5xl` for talent, `max-w-lg` for the parent flow, full width for staff tables.
- **Staff chrome is one structure across both staff spaces.** Today admin uses a full-width top bar over a sidebar and dev uses a full-height sidebar beside a content-width bar. Pick the dev shape (full-height sidebar, so the brand block and the campus context sit together) and use it in both.
- Layout reference for staff list pages: `/staff/dev/events/[id]/inscrits`. Its filter row, table and empty states are the canon.

## Elevation & Depth

Flat-first. Depth comes from a 1px border and a surface change, not from a shadow.

| Level | Value | When |
| --- | --- | --- |
| `flat` | 1px `border`, no shadow | **Default.** Every staff card, panel, table and tile. |
| `raised` | `0 1px 2px rgba(0,0,0,0.08)` | Talent and parent cards, and anything floating over an image. |
| `overlay` | `0 4px 16px rgba(0,0,0,0.10)` | Dialogs, popovers, dropdowns. Only these. |

- A space picks its card elevation once, through `shadow-card`: `none` for staff, `raised` for talent and parent. A component never branches on the space to decide whether it has a shadow.
- **No `shadow-lg`, `shadow-xl`, `shadow-2xl`.** Three levels is the whole scale.
- **No colored shadows.** `shadow-epi-blue/20` and `shadow-slate-200/50` are glows; the charte handles glow photographically, not with `box-shadow`.
- **No `backdrop-blur`, anywhere.** The brand prefers hard edges. A sticky header over scrolling content gets an opaque `card` surface and a 1px bottom border, which is what the staff spaces already do and it works.
- **No gradient backgrounds and no blurred color blobs.** Where a surface needs texture, the charte's own answer is better and cheaper to paint: the blueprint grid plus a few half-opacity pixel squares in `epiBlue` or white.

## Shapes

Square and pixel-rigid. The charte allows 0 to 4px and nothing else.

| Token | Value | Used by |
| --- | --- | --- |
| `none` | 0px | Table cells, dividers, full-bleed bands, images. |
| `sm` | 2px | **Staff default.** Buttons, inputs, cards, tiles, dialogs. |
| `md` | 4px | Charte maximum. Nested inner elements inside an `sm` card. |
| `lg` | 12px | Talent and parent controls, inputs, small cards. |
| `xl` | 16px | Talent and parent cards. **The ceiling.** |
| `pill` | 999px | Chips and tags carrying short meta only, plus avatars. |

`lg` and `xl` are a deliberate deviation, argued in Deviations below. `rounded-3xl`
(24px) is not: it reads as a consumer app that happens to use Epitech blue.

Photography and images are rectangles: no rounded corners, no drop shadow.

## Components

Values are in the front matter. The rules that are not values:

**Button.** Uppercase, `font-bold`, `sm` radius, 36px default height. The charte's
own button is Space Mono at `0.08em`; Jump uses IBM Plex Sans bold at `0.025em`
instead, because mono uppercase French labels ("Générer les badges") get wide
enough to break a dense toolbar. The mono voice is carried by the overline layer
instead, which is where it costs nothing.

Primary is `primary` filled. `buttonNeon` (`epiTech` fill, `epiBlue` text) is the
charte's celebration CTA: use it for the one hopeful action on a talent or login
surface, never in a staff toolbar. Destructive is `destructive` filled. Press
translates 1px down, no scale change.

**A raw accent is never a button fill.** `epiTomorrow` with white text is 3.10:1
and `epiTogether` is 3.02:1, so a magenta "Ajouter" button fails AA on its own
label. Magenta is the admin space's identity (page titles, active nav, tile
accents), and identity is not the same thing as a call to action: the action is
`primary`. The single exception is `buttonNeon`, and it is one because its text is
`epiBlue` rather than white.

**Card.** `card` surface, 1px `border`, `sm` radius, 24px padding, no shadow.
`cardBrand` is the inverse: `epiBlue` fill, white text, optionally one pixel-square
decoration. `cardTalent` is the same card at `xl` radius with `raised` elevation.

**Section header.** Mono overline, then an Anton title ending in the `_` cursor,
then optional right-aligned meta. This exists as `EpiSection`. Use it instead of
hand-rolling a header, and use `AdminPageHeader` for admin page titles: roughly
half the admin pages hand-roll an `<h1>` today, which is why the same page title
is two-tone on one screen and fully magenta on the next.

**Table header.** Overline typography, `mutedForeground`, left aligned, 1px bottom
border, no fill. Sentence-case headers are a drift, not a variant.

**KPI tile.** Overline label, then the figure per the Numbers rules, 3px left
border in the tone accent, optional progress bar. When a tile doubles as a filter,
the active state is a full `primary` fill with white text and `aria-pressed`.

**Focus.** Exactly one focus treatment, set once on `:focus-visible` in the base
layer: **2px solid `ring`, 2px offset**, at full opacity. Not 2px in one place and
4px in another, and not per-component.

This deviates from the charte, which specifies a 3px halo at 32% alpha. At that
opacity the indicator is about 1.9:1 against white and fails WCAG 2.2 SC 1.4.11,
so the charte's own focus ring is not usable. A solid `outline` also survives an
`overflow-hidden` ancestor, which a `box-shadow` ring does not, so it removes a
whole class of "the focus ring is clipped" bug.

A control may replace the outline with a drawn border (a seamless inline editor
does), but it has to actually draw one: `focus-visible:ring-0` with nothing in its
place is invisible to a keyboard.

**Icon-only controls need a name.** Lucide glyphs are `aria-hidden`, so a button
with only an icon and no `aria-label` announces as "button". In the admin roster,
impersonate and delete are currently indistinguishable to a screen reader.

**Avatars.** Generated from local initials on a token background. They must not be
fetched from a third-party service: today's `avatar.vercel.sh` URLs send a talent
id and initials to an external host on every row, for a platform whose users are
minors.

**Logo.** One master SVG per tone, shipped as an asset. Never recolored with
`brightness-0 invert`: the charte forbids adding effects to the logo, and a filter
breaks the moment the wordmark stops being single color. Clear space around the
logo equals the height of its `{`.

## Do's and Don'ts

**Do**

- Read colors, radii, spacing and type from tokens. A new hex in a component is a bug.
- Give an accent its ink variant as soon as the text is under 24px.
- Use `EpiSection`, `AdminPageHeader`, `KpiTile`, `SortableTable` and the `ui/` primitives. If one is missing, add it once.
- Let a space differ by radius, elevation, accent and density. Nothing else.
- Put the mono overline above titles and on table headers. It is the cheapest brand signal in the system.
- Keep the four brand accents meaningful: `epiTech` for progress and success, `epiTogether` for human and alert, `epiTomorrow` for vision, `epiBlue` for everything structural.

**Don't**

- Don't reach for a Tailwind color family. `slate-*`, `amber-*`, `emerald-*`, `rose-*`, `violet-*` and `teal-500` are all off-palette, and `slate` is a second neutral ramp competing with the tokens.
- Don't add a fifth accent hue, including pastels. A soft surface is made with tints of the four, not with new hues.
- Don't use `epiTech` as a page background, and don't put it on white as text.
- Don't fill a button with a raw accent. `bg-epi-tomorrow text-white` is 3.10:1; the primary action is `primary`.
- Don't use emoji outside the talent voice. They are allowed in talent copy (rewards, greetings, feedback faces) where they do real work with a 15-year-old reader, and nowhere else: not in staff or parent copy, not in the brand chrome. The charte's position is that `_`, `< />`, `{ }` and `/` are the brand's emoji.
- Don't blur, glow, or gradient a surface.
- Don't animate longer than 320ms, and don't use `transition-all`.
- Don't hand-roll a card, a header, a badge or a dialog that already exists in `ui/`.
- Don't put a figure that ticks in Anton.

## Brand primitives

The charte's punctuation is non-negotiable, which is exactly why it must exist
once in code. It is currently hand-copied: about 40 inline `_` spans, 19 manual
`&lt;`/`&gt;` pairs, and the blueprint grid pasted into two `style=` attributes at
two different cell sizes.

| Primitive | Meaning | Rule |
| --- | --- | --- |
| `_` | Terminal cursor | Ends a title. `epiTech` on dark or blue, `epiTechInk` on light: at 1.33:1 the neon underscore on a white card is invisible, so the brand signature is simply lost. |
| `< />` | Code tags | Wraps a tagline, an accroche, a date range. Never wraps a control label. |
| `{ }` | Braces | Logo and signature block only. Never decoration. |
| `/` | Slash | Separates keywords in a list. |
| Blueprint grid | Texture | 48px cells, `epiBlue` at 6% on light, white at 4.5% on dark. |
| Pixel squares | Texture | Half-opacity `epiBlue`, white, or `epiLavender` rectangles, offset and overlapping. |

Titles are uppercase. Taglines are sentence case inside `< />`. Body copy is
sentence case with French typography.

## Motion

Short, direct, purposeful. The brand is flat and confident: it does not bounce.

| Token | Value |
| --- | --- |
| `fast` | 120ms |
| `base` | 200ms |
| `slow` | 320ms |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `ease-emphatic` | `cubic-bezier(0.2, 0, 0.2, 1.2)` |

- **320ms is the ceiling for a state transition.** `duration-500` and `duration-700` are in the code today and read as lag. A one-shot celebration animation is a different thing and states its own duration (the XP float runs 2.2s on purpose); the ceiling governs anything that answers an interaction.
- Name the properties you animate. `transition-all` animates layout properties too.
- Fades and 8px to 16px slides. No parallax, no spring, no scale on press.
- `ease-emphatic` is for brand reveals only: the XP float, the diploma ceremony, the first-login welcome. These are the talent space's licence to overshoot, and they stay rare.
- Every non-trivial animation respects `prefers-reduced-motion`.

## Accessibility

WCAG AA is a floor, not a goal, and it is the reason several values in this file
differ from the charte.

- Text under 24px: 4.5:1. Text 24px and up, or 19px bold: 3:1. UI borders and icons: 3:1.
- Every token pair in Colors is measured. If a combination is not listed there, measure it before shipping it.
- One focus treatment, always visible, never removed without a drawn replacement.
- Every interactive element has an accessible name. Icons are `aria-hidden`, so the name lives on the control.
- Talent and parent surfaces are used on phones by minors and by adults who are not IT staff: 44px minimum touch target, and never a hover-only affordance.
- Color is never the only carrier of state. A status needs a glyph or a word next to the dot.

## Deviations from the charte, and why

Each of these is a print rule that failed a screen job. Nothing here is an
oversight, and nothing here should be "fixed" back.

| Deviation | Charte says | Jump does | Why |
| --- | --- | --- | --- |
| Ink variants of the accents | Four vivid accents | Each accent has a darkened text variant | The vivid values sit between 1.3:1 and 3.1:1 on white. A poster has no 12px label; every screen here does. |
| Light theme by default | Full-bleed blue or white | Light surfaces, blue reserved for hero and celebration | Staff read cohort tables all day. The DS app mockup is dark-first; we keep dark as an equal option rather than the default. |
| A dark theme at all | Not addressed | Four spaces support dark | Long sessions, and it costs nothing once colors come from tokens. |
| Success and warning colors | No success state; blue for success, orange for error | Four status colors, all traced to a brand hue | Six tables need "synced", "queued", "failed". Reusing blue for success collides with blue as the structural color. |
| Sans-serif buttons | Space Mono buttons | IBM Plex Sans bold uppercase | Mono uppercase French labels break a dense toolbar. The mono voice moves to the overline layer. |
| 12px and 16px radii in talent and parent | 0 to 4px, square | Soft corners on those two spaces only | The audience is 15-year-olds and their parents, on a phone, in a moment that should feel welcoming rather than administrative. Staff spaces stay square, so the brand's rigidity is still visible where the volume of the product lives. |
| Emoji in talent copy | No emoji | Allowed in talent copy only | The charte's substitutes are typographic and read as technical. A reward toast for a 15-year-old is the one place a `🎉` outperforms a `_`. |
| Anton for numbers, conditionally | Anton for all display | Anton only for figures that do not tick | Measured: Anton has no tabular figures, so a countdown drifts 20px per tick. |
| Magenta as the admin signature | Magenta is the vision accent, used sparingly | Admin page titles, active nav and tile accents are magenta | Two staff spaces sit one click apart and are easy to confuse. A per-space accent is the cheapest orientation cue there is, and it uses the palette rather than adding to it. |

### Rejected

- **The design system's `sales/` and `eso/` mockups as a token source.** They ship gradient text, neon glow shadows and a starfield 404. Their light-mode block is worth mining for AA values; their component CSS is not.
- **A space metaphor anywhere.** The DS mockup has an astronaut 404. Jump's talent voice does not use space metaphors.
- **`--epi-teal-solid` (`#14b8a6`).** It was a good instinct, that the neon green is unreadable on light, resolved with a Tailwind `teal-500`: a hue that is not Epitech's, and still only 2.49:1. `epiTechInk` is the same instinct with a brand hue and 5.42:1.
- **`--header-bg` and `--header-foreground`.** Declared in `layout.css`, never applied. Three spaces each hand-roll a different header. Delete the tokens or use them; do not leave a token that lies about `epiBlue`.
