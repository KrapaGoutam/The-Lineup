import { workbookSheets, type ExportSheet } from "@/lib/export/document";

/**
 * The workbook as a Blob, built in the browser. Only demo mode (which has no
 * server) uses it; real mode exports on the server. Loaded on demand so the
 * writer is not part of the page until someone exports.
 */
export async function workbookToBlob(
  sheets: readonly ExportSheet[],
): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  return writeXlsxFile(workbookSheets(sheets)).toBlob();
}
