import type { InventoryRow } from "./inventory-rows";

export type CountInput = { onHand: string; backup: string };
export type BulkCountRow = {
  productId: string;
  expectedVersion: number;
  onHand: number | null;
  backup: number | null;
};
export type CountChange = {
  row: InventoryRow;
  onHand: number;
  backup: number;
  delta: number;
  request: BulkCountRow;
};
export function countValue(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text))
    throw new Error("Enter a nonnegative quantity with up to 2 decimals.");
  const value = Number(text);
  if (!Number.isFinite(value) || value > 9999999999.99)
    throw new Error("That quantity is too large.");
  return value;
}
export function reviewCounts(
  rows: readonly InventoryRow[],
  inputs: Record<string, CountInput>,
): CountChange[] {
  return rows.flatMap((row) => {
    const input = inputs[row.productId] ?? { onHand: "", backup: "" };
    let onHand: number | null;
    let backup: number | null;
    try {
      onHand = countValue(input.onHand);
      backup = countValue(input.backup);
    } catch (error) {
      throw new Error(
        `${row.name}: ${error instanceof Error ? error.message : "Invalid count."}`,
      );
    }
    const nextOn = onHand ?? row.onHand;
    const nextBackup = backup ?? row.backup;
    if (nextOn === row.onHand && nextBackup === row.backup) return [];
    if (row.status === "archived")
      throw new Error(`${row.name} is archived. Refresh your selection.`);
    return [
      {
        row,
        onHand: nextOn,
        backup: nextBackup,
        delta: Math.round((nextOn + nextBackup - row.total) * 100) / 100,
        request: {
          productId: row.productId,
          expectedVersion: row.stockVersion,
          onHand,
          backup,
        },
      },
    ];
  });
}
