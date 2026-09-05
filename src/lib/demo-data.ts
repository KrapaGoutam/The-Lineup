import type { AppRole, Designation } from "@/features/auth/domain/passcode";
import type { ShiftKind } from "@/features/schedules/domain/shift-planning";
import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";

export type TeamMember = {
  id: string;
  name: string;
  shortName: string;
  role: AppRole;
  // Feature 014: `role` is derived from `designation` (via
  // `designationToRole`) and must never be set independently of it --
  // see `changeDemoMemberDesignation` in restaurant-operations-app.tsx,
  // the one place both are written together.
  designation: Designation;
  color: string;
};

export type DemoShift = {
  id: string;
  employeeId: string;
  serviceDate: string;
  endDate: string;
  shiftKind: ShiftKind;
  startLocal: string;
  endLocal: string;
  usesDefaultTime: boolean;
  status: "draft" | "published";
  note?: string;
};

export const team: TeamMember[] = [
  {
    id: "mia",
    name: "Mia Chen",
    shortName: "Mia",
    role: "server",
    designation: "staff",
    color: "var(--server-one)",
  },
  {
    id: "leo",
    name: "Leo Park",
    shortName: "Leo",
    role: "server",
    designation: "staff",
    color: "var(--server-two)",
  },
  {
    id: "ava",
    name: "Ava Brooks",
    shortName: "Ava",
    role: "server",
    designation: "staff",
    color: "var(--server-three)",
  },
  {
    id: "noah",
    name: "Noah Diaz",
    shortName: "Noah",
    role: "server",
    designation: "staff",
    color: "var(--server-four)",
  },
  {
    id: "zara",
    name: "Zara Reed",
    shortName: "Zara",
    role: "server",
    designation: "staff",
    color: "var(--server-five)",
  },
  {
    id: "sam",
    name: "Sam Ellis",
    shortName: "Sam",
    role: "server",
    designation: "staff",
    color: "var(--server-six)",
  },
  {
    id: "ivy",
    name: "Ivy Tran",
    shortName: "Ivy",
    role: "server",
    designation: "staff",
    // Deliberately has no entries in initialShifts below — Feature 009
    // proves an employee who was never rostered can still be added to the
    // live allocation board.
    color: "var(--server-seven)",
  },
];

const published = "published" as const;
const draft = "draft" as const;

export const initialShifts: DemoShift[] = [
  {
    id: "s1",
    employeeId: "mia",
    serviceDate: "2026-09-07",
    endDate: "2026-09-07",
    shiftKind: "morning",
    startLocal: "11:00",
    endLocal: "16:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s2",
    employeeId: "leo",
    serviceDate: "2026-09-07",
    endDate: "2026-09-07",
    shiftKind: "evening",
    startLocal: "16:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s3",
    employeeId: "ava",
    serviceDate: "2026-09-07",
    endDate: "2026-09-07",
    shiftKind: "full_day",
    startLocal: "11:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s4",
    employeeId: "mia",
    serviceDate: "2026-09-08",
    endDate: "2026-09-08",
    shiftKind: "evening",
    startLocal: "16:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s5",
    employeeId: "leo",
    serviceDate: "2026-09-08",
    endDate: "2026-09-08",
    shiftKind: "morning",
    startLocal: "11:00",
    endLocal: "16:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s6",
    employeeId: "noah",
    serviceDate: "2026-09-08",
    endDate: "2026-09-08",
    shiftKind: "full_day",
    startLocal: "11:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s7",
    employeeId: "mia",
    serviceDate: "2026-09-09",
    endDate: "2026-09-09",
    shiftKind: "morning",
    startLocal: "11:00",
    endLocal: "16:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s8",
    employeeId: "zara",
    serviceDate: "2026-09-09",
    endDate: "2026-09-09",
    shiftKind: "evening",
    startLocal: "16:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: published,
  },
  {
    id: "s9",
    employeeId: "sam",
    serviceDate: "2026-09-10",
    endDate: "2026-09-10",
    shiftKind: "morning",
    startLocal: "10:30",
    endLocal: "15:30",
    usesDefaultTime: false,
    status: draft,
    note: "Patio setup",
  },
  {
    id: "s10",
    employeeId: "mia",
    serviceDate: "2026-09-11",
    endDate: "2026-09-11",
    shiftKind: "full_day",
    startLocal: "11:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: draft,
  },
  {
    id: "s11",
    employeeId: "leo",
    serviceDate: "2026-09-11",
    endDate: "2026-09-11",
    shiftKind: "evening",
    startLocal: "16:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: draft,
  },
  {
    id: "s12",
    employeeId: "ava",
    serviceDate: "2026-09-12",
    endDate: "2026-09-12",
    shiftKind: "full_day",
    startLocal: "11:00",
    endLocal: "23:00",
    usesDefaultTime: true,
    status: draft,
  },
];

export const initialTipIntervals: TipIntervalInput[] = [
  {
    id: "tip-1",
    start: "11:00",
    end: "13:00",
    amountCents: 900,
    participantIds: ["mia", "leo", "ava"],
  },
  {
    id: "tip-2",
    start: "13:00",
    end: "23:00",
    amountCents: 800,
    participantIds: ["mia", "leo", "ava", "noah"],
  },
];

export const demoAccounts: Record<
  string,
  { profileId: string; name: string; role: AppRole; designation: Designation }
> = {
  "2468": {
    profileId: "manager-maya",
    name: "Maya Singh",
    role: "manager",
    designation: "manager",
  },
  "1357": {
    profileId: "mia",
    name: "Mia Chen",
    role: "server",
    designation: "staff",
  },
  "9999": {
    profileId: "owner-krapa",
    name: "Krapa Goutam",
    role: "owner",
    designation: "owner",
  },
};
