# BRANDING — تجديد (Tajdeed)

Company: **تجديد — لأدوات منزلية مستعملة** (used household goods).
Logo files (already in this pack): `public/logo.jpg` (cleaned crop, white background) and `public/logo-original.jpg`.
**Never redraw, recolor, stretch or replace the logo.** Use it as-is, with clear space ≥ the height of the "ت" letter on all sides.

> The logo is a JPG (no transparency). It must sit on **white** or the very light tint `#F7FDFD`. When the owner supplies an SVG/PNG with a transparent background, replace `public/logo.jpg` and keep the same imports (`/logo.svg` preferred). On dark surfaces (sidebar) do **not** place the JPG directly; use a white rounded "badge" container behind it.

## Palette (sampled from the logo)
| Token | Hex | Use |
|---|---|---|
| `brand-navy` | `#10324D` | Headings, body text on light, sidebar background |
| `brand-blue` | `#397AD2` | Logo blue, charts, decorative accents (NOT for white text, contrast 4.3:1) |
| `brand-blue-600` | `#2F67B8` | **Primary buttons/links** (white text contrast 5.6:1, AA) |
| `brand-blue-700` | `#2A5CA8` | Primary hover/pressed (6.6:1) |
| `brand-teal` | `#4EC1D3` | Secondary accent, active indicators, chart series 2 |
| `brand-cyan` | `#7EDAE4` | Soft highlights, chart series 3 |
| `brand-tint` | `#E8F6F9` | Subtle backgrounds, hover rows, selected states |
| `surface` | `#F7FDFD` | App background |
| `white` | `#FFFFFF` | Cards, inputs |

Semantic colors (not in logo; keep soft and consistent): success `#16A34A`, warning `#D97706`, danger `#DC2626`, info = brand-blue-600. Status badges: available = success, reserved = warning, partially_sold = brand-teal, sold = brand-navy, inactive = gray.

Chart palette (in order): `#397AD2`, `#4EC1D3`, `#10324D`, `#7EDAE4`, `#2F67B8`, `#94A3B8`.

## Tailwind tokens (put in `tailwind.config.ts` → `theme.extend.colors`)
```ts
brand: {
  navy: '#10324D', blue: '#397AD2', 'blue-600': '#2F67B8', 'blue-700': '#2A5CA8',
  teal: '#4EC1D3', cyan: '#7EDAE4', tint: '#E8F6F9', surface: '#F7FDFD',
}
```
Also expose them as CSS variables for shadcn-style components (`--primary: 213 60% 46%` etc.).

## Typography
- Arabic UI font: **Cairo** (matches the rounded, friendly geometry of the logotype) via `next/font/google`, weights 400/500/600/700. Fallback: `system-ui, 'Segoe UI', Tahoma, sans-serif`.
- Numbers in Latin digits (see PRD §4); use `tabular-nums` in tables.
- Base size 16 px (15 px in dense tables), headings navy, line-height 1.6 for Arabic.

## Shape & feel
- Radius: 12 px cards/inputs, 9999 px badges, 10 px buttons. Soft shadows (`0 1px 2px rgba(16,50,77,.06), 0 4px 16px rgba(16,50,77,.06)`).
- Friendly, clean, high-whitespace commercial look; blue/teal gradients only for the login hero and empty-state illustrations (subtle).
- Icons: `lucide-react` (mirror directional icons in RTL). Empty states may reuse the house/recycle motif **only via the logo asset**, not redrawn.

## Where the logo appears
1. Login / forgot / pending / complete-profile pages (centered, ~160 px wide).
2. Sidebar top (inside a white rounded badge on the navy sidebar; collapsed state shows a cropped crown/house mark via CSS `object-position`, no redraw).
3. Browser favicon / PWA icon: crop the crown+house mark from `logo.jpg` into square PNGs (32/180/512) with `sharp` at build time or a one-off script committed to `public/`.
4. Print pages (invoice, receipt): header with logo (~120 px) + company name + address/phone from Settings.
5. Email templates (Supabase invite/reset): logo hosted from the production domain (`/logo.jpg`).

## Brand text
- App name: **تجديد** (title tag pattern: `الصفحة | تجديد`). Tagline: **لأدوات منزلية مستعملة**.
- Default `company_name` setting = `تجديد`; `company_footer` suggestion: `شكراً لثقتكم في تجديد`.

## Dark mode (required)
- Options **Light / Dark / System** (default System), toggle in the topbar and on `/account`, stored per device with `next-themes` (`attribute="class"`, `storageKey="tajdeed-theme"`, `disableTransitionOnChange`, `suppressHydrationWarning` on `<html>`), no DB column. Tailwind `darkMode: 'class'`; `color-scheme: dark` on `.dark`.
- **Components use semantic tokens only** (`bg-background`, `bg-surface`, `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, `bg-primary`, `text-link` …). No hard-coded `bg-white`, `text-gray-*`, `bg-slate-*` or raw hex inside components (allowed only in the token definitions and in print pages).

| Token | Light | Dark |
|---|---|---|
| background | `#F7FDFD` | `#0B1B2B` |
| surface (cards, dialogs, inputs) | `#FFFFFF` | `#11273B` |
| surface-2 (hover, stripes) | `#E8F6F9` | `#16324A` |
| border | `#D5E6EC` | `#24425C` |
| foreground | `#10324D` | `#E6EEF5` |
| muted | `#5B7184` | `#9FB3C5` |
| sidebar | `#10324D` | `#08141F` |
| primary (buttons, white text) | `#2F67B8` | `#2F67B8` |
| primary hover | `#2A5CA8` | `#3B77CC` |
| link / accent text | `#2F67B8` | `#7FB0F5` |
| accent teal | `#4EC1D3` | `#4EC1D3` |
| success / warning / danger text | `#16A34A / #B45309 / #DC2626` | `#4ADE80 / #FBBF24 / #F87171` |

Dark pairs were checked for WCAG AA (foreground on surface 13:1, muted on surface 7:1, link on surface 6.9:1, white on primary 5.6:1). Keep ≥ 4.5:1 for text and ≥ 3:1 for UI boundaries/focus rings in both themes (verify with `axe`).
- **Logo** (white-background JPG): always inside a white rounded badge in dark mode (sidebar, login, topbar); never inverted/filtered. **Print pages (invoice, receipt) are always light.** Product photos/videos are never filtered.
- Charts, badges, toasts, skeletons, empty states, tables (header/stripe/hover), inputs (focus ring, disabled, placeholder), dialogs/backdrop (`bg-black/60` in dark), dropdowns and scrollbars are all themed.

