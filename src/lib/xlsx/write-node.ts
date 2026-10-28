import "server-only";

import writeXlsxFile from "write-excel-file/node";

import { workbookSheets, type ExportSheet } from "@/lib/export/document";

/**
 * The workbook as bytes. Server only (the pinned library's Node build): the
 * export server action calls this; the browser build is `write-browser.ts`.
 * The one place the writer is called on the server, so an API change in the
 * dependency is fixed here.
 */
export async function workbookToBuffer(
  sheets: readonly ExportSheet[],
): Promise<Buffer> {
  return writeXlsxFile(workbookSheets(sheets)).toBuffer();
}
