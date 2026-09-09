import type { NeonAttendanceRow, NeonUser } from "./data/attendance-data";

// Feature 018, demo mode only: a small fixture set shaped exactly like a
// real Neon read, kept separate from src/lib/demo-data.ts since it's a
// different shape entirely (Neon rows, not Supabase membership rows).
// Deliberately includes the same edge cases a real Neon connection would
// eventually surface, so they're all visible without ever touching the
// real database:
//   - a duplicate name pair ("Anil") with different roles, so the
//     disambiguation label is visible in demo mode too;
//   - a null clock_out with auto_clocked_out true;
//   - a null hours_worked row;
//   - a selected person with zero rows in the current period.
// Anchored around September 2026 to match staticDemoTeam's DEMO_ANCHOR_DATE.
export const demoNeonUsers: NeonUser[] = [
  {
    id: 1,
    fullName: "Anil",
    role: "Server",
    phone: "555-0101",
    createdAt: "2025-01-15T00:00:00.000Z",
    isActive: true,
  },
  {
    id: 2,
    fullName: "Anil",
    role: "Host",
    phone: "555-0102",
    createdAt: "2025-02-01T00:00:00.000Z",
    isActive: true,
  },
  {
    id: 3,
    fullName: "Priya Nair",
    role: "Manager",
    phone: "555-0103",
    createdAt: "2024-11-20T00:00:00.000Z",
    isActive: true,
  },
  {
    id: 4,
    fullName: "Deepak Rao",
    role: "Server ", // trailing space, matching Neon's real free-text role data
    phone: null,
    createdAt: "2025-06-01T00:00:00.000Z",
    isActive: true,
  },
  {
    id: 5,
    fullName: "Zoya Khan",
    role: "server", // lowercase, same conceptual role, displayed verbatim regardless
    phone: "555-0105",
    createdAt: "2025-03-10T00:00:00.000Z",
    isActive: true,
  },
  {
    id: 6,
    fullName: "Retired Rakesh",
    role: "Server",
    phone: null,
    createdAt: "2023-05-01T00:00:00.000Z",
    isActive: false, // never offered as a selectable person -- is_active = false
  },
];

// clockIn/clockOut are full ISO instant strings, matching what the real
// Neon connection actually returns (Date.toISOString() of a genuine
// timestamptz) -- not plain "HH:MM:SS" text. Written here with an
// explicit "-05:00" offset (America/Chicago is on CDT in August/September),
// so AttendanceReport's zonedWallTimeFromInstant conversion round-trips
// back to the exact wall-clock time intended below.
export const demoNeonAttendance: NeonAttendanceRow[] = [
  {
    id: 101,
    userId: 1,
    date: "2026-09-01",
    clockIn: "2026-09-01T08:00:00-05:00",
    clockOut: "2026-09-01T16:30:00-05:00",
    hoursWorked: 8.5,
    autoClockedOut: false,
  },
  {
    id: 102,
    userId: 1,
    date: "2026-09-03",
    clockIn: "2026-09-03T09:00:00-05:00",
    clockOut: null,
    hoursWorked: null,
    autoClockedOut: true,
  },
  {
    id: 103,
    userId: 2,
    date: "2026-09-02",
    clockIn: "2026-09-02T10:00:00-05:00",
    clockOut: "2026-09-02T18:00:00-05:00",
    hoursWorked: 8,
    autoClockedOut: false,
  },
  {
    id: 104,
    userId: 3,
    date: "2026-09-01",
    clockIn: "2026-09-01T09:00:00-05:00",
    clockOut: "2026-09-01T17:00:00-05:00",
    // hours_worked null even though clock_in/out are both present -- a
    // real, if unusual, Neon state (whatever computed it upstream didn't
    // run for this row) worth demoing distinctly from the auto-clocked-
    // out case above.
    hoursWorked: null,
    autoClockedOut: false,
  },
  {
    id: 105,
    userId: 3,
    date: "2026-08-28",
    clockIn: "2026-08-28T09:00:00-05:00",
    clockOut: "2026-08-28T17:30:00-05:00",
    hoursWorked: 8.5,
    autoClockedOut: false,
  },
  {
    id: 106,
    userId: 4,
    date: "2026-09-05",
    clockIn: "2026-09-05T11:00:00-05:00",
    clockOut: "2026-09-05T19:00:00-05:00",
    hoursWorked: 8,
    autoClockedOut: false,
  },
  {
    id: 108,
    userId: 4,
    date: "2026-09-06",
    clockIn: "2026-09-06T11:00:00-05:00",
    // Live-verified against the real system: auto_clocked_out=true rows
    // usually still carry a real clock_out time (the system fills one in
    // when it force-closes a shift) -- a null clock_out turned out to
    // correlate with auto_clocked_out=false in practice (a shift left
    // genuinely open, never closed at all). Both real shapes are
    // demoed: this row (auto-closed, time present) and row 102 above
    // (auto-closed, no time -- the rarer but still real combination).
    clockOut: "2026-09-06T19:15:00-05:00",
    hoursWorked: 8.25,
    autoClockedOut: true,
  },
  // Zoya Khan (userId 5) has no September rows at all -- demos the
  // zero-attendance-this-period state when explicitly selected. She does
  // have an August row, so "Previous month" isn't empty for her.
  {
    id: 107,
    userId: 5,
    date: "2026-08-20",
    clockIn: "2026-08-20T12:00:00-05:00",
    clockOut: "2026-08-20T20:00:00-05:00",
    hoursWorked: 8,
    autoClockedOut: false,
  },
  // Feature 029. Two genuinely open (unclosed, not auto-closed) shifts on
  // DEMO_ANCHOR_DATE ("2026-09-10", restaurant-operations-app.tsx) -- the
  // fixture had zero rows on that date before this, so "Pull clocked-in
  // team" had nothing real to demonstrate. Additive only: every existing
  // row above is unchanged. Meaningful only once a manager has linked the
  // corresponding people from Team (demoAttendanceLinks starts empty, by
  // design -- see this feature's own task-file investigation notes).
  {
    id: 109,
    userId: 1,
    date: "2026-09-10",
    clockIn: "2026-09-10T11:00:00-05:00",
    clockOut: null,
    hoursWorked: null,
    autoClockedOut: false,
  },
  {
    id: 110,
    userId: 4,
    date: "2026-09-10",
    clockIn: "2026-09-10T11:15:00-05:00",
    clockOut: null,
    hoursWorked: null,
    autoClockedOut: false,
  },
];
