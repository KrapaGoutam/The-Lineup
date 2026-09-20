# Table Rotation — State Matrix

## Server
| State | Visual | Notes |
|---|---|---|
| Active | full opacity, "Active" label (ok color) | default |
| Paused | dimmed column/card, "Paused" label (warn color), Resume exposed, cells locked | stays visible everywhere; existing assignments frozen |
| Removed from active rotation | not rendered anywhere (Grid column, Floor Team, Server Board all drop it) | distinct from account deletion — no auth/account state touched |

## Table
| State | Visual |
|---|---|
| Available | plain card, label only |
| Assigned | accent border/bar in server's color, label + server name + elapsed minutes |
| (Closing / Blocked) | not implemented in this design — flag if the real workflow needs them |

## Cell (Grid/Picker)
| State | Visual |
|---|---|
| Empty | input + add button (Grid) / "Pick table" button (Picker) |
| Editing | input pre-filled, confirm/cancel |
| Assigned | badge + edit/clear (Grid) or badge + clear only (Picker) |
| Paused-column | dimmed, locked, shows "—", no controls |

## Row
| State | Visual |
|---|---|
| Normal | plain |
| Auto-added trailing empty | visually identical to a manually added row — no special marker |
| Menu-open | small overflow panel with Delete row |

## Undo/Redo
| State | Button |
|---|---|
| Available | full opacity, enabled |
| Unavailable | 50% opacity, disabled |

## Quick Add member
| State | Where shown |
|---|---|
| Clocked-in, floor/server role, not yet added | "Clocked in — floor/servers" — one-tap add |
| Clocked-in, other role, not yet added | "Clocked in — other staff" — one-tap add |
| Not clocked in | "Other members" — search + checkbox |
| Already on the floor | does not appear in any list (no duplicate-add path) |
| Search result | filtered "Other members" list |
