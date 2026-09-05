# Feature 012 — Light/dark theme toggle

Status: deferred (spec only — do not implement)

**Implementation note**: same division-of-labor change as Feature 005 would apply if this were built — moot while deferred.

## User outcome

One control switches the whole app between light and dark, remembers the choice across sessions, and matches the device's OS preference the first time someone opens the app before they've ever chosen.

## What already exists — read before designing anything else

**The token _mechanism_ is theme-ready; the _values_ are not.** `src/app/globals.css` defines every color as a CSS custom property (`--background`, `--foreground`, `--card`, `--primary`, etc.) consumed through Tailwind 4's `@theme inline` layer, and every component in the codebase already reads semantic classes (`bg-background`, `text-foreground`, `border-border`) rather than hardcoded hex values — confirmed by reading `globals.css` and spot-checking component files. That's exactly the right architecture for a toggle: swapping the token _values_ at the root retheme the whole app for free, no per-component changes needed.

**But there is currently no light palette at all.** `:root` in `globals.css` hardcodes a single dark set of values directly (`--background: #0b0b0d`, `--foreground: #f6f3ed`, …) with no `@media (prefers-color-scheme: light)` block and no alternate `[data-theme]` variant. `layout.tsx`'s `viewport.colorScheme` is hardcoded to `"dark"`. This app is dark-mode-only today. Implementing this feature is therefore not "wire up a switch" — it's designing a full light palette from scratch first, then wiring the switch.

## Scope (for whenever this is picked up — not now)

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
- Login screen (pre-authentication): a smaller version of the same control, since the theme should be choosable before signing in too — the login screen currently has no header at all, so this needs a small top-corner placement decided at build time, not specified further here.

## Contrast audit — what needs checking, not assumed safe

- **The seven `--server-*` accent colors** (`--server-one` through `--server-seven` in `globals.css`) were visibly tuned as small dots/accents against the current near-black `--background` (`#0b0b0d`). Several of them — `--server-six` (`#fde68a`, pale yellow) and `--server-three` (`#a7f3d0`, pale mint) especially — are light, low-saturation colors chosen to pop against a dark canvas; against a light background they may have materially different (likely much worse) visibility and could fail contrast where they're used as more than a small dot (e.g., any place a server's color is used as a text or icon color, not just a background dot). Every one of the seven needs an explicit light-mode value, not an assumption that the same hex works both ways.
- **The `--primary` amber and `--destructive` red** were also chosen against dark: re-verify WCAG AA contrast for `--primary-foreground`-on-`--primary` and destructive text against a light `--background` and `--card`.
- **The allocation board's occupied/paused state treatments** (`bg-white/[0.07]`, `bg-black/20`, `border-white/25` — literal white/black-alpha overlays, not tokens) are hardcoded to work against a dark base and will look wrong or invisible against a light one; these need converting to theme-aware tokens as part of this feature, not left as an oversight.
- **Focus rings and borders** (`--ring`, `--border` currently `rgba(255,255,255,0.1)`) are white-alpha, dark-background-only values — a light mode needs its own black-alpha or solid equivalents.

## Acceptance criteria

- [ ] On a first visit with no stored preference, the app renders in the OS's preferred color scheme with no visible flash of the wrong theme.
- [ ] Toggling the control switches the whole app — every screen, not just the one currently open — and persists across a refresh and a new session (same browser).
- [ ] Every one of the seven server accent colors, `--primary`, `--destructive`, and the board's occupied/paused overlays pass a contrast check in both modes, not just dark.
- [ ] The control is present and reachable pre-authentication (login screen) and post-authentication (app shell header), at both desktop and mobile widths.
- [ ] `prefers-reduced-motion` is respected if the toggle itself animates (it should not require motion to be usable).

## UX contract

- Entry point: icon toggle (sun/moon) in the header icon cluster; a smaller equivalent on the login screen.
- Loading: n/a — synchronous, resolved before first paint via the blocking script.
- Error: n/a.
- Success: instant visual switch, no confirmation needed.
- Keyboard/screen reader: a real button with `aria-label` stating the action ("Switch to light theme" / "Switch to dark theme"), not just an icon swap.

## Data and authorization

None — client-only (`localStorage`), no schema, RLS, or migration.

## Implementation map (for whenever this is built)

- `src/app/globals.css`: light palette added under a `[data-theme="light"]` selector (or `:root:not([data-theme="dark"])` + a `prefers-color-scheme: light` media query, matching whichever convention the eventual build settles on); hardcoded white/black-alpha overlays converted to tokens.
- `src/app/layout.tsx`: blocking inline theme-detection script in `<head>`; `viewport.colorScheme` changed to `"light dark"`.
- New `src/hooks/use-theme.ts` (or similar): reads/writes the persisted choice, exposes it to the toggle control.
- `src/components/restaurant-operations-app.tsx` and `src/components/login-screen.tsx`: toggle control added to each header context.

## Test plan

- Component: toggle switches the `data-theme` attribute and persists to `localStorage`; first-visit-with-no-preference resolves to the OS preference.
- Manual: contrast-check every itemized color pairing above in both modes; visual check at desktop, tablet, and phone widths in both themes.
- Playwright: an automated contrast check is not currently part of this repo's toolchain — decide at build time whether to add one (e.g., an axe-core pass) rather than rely on manual review alone, given the bar this repo otherwise holds for accessibility claims.

## Rollout and rollback

- Feature flag: none — a toggle that only affects the requesting browser is safe to ship directly.
- Expand/migrate/contract: n/a.
- Backfill: none.
- Rollback limit: plain code revert; no data risk (client-only preference).

## Decisions and risks

- **Decision**: `localStorage` only, no server-side preference — matches the app's current low-infrastructure posture and works identically whether or not Supabase is linked.
- **Decision**: three-state internally (light/dark/system) but a simple two-way visible switch, defaulting to system until explicitly overridden — avoids a confusing three-way UI for a rarely-touched control.
- **Risk**: shipping a toggle before designing the light palette (i.e., skipping the audit above) would ship a technically-working but visually broken light mode. This spec exists specifically to prevent that shortcut.
- Open questions: none remaining — this spec is deliberately deferred, not blocked on an unresolved decision.
