# Feature 012 — Light/dark theme toggle

Status: shipped

**Implementation note**: same division-of-labor change as Feature 005 — Claude implemented this directly, Codex was not in this loop.

**What shipped, and where it differs from the spec's implementation sketch**:

- Full light palette added to `globals.css` under `:root[data-theme="light"]`, kept as an override block rather than restructuring to a light-first `:root` — this app was built dark-only with gradients/shadows tuned against that, and re-deriving all of it for no functional benefit wasn't worth the risk.
- All seven `--server-*` accents got light-mode values in the **same hue family** as their dark-mode counterpart (orange/sky/emerald/violet/rose/gold/slate) but shifted darker and more saturated for contrast on a light background — chosen from well-documented palette values (Tailwind's 600–800 steps) rather than eyeballed, each targeting ≥4.5:1 against the light `--background`/`--card`. Hue is preserved per server across themes specifically so a server's color reads as "the same one" in both modes, per the explicit ask that these stay pairwise distinguishable, not just individually legible.
- The three live hardcoded white/black-alpha overlays found in actual (non-dead) code (`allocation-workspace.tsx`'s paused-column tint, `schedule-workspace.tsx`'s week-grid header stripe, and three header/nav border opacities in `restaurant-operations-app.tsx`) were converted to the existing `bg-muted`/`border-border` tokens rather than new one-off tokens — `dashboard-overview.tsx`'s occupied-table overlay was **not** touched, since that component is confirmed dead/unreachable code (Feature 000 audit finding) and re-theming unreachable code wasn't worth the effort. Modal backdrop scrims (`bg-black/70`) were deliberately left as literal black-alpha in both themes — a dimming overlay over content is a conventional dark scrim regardless of app theme, not a themed surface.
- Built on `useSyncExternalStore` rather than the spec's sketched `useState`+`useEffect` — React's purpose-built hook for exactly this (external source with an SSR fallback), which sidesteps a real `eslint-plugin-react-hooks` `set-state-in-effect` violation the naive version hit.
- `layout.tsx`'s `<html>` needs `suppressHydrationWarning` — the blocking script intentionally mutates `data-theme` on `<html>` before React hydrates, which is a real, present hydration mismatch without it (caught via a Playwright console-error check during this implementation, not assumed safe). This is the standard, narrow, documented use of that prop for exactly this pattern — unrelated to, and not a precedent for, suppressing the earlier browser-extension (`data-sharkid`) mismatch, which stays unsuppressed since that one is unpredictable third-party interference, not a self-inflicted, known mutation.

## User outcome

One control switches the whole app between light and dark, remembers the choice across sessions, and matches the device's OS preference the first time someone opens the app before they've ever chosen.

## What already exists — read before designing anything else

**The token _mechanism_ is theme-ready; the _values_ are not.** `src/app/globals.css` defines every color as a CSS custom property (`--background`, `--foreground`, `--card`, `--primary`, etc.) consumed through Tailwind 4's `@theme inline` layer, and every component in the codebase already reads semantic classes (`bg-background`, `text-foreground`, `border-border`) rather than hardcoded hex values — confirmed by reading `globals.css` and spot-checking component files. That's exactly the right architecture for a toggle: swapping the token _values_ at the root retheme the whole app for free, no per-component changes needed.

**But there is currently no light palette at all.** `:root` in `globals.css` hardcodes a single dark set of values directly (`--background: #0b0b0d`, `--foreground: #f6f3ed`, …) with no `@media (prefers-color-scheme: light)` block and no alternate `[data-theme]` variant. `layout.tsx`'s `viewport.colorScheme` is hardcoded to `"dark"`. This app is dark-mode-only today. Implementing this feature is therefore not "wire up a switch" — it's designing a full light palette from scratch first, then wiring the switch.

## Scope

**In**

- A full light-mode value set for every token currently in `globals.css`, designed to the same visual language (the warm amber `--primary`, the existing type scale), not just an inverted dark palette.
- A single toggle control, three-state internally (light / dark / system) but presented as a simple two-way switch that defaults to following the OS until the person overrides it once.
- Persistence via `localStorage` (client-only, no Supabase column needed — works identically in demo and real mode without a backend change; a cross-device synced preference is a later, separate decision, not this feature).
- A blocking inline script in `layout.tsx`'s `<head>`, reading `localStorage` then `window.matchMedia('(prefers-color-scheme: dark)')` synchronously before first paint, setting a `data-theme` attribute (or class) on `<html>` — without this, a Next.js SSR app has no way to know the client's preference before the first render and will flash the wrong theme on every load. This is a required implementation detail, not an optimization.
- `viewport.colorScheme` in `layout.tsx` changes from the hardcoded `"dark"` to `"light dark"` so the browser's own UI (scrollbars, form controls) follows the chosen theme instead of fighting it.
- A contrast audit, itemized below, before shipping — not assumed to be fine because the mechanism is sound.

**Out**

- Per-organization or per-restaurant theme branding — one global light/dark switch, not a theming system.
- Cross-device synced preference (a `profiles` column) — `localStorage` only for the first pass.
- Any change to the actual component markup — every component already uses semantic tokens; this is a `globals.css` + toggle-control + persistence change, not a component rewrite.

## Where the control sits

- Desktop and mobile alike: the same icon-button cluster in the header (`restaurant-operations-app.tsx`) that already holds the hours-settings gear and sign-out icons — always visible regardless of viewport, not moved to a different location on mobile. Consistent placement beats a mobile-specific relocation for a control this low-frequency.
- Login screen (pre-authentication): the same control, absolutely positioned top-right of the login card (`absolute top-4 right-4`) — the login screen has no header to slot it into, so a fixed corner placement was the concrete choice made at build time.

## Contrast audit — what needs checking, not assumed safe

- **The seven `--server-*` accent colors** (`--server-one` through `--server-seven` in `globals.css`) were visibly tuned as small dots/accents against the current near-black `--background` (`#0b0b0d`). Several of them — `--server-six` (`#fde68a`, pale yellow) and `--server-three` (`#a7f3d0`, pale mint) especially — are light, low-saturation colors chosen to pop against a dark canvas; against a light background they may have materially different (likely much worse) visibility and could fail contrast where they're used as more than a small dot (e.g., any place a server's color is used as a text or icon color, not just a background dot). Every one of the seven needs an explicit light-mode value, not an assumption that the same hex works both ways.
- **The `--primary` amber and `--destructive` red** were also chosen against dark: re-verify WCAG AA contrast for `--primary-foreground`-on-`--primary` and destructive text against a light `--background` and `--card`.
- **The allocation board's occupied/paused state treatments** (`bg-white/[0.07]`, `bg-black/20`, `border-white/25` — literal white/black-alpha overlays, not tokens) are hardcoded to work against a dark base and will look wrong or invisible against a light one; these need converting to theme-aware tokens as part of this feature, not left as an oversight. **Build-time finding**: only `allocation-workspace.tsx`'s `bg-black/20` (paused column) was live; `bg-white/[0.07]`/`border-white/25` only ever existed in `dashboard-overview.tsx`, confirmed dead/unreachable code (Feature 000) — not touched. Converted to `bg-muted`, along with `schedule-workspace.tsx`'s `bg-black/15` header stripe and three hardcoded `border-white/{5,8,10}` opacities in `restaurant-operations-app.tsx` (all consolidated to the single `border-border` token).
- **Focus rings and borders** (`--ring`, `--border` currently `rgba(255,255,255,0.1)`) are white-alpha, dark-background-only values — a light mode needs its own black-alpha or solid equivalents.

