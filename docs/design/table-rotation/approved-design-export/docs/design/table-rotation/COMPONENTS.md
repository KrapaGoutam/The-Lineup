# Table Rotation — Components

| Component | Purpose | Used by | Key states | Interaction |
|---|---|---|---|---|
| RotationViewSwitcher | Switch between the 5 views | Shell | active/inactive tab | Click/tap; horizontally scrollable on narrow screens |
| RotationToolbar | Global Undo/Redo, Floor Team, Quick Add, theme toggle | Shell | undo/redo enabled/disabled | Undo/Redo act on a shared history stack covering assignment, clear, reorder, pause, add/remove server, row add/delete |
| GridToolbar | Date filter, Add row, Clear board | Grid, Picker | loading (date change) | Clear board needs stronger confirmation than row/column clear |
| RotationIndicator | "Next" pill + upcoming list | Shell, Dashboard, assignment sheet | — | Read-only, derives from server order |
| FloorTeamDrawer | View/manage the full roster order | Shell (opened from anywhere) | active, paused | Reorder (↑↓), pause/resume, remove-from-rotation (not account deletion) |
| QuickAddStaffDialog | Add staff to the rotation | Shell | clocked-in-floor, clocked-in-other, other (search + multi-select) | One-tap add for clocked-in; checkbox + "Add N to Rotation" for others |
| ServerHeader | Column header (Grid/Picker) | Grid, Picker | active, paused, menu-open | Reorder, overflow menu |
| ServerActions | Overflow menu contents | ServerHeader, ServerCard | — | Pause/Resume, Clear, Remove — Clear ≠ Remove |
| TurnRow | Row shell (Turn cell + cells) | Grid, Picker | normal, menu-open | Clear-row icon always visible; Delete-row in overflow |
| RotationCell | Single assignment cell | Grid, Picker | empty, editing, assigned, paused-locked | Text entry (Grid) or picker trigger (Picker) |
| FloorMap | Physical table layout | Floor, Picker (as picker), assignment context | — | Renders FloorResource children |
| FloorResource | One table/seat | FloorMap | available, assigned, unavailable-in-picker | Tap to assign / tap for detail / tap to pick |
| TablePicker | Modal table chooser reusing FloorMap | Picker, ServerCard "+Table" | — | Two completion modes: fill a grid cell, or assign directly to a server |
| TableAssignmentSheet | Assign/transfer/unassign/close a table | Floor | quick-assign, detail | Bottom sheet; "Advance rotation" toggle on assign |
| ServerCard | Server-centric workload card | Servers | active, paused, menu-open | Reorder, +Table, overflow menu |
| DashboardStat | Small metric card | Dashboard, Grid | — | Read-only |
| RecentActivity | Activity feed | Dashboard | — | Read-only, most-recent-first |
| MasterRotationTable | Read-only rotation history | Dashboard | — | No inputs; "Open Grid" CTA routes to the editable view |
