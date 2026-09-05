# Design System

## Visual thesis

**Midnight dining room:** a calm, high-contrast operational surface designed for dim restaurants, with warm amber reserved for the next action and cool blue for scheduled information. The interface should feel like a precise host stand, not a generic analytics template.

## Surfaces

- Manager desktop: information-dense weekly roster, filters, bulk actions, and conflict review.
- Host tablet: live floor, next-server queue, oversized seat/skip/pause actions, and immediate feedback.
- Server mobile: today's shift, section, live position, and personal schedule.

No marketing hero appears before the operational workspace.

## Tokens

| Token      | Light                  | Dark                   | Use                   |
| ---------- | ---------------------- | ---------------------- | --------------------- |
| Background | `oklch(0.98 0.01 85)`  | `oklch(0.16 0.02 255)` | App canvas            |
| Surface    | `oklch(1 0 0)`         | `oklch(0.20 0.02 255)` | Cards and panels      |
| Foreground | `oklch(0.20 0.02 255)` | `oklch(0.96 0.01 85)`  | Primary text          |
| Muted      | `oklch(0.52 0.02 255)` | `oklch(0.72 0.02 255)` | Secondary labels      |
| Primary    | `oklch(0.69 0.15 65)`  | `oklch(0.76 0.15 70)`  | Next action and focus |
| Info       | `oklch(0.62 0.14 245)` | `oklch(0.72 0.13 245)` | Scheduled state       |
| Success    | `oklch(0.62 0.14 155)` | `oklch(0.72 0.14 155)` | Confirmed/published   |
| Danger     | `oklch(0.59 0.20 25)`  | `oklch(0.70 0.18 25)`  | Destructive/error     |

Use Geist Sans for product text and Geist Mono for times, table labels, counts, and identifiers. Main text is at least 16 px; operational labels are at least 14 px. Use a compact density on desktop and comfortable density on touch surfaces.

## Component mapping

| Need                           | Component                                                         |
| ------------------------------ | ----------------------------------------------------------------- |
| App navigation                 | `Sidebar` desktop, `Sheet` mobile                                 |
| Day/week/month switch          | `Tabs`                                                            |
| Staff and shift browse         | `Table` with responsive cards on narrow screens                   |
| Shift editor                   | `Sheet` for quick edits, full page for complex recurrence         |
| Server/table picker            | `Command` + `Popover`                                             |
| Publish/rebalance confirmation | `AlertDialog`                                                     |
| Context actions                | `DropdownMenu`                                                    |
| Active/paused/closing state    | Text + icon + `Badge`; never color alone                          |
| Loading/empty/error            | `Skeleton`, `Empty`, and `Alert`                                  |
| Feedback                       | `Sonner` toast plus persistent inline status for critical actions |

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