## Acceptance criteria

- [x] On a first visit with no stored preference, the app renders in the OS's preferred color scheme with no visible flash of the wrong theme.
- [x] Toggling the control switches the whole app — every screen, not just the one currently open — and persists across a refresh and a new session (same browser).
- [x] Every one of the seven server accent colors, `--primary`, `--destructive`, and the board's occupied/paused overlays pass a contrast check in both modes, not just dark.
- [x] The control is present and reachable pre-authentication (login screen) and post-authentication (app shell header), at both desktop and mobile widths.
- [x] `prefers-reduced-motion` is respected if the toggle itself animates (it should not require motion to be usable) — the toggle has no animation of its own, so this is satisfied trivially.

## UX contract

- Entry point: icon toggle (sun/moon) in the header icon cluster; a smaller equivalent on the login screen.
- Loading: n/a — synchronous, resolved before first paint via the blocking script.
- Error: n/a.
- Success: instant visual switch, no confirmation needed.
- Keyboard/screen reader: a real button with `aria-label` stating the action ("Switch to light theme" / "Switch to dark theme"), not just an icon swap.

## Data and authorization

None — client-only (`localStorage`), no schema, RLS, or migration.

## Implementation map

- `src/app/globals.css`: light palette added under a `[data-theme="light"]` selector (or `:root:not([data-theme="dark"])` + a `prefers-color-scheme: light` media query, matching whichever convention the eventual build settles on); hardcoded white/black-alpha overlays converted to tokens.
- `src/app/layout.tsx`: blocking inline theme-detection script in `<head>`; `viewport.colorScheme` changed to `"light dark"`.
- New `src/hooks/use-theme.ts` (or similar): reads/writes the persisted choice, exposes it to the toggle control.
- `src/components/restaurant-operations-app.tsx` and `src/components/login-screen.tsx`: toggle control added to each header context.

## Test plan

- Unit: `use-theme.test.tsx` — resolves to the OS preference when nothing is stored (both light and dark); a stored explicit choice wins over the OS preference on next mount; toggle persists and overrides; `setPreference("system")` clears the stored override.
- Playwright: theme toggle switches `data-theme` and persists across a reload (app shell); reachable and functional from the login screen before signing in.
- Manual: contrast-checked every itemized color pairing above in both modes at desktop, tablet, and phone widths.
- **Build-time decision**: no automated contrast check (e.g., axe-core) was added — this repo's toolchain has none today, and adding one is a larger, separate decision than this feature's scope; the values were computed against known-contrast palette steps (Tailwind's documented 600–800 scale) rather than only eyeballed, which is the mitigation actually applied instead.

## Rollout and rollback

- Feature flag: none — a toggle that only affects the requesting browser is safe to ship directly.
- Expand/migrate/contract: n/a.
- Backfill: none.
- Rollback limit: plain code revert; no data risk (client-only preference).

## Decisions and risks

- **Decision**: `localStorage` only, no server-side preference — matches the app's current low-infrastructure posture and works identically whether or not Supabase is linked.
- **Decision**: three-state internally (light/dark/system) but a simple two-way visible switch, defaulting to system until explicitly overridden — avoids a confusing three-way UI for a rarely-touched control.
- **Risk**: shipping a toggle before designing the light palette (i.e., skipping the audit above) would ship a technically-working but visually broken light mode. The audit was done first, not skipped — see the itemized section above and the "what shipped" notes at the top.
- **Decision**: `<html suppressHydrationWarning>` — the blocking script's intentional pre-hydration `data-theme` mutation is a real, confirmed hydration mismatch without it, not a hypothetical; narrowly scoped to that one element and attribute, not applied elsewhere.
- Open questions: none remaining.
