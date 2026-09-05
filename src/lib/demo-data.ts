import type { AppRole } from "@/features/auth/domain/passcode";
import type { ShiftKind } from "@/features/schedules/domain/shift-planning";
import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";

export type TeamMember = {
  id: string;
  name: string;
  shortName: string;
  role: AppRole;
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
    color: "var(--server-one)",
  },
  {
    id: "leo",
    name: "Leo Park",
    shortName: "Leo",
    role: "server",
    color: "var(--server-two)",
  },
  {
    id: "ava",
    name: "Ava Brooks",
    shortName: "Ava",
    role: "server",
    color: "var(--server-three)",
  },
  {
    id: "noah",
    name: "Noah Diaz",
    shortName: "Noah",
    role: "server",
    color: "var(--server-four)",
  },
  {
    id: "zara",
    name: "Zara Reed",
    shortName: "Zara",
    role: "server",
    color: "var(--server-five)",
  },
  {
    id: "sam",
    name: "Sam Ellis",
    shortName: "Sam",
    role: "server",
    color: "var(--server-six)",
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
  { profileId: string; name: string; role: AppRole }
> = {
  "2468": { profileId: "manager-maya", name: "Maya Singh", role: "manager" },
  "1357": { profileId: "mia", name: "Mia Chen", role: "server" },
  "9999": { profileId: "owner-krapa", name: "Krapa Goutam", role: "owner" },
};
