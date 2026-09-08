# Design System

## Visual thesis

**Midnight dining room:** a calm, high-contrast operational surface designed for dim restaurants, with warm amber reserved for the next action and cool blue for scheduled information. The interface should feel like a precise host stand, not a generic analytics template.

## Surfaces

- Manager desktop: information-dense weekly roster, filters, bulk actions, and conflict review.
- Host tablet: live floor, next-server queue, oversized seat/skip/pause actions, and immediate feedback.
- Server mobile: today's shift, section, live position, and personal schedule.

No marketing hero appears before the operational workspace.

## Tokens

Defined in `src/app/globals.css` as plain hex/rgba custom properties on `:root` (dark, the built-in base) and `:root[data-theme="light"]` (a full override block) — not oklch. `useTheme()` (`src/hooks/use-theme.ts`) resolves a light/dark/system preference to a concrete `data-theme` attribute before first paint, so the CSS itself never falls back to a bare `prefers-color-scheme` media query.

| Token                  | Dark                    | Light               | Use                                                                             |
| ---------------------- | ----------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `--background`         | `#0b0b0d`               | `#e9e7e2`           | App canvas                                                                      |
| `--foreground`         | `#f6f3ed`               | `#1c1a17`           | Primary text                                                                    |
| `--card`               | `#141416`               | `#ffffff`           | Fully elevated panels (cards, dialogs, popovers)                                |
| `--surface`            | `#141416`               | `#f4f2ee`           | Shell chrome on the canvas that isn't a card (countdown pill, mobile sheet)     |
| `--muted-foreground`   | `#aaa7a1`               | `rgba(28,26,23,.6)` | Secondary labels                                                                |
| `--faint`              | `#666460`               | `rgba(28,26,23,.4)` | Tertiary/eyebrow labels (uppercase micro-copy)                                  |
| `--avatar`             | `#2a2a2c`               | `rgba(0,0,0,.08)`   | Avatar chip background                                                          |
| `--primary`            | `#f2a65a`               | `#d97706`           | Next action, focus, and countdown digits in the normal tier                     |
| `--primary-foreground` | `#1c1007`               | `#ffffff`           | Text/icons on `--primary`                                                       |
| `--warn`               | `#f59e0b`               | `#d97706`           | Countdown/attendance "getting close" tier (< 60m, Auto-closed)                  |
| `--ok`                 | `#10b981`               | `#059669`           | Confirmed/paid state                                                            |
| `--destructive`        | `#ef4444`               | `#dc2626`           | Destructive/error, and the countdown/attendance urgent tier (< 15m, Open shift) |
| `--border`             | `rgba(255,255,255,.12)` | `rgba(0,0,0,.12)`   | Hairlines                                                                       |

`--server-one` through `--server-seven` (both themes) are unchanged by Feature 021 and stay out of scope for any future token pass without a separate decision — they identify which server a table/shift belongs to on the live floor, and must stay pairwise distinguishable by hue.

