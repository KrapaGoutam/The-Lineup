export type DiningTable = {
  id: string;
  label: string;
  seatCount: number;
  areaOrder: number;
  sequence: number;
  occupied: boolean;
  currentServerId: string | null;
};

export type SectionAssignment = {
  tableId: string;
  serverId: string | null;
  locked: boolean;
};

type ServerLoad = {
  serverId: string;
  seatCount: number;
  tableCount: number;
  lastAreaOrder: number | null;
  inputOrder: number;
};

export function generateSectionAssignments(
  tables: DiningTable[],
  serverIds: string[],
): SectionAssignment[] {
  const loads = new Map<string, ServerLoad>(
    serverIds.map((serverId, inputOrder) => [
      serverId,
      {
        serverId,
        seatCount: 0,
        tableCount: 0,
        lastAreaOrder: null,
        inputOrder,
      },
    ]),
  );

  const orderedTables = [...tables].sort(
    (left, right) =>
      left.areaOrder - right.areaOrder ||
      left.sequence - right.sequence ||
      left.id.localeCompare(right.id),
  );

  const assignments: SectionAssignment[] = [];

  for (const table of orderedTables) {
    if (table.occupied) {
      assignments.push({
        tableId: table.id,
        serverId: table.currentServerId,
        locked: true,
      });

      const activeLoad = table.currentServerId
        ? loads.get(table.currentServerId)
        : undefined;
      if (activeLoad) {
        activeLoad.seatCount += table.seatCount;
        activeLoad.tableCount += 1;
        activeLoad.lastAreaOrder = table.areaOrder;
      }
      continue;
    }

    const selected = [...loads.values()].sort((left, right) => {
      const seatDelta = left.seatCount - right.seatCount;
      if (seatDelta !== 0) return seatDelta;

      const tableDelta = left.tableCount - right.tableCount;
      if (tableDelta !== 0) return tableDelta;

      const leftContinuesArea = left.lastAreaOrder === table.areaOrder ? 0 : 1;
      const rightContinuesArea =
        right.lastAreaOrder === table.areaOrder ? 0 : 1;
      if (leftContinuesArea !== rightContinuesArea) {
        return leftContinuesArea - rightContinuesArea;
      }

      return left.inputOrder - right.inputOrder;
    })[0];

    if (!selected) {
      assignments.push({ tableId: table.id, serverId: null, locked: false });
      continue;
    }

    selected.seatCount += table.seatCount;
    selected.tableCount += 1;
    selected.lastAreaOrder = table.areaOrder;
    assignments.push({
      tableId: table.id,
      serverId: selected.serverId,
      locked: false,
    });
  }

  return assignments;
}
