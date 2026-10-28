import "server-only";

import readXlsxFile from "read-excel-file/node";

import type { RawSheet, WorkbookReader } from "./workbook";

/**
 * Reads every sheet of a workbook the guard has already accepted. Server only
 * (the pinned library's Node build); the one place the reader is called on the
 * server, so an API change in the dependency is fixed here.
 */
export const readWorkbookNode: WorkbookReader = async (bytes) =>
  // The library types a date cell as `typeof Date`; it returns Date objects.
  (await readXlsxFile(Buffer.from(bytes))) as unknown as RawSheet[];