There are no separate `--warnSoft`/`--warnLine`/`--dangerSoft`/`--dangerLine` tokens. Soft, tinted urgency backgrounds (the countdown pill's warn/danger states, the Attendance `Auto-closed`/`Open shift` badges) are the same `--warn`/`--destructive` colors at Tailwind's own opacity modifiers — `bg-warn/15 border-warn/30`, `bg-destructive/15 border-destructive/30` — the same convention `Badge`'s tones and `Button`'s `outline` variant already used before Feature 021.

Use Geist Sans for product text and Geist Mono for times, table labels, counts, and identifiers — always paired with `tabular-nums` on anything that ticks or updates in place (the countdown pill, attendance card-ledger hours) so digits never jitter width. Main text is at least 16 px; operational labels are at least 14 px. Use a compact density on desktop and comfortable density on touch surfaces.

## Component mapping

| Need                           | Component                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------- |
| App navigation                 | Two-row header desktop (see below), fixed bottom dock + slide-up sheet mobile |
| Day/week/month switch          | `Tabs`                                                                        |
| Staff and shift browse         | `Table` with responsive cards on narrow screens                               |
| Shift editor                   | `Sheet` for quick edits, full page for complex recurrence                     |
| Server/table picker            | `Command` + `Popover`                                                         |
| Publish/rebalance confirmation | `AlertDialog`                                                                 |
| Context actions                | `DropdownMenu`                                                                |
| Active/paused/closing state    | Text + icon + `Badge`; never color alone                                      |
| Loading/empty/error            | `Skeleton`, `Empty`, and `Alert`                                              |
| Feedback                       | `Sonner` toast plus persistent inline status for critical actions             |

## Core layouts

### Weekly manager roster

- Sticky date row; staff rows; shifts as compact blocks.
- Conflict count remains visible near Publish.
- Keyboard users can create, move, and edit a shift without drag/drop.
- Month view summarizes coverage and links into a day; it is not a squeezed week grid.

### Live host stand

- Left/top: floor plan and table status.
- Right/bottom: next-server queue and current party action.
- Primary `Seat party` action is always visible without scrolling at common tablet sizes.
- Concurrent-update notices identify what changed and refresh the recommendation.

### Server mobile

- Today's shift and section occupy the first viewport.
- The week schedule is a vertical list; no tiny calendar cells.

### Application shell (Feature 021)

`src/components/restaurant-operations-app.tsx` renders two structurally separate headers — a desktop one and a mobile one — swapped by responsive Tailwind classes (`lg:hidden` / `hidden lg:...`) rather than conditional rendering, both mounted at once. Anything shared client state between them (the avatar panel's open/closed flag) needs a dismiss check against _both_ DOM occurrences, not just one — see the `useDismissOnOutsideOrEscape` doc comment in that file.

**Desktop, row 1**: brand (left) — centered `CountdownPill` — avatar pill (right), which opens a floating quick-settings panel (Appearance switch, shift-hours summary, today's store hours, Change passcode, Store hours link, More options → the existing `HoursDialog`, Sign out). Non-modal: dismisses on outside pointerdown or Escape, no focus trap or backdrop (unlike this app's actual modal dialogs).

**Desktop, row 2**: primary tabs (Schedule, Table Allocation, Tip Split — bottom-accent border when active) — vertical divider — secondary tabs (Team if manager, Attendance, Payroll if manager and not demo mode) — Settings button on the far right.

**Countdown pill urgency tiers** (`countdownTier()` in `restaurant-operations-app.tsx`, driven by `useRestaurantClock`'s `remainingSeconds`):

| Tier   | Condition          | Pill                                      | Digits             | Label         |
| ------ | ------------------ | ----------------------------------------- | ------------------ | ------------- |
| Normal | `> 60m` remaining  | `bg-surface border-border`                | `text-primary`     | "Day ends in" |
| Warn   | `<= 60m` remaining | `bg-warn/15 border-warn/30`               | `text-warn`        | "Day ends in" |
| Danger | `<= 15m` remaining | `bg-destructive/15 border-destructive/30` | `text-destructive` | "Closing"     |

The label swap (not just the color) is deliberate — urgency has to read without distinguishing amber from red. Digits are always `font-mono tabular-nums`.

**Mobile**: a separate stacked header (brand, change-passcode icon, avatar chip that opens its own smaller panel — Appearance, Settings, Sign out — sharing `showAvatarPanel` state with the desktop panel), then a compact `CountdownPill`. Below the page content, a fixed 3-button bottom dock (`Allocation`, `Tip Split`, `More`) — all `min-h-11`+ touch targets. `More` opens a slide-up sheet (`role="dialog"`, dismissed the same outside-pointerdown-or-Escape way) listing Schedule, the secondary tabs, Settings, an `AppearanceSwitch`, Change passcode, and Sign out.

## Motion

Framer Motion is installed, but motion is earned:

- 150–220 ms transitions for queue reordering, sheet entry, and successful seating confirmation.
- Use opacity and transform; avoid animating layout properties that cause jank.
- Interruptible interactions must settle naturally.
- Respect `prefers-reduced-motion` and preserve state clarity with no animation.
- Never animate critical error text away before it can be read.

## Accessibility and busy-room constraints

- Minimum 44 px touch target; 8 px minimum gap between adjacent destructive/primary actions.
- Focus is visible against every surface.
- Avoid hover-only controls.
- Use live regions for non-disruptive rotation updates, not for every realtime row change.
- Confirm destructive actions; make undo available for reversible operational mistakes.
- Show timestamps and actor names for externally caused changes.

## Figma contract

Working design file: [ServiceFlow Restaurant Operations](https://www.figma.com/design/HRKjwMUVTYp65itZftkIql)

The implementation is the current source for responsive behavior. Captured manager and server frames should remain in this file alongside any future component library.

Create one Figma library page for foundations and one for components. Name variables to match CSS semantic tokens, not raw colors. Map Figma components to code with Code Connect after the first real components exist.

Before implementing a Figma frame:

1. Read variables, component names, variants, auto-layout, and responsive intent through Figma MCP.
2. Map each element to an existing shadcn or product component.
3. List true gaps; do not regenerate existing primitives.
4. Export only needed assets and preserve source links in the feature spec.
5. Verify at desktop, tablet landscape, and mobile widths.

The connected Figma integration is design context, not a source of application truth. Domain behavior and permissions remain in the PRD and schema.
